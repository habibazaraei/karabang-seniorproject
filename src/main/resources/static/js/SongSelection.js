let songList = document.getElementById("songList")
let searchField = document.getElementById("searchField")

let songName = document.getElementById("songName")
let artistName = document.getElementById("artistName")
let songImage = document.getElementById("songImage")
let singButton = document.getElementById("singButton")

let songListInner = document.getElementById("songListInner")
let scrollTopZone = document.getElementById("scrollTop")
let scrollBottomZone = document.getElementById("scrollBottom")

let teaserPlayer = document.getElementById("teaserPlayer");


let minSongs = 10
let songs = []

let selectedSong = null


let currentIndex = 0
let moveInterval = null
let currentList = []

const categoryButtons = document.querySelectorAll(".categoryBtn");
const sortState = {};

const TEASER_FADE_DURATION = 2000;
const TEASER_REPLAY_DELAY = 3000;


let userInteracted = false;
teaserPlayer.volume = 0;
teaserPlayer.loop = false;


teaserPlayer.play().catch(() => {});
teaserPlayer.pause();

let teaserFadeInterval = null;
let teaserReplayTimeout = null;
let currentTeaserId = null;

searchField.oninput = refreshSongList
// DRAG SCROLLING
let isDragging = false;
let startY = 0;
let startIndex = 0;

// Start drag (mouse or touch)
songList.addEventListener("mousedown", startDrag);
songList.addEventListener("touchstart", startDrag);

function startDrag(e) {
    isDragging = true;
    startY = e.type === "touchstart" ? e.touches[0].clientY : e.clientY;
    startIndex = currentIndex;
    e.preventDefault();
}

// While dragging
document.addEventListener("mousemove", onDrag);
document.addEventListener("touchmove", onDrag);

function onDrag(e) {
    if (!isDragging) return;

    let currentY = e.type === "touchmove" ? e.touches[0].clientY : e.clientY;
    let delta = currentY - startY;

    const threshold = 80; // pixels per one song step
    let step = Math.round(-delta / threshold); // negative because dragging down moves up
    currentIndex = (startIndex + step + currentList.length) % currentList.length;
    updateTrackSelect();
}

// End drag
document.addEventListener("mouseup", endDrag);
document.addEventListener("touchend", endDrag);

function endDrag(e) {
    if (!isDragging) return;
    isDragging = false;
}

// MOUSE WHEEL SCROLLING
songList.addEventListener("wheel", (e) => {
    e.preventDefault();
    if (e.deltaY > 0) moveDown();
    else moveUp();
});
// Hover-based auto scrolling

scrollTopZone.onmouseenter = () => {
    moveInterval = setInterval(moveUp, 200)
}

scrollBottomZone.onmouseenter = () => {
    moveInterval = setInterval(moveDown, 200)
}
scrollTopZone.onmouseleave = () => clearInterval(moveInterval)
scrollBottomZone.onmouseleave = () => clearInterval(moveInterval)


// Restart Category when searching
searchField.oninput = () => {
    // reset all category buttons
    categoryButtons.forEach(btn => {
        sortState[btn.innerText.trim()] = "none";
        setButtonIcon(btn, "default");
    });

    refreshSongList();
};
// Category sort

