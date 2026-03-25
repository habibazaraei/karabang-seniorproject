// firebase.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-analytics.js";
import { getFirestore, doc, setDoc, deleteDoc, getDoc, getDocs, collection } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";

// Your Firebase configuration (replace with your actual config)
const firebaseConfig = {
    apiKey: "AIzaSyB5rFKkV-z9XOQ1QnLRDf2sLh1AD7jqj7I",
    authDomain: "karabang-836e4.firebaseapp.com",
    projectId: "karabang-836e4",
    storageBucket: "karabang-836e4.firebasestorage.app",
    messagingSenderId: "633203460116",
    appId: "1:633203460116:web:7f2463741dfffb69033f01",
    measurementId: "G-TSWBQ6K9GN"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const db = getFirestore(app);
const auth = getAuth(app);


// Export for use in other JS files
export { app, analytics, db, auth, doc, setDoc, deleteDoc, getDoc, getDocs, collection, onAuthStateChanged, signOut };