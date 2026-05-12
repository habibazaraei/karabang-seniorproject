/**
 * KaraokeScorerVS.js
 * --------------------
 * 2-player battle mode scoring engine.
 * Full feature parity with KaraokeScorer.js:
 *   - Score bar with rank gradient + EX+ rainbow
 *   - Combo popups, tier floats
 *   - Final score screen with animated rank bar + grade badge
 *   - Scoreboard (P1 scores saved to Firebase)
 *   - restartSong() hooked to window.KaraokeScorer
 *
 * VS-specific additions:
 *   - Two separate mic inputs (P1 / P2)
 *   - Independent per-player scoring + combo
 *   - Winner overlay at song end
 *   - P1 score saved to Firebase; P2 is guest
 *
 * @author Tyler Radisch
 */

import { db, auth, doc, setDoc, getDoc, getDocs, collection, onAuthStateChanged } from '/js/firebase.js';

// ─── Tier / Rank Constants ─────────────────────────────────────────────────────
const TIERS = [
      { label: "PERFECT",maxSemitones: 10.0, points: 50,  color: "#FFD700" },
     { label: "GOOD", maxSemitones: 15.0, points: 20,  color: "#4BA7FF" },
     { label: "CLOSE", maxSemitones: 20.0, points: 10,  color: "#6bff8e" },
     { label: "MISS", maxSemitones: Infinity, points: 0, color: "#ff6b6b" },
];

const Ranks = [
    { label: "EX+", min: 95, color: null },
    { label: "A", min: 88, color: "#e82020" },
    { label: "B", min: 80, color: "#3a24e5" },
    { label: "C", min: 70, color: "#4ff4be" },
    { label: "D", min: 60, color: "#3fe538" },
    { label: "F", min: 0,  color: "#79471B" },
];

const TARGET_SCORE    = 100000;
const MIN_VOICED_AMP  = 0.002;

// ─── State ─────────────────────────────────────────────────────────────────────
const params = new URLSearchParams(window.location.search);
const currentSongId = parseInt(params.get("song"));

let songPitchData = null;
let currentUser = null;
let isRestarting = false;
let selectedMics = { p1: null, p2: null };

onAuthStateChanged(auth, u => { currentUser = u; });

// Per-player state
const players = [
    { id: 1, stream: null, audioCtx: null, analyser: null, source: null,
        score: 0, displayedScore: 0, combo: 0, maxCombo: 0,
        misses: 0, lastTier: "", scoreRollInterval: null,
        color: "#4BA7FF" },
    { id: 2, stream: null, audioCtx: null, analyser: null, source: null,
        score: 0, displayedScore: 0, combo: 0, maxCombo: 0,
        misses: 0, lastTier: "", scoreRollInterval: null,
        color: "#ff6b6b" },
];

let scoringActive   = false;
let scoringInterval = null;

// ─── Pitch Helpers ─────────────────────────────────────────────────────────────
function hzToMidi(hz) {
    return 12 * Math.log2(hz / 440) + 69;
}

function hzToNote(hz) {
    if (hz <= 0) return "—";
    const names = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
    const midi  = Math.round(hzToMidi(hz));
    return `${names[midi % 12]}${Math.floor(midi / 12) - 1}`;
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

              let multiplier = 0;
                    if (currentCombo >= 50) multiplier = 10;
                    else if (currentCombo >= 25) multiplier = 4;
                    else if (currentCombo >= 10) multiplier = 2;
                    else if (currentCombo >= 5) multiplier = 1.5;
                    else if (currentCombo >= 2) multiplier = 0.75;


            p.score += Math.round(tier.points * mult);

            // Combo milestone popups
            if ([2, 5, 10, 25, 50, 100, 200].includes(p.combo)) {
                spawnComboPopup(p.combo, idx === 0 ? "left" : "right");
            }

            // Tier popup on change
            if (tier.label !== p.lastTier) {
                p.lastTier = tier.label;
                spawnTierPopup(tier, idx === 0 ? "left" : "right");
            }
        } else {
            p.misses++;
        }

        updatePlayerUI(p, expectedHz, userHz);
    });
}