categoryButtons.forEach(button => {
    const name = button.innerText.trim();
    sortState[name] = "none";

    button.addEventListener("click", () => {
        const keyMap = {
            "Artist": "artist",
            "Genre": "genre",
            "Difficulty": "difficulty",
            "Language": "language",
            "Favorites": "title"
        };
        const key = keyMap[name];
        if (!key) return;

        // cycle asc → desc → none → asc ...
        if (sortState[name] === "none") sortState[name] = "asc";
        else if (sortState[name] === "asc") sortState[name] = "desc";
        else sortState[name] = "none";

        setButtonIcon(button, sortState[name] === "none" ? "default" : (sortState[name] === "asc" ? "up" : "down"));

        // reset other buttons
        categoryButtons.forEach(btn => {
            if (btn !== button) {
                sortState[btn.innerText.trim()] = "none";
                setButtonIcon(btn, "default");
            }
        });

        // filter & sort
        let query = searchField.value.toLowerCase();
        let filtered = songs.filter(s =>
            s.title.toLowerCase().includes(query) ||
            s.artist.toLowerCase().includes(query) ||
            s.difficulty.toLowerCase().includes(query) ||
            s.genre.toLowerCase().includes(query) ||
            s.language.toLowerCase().includes(query)
        );

        if (sortState[name] !== "none") {
            filtered.sort((a, b) => {
                let valA = a[key] != null ? String(a[key]).toLowerCase() : "";
                let valB = b[key] != null ? String(b[key]).toLowerCase() : "";
                return sortState[name] === "asc"
                    ? valA.localeCompare(valB, undefined, { numeric: true })
                    : valB.localeCompare(valA, undefined, { numeric: true });
            });
        }

        // rebuild list
        currentList = buildCurrentList(filtered);
        currentIndex = currentList.findIndex(s => !s.isPlaceholder);
        if (currentIndex === -1) currentIndex = 0;

        renderSongCardsNoAnimation(false);
    });
});
// Helper: set SVG icon
function setButtonIcon(button, state) {
    const img = button.querySelector(".sortIcon");
    if (!img) return;
    if (state === "up") img.src = "/images/AtoZ_up_icon.svg";
    else if (state === "down") img.src = "/images/AtoZ_down_icon.svg";
    else img.src = "/images/AtoZ_icon.svg";
}
// Render songs without ??? placeholders
function renderSongCardsNoAnimation(addPlaceholders = true) {
    songListInner.innerHTML = "";
    let listToRender = currentList.slice();

    if (addPlaceholders && currentList.length < minSongs) {
        const placeholdersNeeded = minSongs - currentList.length;
        const half = Math.floor(placeholdersNeeded / 2);

        for (let i = 0; i < half; i++) {
            listToRender.unshift({
                title: "???",
                artist: "Unknown Artist",
                genre: "???",
                difficulty: "???",
                language: "???",
                isPlaceholder: true
            });
        }
        for (let i = half; i < placeholdersNeeded; i++) {
            listToRender.push({
                title: "???",
                artist: "Unknown Artist",
                genre: "???",
                difficulty: "???",
                language: "???",
                isPlaceholder: true
            });
        }
    }

    listToRender.forEach((song, i) => {
        let card = document.createElement("button");
        card.className = "songCard" + (song.isPlaceholder ? " placeholder" : "");

        // Build songBottom HTML
        let songBottomClass = "songBottom";
        if (!song.isPlaceholder && song.genre?.trim().toLowerCase().includes("pop")){
            songBottomClass += " pop";
            console.log(song.genre);
        }
        card.innerHTML = `
            <div class="songTop">${song.title}</div>
            <div class="${songBottomClass}">
                <span class="artistText">${song.artist}</span>
                <div class="songInfoRight">
                    <span class="difficultyText">${song.difficulty}</span>
                    <span class="languageText">${song.language}</span>
                    <span class="genre">${song.genre}</span>
                </div>
                <button class="favoriteBtn">
                    <img src="/images/heart_gray_icon.svg" alt="favorite" width="16" height="16">
                </button>
            </div>
        `;
        if (!song.isPlaceholder) {
            card.onclick = () => {
                const clickedIndex = currentList.indexOf(song);
                if (clickedIndex !== -1) {
                    currentIndex = clickedIndex;
                    updateTrackSelect();
                }
            };
        }
        songListInner.appendChild(card);
    });
    // Center first real song
    const cards = document.querySelectorAll(".songCard");
    cards.forEach(card => card.style.transition = "none");

    updateTrackSelect();

    // re-enable transitions
    requestAnimationFrame(() => {
        cards.forEach(card => card.style.transition = "");
    });
}

