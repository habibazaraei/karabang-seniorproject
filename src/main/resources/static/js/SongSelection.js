import { db, auth, doc, setDoc, deleteDoc, getDoc, getDocs, collection, onAuthStateChanged, signOut } from './firebase.js';

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

let scrollSpeed = 200;

let minSongs = 10
let songs = []

let selectedSong = null


let currentIndex = 0
let moveInterval = null
let currentList = []

const categoryButtons = document.querySelectorAll(".categoryButton");
const sortState = {};

const favoriteButtonRight = document.querySelector(".favoriteButtonRight");

const TEASER_FADE_DURATION = 2000;
const TEASER_REPLAY_DELAY = 3000;


let userInteracted = false;
teaserPlayer.volume = 0;
teaserPlayer.loop = false;
let userVolume = 1;

teaserPlayer.play().catch(() => {});
teaserPlayer.pause();

let teaserFadeInterval = null;
let teaserReplayTimeout = null;
let currentTeaserId = null;



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

    const threshold = 80;
    let step = Math.round(-delta / threshold);
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

function restartScrollInterval(direction) {
    clearInterval(moveInterval);
    moveInterval = setInterval(direction === "up" ? moveUp : moveDown, scrollSpeed);
}

scrollTopZone.onmouseenter = () => restartScrollInterval("up");
scrollBottomZone.onmouseenter = () => restartScrollInterval("down");
scrollTopZone.onmouseleave = () => clearInterval(moveInterval);
scrollBottomZone.onmouseleave = () => clearInterval(moveInterval);


searchField.oninput = () => {
    categoryButtons.forEach(button => {
        sortState[button.innerText.trim()] = "none";
        button.classList.remove("active");
        setButtonIcon(button, "default");
    });
    refreshSongList();
};

function toggleDropdown() {
    document.getElementById("myDropdown").classList.toggle("show");
}

document.getElementById("profile").addEventListener("click", (e) => {
    e.stopPropagation();
    toggleDropdown();
});

window.addEventListener("click", function (e) {
    if (!e.target.closest("#profile")) {
        document.getElementById("myDropdown").classList.remove("show");
    }
});

categoryButtons.forEach(buttons => {
    const name = buttons.innerText.trim();
    sortState[name] = "none";

    buttons.addEventListener("click", async () => {
        document.querySelectorAll(".categoryButton").forEach(b => b.classList.remove("active"));
        if (sortState[name] === "none") sortState[name] = "asc";
        else if (sortState[name] === "asc") sortState[name] = "desc";
        else sortState[name] = "none";

        if (sortState[name] !== "none") {
            buttons.classList.add("active");
        } else {
            buttons.classList.remove("active");
        }

        document.getElementById("categoryTabs").style.height =
            sortState[name] === "none" ? "0px" : "40px";
        const keyMap = {
            "Artist": "artist",
            "Genre": "genre",
            "Difficulty": "difficulty",
            "Language": "language",
        };
        const key = keyMap[name];

        if (name === "Favorites") {
            const user = auth.currentUser;
            if (!user) {
                sortState[name] = "none";
                setButtonIcon(buttons, "default");
                buttons.classList.remove("active");
                document.getElementById("categoryTabs").style.height = "0px";
                alert("Please log in to see favorites!");
                return;
            }
            const snapshot = await getDocs(collection(db, "users", user.uid, "favorites"));
            const favIds = snapshot.docs.map(d => d.id);
            const favSongs = songs.filter(s => favIds.includes(String(s.id)));

            if (favSongs.length === 0) {
                songListInner.innerHTML = "<p>No favorites yet!</p>";
                currentList = [];
                currentIndex = 0;
                return;
            }

            currentList = buildCurrentList(favSongs);
            currentIndex = currentList.findIndex(s => !s.isPlaceholder);
            if (currentIndex === -1) currentIndex = 0;
            renderSongCardsNoAnimation(false);
            loadFavoriteStates();
            return;
        }

        if (!key) return;

        setButtonIcon(buttons, sortState[name] === "none" ? "default" : (sortState[name] === "asc" ? "up" : "down"));

        categoryButtons.forEach(b => {
            if (b !== buttons) {
                sortState[b.innerText.trim()] = "none";
                setButtonIcon(b, "default");
                b.classList.remove("active");
            }
        });

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

        currentList = buildCurrentList(filtered);
        currentIndex = currentList.findIndex(s => !s.isPlaceholder);
        if (currentIndex === -1) currentIndex = 0;

        renderSongCardsNoAnimation(false);
        loadFavoriteStates();
    });
});