function resetAll() {
    players.forEach(p => {
        p.score = 0; p.displayedScore = 0;
        p.combo = 0; p.maxCombo = 0;
        p.misses = 0; p.lastTier = "";
        if (p.scoreRollInterval) { clearInterval(p.scoreRollInterval); p.scoreRollInterval = null; }
    });
    updateBarFill("p1BarFill", 0);
    updateBarFill("p2BarFill", 0);
    const s1 = document.getElementById("p1Score");
    const s2 = document.getElementById("p2Score");
    if (s1) s1.textContent = "0";
    if (s2) s2.textContent = "0";
    resetScoreBar("p1ScoreBarFill", "p1ScoreBar");
    resetScoreBar("p2ScoreBarFill", "p2ScoreBar");
}

// ─── UI Updates ────────────────────────────────────────────────────────────────
function updatePlayerUI(p, expectedHz, userHz) {
    const prefix = p.id === 1 ? "p1" : "p2";

    // Score bar
    const pct = Math.min((p.score / TARGET_SCORE) * 100, 100);
    updateBarFill(`${prefix}BarFill`, pct);
    updateScoreBar(pct, `${prefix}ScoreBar`, `${prefix}ScoreBarFill`);

    // Rolled score counter
    const scoreEl = document.getElementById(`${prefix}Score`);
    if (scoreEl && p.score !== p.displayedScore) {
        if (p.scoreRollInterval) { clearInterval(p.scoreRollInterval); p.scoreRollInterval = null; }
        const start     = p.displayedScore;
        const end       = p.score;
        const diff      = end - start;
        const startTime = performance.now();
        p.scoreRollInterval = setInterval(() => {
            const elapsed  = performance.now() - startTime;
            const progress = Math.min(elapsed / 300, 1);
            const eased    = 1 - Math.pow(1 - progress, 2);
            p.displayedScore = Math.round(start + diff * eased);
            scoreEl.textContent = p.displayedScore.toLocaleString();
            if (progress >= 1) {
                p.displayedScore = end;
                scoreEl.textContent = end.toLocaleString();
                clearInterval(p.scoreRollInterval);
                p.scoreRollInterval = null;
            }
        }, 16);
    }
}

function updateBarFill(id, pct) {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.width = Math.max(0, Math.min(pct, 100)) + "%";
}

// ─── Score Bar (rank gradient, same as KaraokeScorer) ─────────────────────────
function updateScoreBar(pct, barId = "scoreBar", fillId = "scoreBarFill") {
    const bar = document.getElementById(barId);
    const fill = document.getElementById(fillId);
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
        const cur = sortedRanks[i];
        const next = sortedRanks[i + 1];

        gradientParts.push(`${cur.color} ${cur.min}%`);
        gradientParts.push(`${cur.color} ${next ? next.min : 100}%`);
    }

    const rankGradient = `linear-gradient(to right, ${gradientParts.join(", ")})`;
    const totalWidth = bar.offsetWidth;

    fill.style.backgroundImage =
        `${glassShine}, ${stripes}, ${rankGradient}`;
    fill.style.backgroundSize =
        `100% 100%, 20px 20px, ${totalWidth}px 100%`;

    fill.style.animation = "barberSpin 1.6s linear infinite";
}
function resetScoreBar(fillId = "p1ScoreBarFill", barId = "p1ScoreBar") {
    const fill = document.getElementById(fillId);
    if (!fill) return;
    fill.style.transition = "none";
    fill.style.width = "0%";
    void fill.offsetWidth;
    fill.style.transition = "width 0.2s linear";
}

// ─── Tier / Combo Floats ───────────────────────────────────────────────────────

function spawnTierPopup(tier, side) {
    const layer = document.getElementById("tierFloatLayer");
    if (!layer) return;
    const el = document.createElement("div");
    el.className   = "tierFloat";
    el.textContent = tier.label;
    el.style.color = tier.color;

    if (side === "left") {
        // P1 — top of screen, right half
        el.style.left = `${50 + Math.random() * 30}%`;
        el.style.top  = `${18 + Math.random() * 15}%`;
    } else {
        // P2 — bottom of screen, right half
        el.style.left = `${50 + Math.random() * 30}%`;
        el.style.top  = `${75 + Math.random() * 15}%`;
    }

    layer.appendChild(el);
    setTimeout(() => el.remove(), 1200);
}