// Refresh Song List
function refreshSongList() {
    songListInner.innerHTML = "";

    let query = searchField.value.toLowerCase();

    // Filter real songs
    let realSongs = songs.filter(s =>
        s.title?.toLowerCase().includes(query) ||
        s.artist?.toLowerCase().includes(query) ||
        s.difficulty?.toLowerCase().includes(query) ||
        s.genre?.toLowerCase().includes(query) ||
        s.language?.toLowerCase().includes(query)
    );

    if (realSongs.length === 0) {
        songListInner.innerHTML = "<p>No songs found</p>";
        currentList = [];
        currentIndex = 0;
        return;
    }

    // Fill in placeholders
    currentList = [...realSongs];
    const placeholdersNeeded = Math.max(minSongs - currentList.length, 0);
    const half = Math.floor(placeholdersNeeded / 2);

    for (let i = 0; i < half; i++) {
        currentList.unshift({
            title: "???",
            artist: "Unknown Artist",
            genre: "???",
            difficulty: "???",
            language: "???",
            isPlaceholder: true
        });
    }
    for (let i = half; i < placeholdersNeeded; i++) {
        currentList.push({
            title: "???",
            artist: "Unknown Artist",
            genre: "???",
            difficulty: "???",
            language: "???",
            isPlaceholder: true
        });
    }

    // Create song cards
    songListInner.innerHTML = "";
    currentList.forEach(song => {
        let card = document.createElement("button");
        card.className = "songCard";
        let songBottomClass = "songBottom";
        if (song.isPlaceholder) card.classList.add("placeholder");

        card.innerHTML = `
            <div class="songTop">${song.title}</div>
            <div class="${songBottomClass}">
                <span class="artistText">${song.artist}</span>
                <div class="songInfoRight">
                    <span class="difficultyText">${song.difficulty}</span>
                    <span class="languageText">${song.language}</span>
                    <span class="genre">${song.genre}</span>
                </div>
                <button class="favoriteBtn">
                    <img src="/images/heart_gray_icon.svg" alt="favorite" width="16" height="16">
                </button>
            </div>
        `;
        // Add genre class
        if (!song.isPlaceholder && song.genre?.trim().toLowerCase() === "pop") {
            const bottomDiv = card.querySelector(".songBottom");
            if (bottomDiv) bottomDiv.classList.add("pop");
        }
        if (!song.isPlaceholder) {
            card.onclick = () => {
                const clickedIndex = currentList.indexOf(song);
                if (clickedIndex !== -1) {
                    currentIndex = clickedIndex;
                    updateTrackSelect();
                }
            };
        }

        songListInner.appendChild(card);
    });
    // Temporarily disable transitions to prevent animation
    const cards = document.querySelectorAll(".songCard");
    cards.forEach(card => {
        card.style.transition = "none";
    });

    // Center the first real song
    currentIndex = currentList.findIndex(s => !s.isPlaceholder);
    updateTrackSelect();
    // Re-enable transitions on next frame
    requestAnimationFrame(() => {
        cards.forEach(card => {
            card.style.transition = "";
        });
    });
}

function selectSong(song, card) {
    selectedSong = song;
    // Remove previous selection
    document.querySelectorAll(".songCard").forEach(c => c.classList.remove("selected"));
    card.classList.add("selected");

    // Update song info
    songName.innerText = song.title;
    artistName.innerText = song.artist;

    const clickedIndex = currentList.indexOf(song);
    if (clickedIndex !== -1) {
        let distance = clickedIndex - currentIndex;

        // Handle wrapping for circular carousel
        if (distance > currentList.length / 2) distance -= currentList.length;
        if (distance < -currentList.length / 2) distance += currentList.length;

        // Move the carousel step by step to bring clicked song to center
        currentIndex = clickedIndex;
        updateTrackSelect();
    }

    singButton.disabled = false;
}

singButton.onclick = ()=>{

    if(!selectedSong) return

    window.location.href = "/musicplayer?song=" + selectedSong.id

}

function updateTrackSelect() {
    const cards = document.querySelectorAll(".songCard");
    const total = cards.length;

    const leftPanelHeight = document.getElementById("leftPanel").offsetHeight;
    const baseY = leftPanelHeight * 0.15;
    const baseX = 30;

    cards.forEach((card, i) => {
        card.classList.remove("selected");

        if (i === currentIndex) {
            card.classList.add("selected");
        }

        let offset = i - currentIndex;
        if (offset > total / 2) offset -= total;
        if (offset < -total / 2) offset += total;

        const rotY = -offset * 10;
        const scaleValues = [1.1, 0.95, 0.85, 0.7, 0.6];
        const opacityValues = [1, 0.8, 0.6, 0.4, 0.3];

        const scale = scaleValues[Math.abs(offset)] || 0.6;
        const opacity = opacityValues[Math.abs(offset)] || 0.3;
        const zIndex = 5 - Math.abs(offset);

        const y = offset * baseY;
        const x = offset * baseX;

        card.style.transform = `translate(-50%, calc(-50% + ${y}px)) translateX(${x}px) rotateY(${rotY}deg) scale(${scale})`;
        card.style.zIndex = zIndex;
        card.style.opacity = opacity;
    });

    const centerSong = currentList[currentIndex];

    if (centerSong && !centerSong.isPlaceholder) {
        selectedSong = centerSong;
        cards[currentIndex].classList.add("selected");

        songName.innerText = centerSong.title || "???";
        artistName.innerText = centerSong.artist || "???";
        songImage.src = centerSong.artCoverPath || "/images/questionmark_icon.svg";

        singButton.disabled = false;

        // --- Teaser logic ---
        if (currentTeaserId !== centerSong.id) {
            currentTeaserId = centerSong.id;

            // If user already interacted, play normally
            if (userInteracted) {
                playTeaserWithFade(centerSong);
            } else {
                // preload muted teaser so future autoplay works
                teaserPlayer.src = centerSong.songTeaserPath;
                teaserPlayer.volume = 0;
                teaserPlayer.play().catch(() => {});
                teaserPlayer.pause();
            }
        }
    } else {
        selectedSong = null;
        singButton.disabled = true;
        songName.innerText = "???";
        artistName.innerText = "???";
        songImage.src = "/images/questionmark_icon.svg";

        // Stop teaser
        teaserPlayer.pause();
        teaserPlayer.currentTime = 0;
        teaserPlayer.volume = 1;
        clearInterval(teaserFadeInterval);
        clearTimeout(teaserReplayTimeout);
        currentTeaserId = null;
    }
}
scrollTopZone.onmouseenter = () => moveUp()
scrollBottomZone.onmouseenter = () => moveDown()