favoriteButtonRight.addEventListener("click", async () => {
    if (!selectedSong) return;

    const user = auth.currentUser;
    if (!user) {
        alert("Please log in to favorite songs!");
        return;
    }

    const favRef = doc(db, "users", user.uid, "favorites", String(selectedSong.id));
    const favSnap = await getDoc(favRef);

    const img = favoriteButtonRight.querySelector("img");

    if (favSnap.exists()) {
        await deleteDoc(favRef);
        img.src = "/images/heart_gray_icon.svg";
        favoriteButtonRight.classList.remove("active");
    } else {
        await setDoc(favRef, {
            title: selectedSong.title,
            artist: selectedSong.artist,
            mp3URL: selectedSong.songPath || "",
            coverURL: selectedSong.artCoverPath || "",
            genre: selectedSong.genre || "",
            language: selectedSong.language || "",
            difficulty: selectedSong.difficulty || ""
        });

        img.src = "/images/heart_icon.svg";
        favoriteButtonRight.classList.add("active");
    }

    loadFavoriteStates();
});

function setButtonIcon(button, state) {
    const img = button.querySelector(".sortIcon");
    if (!img) return;
    if (state === "up") img.src = "/images/AtoZ_up_icon.svg";
    else if (state === "down") img.src = "/images/AtoZ_down_icon.svg";
    else img.src = "/images/AtoZ_icon.svg";
}

function renderSongCardsNoAnimation(addPlaceholders = true) {
    songListInner.innerHTML = "";
    let listToRender = currentList.slice();

    if (addPlaceholders && currentList.length < minSongs) {
        const placeholdersNeeded = minSongs - currentList.length;
        const half = Math.floor(placeholdersNeeded / 2);

        for (let i = 0; i < half; i++) {
            listToRender.unshift({ title: "???", artist: "Unknown Artist", genre: "???", difficulty: "???", language: "???", isPlaceholder: true });
        }
        for (let i = half; i < placeholdersNeeded; i++) {
            listToRender.push({ title: "???", artist: "Unknown Artist", genre: "???", difficulty: "???", language: "???", isPlaceholder: true });
        }
    }
    addSongCard(currentList);
    const cards = document.querySelectorAll(".songCard");
    cards.forEach(card => card.style.transition = "none");
    updateTrackSelect();
    requestAnimationFrame(() => {
        cards.forEach(card => card.style.transition = "");
    });
}

function refreshSongList() {
    songListInner.innerHTML = "";

    let query = searchField.value.toLowerCase();

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

    currentList = [...realSongs];
    const placeholdersNeeded = Math.max(minSongs - currentList.length, 0);
    const half = Math.floor(placeholdersNeeded / 2);

    for (let i = 0; i < half; i++) {
        currentList.unshift({ title: "???", artist: "Unknown Artist", genre: "???", difficulty: "???", language: "???", isPlaceholder: true });
    }
    for (let i = half; i < placeholdersNeeded; i++) {
        currentList.push({ title: "???", artist: "Unknown Artist", genre: "???", difficulty: "???", language: "???", isPlaceholder: true });
    }

    addSongCard(currentList);
    const cards = document.querySelectorAll(".songCard");
    cards.forEach(card => { card.style.transition = "none"; });

    currentIndex = currentList.findIndex(s => !s.isPlaceholder);
    updateTrackSelect();

    requestAnimationFrame(() => {
        cards.forEach(card => { card.style.transition = ""; });
    });
    loadFavoriteStates();
}

