/**
 * KaraokeScorer.js
 * ----------------
 * Captures microphone input, detects the user's sung pitch in real-time,
 * compares it against the pre-extracted song pitch data, and produces a score.
 *
 * Supports Solo and Duet mode (two external mics on one system).
 *
 * How to use when adding new songs:
 *   * Open up the Terminal
 *   * Run py extract_pitches.py --folder ./target/classes/static/audio
 *   * Wait
 *
 * @author Tyler R
 */

import { db, auth, doc, setDoc, getDoc, getDocs, collection, onAuthStateChanged } from '/js/firebase.js';

// ─── Tier Constants ───────────────────────────────────────────────────────────

const TIERS = [
    { label: "PERFECT", maxSemitones: 0.5, points: 30, color: "#FFD700" },
    { label: "GOOD", maxSemitones: 1.0, points: 20, color: "#4BA7FF" },
    { label: "CLOSE", maxSemitones: 2.0, points: 10, color: "#6bff8e" },
    { label: "MISS",    maxSemitones: Infinity, points: 0,  color: "#ff6b6b" },
];

const MIN_VOICED_AMP = 0.005;

// ─── Mode Detection ───────────────────────────────────────────────────────────

const params = new URLSearchParams(window.location.search);
const currentSongId = parseInt(params.get("song"));
const isDuet = params.get("mode") === "duet";

// ─── Shared Audio Context ─────────────────────────────────────────────────────

let audioCtx = null;

// ─── Player 1 State ───────────────────────────────────────────────────────────

let micStream = null;
let analyserNode = null;
let micSourceNode = null;

let totalScore = 0;
let maxPossible = 0;
let scoredFrames = 0;
let currentCombo = 0;
let maxCombo = 0;
let consecutiveMisses = 0;
let lastTierLabel = "";
let tierFlashTimeout = null;

// ─── Player 2 State (duet only) ───────────────────────────────────────────────

let micStream2 = null;
let analyserNode2 = null;
let micSourceNode2 = null;

let totalScore2 = 0;
let maxPossible2 = 0;
let currentCombo2 = 0;
let maxCombo2 = 0;
let consecutiveMisses2 = 0;
let lastTierLabel2 = "";
let tierFlashTimeout2 = null;

// ─── Scoring Control ──────────────────────────────────────────────────────────

let scoringActive = false;
let scoringInterval = null;

// ─── Song Pitch Data ──────────────────────────────────────────────────────────

let songPitchData = null;

// ─── Auth ─────────────────────────────────────────────────────────────────────

let currentUser = null;
onAuthStateChanged(auth, user => { currentUser = user; });

// ─── UI Element References (solo mode) ────────────────────────────────────────

let micToggleBtn = null;
let scoreDisplay = null;
let pitchDisplay = null;
let tierDisplay = null;


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
    const minPeriod = Math.floor(sampleRate / 1200);
    const maxPeriod = Math.floor(sampleRate / 60);

    let bestCorr = -1;
    let bestPeriod = -1;

    for (let period = minPeriod; period <= maxPeriod; period++) {
        let corr = 0;
        for (let i = 0; i < bufferSize - period; i++) {
            corr += buffer[i] * buffer[i + period];
        }
        if (corr > bestCorr) {
            bestCorr = corr;
            bestPeriod = period;
        }
    }

    if (bestPeriod === -1) return 0;
    return sampleRate / bestPeriod;
}


// ─── Pitch Helpers ────────────────────────────────────────────────────────────

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

function hzToNote(hz) {
    if (hz <= 0) return "—";
    const noteNames = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
    const midi = Math.round(hzToMidi(hz));
    const octave = Math.floor(midi / 12) - 1;
    return `${noteNames[midi % 12]}${octave}`;
}


// ─── Scoring Loop ─────────────────────────────────────────────────────────────

