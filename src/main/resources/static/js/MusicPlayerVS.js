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

import { db, auth, doc, setDoc, deleteDoc, getDoc, getDocs, collection, onAuthStateChanged, signOut } from './firebase.js';

const audio = document.getElementById("audio")
const progress = document.getElementById("progress")
const progressContainer = document.getElementById("progressContainer")

let volume = document.getElementById("volume")

let restart = document.getElementById("restart")
let playPause = document.getElementById("playPause")
let playImg = document.getElementById("playImg")

let volumeButton = document.getElementById("volumeButton")
let volumeIcon = document.getElementById("volumeIcon")

let goBackButton = document.getElementById("goBack")



let heartButton = document.getElementById("heart");

let lyrics = []


let settingsButton = document.getElementById("settings");
let settingsModal = document.getElementById("settingsModal");
let closeSettingsBtn = document.getElementById("closeSettingsBtn");
let fontSizeSlider = document.getElementById("fontSizeSlider");
let subtitle = document.getElementById("subtitle");
let saveTimeout;
const resetPrefsBtn = document.getElementById("resetPrefsBtn");

let romSizeSlider = document.getElementById("romSizeSlider");
let transSizeSlider = document.getElementById("transSizeSlider");
let romSizeLabel = document.getElementById("romSizeLabel");
let transSizeLabel = document.getElementById("transSizeLabel");
let nonEnglishSettings = document.getElementById("nonEnglishSettings");

let lyricColor = "#FFD700";
audio.volume = 0.5
volume.value = 50
updateVolumeUI();
let fontSize = "5";

let currentUser = null;

// translated lyrics
let showRomanization = true;
let showTranslation = true;
let isNonEnglishSong = false;

// toggle for rom and lyrics
let romToggle = document.getElementById("romToggle");
let transToggle = document.getElementById("transToggle");
let swapLyrics = false;
let swapToggle = document.getElementById("swapToggle");

// ─── Audio ─────────────────────────────────────────────────────────
let useFullSong = false;
let currentSongData = null;
const audioVersionToggle = document.getElementById("audioVersionToggle");
const audioVersionLabel  = document.getElementById("audioVersionLabel");
// ─── Audio Visualizer ─────────────────────────────────────────────────────────
let vizAudioCtx = null;
let vizAnalyser = null;
let vizSource   = null;

if (audioVersionToggle) {
    audioVersionToggle.addEventListener("change", () => {
        useFullSong = audioVersionToggle.checked;

        if (!currentSongData) return;

        const wasPlaying = !audio.paused;
        const savedTime  = audio.currentTime;

        audio.src = useFullSong
            ? `/audio/full/${currentSongData.audioPath.split("/").pop()}`
            : currentSongData.audioPath;

        // Must wait for the new src to be ready before seeking
        audio.addEventListener("loadedmetadata", () => {
            audio.currentTime = savedTime;
            if (wasPlaying) audio.play().catch(() => {});
        }, { once: true });

        savePreferences();
    });
}

