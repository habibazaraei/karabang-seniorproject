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

function restartScrollInterval(direction) {
    clearInterval(moveInterval);
    moveInterval = setInterval(direction === "up" ? moveUp : moveDown, scrollSpeed);
}

scrollTopZone.onmouseenter = () => restartScrollInterval("up");
scrollBottomZone.onmouseenter = () => restartScrollInterval("down");
scrollTopZone.onmouseleave = () => clearInterval(moveInterval);
scrollBottomZone.onmouseleave = () => clearInterval(moveInterval);


// Restart Category when searching

searchField.oninput = () => {
    categoryButtons.forEach(button => {
        sortState[button.innerText.trim()] = "none";
        button.classList.remove("active");
        setButtonIcon(button, "default");

    });

    refreshSongList();
};
//Initiates the toggle down menu itself.
function toggleDropdown() {
    document.getElementById("myDropdown").classList.toggle("show");
}

// toggle when clicking profile button
document.getElementById("profile").addEventListener("click", (e) => {
    e.stopPropagation(); // prevents immediate close
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
        document.querySelectorAll(".categoryButton").forEach(b => b.classList.remove("active"));
        // cycle asc → desc → none → asc ...
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

        //ADDED BY TYLER: Allows for Filtration of songs by favorite
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
            //Loads favorites on icon (Shows red heart)
            loadFavoriteStates();
            return;
        }

        if (!key) return;


        setButtonIcon(buttons, sortState[name] === "none" ? "default" : (sortState[name] === "asc" ? "up" : "down"));

        // reset other buttons
        categoryButtons.forEach(b => {
            if (b !== buttons) {
                sortState[b.innerText.trim()] = "none";
                setButtonIcon(b, "default");
                b.classList.remove("active");
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

            //EDITED BY TYLER
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



//Initiates the toggle down menu itself.
function toggleDropdown() {
    document.getElementById("myDropdown").classList.toggle("show");
}

document.getElementById("profile").addEventListener("click", toggleDropdown);

window.addEventListener("click", function (e) {
    if (!e.target.closest("#profile")) {
        const dropdown = document.getElementById("myDropdown");
        if (dropdown.classList.contains("show")) {
            dropdown.classList.remove("show");
        }
    }
});

// Settings dropdown
function toggleSettingsDropdown() {
    document.getElementById("settingsDropdown").classList.toggle("show");
}

document.getElementById("settings").addEventListener("click", toggleSettingsDropdown);

window.addEventListener("click", function (e) {
    if (!e.target.closest("#settings")) {
        const dropdown = document.getElementById("settingsDropdown");
        if (dropdown.classList.contains("show")) {
            dropdown.classList.remove("show");
        }
    }
});


document.getElementById("toggleVolumeBtn").addEventListener("click", function (e) {
    e.preventDefault();
    const volumeControl = document.getElementById("volumeControl");
    if (volumeControl.style.display === "none") {
        volumeControl.style.display = "flex";
        // Start fade timer when opened
        clearTimeout(volumeFadeTimeout);
        volumeFadeTimeout = setTimeout(() => {
            volumeControl.style.display = "none";
        }, 3000);
    } else {
        volumeControl.style.display = "none";
    }
});;

let volumeFadeTimeout = null;

document.getElementById("volumeSlider").addEventListener("input", function () {
    userVolume = parseFloat(this.value);
    teaserPlayer.volume = userVolume;
    userInteracted = true;
    saveUserPreferences();

    clearTimeout(volumeFadeTimeout);
    volumeFadeTimeout = setTimeout(() => {
        document.getElementById("volumeControl").style.display = "none";
    }, 3000);
});

document.getElementById("toggleScrollBtn").addEventListener("click", function (e) {
    e.preventDefault();
    const scrollControl = document.getElementById("scrollControl");
    if (scrollControl.style.display === "none") {
        scrollControl.style.display = "flex";
        // Start fade timer when opened
        clearTimeout(scrollFadeTimeout);
        scrollFadeTimeout = setTimeout(() => {
            scrollControl.style.display = "none";
        }, 3000);
    } else {
        scrollControl.style.display = "none";
    }
});
let scrollFadeTimeout = null;

document.getElementById("scrollSlider").addEventListener("input", function () {
    scrollSpeed = 550 - parseInt(this.value);
        if (moveInterval) {
            const isTop = scrollTopZone.matches(":hover");
            if (isTop) restartScrollInterval("up");
            else restartScrollInterval("down");
        }
    saveUserPreferences();

    const val = parseInt(this.value);
    let label;
    if (val <= 150) label = "🐢 Slow";
    else if (val <= 300) label = "Normal";
    else if (val <= 450) label = "⚡ Fast";
    else label = "🚀 Turbo";
    document.getElementById("scrollSpeedLabel").innerText = label;

    clearTimeout(scrollFadeTimeout);
    scrollFadeTimeout = setTimeout(() => {
        document.getElementById("scrollControl").style.display = "none";
    }, 3000);
});

//Use for the Reset Preferences button, put it below the volume and speed sliders since those are the only two functionalities to be reset right now.
document.getElementById("resetPrefsBtn").addEventListener("click", async function (e) {
    e.preventDefault();

    // Reset to defaults
    userVolume = 1;
    scrollSpeed = 200;

    // Update sliders
    document.getElementById("volumeSlider").value = 0.5;
    document.getElementById("scrollSlider").value = 300; //
    document.getElementById("scrollSpeedLabel").innerText = "Normal";

    // Apply volume
    teaserPlayer.volume = userVolume;

    // Save defaults to Firebase
    await saveUserPreferences();

    // Close the dropdown
    document.getElementById("settingsDropdown").classList.remove("show");
});

//END OF EDITING BY TYLER
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

        // Move the track selection step by step to bring clicked song to center
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
        cards[currentIndex].classList.add("selected");

        songName.innerText = centerSong.title || "???";
        artistName.innerText = centerSong.artist || "???";
        songImage.src = centerSong.artCoverPath || "/images/questionmark_icon.svg";

        singButton.disabled = false;
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
       singButton.disabled = true;
       songName.innerText = "???";
       artistName.innerText = "???";
       songImage.src = "/images/questionmark_icon.svg";

       // Stop teaser
       teaserPlayer.pause();
       teaserPlayer.currentTime = 0;
       teaserPlayer.volume = userVolume; // ← change this from 1 to userVolume
       clearInterval(teaserFadeInterval);
       clearTimeout(teaserReplayTimeout);
       currentTeaserId = null;
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

    // Replay after delay
    teaserPlayer.onended = () => {
        teaserReplayTimeout = setTimeout(() => {
            playTeaserWithFade(song);
        }, TEASER_REPLAY_DELAY);
    };
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
        scrollSpeed: scrollSpeed
    });
}

//This loads the users preference settings to account.
async function loadUserPreferences(user) {
    const prefSnap = await getDoc(doc(db, "users", user.uid, "preferences", "settings"));
    if (!prefSnap.exists()) return;

    const prefs = prefSnap.data();

    if (prefs.volume !== undefined) {
        userVolume = prefs.volume;
        teaserPlayer.volume = userVolume;
        document.getElementById("volumeSlider").value = userVolume;
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