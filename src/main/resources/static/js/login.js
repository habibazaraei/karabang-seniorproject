
import { auth, db } from "./firebase.js";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged } 
from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import { doc, setDoc, collection, addDoc, getDocs, getDoc } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

const usersRef = collection(db, "users");


const username = document.getElementById("username");
const password = document.getElementById("password");

const loginBtn = document.getElementById("loginBtn");
//const signupBtn = document.getElementById("signupBtn");

// Prevent form from reloading the page

const loginForm = document.getElementById("login-form");


const songTitle = document.querySelector(".song-title");
const artist = document.querySelector(".artist");
const image = document.querySelector(".album-card img");

let index = 0;

loginForm.addEventListener("submit", (e) => {
    e.preventDefault(); // stops page reload
})
let songs = [];
let currentSong = null;
let interval = null;


async function loadSongsFromAPI() {
    try {
        const res = await fetch('/api/songs');
        songs = await res.json();

        console.log("Songs loaded:", songs);

        startSongRotation();

    } catch (err) {
        console.error("Failed to load songs from API:", err);
    }
}

function startSongRotation() {
    if (!songs.length) return;

    currentSong = getRandomSong(null);
    updateSong(currentSong);

    interval = setInterval(() => {
        const next = getRandomSong(currentSong.id); // use ID instead of object
        currentSong = next;
        updateSong(currentSong);
    }, 8000);
}

function getRandomSong(excludeId) {
    if (songs.length === 1) return songs[0];

    let next;

    do {
        next = songs[Math.floor(Math.random() * songs.length)];
    } while (next.id === excludeId);

    return next;
}

function updateSong(song) {
    songTitle.textContent = song.title;
    artist.textContent = song.artist;

    // preload image BEFORE swapping (prevents “random timing feel”)
    const img = new Image();
    img.src = song.artCoverPath || song.image;

    img.onload = () => {
        image.src = img.src;
    };
}

loadSongsFromAPI();


// LOGIN
loginBtn.addEventListener("click", async () => {
    try {
        // Look up email from username
        const usernameDoc = await getDoc(doc(db, "usernames", username.value.toLowerCase()));

        if (!usernameDoc.exists()) {
            alert("Username not found!");
            return;
        }

        const email = usernameDoc.data().email;

        await signInWithEmailAndPassword(auth, email, password.value);

        alert("Login successful!");
        window.location.href = "songselection";

    } catch (error) {
        alert(error.message);
    }
});

async function addFavorite(itemName) {

    const user = auth.currentUser;

    if (!user) {
        console.log("No user logged in");
        return;
    }

    try {

        await addDoc(
            collection(db, "users", user.uid, "favorites"),
            {
                name: itemName,
                createdAt: Date.now()
            }
        );

        console.log("Favorite added!");

    } catch (error) {
        console.error("Error adding favorite:", error);
    }
}


async function getFavorites() {

    const user = auth.currentUser;

    if (!user) {
        console.log("No user logged in");
        return;
    }

    const snapshot = await getDocs(
        collection(db, "users", user.uid, "favorites")
    );

    snapshot.forEach((doc) => {
        console.log(doc.id, doc.data());
    });
}