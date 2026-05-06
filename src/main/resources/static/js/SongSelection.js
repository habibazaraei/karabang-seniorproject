//SongSelection.js
//@Author Jason
//@Editor Tyler

import { db, auth, doc, setDoc, deleteDoc, getDoc, getDocs, collection, onAuthStateChanged, signOut } from './firebase.js';

let songList = document.getElementById("songList")
let searchField = document.getElementById("searchField")

let songName = document.getElementById("songName")
let artistName = document.getElementById("artistName")
let songImage = document.getElementById("songImage")
let singButtonPrimary = document.getElementById("singButtonPrimary")
let singButtonSecondary = document.getElementById("singButtonSecondary")

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

let teaserMuteButton = document.getElementById("teaserMuteButton");
let teaserVolumeIcon = document.getElementById("teaserVolumeIcon");

let userInteracted = false;
teaserPlayer.volume = 0;
teaserPlayer.loop = false;
let userVolume = 1;

teaserPlayer.play().catch(() => {});
teaserPlayer.pause();

let topSongsEnabled = false;
let shuffleEnabled = false;

let lastNonZeroVolume = 1;
let isMuted = false;

let teaserFadeInterval = null;
let teaserReplayTimeout = null;
let currentTeaserId = null;
// preloading images
const images = [
    "../images/scoredButton.png",
    "../images/playButton.png",
    "../images/scoredplayButton.png",
    "../images/textureCirclesDropDown.png"
];

images.forEach(src => {
    const img = new Image();
    img.src = src;
    img.decode?.();
});
// for primary and secondary hovering
const group = document.getElementById("singButtonGroup");
const primary = document.querySelector(".primary");
const secondary = document.querySelector(".secondary");

primary.addEventListener("mouseenter", () => {
    group.style.backgroundImage = 'url("../images/scoredButton.png")';
});

secondary.addEventListener("mouseenter", () => {
    group.style.backgroundImage = 'url("../images/playButton.png")';
});

group.addEventListener("mouseleave", () => {
    group.style.backgroundImage = 'url("../images/scoredplayButton.png")';
});

searchField.addEventListener("click", () => {
    playGeneralClickSound();
});
// sound effect
const scrollSound = new Audio("/soundEffects/Synth_Tick_B_hi.wav");
const categoryButtonSound = new Audio("/soundEffects/categoryButton.mp3");
const heartButtonSound = new Audio("/soundEffects/heartSound.ogg");
const heartButtonOffSound = new Audio("/soundEffects/heartOffSound.ogg");
const generalClickSound = new Audio("/soundEffects/click.mp3");
const hoverSound = new Audio("/soundEffects/hover.mp3");

let sfxVolume = 0.4;
let lastSfxVolume = 0.4;
let isSfxMuted = false;

scrollSound.volume = isSfxMuted ? 0 : sfxVolume;
categoryButtonSound.volume = isSfxMuted ? 0 : sfxVolume;
heartButtonSound.volume = isSfxMuted ? 0 : sfxVolume;
heartButtonOffSound.volume = isSfxMuted ? 0 : sfxVolume;
generalClickSound.volume = isSfxMuted ? 0 : sfxVolume;
hoverSound.volume = isSfxMuted ? 0 : sfxVolume;
let lastScrollSoundTime = 0;
const scrollSoundCooldown = 5; // ms

// clicking cursor effect
document.addEventListener("click", (e) => {
    createClickEffect(e.clientX, e.clientY);
});
// hover sfx
let lastHoverTime = 0;
const hoverCooldown = 50;

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

    let currentY = e.type === "touchmove"
        ? e.touches[0].clientY
        : e.clientY;

    let delta = currentY - startY;

    const threshold = 80;
    let step = Math.round(-delta / threshold);

    let newIndex = (startIndex + step + currentList.length) % currentList.length;

    if (newIndex !== currentIndex) {
        currentIndex = newIndex;
        updateTrackSelect();
        playScrollSound();
    }
}

// End drag
document.addEventListener("mouseup", endDrag);
document.addEventListener("touchend", endDrag);

function endDrag(e) {
    if (!isDragging) return;
    isDragging = false;
}
let wheelCooldown = false;
// MOUSE WHEEL SCROLLING
songList.addEventListener("wheel", (e) => {
    e.preventDefault();

    if (wheelCooldown) return;
    wheelCooldown = true;

    if (e.deltaY > 0) moveDown();
    else moveUp();

    playScrollSound();

    setTimeout(() => wheelCooldown = false, scrollSpeed);
});
function restartScrollInterval(direction) {
    clearInterval(moveInterval);
    moveInterval = setInterval(direction === "up" ? moveUp : moveDown, scrollSpeed);
}


// Restart Category when searching

