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
window.stopMic = () => {
    console.warn("stopMic called before initialization");
};

// ─── Tier Constants ───────────────────────────────────────────────────────────

const TIERS = [
    { label: "PERFECT",maxSemitones: 10.0, points: 50,  color: "#FFD700" },
    { label: "GOOD", maxSemitones: 15.0, points: 20,  color: "#4BA7FF" },
    { label: "CLOSE", maxSemitones: 20.0, points: 10,  color: "#6bff8e" },
    { label: "MISS", maxSemitones: Infinity, points: 0, color: "#ff6b6b" },
];

const MIN_VOICED_AMP = 0.002; // RMS threshold — below this we treat user as silent
// ─── Ranks Constants ───────────────────────────────────────────────────────────
const Ranks = [
    { label: "EX+", min: 95, color: null },      // Handled by rainbow logic
    { label: "A", min: 88, color: "#e82020" }, // Red
    { label: "B", min: 80, color: "#3a24e5" }, // Blue
    { label: "C", min: 70, color: "#4ff4be" }, // Cyan
    { label: "D", min: 60, color: "#3fe538" }, // Green
    { label: "F", min: 0,  color: "#79471B" }, // Brown
];
// ─── State ────────────────────────────────────────────────────────────────────

let songPitchData = null;
let micStream = null;
let audioCtx = null;
let analyserNode = null;
let micSourceNode = null;
let scoringActive = false;
let scoringInterval = null;

let consecutiveMisses = 0;
let currentCombo = 0;
let maxCombo = 0;
let totalScore = 0;
let maxPossible = 0;
let scoredFrames = 0;

let lastTierLabel = "";
let tierFlashTimeout = null;

// Current song ID (set from URL)
const params = new URLSearchParams(window.location.search);
const currentSongId = parseInt(params.get("song"));

// Current logged in user (updated by onAuthStateChanged)
let currentUser = null;
onAuthStateChanged(auth, user => { currentUser = user; });
// for final score screen retry
let isRestarting = false;
// for mic
let selectedMicId = null;

// score roll up
let displayedScore = 0;
let scoreRollInterval = null;
// ─── UI Elements ──────────────────────────────────────────────────────────────

let scoreDisplay = null;
let pitchDisplay = null;
let tierDisplay = null;
let micToggleBtn = null;

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
// ─── Tiers on screen ─────────────────────────────────────────────────────────

function spawnTierPopup(tier) {
    const layer = document.getElementById("tierFloatLayer");
    if (!layer) return;

    const el = document.createElement("div");
    el.className = "tierFloat";
    el.textContent = tier.label;
    el.style.color = tier.color;

    // random horizontal position
    const x = Math.random() * 80 + 10; // 10% → 90%
    el.style.left = `${x}%`;

    // randomly above or below lyrics center
    const above = Math.random() > 0.5;
    const yBase = window.innerHeight * 0.5;

    const offset = above
        ? -(Math.random() * 120 + 60)
        : Math.random() * 120 + 60;

    el.style.top = `calc(50% + ${offset}px)`;

    layer.appendChild(el);

    // cleanup after animation
    setTimeout(() => {
        el.remove();
    }, 1200);
}
// ─── Mic Setup ─────────────────────────────────────────────────────────────────

/** Enumerate audio input devices and populate the select dropdowns */
async function populateMicSelects() {
    const sel = document.getElementById("micSelectSingle");
    if (!sel) return;

    try {
        // Request permission first so device labels are available
        const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        tempStream.getTracks().forEach(t => t.stop());
    } catch (err) {
        console.error("[KaraokeScorer] Mic permission denied:", err);
        alert("Microphone access was denied. Please allow microphone access and refresh.");
        return;
    }

    const devices = await navigator.mediaDevices.enumerateDevices();
    const mics = devices.filter(d => d.kind === "audioinput");

    sel.innerHTML = "";
    if (mics.length === 0) {
        alert("No microphones detected. Please connect a microphone and refresh.");
        return;
    }

    mics.forEach((mic, i) => {
        const opt = document.createElement("option");
        opt.value = mic.deviceId;
        opt.textContent = mic.label || `Microphone ${i + 1}`;
        sel.appendChild(opt);
    });
}

async function showMicSelectOverlay() {
    const micOverlay = document.getElementById("micSelectOverlay");
    const bottomBar  = document.getElementById("bottomBar");

    if (bottomBar)  bottomBar.style.pointerEvents = "none";
    if (micOverlay) micOverlay.style.display      = "flex";

    await populateMicSelects();
}
// ─── Combo on screen ─────────────────────────────────────────────────────────
function spawnComboPopup(combo) {
    const layer = document.getElementById("tierFloatLayer");
    if (!layer) return;

    const el = document.createElement("div");
    el.className = "tierFloat";
    el.textContent = `${combo}x COMBO`;

    // Color logic
    if (combo >= 50) el.style.color = "#FFD700";
    else if (combo >= 20) el.style.color = "#9d3bf8";
    else if (combo >= 10) el.style.color = "#215fe5";
    else if (combo >= 5) el.style.color = "#4BA7FF";
    else el.style.color = "#6bff8e";

    const jitterX = (Math.random() - 0.5) * 20;
    const jitterY = (Math.random() - 0.5) * 10;

    el.style.left = `calc(95% + ${jitterX}px)`;
    el.style.top  = `calc(15% + ${jitterY}px)`;


    layer.appendChild(el);
    setTimeout(() => el.remove(), 1000);
}
// ─── Countdown ─────────────────────────────────────────────────────────
function getExpectedPitch(currentTimeSec) {
    if (!songPitchData) return 0;
    const idx = Math.round(currentTimeSec / songPitchData.hop_duration);
    return songPitchData.pitches[idx] ?? 0;
}

