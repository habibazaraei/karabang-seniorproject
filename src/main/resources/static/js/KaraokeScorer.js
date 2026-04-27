/**
 * KaraokeScorer.js
 * ----------------
 * Captures microphone input, detects the user's sung pitch in real-time,
 * compares it against the pre-extracted song pitch data, and produces a score.
 *
 * How to use when adding new songs
 *   *Open up the Terminal
 *   * Run py extract_pitches.py --folder ./target/classes/static/audio
 *   * Wait
 *
 * @author Tyler R
 */

import { db, auth, doc, setDoc, getDoc, getDocs, collection, onAuthStateChanged } from '/js/firebase.js';

// ─── Tier Constants ───────────────────────────────────────────────────────────

const TIERS = [
    { label: "PERFECT", maxSemitones: 0.5, points: 30, color: "#FFD700" },
    { label: "GOOD",    maxSemitones: 1.0, points: 20, color: "#4BA7FF" },
    { label: "CLOSE",   maxSemitones: 2.0, points: 10, color: "#6bff8e" },
    { label: "MISS",    maxSemitones: Infinity, points: 0, color: "#ff6b6b" },
];

const MIN_VOICED_AMP = 0.005; // RMS threshold — below this we treat user as silent

// ─── State ────────────────────────────────────────────────────────────────────

let songPitchData   = null;
let micStream       = null;
let audioCtx        = null;
let analyserNode    = null;
let micSourceNode   = null;
let scoringActive   = false;
let scoringInterval = null;

let totalScore      = 0;
let maxPossible     = 0;
let scoredFrames    = 0;

let lastTierLabel    = "";
let tierFlashTimeout = null;

// Current song ID (set from URL)
const params = new URLSearchParams(window.location.search);
const currentSongId = parseInt(params.get("song"));

// Current logged in user (updated by onAuthStateChanged)
let currentUser = null;
onAuthStateChanged(auth, user => { currentUser = user; });


// ─── UI Elements ──────────────────────────────────────────────────────────────

let scoreDisplay    = null;
let pitchDisplay    = null;
let tierDisplay     = null;
let micToggleBtn    = null;


// ─── Pitch Detection (Autocorrelation) ────────────────────────────────────────

function detectPitch(analyser) {
    const bufferSize = analyser.fftSize;
    const buffer = new Float32Array(bufferSize);
    analyser.getFloatTimeDomainData(buffer);

    let rms = 0;
    for (let i = 0; i < bufferSize; i++) rms += buffer[i] * buffer[i];
    rms = Math.sqrt(rms / bufferSize);
    if (rms < MIN_VOICED_AMP) return 0;

    const sampleRate = audioCtx.sampleRate;
    const minPeriod  = Math.floor(sampleRate / 1200);
    const maxPeriod  = Math.floor(sampleRate / 60);

    let bestCorr   = -1;
    let bestPeriod = -1;

    for (let period = minPeriod; period <= maxPeriod; period++) {
        let corr = 0;
        for (let i = 0; i < bufferSize - period; i++) {
            corr += buffer[i] * buffer[i + period];
        }
        if (corr > bestCorr) {
            bestCorr   = corr;
            bestPeriod = period;
        }
    }

    if (bestPeriod === -1) return 0;
    return sampleRate / bestPeriod;
}


// ─── Pitch Comparison ─────────────────────────────────────────────────────────

function hzToMidi(hz) {
    return 12 * Math.log2(hz / 440) + 69;
}

function getTier(userHz, targetHz) {
    if (userHz <= 0 || targetHz <= 0) return TIERS[3];
    const semitones = Math.abs(hzToMidi(userHz) - hzToMidi(targetHz));
    for (const tier of TIERS) {
        if (semitones <= tier.maxSemitones) return tier;
    }
    return TIERS[3];
}

function getExpectedPitch(currentTimeSec) {
    if (!songPitchData) return 0;
    const idx = Math.round(currentTimeSec / songPitchData.hop_duration);
    return songPitchData.pitches[idx] ?? 0;
}