searchField.oninput = () => {
    const query = searchField.value.toLowerCase();

    // resets all category buttons
    categoryButtons.forEach(button => {
        const name = button.innerText.trim();

        sortState[name] = "none";
        button.classList.remove("active");

        setButtonIcon(button, "default");

        // reset favorite icon too
        const heart = button.querySelector(".sortIconHeart");
        if (heart) {
            heart.src = "/images/heart_gray_icon.svg";
        }
    });

    // 2. reset favorite button
    const favBtn = [...categoryButtons].find(b => b.innerText.trim() === "Favorites");
    if (favBtn) {
        favBtn.classList.remove("active");
        const heart = favBtn.querySelector(".sortIconHeart");
        if (heart) heart.src = "/images/heart_gray_icon.svg";
        sortState["Favorites"] = "none";
    }

    document.getElementById("categoryTabs").style.height = "0px";

    refreshSongList();
};
//Initiates the toggle down menu itself.
function toggleDropdown() {
    document.getElementById("myDropdown").classList.toggle("show");
}

// toggle when clicking profile button
document.getElementById("profile").addEventListener("click", (e) => {
    playGeneralClickSound();
    e.stopPropagation();
    toggleDropdown();
});

// close when clicking outside
window.addEventListener("click", function (e) {
    if (!e.target.closest("#profile")) {
        document.getElementById("myDropdown").classList.remove("show");
    }
});


// Category sort
categoryButtons.forEach(buttons => {

    const name = buttons.innerText.trim();
    sortState[name] = "none";

    buttons.addEventListener("click", async () => {
        playCategorySound();
        resetAllExcept(buttons);
        document.querySelectorAll(".categoryButton").forEach(b => {
            if (b.innerText.trim() !== "Favorites") {
                b.classList.remove("active");
            }
        });
        // cycle asc → desc → none → asc ...
        // Favorites should NOT cycle sort
        if (name !== "Favorites" && name !== "Popular" && name !== "Shuffle" ){
            if (sortState[name] === "none") sortState[name] = "asc";
            else if (sortState[name] === "asc") sortState[name] = "desc";
            else sortState[name] = "none";
        }

        if (name === "Favorites") {
            const user = auth.currentUser;
            if (!user) {
                alert("Please log in to see favorites!");
                return;
            }

            const isOn = sortState[name] === "on";
            sortState[name] = isOn ? "none" : "on";

            const heart = buttons.querySelector(".sortIconHeart");
            if (heart) {
                heart.src = sortState[name] === "on"
                    ? "/images/heart_icon.svg"
                    : "/images/heart_gray_icon.svg";
            }

            buttons.classList.toggle("active", sortState[name] === "on");

            document.getElementById("categoryTabs").style.height =
                sortState[name] === "on" ? "40px" : "0px";

            const snapshot = await getDocs(collection(db, "users", user.uid, "favorites"));
            const favIds = snapshot.docs.map(d => d.id);

            let filtered;

            if (sortState[name] === "on") {
                filtered = songs.filter(s => favIds.includes(String(s.id)));
            } else {
                filtered = songs;
            }

            filtered.sort((a, b) => a.id - b.id);

            currentList = buildCurrentList(filtered);
            currentIndex = currentList.findIndex(s => !s.isPlaceholder);
            if (currentIndex === -1) currentIndex = 0;

            renderSongCardsNoAnimation(false);
            loadFavoriteStates();
            return;
        }

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

        if (name === "Popular") {

            const isOn = sortState[name] === "on";
            sortState[name] = isOn ? "none" : "on";

            buttons.classList.toggle("active", sortState[name] === "on");

            const topIcon = buttons.querySelector(".sortIcon");
            if (topIcon) {
                topIcon.src = "/images/top_songs_icon.svg";
            }

            document.getElementById("categoryTabs").style.height =
                sortState[name] === "on" ? "40px" : "0px";

            if (sortState[name] !== "on") {
                currentList = buildCurrentList(songs);
                currentIndex = 0;
                renderSongCardsNoAnimation(false);
                loadFavoriteStates();
                return;
            }

            try {
                const snapshot = await getDocs(collection(db, "songStats"));

                const stats = snapshot.docs
                    .map(d => ({ id: d.id, ...d.data() }))
                    .sort((a, b) => (b.playCount || 0) - (a.playCount || 0));

                const top10Ids = stats.slice(0, 10).map(s => s.id);

                const topSongs = songs
                    .filter(s => top10Ids.includes(String(s.id)))
                    .sort((a, b) => {
                        const aCount = stats.find(s => s.id === String(a.id))?.playCount || 0;
                        const bCount = stats.find(s => s.id === String(b.id))?.playCount || 0;
                        return bCount - aCount;
                    });

                currentList = buildCurrentList(topSongs);
                currentIndex = currentList.findIndex(s => !s.isPlaceholder);
                if (currentIndex === -1) currentIndex = 0;

                renderSongCardsNoAnimation(false);

            } catch (err) {
                console.error("Failed to load Popular:", err);
            }

            return;
        }


        if (name !== "Popular" && name !== "Shuffle" && name !== "Favorites") {
            setButtonIcon(
                buttons,
                sortState[name] === "none"
                    ? "default"
                    : (sortState[name] === "asc" ? "up" : "down")
            );
        }

        // reset other buttons
        function resetAllExcept(activeButton) {
            topSongsEnabled = false;
            shuffleEnabled = false;

            categoryButtons.forEach(b => {
                const bName = b.innerText.trim();

                if (bName === "Popular" || bName === "Shuffle") return;

                if (b !== activeButton) {
                    sortState[bName] = "none";
                    setButtonIcon(b, "default");
                    b.classList.remove("active");

                    const heart = b.querySelector(".sortIconHeart");
                    if (heart) {
                        heart.src = "/images/heart_gray_icon.svg";
                    }
                }
            });
        }

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
        loadFavoriteStates(); //Loads favorites on icon (Shows red heart)
    });
});