async function startCountdownAndPlay(deviceId = null) {
    const overlay   = document.getElementById("karaokeStartOverlay");
    const startText = document.getElementById("startText");
    const audio     = document.getElementById("audio");
    const bottomBar = document.getElementById("bottomBar");

    overlay.style.display = "flex";

    for (let i = 3; i > 0; i--) {
        startText.textContent = i;
        await new Promise(r => setTimeout(r, 1000));
    }

    startText.textContent = "GO";
    await new Promise(r => setTimeout(r, 500));

    overlay.style.display = "none";

    if (bottomBar) bottomBar.style.pointerEvents = "auto";

    resetScore();
    resetScoreBar();
    await startMic(deviceId);
    playImg.src = "/images/pause_icon.svg";
    audio.play().catch(() => {});
}
// ─── Scoring Loop ─────────────────────────────────────────────────────────────

function scoringTick() {
    if (!scoringActive || !analyserNode) return;

    const audio = document.getElementById("audio");
    if (!audio || audio.paused) return;

    const userHz = detectPitch(analyserNode);
    const expectedHz = getExpectedPitch(audio.currentTime);

    // If the song doesn't expect a note, just exit.
    if (expectedHz <= 0) return;

    // --- REMOVED MAXPOSSIBLE ---
    // We no longer track a denominator. The score is now absolute.
    scoredFrames++;

    if (userHz > 0) {
        const tier = getTier(userHz, expectedHz);

        if (tier.label === "MISS") {
            consecutiveMisses++;
            if (consecutiveMisses >= 15) {
                currentCombo = 0;
            }
        } else {
            consecutiveMisses = 0;
            currentCombo++;
            if(currentCombo > maxCombo) maxCombo = currentCombo;
        }

        // AGGRESSIVE COMBO REWARDS
        // Since there is no 'max', these multipliers make the score explode!
        let multiplier = 0;
              if (currentCombo >= 50) multiplier =  3.0;
               else if (currentCombo >= 25) multiplier = 2.75;
               else if (currentCombo >= 10) multiplier = 2.5;
               else if (currentCombo >= 5) multiplier = 2.25;
               else if (currentCombo >= 2) multiplier = 2.0;



        let pointsEarned = tier.points;
        // Make 'PERFECT' significantly better than others to reward accuracy
        if (tier.label === "PERFECT") pointsEarned = 50;

        totalScore += Math.round(pointsEarned * multiplier);

        // Feedback
        if ([2, 5, 10, 25, 50, 100, 200].includes(currentCombo)) {
            spawnComboPopup(currentCombo);
        }

        if (tier.label !== lastTierLabel) {
            lastTierLabel = tier.label;
            flashTier(tier);
            spawnTierPopup(tier);
        }
    } else {
        consecutiveMisses++;
    }

    // Pass 0 to updateScorerUI for the percentage so the bar doesn't break
    updateScorerUI(userHz, expectedHz);
}
function resetScore() {
    totalScore     = 0;
    displayedScore = 0;
    maxPossible    = 0;
    scoredFrames   = 0;
    lastTierLabel  = "";
    currentCombo   = 0;
    maxCombo       = 0;
    consecutiveMisses = 0;
    if (scoreRollInterval) { clearInterval(scoreRollInterval); scoreRollInterval = null; }
    const scoreTextEl = document.getElementById("scoreText");
    if (scoreTextEl) scoreTextEl.textContent = "0";
    if (scoreDisplay) scoreDisplay.style.animation = "none";
    if (scoreTextEl) scoreTextEl.style.animation   = "none";
    resetScoreBar();
}

function restoreGameUI() {
    const topBar = document.querySelector(".top-bar") || document.getElementById("topBar");
    const bottomBar = document.getElementById("bottomBar");
    const scorer = document.getElementById("scorerPanel");

    if (topBar) topBar.style.display = "flex";
    if (bottomBar) bottomBar.style.display = "flex";
    if (scorer) scorer.style.display = "flex";
}

export async function restartSong() {
    console.log("restartSong CALLED");

    const audio = document.getElementById("audio");
    const subtitle = document.getElementById("subtitle");
    const progress = document.getElementById("progress");
    const micOverlay = document.getElementById("micSelectOverlay");
    const bottomBar = document.getElementById("bottomBar");

    // Set flag BEFORE stopMic so the final score screen doesn't fire
    isRestarting = true;
    stopMic();
    clearInterval(scoringInterval);
    scoringActive = false;

    audio.pause();
    audio.currentTime = 0;

    if (subtitle) subtitle.innerHTML = "";
    if (progress) progress.style.width = "0%";

    resetScore();
    resetScoreBar();
    restoreGameUI();

    // Reset the mic overlay UI back to its original state
    const micTitle    = document.getElementById("micPanelTitle");
    const micRow      = document.querySelector("#micSelectPanel .micRow");
    const confirmBtn  = document.getElementById("confirmMicsBtn");
    const countdownEl = document.getElementById("micCountdown");

    if (micTitle)    micTitle.style.display    = "block";
    if (micRow)      micRow.style.display      = "flex";
    if (confirmBtn) {
        confirmBtn.style.display  = "block";
        confirmBtn.disabled       = false;
        confirmBtn.style.opacity  = "1";
    }
    if (countdownEl) countdownEl.style.display = "none";

    // Lock bottom bar and show the mic overlay again
    if (bottomBar)   bottomBar.style.pointerEvents = "none";
    if (micOverlay)  micOverlay.style.display      = "flex";

    // Pre-select the previously chosen mic so it's not a blank choice
    const sel = document.getElementById("micSelectSingle");
    if (sel && selectedMicId) sel.value = selectedMicId;

    isRestarting = false;
}
window.addEventListener("DOMContentLoaded", () => {
    window.KaraokeScorer = window.KaraokeScorer || {};
    window.KaraokeScorer.restartSong = restartSong;
});