// ─── Scoring Loop ─────────────────────────────────────────────────────────────

function scoringTick() {
    if (!scoringActive || !analyserNode) return;

    const audio      = document.getElementById("audio");
    const userHz     = detectPitch(analyserNode);
    const expectedHz = getExpectedPitch(audio.currentTime);

    if (expectedHz > 0) {
        scoredFrames++;
        maxPossible += TIERS[0].points;

        const tier = getTier(userHz, expectedHz);
        totalScore += tier.points;

        if (tier.label !== lastTierLabel) {
            lastTierLabel = tier.label;
            flashTier(tier);
        }
    }

    updateScorerUI(userHz, expectedHz);
}

function resetScore() {
    totalScore    = 0;
    maxPossible   = 0;
    scoredFrames  = 0;
    lastTierLabel = "";
}


// ─── Microphone Setup / Teardown ──────────────────────────────────────────────

async function startMic() {
    try {
        micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });

        audioCtx     = new (window.AudioContext || window.webkitAudioContext)();
        analyserNode = audioCtx.createAnalyser();
        analyserNode.fftSize = 2048;

        micSourceNode = audioCtx.createMediaStreamSource(micStream);
        micSourceNode.connect(analyserNode);

        scoringActive   = true;
        scoringInterval = setInterval(scoringTick, 50);

        if (micToggleBtn) micToggleBtn.textContent = "🎤 Stop Mic";
        console.log("[KaraokeScorer] Mic started.");
    } catch (err) {
        console.error("[KaraokeScorer] Mic access denied:", err);
        alert("Microphone access is required for scoring. Please allow mic access and try again.");
    }
}

function stopMic() {
    scoringActive = false;
    clearInterval(scoringInterval);

    if (micSourceNode)  { micSourceNode.disconnect(); micSourceNode = null; }
    if (analyserNode)   { analyserNode.disconnect();  analyserNode  = null; }
    if (audioCtx)       { audioCtx.close();           audioCtx      = null; }
    if (micStream)      { micStream.getTracks().forEach(t => t.stop()); micStream = null; }

    if (micToggleBtn) micToggleBtn.textContent = "🎤 Start Mic";
    console.log("[KaraokeScorer] Mic stopped. Final score:", totalScore);

    showFinalScore();
    saveScoreToFirebase();
}

function toggleMic() {
    if (scoringActive) {
        stopMic();
    } else {
        resetScore();
        startMic();
    }
}


// ─── Firebase Score Saving ────────────────────────────────────────────────────

/**
 * Saves the score to Firestore under:
 * scores/{songId}/entries/{userId}
 * Only saves if it's a new personal high score.
 */
async function saveScoreToFirebase() {
    if (!currentUser) {
        console.warn("[KaraokeScorer] Not logged in — score not saved.");
        return;
    }
    if (totalScore === 0) return;

    const scoreRef = doc(db, "scores", String(currentSongId), "entries", currentUser.uid);

    try {
        const existing = await getDoc(scoreRef);

        // Only save if it's a new high score
        if (!existing.exists() || totalScore > existing.data().score) {
            await setDoc(scoreRef, {
                score:       totalScore,
                username:    currentUser.displayName || currentUser.email || "Anonymous",
                userId:      currentUser.uid,
                songId:      currentSongId,
                timestamp:   new Date().toISOString(),
            });
            console.log("[KaraokeScorer] New high score saved:", totalScore);
        } else {
            console.log("[KaraokeScorer] Score not a new high score, not saved.");
        }
    } catch (err) {
        console.error("[KaraokeScorer] Failed to save score:", err);
    }
}

/**
 * Loads the top 5 scores for the current song from Firestore.
 * Returns an array sorted by score descending.
 */
