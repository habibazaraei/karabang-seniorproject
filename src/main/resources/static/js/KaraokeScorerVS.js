/**
 * KaraokeScorerVS.js
 * ---------------
 * 2-player battle mode scoring engine.
 * - Detects two separate microphone inputs simultaneously
 * - Scores each player independently using the same tier system
 * - Player 1's score saves to Firebase (logged in user)
 * - Player 2 is a "guest" account (score shown but not saved)
 * - Shows winner screen at the end
 *
 * @author Tyler
 */

import { db, auth, doc, setDoc, getDoc, onAuthStateChanged } from '/js/firebase.js';

// ─── Tier Constants ───────────────────────────────────────────────────────────

const TIERS = [
    { label: "PERFECT", maxSemitones: 0.5, points: 30, color: "#FFD700" },
    { label: "GOOD", maxSemitones: 1.0, points: 20, color: "#4BA7FF" },
    { label: "CLOSE",maxSemitones: 2.0, points: 10, color: "#6bff8e" },
    { label: "MISS", maxSemitones: Infinity, points: 0, color: "#ff6b6b" },
];

const TARGET_SCORE = 100000;
const MIN_VOICED_AMP = 0.005; // RMS threshold — below this we treat user as silent
// ─── Ranks Constants ───────────────────────────────────────────────────────────
const Ranks = [
    { label: "EX+", min: 95, color: null },      // Handled by rainbow logic
    { label: "A",   min: 88, color: "#e82020" }, // Red
    { label: "B",   min: 80, color: "#3a24e5" }, // Blue
    { label: "C",   min: 70, color: "#4ff4be" }, // Cyan
    { label: "D",   min: 60, color: "#3fe538" }, // Green
    { label: "F",   min: 0,  color: "#79471B" }, // Brown
];
// ─── State ─────────────────────────────────────────────────────────────────────
const params      = new URLSearchParams(window.location.search);
const currentSongId = parseInt(params.get("song"));

let songPitchData = null;
let currentUser   = null;
onAuthStateChanged(auth, u => { currentUser = u; });

// Player state
const players = [
    { id: 1, stream: null, audioCtx: null, analyser: null, source: null,
      score: 0, combo: 0, maxCombo: 0, misses: 0, lastTier: "" },
    { id: 2, stream: null, audioCtx: null, analyser: null, source: null,
      score: 0, combo: 0, maxCombo: 0, misses: 0, lastTier: "" },
];

let scoringActive   = false;
let scoringInterval = null;
let selectedMics    = { p1: null, p2: null };


// ─── Pitch Detection ───────────────────────────────────────────────────────────
function hzToMidi(hz) {
    return 12 * Math.log2(hz / 440) + 69;
}

function detectPitch(analyser, audioCtx) {
    if (!analyser || !audioCtx) return 0;
    const buf = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(buf);

    let rms = 0;
    for (let i = 0; i < buf.length; i++) rms += buf[i] * buf[i];
    rms = Math.sqrt(rms / buf.length);
    if (rms < MIN_VOICED_AMP) return 0;

    const sr  = audioCtx.sampleRate;
    const min = Math.floor(sr / 1200);
    const max = Math.floor(sr / 60);

    let bestCorr = -1, bestPeriod = -1;
    for (let p = min; p <= max; p++) {
        let c = 0;
        for (let i = 0; i < buf.length - p; i++) c += buf[i] * buf[i + p];
        if (c > bestCorr) { bestCorr = c; bestPeriod = p; }
    }
    return bestPeriod === -1 ? 0 : sr / bestPeriod;
}

function getTier(userHz, targetHz) {
    if (userHz <= 0 || targetHz <= 0) return TIERS[3];
    const semi = Math.abs(hzToMidi(userHz) - hzToMidi(targetHz));
    return TIERS.find(t => semi <= t.maxSemitones) ?? TIERS[3];
}