// favorite button Right
favoriteButtonRight.addEventListener("click", async () => {
    if (!selectedSong) return;

    const user = auth.currentUser;
    if (!user) {
        alert("Please log in to favorite songs!");
        return;
    }

    const img = favoriteButtonRight.querySelector("img");
    const isCurrentlyFavorite = favoriteButtonRight.classList.contains("active");

    if (isCurrentlyFavorite) {
        playHeartOffSound();
        img.src = "/images/heart_gray_icon.svg";
        favoriteButtonRight.classList.remove("active");
    } else {
        playHeartSound();
        img.src = "/images/heart_icon.svg";
        favoriteButtonRight.classList.add("active");
    }

    const cardHeart = document.querySelector(`.favoriteButton[data-id="${selectedSong.id}"] img`);
    if (cardHeart) {
        cardHeart.src = isCurrentlyFavorite ? "/images/heart_gray_icon.svg" : "/images/heart_icon.svg";
        cardHeart.parentElement.classList.toggle("active", !isCurrentlyFavorite);
    }

    // 3. FIREBASE UPDATE IN BACKGROUND
    const favRef = doc(db, "users", user.uid, "favorites", String(selectedSong.id));

    try {
        if (isCurrentlyFavorite) {
            await deleteDoc(favRef);
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
        }
    } catch (error) {
        console.error("Sync failed:", error);
    }

    loadFavoriteStates();
});
// cursor effect
function createClickEffect(x, y) {
    for (let i = 0; i < 2; i++) {
        const effect = document.createElement("div");
        effect.className = "click-effect";

        effect.style.left = x + "px";
        effect.style.top = y + "px";

        // delay second ring slightly
        effect.style.animationDelay = (i * 0.08) + "s";

        document.body.appendChild(effect);

        setTimeout(() => effect.remove(), 700);
    }
}
// plays sound effect
function playScrollSound() {
    const now = Date.now();
    if (now - lastScrollSoundTime < scrollSoundCooldown) return;

    lastScrollSoundTime = now;

    scrollSound.currentTime = 0;
    scrollSound.volume = sfxVolume;
    scrollSound.play();
}
function playCategorySound() {
    categoryButtonSound.volume = sfxVolume;
    categoryButtonSound.play();
}
function playHeartSound(){
    heartButtonSound.volume = sfxVolume;
    heartButtonSound.play();
}
function playHeartOffSound(){
    heartButtonOffSound.currentTime = 0;
    heartButtonOffSound.volume = sfxVolume;
    heartButtonOffSound.play();
}
function playGeneralClickSound() {
    generalClickSound.currentTime = 0;
    generalClickSound.volume = sfxVolume;
    generalClickSound.play();
}
// update SFX
function updateSFXLabel() {
    document.getElementById("sfxLabel").innerText =
        Math.round(sfxVolume * 100) + "%";
}
// updates volume icon
function updateTeaserVolumeIcon() {
    if (teaserPlayer.volume === 0) {
        teaserVolumeIcon.src = "/images/mute_icon.svg";
    } else if (teaserPlayer.volume <= 0.5) {
        teaserVolumeIcon.src = "/images/volume_low_icon.svg";
    } else {
        teaserVolumeIcon.src = "/images/volume_high_icon.svg";
    }
}
let sfxVolumeIcon = document.getElementById("sfxVolumeIcon");
// updates volume icon
function updateSFXVolumeIcon() {
    if (sfxVolume === 0) {
        sfxVolumeIcon.src = "/images/mute_icon.svg";
    } else if (sfxVolume <= 0.5) {
        sfxVolumeIcon.src = "/images/volume_low_icon.svg";
    } else {
        sfxVolumeIcon.src = "/images/volume_high_icon.svg";
    }
}
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
    // Create song cards
    addSongCard(currentList);
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
    addSongCard(currentList);
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
    loadFavoriteStates(); //Loads favorites on icon (Shows red heart)
}
function addSongCard(listToRender){

    songListInner.innerHTML = "";
    listToRender.forEach((song, i) => {
        let card = document.createElement("button");
        card.className = "songCard" + (song.isPlaceholder ? " placeholder" : "");

        // Build songBottom HTML
        let songBottomClass = "songBottom";
        let songCardClass = "songCard";
        if (!song.isPlaceholder && song.genre?.trim().toLowerCase().includes("pop")){
            songBottomClass += " pop";
            songCardClass += " pop";
        }else if (!song.isPlaceholder && song.genre?.trim().toLowerCase().includes("rock")) {
            songBottomClass += " rock";
            songCardClass += " rock";
        }
        card.className = songCardClass + (song.isPlaceholder ? " placeholder" : "");
        card.innerHTML = `
            <div class="songTop">
                ${song.title}
                <button class="favoriteButton" data-id="${song.id}">
                   <img src="/images/heart_gray_icon.svg" alt="favorite" width="16" height="16">
               </button>
            </div>
            <div class="${songBottomClass}">
                <span class="artistText">${song.artist}</span>
                <div class="songInfoRight">
                    <span class="difficultyText">${song.difficulty}</span>
                    <span class="genre">${song.genre}</span>
                    <span class="languageText">${song.language}</span>
                </div>

            </div>
        `;
        if (!song.isPlaceholder) {
            card.onclick = () => {
                const clickedIndex = currentList.indexOf(song);
                if (clickedIndex !== -1) {
                    currentIndex = clickedIndex;
                    playScrollSound();
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

                const img = favBtn.querySelector("img");
                const favRef = doc(db, "users", user.uid, "favorites", String(song.id));
                const isCurrentlyActive = favBtn.classList.contains("active");

                if (isCurrentlyActive) {
                    playHeartOffSound();
                    img.src = "/images/heart_gray_icon.svg";
                    favBtn.classList.remove("active");
                } else {
                    playHeartSound();
                    img.src = "/images/heart_icon.svg";
                    favBtn.classList.add("active");
                }

                if (selectedSong && String(selectedSong.id) === String(song.id)) {
                    const rightImg = favoriteButtonRight.querySelector("img");
                    if (isCurrentlyActive) {
                        favoriteButtonRight.classList.remove("active");
                        rightImg.src = "/images/heart_gray_icon.svg";
                    } else {
                        favoriteButtonRight.classList.add("active");
                        rightImg.src = "/images/heart_icon.svg";
                    }
                }
                try {
                    if (isCurrentlyActive) {
                        await deleteDoc(favRef);
                    } else {
                        await setDoc(favRef, {
                            title: song.title,
                            artist: song.artist,
                            mp3URL: song.songPath || "",
                            coverURL: song.artCoverPath || "",
                            genre: song.genre || "",
                            language: song.language || "",
                            difficulty: song.difficulty || ""
                        });
                    }
                } catch (err) {
                    console.error("Firebase Error:", err);
                }

                // 4. SYNC EVERYTHING ELSE
                loadFavoriteStates();
            };
        }
        songListInner.appendChild(card);
    });
}

// anywhere that is not a button click sound
document.addEventListener("click", (e) => {
    if (e.target.closest("button, a, input, .topButton, .categoryButton")) return;

    const sound = new Audio("/soundEffects/waterdrop.m4a");
    sound.volume = isSfxMuted ? 0 : sfxVolume;
    sound.play();

    createClickEffect(e.clientX, e.clientY);
});
// hovering scored or play buttons
document.querySelectorAll("#singButtonPrimary, #singButtonSecondary").forEach(btn => {
    btn.addEventListener("mouseenter", () => {
        const now = Date.now();
        if (now - lastHoverTime < hoverCooldown) return;

        lastHoverTime = now;

        hoverSound.currentTime = 0;
        hoverSound.volume = sfxVolume;
        hoverSound.play().catch(() => {});
    });
});
// ─── SETTINGS MODAL ───────────────────────────────────────────────────────────
const settingsBtn = document.getElementById('settings');
// Open modal
document.getElementById("settings").addEventListener("click", () => {
    playGeneralClickSound();
    document.getElementById("settingsModal").style.visibility = "visible";
    settingsBtn.classList.add('spinning');
    setTimeout(() => {
        settingsBtn.classList.remove('spinning');
    }, 500);
});


// Close on X button
document.getElementById("closeSettingsBtn").addEventListener("click", () => {
    playGeneralClickSound();
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

    // If the user manually slides to a volume > 0, update our "memory"
    if (userVolume > 0) {
        lastNonZeroVolume = userVolume;
        isMuted = false;
    } else {
        isMuted = true;
    }

    document.getElementById("volumeLabel").innerText = Math.round(userVolume * 100) + "%";
    updateTeaserVolumeIcon();
    saveUserPreferences();
});

document.getElementById("sfxSlider").addEventListener("input", function () {
    sfxVolume = parseFloat(this.value);
    scrollSound.volume = sfxVolume;
    updateSFXLabel();

    if (sfxVolume > 0) {
        lastSfxVolume = sfxVolume;
        isSfxMuted = false;
    }else {
        isSfxMuted = true;
    }
    document.getElementById("sfxLabel").innerText = Math.round(sfxVolume * 100) + "%";
    updateSFXVolumeIcon();
    saveUserPreferences();
});
// mute button for teasers
teaserMuteButton.onclick = () => {
    playGeneralClickSound();
    if (teaserPlayer.volume > 0) {
        // Record the current volume before muting
        lastNonZeroVolume = teaserPlayer.volume;
        teaserPlayer.volume = 0;
        isMuted = true;
    } else {
        // Restore to the last known volume (even if it was 0.01)
        teaserPlayer.volume = lastNonZeroVolume;
        isMuted = false;
    }

    // Update UI
    userVolume = teaserPlayer.volume;
    document.getElementById("volumeSlider").value = userVolume;
    document.getElementById("volumeLabel").innerText = Math.round(userVolume * 100) + "%";

    updateTeaserVolumeIcon();
    saveUserPreferences();
};

// mute button for sound effects
sfxMuteButton.onclick = () => {
    playGeneralClickSound();
    if (!isSfxMuted) {
        lastSfxVolume = sfxVolume;
        sfxVolume = 0;
        isSfxMuted = true;
    } else {
        sfxVolume = lastSfxVolume;
        isSfxMuted = false;
    }

    scrollSound.volume = sfxVolume;

    document.getElementById("sfxSlider").value = sfxVolume;
    updateSFXLabel();
    updateSFXVolumeIcon();
    saveUserPreferences();
};
let scrollFadeTimeout = null;

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
    if (val <= 150) label = "Slow";
    else if (val <= 300) label = "Normal";
    else if (val <= 450) label = "Fast";
    else label = "Turbo";
    document.getElementById("scrollSpeedLabel").innerText = label;

    saveUserPreferences();
    clearTimeout(scrollFadeTimeout);
    scrollFadeTimeout = setTimeout(() => {
        document.getElementById("scrollControl").style.display = "none";
    }, 3000);
});

