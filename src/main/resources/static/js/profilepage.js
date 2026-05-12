// profilepage.js
import { auth, db, doc, getDoc, getDocs, collection, onAuthStateChanged, signOut } from "./firebase.js";
import { updateDoc } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";
import { updateProfile } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import { collectionGroup, query, where } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

// ── DOM refs ──────────────────────────────────────────────────────────────────
const usernameDisplay  = document.getElementById("usernameDisplay");
const usernameInput    = document.getElementById("usernameInput");
const genreSelect      = document.getElementById("genreSelect");
const genreDisplay     = document.getElementById("genreDisplay");
const saveProfileBtn   = document.getElementById("saveProfileBtn");
const saveStatus       = document.getElementById("saveStatus");
const uploadPicBtn     = document.getElementById("uploadPicBtn");
const pfpUpload        = document.getElementById("pfpUpload");
const profileImage     = document.getElementById("profileImage");
const topScoresList    = document.getElementById("topScoresList");
const likedSongsList   = document.getElementById("likedSongsList");

// ── Boot ──────────────────────────────────────────────────────────────────────
onAuthStateChanged(auth, user => {
    if (user) {
        console.log("Logged in as UID:", user.uid);
        loadProfile(user);
        loadFavorites(user);
        loadTopScores(user);
    } else {
        window.location.href = "login.html";
    }
});

// ── Profile ───────────────────────────────────────────────────────────────────
async function loadProfile(user) {
    try {
        const snap = await getDoc(doc(db, "users", user.uid));
        if (snap.exists()) {
            const data = snap.data();
            usernameDisplay.textContent = data.username || data.displayName || "KaraBang User";
            const genre = data.favoriteGenre || "Pop";
            genreDisplay.textContent = genre;
            genreSelect.value = genre;
        } else {
            usernameDisplay.textContent = user.displayName || "KaraBang User";
            genreDisplay.textContent = "Pop";
        }
    } catch (err) {
        console.error("loadProfile error:", err);
    }
}

// ── Favorites ─────────────────────────────────────────────────────────────────
async function loadFavorites(user) {
    try {
        const snap = await getDocs(collection(db, "users", user.uid, "favorites"));
        if (snap.empty) {
            likedSongsList.innerHTML = `<p style="color:#dcd7ff;font-size:0.95rem;">No liked songs yet.</p>`;
            return;
        }
        likedSongsList.innerHTML = snap.docs.slice(0, 5).map(d => {
            const s = d.data();
            return `
                <div class="liked-song-text">
                    <h3>${s.title || "Unknown"}</h3>
                    <p>${s.artist || ""}</p>
                </div>`;
        }).join("");
    } catch (err) {
        console.error("loadFavorites error:", err);
        likedSongsList.innerHTML = `<p style="color:#ff5252;font-size:0.95rem;">Failed to load liked songs.</p>`;
    }
}

// ── Top Scores ────────────────────────────────────────────────────────────────
// scores/{songId}/entries/{uid} — doc ID is the user's UID
async function loadTopScores(user) {
    topScoresList.innerHTML = `<p style="color:#dcd7ff;font-size:0.95rem;">Loading scores...</p>`;

    try {
        // Search ALL 'entries' subcollections across every song for this user's UID
        const q = query(
            collectionGroup(db, "entries"),
            where("userId", "==", user.uid)  // ← adjust field name if different
        );
        const snap = await getDocs(q);

        console.log("Total entries found:", snap.size);
                console.log("Raw docs:", snap.docs.map(d => ({ id: d.id, path: d.ref.path, data: d.data() })));

        if (snap.empty) {
            topScoresList.innerHTML = `<p style="color:#dcd7ff;font-size:0.95rem;">No songs sung yet.</p>`;
            return;
        }

        const played = snap.docs.map(d => {
            // parent of entries/{uid} is scores/{songId}
            const songId = d.ref.parent.parent.id;
            return { songId, ...d.data() };
        });

        const top5 = played
            .sort((a, b) => Number(b.score) - Number(a.score))
            .slice(0, 5);

        // Look up song titles
    const songsRes = await fetch("/api/songs");
    const songsData = await songsRes.json();

    const titlesMap = top5.map((entry) => {
        const song = songsData.find(s => s.id === Number(entry.songId));
        return song ? song.title : `Song ${entry.songId}`;
    });;

        const medals = ["🥇", "🥈", "🥉", "4️⃣", "5️⃣"];

        topScoresList.innerHTML = top5.map((entry, i) => {
            const date = entry.timestamp
                ? new Date(entry.timestamp).toLocaleDateString()
                : "";
            return `
                <div class="score-entry">
                    <div class="score-entry-rank">${medals[i]}</div>
                    <div class="score-entry-info">
                        <h3>${titlesMap[i]}</h3>
                        <p>${date}</p>
                    </div>
                    <div class="score-entry-score">${Number(entry.score).toLocaleString()}</div>
                </div>`;
        }).join("");

    } catch (err) {
        console.error("loadTopScores error:", err);
        topScoresList.innerHTML = `<p style="color:#ff5252;font-size:0.95rem;">Failed to load scores: ${err.message}</p>`;
    }
}

// ── Save profile ──────────────────────────────────────────────────────────────
saveProfileBtn.addEventListener("click", async function () {
    const user = auth.currentUser;
    if (!user) return;

    const newUsername = usernameInput.value.trim();
    const newGenre    = genreSelect.value;
    const updates     = { favoriteGenre: newGenre };

    if (newUsername !== "") {
        updates.username = newUsername;
        usernameDisplay.textContent = newUsername;
        usernameInput.value = "";
        await updateProfile(user, { displayName: newUsername }).catch(() => {});
    }

    genreDisplay.textContent = newGenre;

    try {
        await updateDoc(doc(db, "users", user.uid), updates);
        saveStatus.textContent = "✓ Profile saved!";
        saveStatus.style.color = "#a0f0a0";
        setTimeout(() => saveStatus.textContent = "", 3000);
    } catch (err) {
        console.error("Save failed:", err);
        saveStatus.textContent = "Save failed. Try again.";
        saveStatus.style.color = "#ff5252";
        setTimeout(() => { saveStatus.textContent = ""; saveStatus.style.color = "#a0f0a0"; }, 3000);
    }
});

// ── Profile picture ───────────────────────────────────────────────────────────
uploadPicBtn.addEventListener("click", () => pfpUpload.click());
pfpUpload.addEventListener("change", function () {
    const file = this.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => profileImage.src = e.target.result;
    reader.readAsDataURL(file);
});

// ── Nav ───────────────────────────────────────────────────────────────────────
window.goToSongs = () => window.location.href = "/songselection";
window.logout = async () => {
    await signOut(auth);
    window.location.href = "/login";
};