function spawnComboPopup(combo, side) {
    const layer = document.getElementById("tierFloatLayer");
    if (!layer) return;
    const el = document.createElement("div");
    el.className   = "tierFloat";
    el.textContent = `${combo}x COMBO`;

    if      (combo >= 50) el.style.color = "#FFD700";
    else if (combo >= 20) el.style.color = "#9d3bf8";
    else if (combo >= 10) el.style.color = "#215fe5";
    else if (combo >= 5)  el.style.color = "#4BA7FF";
    else                  el.style.color = "#6bff8e";

    if (side === "left") {
        // P1 — top of screen, right side
        el.style.left = `${90 + Math.random() * 15}%`;
        el.style.top  = `${18}%`;
    } else {
        // P2 — bottom of screen, right side
        el.style.left = `${90 + Math.random() * 15}%`;
        el.style.top  = `${82}%`;
    }

    layer.appendChild(el);
    setTimeout(() => el.remove(), 1000);
}

// ─── Mic Setup ─────────────────────────────────────────────────────────────────
async function populateMicSelects() {
    const p1Sel = document.getElementById("p1MicSelect");
    const p2Sel = document.getElementById("p2MicSelect");
    if (!p1Sel || !p2Sel) return;

    try {
        const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        tempStream.getTracks().forEach(t => t.stop());
    } catch (err) {
        console.error("[Battle] Mic permission denied:", err);
        alert("Microphone access was denied. Please allow microphone access and refresh.");
        return;
    }

    const devices = await navigator.mediaDevices.enumerateDevices();
    const mics    = devices.filter(d => d.kind === "audioinput");

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
        player.stream   = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: deviceId } } });
        player.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        player.analyser = player.audioCtx.createAnalyser();
        player.analyser.fftSize = 2048;
        player.source   = player.audioCtx.createMediaStreamSource(player.stream);
        player.source.connect(player.analyser);
        console.log(`[Battle] P${player.id} mic started.`);
    } catch (err) {
        console.error(`[Battle] P${player.id} mic error:`, err);
        alert(`Could not access Player ${player.id}'s microphone.`);
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
        }
    } catch (err) {
        console.error("[Battle] Failed to save score:", err);
    }
}

async function loadTopScores() {
    try {
        const snap   = await getDocs(collection(db, "scores", String(currentSongId), "entries"));
        const scores = snap.docs.map(d => d.data());
        scores.sort((a, b) => b.score - a.score);
        return scores.slice(0, 5);
    } catch (err) {
        console.error("[Battle] Failed to load scores:", err);
        return [];
    }
}