function scoringTick() {
    if (!scoringActive) return;

    const audio = document.getElementById("audio");
    const expectedHz = getExpectedPitch(audio.currentTime);

    // — Player 1 —
    if (analyserNode) {
        const userHz = detectPitch(analyserNode);

        if (expectedHz > 0) {
            scoredFrames++;
            maxPossible += TIERS[0].points;

            const tier = getTier(userHz, expectedHz);
            totalScore += tier.points;

            if (tier.label === "MISS") {
                consecutiveMisses++;
                if (consecutiveMisses >= 8) currentCombo = 0;
            } else {
                consecutiveMisses = 0;
                currentCombo++;
                if (currentCombo > maxCombo) maxCombo = currentCombo;
            }

            if (tier.label !== lastTierLabel) {
                lastTierLabel = tier.label;
                if (isDuet) flashTierDuet(tier, 1);
                else flashTier(tier);
            }
        }

        if (isDuet) updateDuetUI(1, userHz, expectedHz);
        else updateScorerUI(userHz, expectedHz);
    }

    // — Player 2 (duet only) —
    if (isDuet && analyserNode2) {
        const userHz2 = detectPitch(analyserNode2);

        if (expectedHz > 0) {
            maxPossible2 += TIERS[0].points;

            const tier2 = getTier(userHz2, expectedHz);
            totalScore2 += tier2.points;

            if (tier2.label === "MISS") {
                consecutiveMisses2++;
                if (consecutiveMisses2 >= 8) currentCombo2 = 0;
            } else {
                consecutiveMisses2 = 0;
                currentCombo2++;
                if (currentCombo2 > maxCombo2) maxCombo2 = currentCombo2;
            }

            if (tier2.label !== lastTierLabel2) {
                lastTierLabel2 = tier2.label;
                flashTierDuet(tier2, 2);
            }
        }

        updateDuetUI(2, userHz2, expectedHz);
    }
}

function resetScore() {
    totalScore = 0; maxPossible = 0; scoredFrames = 0;
    currentCombo = 0; maxCombo = 0; consecutiveMisses = 0;
    lastTierLabel = "";

    totalScore2 = 0; maxPossible2 = 0;
    currentCombo2 = 0; maxCombo2 = 0; consecutiveMisses2 = 0;
    lastTierLabel2 = "";
}


// ─── Microphone Setup / Teardown ──────────────────────────────────────────────

async function startMic(deviceId = null, deviceId2 = null) {
    try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();

        // Player 1
        const constraints1 = deviceId
            ? { audio: { deviceId: { exact: deviceId } } }
            : { audio: true, video: false };

        micStream = await navigator.mediaDevices.getUserMedia(constraints1);
        analyserNode = audioCtx.createAnalyser();
        analyserNode.fftSize = 2048;
        micSourceNode = audioCtx.createMediaStreamSource(micStream);
        micSourceNode.connect(analyserNode);

        // Player 2 (duet only)
        if (isDuet && deviceId2) {
            micStream2 = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: deviceId2 } } });
            analyserNode2 = audioCtx.createAnalyser();
            analyserNode2.fftSize = 2048;
            micSourceNode2 = audioCtx.createMediaStreamSource(micStream2);
            micSourceNode2.connect(analyserNode2);
        }

        scoringActive = true;
        scoringInterval = setInterval(scoringTick, 50);

        if (micToggleBtn) micToggleBtn.textContent = "🎤 Stop";
        console.log("[KaraokeScorer] Mic(s) started.");
    } catch (err) {
        console.error("[KaraokeScorer] Mic access denied:", err);
        alert("Microphone access is required for scoring. Please allow mic access and try again.");
    }
}

function stopMic() {
    scoringActive = false;
    clearInterval(scoringInterval);

    if (micSourceNode) { micSourceNode.disconnect();  micSourceNode  = null; }
    if (analyserNode) { analyserNode.disconnect();   analyserNode   = null; }
    if (micStream) { micStream.getTracks().forEach(t => t.stop()); micStream = null; }

    if (micSourceNode2) { micSourceNode2.disconnect(); micSourceNode2 = null; }
    if (analyserNode2) { analyserNode2.disconnect();  analyserNode2  = null; }
    if (micStream2) { micStream2.getTracks().forEach(t => t.stop()); micStream2 = null; }

    if (audioCtx) { audioCtx.close(); audioCtx = null; }

    if (micToggleBtn) micToggleBtn.textContent = isDuet ? "🎤 Start Mics" : "🎤 Start Mic";
    console.log("[KaraokeScorer] Mic(s) stopped.");

    showFinalScore();
    saveScoreToFirebase();
}

function toggleMic() {
    if (scoringActive) {
        stopMic();
    } else {
        resetScore();
        if (isDuet) {
            openDuetMicPicker();
        } else {
            startMic();
        }
    }
}


// ─── Duet Mic Picker ──────────────────────────────────────────────────────────

