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
// used for testing
const USE_SCORE_BAR = true;
// ─── Tier Constants ───────────────────────────────────────────────────────────

const TIERS = [
    { label: "PERFECT", maxSemitones: 0.5, points: 30, color: "#FFD700" },
    { label: "GOOD", maxSemitones: 1.0, points: 20, color: "#4BA7FF" },
    { label: "CLOSE",maxSemitones: 2.0, points: 10, color: "#6bff8e" },
    { label: "MISS", maxSemitones: Infinity, points: 0, color: "#ff6b6b" },
];

const MIN_VOICED_AMP = 0.005; // RMS threshold — below this we treat user as silent

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
    el.style.top  = `calc(12% + ${jitterY}px)`;


    layer.appendChild(el);
    setTimeout(() => el.remove(), 1000);
}
// ─── Countdown ─────────────────────────────────────────────────────────
function getExpectedPitch(currentTimeSec) {
    if (!songPitchData) return 0;
    const idx = Math.round(currentTimeSec / songPitchData.hop_duration);
    return songPitchData.pitches[idx] ?? 0;
}

async function startCountdownAndPlay() {
    const overlay = document.getElementById("karaokeStartOverlay");
    const startText = document.getElementById("startText");
    const audio = document.getElementById("audio");
    const bottomBar = document.getElementById("bottomBar");
    const playPause = document.getElementById("playPause");

    overlay.style.display = "flex";

    for (let i = 3; i > 0; i--) {
        startText.textContent = i;
        await new Promise(r => setTimeout(r, 1000));
    }

    startText.textContent = "GO";
    await new Promise(r => setTimeout(r, 500));

    overlay.style.display = "none";

    if (bottomBar) bottomBar.style.pointerEvents = "auto";

    await startMic();
    playImg.src = "/images/pause_icon.svg";
    audio.play().catch(() => {});
}
// ─── Scoring Loop ─────────────────────────────────────────────────────────────

function scoringTick() {
    if (!scoringActive || !analyserNode) return;

    const audio = document.getElementById("audio");
    if (!audio || audio.paused) {
        updateScorerUI(0, 0);
        return;
    }

    const userHz = detectPitch(analyserNode);
    const expectedHz = getExpectedPitch(audio.currentTime);

    if (expectedHz <= 0) return;
    if (userHz <= 0) {
        updateScorerUI(userHz, expectedHz);
        return;
    }

    if (expectedHz > 0) {
        scoredFrames++;
        const tier = getTier(userHz, expectedHz);

        if (tier.label === "MISS") {
            consecutiveMisses++;
            if (consecutiveMisses >= 8) {
                currentCombo = 0;
            }
        } else {
            consecutiveMisses = 0;
            currentCombo++;
            if(currentCombo > maxCombo) maxCombo = currentCombo;
        }

        let multiplier = 1;
        if (currentCombo >= 50) multiplier = 2.0;
        else if (currentCombo >= 20) multiplier = 1.5;


        totalScore += Math.round(tier.points * multiplier);
        maxPossible += Math.round(TIERS[0].points * multiplier);

        // 4. Popups and UI
        if (
            currentCombo === 2 ||
            currentCombo === 5 ||
            currentCombo === 10 ||
            currentCombo === 20 ||
            currentCombo === 50
        ) {
            spawnComboPopup(currentCombo);
        }

        if (tier.label !== lastTierLabel) {
            lastTierLabel = tier.label;
            flashTier(tier);
            spawnTierPopup(tier);
        }
    }

    updateScorerUI(userHz, expectedHz);
}

function resetScore() {
    totalScore = 0;
    maxPossible = 0;
    scoredFrames = 0;
    lastTierLabel = "";
    currentCombo = 0;
    maxCombo = 0;
    consecutiveMisses = 0;
    scoreDisplay.textContent = "0";

}