// UPDATED: reset button now also updates volumeLabel and closes the modal
document.getElementById("resetPrefsBtn").addEventListener("click", async function (e) {
    playGeneralClickSound();
    e.preventDefault();

    userVolume = 1;
    scrollSpeed = 200;

    document.getElementById("volumeSlider").value = 1;
    document.getElementById("volumeLabel").innerText = "100%";

    document.getElementById("sfxSlider").value = 1;
    document.getElementById("sfxLabel").innerText = "100%";

    document.getElementById("scrollSlider").value = 300;
    document.getElementById("scrollSpeedLabel").innerText = "Normal";

    teaserPlayer.volume = userVolume;

    await saveUserPreferences();

    document.getElementById("settingsModal").style.visibility = "hidden";
});

// ─────────────────────────────────────────────────────────────────────────────

//END OF EDITING BY TYLER
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

    singButtonPrimary.disabled = false;
    singButtonSecondary.disabled = false;
}

singButtonPrimary.onclick = () => {
    if (!selectedSong) return;
    window.location.href = "/musicplayer?song=" + selectedSong.id;
};
singButtonSecondary.onclick = () => {
    if (!selectedSong) return;
    window.location.href = "/musicplayerplay?song=" + selectedSong.id;
};
singButtonVS.onclick = () => {
    if (!selectedSong) return;
    window.location.href = "/musicplayervs?song=" + selectedSong.id;
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
        // it disables transition for wrapping cards
        let prevOffset = card._prevOffset ?? offset;
        if (Math.abs(offset - prevOffset) > total / 2) {
            card.style.transition = "none";
        }
        else {
            card.style.transition = "";
        }
        card._prevOffset = offset;
        const rotY = 0;
        const scaleValues = [1.1, 0.95, 0.85, 0.7, 0.6];
        const opacityValues = [1, 0.8, 0.6, 0.4, 0.3];

        const scale = scaleValues[Math.abs(offset)] || 0.6;
        const opacity = opacityValues[Math.abs(offset)] || 0.3;
        const zIndex = 5 - Math.abs(offset);

        const y = offset * baseY;
        const x = -Math.abs(offset);

        card.style.transform = `translate(-50%, calc(-50% + ${y}px)) translateX(${x}px) rotateY(${rotY}deg) scale(${scale})`;
        card.style.zIndex = zIndex;
        card.style.opacity = opacity;
    });

    const centerSong = currentList[currentIndex];



    if (centerSong && !centerSong.isPlaceholder) {
        selectedSong = centerSong;
        syncHeartState(centerSong);
        cards[currentIndex].classList.add("selected");

        const songTextEl = document.getElementById("songName").parentElement;
        const artistTextEl = document.getElementById("artistName").parentElement;

        // reset old scroll state FIRST
        resetScroll(songTextEl);
        resetScroll(artistTextEl);

        songName.innerText = centerSong.title || "???";
        songName.dataset.text = centerSong.title || "???";

        artistName.innerText = centerSong.artist || "???";
        artistName.dataset.text = centerSong.artist || "???";

        // after songCard it updates scroll if name is long
        requestAnimationFrame(() => {
            scheduleScrollCheck();
        });
        songImage.src = centerSong.artCoverPath || "/images/questionmark_icon.svg";

        singButtonPrimary.disabled = false;
        favoriteButtonRight.dataset.id = String(centerSong.id);
        loadFavoriteStates();

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
       singButtonPrimary.disabled = true;
       songName.innerText = "???";
       songName.dataset.text = "???";

       artistName.innerText = "???";
       artistName.dataset.text = "???";
       songImage.src = "/images/questionmark_icon.svg";
       songName.parentElement.classList.remove('can-scroll');
       artistName.parentElement.classList.remove('can-scroll');
       // Stop teaser
       teaserPlayer.pause();
       teaserPlayer.currentTime = 0;
       teaserPlayer.volume = userVolume; // ← change this from 1 to userVolume
       clearInterval(teaserFadeInterval);
       clearTimeout(teaserReplayTimeout);
       currentTeaserId = null;
   }
}
async function syncHeartState(song) {
    const user = auth.currentUser;
    if (!user || !song) return;

    const favRef = doc(db, "users", user.uid, "favorites", String(song.id));
    const snap = await getDoc(favRef);

    const img = heartButton.querySelector("img");

    if (snap.exists()) {
        heartButton.classList.add("active");
        img.src = "/images/heart_icon.svg";
    } else {
        heartButton.classList.remove("active");
        img.src = "/images/heart_gray_icon.svg";
    }
}

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

        // This builds your currentList and renders the cards
        refreshSongList();

        // NEW: Check if we should center a specific song
        const params = new URLSearchParams(window.location.search);
        const songIdFromUrl = params.get("song");

        if (songIdFromUrl && currentList.length > 0) {
            // Find where this song sits in the currentList
            const targetIndex = currentList.findIndex(s => String(s.id) === String(songIdFromUrl));

            if (targetIndex !== -1) {
                currentIndex = targetIndex;
                // Refresh the visual positions
                updateTrackSelect();

                // Update the right-side info panel (song name, artist, heart)
                const centerSong = currentList[currentIndex];
                if (centerSong && !centerSong.isPlaceholder) {
                    selectedSong = centerSong;
                    songName.innerText = centerSong.title;
                    artistName.innerText = centerSong.artist;
                    syncHeartState(centerSong);
                }
            }
        }

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
    teaserPlayer.volume = userInteracted ? userVolume : 0;

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
                teaserPlayer.volume = userVolume * (1 - currentStep / fadeSteps);
                if (currentStep >= fadeSteps) {
                    clearInterval(teaserFadeInterval);
                    teaserFadeInterval = null;
                }
            }, fadeStepTime);
        }
    };