async function openDuetMicPicker() {
    // Request permission first so device labels are visible
    await navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => {});

    const devices = await navigator.mediaDevices.enumerateDevices();
    const mics = devices.filter(d => d.kind === "audioinput");

    const existing = document.getElementById("duetMicPickerModal");
    if (existing) existing.remove();

    const modal = document.createElement("div");
    modal.id = "duetMicPickerModal";
    modal.style.cssText = `
        position:fixed; top:0; left:0; width:100%; height:100%;
        background:rgba(0,0,0,0.7); z-index:10000;
        display:flex; align-items:center; justify-content:center;
    `;

    const micOptions = mics.map((m, i) =>
        `<option value="${m.deviceId}">${m.label || "Microphone " + (i + 1)}</option>`
    ).join("");

    modal.innerHTML = `
        <div style="background:rgba(123,39,245,0.95); border:1px solid #3e007d; border-radius:16px;
                    padding:32px; color:#fff; min-width:340px; text-align:center;">
            <div style="font-size:1.2rem; font-weight:bold; margin-bottom:24px;">🎤🎤 Select Microphones</div>

            <div style="margin-bottom:16px; text-align:left;">
                <label style="font-size:0.85rem; color:#4BA7FF; display:block; margin-bottom:6px;">
                    🔵 Player 1 Mic
                </label>
                <select id="p1MicSelect" style="width:100%; padding:8px; border-radius:8px;
                        background:#2a2a3e; color:#fff; border:1px solid #4BA7FF;">
                    ${micOptions}
                </select>
            </div>

            <div style="margin-bottom:24px; text-align:left;">
                <label style="font-size:0.85rem; color:#ff6b6b; display:block; margin-bottom:6px;">
                    🔴 Player 2 Mic
                </label>
                <select id="p2MicSelect" style="width:100%; padding:8px; border-radius:8px;
                        background:#2a2a3e; color:#fff; border:1px solid #ff6b6b;">
                    ${micOptions}
                </select>
            </div>

            <button id="startDuetBtn" style="padding:10px 28px; border-radius:12px;
                    border:1px solid #FFD700; background:rgba(255,215,0,0.2);
                    color:#fff; font-size:1rem; cursor:pointer; margin-right:8px;">
                Start Duet
            </button>
            <button id="cancelDuetBtn" style="padding:10px 20px; border-radius:12px;
                    border:none; background:none; color:#aaa; cursor:pointer; font-size:0.9rem;">
                Cancel
            </button>
        </div>
    `;

    document.body.appendChild(modal);

    // Default P2 to second mic if available
    const p2Select = document.getElementById("p2MicSelect");
    if (mics.length > 1) p2Select.selectedIndex = 1;

    document.getElementById("startDuetBtn").onclick = () => {
        const p1Id = document.getElementById("p1MicSelect").value;
        const p2Id = document.getElementById("p2MicSelect").value;
        modal.remove();
        startMic(p1Id, p2Id);
    };

    document.getElementById("cancelDuetBtn").onclick = () => modal.remove();
}


// ─── Firebase Score Saving ────────────────────────────────────────────────────

async function saveScoreToFirebase() {
    if (!currentUser) {
        console.warn("[KaraokeScorer] Not logged in — score not saved.");
        return;
    }

    // In duet mode, save the higher of the two scores
    const scoreToSave = isDuet ? Math.max(totalScore, totalScore2) : totalScore;
    if (scoreToSave === 0) return;

    const scoreRef = doc(db, "scores", String(currentSongId), "entries", currentUser.uid);

    try {
        const existing = await getDoc(scoreRef);
        if (!existing.exists() || scoreToSave > existing.data().score) {
            await setDoc(scoreRef, {
                score: scoreToSave,
                username: currentUser.displayName || currentUser.email || "Anonymous",
                userId: currentUser.uid,
                songId: currentSongId,
                timestamp: new Date().toISOString(),
            });
            console.log("[KaraokeScorer] New high score saved:", scoreToSave);
        } else {
            console.log("[KaraokeScorer] Not a new high score.");
        }
    } catch (err) {
        console.error("[KaraokeScorer] Failed to save score:", err);
    }
}

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


// ─── Scoreboard ───────────────────────────────────────────────────────────────

