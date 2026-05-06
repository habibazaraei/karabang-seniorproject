/**
 * MusicPlayerVS.js
 * --------------------
 * Lightweight music player for Battle Mode.
 * Handles song loading, playback controls, lyrics rendering,
 * progress bar, volume, and genre theme only.
 * No favorites, settings, color picker, or Firebase scoring
 * (scoring is handled by BattleScorer.js).
 *
 * @author Tyler Radisch
 */

// ─── DOM Elements ──────────────────────────────────────────────────────────────
const audio             = document.getElementById("audio");
const progress          = document.getElementById("progress");
const progressContainer = document.getElementById("progressContainer");
const volume            = document.getElementById("volume");
const playPause         = document.getElementById("playPause");
const playImg           = document.getElementById("playImg");
const restart           = document.getElementById("restart");
const volumeButton      = document.getElementById("volumeButton");
const volumeIcon        = document.getElementById("volumeIcon");

// Two subtitle elements — one per player panel
const subtitleP1 = document.getElementById("subtitleP1");
const subtitleP2 = document.getElementById("subtitleP2");

// ─── State ─────────────────────────────────────────────────────────────────────
let lyrics = [];

// Each player gets their own lyric color matching their panel color
const LYRIC_COLOR_P1 = "#4BA7FF"; // blue
const LYRIC_COLOR_P2 = "#ff6b6b"; // red

// ─── Initial Volume ────────────────────────────────────────────────────────────
audio.volume = 0.5;
volume.value = 50;
updateVolumeUI();


// ─── Playback Controls ─────────────────────────────────────────────────────────
playPause.onclick = () => {
    if (audio.paused) {
        audio.play();
        playImg.src = "/images/pause_icon.svg";
    } else {
        audio.pause();
        playImg.src = "/images/play_icon.svg";
    }
};

restart.onclick = () => {
    audio.currentTime = 0;
    audio.play();
    playImg.src = "/images/pause_icon.svg";
};


// ─── Volume ────────────────────────────────────────────────────────────────────
volume.oninput = () => {
    audio.volume = volume.value / 100;
    updateVolumeUI();
};

volumeButton.onclick = () => {
    if (audio.volume > 0) {
        audio.dataset.prevVolume = audio.volume;
        audio.volume  = 0;
        volume.value  = 0;
        volumeIcon.src = "/images/mute_icon.svg";
    } else {
        audio.volume  = audio.dataset.prevVolume || 0.5;
        volume.value  = audio.volume * 100;
        volumeIcon.src = audio.volume < 0.5
            ? "/images/volume_low_icon.svg"
            : "/images/volume_high_icon.svg";
    }
    updateVolumeUI();
};

function updateVolumeUI() {
    if (audio.volume === 0) {
        volumeIcon.src = "/images/mute_icon.svg";
    } else if (audio.volume <= 0.5) {
        volumeIcon.src = "/images/volume_low_icon.svg";
    } else {
        volumeIcon.src = "/images/volume_high_icon.svg";
    }
    const percent = audio.volume * 100;
    volume.style.background =
        `linear-gradient(to right, #4BA7FF ${percent}%, #FFFFFF ${percent}%)`;
}


// ─── Progress Bar ──────────────────────────────────────────────────────────────
progressContainer.onclick = (e) => {
    const rect    = progressContainer.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    audio.currentTime    = percent * audio.duration;
    progress.style.width = (percent * 100) + "%";
};


// ─── Lyrics Loop ───────────────────────────────────────────────────────────────
function updateLyrics() {
    if (!audio.duration || audio.paused || audio.ended) return;

    const t = audio.currentTime;
    progress.style.width = ((t / audio.duration) * 100) + "%";

    let activeLine = null;
    for (let i = 0; i < lyrics.length; i++) {
        if (t >= lyrics[i].startTime && t < lyrics[i].endTime) {
            activeLine = lyrics[i];
            break;
        }
    }

    if (activeLine) {
        subtitleP1.innerHTML = renderKaraoke(activeLine.words, t, LYRIC_COLOR_P1);
        subtitleP2.innerHTML = renderKaraoke(activeLine.words, t, LYRIC_COLOR_P2);
    } else {
        subtitleP1.innerHTML = "";
        subtitleP2.innerHTML = "";
    }

    requestAnimationFrame(updateLyrics);
}

audio.onplay = () => {
    requestAnimationFrame(updateLyrics);
};