function getExpectedPitch(timeSec) {
    if (!songPitchData) return 0;
    const idx = Math.round(timeSec / songPitchData.hop_duration);
    return songPitchData.pitches[idx] ?? 0;
}

function hzToNote(hz) {
    if (hz <= 0) return "—";
    const names = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
    const midi  = Math.round(hzToMidi(hz));
    return `${names[midi % 12]}${Math.floor(midi / 12) - 1}`;
}


// ─── Scoring Tick ──────────────────────────────────────────────────────────────
function scoringTick() {
    if (!scoringActive) return;
    const audio = document.getElementById("audio");
    if (!audio || audio.paused) return;

    const expectedHz = getExpectedPitch(audio.currentTime);
    if (expectedHz <= 0) return;

    players.forEach((p, idx) => {
        const userHz = detectPitch(p.analyser, p.audioCtx);

        if (userHz > 0) {
            const tier = getTier(userHz, expectedHz);

            if (tier.label === "MISS") {
                p.misses++;
                if (p.misses >= 12) p.combo = 0;
            } else {
                p.misses = 0;
                p.combo++;
                if (p.combo > p.maxCombo) p.maxCombo = p.combo;
            }

            // Multiplier
            let mult = 1;
            if      (p.combo >= 50) mult = 10;
            else if (p.combo >= 25) mult = 5;
            else if (p.combo >= 10) mult = 3;
            else if (p.combo >= 2)  mult = 2;

            p.score += Math.round(tier.points * mult);

            // Tier flash
            if (tier.label !== p.lastTier) {
                p.lastTier = tier.label;
                spawnTierPopup(tier, idx === 0 ? "top" : "bottom");
            }
        } else {
            p.misses++;
        }

        updatePlayerUI(p, expectedHz, userHz);
    });
}

function resetAll() {
    players.forEach(p => {
        p.score = 0; p.combo = 0; p.maxCombo = 0;
        p.misses = 0; p.lastTier = "";
    });
    updateBarFill("p1BarFill", 0);
    updateBarFill("p2BarFill", 0);
    document.getElementById("p1Score").textContent = "0";
    document.getElementById("p2Score").textContent = "0";
}


// ─── UI Updates ────────────────────────────────────────────────────────────────
function updatePlayerUI(p, expectedHz, userHz) {
    const prefix  = p.id === 1 ? "p1" : "p2";
    const scoreEl = document.getElementById(`${prefix}Score`);
    const pitchEl = document.getElementById(`${prefix}PitchDisplay`);
    const fillEl  = document.getElementById(`${prefix}BarFill`);

    if (scoreEl) scoreEl.textContent = p.score.toLocaleString();

    if (pitchEl) {
        const uNote = hzToNote(userHz);
        const eNote = hzToNote(expectedHz);
        pitchEl.textContent = `You: ${uNote} | Song: ${eNote}`;
        const tier = getTier(userHz, expectedHz);
        pitchEl.style.color = expectedHz > 0 ? tier.color : "#aaa";
    }

    const pct = Math.min((p.score / TARGET_SCORE) * 100, 100);
    updateBarFill(`${prefix}BarFill`, pct);
}

function updateBarFill(id, pct) {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.width = Math.max(0, Math.min(pct, 100)) + "%";
}

function spawnTierPopup(tier, zone) {
    const layer = document.getElementById("tierFloatLayer");
    if (!layer) return;
    const el = document.createElement("div");
    el.className = "tierFloat";
    el.textContent = tier.label;
    el.style.color = tier.color;
    el.style.left   = (zone === "top" ? 15 : 85) + "%";
    el.style.top    = zone === "top" ? "25%" : "75%";
    layer.appendChild(el);
    setTimeout(() => el.remove(), 1000);
}


// ─── Mic Setup ─────────────────────────────────────────────────────────────────