async function loadTopScores() {
    try {
        const entriesRef = collection(db, "scores", String(currentSongId), "entries");
        const snapshot   = await getDocs(entriesRef);

        const scores = snapshot.docs.map(d => d.data());
        scores.sort((a, b) => b.score - a.score);
        return scores.slice(0, 5);
    } catch (err) {
        console.error("[KaraokeScorer] Failed to load scores:", err);
        return [];
    }
}


// ─── Scoreboard Popup ─────────────────────────────────────────────────────────

function initScoreboard() {
    // Add "Scoreboard" option to the existing dropdown menu
    const dropdownMenu = document.getElementById("dropdownMenu");
    if (dropdownMenu) {
        const scoreboardBtn = document.createElement("button");
        scoreboardBtn.id        = "scoreboardBtn";
        scoreboardBtn.textContent = "Scoreboard";
        scoreboardBtn.onclick   = (e) => {
            e.stopPropagation();
            openScoreboard();
        };
        dropdownMenu.appendChild(scoreboardBtn);
    }

    // Create the scoreboard popup modal
    const modal = document.createElement("div");
    modal.id = "scoreboardModal";
    modal.innerHTML = `
        <div id="scoreboardPanel">
            <div id="scoreboardHeader">
                <span>🏆 Top Scores</span>
                <button id="closeScoreboardBtn">✕</button>
            </div>
            <div id="scoreboardSongTitle"></div>
            <div id="scoreboardList">
                <div class="scoreboardLoading">Loading...</div>
            </div>
            <div id="scoreboardYourBest"></div>
        </div>
    `;
    document.body.appendChild(modal);

    // Close button
    document.getElementById("closeScoreboardBtn").onclick = closeScoreboard;

    // Close when clicking outside the panel
    modal.onclick = (e) => {
        if (e.target === modal) closeScoreboard();
    };

    injectScoreboardStyles();
}

async function openScoreboard() {
    const modal = document.getElementById("scoreboardModal");
    if (!modal) return;

    // Show loading state
    document.getElementById("scoreboardList").innerHTML = `<div class="scoreboardLoading">Loading...</div>`;
    document.getElementById("scoreboardYourBest").textContent = "";
    modal.style.display = "flex";

    // Set song title
    try {
        const res  = await fetch("/api/songs");
        const data = await res.json();
        const song = data.find(s => s.id === currentSongId);
        document.getElementById("scoreboardSongTitle").textContent = song ? `${song.title} — ${song.artist}` : "";
    } catch (_) {}

    // Load top 5 scores
    const scores = await loadTopScores();
    const list   = document.getElementById("scoreboardList");

    if (scores.length === 0) {
        list.innerHTML = `<div class="scoreboardEmpty">No scores yet — be the first!</div>`;
    } else {
        const medals = ["🥇", "🥈", "🥉", "4️⃣", "5️⃣"];
        list.innerHTML = scores.map((s, i) => `
            <div class="scoreboardEntry ${currentUser && s.userId === currentUser.uid ? "scoreboardYou" : ""}">
                <span class="scoreboardRank">${medals[i]}</span>
                <span class="scoreboardName">${s.username}</span>
                <span class="scoreboardScore">${s.score.toLocaleString()}</span>
            </div>
        `).join("");
    }

    // Show the user's personal best if they're logged in
    if (currentUser) {
        try {
            const myRef  = doc(db, "scores", String(currentSongId), "entries", currentUser.uid);
            const mySnap = await getDoc(myRef);
            if (mySnap.exists()) {
                document.getElementById("scoreboardYourBest").textContent =
                    `Your best: ${mySnap.data().score.toLocaleString()}`;
            }
        } catch (_) {}
    } else {
        document.getElementById("scoreboardYourBest").textContent = "Log in to save your scores!";
    }
}

function closeScoreboard() {
    const modal = document.getElementById("scoreboardModal");
    if (modal) modal.style.display = "none";
}