function initMusicPlayerVisualizer() {
    const canvas = document.getElementById("audioVisualizer");
    if (!canvas) return;

    if (vizAudioCtx) {
        if (vizAudioCtx.state === "suspended") vizAudioCtx.resume();
        return;
    }

    const ctx = canvas.getContext("2d");

    vizAudioCtx  = new (window.AudioContext || window.webkitAudioContext)();
    vizAnalyser  = vizAudioCtx.createAnalyser();
    vizAnalyser.fftSize = 512;
    vizAnalyser.smoothingTimeConstant = 0.85;

    vizSource = vizAudioCtx.createMediaElementSource(audio);
    vizSource.connect(vizAnalyser);
    vizSource.connect(vizAudioCtx.destination);

    function sizeCanvas() {
        canvas.width  = window.innerWidth;
        canvas.height = 200;
    }

    requestAnimationFrame(() => {
        sizeCanvas();
        window.addEventListener("resize", sizeCanvas);
        drawSongBars();
    });

    function drawSongBars() {
        requestAnimationFrame(drawSongBars);
        const W = canvas.width;
        const H = canvas.height;
        if (!W || !H) return;

        const bufferLength = vizAnalyser.frequencyBinCount;
        const dataArray    = new Uint8Array(bufferLength);
        vizAnalyser.getByteFrequencyData(dataArray);

        ctx.clearRect(0, 0, W, H);

        const useLength  = Math.floor(bufferLength * 0.6);
        const barCount   = 160;
        const gap        = 1;
        const barWidth   = (W - gap * (barCount - 1)) / barCount;
        const centerY    = H / 2;
        const maxHalf    = H * 0.45;

        for (let i = 0; i < barCount; i++) {
            const mirrorI    = i < barCount / 2 ? i : barCount - 1 - i;
            const dataIndex  = Math.floor((mirrorI / (barCount / 2)) * useLength);
            const raw        = dataArray[dataIndex] / 255;
            const boosted    = Math.pow(raw, 0.6);
            const halfHeight = boosted * maxHalf;

            const x     = i * (barWidth + gap);
            const alpha = 0.4 + boosted * 0.5;

            const grad = ctx.createLinearGradient(0, centerY - halfHeight, 0, centerY + halfHeight);
            grad.addColorStop(0,   `hsla(207, 100%, 65%, ${alpha})`);
            grad.addColorStop(0.5, `hsla(207, 100%, 60%, ${alpha})`);
            grad.addColorStop(1,   `hsla(290, 100%, 60%, ${alpha})`);

            ctx.fillStyle = grad;
            ctx.fillRect(x, centerY - halfHeight, barWidth, halfHeight * 2);

            // Top cap
            ctx.fillStyle = `hsla(207, 100%, 90%, ${Math.min(alpha + 0.2, 1)})`;
            ctx.fillRect(x, centerY - halfHeight, barWidth, 2);

            // Bottom cap
            ctx.fillStyle = `hsla(310, 100%, 80%, ${Math.min(alpha + 0.2, 1)})`;
            ctx.fillRect(x, centerY + halfHeight - 2, barWidth, 2);
        }
    }
}



audio.addEventListener("play",    initMusicPlayerVisualizer);
audio.addEventListener("playing", initMusicPlayerVisualizer);


onAuthStateChanged(auth, (user) => {
    currentUser = user;
});
//load user settings
onAuthStateChanged(auth, async (user) => {
    if (!user) return;

    const snap = await getDoc(doc(db, "users", user.uid, "preferences", "settings"));

    if (snap.exists()) {
        const prefs = snap.data();

        if (prefs.volume !== undefined) {
            audio.volume = prefs.volume;
            volume.value = prefs.volume * 100;
            updateVolumeUI();
        }
        if (prefs.fontSize !== undefined) {
            fontSize = Math.round(Number(prefs.fontSize));
            document.documentElement.style.setProperty("--main-size", fontSize + "vw");
            fontSizeSlider.value = fontSize;
            fontSizeLabel.textContent = fontSize;
        }
        if (prefs.lyricColor !== undefined) {
            lyricColor = prefs.lyricColor;
            refreshColorPickerUI();
        }
        if (prefs.romSize !== undefined && romSizeSlider) {
            romSizeLabel.textContent = Math.round(prefs.romSize);
            document.documentElement.style.setProperty("--rom-size", prefs.romSize + "vw");
        }
        if (prefs.transSize !== undefined && transSizeSlider) {
            transSizeLabel.textContent = Math.round(prefs.transSize);
            document.documentElement.style.setProperty("--trans-size", prefs.transSize + "vw");
        }
        if (romToggle) {
            romToggle.addEventListener("change", () => {
                showRomanization = romToggle.checked;
                savePreferences();
            });
        }

        if (transToggle) {
            transToggle.addEventListener("change", () => {
                showTranslation = transToggle.checked;
                savePreferences();
            });
        }
        if (prefs.showRomanization !== undefined) {
            showRomanization = prefs.showRomanization;
            if (romToggle) romToggle.checked = showRomanization;
        }
        if (prefs.showTranslation !== undefined) {
            showTranslation = prefs.showTranslation;
            if (transToggle) transToggle.checked = showTranslation;
        }
        if (swapToggle) {
            swapToggle.addEventListener("change", () => {
                swapLyrics = swapToggle.checked;  // was swapLyricsBtn.checked
                savePreferences();
            });
        }
        if (prefs.swapLyrics !== undefined) {
            swapLyrics = prefs.swapLyrics;
            if (swapToggle) swapToggle.checked = swapLyrics;
        }

    }
    if (prefs.useFullSong !== undefined) {
        useFullSong = prefs.useFullSong;
        if (audioVersionToggle) audioVersionToggle.checked = useFullSong;
        if (audioVersionLabel)  audioVersionLabel.textContent = useFullSong ? "Full Song" : "Karaoke";
    }
});

