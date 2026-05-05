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

let subtitle = document.getElementById("subtitle")
let volume = document.getElementById("volume")

let restart = document.getElementById("restart")
let playPause = document.getElementById("playPause")
let playImg = document.getElementById("playImg")

let volumeButton = document.getElementById("volumeButton")
let volumeIcon = document.getElementById("volumeIcon")

let goBackButton = document.getElementById("goBack")

let dropDownButton = document.getElementById("dropdown");
let dropdownMenu = document.getElementById("dropdownMenu");

let heartButton = document.getElementById("heart");

let lyrics = []
let settingsButton = document.getElementById("settings");
let settingsMenu = document.getElementById("settingsMenu");
let fontSizeSlider = document.getElementById("fontSize");



// toggle settings menu
settingsButton.onclick = () => {
    settingsMenu.style.display =
        settingsMenu.style.display === "block" ? "none" : "block";
};
import { restartSong } from "./KaraokeScorer.js";
// close when clicking outside
window.addEventListener("click", (e) => {
    if (
        !settingsButton.contains(e.target) &&
        !settingsMenu.contains(e.target)
    ) {
        settingsMenu.style.display = "none";
    }
});

// change font size LIVE
fontSizeSlider.oninput = () => {
    subtitle.style.fontSize = fontSizeSlider.value + "vw";
};

// Top Bar
// Go back to Song Selection
// Go back to Song Selection and pass the current song ID
goBackButton.onclick = () => {
    const params = new URLSearchParams(window.location.search);
    const songId = params.get("song");

    window.location.href = `/songselection?song=${songId}`;
}
// Open Drop down
dropDownButton.onclick = () => {
    dropdownMenu.style.display = dropdownMenu.style.display === "block" ? "none" : "block";
};

// click outside to close
window.onclick = (e) => {
    if (!dropDownButton.contains(e.target)) {
        dropdownMenu.style.display = "none";
    }
};
// Bottom Bar
// Single volume slider handler
volume.oninput = () => {
    audio.volume = volume.value / 100

    if(audio.volume === 0){
        volumeIcon.src = "/images/mute_icon.svg"
    } else if(audio.volume <= 0.5){
        volumeIcon.src = "/images/volume_low_icon.svg"
    } else {
        volumeIcon.src = "/images/volume_high_icon.svg"
    }

    updateVolumeUI()
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
    let html = ""

    for (let i = 0; i < words.length; i++) {
        const w = words[i]
        const next = words[i + 1]

        const start = w.time
        const end = next ? next.time : start + 0.4

        const progress = (currentTime - start) / (end - start)
        if (currentTime >= end) {
            html += `<span class="sung">${w.text}</span> `
        } else if (currentTime >= start) {
            const pct = Math.min(1, Math.max(0, progress))

            html += `
                <span class="partial" style="
                    background: linear-gradient(
                        to right,
                        gold ${pct * 100}%,
                        white ${pct * 100}%
                    );
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                ">
                    ${w.text}
                </span> `
        } else {
            html += `<span class="unsung">${w.text}</span> `
        }
    }
    subtitle.innerHTML = html;
}
// Updates the volume bar when starting a song
function updateVolumeUI() {
    const percent = volume.value
    volume.style.background = `linear-gradient(to right, #4BA7FF ${percent}%, #FFFFFF ${percent}%)`
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
audio.volume = 0.5
volume.value = 50
updateVolumeUI()
subtitle.style.fontSize = "5vw";