export async function restartSong() {
    console.log("restartSong CALLED");

    const audio = document.getElementById("audio");
    const subtitle = document.getElementById("subtitle");
    const progress = document.getElementById("progress");
    const overlay = document.getElementById("karaokeStartOverlay");
    const startText = document.getElementById("startText");

    stopMic();
    clearInterval(scoringInterval);
    scoringActive = false;

    resetScore();

    audio.pause();
    audio.currentTime = 0;

    if (subtitle) subtitle.innerHTML = "";
    if (progress) progress.style.width = "0%";

    overlay.style.display = "flex";
    startText.textContent = "READY";

    setMicButton(false);
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
        }
        #scoreboardPanel {
            position: fixed; 
            background: rgba(123, 39, 245, 0.9);
            border:1px solid #3e007d;
            bottom: 60px;  
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
        .scoreboardRank { font-size: 1.2rem; min-width: 28px; }
        .scoreboardName { flex: 1; color: #fff; font-size: 0.9rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
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
        #pitchDisplay {
            width: 180px;
            text-align: center;
        }

        #tierDisplay {
            width: 80px;
            text-align: center;
        }

        #scoreDisplay {
            width: 90px;
            text-align: right;
        }
        #scorerPanel {
            background: rgba(0,0,0,0.75);
            border: 1px solid rgba(0,0,0);
            border-radius: 12px;
            padding: 6px 12px;
        
            backdrop-filter: blur(8px);
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

    if (USE_SCORE_BAR) {
        panel.innerHTML = `
        <div id="scoreBar">
            <div id="scoreBarFill"></div>
            <div class="rankMarker" style="left:50%"></div>
            <div class="rankMarker" style="left:60%"></div>
            <div class="rankMarker" style="left:70%"></div>
            <div class="rankMarker" style="left:80%"></div>
            <div class="rankMarker" style="left:88%"></div>
            <div class="rankMarker" style="left:95%"></div>
        </div>
        <span id="scoreDisplay">0</span>
        `;
    } else {
        panel.innerHTML = `
            <button id="micToggleBtn">🎤 Start Mic</button>
            <span id="pitchDisplay">— Hz</span>
            <span id="tierDisplay"></span>
            <span id="comboDisplay"></span>
            <span id="scoreDisplay">0</span>
        `;
    }

    const rightControls = document.getElementById("rightControls");
    if (rightControls) {
        rightControls.parentElement.insertBefore(panel, rightControls);
    } else {
        document.getElementById("bottomBar")?.appendChild(panel);
    }

    micToggleBtn = document.getElementById("micToggleBtn");
    pitchDisplay = document.getElementById("pitchDisplay");
    tierDisplay = document.getElementById("tierDisplay");
    scoreDisplay = document.getElementById("scoreDisplay");

    if (micToggleBtn) {
        micToggleBtn.onclick = toggleMic;
    }

    injectScorerStyles();
}

function updateScorerUI(userHz, expectedHz) {
    if (!scoreDisplay) return;

    if (pitchDisplay) {
        const userNote = userHz > 0 ? hzToNote(userHz) : "—";
        const expectedNote = expectedHz > 0 ? hzToNote(expectedHz) : "—";

        pitchDisplay.textContent = `You: ${userNote} | Song: ${expectedNote}`;

        const tier = getTier(userHz, expectedHz);
        pitchDisplay.style.color = expectedHz > 0 ? tier.color : "#aaa";
    }
    if (USE_SCORE_BAR) {
        const pct = maxPossible > 0 ? (totalScore / maxPossible) * 100 : 0;
        updateScoreBar(pct);
    }
    scoreDisplay.textContent = totalScore.toLocaleString();

    const comboEl = document.getElementById("comboDisplay");
  if (comboEl) {
      if (currentCombo > 1) {
          comboEl.textContent = `Combo ${currentCombo}x`;
          comboEl.style.color = currentCombo >= 50 ? "#FFD700" : currentCombo >= 20 ? "#4BA7FF" : "#6bff8e";
          comboEl.style.opacity = "1";
      } else {
          comboEl.style.opacity = "0";
      }
    }
  }

function flashTier(tier) {
    if (!tierDisplay) return;
    if (!tierDisplay || USE_SCORE_BAR) return;
    clearTimeout(tierFlashTimeout);
    tierDisplay.textContent = tier.label;
    tierDisplay.style.color = tier.color;
    tierDisplay.style.opacity = "1";

    tierFlashTimeout = setTimeout(() => {
        tierDisplay.style.opacity = "0";
    }, 600);
}