/*
    // Replay after delay
    teaserPlayer.onended = () => {
        teaserReplayTimeout = setTimeout(() => {
            playTeaserWithFade(song);
        }, TEASER_REPLAY_DELAY);
    };

 */
}



// ADDED BY TYLER - LOAD FAVORITE STATE
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

// ADDED BY TYLER

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


//So we can save settings preferences to a users account.
async function saveUserPreferences() {
    const user = auth.currentUser;
    if (!user) return;

    await setDoc(doc(db, "users", user.uid, "preferences", "settings"), {
        volume: userVolume,
        lastNonZeroVolume: lastNonZeroVolume,
        isMuted: isMuted,

        scrollSpeed: scrollSpeed,

        sfxVolume: sfxVolume,
        isSfxMuted: isSfxMuted,
        lastSfxVolume: lastSfxVolume
    });
}

// UPDATED: also syncs volumeLabel when loading saved preferences
async function loadUserPreferences(user) {
    const prefSnap = await getDoc(doc(db, "users", user.uid, "preferences", "settings"));
    if (!prefSnap.exists()) return;

    const prefs = prefSnap.data();

    if (prefs.lastNonZeroVolume !== undefined) {
        lastNonZeroVolume = prefs.lastNonZeroVolume;
    }

    if (prefs.volume !== undefined) {
        userVolume = prefs.volume;
        teaserPlayer.volume = userVolume;
        isMuted = (userVolume === 0);

        document.getElementById("volumeSlider").value = userVolume;
        document.getElementById("volumeLabel").innerText = Math.round(userVolume * 100) + "%";
        updateTeaserVolumeIcon();
    }

    if (prefs.scrollSpeed !== undefined) {
        scrollSpeed = prefs.scrollSpeed;
        const sliderVal = 550 - scrollSpeed;
        document.getElementById("scrollSlider").value = sliderVal;

        let label;
        if (sliderVal <= 150) label = "Slow";
        else if (sliderVal <= 300) label = "Normal";
        else if (sliderVal <= 450) label = "Fast";
        else label = "Turbo";
        document.getElementById("scrollSpeedLabel").innerText = label;
    }
    if (prefs.sfxVolume !== undefined) {
        sfxVolume = prefs.sfxVolume;
        scrollSound.volume = sfxVolume;
        document.getElementById("sfxSlider").value = sfxVolume;
        updateSFXLabel();
    }

    if (prefs.isSfxMuted !== undefined) {
        isSfxMuted = prefs.isSfxMuted;
        updateSFXLabel();
    }

    updateSFXVolumeIcon();
}
// Scroll for right Info pane
// Listener if the screen change width
let resizeTimeout;