// ─── Microphone Setup / Teardown ──────────────────────────────────────────────

function setMicButton(isOn) {
    if (!micToggleBtn) return;
    micToggleBtn.textContent = isOn ? "🎤 Stop Mic" : "🎤 Start Mic";
}

async function startMic(deviceId = null) {
    try {
        const constraints = deviceId
            ? { audio: { deviceId: { exact: deviceId } } }
            : { audio: true, video: false };

        micStream = await navigator.mediaDevices.getUserMedia(constraints);

        audioCtx     = new (window.AudioContext || window.webkitAudioContext)();
        analyserNode = audioCtx.createAnalyser();
        analyserNode.fftSize = 2048;

        micSourceNode = audioCtx.createMediaStreamSource(micStream);
        micSourceNode.connect(analyserNode);

        scoringActive   = true;
        scoringInterval = setInterval(scoringTick, 50);

        setMicButton(true);
        console.log("[KaraokeScorer] Mic started.");
    } catch (err) {
        console.error("[KaraokeScorer] Mic access denied:", err);
        alert("Microphone access is required for scoring. Please allow mic access and try again.");
    }
}
function stopMic() {
    console.log("[KaraokeScorer] stopMic execution started");

    scoringActive = false;
    clearInterval(scoringInterval);

    if (micStream) {
        micStream.getTracks().forEach(track => track.stop());
        micStream = null;
    }

    if (audioCtx) {
        audioCtx.close().then(() => {
            audioCtx = null;
            analyserNode = null;
            micSourceNode = null;
        });
    }

    setMicButton(false);

    if (!isRestarting) {
        showFinalScore();
        saveScoreToFirebase();
    }
}

// THIS IS THE CRITICAL MISSING LINE
window.stopMic = stopMic;

async function toggleMic() {
    if (scoringActive) {
        stopMic();
    } else {
        resetScore();
        await startMic();
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
                score: totalScore,
                username: currentUser.displayName || currentUser.email || "Anonymous",
                userId: currentUser.uid,
                songId: currentSongId,
                timestamp: new Date().toISOString(),
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
        const snapshot = await getDocs(entriesRef);

        const scores = snapshot.docs.map(d => d.data());
        scores.sort((a, b) => b.score - a.score);
        return scores.slice(0, 5);
    } catch (err) {
        console.error("[KaraokeScorer] Failed to load scores:", err);
        return [];
    }
}


// ─── Scoreboard Popup ─────────────────────────────────────────────────────────
const scoreboardOpenBtn = document.getElementById("scoreboardOpenBtn");