// ─── Lyric Parsing ─────────────────────────────────────────────────────────────
function parseLyrics(text) {
    lyrics      = [];
    const lines = text.split("\n");

    for (let l of lines) {
        if (!l.trim()) continue;

        const lineMatch = l.match(/\[(\d+):(\d+\.\d+)\]/);
        const lineTime  = lineMatch
            ? parseInt(lineMatch[1]) * 60 + parseFloat(lineMatch[2])
            : 0;

        const wordPattern = /<(\d+):(\d+\.\d+)>([^<\[]+)/g;
        let words = [];
        let match;
        while ((match = wordPattern.exec(l)) !== null) {
            const time = parseInt(match[1]) * 60 + parseFloat(match[2]);
            const word = match[3].trim();
            if (word) words.push({ time, text: word });
        }

        // Fallback: no word timestamps — distribute evenly
        if (words.length === 0) {
            const lineText = l.replace(/\[[\d:\.]+\]/, "").trim();
            if (lineText) {
                const splitWords = lineText.split(/\s+/);
                const nextMatch  = lines[lines.indexOf(l) + 1]?.match(/\[(\d+):(\d+\.\d+)\]/);
                const nextTime   = nextMatch
                    ? parseInt(nextMatch[1]) * 60 + parseFloat(nextMatch[2])
                    : lineTime + 5;
                const duration   = Math.min(nextTime - lineTime, 10) * 0.9;
                const totalChars = splitWords.reduce((s, w) => s + w.length, 0);
                let elapsed      = 0;
                for (let j = 0; j < splitWords.length; j++) {
                    words.push({ time: lineTime + elapsed, text: splitWords[j] });
                    elapsed += (splitWords[j].length / totalChars) * duration;
                }
            }
        }

        if (words.length > 0) lyrics.push({ startTime: lineTime, words });
    }

    finalizeLyrics();
}

function finalizeLyrics() {
    for (let i = 0; i < lyrics.length; i++) {
        const next        = lyrics[i + 1];
        lyrics[i].endTime = next ? next.startTime : lyrics[i].startTime + 5;
    }
}


// ─── Lyric Rendering ───────────────────────────────────────────────────────────
// Returns HTML string — called separately for each player with their own color
function renderKaraoke(words, currentTime, lyricColor) {
    let html = "";

    for (let i = 0; i < words.length; i++) {
        const w     = words[i];
        const next  = words[i + 1];
        const start = w.time;
        const end   = next ? next.time : start + 0.4;

        if (currentTime >= start && currentTime < end) {
            // Currently singing — gradient fill
            const pct = (currentTime - start) / (end - start);
            html += `<span style="
                background: linear-gradient(to right, ${lyricColor} ${pct * 100}%, white ${pct * 100}%);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                font-family: 'LTKaraoke', sans-serif;
                -webkit-text-stroke: 1px black;
                display: inline-block;
            ">${w.text}</span> `;
        } else if (currentTime >= end) {
            // Already sung
            html += `<span style="color:${lyricColor}; font-family:'LTKaraoke',sans-serif; -webkit-text-stroke:1px black;">${w.text}</span> `;
        } else {
            // Not yet sung
            html += `<span style="color:white; font-family:'LTKaraoke',sans-serif; -webkit-text-stroke:1px black;">${w.text}</span> `;
        }
    }

    return html;
}


// ─── Genre Theme ───────────────────────────────────────────────────────────────
function applyGenreTheme(genre) {
    const topBar    = document.getElementById("topBar");
    const bottomBar = document.getElementById("bottomBar");
    if (!topBar || !bottomBar) return;

    const g = (genre || "").toLowerCase();

    let topImg    = "../images/top_bar_background.svg";
    let bottomImg = "../images/bottom_bar_background.svg";

    if (g.includes("pop")) {
        topImg    = "../images/top_bar_pop.svg";
        bottomImg = "../images/bottom_bar_pop.svg";
    } else if (g.includes("rock")) {
        topImg    = "../images/top_bar_rock.svg";
        bottomImg = "../images/bottom_bar_rock.svg";
    }

    topBar.style.backgroundImage    = `url("${topImg}")`;
    bottomBar.style.backgroundImage = `url("${bottomImg}")`;
}


// ─── Song Loading ──────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
    const params = new URLSearchParams(window.location.search);
    const songId = parseInt(params.get("song"));

    fetch("/api/songs")
        .then(r => r.json())
        .then(data => {
            const song = data.find(s => s.id === songId);
            if (!song) {
                console.warn("[MusicPlayerVS] Song not found:", songId);
                return;
            }

            audio.src = song.audioPath;
            applyGenreTheme(song.genre);

            fetch(song.lyricsPath)
                .then(r => r.text())
                .then(parseLyrics)
                .catch(err => console.error("[MusicPlayerVS] Failed to load lyrics:", err));
        })
        .catch(err => console.error("[MusicPlayerVS] Failed to load songs:", err));
});