function showFinalScore() {
    const pct = maxPossible > 0 ? Math.round((totalScore / maxPossible) * 100) : 0;
    let grade, color, isRainbow = false;

    if (pct >= 95) { grade = "EX+"; color = "#FFD700"; isRainbow = true; }
    else if (pct >= 88) { grade = "S"; color = "#4BA7FF"; }
    else if (pct >= 80) { grade = "A"; color = "#6bff8e"; }
    else if (pct >= 70) { grade = "B"; color = "#f0c040"; }
    else if (pct >= 60) { grade = "C"; color = "#f0c040"; }
    else if (pct >= 50) { grade = "D"; color = "#f0c040"; }
    else { grade = "F"; color = "#ff6b6b"; }

    // Hide UI Bars
    const topBar = document.querySelector(".top-bar") || document.getElementById("topBar");
    const bottomBar = document.getElementById("bottomBar");
    if (topBar) topBar.style.display = "none";
    if (bottomBar) bottomBar.style.display = "none";

    const sub = document.getElementById("subtitle");
    if (sub) {
        const gradeStyle = isRainbow
            ? `font-size:8vw; font-weight:bold; animation: rainbowGlow 2s linear infinite; -webkit-background-clip: text; color: transparent; background-image: linear-gradient(to right, red, orange, yellow, green, blue, indigo, violet);`
            : `font-size:8vw; color:${color}; font-weight:bold;`;

        // We build the full results screen here
        sub.innerHTML = `
            <div class="results-container" style="text-align:center; background: rgba(0,0,0,0.85); padding: 40px; border-radius: 20px; backdrop-filter: blur(10px);">
                <div style="font-size:3vw; color:#fff; margin-bottom: 10px;">Final Score</div>
                <div style="font-size:8vw; color:${isRainbow ? '#FFD700' : color}; font-weight:bold; line-height:1;">${totalScore.toLocaleString()}</div>
                <div style="${gradeStyle}">Grade: ${grade}</div>
                <div style="font-size:2vw; color:#aaa; margin-bottom: 30px;">Best Combo: ${maxCombo}x</div>
                
                <div class="results-actions" style="display: flex; gap: 20px; justify-content: center;">
                    <button id="retryBtn" class="result-btn primary">Retry</button>
                    <button id="backBtn" class="result-btn secondary">Back to Songs</button>
                </div>
            </div>
        `;

        document.getElementById("retryBtn").onclick = async () => {
            isRestarting = true;

            if (topBar) topBar.style.display = "flex";
            if (bottomBar) bottomBar.style.display = "flex";

            sub.innerHTML = "";

            await restartSong();

            isRestarting = false;

            const overlay = document.getElementById("karaokeStartOverlay");
            if (overlay) overlay.style.display = "flex";
        };
        document.getElementById("backBtn").onclick = () => {
            const params = new URLSearchParams(window.location.search);
            const songId = params.get("song");

            window.location.href = `/songselection?song=${songId}`;
        };
    }
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

    if (USE_SCORE_BAR) {
        style.textContent = `
        @keyframes rainbowGlow {
            0% { filter: hue-rotate(0deg); }
            100% { filter: hue-rotate(360deg); }
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
        }
    
        .result-btn.secondary {
            background: rgba(255,255,255,0.1);
            color: white;
            border: 2px solid rgba(255,255,255,0.2);
        }
    
        .result-btn:hover {
            transform: scale(1.05);
        }
    
        .result-btn.primary:hover { background: #3a8ee6; }
        .result-btn.secondary:hover { background: rgba(255,255,255,0.2); }
    
        .results-container {
            animation: fadeInScale 0.5s ease-out forwards;
        }
    
        @keyframes fadeInScale {
            from { opacity: 0; transform: scale(0.9); }
            to { opacity: 1; transform: scale(1); }
        }
        #scorerPanel {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 0 12px;
        }

        #scoreBar {
            position: relative;
            width: 200px;
            height: 10px;
            background: #222;
            border-radius: 5px;
            overflow: hidden;
        }

        #scoreBarFill {
            position: absolute;
            left: 0;
            top: 0;
            height: 100%;
            width: 100%;
            background: linear-gradient(
                to right,
                #ff6b6b 0%,
                #f0c040 25%,
                #6bff8e 50%,
                #4BA7FF 75%,
                #FFD700 100%
            );
            transition: width 0.2s linear;
        }

        .rankMarker {
            position: absolute;
            top: 0;
            width: 2px;
            height: 100%;
            background: white;
            opacity: 0.6;
        }
        
        #comboDisplay {
            font-size: 1rem;
            font-weight: bold;
            min-width: 60px;
            text-align: center;
            opacity: 0;
            transition: opacity 1.5s ease;
        }
        `;
    } else {
        style.textContent = `
            #scorerPanel {
                display: flex;
                align-items: center;
                gap: 12px;
                padding: 0 12px;
            }

            #tierDisplay {
                font-weight: bold;
                opacity: 0;
                transition: opacity 0.3s;
            }
            
            #comboDisplay {
                font-size: 1rem;
                font-weight: bold;
                min-width: 60px;
                text-align: center;
                opacity: 0;
                transition: opacity 1.5s ease;
            }
        `;
    }

    document.head.appendChild(style);
}
// ─── Score Bar ───────────────────────────────────
function updateScoreBar(pct) {
    const fill = document.getElementById("scoreBarFill");
    if (!fill) return;

    fill.style.width = pct + "%";

    // Handle Colors and Rainbow Class
    if (pct >= 95) {
        fill.style.backgroundColor = ""; // Clear static color for animation
        fill.classList.add("tier-ex-plus");
    } else {
        fill.classList.remove("tier-ex-plus");
        if (pct >= 88) fill.style.backgroundColor = "#4BA7FF"; // S
        else if (pct >= 80) fill.style.backgroundColor = "#6bff8e"; // A
        else if (pct >= 70) fill.style.backgroundColor = "#f0c040"; // B
        else fill.style.backgroundColor = "#ff6b6b"; // F/C/D
    }
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

    const startBtn = document.getElementById("startKaraokeBtn");
    const overlay  = document.getElementById("karaokeStartOverlay");
    const audioEl  = document.getElementById("audio");
    const bottomBar = document.getElementById("bottomBar");
    const playPause = document.getElementById("playPause");


    overlay.style.display = "flex";
    if (bottomBar) bottomBar.style.pointerEvents = "none";

    if (startBtn) {
        startBtn.onclick = async () => {
            resetScore();
            await startCountdownAndPlay();
        };
    }
    if (audioEl) {
        audioEl.onended = () => {
            console.log("Audio ended - calling window.stopMic()");
            window.stopMic();
        };
    }

});