// ─── Scoreboard ────────────────────────────────────────────────────────────────
function initScoreboard() {
    const dropdownMenu = document.getElementById("dropdownMenu");
    if (dropdownMenu) {
        const btn = document.createElement("button");
        btn.id          = "scoreboardBtn";
        btn.textContent = "Scoreboard";
        btn.onclick     = (e) => { e.stopPropagation(); openScoreboard(); };
        dropdownMenu.appendChild(btn);
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
        </div>`;
    document.body.appendChild(modal);
    document.getElementById("closeScoreboardBtn").onclick = closeScoreboard;
    modal.onclick = (e) => { if (e.target === modal) closeScoreboard(); };

    const openBtn = document.getElementById("scoreboardOpenBtn");
    if (openBtn) openBtn.onclick = (e) => { e.stopPropagation(); openScoreboard(); };
}

async function openScoreboard() {
    const modal = document.getElementById("scoreboardModal");
    if (!modal) return;
    document.getElementById("scoreboardList").innerHTML = `<div class="scoreboardLoading">Loading...</div>`;
    document.getElementById("scoreboardYourBest").textContent = "";
    modal.style.display = "flex";

    try {
        const res  = await fetch("/api/songs");
        const data = await res.json();
        const song = data.find(s => s.id === currentSongId);
        document.getElementById("scoreboardSongTitle").textContent = song ? `${song.title} — ${song.artist}` : "";
    } catch (_) {}

    const scores  = await loadTopScores();
    const list    = document.getElementById("scoreboardList");
    const medals  = ["🥇","🥈","🥉","4️⃣","5️⃣"];

    if (scores.length === 0) {
        list.innerHTML = `<div class="scoreboardEmpty">No scores yet — be the first!</div>`;
    } else {
        list.innerHTML = scores.map((s, i) => `
            <div class="scoreboardEntry ${currentUser && s.userId === currentUser.uid ? "scoreboardYou" : ""}">
                <span class="scoreboardRank">${medals[i]}</span>
                <span class="scoreboardName">${s.username}</span>
                <span class="scoreboardScore">${s.score.toLocaleString()}</span>
            </div>`).join("");
    }

    if (currentUser) {
        try {
            const mySnap = await getDoc(doc(db, "scores", String(currentSongId), "entries", currentUser.uid));
            document.getElementById("scoreboardYourBest").textContent =
                mySnap.exists() ? `Your best: ${mySnap.data().score.toLocaleString()}` : "";
        } catch (_) {}
    } else {
        document.getElementById("scoreboardYourBest").textContent = "Log in to save your scores!";
    }
}

function closeScoreboard() {
    const modal = document.getElementById("scoreboardModal");
    if (modal) modal.style.display = "none";
}

// ─── Winner Overlay ────────────────────────────────────────────────────────────
function showWinner() {
    const p1 = players[0], p2 = players[1];

    // Determine winner
    let winnerName, winnerColor, winnerScore, winnerGrade;
    if (p1.score === p2.score) {
        winnerName  = "TIE!";
        winnerColor = "#FFD700";
        winnerScore = p1.score;
    } else if (p1.score > p2.score) {
        winnerName  = "PLAYER 1 WINS!";
        winnerColor = "#4BA7FF";
        winnerScore = p1.score;
        const c = document.getElementById("p1ScoreCard");
        if (c) c.style.border = "2px solid #4BA7FF";
    } else {
        winnerName  = "PLAYER 2 WINS!";
        winnerColor = "#ff6b6b";
        winnerScore = p2.score;
        const c = document.getElementById("p2ScoreCard");
        if (c) c.style.border = "2px solid #ff6b6b";
    }

    const pct = Math.min(Math.round((winnerScore / TARGET_SCORE) * 100), 100);
    let grade;
    if      (pct >= 95) grade = "EX+";
    else if (pct >= 88) grade = "A";
    else if (pct >= 80) grade = "B";
    else if (pct >= 70) grade = "C";
    else if (pct >= 60) grade = "D";
    else                grade = "F";

    const gradeImgMap = {
        "EX+": "/images/TierEX.png",
        "A":   "/images/TierA.png",
        "B":   "/images/TierB.png",
        "C":   "/images/TierC.png",
        "D":   "/images/TierD.png",
        "F":   "/images/TierF.png",
    };

    document.getElementById("winnerName").textContent  = winnerName;
    document.getElementById("winnerName").style.color  = winnerColor;
    document.getElementById("winnerGradeImg").src       = gradeImgMap[grade];
    document.getElementById("winnerGradeImg").className =
        `winner-grade-img${grade === "EX+" ? " ex-grade" : ""}`;

    // Animate scores counting up
    if (p1.score >= p2.score) {

        animateWinnerScore("wP2Score", p2.score);

        setTimeout(() => {
            animateWinnerScore("wP1Score", p1.score);
        }, 250);

    } else {

        animateWinnerScore("wP1Score", p1.score);

        setTimeout(() => {
            animateWinnerScore("wP2Score", p2.score);
        }, 250);
    }

    document.getElementById("winnerOverlay").style.display = "flex";

    // After scores count up, animate the bar
    const p1Pct = Math.min((p1.score / TARGET_SCORE) * 100, 100);
    const p2Pct = Math.min((p2.score / TARGET_SCORE) * 100, 100);

    const winnerPct = Math.max(p1Pct, p2Pct);
    const loserPct  = Math.min(p1Pct, p2Pct);

    setTimeout(() => {
        animateWinnerRankBar(winnerPct, loserPct);
    }, 1300);

    saveP1Score(p1.score);
}

function animateWinnerScore(elId, target) {
    const el = document.getElementById(elId);
    if (!el) return;
    const duration = 1200, startTime = performance.now();
    function update(now) {
        const progress = Math.min((now - startTime) / duration, 1);
        const eased    = 1 - Math.pow(1 - progress, 3);
        el.textContent = Math.floor(target * eased).toLocaleString();
        if (progress < 1) requestAnimationFrame(update);
        else el.textContent = target.toLocaleString();
    }
    requestAnimationFrame(update);
}

// ─── Replace the existing animateWinnerRankBar function in KaraokeScorerVS.js ──
// ─── Drop-in replacement for animateWinnerRankBar in KaraokeScorerVS.js ────────
//
// VISUAL RESULT:
//   Loser bar sits ON TOP (higher z-index, full border-radius).
//   Winner bar grows from 0 → winnerPct underneath, so it appears to
//   slide out from behind the loser's right edge — fully rounded on both ends.
//
//   [ LOSER ████████████████ ]
//   [ WINNER ████████████████████████████ ]  ← slides out from under

function animateWinnerRankBar(winnerPct, loserPct) {

    const fill      = document.getElementById("winnerRankFill");
    const loserFill = document.getElementById("winnerLoserFill");
    const marker    = document.getElementById("winnerRankMarker");
    const badge     = document.getElementById("winnerGradeBadge");
    const edge      = document.getElementById("winnerEdgeGlow");

    if (!fill || !loserFill || !marker || !badge) return;

    // Remove overlap zone if it exists from a previous run
    const old = document.getElementById("winnerOverlapZone");
    if (old) old.remove();

    const p1Won       = players[0].score >= players[1].score;
    const winnerColor = p1Won ? "#3b82ff" : "#ff3b3b";
    const loserColor  = p1Won ? "#ff3b3b" : "#3b82ff";

    const safeWinnerPct = Math.min(winnerPct, 100);
    const safeLoserPct  = Math.min(loserPct,  100);

    // ── Immediately zero both fills — no flash ─────────────────────────────
    fill.style.transition      = "none";
    loserFill.style.transition = "none";
    fill.style.width      = "0%";
    loserFill.style.width = "0%";
    fill.style.left       = "0%";
    fill.style.opacity      = "1";
    loserFill.style.opacity = "1";
    void fill.offsetWidth;
    void loserFill.offsetWidth;

    marker.style.left    = "0%";
    marker.style.opacity = "0";
    if (edge) edge.style.opacity = "0";
    badge.style.transform = "scale(0.5)";
    badge.style.opacity   = "0";

    // ── Shared decorative overlays ─────────────────────────────────────────
    const glassShine = `linear-gradient(
        to bottom,
        rgba(255,255,255,0.28) 0%,
        rgba(255,255,255,0)    50%,
        rgba(0,0,0,0.15)       100%
    )`;
    const stripes = `repeating-linear-gradient(
        -45deg,
        rgba(255,255,255,0.15) 0px,
        rgba(255,255,255,0.15) 10px,
        transparent            10px,
        transparent            20px
    )`;

    // ── Loser fill — z-index 2 (on top), full border-radius ───────────────
    loserFill.style.left           = "0%";
    loserFill.style.backgroundImage = `${glassShine}, ${stripes},
        linear-gradient(to right, ${loserColor}, ${loserColor})`;
    loserFill.style.backgroundSize  = "100% 100%, 20px 20px, 100% 100%";
    loserFill.style.animation       = "barberSpin 1.6s linear infinite";
    loserFill.style.zIndex          = "2";
    loserFill.style.borderRadius    = "7px";
    loserFill.style.opacity         = "1";

    // ── Winner fill — z-index 1 (behind loser), full border-radius ────────

    fill.style.left            = "0%";
    fill.style.backgroundImage = `${glassShine}, ${stripes},
        linear-gradient(to right, ${winnerColor}, ${winnerColor})`;
    fill.style.backgroundSize  = "100% 100%, 20px 20px, 100% 100%";
    fill.style.animation       = "barberSpin 1.6s linear infinite";
    fill.style.zIndex          = "1";
    fill.style.borderRadius    = "7px";
    fill.style.opacity         = "1";

    // ── PHASE 1 — loser bar grows 0 → loserPct ────────────────────────────
    const loserDuration = 900;
    const loserStart    = performance.now();

    function loserStep(now) {
        const progress = Math.min((now - loserStart) / loserDuration, 1);
        const eased    = 1 - Math.pow(1 - progress, 2.5);
        loserFill.style.width = (eased * safeLoserPct) + "%";

        if (progress < 1) {
            requestAnimationFrame(loserStep);
        } else {
            loserFill.style.width = safeLoserPct + "%";

            // Brief pause before winner slides out
            setTimeout(() => {

                // ── PHASE 2 — winner bar grows 0 → winnerPct underneath ───
                const winnerDuration = 1100;
                const winnerStart    = performance.now();

                function winnerStep(now2) {
                    const progress2 = Math.min((now2 - winnerStart) / winnerDuration, 1);
                    const eased2    = 1 - Math.pow(1 - progress2, 2.5);
                    const current   = eased2 * safeWinnerPct;

                    fill.style.width = current + "%";

                    // Edge glow + marker only track the visible tip (beyond loser)
                    if (current >= safeLoserPct) {
                        if (edge) {
                            edge.style.left    = current + "%";
                            edge.style.opacity = "1";
                        }
                        marker.style.left    = current + "%";
                        marker.style.opacity = "1";
                    }

                    if (progress2 < 1) {
                        requestAnimationFrame(winnerStep);
                    } else {
                        fill.style.width = safeWinnerPct + "%";
                        marker.classList.add("winner-marker-bounce");

                        setTimeout(() => {
                            badge.style.transition =
                                "opacity 0.3s ease, transform 0.4s cubic-bezier(0.175,0.885,0.32,1.275)";
                            badge.style.opacity   = "1";
                            badge.style.transform = "scale(1)";
                        }, 400);
                    }
                }
                requestAnimationFrame(winnerStep);

            }, 250);
        }
    }

    requestAnimationFrame(loserStep);
}
// ─── restartSong ───────────────────────────────────────────────────────────────
export async function restartSong() {
    isRestarting = true;
    scoringActive = false;
    clearInterval(scoringInterval);
    stopAllMics();

    const audio      = document.getElementById("audio");
    const subtitle   = document.getElementById("subtitle");
    const progress   = document.getElementById("progress");
    const bottomBar  = document.getElementById("bottomBar");
    const micOverlay = document.getElementById("micSelectOverlay");

    if (audio)    { audio.pause(); audio.currentTime = 0; }
    if (subtitle) subtitle.innerHTML = "";
    if (progress) progress.style.width = "0%";

    resetAll();

    // ── Reset winner overlay bar ───────────────────────────────────────────
    const winnerFill = document.getElementById("winnerRankFill");
    const loserFill  = document.getElementById("winnerLoserFill");
    const marker     = document.getElementById("winnerRankMarker");
    const badge      = document.getElementById("winnerGradeBadge");
    const edge       = document.getElementById("winnerEdgeGlow");
    const overlap    = document.getElementById("winnerOverlapZone");

    if (winnerFill) { winnerFill.style.transition = "none"; winnerFill.style.width = "0%"; }
    if (loserFill)  { loserFill.style.transition  = "none"; loserFill.style.width  = "0%"; }
    if (marker)     { marker.style.left = "0%"; marker.style.opacity = "0"; marker.classList.remove("winner-marker-bounce"); }
    if (badge)      { badge.style.opacity = "0"; badge.style.transform = "scale(0.5)"; badge.style.transition = "none"; }
    if (edge)       { edge.style.opacity = "0"; edge.style.left = "0%"; }
    if (overlap)    overlap.remove();

    // Reset score cards border
    const p1c = document.getElementById("p1ScoreCard");
    const p2c = document.getElementById("p2ScoreCard");
    if (p1c) p1c.style.border = "none";
    if (p2c) p2c.style.border = "none";

    // Reset winner overlay score displays
    const wP1 = document.getElementById("wP1Score");
    const wP2 = document.getElementById("wP2Score");
    if (wP1) wP1.textContent = "0";
    if (wP2) wP2.textContent = "0";
    // ──────────────────────────────────────────────────────────────────────

    // Reset mic overlay UI
    const micTitle   = document.getElementById("micPanelTitle");
    const micRows    = document.querySelectorAll("#micSelectPanel .micRow");
    const confirmBtn = document.getElementById("confirmMicsBtn");
    const countdown  = document.getElementById("micCountdown");

    if (micTitle)   micTitle.style.display   = "block";
    micRows.forEach(r => r.style.display     = "flex");
    if (confirmBtn) {
        confirmBtn.style.display  = "block";
        confirmBtn.disabled       = false;
        confirmBtn.style.opacity  = "1";
    }
    if (countdown)  countdown.style.display  = "none";
    if (bottomBar)  bottomBar.style.pointerEvents = "none";
    if (micOverlay) micOverlay.style.display = "flex";

    isRestarting = false;
}
window.addEventListener("DOMContentLoaded", () => {
    window.KaraokeScorer = window.KaraokeScorer || {};
    window.KaraokeScorer.restartSong = restartSong;
});

// ─── Score Bar UI init ─────────────────────────────────────────────────────────
// The HTML already contains the score bars and rank markers with correct
// classes (p1marker / p2marker) and positions, so initScorerUI only needs
// to inject the animated fill styles.
function initScorerUI() {
    injectScorerStyles();
    injectScoreboardStyles();
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
    initScorerUI();
    initScoreboard();
    resetAll();

    const bottomBar = document.getElementById("bottomBar");
    if (bottomBar) bottomBar.style.pointerEvents = "none";

    // Load song + pitches
    fetch("/api/songs")
        .then(r => r.json())
        .then(data => {
            const song = data.find(s => s.id === currentSongId);
            if (song) {
                const titleEl = document.getElementById("songTitle");
                if (titleEl) titleEl.textContent = `${song.title} — ${song.artist}`;
                loadSongPitches(song.pitchesPath);
            }
        });

    // Populate mic dropdowns
    await populateMicSelects();

    // ── Confirm mics → countdown → play ────────────────────────────────
    document.getElementById("confirmMicsBtn").onclick = async () => {
        selectedMics.p1 = document.getElementById("p1MicSelect").value;
        selectedMics.p2 = document.getElementById("p2MicSelect").value;

        document.getElementById("micPanelTitle").style.display  = "none";
        document.querySelectorAll("#micSelectPanel .micRow").forEach(r => r.style.display = "none");
        document.getElementById("confirmMicsBtn").style.display = "none";

        const countdownEl = document.getElementById("micCountdown");
        countdownEl.style.display = "block";
        for (let i = 3; i > 0; i--) {
            countdownEl.textContent = i;
            await new Promise(r => setTimeout(r, 1000));
        }
        countdownEl.textContent = "GO!";
        await new Promise(r => setTimeout(r, 500));

        document.getElementById("micSelectOverlay").style.display = "none";

        await Promise.all([
            startMicForPlayer(players[0], selectedMics.p1),
            startMicForPlayer(players[1], selectedMics.p2),
        ]);

        resetAll();
        scoringActive   = true;
        scoringInterval = setInterval(scoringTick, 50);

        const audio = document.getElementById("audio");
        audio.currentTime = 0;
        audio.play().catch(() => {});

        const playImg = document.getElementById("playImg");
        if (playImg) playImg.src = "/images/pause_icon.svg";
        if (bottomBar) bottomBar.style.pointerEvents = "auto";
    };

    // ── Song ends → stop scoring → show winner ──────────────────────────
    const audioEl = document.getElementById("audio");
    if (audioEl) {
        audioEl.addEventListener("ended", () => {
            scoringActive = false;
            clearInterval(scoringInterval);
            stopAllMics();
            setTimeout(showWinner, 800);
        });
    }

    // ── Go back ─────────────────────────────────────────────────────────
    const goBackBtn = document.getElementById("goBack");
    if (goBackBtn) goBackBtn.onclick = () => {
        const params = new URLSearchParams(window.location.search);
        const songId = params.get("song");
        window.location.href = `/songselection?song=${songId}`;
    };
    // ── Retry ────────────────────────────────────────────────────────────
    const retryBtn = document.getElementById("retryBattleBtn");
    if (retryBtn) {
        retryBtn.onclick = async () => {
            document.getElementById("winnerOverlay").style.display = "none";
            const p1c = document.getElementById("p1ScoreCard");
            const p2c = document.getElementById("p2ScoreCard");
            if (p1c) p1c.style.border = "none";
            if (p2c) p2c.style.border = "none";
            await restartSong();
        };
    }

    // ── Back to songs ────────────────────────────────────────────────────
    const backBtn = document.getElementById("backFromBattleBtn");
    if (backBtn) backBtn.onclick = () => {
        const params = new URLSearchParams(window.location.search);
        const songId = params.get("song");
        window.location.href = `/songselection?song=${songId}`;
    };
});

// ─── Styles ────────────────────────────────────────────────────────────────────
function injectScorerStyles() {
    if (document.getElementById("vsScorerStyles")) return;
    const style = document.createElement("style");
    style.id = "vsScorerStyles";
    style.textContent = `
        @keyframes exRainbowShift {
            0%   { background-position: 0 0, 0 0, 0% 0; }
            100% { background-position: 0 0, 0 0, -300% 0; }
        }
        @keyframes barberSpin {
            0%   { background-position: 0 0, 0px 0, 0 0; }
            100% { background-position: 0 0, 40px 0, 0 0; }
        }
    `;
    document.head.appendChild(style);
}

function injectScoreboardStyles() {
    if (document.getElementById("vsScoreboardStyles")) return;
    const style = document.createElement("style");
    style.id = "vsScoreboardStyles";
    style.textContent = `
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
        #scoreboardPanel {
            position: fixed;
            top: 50%; left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(123, 39, 245, 0.9);
            border: 1px solid #3e007d;
            border-radius: 16px;
            padding: 24px;
            min-width: 320px; max-width: 420px;
            width: 90%;
            z-index: 9999;
        }
        #scoreboardHeader { color: white; font-size: 1.2rem; }
        #scoreboardSongTitle {
            font-size: 0.85rem; color: #fff;
            margin-bottom: 16px; padding-bottom: 10px;
            border-bottom: 1px solid rgba(255,255,255,0.15);
        }
        .scoreboardEntry {
            display: grid;
            grid-template-columns: 40px 1fr 90px;
            align-items: center;
            padding: 10px 12px;
            border-radius: 8px;
            margin-bottom: 6px;
            background: rgba(255,255,255,0.05);
            color: white;
        }
        .scoreboardYou { background: rgba(75,167,255,0.15); border: 1px solid #4BA7FF; }
        .scoreboardRank { font-size: 1.2rem; min-width: 28px; text-align: center; }
        .scoreboardName { text-align: left; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .scoreboardScore { text-align: center; font-weight: bold; color: #FFD700; font-size: 1rem; }
        .scoreboardLoading, .scoreboardEmpty { text-align: center; color: #aaa; padding: 20px; font-size: 0.9rem; }
        #scoreboardYourBest {
            margin-top: 14px; padding: 10px;
            text-align: center; font-size: 0.95rem; font-weight: bold; color: #fff;
            display: flex; justify-content: center; align-items: center;
            background: rgba(255,255,255,0.08);
            border: 1px solid rgba(255,255,255,0.15);
            border-radius: 10px;
        }
        #closeScoreboardBtn {
            position: absolute; top: 10px; right: 10px;
            background: none; border: none;
            color: #aaa; font-size: 1.1rem; cursor: pointer;
        }
        #closeScoreboardBtn:hover { color: #fff; }
        #scoreboardBtn {
            width: 100%; background: purple; border: none;
            color: #fff; font-size: 0.9rem;
            padding: 8px 12px; text-align: left;
            cursor: pointer; border-radius: 6px;
        }
        #scoreboardBtn:hover { background: rgba(75,167,255,0.2); }
    `;
    document.head.appendChild(style);
}