/** Enumerate audio input devices and populate the select dropdowns */
async function populateMicSelects() {
    const p1Sel = document.getElementById("p1MicSelect");
    const p2Sel = document.getElementById("p2MicSelect");

    try {
        // Request permission first so labels are available
        const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        tempStream.getTracks().forEach(t => t.stop());
    } catch (err) {
        console.error("[Battle] Mic permission denied:", err);
        alert("Microphone access was denied. Please allow microphone access and refresh.");
        return; // Stop here — no point enumerating without permission
    }

    const devices = await navigator.mediaDevices.enumerateDevices();
    const mics    = devices.filter(d => d.kind === "audioinput");

    console.log("[Battle] Found mics:", mics); // Add this to see what's detected

    if (mics.length === 0) {
        alert("No microphones detected. Please connect a microphone and refresh.");
        return;
    }

    [p1Sel, p2Sel].forEach(sel => { sel.innerHTML = ""; });

    mics.forEach((mic, i) => {
        const label = mic.label || `Microphone ${i + 1}`;
        [p1Sel, p2Sel].forEach(sel => {
            const opt = document.createElement("option");
            opt.value = mic.deviceId;
            opt.textContent = label;
            sel.appendChild(opt);
        });
    });

    if (mics.length >= 2) p2Sel.value = mics[1].deviceId;
}

async function startMicForPlayer(player, deviceId) {
    try {
        const constraints = { audio: { deviceId: { exact: deviceId } } };
        player.stream   = await navigator.mediaDevices.getUserMedia(constraints);
        player.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        player.analyser = player.audioCtx.createAnalyser();
        player.analyser.fftSize = 2048;
        player.source   = player.audioCtx.createMediaStreamSource(player.stream);
        player.source.connect(player.analyser);
        console.log(`[Battle] P${player.id} mic started.`);
    } catch (err) {
        console.error(`[Battle] P${player.id} mic error:`, err);
        alert(`Could not access Player ${player.id}'s microphone. Please check connections.`);
    }
}

function stopAllMics() {
    players.forEach(p => {
        if (p.stream)   { p.stream.getTracks().forEach(t => t.stop()); p.stream = null; }
        if (p.audioCtx) { p.audioCtx.close(); p.audioCtx = null; }
        p.analyser = null; p.source = null;
    });
}


// ─── Firebase ──────────────────────────────────────────────────────────────────
async function saveP1Score(score) {
    if (!currentUser || score === 0) return;
    const ref = doc(db, "scores", String(currentSongId), "entries", currentUser.uid);
    try {
        const existing = await getDoc(ref);
        if (!existing.exists() || score > existing.data().score) {
            await setDoc(ref, {
                score,
                username:  currentUser.displayName || currentUser.email || "Player 1",
                userId:    currentUser.uid,
                songId:    currentSongId,
                timestamp: new Date().toISOString(),
                mode:      "battle",
            });
            console.log("[Battle] P1 score saved:", score);
        }
    } catch (err) {
        console.error("[Battle] Failed to save score:", err);
    }
}


// ─── Winner Screen ─────────────────────────────────────────────────────────────
function showWinner() {
    const p1 = players[0];
    const p2 = players[1];

    document.getElementById("wP1Score").textContent = p1.score.toLocaleString();
    document.getElementById("wP2Score").textContent = p2.score.toLocaleString();

    let winnerName, winnerColor;
    if (p1.score === p2.score) {
        winnerName  = "TIE!";
        winnerColor = "#FFD700";
    } else if (p1.score > p2.score) {
        winnerName  = "PLAYER 1 WINS!";
        winnerColor = "#4BA7FF";
        document.getElementById("p1ScoreCard").style.border = "2px solid #4BA7FF";
    } else {
        winnerName  = "PLAYER 2 WINS!";
        winnerColor = "#ff6b6b";
        document.getElementById("p2ScoreCard").style.border = "2px solid #ff6b6b";
    }

    document.getElementById("winnerName").textContent  = winnerName;
    document.getElementById("winnerName").style.color  = winnerColor;

    const overlay = document.getElementById("winnerOverlay");
    overlay.style.display = "flex";

    // Save P1 score to Firebase
    saveP1Score(p1.score);
}


