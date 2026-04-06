/**
 * This javascript code is for the logic for the MusicPlayer.html
 * like play/pausing, volume control, and putting up the lyric by line
 * using lrc timestamps.
 * @author Jason Yi
 */

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

// Top Bar
// Go back to Song Selection
goBackButton.onclick = () =>{
    window.location.href = "/songselection"
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
restart.onclick = () => {
    audio.currentTime = 0
    subtitle.innerHTML = ""
    progress.style.width = "0%"
    if(audio.paused){
        audio.pause()
        playImg.src = "/images/play_icon.svg"
    }else{
        audio.play()
        playImg.src = "/images/pause_icon.svg"
    }
}

// Update progress bar as audio plays
audio.ontimeupdate = () => {
    if (!audio.duration) return;
    const percent = (audio.currentTime / audio.duration) * 100;
    progress.style.width = percent + "%";

    const t = audio.currentTime;
    for (let line of lyrics) {
        const nextLine = lyrics[lyrics.indexOf(line) + 1];
        if (t >= line.startTime && (!nextLine || t < nextLine.startTime)) {
            renderKaraoke(line.words, t);
            break;
        }
    }
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

        // If no word timestamps, just use whole line
        if(words.length === 0){
            const lineTextAfterBracket = l.replace(/\[[\d:\.]+\]/, "").trim()
            if(lineTextAfterBracket){
                words.push({time: lineTime, text: lineTextAfterBracket})
            }
        }

        if(words.length > 0){
            lyrics.push({startTime: lineTime, words})
        }
    }
}

// Renders word highlighting
function renderKaraoke(words, currentTime){
    let html = ""
    for(let i=0;i<words.length;i++){
        const w = words[i]
        // A word is sung if currentTime >= its timestamp
        if(currentTime >= w.time){
            html += `<span class="sung">${w.text}</span> `
        } else {
            html += `<span class="unsung">${w.text}</span> `
        }
    }
    subtitle.innerHTML = html
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

audio.volume = 0.5
volume.value = 50
updateVolumeUI()
