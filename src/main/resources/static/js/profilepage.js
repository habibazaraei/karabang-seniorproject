// profilepage.js
import { auth, db, doc, getDoc, getDocs, collection, onAuthStateChanged, signOut } from "./firebase.js";
import { updateDoc } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";
import { updateProfile } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import { collectionGroup, query, where } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

// ── Avatar color palettes ─────────────────────────────────────────────────────
//
// The SVG has 3 independently-colored parts:
//   <rect>              → background square (BG_COLORS)
//   <circle r="30">     → the big body circle (BODY_COLORS)
//   <circle r="10">
//   + <path>            → head and shoulders (HEAD_COLORS)

const BG_COLORS = [
    { name: "Black",    hex: "#111111" },
    { name: "Midnight", hex: "#17094e" },
    { name: "Navy",     hex: "#042c53" },
    { name: "Cobalt",   hex: "#0c447c" },
    { name: "Teal",     hex: "#085041" },
    { name: "Forest",   hex: "#27500a" },
    { name: "Crimson",  hex: "#791f1f" },
    { name: "Rose",     hex: "#72243e" },
    { name: "Amber",    hex: "#633806" },
    { name: "Slate",    hex: "#2a3550" },
    { name: "Charcoal", hex: "#2c2c2a" },
    { name: "Plum",     hex: "#3c3489" },
    { name: "White",    hex: "#e8e8f0" },
    { name: "Coral",    hex: "#712b13" },
    { name: "Maroon",   hex: "#4a1528" },
    { name: "Olive",    hex: "#3a3a0a" },
];

const BODY_COLORS = [
    { name: "Violet",   hex: "#534ab7" },
    { name: "Cobalt",   hex: "#185fa5" },
    { name: "Teal",     hex: "#0f6e56" },
    { name: "Forest",   hex: "#3b6d11" },
    { name: "Coral",    hex: "#993c1d" },
    { name: "Rose",     hex: "#993556" },
    { name: "Amber",    hex: "#854f0b" },
    { name: "Stone",    hex: "#5f5e5a" },
    { name: "Crimson",  hex: "#a32d2d" },
    { name: "Navy",     hex: "#17294e" },
    { name: "Plum",     hex: "#3c3489" },
    { name: "Maroon",   hex: "#72243e" },
    { name: "Slate",    hex: "#2a3550" },
    { name: "Olive",    hex: "#4a5c0a" },
    { name: "Charcoal", hex: "#3a3a3a" },
    { name: "Black",    hex: "#111111" },
];

const HEAD_COLORS = [
    { name: "Lavender", hex: "#7f77dd" },
    { name: "Sky",      hex: "#378add" },
    { name: "Mint",     hex: "#1d9e75" },
    { name: "Lime",     hex: "#639922" },
    { name: "Coral",    hex: "#d85a30" },
    { name: "Pink",     hex: "#d4537e" },
    { name: "Gold",     hex: "#ba7517" },
    { name: "Silver",   hex: "#888780" },
    { name: "Red",      hex: "#e24b4a" },
    { name: "Lilac",    hex: "#afa9ec" },
    { name: "Denim",    hex: "#85b7eb" },
    { name: "Sage",     hex: "#97c459" },
    { name: "Peach",    hex: "#f0a07a" },
    { name: "White",    hex: "#e8e8f0" },
    { name: "Amber",    hex: "#f0c040" },
    { name: "Rose",     hex: "#f093c0" },
];

// Current selections (indexes into the arrays above)
let selBgIdx   = 0;  // "Black"
let selBodyIdx = 0;  // "Violet"
let selHeadIdx = 0;  // "Lavender"

// ── DOM refs ──────────────────────────────────────────────────────────────────
const usernameDisplay   = document.getElementById("usernameDisplay");
const usernameInput     = document.getElementById("usernameInput");
const genreSelect       = document.getElementById("genreSelect");
const genreDisplay      = document.getElementById("genreDisplay");
const saveProfileBtn    = document.getElementById("saveProfileBtn");
const saveStatus        = document.getElementById("saveStatus");

// Card avatar SVG parts
const avatarBody        = document.getElementById("avatarBody");
const avatarHead        = document.getElementById("avatarHead");
const avatarShoulders   = document.getElementById("avatarShoulders");

// Modal
const changeAvatarBtn   = document.getElementById("changeAvatarBtn");
const avatarModal       = document.getElementById("avatarModal");
const cancelAvatarBtn   = document.getElementById("cancelAvatarBtn");
const saveAvatarBtn     = document.getElementById("saveAvatarBtn");

const bodyColorGrid     = document.getElementById("bodyColorGrid");
const headColorGrid     = document.getElementById("headColorGrid");
const previewComboLabel = document.getElementById("previewComboLabel");

