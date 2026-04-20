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

// ─── Constants ────────────────────────────────────────────────────────────────

const SEMITONE_TOLERANCE = 1.0;   // ±1 semitone = "on pitch"
const SCORE_PER_FRAME    = 10;    // points awarded for each on-pitch frame
const PENALTY_PER_FRAME  = 0;     // points deducted for off-pitch (keep 0 to avoid frustration)
const MIN_VOICED_AMP     = 0.01;  // RMS threshold — below this we treat user as silent

// ─── State ────────────────────────────────────────────────────────────────────

let songPitchData   = null;   // { hop_duration, pitches[] } loaded from JSON
let micStream       = null;   // MediaStream from getUserMedia
let audioCtx        = null;   // AudioContext for mic analysis
let analyserNode    = null;
let micSourceNode   = null;
let scoringActive   = false;
let scoringInterval = null;

let totalScore      = 0;
let maxScore        = 0;
let scoredFrames    = 0;


// ─── UI Elements (injected by initScorerUI) ───────────────────────────────────

let scoreDisplay    = null;   // shows "Score: 87%"
let pitchDisplay    = null;   // shows live detected pitch
let micToggleBtn    = null;   // Start / Stop mic button


// ─── Pitch Detection (Autocorrelation) ────────────────────────────────────────

/**
 * Detects the fundamental frequency (Hz) of the audio in the analyser buffer.
 * Returns 0 if the signal is too quiet (user not singing).
 *
 * @param {AnalyserNode} analyser
 * @returns {number} frequency in Hz, or 0
 */