async function savePreferences() {
    if (!currentUser) return;
    await setDoc(doc(db, "users", currentUser.uid, "preferences", "settings"), {
        volume: audio.volume,
        fontSize: fontSize,
        lyricColor: lyricColor,
        romSize: romSizeSlider ? Math.round(parseFloat(romSizeSlider.value)) : 2,
        transSize: transSizeSlider ? Math.round(parseFloat(transSizeSlider.value)) : 3,
        showRomanization: showRomanization,
        showTranslation: showTranslation,
        swapLyrics: swapLyrics,
        useFullSong: useFullSong
    }, { merge: true });
}
// reset settings
if (resetPrefsBtn) {
    resetPrefsBtn.addEventListener("click", () => {
        resetPreferences();
    });
}
//setting menu
if (settingsButton && settingsModal && closeSettingsBtn && fontSizeSlider && subtitle) {

    settingsButton.addEventListener("click", (e) => {
        e.stopPropagation();
        settingsModal.style.display = "flex";
    });

    closeSettingsBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        settingsModal.style.display = "none";
    });

    settingsModal.addEventListener("click", (e) => {
        if (e.target === settingsModal) {
            settingsModal.style.display = "none";
        }
    });


    fontSizeSlider.addEventListener("input", () => {
        fontSize = Math.round(Number(fontSizeSlider.value));

        // Set on mainLyric directly, not subtitle
        document.documentElement.style.setProperty("--main-size", fontSize + "vw");
        fontSizeLabel.textContent = fontSize;

        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(savePreferences, 200);
    });
    if (romSizeSlider) {
        romSizeSlider.addEventListener("input", () => {
            const val = Math.round(Number(romSizeSlider.value));
            romSizeLabel.textContent = val;
            document.querySelectorAll(".romanizedLyric").forEach(el => {
                el.style.fontSize = val + "em";
            });
            // also update CSS variable for future renders
            document.documentElement.style.setProperty("--rom-size", val + "em");
            clearTimeout(saveTimeout);
            saveTimeout = setTimeout(savePreferences, 200);
        });
    }

    if (transSizeSlider) {
        transSizeSlider.addEventListener("input", () => {
            const val = Math.round(Number(transSizeSlider.value));
            transSizeLabel.textContent = val;
            document.querySelectorAll(".translationLine").forEach(el => {
                el.style.fontSize = val + "em";
            });
            document.documentElement.style.setProperty("--trans-size", val + "em");
            clearTimeout(saveTimeout);
            saveTimeout = setTimeout(savePreferences, 200);
        });
    }

} else {
    console.warn("[Settings] Missing DOM elements. Check HTML IDs.");
}