if (scoreboardOpenBtn) {
    scoreboardOpenBtn.onclick = (e) => {
        e.stopPropagation();
        openScoreboard();
    };
}
function initScoreboard() {
    // Add "Scoreboard" option to the existing dropdown menu
    const dropdownMenu = document.getElementById("dropdownMenu");
    if (dropdownMenu) {
        const scoreboardBtn = document.createElement("button");
        scoreboardBtn.id = "scoreboardBtn";
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
            const myRef = doc(db, "scores", String(currentSongId), "entries", currentUser.uid);
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
         @font-face {
            font-family: "LTKaraoke";
            src: url("../fonts/LTKaraoke-Bold.ttf") format("truetype");
            src: url("../fonts/LTKaraoke-Medium.ttf") format("truetype");
        }
        #scoreboardBtn {
            width: 100%;
            background: purple;
            border: none;
            color: #ffffff;
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
            font-family: "LTKaraoke", sans-serif;
        }
        #scoreboardList {
            font-family: "LTKaraoke", sans-serif;
        }
        #scoreboardPanel {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
        
            background: rgba(123, 39, 245, 0.9);
            border: 1px solid #3e007d;
            border-radius: 16px;
            padding: 24px;
        
            min-width: 320px;
            max-width: 420px;
            width: 90%;
        
            z-index: 9999;
        }
        #scoreboardHeader {
            color: white;
            font-size: 1.2rem;
        }

        #scoreboardEmail {
            margin-top: 8px;
        
            text-align: center;
            font-size: 0.9rem;
            font-weight: bold;
        
            color: #ffffff;
        
            display: flex;
            justify-content: center;
            align-items: center;
        }
        #scoreboardSongTitle {
            font-size: 0.85rem;
            color: #FFFFFF;
            margin-bottom: 16px;
        }
        .scoreboardEntry {
            display: grid;
            grid-template-columns: 40px 1fr 90px; 
            align-items: center;
        
            padding: 10px 12px;
            border-radius: 8px;
            margin-bottom: 6px;
            background: rgba(255,255,255,0.05);
        }

        .scoreboardYou {
            background: rgba(75, 167, 255, 0.15);
            border: 1px solid #4BA7FF;
        }
        #scoreboardSongTitle {
            padding-bottom: 10px;
            margin-bottom: 10px;
            border-bottom: 1px solid rgba(255,255,255,0.15);
        }
        #closeScoreboardBtn {
            position: absolute;
            top: 10px;
            right: 10px;
            background: none;
            border: none;
            color: #aaa;
            font-size: 1.1rem;
            cursor: pointer;
            background: none;
            border: none;
            font-size: 1.2rem;
            cursor: pointer;
        }
        .scoreboardScore {
            min-width: 90px;
            text-align: center; 
            font-weight: bold;
            color: #FFD700;
            font-size: 1rem;
        }
        #closeScoreboardBtn:hover {
            color: #fff;
        }
        .scoreboardRank { font-size: 1.2rem; min-width: 28px; text-align: center;}
        .scoreboardName {
            text-align: left;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .scoreboardScore {
            text-align: center;
            font-weight: bold;
            color: #FFD700;
            font-size: 1rem;
        }
        .scoreboardLoading, .scoreboardEmpty {
            text-align: center;
            color: #aaa;
            padding: 20px;
            font-size: 0.9rem;
        }
        #scoreboardYourBest {
            margin-top: 14px;
            padding: 10px;
        
            text-align: center;
            font-size: 0.95rem;
            font-weight: bold;
            color: #fff;

            display: flex;
            justify-content: center;
            background: rgba(255,255,255,0.08);
            border: 1px solid rgba(255,255,255,0.15);
            border-radius: 10px;
        
            align-items: center;
        }
        #pitchDisplay {
            width: 180px;
            text-align: center;
        }

        #tierDisplay {
            width: 80px;
            text-align: center;
        }

        #scoreBar {
            position: relative;
            flex: 1; 
            height: 14px;
            border-radius: 7px;
            overflow: hidden;
            border: 1px solid #333;
        }
        
        #scorerPanel {
            position: absolute;
            top: 6%;
            left: 0;
            
            display: flex;
            justify-content: flex-start;
            
            width: 100%;
    
            box-sizing: border-box; 
            height: 5%;
        
            align-items: center;
            gap: 15px;
            padding: 0 20px; 
       
            backdrop-filter: blur(6px);
            z-index: 9;
            transition: transform 0.3s ease;
        }
        
        #scoreDisplay {
            font-family: "LTKaraoke", "monospace"; 
            font-weight: bold;
            font-size: 1.8rem; 
            color: white;
             
            text-shadow: 2px 2px 4px rgba(0,0,0,0.5);
        
            min-width: 120px; 
            text-align: center;
            flex-shrink: 0;
            background: rgba(0, 0, 0, 0.35);
            border: 1px solid rgba(255, 255, 255, 0.2);
            padding: 6px 14px;
            border-radius: 10px;
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
        <div id="scoreBar">
            <div id="scoreBarFill"></div>

            <div class="rankMarker rank-f" style="left:0.5%">
                <img src="/images/TierF.png" class="rankLabelImg">
            </div>

            <div class="rankMarker" style="left:60%">
                <img src="/images/TierD.png" class="rankLabelImg">
            </div>

            <div class="rankMarker" style="left:70%">
                <img src="/images/TierC.png" class="rankLabelImg">
            </div>

            <div class="rankMarker" style="left:80%">
                <img src="/images/TierB.png" class="rankLabelImg">
            </div>

            <div class="rankMarker" style="left:88%">
                <img src="/images/TierA.png" class="rankLabelImg">
            </div>

            <div class="rankMarker rank-ex" style="left:95%">
                <img src="/images/TierEX.png" class="rankLabelImg">
            </div>
        </div>

        <span id="scoreDisplay"><span id="scoreText">0</span></span>
    `;

    document.body.appendChild(panel);

    micToggleBtn = document.getElementById("micToggleBtn");
    pitchDisplay = document.getElementById("pitchDisplay");
    tierDisplay = document.getElementById("tierDisplay");
    scoreDisplay = document.getElementById("scoreDisplay");

    injectScorerStyles();
}

function updateScorerUI(userHz, expectedHz) {
    if (!scoreDisplay) return;

    // Calculate percentage based on your fixed Target Score (e.g., 100k)
    const targetScore = 100000;
    const pct = Math.min((totalScore / targetScore) * 100, 100);

    // Update the visual bar and text
    updateScoreBar(pct);

    // Update Pitch Display
    if (pitchDisplay) {
        const userNote = userHz > 0 ? hzToNote(userHz) : "—";
        const expectedNote = expectedHz > 0 ? hzToNote(expectedHz) : "—";
        pitchDisplay.textContent = `You: ${userNote} | Song: ${expectedNote}`;
        const tier = getTier(userHz, expectedHz);
        pitchDisplay.style.color = expectedHz > 0 ? tier.color : "#aaa";
    }

    // 4. Update Combo UI
    const comboEl = document.getElementById("comboDisplay");
    const scoreEl = document.getElementById("scoreDisplay");

    if (comboEl) {
        if (currentCombo > 1) {
            comboEl.textContent = `Combo ${currentCombo}x`;
            comboEl.style.color = currentCombo >= 50 ? "#FFD700" : currentCombo >= 20 ? "#4BA7FF" : "#6bff8e";
            comboEl.style.opacity = "1";
        } else {
            comboEl.style.opacity = "0";
        }
    }

    const scoreTextEl = document.getElementById("scoreText");

    if (scoreTextEl && totalScore !== displayedScore) {
        // Cancel any in-progress roll
        if (scoreRollInterval) {
            clearInterval(scoreRollInterval);
            scoreRollInterval = null;
        }

        const start = displayedScore;
        const end = totalScore;
        const diff = end - start;
        const duration = 300; // ms — fast enough to feel responsive
        const startTime = performance.now();

        scoreRollInterval = setInterval(() => {
            const elapsed = performance.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 2);

            displayedScore = Math.round(start + diff * eased);
            scoreTextEl.textContent = displayedScore.toLocaleString();

            if (progress >= 1) {
                displayedScore = end;
                scoreTextEl.textContent = end.toLocaleString();
                clearInterval(scoreRollInterval);
                scoreRollInterval = null;
            }
        }, 16); // ~60fps
    }

    // Remove all shake animations — score el stays still
    if (scoreEl) scoreEl.style.animation = "none";
}

function flashTier(tier) {
    if (!tierDisplay) return;
    clearTimeout(tierFlashTimeout);
    tierDisplay.textContent = tier.label;
    tierDisplay.style.color = tier.color;
    tierDisplay.style.opacity = "1";

    tierFlashTimeout = setTimeout(() => {
        tierDisplay.style.opacity = "0";
    }, 600);
}

function showFinalScore() {
    const targetScore = 100000;
    const pct = Math.round((totalScore / targetScore) * 100);

    let grade;
    if (pct >= 95) grade = "EX+";
    else if (pct >= 88) grade = "A";
    else if (pct >= 80) grade = "B";
    else if (pct >= 70) grade = "C";
    else if (pct >= 60) grade = "D";
    else grade = "F";

    // Hide game UI
    const topBar    = document.querySelector(".top-bar") || document.getElementById("topBar");
    const bottomBar = document.getElementById("bottomBar");
    const scorer    = document.getElementById("scorerPanel");
    if (topBar)    topBar.style.display    = "none";
    if (bottomBar) bottomBar.style.display = "none";
    if (scorer)    scorer.style.display    = "none";

    const gradeImgMap = {
        "EX+": "/images/TierEX.png",
        "A": "/images/TierA.png",
        "B": "/images/TierB.png",
        "C": "/images/TierC.png",
        "D": "/images/TierD.png",
        "F": "/images/TierF.png",
    };

    const sub = document.getElementById("subtitle");
    if (!sub) return;

    sub.innerHTML = `
        <div class="scoreboard-style-final">
            <div class="final-header"><span>🏆 Results</span></div>

            <div class="final-score">
                <span id="finalScoreText">0</span>
            </div>

            <div class="final-rank-bar-wrapper">
                <!-- Rank zone labels -->
            <div class="final-rank-labels">
                <img src="/images/TierF.png" class="rbl-img rbl-img-f" style="left:0%">
                <img src="/images/TierD.png" class="rbl-img rbl-img-d" style="left:60%">
                <img src="/images/TierC.png" class="rbl-img" style="left:70%">
                <img src="/images/TierB.png" class="rbl-img" style="left:80%">
                <img src="/images/TierA.png" class="rbl-img" style="left:88%">
                <img src="/images/TierEX.png" class="rbl-img rbl-img-ex" style="left:95%">
            </div>

                <!-- The bar track -->
                <div class="final-rank-track">
                    <div id="finalRankFill" class="final-rank-fill"></div>

                    <!-- Divider lines -->
                    <div class="frb-divider" style="left:60%"></div>
                    <div class="frb-divider" style="left:70%"></div>
                    <div class="frb-divider" style="left:80%"></div>
                    <div class="frb-divider" style="left:88%"></div>
                    <div class="frb-divider" style="left:95%"></div>

                    <!-- Marker that slides to your position -->
                    <div id="finalRankMarker" class="final-rank-marker"></div>
                </div>
            </div>

            <!-- Rank badge, hidden until bar finishes -->
            <div id="finalGradeBadge" class="final-grade-badge" style="opacity:0;">
                <img id="finalGradeImg"
                     src="${gradeImgMap[grade]}"
                     class="final-grade-img-result ${grade === 'EX+' ? 'ex-grade' : ''}">
            </div>

            <div class="final-combo">Best Combo: ${maxCombo}x</div>

            <div class="results-actions">
                <button id="retryBtn" class="scoreboard-btn">Retry</button>
                <button id="backBtn"  class="scoreboard-btn secondary">Back</button>
            </div>
        </div>
    `;

    // Inject final screen styles
    injectFinalScoreStyles();

    // Run animations in sequence
    animateFinalScore(totalScore, () => {
        animateFinalRankBar(pct, grade, gradeImgMap);
    });

    document.getElementById("retryBtn").onclick = async () => {
        isRestarting = true;
        sub.innerHTML = "";
        await restartSong();
        isRestarting = false;
    };

    document.getElementById("backBtn").onclick = () => {
        const p = new URLSearchParams(window.location.search);
        window.location.href = `/songselection?song=${p.get("song")}`;
    };
}

// Counts up the score, then calls onDone when finished
function animateFinalScore(target, onDone) {
    const el = document.getElementById("finalScoreText");
    if (!el) { onDone?.(); return; }

    const duration  = 1200;
    const startTime = performance.now();

    function update(now) {
        const progress = Math.min((now - startTime) / duration, 1);
        const eased    = 1 - Math.pow(1 - progress, 3);
        el.textContent = Math.floor(target * eased).toLocaleString();

        if (progress < 1) {
            requestAnimationFrame(update);
        } else {
            el.textContent = target.toLocaleString();
            onDone?.();
        }
    }

    requestAnimationFrame(update);
}

function animateFinalRankBar(pct, grade, gradeImgMap) {
    const fill   = document.getElementById("finalRankFill");
    const marker = document.getElementById("finalRankMarker");
    const badge  = document.getElementById("finalGradeBadge");
    if (!fill || !marker || !badge) return;

    const safePct   = Math.min(pct, 100);
    const duration  = 1400;
    const startTime = performance.now();

    const glassShine = `linear-gradient(to bottom, rgba(255,255,255,0.3) 0%, rgba(255,255,255,0) 50%, rgba(0,0,0,0.15) 100%)`;
    const stripes    = `repeating-linear-gradient(
        -45deg,
        rgba(255,255,255,0.18) 0px, rgba(255,255,255,0.18) 10px,
        transparent 10px, transparent 20px
    )`;

    const isEX = safePct >= 95;

    // Build background layers once
    function applyBackground(trackWidth) {
        if (isEX) {
            const rainbow = `linear-gradient(90deg, red, orange, yellow, green, cyan, blue, violet, red)`;
            fill.style.backgroundImage = `${glassShine}, ${stripes}, ${rainbow}`;
            fill.style.backgroundSize  = `100% 100%, 20px 20px, 300% 100%`;
        } else {
            const sortedRanks = [...Ranks].filter(r => r.min < 95).sort((a, b) => a.min - b.min);
            const gradientParts = [];
            for (let i = 0; i < sortedRanks.length; i++) {
                const r    = sortedRanks[i];
                const next = sortedRanks[i + 1];
                gradientParts.push(`${r.color} ${r.min}%`);
                gradientParts.push(`${r.color} ${next ? next.min : 100}%`);
            }
            const rankGradient = `linear-gradient(to right, ${gradientParts.join(", ")})`;
            fill.style.backgroundImage = `${glassShine}, ${stripes}, ${rankGradient}`;
            fill.style.backgroundSize  = `100% 100%, 20px 20px, ${trackWidth}px 100%`;
        }
    }

    const trackWidth = fill.parentElement?.offsetWidth ?? 400;
    applyBackground(trackWidth);

    // Start state
    fill.style.width      = "0%";
    marker.style.left     = "0%";
    marker.style.opacity  = "0";
    badge.style.transform = "scale(0.5)";

    // fill animation
    function step(now) {
        const elapsed  = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased    = 1 - Math.pow(1 - progress, 2.5);
        const current  = eased * safePct;

        fill.style.width         = current + "%";
        marker.style.left        = current + "%";
        marker.style.opacity     = "1";

        // Scroll stripes during fill
        if (isEX) {
            fill.style.backgroundPosition = `0 0, 0 0, ${-(elapsed / 2000) * 300}% 0`;
        } else {
            const offset = (elapsed / 1000) * 40;
            fill.style.backgroundPosition = `0 0, ${offset}px 0, 0 0`;
        }

        if (progress < 1) {
            requestAnimationFrame(step);
        } else {
            // Lock fill at final width
            fill.style.width  = safePct + "%";
            marker.style.left = safePct + "%";
            marker.classList.add("marker-bounce");


            const loopStart = performance.now();

            const offsetAtEnd = (duration / 1000) * 40;

            function stripeLoop(now) {
                const loopElapsed = now - loopStart;

                if (isEX) {
                    // Rainbow shift keeps scrolling
                    fill.style.backgroundPosition =
                        `0 0, 0 0, ${-((duration + loopElapsed) / 2000) * 300}% 0`;
                } else {
                    // Barber-pole stripes keep scrolling
                    const offset = offsetAtEnd + (loopElapsed / 1000) * 40;
                    fill.style.backgroundPosition = `0 0, ${offset}px 0, 0 0`;
                }

                requestAnimationFrame(stripeLoop);
            }
            requestAnimationFrame(stripeLoop);

            // Pop badge after marker bounce
            setTimeout(() => {
                badge.style.transition = "opacity 0.3s ease, transform 0.4s cubic-bezier(0.175,0.885,0.32,1.275)";
                badge.style.opacity    = "1";
                badge.style.transform  = "scale(1)";
            }, 400);
        }
    }

    requestAnimationFrame(step);
}

function injectFinalScoreStyles() {
    if (document.getElementById("finalScoreStyles")) return;
    const style = document.createElement("style");
    style.id = "finalScoreStyles";
    style.textContent = `
        .final-rank-bar-wrapper {
            width: 100%;
            display: flex;
            flex-direction: column;
            gap: 8px;
        }

        .final-rank-labels {
            position: relative;
            width: 100%;
            height: 36px;
            font-family: "LTKaraoke", sans-serif;
            font-size: 0.75rem;
            color: rgba(255,255,255,0.7);
        }

        .rbl-img {
            position: absolute;
            width: 20px;
            height: auto;
            transform: translateX(-50%);
            user-select: none;
            bottom: 0;
        }
        .rbl-img-f {
            transform: translateX(-30%);
        }
        .rbl-img-d {
            transform: translateX(-40%);
        }
        .rbl-img-ex {
            width: 45px;
            transform: translateX(-40%);
        }

        .final-rank-track {
            position: relative;
            width: 100%;
            height: 14px;
            background: #1a1a1a;
            border-radius: 7px;
            border: 1px solid #333;
            overflow: visible;
        }


        .final-rank-fill {
            position: absolute;
            left: 0;
            top: 0;
            height: 100%;
            width: 0%;
            border-radius: 7px;
            z-index: 1;
        }

        .frb-divider {
            position: absolute;
            top: -8px;
            width: 3px;
            height: 30px;
            background: #808080;
            transform: translateX(-50%);
            z-index: 5;
        }

        /* Sliding position marker */
        .final-rank-marker {
            position: absolute;
            top: 50%;
            width: 3px;
            height: 30px;
            background: white;
            transform: translate(-50%, -50%);
            box-shadow: 0 0 6px rgba(255,255,255,0.9), 0 0 12px rgba(255,255,255,0.5);
            z-index: 10;
            opacity: 0;
            border-radius: 2px;
        }

        .final-rank-marker.marker-bounce {
            animation: markerBounce 0.45s ease forwards;
        }

        @keyframes markerBounce {
            0%   { transform: translate(-50%, -50%) scaleY(1); }
            30%  { transform: translate(-50%, -50%) scaleY(1.6); }
            65%  { transform: translate(-50%, -50%) scaleY(0.8); }
            100% { transform: translate(-50%, -50%) scaleY(1); }
        }

        .final-grade-badge {
            display: flex;
            justify-content: center;
            align-items: center;
            margin-top: 4px;
            transform: scale(0.5);
        }

        .final-grade-img-result {
            width: 110px;
            filter: drop-shadow(0 0 12px rgba(255,215,0,0.5));
            user-select: none;
        }
        .final-grade-img-result.ex-grade {
            width: 200px; /* bigger only for EX+ */
            filter: drop-shadow(0 0 20px gold);
            animation: exPulse 1.2s ease-in-out infinite;
        }
    `;
    document.head.appendChild(style);
}
function hzToNote(hz) {
    if (hz <= 0) return "—";
    const noteNames = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
    const midi = Math.round(hzToMidi(hz));
    const octave = Math.floor(midi / 12) - 1;
    const note = noteNames[midi % 12];
    return `${note}${octave}`;
}


//Handles Style and Functionality of the button for accessing Scoreboard
function injectScorerStyles() {
    const style = document.createElement("style");

    style.textContent = `
        @keyframes rainbowGlow {
            0% { filter: hue-rotate(0deg); }
            100% { filter: hue-rotate(360deg); }
        }
        .scoreboard-btn {
            font-family: "LTKaraoke", sans-serif;
        
            min-width: 180px;
            padding: 16px 28px;
        
            font-size: 1.4rem;
            font-weight: bold;
        
            color: white;
        
            border: none;
            border-radius: 18px;
        
            cursor: pointer;
        
            background: linear-gradient(
                to bottom,
                #a855ff 0%,
                #7b27f5 45%,
                #5d12cc 100%
            );
        
            box-shadow:
                0 6px 0 #3e007d,
                0 10px 18px rgba(0,0,0,0.35);
        
            transition:
                transform 0.08s ease,
                box-shadow 0.08s ease,
                filter 0.15s ease;
        
            user-select: none;
        }
        
        .scoreboard-btn:hover {
            filter: brightness(1.1);
            transform: translateY(-2px);
        }
        
        .scoreboard-btn:active {
            transform: translateY(4px);
        
            box-shadow:
                0 2px 0 #3e007d,
                0 4px 10px rgba(0,0,0,0.3);
        }
        
        .scoreboard-btn.secondary {
            background: linear-gradient(
                to bottom,
                #555 0%,
                #3a3a3a 45%,
                #222 100%
            );
        
            box-shadow:
                0 6px 0 #111,
                0 10px 18px rgba(0,0,0,0.35);
        }
        .result-btn {
            padding: 15px 40px;
            font-size: 1.5rem;
            border: none;
            border-radius: 50px;
            cursor: pointer;
            font-weight: bold;
            transition: transform 0.2s, background 0.2s;
        }

        .result-btn.primary {
            background: #4BA7FF;
            color: white;
            font-family: "LTKaraoke", sans-serif;
        }

        .result-btn.secondary {
            background: rgba(255,255,255,0.1);
            color: white;
            border: 2px solid rgba(255,255,255,0.2);
            font-family: "LTKaraoke", sans-serif;
            
        }

        .result-btn:hover {
            transform: scale(1.05);
        }

        .result-btn.primary:hover { background: #3a8ee6; }
        .result-btn.secondary:hover { background: rgba(255,255,255,0.2); }

        .results-container {
            animation: fadeInScale 0.5s ease-out forwards;
        }
        
        .results-actions {
            display: flex;
            gap: 20px;
            margin-top: 10px;
        }

        @keyframes fadeInScale {
            from { opacity: 0; transform: scale(0.9); }
            to { opacity: 1; transform: scale(1); }
        }

        #scorerPanel {
            display: flex;
            align-items: center;
            gap: 15px;
            padding: 0 20px;
            width: 100%;
            box-sizing: border-box;
            overflow: visible !important;
            height: 60px;
            
        }

        #scoreBar {
            position: relative;
            flex: 1;
            height: 14px;
            background: #1a1a1a;
            border-radius: 7px;
            border: 1px solid #333;
            overflow: visible !important;
        }

        #scoreBarFill {
            position: absolute;
            border-radius: 7px;
            left: 0;
            top: 0;
            height: 100%;
            width: 0%;
            transition: width 0.1s linear;
            z-index: 1;
        }

        #comboDisplay {
            font-size: 2rem;
            font-weight: bold;
            min-width: 60px;
            text-align: center;
            opacity: 0;
            transition: opacity 1.5s ease;
            font-family: "LTKaraoke", sans-serif;
        }

        .rankMarker {
            position: absolute;
            top: -8px;
            width: 3px;
            height: 30px;
            background: #808080;
            z-index: 5;
        
            transform: translateX(-50%);
        }
        
        .rankLabelImg {
            position: absolute;
            top: 35px;
            left: 50%;
            transform: translateX(-50%);
            width: 30px;
            height: auto;
            display: block;
        }
        
        .rank-ex .rankLabelImg {
            width: 70px;
            top: 32px;
        

            left: 50%;
            transform: translateX(-40%);
        }

        .scoreboard-style-final {
            background: rgba(123, 39, 245, 0.85);
            border: 1px solid #7b27f5;
            border-radius: 24px;
        
            padding: 40px 60px;
        
            display: flex;
            flex-direction: column;
            align-items: center;
        
            gap: 20px;
        
            min-width: 320px;
            max-width: 520px;
        
            backdrop-filter: blur(10px);
        
            animation: fadeInScale 0.35s ease;
        }
        
        .final-header {
            font-family: "LTKaraoke", sans-serif;
            font-size: 2rem;
            color: white;
            user-select: none;
        }

        
        .final-score {
            font-size: 4.5rem;
            font-weight: bold;
            color: #FFD700;
        
            margin: 15px 0;
            user-select: none;
            animation: scorePop 0.4s ease;
        
        }
        
        @keyframes scorePop {
            0% { transform: scale(0.8); opacity: 0; }
            100% { transform: scale(1); opacity: 1; }
        }
        
        .final-grade-img {
            width: 120px;
            margin: 10px 0;
            user-select: none;
        }

        .final-combo {
            font-family: "LTKaraoke", sans-serif;
            font-size: 2rem;
            color: #FFFFFF;
            margin-top: 30px; 
        }
        @keyframes rankFinalPop {
            0% {
                transform: scale(0.6);
                opacity: 0;
            }
        
            70% {
                transform: scale(1.2);
            }
        
            100% {
                transform: scale(1);
                opacity: 1;
            }
        }
    `;

    document.head.appendChild(style);
}
// ─── Score Bar ───────────────────────────────────
function getRank(pct) {
    return Ranks.find(r => pct >= r.min);
}
function updateScoreBar(pct) {
    const bar = document.getElementById("scoreBar");
    const fill = document.getElementById("scoreBarFill");
    if (!fill || !bar) return;

    const safePct = Math.max(0, Math.min(pct, 100));
    fill.style.width = safePct + "%";

    const glassShine = `linear-gradient(to bottom, rgba(255,255,255,0.3) 0%, rgba(255,255,255,0) 50%, rgba(0,0,0,0.15) 100%)`;
    const stripes = `repeating-linear-gradient(
        -45deg,
        rgba(255,255,255,0.18) 0px,
        rgba(255,255,255,0.18) 10px,
        transparent 10px,
        transparent 20px
    )`;

    if (safePct >= 95) {
        const rainbow = `linear-gradient(90deg, red, orange, yellow, green, cyan, blue, violet, red)`;
        fill.style.backgroundImage = `${glassShine}, ${stripes}, ${rainbow}`;
        fill.style.backgroundSize = `100% 100%, 20px 20px, 300% 100%`;
        fill.style.animation = "exRainbowShift 2s linear infinite";
        return;
    }

    const sortedRanks = [...Ranks].filter(r => r.min < 95).sort((a, b) => a.min - b.min);
    let gradientParts = [];
    for (let i = 0; i < sortedRanks.length; i++) {
        const current = sortedRanks[i];
        const next = sortedRanks[i + 1];
        gradientParts.push(`${current.color} ${current.min}%`);
        if (next) gradientParts.push(`${current.color} ${next.min}%`);
        else       gradientParts.push(`${current.color} 100%`);
    }

    const totalWidth = bar.offsetWidth;
    const rankGradient = `linear-gradient(to right, ${gradientParts.join(', ')})`;
    fill.style.backgroundImage = `${glassShine}, ${stripes}, ${rankGradient}`;
    fill.style.backgroundSize = `100% 100%, 20px 20px, ${totalWidth}px 100%`;
    fill.style.animation = "barberSpin 1.6s linear infinite";
}
function resetScoreBar() {
    const fill = document.getElementById("scoreBarFill");
    if (!fill) return;

    fill.style.transition = "none";
    fill.style.width = "0%";
    fill.style.backgroundColor = "#ff6b6b";
    fill.classList.remove("tier-ex-plus");

    void fill.offsetWidth;

    fill.style.transition = "width 0.2s linear, background-color 0.2s linear";
}
// ─── Hook into existing MusicPlayer.js flow ───────────────────────────────────

window.addEventListener("DOMContentLoaded", () => {
    window.KaraokeScorer = window.KaraokeScorer || {};
    window.KaraokeScorer.restartSong = restartSong;

    initScorerUI();
    initScoreboard();
    resetScore();
    resetScoreBar();

    fetch("/api/songs")
        .then(r => r.json())
        .then(data => {
            const song = data.find(s => s.id === currentSongId);
            if (song) loadSongPitches(song.pitchesPath);
        });

    const audioEl   = document.getElementById("audio");
    const bottomBar = document.getElementById("bottomBar");
    const startBtn  = document.getElementById("startKaraokeBtn");
    const startOverlay = document.getElementById("karaokeStartOverlay");
    const micOverlay   = document.getElementById("micSelectOverlay");

    // Lock bottom bar and hide start overlay completely until mic is confirmed
    if (bottomBar)    bottomBar.style.pointerEvents = "none";
    if (startOverlay) startOverlay.style.display    = "none";
    if (startBtn)     startBtn.disabled             = true;

    // Show mic select overlay on load, request permission
    showMicSelectOverlay();

    // Confirm mic → THEN show start overlay
    const confirmBtn = document.getElementById("confirmMicsBtn");
    if (confirmBtn) {
        confirmBtn.onclick = async () => {
            const sel = document.getElementById("micSelectSingle");
            selectedMicId = sel ? sel.value : null;
            if (!selectedMicId) return;

            // Disable confirm button so it can't be clicked again
            confirmBtn.disabled = true;
            confirmBtn.style.opacity = "0.5";

            // Countdown inside the mic overlay panel
            const micTitle    = document.getElementById("micPanelTitle");
            const micRow      = document.querySelector("#micSelectPanel .micRow");
            const micLabel    = document.getElementById("micSelectSingleLabel");
            const micSelect   = document.getElementById("micSelectSingle");
            const countdownEl = document.getElementById("micCountdown");

            // Hide the selection UI, show the countdown
            if (micRow)    micRow.style.display    = "none";
            if (micTitle)  micTitle.style.display  = "none";
            if (confirmBtn) confirmBtn.style.display = "none";
            if (countdownEl) countdownEl.style.display = "block";

            for (let i = 3; i > 0; i--) {
                if (countdownEl) countdownEl.textContent = i;
                await new Promise(r => setTimeout(r, 1000));
            }
            if (countdownEl) countdownEl.textContent = "GO!";
            await new Promise(r => setTimeout(r, 500));

            // Hide the whole mic overlay now
            if (micOverlay) micOverlay.style.display = "none";
            if (startOverlay) startOverlay.style.display = "none";
            if (bottomBar) bottomBar.style.pointerEvents = "auto";

            resetScore();
            resetScoreBar();
            await startMic(selectedMicId);
            const playImg = document.getElementById("playImg");
            if (playImg) playImg.src = "/images/pause_icon.svg";
            const audio = document.getElementById("audio");
            if (audio) audio.play().catch(() => {});
        };
    }

    // ── Step 3: Start button → countdown → play ──────────────────────
    if (startBtn) {
        startBtn.onclick = async () => {
            startBtn.disabled      = true;
            startBtn.style.opacity = "0.5";
            startBtn.style.cursor  = "not-allowed";

            resetScore();
            await startCountdownAndPlay(selectedMicId);
        };
    }

    // ── Song ends → stop mic → show final score ───────────────────────
    if (audioEl) {
        audioEl.onended = () => {
            console.log("Audio ended - calling window.stopMic()");
            window.stopMic();
        };
    }
});