let lastOverflowState = null;

function getOverflowState() {
    const scrollEls = document.querySelectorAll(".scroll");

    return Array.from(scrollEls).map(el => {
        const child = el.firstElementChild;
        if (!child) return false;
        return child.scrollWidth > el.clientWidth;
    }).join("|");
}

window.addEventListener("resize", () => {
    clearTimeout(resizeTimeout);

    resizeTimeout = setTimeout(() => {
        const newState = getOverflowState();

        // ONLY run if overflow behavior changed
        if (newState !== lastOverflowState) {
            lastOverflowState = newState;

            const scrollEls = document.querySelectorAll(".scroll");
            scrollEls.forEach(resetScroll);
            scheduleScrollCheck();
        }
    }, 150);
});

// If song or artist is too long it will scroll instead
function updateScrollCheck() {
    maxScrollWidth = 0;

    const scrollEls = document.querySelectorAll(".scroll");

    // Check if ANY needs scrolling
    let shouldScroll = false;

    scrollEls.forEach(el => {
        const child = el.firstElementChild;
        if (!child) return;

        if (child.scrollWidth > el.clientWidth) {
            shouldScroll = true;
        }

        // Track max width regardless
        maxScrollWidth = Math.max(maxScrollWidth, child.scrollWidth);
    });

    // Apply SAME behavior to ALL
    scrollEls.forEach(el => {
        setupInfiniteScroll(el, shouldScroll);
    });
}
let scrollCheckQueued = false;

