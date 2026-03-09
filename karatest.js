
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-analytics.js";
import { getFirestore, collection, doc, setDoc } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

//Connects To Firebase
const firebaseConfig = {
    apiKey: "AIzaSyB5rFKkV-z9XOQ1QnLRDf2sLh1AD7jqj7I",
    authDomain: "karabang-836e4.firebaseapp.com",
    projectId: "karabang-836e4",
    storageBucket: "karabang-836e4.firebasestorage.app",
    messagingSenderId: "633203460116",
    appId: "1:633203460116:web:7f2463741dfffb69033f01",
    measurementId: "G-TSWBQ6K9GN"
};

//Creates constants needed to access and send data to firebase.
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const db = getFirestore(app);

//Creates const actions to access the Collections of songs and users.
const songsRef = collection(db, "songs");
const usersRef = collection(db, "users");

//Function which adds a song and needed info to songs Collection.
async function addSong() {
    await setDoc(doc(songsRef, "song123"), {
        title: "My Song",
        artist: "Tyler"
    });
    console.log("Song added!");
}

//Function which adds a user and needed info to users Collection.
async function addUser() {
    await setDoc(doc(usersRef, "92942"), {
        userID: "01",
        firstName: "Tyler",
        lastName: "Radisch",
        email: "12324KARA@gmail.com",
        age: "22"

    });
    console.log("User added!");
}

addSong();
addUser();