function detectPitch(analyser) {
    const bufferSize = analyser.fftSize;
    const buffer = new Float32Array(bufferSize);
    analyser.getFloatTimeDomainData(buffer);

    // Check RMS amplitude — skip silent frames
    let rms = 0;
    for (let i = 0; i < bufferSize; i++) rms += buffer[i] * buffer[i];
    rms = Math.sqrt(rms / bufferSize);
    if (rms < MIN_VOICED_AMP) return 0;

    // Autocorrelation to find the period
    const sampleRate = audioCtx.sampleRate;
    const minPeriod  = Math.floor(sampleRate / 1200); // ~1200 Hz max
    const maxPeriod  = Math.floor(sampleRate / 60);   // ~60 Hz min

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

/**
 * Converts Hz to MIDI note number (continuous, not integer).
 * Middle A (440 Hz) = MIDI 69.
 */
function hzToMidi(hz) {
    return 12 * Math.log2(hz / 440) + 69;
}

/**
 * Returns true if userHz is within SEMITONE_TOLERANCE of targetHz.
 * Comparison is done in semitone (MIDI) space so tolerance is perceptually even.
 */
function isOnPitch(userHz, targetHz) {
    if (userHz <= 0 || targetHz <= 0) return false;
    return Math.abs(hzToMidi(userHz) - hzToMidi(targetHz)) <= SEMITONE_TOLERANCE;
}

/**
 * Looks up the expected song pitch at the given playback time (seconds).
 * Returns 0 if the song has no voiced pitch there (instrumental section etc.)
 */
function getExpectedPitch(currentTimeSec) {
    if (!songPitchData) return 0;
    const idx = Math.round(currentTimeSec / songPitchData.hop_duration);
    return songPitchData.pitches[idx] ?? 0;
}


// ─── Scoring Loop ─────────────────────────────────────────────────────────────

/**
 * Called every ~50ms while scoring is active.
 * Detects mic pitch, compares to song, updates score & UI.
 */
function scoringTick() {
    if (!scoringActive || !analyserNode) return;

    const userHz     = detectPitch(analyserNode);
    const expectedHz = getExpectedPitch(audio.currentTime);

    // Only score when the song actually has a voiced note
    if (expectedHz > 0) {
        maxScore += SCORE_PER_FRAME;
        scoredFrames++;

        if (isOnPitch(userHz, expectedHz)) {
            totalScore += SCORE_PER_FRAME;
        } else {
            totalScore = Math.max(0, totalScore - PENALTY_PER_FRAME);
        }
    }

    updateScorerUI(userHz, expectedHz);
}

/** Returns the current accuracy percentage (0–100). */
function getScorePercent() {
    if (maxScore === 0) return 0;
    return Math.round((totalScore / maxScore) * 100);
}

/** Resets all score counters. */
function resetScore() {
    totalScore   = 0;
    maxScore     = 0;
    scoredFrames = 0;
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
        // Note: do NOT connect analyserNode to audioCtx.destination
        // — that would feed the mic back through the speakers.

        scoringActive  = true;
        scoringInterval = setInterval(scoringTick, 50);   // 20 Hz update rate

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
    console.log("[KaraokeScorer] Mic stopped. Final score:", getScorePercent() + "%");
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

/**
 * Call this after you know which song is playing.
 * Pass in the pitchesPath from your /api/songs response.
 */
async function loadSongPitches(pitchesPath) {
    if (!pitchesPath) {
        console.warn("[KaraokeScorer] No pitchesPath for this song — scoring disabled.");
        songPitchData = null;
        return;
    }
    try {
        const res  = await fetch(pitchesPath);
        songPitchData = await res.json();
        console.log(`[KaraokeScorer] Loaded ${songPitchData.pitches.length} pitch frames.`);
    } catch (err) {
        console.error("[KaraokeScorer] Failed to load pitch data:", err);
        songPitchData = null;
    }
}


// ─── UI ───────────────────────────────────────────────────────────────────────

function initScorerUI() {
    // Create a scorer panel and inject it into the bottom bar
    const panel = document.createElement("div");
    panel.id = "scorerPanel";
    panel.innerHTML = `
        <button id="micToggleBtn" title="Toggle microphone for scoring">🎤 Start Mic</button>
        <span id="pitchDisplay" title="Your pitch vs expected pitch">— Hz</span>
        <span id="scoreDisplay">Score: —</span>
    `;

    // Insert the panel into the existing bottom bar, before the volume area
    const rightControls = document.getElementById("rightControls");
    if (rightControls) {
        rightControls.parentElement.insertBefore(panel, rightControls);
    } else {
        document.getElementById("bottomBar")?.appendChild(panel);
    }

    micToggleBtn  = document.getElementById("micToggleBtn");
    pitchDisplay  = document.getElementById("pitchDisplay");
    scoreDisplay  = document.getElementById("scoreDisplay");

    micToggleBtn.onclick = toggleMic;

    injectScorerStyles();
}

function updateScorerUI(userHz, expectedHz) {
    if (!pitchDisplay || !scoreDisplay) return;

    const userNote     = userHz     > 0 ? hzToNote(userHz)     : "—";
    const expectedNote = expectedHz > 0 ? hzToNote(expectedHz) : "—";
    const onPitch      = isOnPitch(userHz, expectedHz);

    pitchDisplay.textContent = `You: ${userNote}  |  Song: ${expectedNote}`;
    pitchDisplay.style.color = expectedHz > 0
        ? (onPitch ? "#4BA7FF" : "#ff6b6b")
        : "#aaa";

    scoreDisplay.textContent = `Score: ${getScorePercent()}%`;
}

function showFinalScore() {
    const pct = getScorePercent();
    let grade, color;
    if      (pct >= 90) { grade = "S"; color = "#FFD700"; }
    else if (pct >= 75) { grade = "A"; color = "#4BA7FF"; }
    else if (pct >= 60) { grade = "B"; color = "#6bff8e"; }
    else if (pct >= 45) { grade = "C"; color = "#f0c040"; }
    else                { grade = "D"; color = "#ff6b6b"; }

    // Reuse the subtitle element for the result overlay
    const sub = document.getElementById("subtitle");
    if (sub) {
        sub.innerHTML = `
            <div style="font-size:3vw;color:#fff;">Final Score</div>
            <div style="font-size:8vw;color:${color};font-weight:bold;">${pct}%</div>
            <div style="font-size:5vw;color:${color};">Grade: ${grade}</div>
        `;
        setTimeout(() => { sub.innerHTML = ""; }, 4000);
    }
}

/** Converts Hz to a human-readable note name like "A4" or "C#5". */
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
        #scoreDisplay {
            font-size: 0.9rem;
            font-weight: bold;
            color: #fff;
            min-width: 80px;
            text-align: right;
        }
    `;
    document.head.appendChild(style);
}


// ─── Hook into existing MusicPlayer.js flow ───────────────────────────────────

// Wait for the DOM, then init UI and hook into the song fetch
window.addEventListener("DOMContentLoaded", () => {
    initScorerUI();

    // Patch the existing song fetch so we also load pitch data for the song
    const params = new URLSearchParams(window.location.search);
    const songId = parseInt(params.get("song"));

    fetch("/api/songs")
        .then(r => r.json())
        .then(data => {
            const song = data.find(s => s.id === songId);
            if (song) loadSongPitches(song.pitchesPath);
        });

    // Stop mic automatically when song ends
    const audioEl = document.getElementById("audio");
    if (audioEl) {
        audioEl.addEventListener("ended", () => {
            if (scoringActive) stopMic();
        });
    }
});