function initScoreboard() {
    const dropdownMenu = document.getElementById("dropdownMenu");
    if (dropdownMenu) {
        const scoreboardBtn = document.createElement("button");
        scoreboardBtn.id = "scoreboardBtn";
        scoreboardBtn.textContent = "Scoreboard";
        scoreboardBtn.onclick = (e) => { e.stopPropagation(); openScoreboard(); };
        dropdownMenu.appendChild(scoreboardBtn);
    }

    const modal = document.createElement("div");
    modal.id = "scoreboardModal";
    modal.innerHTML = `
        <div id="scoreboardPanel">
            <div id="scoreboardHeader">
                <span>🏆 Top Scores</span>
                <button id="closeScoreboardBtn">✕</button>
            </div>
            <div id="scoreboardSongTitle"></div>
            <div id="scoreboardList"><div class="scoreboardLoading">Loading...</div></div>
            <div id="scoreboardYourBest"></div>
        </div>
    `;
    document.body.appendChild(modal);

    document.getElementById("closeScoreboardBtn").onclick = closeScoreboard;
    modal.onclick = (e) => { if (e.target === modal) closeScoreboard(); };

    injectScoreboardStyles();
}

async function openScoreboard() {
    const modal = document.getElementById("scoreboardModal");
    if (!modal) return;

    document.getElementById("scoreboardList").innerHTML = `<div class="scoreboardLoading">Loading...</div>`;
    document.getElementById("scoreboardYourBest").textContent = "";
    modal.style.display = "flex";

    try {
        const res = await fetch("/api/songs");
        const data = await res.json();
        const song = data.find(s => s.id === currentSongId);
        document.getElementById("scoreboardSongTitle").textContent = song ? `${song.title} — ${song.artist}` : "";
    } catch (_) {}

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

function injectScoreboardStyles() {
    const style = document.createElement("style");
    style.textContent = `
        #scoreboardBtn { width:100%; background:none; border:none; color:#fff; font-size:0.9rem; padding:8px 12px; text-align:left; cursor:pointer; border-radius:6px; }
        #scoreboardBtn:hover { background:rgba(75,167,255,0.2); }
        #scoreboardModal { display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.6); z-index:9999; align-items:center; justify-content:center; }
        #scoreboardPanel { background:rgba(123,39,245,0.75); border:1px solid #3e007d; border-radius:16px; padding:24px; min-width:320px; max-width:420px; width:90%; }
        #scoreboardHeader { display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; font-size:1.2rem; font-weight:bold; color:#fff; }
        #closeScoreboardBtn { background:none; border:none; color:#aaa; font-size:1.1rem; cursor:pointer; }
        #closeScoreboardBtn:hover { color:#fff; }
        #scoreboardSongTitle { font-size:0.85rem; color:#4BA7FF; margin-bottom:16px; }
        .scoreboardEntry { display:flex; align-items:center; gap:12px; padding:10px 12px; border-radius:8px; margin-bottom:6px; background:rgba(255,255,255,0.05); }
        .scoreboardYou { background:rgba(75,167,255,0.15); border:1px solid #4BA7FF; }
        .scoreboardRank { font-size:1.2rem; min-width:28px; }
        .scoreboardName { flex:1; color:#fff; font-size:0.9rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .scoreboardScore { font-weight:bold; color:#FFD700; font-size:1rem; }
        .scoreboardLoading, .scoreboardEmpty { text-align:center; color:#aaa; padding:20px; font-size:0.9rem; }
        #scoreboardYourBest { margin-top:14px; text-align:center; font-size:0.85rem; color:#aaa; }
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
        const res = await fetch(pitchesPath);
        songPitchData = await res.json();
        console.log(`[KaraokeScorer] Loaded ${songPitchData.pitches.length} pitch frames.`);
    } catch (err) {
        console.error("[KaraokeScorer] Failed to load pitch data:", err);
        songPitchData = null;
    }
}


// ─── UI Init ─────────────────────────────────────────────────────────────────

function initScorerUI() {
    const panel = document.createElement("div");
    panel.id = "scorerPanel";

    if (isDuet) {
        panel.innerHTML = `
            <button id="micToggleBtn" title="Toggle microphones">🎤 Start Mics</button>

            <div id="p1Panel" style="display:flex; align-items:center; gap:8px;">
                <span style="color:#4BA7FF; font-weight:bold; font-size:0.8rem;">P1</span>
                <span id="pitchDisplay1" style="font-size:0.8rem; color:#aaa; min-width:100px; text-align:center;">—</span>
                <span id="tierDisplay1" class="tierDisplayDuet" style="color:#4BA7FF;"></span>
                <span id="comboDisplay1" class="comboDuet" style="color:#4BA7FF;"></span>
                <span id="scoreDisplay1" class="scoreDuet" style="color:#4BA7FF;">0</span>
            </div>

            <div style="width:1px; background:#3e007d; height:24px; flex-shrink:0;"></div>

            <div id="p2Panel" style="display:flex; align-items:center; gap:8px;">
                <span style="color:#ff6b6b; font-weight:bold; font-size:0.8rem;">P2</span>
                <span id="pitchDisplay2" style="font-size:0.8rem; color:#aaa; min-width:100px; text-align:center;">—</span>
                <span id="tierDisplay2" class="tierDisplayDuet" style="color:#ff6b6b;"></span>
                <span id="comboDisplay2" class="comboDuet" style="color:#ff6b6b;"></span>
                <span id="scoreDisplay2" class="scoreDuet" style="color:#ff6b6b;">0</span>
            </div>
        `;
    } else {
        panel.innerHTML = `
            <button id="micToggleBtn" title="Toggle microphone for scoring">🎤 Start Mic</button>
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
    micToggleBtn.onclick = toggleMic;

    if (!isDuet) {
        pitchDisplay = document.getElementById("pitchDisplay");
        tierDisplay  = document.getElementById("tierDisplay");
        scoreDisplay = document.getElementById("scoreDisplay");
    }

    injectScorerStyles();
}


// ─── Solo UI Updates ──────────────────────────────────────────────────────────

function updateScorerUI(userHz, expectedHz) {
    if (!pitchDisplay || !scoreDisplay) return;

    pitchDisplay.textContent = `You: ${hzToNote(userHz)} | Song: ${hzToNote(expectedHz)}`;
    pitchDisplay.style.color = expectedHz > 0 ? getTier(userHz, expectedHz).color : "#aaa";
    scoreDisplay.textContent = totalScore.toLocaleString();

    const comboEl = document.getElementById("comboDisplay");
    if (comboEl) {
        if (currentCombo > 1) {
            comboEl.textContent   = `Combo ${currentCombo}x`;
            comboEl.style.color   = currentCombo >= 50 ? "#FFD700" : currentCombo >= 20 ? "#4BA7FF" : "#6bff8e";
            comboEl.style.opacity = "1";
        } else {
            comboEl.style.opacity = "0";
        }
    }
}

function flashTier(tier) {
    if (!tierDisplay) return;
    clearTimeout(tierFlashTimeout);
    tierDisplay.textContent = tier.label;
    tierDisplay.style.color = tier.color;
    tierDisplay.style.opacity = "1";
    tierFlashTimeout = setTimeout(() => { tierDisplay.style.opacity = "0"; }, 600);
}


// ─── Duet UI Updates ──────────────────────────────────────────────────────────

function updateDuetUI(player, userHz, expectedHz) {
    const pitch = document.getElementById(`pitchDisplay${player}`);
    const score = document.getElementById(`scoreDisplay${player}`);
    const combo = document.getElementById(`comboDisplay${player}`);

    if (!pitch || !score) return;

    pitch.textContent = `${hzToNote(userHz)} | ${hzToNote(expectedHz)}`;
    pitch.style.color = expectedHz > 0 ? getTier(userHz, expectedHz).color : "#aaa";

    const s = player === 1 ? totalScore   : totalScore2;
    const c = player === 1 ? currentCombo : currentCombo2;

    score.textContent = s.toLocaleString();

    if (combo) {
        if (c > 1) {
            combo.textContent = `${c}x`;
            combo.style.opacity = "1";
        } else {
            combo.style.opacity = "0";
        }
    }
}

function flashTierDuet(tier, player) {
    const el = document.getElementById(`tierDisplay${player}`);
    if (!el) return;

    if (player === 1) clearTimeout(tierFlashTimeout);
    else clearTimeout(tierFlashTimeout2);

    el.textContent = tier.label;
    el.style.color = tier.color;
    el.style.opacity = "1";

    const t = setTimeout(() => { el.style.opacity = "0"; }, 600);
    if (player === 1) tierFlashTimeout  = t;
    else tierFlashTimeout2 = t;
}


// ─── Final Score Screen ───────────────────────────────────────────────────────

function getGrade(pct) {
    if (pct >= 95) return { grade: "EX+", color: "#FFD700" };
    if (pct >= 88) return { grade: "S",   color: "#4BA7FF" };
    if (pct >= 80) return { grade: "A",   color: "#6bff8e" };
    if (pct >= 70) return { grade: "B",   color: "#f0c040" };
    if (pct >= 60) return { grade: "C",   color: "#f0c040" };
    if (pct >= 50) return { grade: "D",   color: "#f0c040" };
    return { grade: "F",   color: "#ff6b6b" };
}

function showFinalScore() {
    const sub = document.getElementById("subtitle");
    if (!sub) return;

    if (isDuet) {
        const pct1 = maxPossible  > 0 ? Math.round((totalScore  / maxPossible)  * 100) : 0;
        const pct2 = maxPossible2 > 0 ? Math.round((totalScore2 / maxPossible2) * 100) : 0;
        const { grade: grade1, color: color1 } = getGrade(pct1);
        const { grade: grade2, color: color2 } = getGrade(pct2);

        const winner = totalScore >= totalScore2 ? 1 : 2;
        const winnerColor = winner === 1 ? "#4BA7FF" : "#ff6b6b";
        const winnerLabel = winner === 1 ? "🔵 Player 1 Wins!" : "🔴 Player 2 Wins!";

        sub.innerHTML = `
            <div style="display:flex; gap:6vw; justify-content:center; align-items:center;">

                <div style="text-align:center;">
                    <div style="font-size:1.5vw; color:#4BA7FF; font-weight:bold; margin-bottom:6px;">🔵 Player 1</div>
                    <div style="font-size:5vw; color:#4BA7FF; font-weight:bold;">${totalScore.toLocaleString()}</div>
                    <div style="font-size:2vw; color:${color1};">Grade: ${grade1}</div>
                    <div style="font-size:1.2vw; color:#aaa;">Best Combo: ${maxCombo}x</div>
                </div>

                <div style="text-align:center;">
                    <div style="font-size:2.5vw; color:${winnerColor}; font-weight:bold;">${winnerLabel}</div>
                </div>

                <div style="text-align:center;">
                    <div style="font-size:1.5vw; color:#ff6b6b; font-weight:bold; margin-bottom:6px;">🔴 Player 2</div>
                    <div style="font-size:5vw; color:#ff6b6b; font-weight:bold;">${totalScore2.toLocaleString()}</div>
                    <div style="font-size:2vw; color:${color2};">Grade: ${grade2}</div>
                    <div style="font-size:1.2vw; color:#aaa;">Best Combo: ${maxCombo2}x</div>
                </div>

            </div>
        `;
    } else {
        const pct = maxPossible > 0 ? Math.round((totalScore / maxPossible) * 100) : 0;
        const { grade, color } = getGrade(pct);

        sub.innerHTML = `
            <div style="font-size:3vw; color:#fff;">Final Score</div>
            <div style="font-size:8vw; color:${color}; font-weight:bold;">${totalScore.toLocaleString()}</div>
            <div style="font-size:4vw; color:${color};">Grade: ${grade}</div>
            <div style="font-size:2vw; color:#aaa;">Best Combo: ${maxCombo}x</div>
        `;
    }

    setTimeout(() => { sub.innerHTML = ""; }, 5000);
}


// ─── Styles ───────────────────────────────────────────────────────────────────

function injectScorerStyles() {
    const style = document.createElement("style");
    style.textContent = `
        #scorerPanel {
            background: rgba(123, 39, 245, 0.75);
            border: 1px solid #3e007d;
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
        #micToggleBtn:hover { background: rgba(75, 167, 255, 0.45); }

        /* Solo */
        #pitchDisplay { font-size:0.8rem; color:#aaa; min-width:160px; text-align:center; }
        #tierDisplay { font-size:1rem; font-weight:bold; min-width:80px; text-align:center; transition:opacity 0.3s; opacity:0; }
        #scoreDisplay { font-size:1.1rem; font-weight:bold; color:#fff; min-width:80px; text-align:right; }
        #comboDisplay { font-size:1rem; font-weight:bold; min-width:60px; text-align:center; opacity:0; transition:opacity 1.5s ease; }

        /* Duet */
        .tierDisplayDuet { font-size:0.85rem; font-weight:bold; min-width:60px; text-align:center; transition:opacity 0.3s; opacity:0; }
        .comboDuet { font-size:0.85rem; font-weight:bold; min-width:40px; text-align:center; opacity:0; transition:opacity 1.5s ease; }
        .scoreDuet { font-size:1rem; font-weight:bold; min-width:70px; text-align:right; }
    `;
    document.head.appendChild(style);
}


// ─── Boot ─────────────────────────────────────────────────────────────────────

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