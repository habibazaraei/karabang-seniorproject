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

let totalScore      = 0;   // accumulated points
let maxPossible     = 0;   // total possible points if every frame was Perfect
let scoredFrames    = 0;

// For tier flash display
let lastTierLabel   = "";
let tierFlashTimeout = null;


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

/**
 * Returns the matched tier object based on how close userHz is to targetHz.
 * Returns the MISS tier if either is 0 or too far apart.
 */
function getTier(userHz, targetHz) {
    if (userHz <= 0 || targetHz <= 0) return TIERS[3]; // MISS

    const semitones = Math.abs(hzToMidi(userHz) - hzToMidi(targetHz));

    for (const tier of TIERS) {
        if (semitones <= tier.maxSemitones) return tier;
    }
    return TIERS[3]; // MISS
}

function getExpectedPitch(currentTimeSec) {
    if (!songPitchData) return 0;
    const idx = Math.round(currentTimeSec / songPitchData.hop_duration);
    return songPitchData.pitches[idx] ?? 0;
}


// ─── Scoring Loop ─────────────────────────────────────────────────────────────

function scoringTick() {
    if (!scoringActive || !analyserNode) return;

    const userHz     = detectPitch(analyserNode);
    const expectedHz = getExpectedPitch(audio.currentTime);

    if (expectedHz > 0) {
        scoredFrames++;
        maxPossible += TIERS[0].points; // 300 pts per frame if perfect

        const tier = getTier(userHz, expectedHz);
        totalScore += tier.points;

        // Flash tier label if it changed
        if (tier.label !== lastTierLabel) {
            lastTierLabel = tier.label;
            flashTier(tier);
        }
    }

    updateScorerUI(userHz, expectedHz);
}

function getScoreDisplay() {
    return totalScore.toLocaleString();
}

function resetScore() {
    totalScore   = 0;
    maxPossible  = 0;
    scoredFrames = 0;
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
}

function toggleMic() {
    if (scoringActive) {
        stopMic();
    } else {
        resetScore();
        startMic();
    }
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

/** Flashes the tier label (PERFECT, GOOD, CLOSE, MISS) briefly on screen */
function flashTier(tier) {
    if (!tierDisplay) return;

    clearTimeout(tierFlashTimeout);
    tierDisplay.textContent  = tier.label;
    tierDisplay.style.color  = tier.color;
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
            <div style="font-size:4vw;color:${color};">Grade: ${grade} </div>
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

function injectScorerStyles() {
    const style = document.createElement("style");
    style.textContent = `
        #scorerPanel {
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

    const params = new URLSearchParams(window.location.search);
    const songId = parseInt(params.get("song"));

    fetch("/api/songs")
        .then(r => r.json())
        .then(data => {
            const song = data.find(s => s.id === songId);
            if (song) loadSongPitches(song.pitchesPath);
        });

    const audioEl = document.getElementById("audio");
    if (audioEl) {
        audioEl.addEventListener("ended", () => {
            if (scoringActive) stopMic();
        });
    }
});