function moveDown(){
    currentIndex++
    if(currentIndex >= currentList.length) currentIndex = 0
    updateTrackSelect()
}

function moveUp(){
    currentIndex--
    if(currentIndex < 0) currentIndex = currentList.length - 1
    updateTrackSelect()
}



async function loadSongsFromAPI() {
    try {
        const res = await fetch('/api/songs');
        songs = await res.json();
        refreshSongList();
    } catch (err) {
        console.error("Failed to load songs from API:", err);
    }
}


loadSongsFromAPI();

//setInterval(loadSongsFromAPI, 10000);

function buildCurrentList(filteredSongs) {
    // Make a fresh copy
    let list = [...filteredSongs];

    // Add placeholders if needed
    const placeholdersNeeded = Math.max(minSongs - list.length, 0);
    const half = Math.floor(placeholdersNeeded / 2);

    for (let i = 0; i < half; i++) {
        list.unshift({
            title: "???",
            artist: "Unknown Artist",
            genre: "???",
            difficulty: "???",
            language: "???",
            isPlaceholder: true
        });
    }
    for (let i = half; i < placeholdersNeeded; i++) {
        list.push({
            title: "???",
            artist: "Unknown Artist",
            genre: "???",
            difficulty: "???",
            language: "???",
            isPlaceholder: true
        });
    }

    return list;
}
// replays song teaser
// unlock teaser on first click/touch
document.addEventListener("click", () => { userInteracted = true; playCurrentTeaser(); }, { once: true });
document.addEventListener("touchstart", () => { userInteracted = true; playCurrentTeaser(); }, { once: true });

function playCurrentTeaser() {
    const centerSong = currentList[currentIndex];
    if (!centerSong || centerSong.isPlaceholder) return;
    currentTeaserId = centerSong.id;
    playTeaserWithFade(centerSong);
}

function playTeaserWithFade(song) {
    if (!song.songTeaserPath) return;

    clearInterval(teaserFadeInterval);
    clearTimeout(teaserReplayTimeout);

    teaserPlayer.pause();
    teaserPlayer.src = song.songTeaserPath;
    teaserPlayer.currentTime = 0;

    // Play muted if user hasn't interacted
    teaserPlayer.volume = userInteracted ? 1 : 0;

    teaserPlayer.play().catch(() => {});

    // Fade out near the end
    teaserPlayer.ontimeupdate = () => {
        if (teaserPlayer.duration && teaserPlayer.currentTime >= teaserPlayer.duration - TEASER_FADE_DURATION/1000) {
            if (teaserFadeInterval) return;

            const fadeSteps = 20;
            const fadeStepTime = TEASER_FADE_DURATION / fadeSteps;
            let currentStep = 0;
            teaserFadeInterval = setInterval(() => {
                currentStep++;
                teaserPlayer.volume = Math.max(userInteracted ? 1 : 0, (userInteracted ? 1 : 0) * (1 - currentStep / fadeSteps));
                if (currentStep >= fadeSteps) {
                    clearInterval(teaserFadeInterval);
                    teaserFadeInterval = null;
                }
            }, fadeStepTime);
        }
    };

    // Replay after delay
    teaserPlayer.onended = () => {
        teaserReplayTimeout = setTimeout(() => {
            playTeaserWithFade(song);
        }, TEASER_REPLAY_DELAY);
    };
}