//Style for the scoreboard itself
function injectScoreboardStyles() {
    const style = document.createElement("style");
    style.textContent = `
        #scoreboardBtn {
            width: 100%;
            background: none;
            border: none;
            color: #fff;
            font-size: 0.9rem;
            padding: 8px 12px;
            text-align: left;
            cursor: pointer;
            border-radius: 6px;
        }
        #scoreboardBtn:hover {
            background: rgba(75, 167, 255, 0.2);
        }
        #scoreboardModal {
            display: none;
            position: fixed;
            top: 0; left: 0;
            width: 100%; height: 100%;
            background: rgba(0,0,0,0.6);
            z-index: 9999;
            align-items: center;
            justify-content: center;
        }
        #scoreboardPanel {
            background: rgba(123, 39, 245, 0.75);
            border:1px solid #3e007d;
            border-radius: 16px;
            padding: 24px;
            min-width: 320px;
            max-width: 420px;
            width: 90%;
        }
        #scoreboardHeader {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 8px;
            font-size: 1.2rem;
            font-weight: bold;
            color: #fff;
        }
        #closeScoreboardBtn {
            background: none;
            border: none;
            color: #aaa;
            font-size: 1.1rem;
            cursor: pointer;
        }
        #closeScoreboardBtn:hover { color: #fff; }
        #scoreboardSongTitle {
            font-size: 0.85rem;
            color: #4BA7FF;
            margin-bottom: 16px;
        }
        .scoreboardEntry {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 10px 12px;
            border-radius: 8px;
            margin-bottom: 6px;
            background: rgba(255,255,255,0.05);
        }
        .scoreboardYou {
            background: rgba(75, 167, 255, 0.15);
            border: 1px solid #4BA7FF;
        }
        .scoreboardRank  { font-size: 1.2rem; min-width: 28px; }
        .scoreboardName  { flex: 1; color: #fff; font-size: 0.9rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .scoreboardScore { font-weight: bold; color: #FFD700; font-size: 1rem; }
        .scoreboardLoading, .scoreboardEmpty {
            text-align: center;
            color: #aaa;
            padding: 20px;
            font-size: 0.9rem;
        }
        #scoreboardYourBest {
            margin-top: 14px;
            text-align: center;
            font-size: 0.85rem;
            color: #aaa;
        }
    `;
    document.head.appendChild(style);
}


// ─── Load Song Pitch Data ─────────────────────────────────────────────────────

async function loadSongPitches(pitchesPath) {
    if (!pitchesPath) {
        console.warn("[KaraokeScorer] No pitchesPath for this song — scoring disabled.");
        songPitchData = null;
        return;
    }
    try {
        const res     = await fetch(pitchesPath);
        songPitchData = await res.json();
        console.log(`[KaraokeScorer] Loaded ${songPitchData.pitches.length} pitch frames.`);
    } catch (err) {
        console.error("[KaraokeScorer] Failed to load pitch data:", err);
        songPitchData = null;
    }
}


// ─── UI ───────────────────────────────────────────────────────────────────────

function initScorerUI() {
    const panel = document.createElement("div");
    panel.id = "scorerPanel";
    panel.innerHTML = `
        <button id="micToggleBtn" title="Toggle microphone for scoring">🎤 Start Mic</button>
        <span id="pitchDisplay">— Hz</span>
        <span id="tierDisplay"></span>
        <span id="scoreDisplay">0</span>
    `;

    const rightControls = document.getElementById("rightControls");
    if (rightControls) {
        rightControls.parentElement.insertBefore(panel, rightControls);
    } else {
        document.getElementById("bottomBar")?.appendChild(panel);
    }

    micToggleBtn = document.getElementById("micToggleBtn");
    pitchDisplay = document.getElementById("pitchDisplay");
    tierDisplay  = document.getElementById("tierDisplay");
    scoreDisplay = document.getElementById("scoreDisplay");

    micToggleBtn.onclick = toggleMic;

    injectScorerStyles();
}