// This adds debounce to the scroll so there is no spam
function scheduleScrollCheck() {
    if (scrollCheckQueued) return;
    scrollCheckQueued = true;

    requestAnimationFrame(() => {
        updateScrollCheck();
        scrollCheckQueued = false;
    });
}

// Restarts scroll when song changes
function resetScroll(el) {
    const clone = el.querySelector(".clone");
    if (clone) clone.remove();

    el.classList.remove("can-scroll");

    const child = el.firstElementChild;
    if (!child) return;

    // reset animation completely
    child.style.animation = "none";
    child.style.minWidth = "";

    // force reflow so animation reset applies
    void child.offsetWidth;

    child.style.animation = "";
}
// Loops the Song name or artist if too long
let maxScrollWidth = 0;

function setupInfiniteScroll(el, forceScroll = false) {
    const child = el.firstElementChild;
    if (!child) return;

    const existingClone = el.querySelector(".clone");
    if (existingClone) existingClone.remove();

    if (forceScroll) {
        el.classList.add("can-scroll");

        const clone = child.cloneNode(true);
        clone.classList.add("clone");
        el.appendChild(clone);

        const speed = 30;
        const duration = maxScrollWidth / speed;

        child.style.animationDuration = duration + "s";
        clone.style.animationDuration = duration + "s";

        child.style.minWidth = maxScrollWidth + "px";
        clone.style.minWidth = maxScrollWidth + "px";

    } else {
        el.classList.remove("can-scroll");

        child.style.animation = "none";
        child.style.minWidth = "";
    }
}

//Scoreboard feature JS

const shuffleButton = document.getElementById("shuffleButton");

shuffleButton.addEventListener("click", () => {
    playCategorySound();

    shuffleEnabled = true;

    shuffleSong();

    shuffleButton.classList.add("active");
    const shuffleIcon = shuffleButton.querySelector(".sortIcon");
    if (shuffleIcon) {
        shuffleIcon.src = "/images/shuffle_icon.svg";
    }
    setTimeout(() => shuffleButton.classList.remove("active"), 150);
});

document.getElementById("closeScoreboardBtn").addEventListener("click", () => {
    document.getElementById("scoreboardModal").style.cssText = "display:none;";
});

document.getElementById("scoreboardModal").addEventListener("click", (e) => {
    if (e.target === document.getElementById("scoreboardModal")) {
        document.getElementById("scoreboardModal").style.cssText = "display:none;";
    }
});

// Populate song filter dropdown and reload scores when changed
document.getElementById("scoreboardSongFilter").addEventListener("change", async () => {
    await loadScoreboardEntries();
});

