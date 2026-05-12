// profilepage.js
import { auth, db, doc, getDoc, getDocs, collection, onAuthStateChanged, signOut } from "./firebase.js";
import { updateDoc, collectionGroup, query, where } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";
import { updateProfile } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";

// ── DOM refs ──────────────────────────────────────────────────────────────────
const usernameDisplay  = document.getElementById("usernameDisplay");
const usernameInput    = document.getElementById("usernameInput");
const genreSelect      = document.getElementById("genreSelect");
const genreDisplay     = document.getElementById("genreDisplay");
const saveProfileBtn   = document.getElementById("saveProfileBtn");
const saveStatus       = document.getElementById("saveStatus");
const topScoresList    = document.getElementById("topScoresList");
const likedSongsList   = document.getElementById("likedSongsList");

// ── Avatar DOM refs ───────────────────────────────────────────────────────────
const avatarModal      = document.getElementById("avatarModal");
const changeAvatarBtn  = document.getElementById("changeAvatarBtn");
const cancelAvatarBtn  = document.getElementById("cancelAvatarBtn");
const saveAvatarBtn    = document.getElementById("saveAvatarBtn");
const bodyColorGrid    = document.getElementById("bodyColorGrid");
const headColorGrid    = document.getElementById("headColorGrid");
const previewBody      = document.getElementById("previewBody");
const previewHead      = document.getElementById("previewHead");
const previewShoulders = document.getElementById("previewShoulders");
const previewLabel     = document.getElementById("previewComboLabel");
const avatarBody       = document.getElementById("avatarBody");
const avatarHead       = document.getElementById("avatarHead");
const avatarShoulders  = document.getElementById("avatarShoulders");

let pendingBodyColor = "#787878";
let pendingHeadColor = "#9E9E9E";