function updateScorerUI(userHz, expectedHz) {
    if (!pitchDisplay || !scoreDisplay) return;

    const userNote     = userHz     > 0 ? hzToNote(userHz)     : "—";
    const expectedNote = expectedHz > 0 ? hzToNote(expectedHz) : "—";

    pitchDisplay.textContent = `You: ${userNote}  |  Song: ${expectedNote}`;

    const tier = getTier(userHz, expectedHz);
    pitchDisplay.style.color = expectedHz > 0 ? tier.color : "#aaa";

    scoreDisplay.textContent = totalScore.toLocaleString();
}

function flashTier(tier) {
    if (!tierDisplay) return;

    clearTimeout(tierFlashTimeout);
    tierDisplay.textContent   = tier.label;
    tierDisplay.style.color   = tier.color;
    tierDisplay.style.opacity = "1";

    tierFlashTimeout = setTimeout(() => {
        tierDisplay.style.opacity = "0";
    }, 600);
}

function showFinalScore() {
    const pct = maxPossible > 0 ? Math.round((totalScore / maxPossible) * 100) : 0;
    let grade, color;
    if      (pct >= 90) { grade = "S"; color = "#FFD700"; }
    else if (pct >= 75) { grade = "A"; color = "#4BA7FF"; }
    else if (pct >= 60) { grade = "B"; color = "#6bff8e"; }
    else if (pct >= 45) { grade = "C"; color = "#f0c040"; }
    else                { grade = "D"; color = "#ff6b6b"; }

    const sub = document.getElementById("subtitle");
    if (sub) {
        sub.innerHTML = `
            <div style="font-size:3vw;color:#fff;">Final Score</div>
            <div style="font-size:8vw;color:${color};font-weight:bold;">${totalScore.toLocaleString()}</div>
            <div style="font-size:4vw;color:${color};">Grade: ${grade}</div>
        `;
        setTimeout(() => { sub.innerHTML = ""; }, 4000);
    }
}

function hzToNote(hz) {
    if (hz <= 0) return "—";
    const noteNames = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
    const midi      = Math.round(hzToMidi(hz));
    const octave    = Math.floor(midi / 12) - 1;
    const note      = noteNames[midi % 12];
    return `${note}${octave}`;
}


//Handles Style and Functionality of the button for accessing Scoreboard
function injectScorerStyles() {
    const style = document.createElement("style");
    style.textContent = `
        #scorerPanel {
            background: rgba(123, 39, 245, 0.75);
            border:1px solid #3e007d;
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 0 12px;
            flex-shrink: 0;
        }
        #micToggleBtn {
            background: rgba(75, 167, 255, 0.2);
            border: 1px solid #4BA7FF;
            color: #fff;
            border-radius: 20px;
            padding: 4px 12px;
            cursor: pointer;
            font-size: 0.85rem;
            transition: background 0.2s;
        }
        #micToggleBtn:hover {
            background: rgba(75, 167, 255, 0.45);
        }
        #pitchDisplay {
            font-size: 0.8rem;
            color: #aaa;
            min-width: 160px;
            text-align: center;
        }
        #tierDisplay {
            font-size: 1rem;
            font-weight: bold;
            min-width: 80px;
            text-align: center;
            transition: opacity 0.3s;
            opacity: 0;
        }
        #scoreDisplay {
            font-size: 1.1rem;
            font-weight: bold;
            color: #fff;
            min-width: 80px;
            text-align: right;
        }
    `;
    document.head.appendChild(style);
}


// ─── Hook into existing MusicPlayer.js flow ───────────────────────────────────

window.addEventListener("DOMContentLoaded", () => {
    initScorerUI();
    initScoreboard();

    fetch("/api/songs")
        .then(r => r.json())
        .then(data => {
            const song = data.find(s => s.id === currentSongId);
            if (song) loadSongPitches(song.pitchesPath);
        });

    const audioEl = document.getElementById("audio");
    if (audioEl) {
        audioEl.addEventListener("ended", () => {
            if (scoringActive) stopMic();
        });
    }
});