// colors for color picker
const colors = [
    "#FFD700", // gold
    "#FFFFFF", // white
    "#FF4D4D", // red
    "#4DA6FF", // blue
    "#4DFF88", // green
    "#B84DFF", // purple
    "#FF8C4D", // orange
    "#FF4DD2", // pink
    "#00E6E6", // cyan
    "#A0A0A0", // gray
    "#FFADAD", // Soft Red
    "#FFD6A5", // Sunset Peach
    "#FDFFB6", // Pale Lemon
    "#CAFFBF", // Mint Green
    "#9BFBC0", // Seafoam
    "#A0C4FF", // Sky Blue
    "#BDB2FF", // Lavender
    "#FFC6FF", // Bubblegum
    "#FF00FF", // Neon Magenta
    "#39FF14", // Electric Lime
    "#00FFFF", // Cyan Ice
    "#FF3131", // Radical Red
    "#8A2BE2", // Blue Violet
    "#FFFF33", // Neon Yellow
    "#FF5F1F", // Neon Orange
    "#BC13FE", // Deep Mauve
];

const picker = document.getElementById("lyricColorPicker");

colors.forEach(color => {
    const btn = document.createElement("div");
    btn.className = "colorOption";
    btn.style.background = color;
    btn.dataset.color = color;
    if (color === lyricColor) btn.classList.add("active");

    btn.onclick = () => {
        lyricColor = color;

        refreshColorPickerUI();

        savePreferences();
    };

    picker.appendChild(btn);
});

function refreshColorPickerUI() {
    document.querySelectorAll(".colorOption").forEach(btn => {
        btn.classList.remove("active");

        if (btn.dataset.color === lyricColor) {
            btn.classList.add("active");
        }
    });
}
// Top Bar
// Go back to Song Selection
// Go back to Song Selection and pass the current song ID
goBackButton.onclick = () => {
    const params = new URLSearchParams(window.location.search);
    const songId = params.get("song");

    window.location.href = `/songselection?song=${songId}`;
}
const dropDownButton = document.getElementById("dropdown");
const dropdownMenu = document.getElementById("dropdownMenu");

if (dropDownButton && dropdownMenu) {
    dropDownButton.addEventListener("click", (e) => {
        e.stopPropagation();
        dropdownMenu.style.display =
            dropdownMenu.style.display === "block" ? "none" : "block";
    });
}
window.addEventListener("click", (e) => {
    if (dropDownButton && dropdownMenu) {
        if (!dropDownButton.contains(e.target)) {
            dropdownMenu.style.display = "none";
        }
    }
});
// Bottom Bar
// Single volume slider handler
volume.oninput = () => {
    audio.volume = volume.value / 100;

    updateVolumeUI();
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(savePreferences, 200);
}

// Mute/unmute button
volumeButton.onclick = () => {
    if(audio.volume > 0){
        audio.dataset.prevVolume = audio.volume
        audio.volume = 0
        volume.value = 0
        volumeIcon.src = "/images/mute_icon.svg"
    } else {
        audio.volume = audio.dataset.prevVolume || 0.5
        volume.value = audio.volume * 100
        if(audio.volume < 0.5){
            volumeIcon.src = "/images/volume_low_icon.svg"
        } else {
            volumeIcon.src = "/images/volume_high_icon.svg"
        }
    }
    updateVolumeUI()
}


// play or pausing the music
playPause.onclick = () => {
    if(audio.paused){
        audio.play()
        playImg.src = "/images/pause_icon.svg"
    }else{
        audio.pause()
        playImg.src = "/images/play_icon.svg"
    }
}
// Restarts the song
document.getElementById("restart").addEventListener("click", () => {
    console.log("[UI] restart button clicked");

    if (window.KaraokeScorer?.restartSong) {
        window.KaraokeScorer.restartSong();
    }
});

// Update progress bar as audio plays
function updateLyrics() {
    if (!audio.duration || audio.paused || audio.ended) return;

    const t = audio.currentTime;

    const percent = (t / audio.duration) * 100;
    progress.style.width = percent + "%";

    let activeLine = null;

    for (let i = 0; i < lyrics.length; i++) {
        const line = lyrics[i];

        if (t >= line.startTime && t < line.endTime) {
            activeLine = line;
            break;
        }
    }

    if (activeLine) {
        renderKaraoke(activeLine.words, t, activeLine);
    } else {
        subtitle.innerHTML = "";
    }

    requestAnimationFrame(updateLyrics);
}