// Preview SVG parts (inside modal)
const previewBody       = document.getElementById("previewBody");
const previewHead       = document.getElementById("previewHead");
const previewShoulders  = document.getElementById("previewShoulders");

// Scores / Liked
const topScoresList     = document.getElementById("topScoresList");
const likedSongsList    = document.getElementById("likedSongsList");

// ── Build color swatches ──────────────────────────────────────────────────────
function buildSwatches(container, colors, defaultIdx, onChange) {
    container.innerHTML = colors.map((c, i) => `
        <button class="color-swatch${i === defaultIdx ? " selected" : ""}"
            data-idx="${i}"
            style="background:${c.hex}"
            title="${c.name}"
            aria-label="${c.name}">
        </button>
    `).join("");

    container.querySelectorAll(".color-swatch").forEach(btn => {
        btn.addEventListener("click", () => {
            container.querySelectorAll(".color-swatch").forEach(b => b.classList.remove("selected"));
            btn.classList.add("selected");
            onChange(Number(btn.dataset.idx));
            updateModalPreview();
        });
    });
}


buildSwatches(bodyColorGrid, BODY_COLORS, selBodyIdx, idx => { selBodyIdx = idx; });
buildSwatches(headColorGrid, HEAD_COLORS, selHeadIdx, idx => { selHeadIdx = idx; });

// ── Update modal preview SVG ──────────────────────────────────────────────────
function updateModalPreview() {
    previewBody.setAttribute("fill",      BODY_COLORS[selBodyIdx].hex);
    previewHead.setAttribute("fill",      HEAD_COLORS[selHeadIdx].hex);
    previewShoulders.setAttribute("fill", HEAD_COLORS[selHeadIdx].hex);
    previewComboLabel.textContent =
        `${BODY_COLORS[selBodyIdx].name} · ${HEAD_COLORS[selHeadIdx].name}`;
}
// ── Apply colors to the card avatar ──────────────────────────────────────────
function applyAvatarToCard(bgHex, bodyHex, headHex) {
    avatarBody.setAttribute("fill",      bodyHex);
    avatarHead.setAttribute("fill",      headHex);
    avatarShoulders.setAttribute("fill", headHex);
}

// ── Sync picker UI to current indexes ────────────────────────────────────────
function syncSwatchSelection() {
    [
        [bodyColorGrid, selBodyIdx],
        [headColorGrid, selHeadIdx],
    ].forEach(([grid, idx]) => {
        grid.querySelectorAll(".color-swatch").forEach((btn, i) => {
            btn.classList.toggle("selected", i === idx);
        });
    });
    updateModalPreview();
}

// ── Modal open / close ────────────────────────────────────────────────────────
changeAvatarBtn.addEventListener("click", () => {
    syncSwatchSelection();
    avatarModal.hidden = false;
});

cancelAvatarBtn.addEventListener("click", () => {
    avatarModal.hidden = true;
});

avatarModal.addEventListener("click", e => {
    if (e.target === avatarModal) avatarModal.hidden = true;
});

// ── Save avatar to Firestore ──────────────────────────────────────────────────
saveAvatarBtn.addEventListener("click", async () => {
    const user = auth.currentUser;
    if (!user) return;

    const bgHex   = BG_COLORS[selBgIdx].hex;
    const bodyHex = BODY_COLORS[selBodyIdx].hex;
    const headHex = HEAD_COLORS[selHeadIdx].hex;

    applyAvatarToCard(bgHex, bodyHex, headHex);
    avatarModal.hidden = true;

    try {
        await updateDoc(doc(db, "users", user.uid), {
            avatarBgColor:   bgHex,
            avatarBodyColor: bodyHex,
            avatarHeadColor: headHex,
        });
    } catch (err) {
        console.error("Avatar save failed:", err);
    }
});

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

            // Restore saved avatar (3 fields)
            const bgHex   = data.avatarBgColor   || "#000000";
            const bodyHex = data.avatarBodyColor  || "#787878";
            const headHex = data.avatarHeadColor  || "#9E9E9E";
            applyAvatarToCard(bgHex, bodyHex, headHex);

            // Sync picker indexes
            const bi = BG_COLORS.findIndex(c => c.hex === bgHex);
            const oi = BODY_COLORS.findIndex(c => c.hex === bodyHex);
            const hi = HEAD_COLORS.findIndex(c => c.hex === headHex);
            if (bi >= 0) selBgIdx   = bi;
            if (oi >= 0) selBodyIdx = oi;
            if (hi >= 0) selHeadIdx = hi;
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
        console.log("Total entries found:", snap.size);

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