// ─── Countdown ─────────────────────────────────────────────────────────────────
async function startCountdownAndPlay() {
    const overlay   = document.getElementById("karaokeStartOverlay");
    const startText = document.getElementById("startText");
    const audio     = document.getElementById("audio");

    overlay.style.display = "flex";

    for (let i = 3; i > 0; i--) {
        startText.textContent = i;
        await new Promise(r => setTimeout(r, 1000));
    }

    startText.textContent = "GO!";
    await new Promise(r => setTimeout(r, 500));
    overlay.style.display = "none";

    resetAll();
    scoringActive   = true;
    scoringInterval = setInterval(scoringTick, 50);

    audio.currentTime = 0;
    audio.play().catch(() => {});
}


// ─── Song + Pitch Loading ──────────────────────────────────────────────────────
async function loadSongPitches(path) {
    if (!path) { console.warn("[Battle] No pitchesPath."); return; }
    try {
        const res     = await fetch(path);
        songPitchData = await res.json();
        console.log(`[Battle] Loaded ${songPitchData.pitches.length} pitch frames.`);
    } catch (err) {
        console.error("[Battle] Failed to load pitches:", err);
    }
}


// ─── Boot ──────────────────────────────────────────────────────────────────────
window.addEventListener("DOMContentLoaded", async () => {

    // Load song data
    fetch("/api/songs")
        .then(r => r.json())
        .then(data => {
            const song = data.find(s => s.id === currentSongId);
            if (song) {
                document.getElementById("songTitle").textContent = `${song.title} — ${song.artist}`;
                loadSongPitches(song.pitchesPath);
            }
        });

    // Populate mic selectors
    await populateMicSelects();

    // ── Confirm mics → show countdown ──────────────────────
    document.getElementById("confirmMicsBtn").onclick = async () => {
        selectedMics.p1 = document.getElementById("p1MicSelect").value;
        selectedMics.p2 = document.getElementById("p2MicSelect").value;

        document.getElementById("micSelectOverlay").style.display = "none";

        // Start both mics
        await Promise.all([
            startMicForPlayer(players[0], selectedMics.p1),
            startMicForPlayer(players[1], selectedMics.p2),
        ]);

        // Show start overlay
        const overlay = document.getElementById("karaokeStartOverlay");
        overlay.style.display = "flex";
        document.getElementById("startText").textContent = "Battle Mode";
    };

    // ── Start Battle button ────────────────────────────────
    document.getElementById("startKaraokeBtn").onclick = async () => {
        await startCountdownAndPlay();
    };

    // ── Song ends → stop scoring → show winner ─────────────
    const audioEl = document.getElementById("audio");
    if (audioEl) {
        audioEl.addEventListener("ended", () => {
            scoringActive = false;
            clearInterval(scoringInterval);
            stopAllMics();
            setTimeout(showWinner, 800);
        });
    }

    // ── Go back ────────────────────────────────────────────
    document.getElementById("goBack").onclick = () => {
        window.location.href = "/songselection";
    };

    // ── Retry ──────────────────────────────────────────────
    document.getElementById("retryBattleBtn").onclick = async () => {
        document.getElementById("winnerOverlay").style.display = "none";
        document.getElementById("p1ScoreCard").style.border = "none";
        document.getElementById("p2ScoreCard").style.border = "none";

        stopAllMics();
        scoringActive = false;
        clearInterval(scoringInterval);

        resetAll();

        // Re-start mics and countdown
        await Promise.all([
            startMicForPlayer(players[0], selectedMics.p1),
            startMicForPlayer(players[1], selectedMics.p2),
        ]);

        await startCountdownAndPlay();
    };

    // ── Back to songs ──────────────────────────────────────
    document.getElementById("backFromBattleBtn").onclick = () => {
        window.location.href = "/songselection";
    };

});