async function openGlobalScoreboard() {
    const modal = document.getElementById("scoreboardModal");
    modal.style.cssText = "display:flex !important; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.6); z-index:9999; align-items:center; justify-content:center;";

    // Populate song filter with actual song names
    const filter = document.getElementById("scoreboardSongFilter");
    filter.innerHTML = `<option value="all">All Songs</option>`;
    songs.forEach(s => {
        const opt = document.createElement("option");
        opt.value  = s.id;
        opt.textContent = `${s.title} — ${s.artist}`;
        filter.appendChild(opt);
    });

    const user = auth.currentUser;
        const yourBest = document.getElementById("scoreboardYourBest");
        if (user) {
            try {
                const songFilter = document.getElementById("scoreboardSongFilter").value;
                if (songFilter !== "all") {
                    const myRef  = doc(db, "scores", String(songFilter), "entries", user.uid);
                    const mySnap = await getDoc(myRef);
                    if (mySnap.exists()) {
                        yourBest.textContent = `Your best: ${mySnap.data().score.toLocaleString()}`;
                    } else {
                        yourBest.textContent = "You have no score for this song yet!";
                    }
                } else {
                    yourBest.textContent = "Select a song to see your personal best!";
                }
            } catch (_) {}
     } else {
                yourBest.textContent = "Log in to save your scores!";
            }

        await loadScoreboardEntries();
    }

async function loadScoreboardEntries() {
    const list     = document.getElementById("scoreboardList");
    const songFilter = document.getElementById("scoreboardSongFilter").value;
    list.innerHTML = `<div style="text-align:center; color:#aaa; padding:20px;">Loading...</div>`;
    const user = auth.currentUser;
    const yourBest = document.getElementById("scoreboardYourBest");
    if (user && songFilter !== "all") {
        try {
            const myRef  = doc(db, "scores", String(songFilter), "entries", user.uid);
            const mySnap = await getDoc(myRef);
            yourBest.textContent = mySnap.exists()
                ? `Your best: ${mySnap.data().score.toLocaleString()}`
                : "You have no score for this song yet!";
        } catch (_) {}
    } else if (songFilter === "all") {
        yourBest.textContent = "Select a song to see your personal best!";
    }

    const medals = ["🥇", "🥈", "🥉", "4️⃣", "5️⃣"];

    try {
        let allScores = [];

        if (songFilter === "all") {
            // Load top scores across all songs
            for (const song of songs) {
                const snapshot = await getDocs(collection(db, "scores", String(song.id), "entries"));
                snapshot.docs.forEach(d => {
                    allScores.push({ ...d.data(), songTitle: song.title });
                });
            }
        } else {
            // Load top scores for a specific song
            const song = songs.find(s => String(s.id) === songFilter);
            const snapshot = await getDocs(collection(db, "scores", songFilter, "entries"));
            snapshot.docs.forEach(d => {
                allScores.push({ ...d.data(), songTitle: song?.title || "Unknown" });
            });
        }

        // Sort by score descending, take top 5
        allScores.sort((a, b) => b.score - a.score);
        const top5 = allScores.slice(0, 5);

        if (top5.length === 0) {
            list.innerHTML = `<div style="text-align:center; color:#aaa; padding:20px;">No scores yet!</div>`;
            return;
        }

        const user = auth.currentUser;
        list.innerHTML = top5.map((s, i) => `
            <div style="display:flex; align-items:center; gap:12px; padding:10px 12px; border-radius:8px; margin-bottom:6px; background:${user && s.userId === user.uid ? 'rgba(75,167,255,0.15)' : 'rgba(255,255,255,0.05)'}; ${user && s.userId === user.uid ? 'border:1px solid #4BA7FF;' : ''}">
                <span style="font-size:1.2rem; min-width:28px;">${medals[i]}</span>
                <span style="flex:1; color:#fff; font-size:0.9rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${s.username}</span>
                ${songFilter === "all" ? `<span style="font-size:0.75rem; color:#aaa; margin-right:4px;">${s.songTitle}</span>` : ""}
                <span style="font-weight:bold; color:#FFD700; font-size:1rem;">${s.score.toLocaleString()}</span>
            </div>
        `).join("");

    } catch (err) {
        console.error("Failed to load scoreboard:", err);
        list.innerHTML = `<div style="text-align:center; color:#ff6b6b; padding:20px;">Failed to load scores.</div>`;
    }
}

document.getElementById("myDropdown").addEventListener("click", async (e) => {
    const btn = e.target.closest("#scoreboardBtn");
    if (!btn) return;
    e.preventDefault();
    console.log("Scoreboard clicked via delegation!");
    document.getElementById("myDropdown").classList.remove("show");
    openGlobalScoreboard();
});

//Allows this Scoreboard feature to become accessible from the html.
window.openGlobalScoreboard = openGlobalScoreboard;

//Allows for the suffle button feature to work.
function shuffleSong() {
    const realSongs = currentList.filter(s => !s.isPlaceholder);
    if (realSongs.length === 0) return;

    const randomSong = realSongs[Math.floor(Math.random() * realSongs.length)];
    const randomIndex = currentList.indexOf(randomSong);

    if (randomIndex !== -1) {
        currentIndex = randomIndex;
        updateTrackSelect();
    }

    // shuffle does NOT hide category bar
    document.getElementById("categoryTabs").style.height = "40px";
}

window.shuffleSong = shuffleSong;


async function trackSongPlay(songId) {
    try {
        await setDoc(doc(db, "songStats", String(songId)), {
            playCount: increment(1)
        }, { merge: true });
    } catch (err) {
        console.error("Failed to track play count:", err);
    }
}