function addSongCard(listToRender) {
    songListInner.innerHTML = "";
    listToRender.forEach((song, i) => {
        let card = document.createElement("button");
        card.className = "songCard" + (song.isPlaceholder ? " placeholder" : "");

        let songBottomClass = "songBottom";
        let songCardClass = "songCard";
        if (!song.isPlaceholder && song.genre?.trim().toLowerCase().includes("pop")) {
            songBottomClass += " pop";
            songCardClass += " pop";
        } else if (!song.isPlaceholder && song.genre?.trim().toLowerCase().includes("rock")) {
            songBottomClass += " rock";
            songCardClass += " rock";
        }
        card.className = songCardClass + (song.isPlaceholder ? " placeholder" : "");
        card.innerHTML = `
            <div class="songTop">${song.title}</div>
            <div class="${songBottomClass}">
                <span class="artistText">${song.artist}</span>
                <div class="songInfoRight">
                    <span class="difficultyText">${song.difficulty}</span>
                    <span class="genre">${song.genre}</span>
                    <span class="languageText">${song.language}</span>
                </div>
               <button class="favoriteButton" data-id="${song.id}">
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

            const favBtn = card.querySelector(".favoriteButton");
            favBtn.onclick = async (e) => {
                e.stopPropagation();

                const user = auth.currentUser;
                if (!user) {
                    alert("Please log in to favorite songs!");
                    return;
                }

                const favRef = doc(db, "users", user.uid, "favorites", String(song.id));
                const favSnap = await getDoc(favRef);
                const img = favBtn.querySelector("img");

                if (favSnap.exists()) {
                    await deleteDoc(favRef);
                    img.src = "/images/heart_gray_icon.svg";
                    favBtn.classList.remove("active");
                } else {
                    await setDoc(favRef, {
                        title:      song.title,
                        artist:     song.artist,
                        mp3URL:     song.songPath     || "",
                        coverURL:   song.artCoverPath || "",
                        genre:      song.genre        || "",
                        language:   song.language     || "",
                        difficulty: song.difficulty   || ""
                    });
                    img.src = "/images/heart_icon.svg";
                    favBtn.classList.add("active");
                }
                loadFavoriteStates();
            };
        }
        songListInner.appendChild(card);
    });
}


// ─── SETTINGS MODAL ───────────────────────────────────────────────────────────

// Open modal
document.getElementById("settings").addEventListener("click", () => {
    document.getElementById("settingsModal").style.visibility = "visible";
});

// Close on X button
document.getElementById("closeSettingsBtn").addEventListener("click", () => {
    document.getElementById("settingsModal").style.visibility = "hidden";
});

// Close when clicking the dark overlay outside the panel
document.getElementById("settingsModal").addEventListener("click", (e) => {
    if (e.target === document.getElementById("settingsModal")) {
        document.getElementById("settingsModal").style.visibility = "hidden";
    }
});

// UPDATED: volume slider now also updates the volumeLabel text
document.getElementById("volumeSlider").addEventListener("input", function () {
    userVolume = parseFloat(this.value);
    teaserPlayer.volume = userVolume;
    userInteracted = true;
    document.getElementById("volumeLabel").innerText = Math.round(userVolume * 100) + "%"; // ← ADDED
    saveUserPreferences();
});

// UPDATED: scroll slider (unchanged logic, kept here for clarity)
document.getElementById("scrollSlider").addEventListener("input", function () {
    scrollSpeed = 550 - parseInt(this.value);
    if (moveInterval) {
        const isTop = scrollTopZone.matches(":hover");
        if (isTop) restartScrollInterval("up");
        else restartScrollInterval("down");
    }

    const val = parseInt(this.value);
    let label;
    if (val <= 150) label = "🐢 Slow";
    else if (val <= 300) label = "Normal";
    else if (val <= 450) label = "⚡ Fast";
    else label = "🚀 Turbo";
    document.getElementById("scrollSpeedLabel").innerText = label;

    saveUserPreferences();
});

// UPDATED: reset button now also updates volumeLabel and closes the modal
document.getElementById("resetPrefsBtn").addEventListener("click", async function (e) {
    e.preventDefault();

    userVolume = 1;
    scrollSpeed = 200;

    document.getElementById("volumeSlider").value = 1;
    document.getElementById("volumeLabel").innerText = "100%";
    document.getElementById("scrollSlider").value = 300;
    document.getElementById("scrollSpeedLabel").innerText = "Normal";

    teaserPlayer.volume = userVolume;

    await saveUserPreferences();

    document.getElementById("settingsModal").style.visibility = "hidden";
});

// ─────────────────────────────────────────────────────────────────────────────


function selectSong(song, card) {
    selectedSong = song;
    document.querySelectorAll(".songCard").forEach(c => c.classList.remove("selected"));
    card.classList.add("selected");

    songName.innerText = song.title;
    artistName.innerText = song.artist;

    const clickedIndex = currentList.indexOf(song);
    if (clickedIndex !== -1) {
        let distance = clickedIndex - currentIndex;
        if (distance > currentList.length / 2) distance -= currentList.length;
        if (distance < -currentList.length / 2) distance += currentList.length;
        currentIndex = clickedIndex;
        updateTrackSelect();
    }

    singButton.disabled = false;
}

singButton.onclick = () => {
    if (!selectedSong) return;
    window.location.href = "/musicplayer?song=" + selectedSong.id;
};

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

        let prevOffset = card._prevOffset ?? offset;
        if (Math.abs(offset - prevOffset) > total / 2) {
            card.style.transition = "none";
        } else {
            card.style.transition = "";
        }
        card._prevOffset = offset;

        const scaleValues = [1.1, 0.95, 0.85, 0.7, 0.6];
        const opacityValues = [1, 0.8, 0.6, 0.4, 0.3];

        const scale = scaleValues[Math.abs(offset)] || 0.6;
        const opacity = opacityValues[Math.abs(offset)] || 0.3;
        const zIndex = 5 - Math.abs(offset);

        const y = offset * baseY;
        const x = -Math.abs(offset);

        card.style.transform = `translate(-50%, calc(-50% + ${y}px)) translateX(${x}px) rotateY(0deg) scale(${scale})`;
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
        favoriteButtonRight.dataset.id = String(centerSong.id);
        loadFavoriteStates();

        if (currentTeaserId !== centerSong.id) {
            currentTeaserId = centerSong.id;
            if (userInteracted) {
                playTeaserWithFade(centerSong);
            } else {
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

        teaserPlayer.pause();
        teaserPlayer.currentTime = 0;
        teaserPlayer.volume = userVolume;
        clearInterval(teaserFadeInterval);
        clearTimeout(teaserReplayTimeout);
        currentTeaserId = null;
    }
}

function moveDown() {
    currentIndex++;
    if (currentIndex >= currentList.length) currentIndex = 0;
    updateTrackSelect();
}

function moveUp() {
    currentIndex--;
    if (currentIndex < 0) currentIndex = currentList.length - 1;
    updateTrackSelect();
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

function buildCurrentList(filteredSongs) {
    let list = [...filteredSongs];
    const placeholdersNeeded = Math.max(minSongs - list.length, 0);
    const half = Math.floor(placeholdersNeeded / 2);

    for (let i = 0; i < half; i++) {
        list.unshift({ title: "???", artist: "Unknown Artist", genre: "???", difficulty: "???", language: "???", isPlaceholder: true });
    }
    for (let i = half; i < placeholdersNeeded; i++) {
        list.push({ title: "???", artist: "Unknown Artist", genre: "???", difficulty: "???", language: "???", isPlaceholder: true });
    }

    return list;
}

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
    teaserPlayer.volume = userInteracted ? userVolume : 0;
    teaserPlayer.play().catch(() => {});

    teaserPlayer.ontimeupdate = () => {
        if (teaserPlayer.duration && teaserPlayer.currentTime >= teaserPlayer.duration - TEASER_FADE_DURATION / 1000) {
            if (teaserFadeInterval) return;

            const fadeSteps = 20;
            const fadeStepTime = TEASER_FADE_DURATION / fadeSteps;
            let currentStep = 0;
            teaserFadeInterval = setInterval(() => {
                currentStep++;
                teaserPlayer.volume = userVolume * (1 - currentStep / fadeSteps);
                if (currentStep >= fadeSteps) {
                    clearInterval(teaserFadeInterval);
                    teaserFadeInterval = null;
                }
            }, fadeStepTime);
        }
    };

    teaserPlayer.onended = () => {
        teaserReplayTimeout = setTimeout(() => {
            playTeaserWithFade(song);
        }, TEASER_REPLAY_DELAY);
    };
}

async function loadFavoriteStates() {
    const user = auth.currentUser;
    if (!user) return;

    const snapshot = await getDocs(collection(db, "users", user.uid, "favorites"));
    const favIds = snapshot.docs.map(d => d.id);

    document.querySelectorAll(".favoriteButton").forEach(btn => {
        const isFav = favIds.includes(String(btn.dataset.id));
        const img = btn.querySelector("img");
        if (isFav) {
            img.src = "/images/heart_icon.svg";
            btn.classList.add("active");
        } else {
            img.src = "/images/heart_gray_icon.svg";
            btn.classList.remove("active");
        }
    });

    document.querySelectorAll(".favoriteButtonRight").forEach(btn => {
        const id = btn.dataset.id;
        if (!id) return;
        const isFav = favIds.includes(String(id));
        const img = btn.querySelector("img");
        if (isFav) {
            img.src = "/images/heart_icon.svg";
            btn.classList.add("active");
        } else {
            img.src = "/images/heart_gray_icon.svg";
            btn.classList.remove("active");
        }
    });
}

onAuthStateChanged(auth, user => {
    if (user) {
        document.getElementById("loggedIn").style.display = "block";
        document.getElementById("loggedOut").style.display = "none";
        loadFavoriteStates();
        loadUserPreferences(user);
    } else {
        document.getElementById("loggedIn").style.display = "none";
        document.getElementById("loggedOut").style.display = "block";
    }
});

document.getElementById("logoutBtn").onclick = async () => {
    await signOut(auth);
    location.reload();
};

async function saveUserPreferences() {
    const user = auth.currentUser;
    if (!user) return;

    await setDoc(doc(db, "users", user.uid, "preferences", "settings"), {
        volume: userVolume,
        scrollSpeed: scrollSpeed
    });
}

// UPDATED: also syncs volumeLabel when loading saved preferences
async function loadUserPreferences(user) {
    const prefSnap = await getDoc(doc(db, "users", user.uid, "preferences", "settings"));
    if (!prefSnap.exists()) return;

    const prefs = prefSnap.data();

    if (prefs.volume !== undefined) {
        userVolume = prefs.volume;
        teaserPlayer.volume = userVolume;
        document.getElementById("volumeSlider").value = userVolume;
        document.getElementById("volumeLabel").innerText = Math.round(userVolume * 100) + "%"; // ← ADDED
    }

    if (prefs.scrollSpeed !== undefined) {
        scrollSpeed = prefs.scrollSpeed;
        const sliderVal = 550 - scrollSpeed;
        document.getElementById("scrollSlider").value = sliderVal;

        let label;
        if (sliderVal <= 150) label = "🐢 Slow";
        else if (sliderVal <= 300) label = "Normal";
        else if (sliderVal <= 450) label = "⚡ Fast";
        else label = "🚀 Turbo";
        document.getElementById("scrollSpeedLabel").innerText = label;
    }
}