audio.onplay = () => {
    requestAnimationFrame(updateLyrics);
};
// Seek on click
progressContainer.onclick = (e) => {
    const rect = progressContainer.getBoundingClientRect()
    const clickX = e.clientX - rect.left
    const percent = clickX / rect.width
    audio.currentTime = percent * audio.duration
    progress.style.width = (percent * 100) + "%"
}
// Fetch song and lyrics
const params = new URLSearchParams(window.location.search);
const songId = parseInt(params.get("song"));

fetch("/api/songs")
    .then(r => r.json())
    .then(data => {
        const song = data.find(s => s.id === songId)
        if (song) {

            currentSongData = song;
            audio.src = useFullSong
                ? `/audio/full/${song.audioPath.split("/").pop()}`
                : song.audioPath;

            isNonEnglishSong =
                song.language &&
                song.language.toLowerCase() !== "english";

            if (nonEnglishSettings) {
                if (isNonEnglishSong) {
                    nonEnglishSettings.style.display = "block";
                    document.getElementById("settingsModal").style.height = "clamp(320px, 60vh, 700px)";
                } else {
                    nonEnglishSettings.style.display = "none";
                    document.getElementById("settingsModal").style.height = "clamp(220px, 55vh, 600px)";
                }
            }
            applyGenreTheme(song.genre);

            Promise.all([
                fetch(song.lyricsPath).then(r => r.text()),

                isNonEnglishSong
                    ? fetch(`/translations/${song.title.toLowerCase()}.json`)
                        .then(r => r.json())
                        .catch(() => ({}))
                    : Promise.resolve({})
            ])
                .then(([lyricsText, translationData]) => {
                    parseLyrics(lyricsText, translationData);

                    // After parsing, check what data actually exists
                    const hasRomanization = lyrics.some(line =>
                        line.words.some(w => w.romanized && w.romanized.trim() !== "")
                    );
                    const hasTranslation = lyrics.some(line =>
                        line.lineTranslation && line.lineTranslation.trim() !== ""
                    );

                    // Hide rom settings if no romanization data
                    const romSection = document.getElementById("romSection");
                    const transSection = document.getElementById("transSection");
                    const swapSection = document.getElementById("swapSection");

                    if (romSection)   romSection.style.display   = hasRomanization ? "flex" : "none";
                    if (transSection) transSection.style.display = hasTranslation  ? "flex" : "none";
                    // Only show swap if BOTH exist (swapping requires both to be present)
                    if (swapSection)  swapSection.style.display  = (hasRomanization && hasTranslation) ? "flex" : "none";
                });
        }
    })



