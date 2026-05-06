/**
 * This javascript code is for the logic for the MusicPlayer.html
 * like play/pausing, volume control, and putting up the lyric by line
 * using lrc timestamps.
 * @author Jason Yi
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


let lyricColor = "#FFD700";
audio.volume = 0.5
volume.value = 50
updateVolumeUI();
let fontSize = "5";

let currentUser = null;


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
            subtitle.style.fontSize = fontSize + "vw";

            fontSizeSlider.value = fontSize;
            fontSizeLabel.textContent = fontSize;
        }
        if (prefs.lyricColor !== undefined) {
            lyricColor = prefs.lyricColor;
            refreshColorPickerUI();
        }
    }
});

async function savePreferences() {
    if (!currentUser) return;

    await setDoc(doc(db, "users", currentUser.uid, "preferences", "settings"), {
        volume: audio.volume,
        fontSize: fontSize,
        lyricColor: lyricColor
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

        subtitle.style.fontSize = fontSize + "vw";
        fontSizeLabel.textContent = fontSize;

        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(savePreferences, 200);
    });

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
        renderKaraoke(activeLine.words, t);
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
        if(song){
            audio.src = song.audioPath

            applyGenreTheme(song.genre);

            fetch(song.lyricsPath)
                .then(r => r.text())
                .then(parseLyrics)
        }
    })



// Parse Enhanced LRC
function parseLyrics(text){
    lyrics = []
    const lines = text.split("\n")

    for(let l of lines){
        if(!l.trim()) continue

        // Line timestamp [mm:ss.xxx]
        const lineMatch = l.match(/\[(\d+):(\d+\.\d+)\]/)
        const lineTime = lineMatch ? parseInt(lineMatch[1])*60 + parseFloat(lineMatch[2]) : 0

        // Word timestamps <mm:ss.xxx>word
        const wordPattern = /<(\d+):(\d+\.\d+)>([^<\[]+)/g
        let words = []
        let match
        while((match = wordPattern.exec(l)) !== null){
            const time = parseInt(match[1])*60 + parseFloat(match[2])
            const word = match[3].trim()
            if(word) words.push({time, text: word})
        }

        // If no word timestamps, split line into words and distribute evenly
        if(words.length === 0){
            const lineTextAfterBracket = l.replace(/\[[\d:\.]+\]/, "").trim()
            if(lineTextAfterBracket){
                const splitWords = lineTextAfterBracket.split(/\s+/)
                const nextLineMatch = lines[lines.indexOf(l) + 1]?.match(/\[(\d+):(\d+\.\d+)\]/)
                const nextTime = nextLineMatch
                    ? parseInt(nextLineMatch[1])*60 + parseFloat(nextLineMatch[2])
                    : lineTime + 5
                const duration = Math.min(nextTime - lineTime, 10) * 0.9
                const totalChars = splitWords.reduce((sum, w) => sum + w.length, 0)
                let elapsed = 0
                for(let j = 0; j < splitWords.length; j++){
                    words.push({time: lineTime + elapsed, text: splitWords[j]})
                    const weight = splitWords[j].length / totalChars
                    elapsed += weight * duration
                }
            }
        }

        if (words.length > 0) {
            lyrics.push({ startTime: lineTime, words });
        }

    }
    finalizeLyrics();
}
function finalizeLyrics() {
    for (let i = 0; i < lyrics.length; i++) {
        const line = lyrics[i];
        const next = lyrics[i + 1];

        const naturalEnd = next ? next.startTime : line.startTime + 5;

        line.endTime = naturalEnd; // IMPORTANT: no lingering logic
    }
}
// Renders word highlighting
function renderKaraoke(words, currentTime) {
    let html = "";

    for (let i = 0; i < words.length; i++) {
        const w = words[i];
        const next = words[i + 1];

        const start = w.time;
        const end = next ? next.time : start + 0.4;

        // CURRENT word (gradient fill)
        if (currentTime >= start && currentTime < end) {
            const pct = (currentTime - start) / (end - start);

            html += `
                <span style="
                    background: linear-gradient(
                        to right,
                        ${lyricColor} ${pct * 100}%,
                        white ${pct * 100}%
                    );
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                ">
                    ${w.text}
                </span> `;
        }

        // PAST words (same color as selected lyricColor)
        else if (currentTime >= end) {
            html += `<span style="color:${lyricColor}">${w.text}</span> `;
        }

        // FUTURE words
        else {
            html += `<span style="color:white">${w.text}</span> `;
        }
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
document.addEventListener("DOMContentLoaded", () => {
    const songTitle = document.getElementById("songTitle");

    // Get the song ID from the URL
    const params = new URLSearchParams(window.location.search);
    const songId = parseInt(params.get("song"));

    if (!songTitle || !songId) return;

    // Fetch the song list
    fetch("/api/songs")
        .then(r => r.json())
        .then(data => {
            const song = data.find(s => s.id === songId);
            if (song) {
                songTitle.textContent = song.title + " - " + song.artist;
            }
        })
        .catch(err => console.error("Failed to load song:", err));
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

            // Fix the image on load
            const heartImg = document.getElementById("heartImg");
            if (heartImg) {
                heartImg.src = "/images/heart_icon.svg";
            }
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

    if (g.includes("pop")) {
        topImg = "../images/top_bar_pop.svg";
        bottomImg = "../images/bottom_bar_pop.svg";
    } else if (g.includes("rock")) {
        topImg = "../images/top_bar_rock.svg";
        bottomImg = "../images/bottom_bar_rock.svg";
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
    subtitle.style.fontSize = fontSize + "vw";
    fontSizeSlider.value = fontSize;
    fontSizeLabel.textContent = fontSize;

    lyricColor = "#FFD700";

    updateVolumeUI();
    refreshColorPickerUI();

    // clear Firebase saved settings
    await setDoc(doc(db, "users", currentUser.uid, "preferences", "settings"), {
        volume: 0.5,
        fontSize: 5,
        lyricColor: "#FFD700"
    }, { merge: true });
}