// ── Boot ──────────────────────────────────────────────────────────────────────
onAuthStateChanged(auth, user => {
    if (user) {
        loadProfile(user);
        loadFavorites(user);
        loadTopScores(user);
        loadAvatarColors(user);
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
async function loadTopScores(user) {
    topScoresList.innerHTML = `<p style="color:#dcd7ff;font-size:0.95rem;">Loading scores...</p>`;
    try {
        const q = query(
            collectionGroup(db, "entries"),
            where("userId", "==", user.uid)
        );
        const snap = await getDocs(q);

        if (snap.empty) {
            topScoresList.innerHTML = `<p style="color:#dcd7ff;font-size:0.95rem;">No songs sung yet.</p>`;
            return;
        }

        const played = snap.docs.map(d => {
            const songId = d.ref.parent.parent.id;
            return { songId, ...d.data() };
        });

        const top5 = played
            .sort((a, b) => Number(b.score) - Number(a.score))
            .slice(0, 5);

        const songsRes  = await fetch("/api/songs");
        const songsData = await songsRes.json();

        const titlesMap = top5.map(entry => {
            const song = songsData.find(s => s.id === Number(entry.songId));
            return song ? song.title : `Song ${entry.songId}`;
        });

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

// ── Nav ───────────────────────────────────────────────────────────────────────
window.goToSongs = () => window.location.href = "/songselection";
window.logout = async () => {
    await signOut(auth);
    window.location.href = "/login";
};

// ── Avatar colors ─────────────────────────────────────────────────────────────
const AVATAR_COLORS = [
    { name: "Black",    hex: "#000000" },
    { name: "Charcoal", hex: "#333333" },
    { name: "Stone",    hex: "#787878" },
    { name: "Silver",   hex: "#9E9E9E" },
    { name: "White",    hex: "#E8E8E8" },
    { name: "Navy",     hex: "#17094E" },
    { name: "Purple",   hex: "#523da2" },
    { name: "Violet",   hex: "#7c5cbf" },
    { name: "Lavender", hex: "#a78bfa" },
    { name: "Blue",     hex: "#2563eb" },
    { name: "Sky",      hex: "#38bdf8" },
    { name: "Teal",     hex: "#0d9488" },
    { name: "Green",    hex: "#16a34a" },
    { name: "Lime",     hex: "#84cc16" },
    { name: "Yellow",   hex: "#eab308" },
    { name: "Orange",   hex: "#ea580c" },
    { name: "Red",      hex: "#dc2626" },
    { name: "Pink",     hex: "#ec4899" },
    { name: "Rose",     hex: "#f43f5e" },
    { name: "Brown",    hex: "#92400e" },
];

function buildSwatches(gridEl, selectedHex, onSelect) {
    gridEl.innerHTML = "";
    AVATAR_COLORS.forEach(({ name, hex }) => {
        const btn = document.createElement("button");
        btn.className = "color-swatch" + (hex === selectedHex ? " selected" : "");
        btn.style.background = hex;
        btn.title = name;
        btn.setAttribute("aria-label", name);
        btn.addEventListener("click", () => {
            gridEl.querySelectorAll(".color-swatch").forEach(s => s.classList.remove("selected"));
            btn.classList.add("selected");
            onSelect(hex);
        });
        gridEl.appendChild(btn);
    });
}

function updatePreviewLabel() {
    const bodyName = AVATAR_COLORS.find(c => c.hex === pendingBodyColor)?.name ?? pendingBodyColor;
    const headName = AVATAR_COLORS.find(c => c.hex === pendingHeadColor)?.name ?? pendingHeadColor;
    previewLabel.textContent = `${bodyName} · ${headName}`;
}

// ── Open modal ────────────────────────────────────────────────────────────────
changeAvatarBtn.addEventListener("click", () => {
    pendingBodyColor = avatarBody.getAttribute("fill") || "#787878";
    pendingHeadColor = avatarHead.getAttribute("fill") || "#9E9E9E";

    previewBody.setAttribute("fill", pendingBodyColor);
    previewHead.setAttribute("fill", pendingHeadColor);
    previewShoulders.setAttribute("fill", pendingHeadColor);
    updatePreviewLabel();

    buildSwatches(bodyColorGrid, pendingBodyColor, (hex) => {
        pendingBodyColor = hex;
        previewBody.setAttribute("fill", hex);
        updatePreviewLabel();
    });

    buildSwatches(headColorGrid, pendingHeadColor, (hex) => {
        pendingHeadColor = hex;
        previewHead.setAttribute("fill", hex);
        previewShoulders.setAttribute("fill", hex);
        updatePreviewLabel();
    });

    avatarModal.removeAttribute("hidden");
});

// ── Cancel / close ────────────────────────────────────────────────────────────
cancelAvatarBtn.addEventListener("click", () => {
    avatarModal.setAttribute("hidden", "");
});

avatarModal.addEventListener("click", (e) => {
    if (e.target === avatarModal) avatarModal.setAttribute("hidden", "");
});

// ── Save avatar ───────────────────────────────────────────────────────────────
saveAvatarBtn.addEventListener("click", async () => {
    const user = auth.currentUser;
    if (!user) return;

    avatarBody.setAttribute("fill", pendingBodyColor);
    avatarHead.setAttribute("fill", pendingHeadColor);
    avatarShoulders.setAttribute("fill", pendingHeadColor);

    avatarModal.setAttribute("hidden", "");

    try {
        await updateDoc(doc(db, "users", user.uid), {
            avatarBodyColor: pendingBodyColor,
            avatarHeadColor: pendingHeadColor,
        });
    } catch (err) {
        console.error("Failed to save avatar colors:", err);
    }
});

// ── Load saved avatar colors on boot ─────────────────────────────────────────
async function loadAvatarColors(user) {
    try {
        const snap = await getDoc(doc(db, "users", user.uid));
        if (!snap.exists()) return;
        const data = snap.data();

        const bodyHex = data.avatarBodyColor || "#787878";
        const headHex = data.avatarHeadColor || "#9E9E9E";

        avatarBody.setAttribute("fill", bodyHex);
        avatarHead.setAttribute("fill", headHex);
        avatarShoulders.setAttribute("fill", headHex);
    } catch (err) {
        console.error("loadAvatarColors error:", err);
    }
}