// Parse Enhanced LRC
function parseLyrics(text, translationData = {}) {
    lyrics = []
    const wordData = translationData.words || translationData; // backward compat
    const lineData = translationData.lines || {};
    const lines = text.split("\n")

    for (let l of lines) {
        if (!l.trim()) continue

        const lineMatch = l.match(/\[(\d+):(\d+\.\d+)\]/)
        const lineTime = lineMatch ? parseInt(lineMatch[1]) * 60 + parseFloat(lineMatch[2]) : 0

        // Get the line timestamp string to look up line translation
        const lineKey = lineMatch
            ? `${lineMatch[1].padStart(2, "0")}:${lineMatch[2].padStart(5, "0")}`
            : null;
        console.log("LOOKUP:", lineKey, lineData[lineKey]);
        const lineTranslation = lineKey ? (lineData[lineKey] || "") : "";

        const wordPattern = /<(\d+):(\d+\.\d+)>([^<\[]+)/g
        let words = []
        let match
        while ((match = wordPattern.exec(l)) !== null) {
            const time = parseInt(match[1]) * 60 + parseFloat(match[2])
            const rawWord = match[3].trim();
            const word = rawWord.replace(/[^\w가-힣]/g, "");
            if (word) {
                const wordEntry = wordData[word] || wordData[rawWord] || {};
                words.push({
                    time,
                    text: word,
                    romanized: wordEntry.romanized || "",
                    translation: ""  // no longer per-word
                });
            }
        }

        if (words.length === 0) {
            // fallback distribution unchanged
            const lineTextAfterBracket = l.replace(/\[[\d:\.]+\]/, "").trim()
            if (lineTextAfterBracket) {
                const splitWords = lineTextAfterBracket.split(/\s+/)
                const nextLineMatch = lines[lines.indexOf(l) + 1]?.match(/\[(\d+):(\d+\.\d+)\]/)
                const nextTime = nextLineMatch
                    ? parseInt(nextLineMatch[1]) * 60 + parseFloat(nextLineMatch[2])
                    : lineTime + 5
                const duration = Math.min(nextTime - lineTime, 10) * 0.9
                const totalChars = splitWords.reduce((sum, w) => sum + w.length, 0)
                let elapsed = 0
                for (let j = 0; j < splitWords.length; j++) {
                    words.push({ time: lineTime + elapsed, text: splitWords[j] })
                    elapsed += (splitWords[j].length / totalChars) * duration
                }
            }
        }

        if (words.length > 0) {
            lyrics.push({ startTime: lineTime, words, lineTranslation });
        }
    }
    finalizeLyrics();
}
function finalizeLyrics() {
    for (let i = 0; i < lyrics.length; i++) {
        const line = lyrics[i];
        const next = lyrics[i + 1];

        const naturalEnd = next ? next.startTime : line.startTime + 5;

        line.endTime = naturalEnd;
    }
}
// Renders word highlighting
function renderKaraoke(words, currentTime, activeLine = null) {
    let html = `<div class="karaokeLine">`;

    for (let i = 0; i < words.length; i++) {
        const w = words[i];
        const next = words[i + 1];
        const start = w.time;
        const end = next ? next.time : start + 0.4;

        // Swap main and romanized text if swapLyrics is on
        const mainText = swapLyrics && w.romanized ? w.romanized : w.text;
        const subText  = swapLyrics && w.romanized ? w.text : w.romanized;

        let fillStyle = "color: #d8d8d8;";
        let romStyle = "color: #d8d8d8;";

        // When swapped, Non-english text drops to sub position — use mainLyric class so font metrics match
        const subClass = swapLyrics && w.romanized ? "mainLyric" : "romanizedLyric";
        const subFilter = swapLyrics && w.romanized
            ? "filter: drop-shadow(-1px -1px 0 black) drop-shadow(1px 1px 0 black);"
            : "filter: drop-shadow(-0.5px -0.5px 0 black) drop-shadow(0.5px 0.5px 0 black);";

        // Scale down the sub when it's Korean in sub position
        const subScale = swapLyrics && w.romanized ? "transform: scale(0.55); transform-origin: top center;" : "";

        if (currentTime >= start && currentTime < end) {
            const pct = (currentTime - start) / (end - start);
            fillStyle = `
            background: linear-gradient(to right, ${lyricColor} ${pct * 100}%, white ${pct * 100}%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        `;
            romStyle = `
            background: linear-gradient(to right, ${lyricColor} ${pct * 100}%, white ${pct * 100}%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        `;
        } else if (currentTime >= end) {
            fillStyle = `color: ${lyricColor}; -webkit-text-stroke: 0px transparent;`;
            romStyle  = `color: ${lyricColor}; -webkit-text-stroke: 0px transparent;`;
        }


        html += `
            <div class="karaokeWord">
                <div style="filter: drop-shadow(-1px -1px 0 black) drop-shadow(1px 1px 0 black);">
                    <span class="mainLyric" style="${fillStyle}">${mainText}</span>
                </div>
                ${isNonEnglishSong && showRomanization && subText
            ? `<div style="${subFilter}">
                           <span class="${subClass}" style="${romStyle} ${subScale}">${subText}</span>
                       </div>`
            : ""}
            </div>
        `;

    }

    html += `</div>`;

    // Single line translation
    if (isNonEnglishSong && showTranslation && activeLine?.lineTranslation) {

        const words = activeLine.lineTranslation.split(" ");

        const lineStart = activeLine.startTime;
        const lineEnd = activeLine.endTime;
        const duration = lineEnd - lineStart;

        const progress = (currentTime - lineStart) / duration;

        html += `<div class="translationLine">`;

        words.forEach((word, i) => {
            const wordStart = i / words.length;
            const wordEnd = (i + 1) / words.length;

            let style = "color: #d8d8d8;";

            if (progress >= wordStart && progress < wordEnd) {
                const pct = (progress - wordStart) / (wordEnd - wordStart);

                style = `
                background: linear-gradient(to right, ${lyricColor} ${pct * 100}%, white ${pct * 100}%);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
            `;
            }
            else if (progress >= wordEnd) {
                style = `color: ${lyricColor};`;
            }

            html += `
              <span class="translationWord textOutline" data-text="${word}">
                  <span style="${style}">${word}</span>
              </span>
            `;
        });

        html += `</div>`;
    }

    subtitle.innerHTML = html;
}
// Updates the volume bar when starting a song
function updateVolumeUI() {
    if(audio.volume === 0){
        volumeIcon.src = "/images/mute_icon.svg"
    } else if(audio.volume <= 0.5){
        volumeIcon.src = "/images/volume_low_icon.svg"
    } else {
        volumeIcon.src = "/images/volume_high_icon.svg"
    }
    const percent = (audio.volume * 100);
    volume.style.background = `linear-gradient(to right, #4BA7FF ${percent}%, #FFFFFF ${percent}%)`;
}


// Gets song title from url
document.addEventListener("DOMContentLoaded", async () => {
    const songTitle = document.getElementById("songTitle");

    const params = new URLSearchParams(window.location.search);
    const songId = parseInt(params.get("song"));

    console.log("Song ID:", songId);

    const response = await fetch("/api/songs");
    const songs = await response.json();

    const song = songs.find(s => String(s.id) === String(songId));

    console.log("Found Song:", song);

    if (song && songTitle) {
        songTitle.textContent = song.title;
    }
});
// Favorite Button Logic
heartButton.onclick = async () => {
    const user = auth.currentUser;
    if (!user) {
        alert("Please log in to favorite songs!");
        return;
    }

    const params = new URLSearchParams(window.location.search);
    const songId = params.get("song");

    const response = await fetch("/api/songs");
    const songs = await response.json();
    const songData = songs.find(s => String(s.id) === String(songId));

    if (!songData) return;

    const favRef = doc(db, "users", user.uid, "favorites", String(songId));
    const isCurrentlyFavorite = heartButton.classList.contains("active");

    // Use the ID from your HTML to find the image
    const heartImg = document.getElementById("heartImg");

    if (isCurrentlyFavorite) {
        if (typeof playHeartOffSound === "function") playHeartOffSound();
        heartButton.classList.remove("active");

        // Update the image source specifically
        if (heartImg) heartImg.src = "/images/heart_gray_icon.svg";

        await deleteDoc(favRef);
    } else {
        if (typeof playHeartSound === "function") playHeartSound();
        heartButton.classList.add("active");

        // Update the image source specifically
        if (heartImg) heartImg.src = "/images/heart_icon.svg";

        await setDoc(favRef, {
            title: songData.title,
            artist: songData.artist,
            mp3URL: songData.audioPath || "",
            coverURL: songData.artCoverPath || "",
            genre: songData.genre || "",
            language: songData.language || "",
            difficulty: songData.difficulty || ""
        });
    }
};

/**
 * Check initial favorite status when page loads
 */
onAuthStateChanged(auth, async (user) => {
    if (user) {
        const params = new URLSearchParams(window.location.search);
        const songId = params.get("song");
        if (!songId) return;

        const favRef = doc(db, "users", user.uid, "favorites", String(songId));
        const docSnap = await getDoc(favRef);

        if (docSnap.exists()) {
            heartButton.classList.add("active");
            const heartImg = document.getElementById("heartImg");
            if (heartImg) heartImg.src = "/images/heart_icon.svg";
        }
    }
});
const heartButtonSound = new Audio("/soundEffects/heartSound.ogg");
const heartButtonOffSound = new Audio("/soundEffects/heartOffSound.ogg");

function playHeartSound() {
    heartButtonSound.volume = 0.4;
    heartButtonSound.play();
}

function playHeartOffSound() {
    heartButtonOffSound.volume = 0.4;
    heartButtonOffSound.play();
}
// apply top and bottom bar based on song genre
function applyGenreTheme(genre) {
    const topBar = document.getElementById("topBar");
    const bottomBar = document.getElementById("bottomBar");

    if (!topBar || !bottomBar) return;

    const g = (genre || "").toLowerCase();

    let topImg = "../images/top_bar_background.svg";
    let bottomImg = "../images/bottom_bar_background.svg";

    if (g.includes("pop latino")) {
        topImg = "../images/top_bar_pop_latino.svg";
        bottomImg = "../images/bottom_bar_pop_latino.svg";
    } else if (g.includes("pop")) {
        topImg = "../images/top_bar_pop.svg";
        bottomImg = "../images/bottom_bar_pop.svg";
    }else if (g.includes("pop")) {
        topImg = "../images/top_bar_pop.svg";
        bottomImg = "../images/bottom_bar_pop.svg";

    } else if (g.includes("rock")) {
        topImg = "../images/top_bar_rock.svg";
        bottomImg = "../images/bottom_bar_rock.svg";

    } else if (g.includes("r&b/soul")) {
        topImg = "../images/top_bar_soul.svg";
        bottomImg = "../images/bottom_bar_soul.svg";

    } else if (g.includes("r&b")) {
        topImg = "../images/top_bar_rnb.svg";
        bottomImg = "../images/bottom_bar_rnb.svg";

    } else if (g.includes("alternative")) {
        topImg = "../images/top_bar_alternative.svg";
        bottomImg = "../images/bottom_bar_alternative.svg";

    } else if (g.includes("hip-hop/rap")) {
        topImg = "../images/top_bar_rap.svg";
        bottomImg = "../images/bottom_bar_rap.svg";

    } else if (g.includes("game")) {
        topImg = "../images/top_bar_game.svg";
        bottomImg = "../images/bottom_bar_game.svg";

    } else if (g.includes("latin")) {
        topImg = "../images/top_bar_latin.svg";
        bottomImg = "../images/bottom_bar_latin.svg";
    }


    topBar.style.backgroundImage = `url("${topImg}")`;
    bottomBar.style.backgroundImage = `url("${bottomImg}")`;
}

async function resetPreferences() {
    if (!currentUser) return;

    // default values
    audio.volume = 0.5;
    volume.value = 50;

    fontSize = 5;
    document.documentElement.style.setProperty("--main-size", "5vw");
    fontSizeSlider.value = fontSize;
    fontSizeLabel.textContent = fontSize;

    lyricColor = "#FFD700";

    showRomanization = true;
    showTranslation = true;

    if (romToggle) romToggle.checked = true;
    if (transToggle) transToggle.checked = true;

    swapLyrics = false;
    if (swapToggle) swapToggle.checked = false;
    useFullSong = false;
    if (audioVersionToggle) audioVersionToggle.checked = false;
    if (audioVersionLabel)  audioVersionLabel.textContent = "Karaoke";
    updateVolumeUI();
    refreshColorPickerUI();
    romSizeSlider.value = 2;
    romSizeLabel.textContent = "2";
    document.documentElement.style.setProperty("--rom-size", "2vw");

    transSizeSlider.value = 3;
    transSizeLabel.textContent = "3";
    document.documentElement.style.setProperty("--trans-size", "3vw");
    // clear Firebase saved settings
    await setDoc(doc(db, "users", currentUser.uid, "preferences", "settings"), {
        volume: 0.5,
        fontSize: 5,
        lyricColor: "#FFD700"
    }, { merge: true });
}