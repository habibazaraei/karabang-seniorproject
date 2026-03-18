
import { auth, db } from "./firebase.js";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged } 
from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import { doc, setDoc, collection, addDoc, getDocs } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

const usersRef = collection(db, "users");


/*
async function addSong() {
    await setDoc(doc(songsRef, "song124"), {
        title: "Apple",
        artist: "Tyler"
    });
    console.log("Song added!");
}

async function addUser() {
    await setDoc(doc(usersRef, "Cucumber422"), {
        userID: "01",
        firstName: "Tyler",
        lastName: "Radisch",
        email: "12324KARA@gmail.com",
        age: "22"

    });
    console.log("User added!");
}
*/
//START OF EMAIL REGISTRATION

const email = document.getElementById("email");
const password = document.getElementById("password");

const loginBtn = document.getElementById("loginBtn");
//const signupBtn = document.getElementById("signupBtn");

// Prevent form from reloading the page
const loginForm = document.getElementById("login-form");
loginForm.addEventListener("submit", (e) => {
    e.preventDefault(); // stops page reload
})


/*Sign up for account
signupBtn.addEventListener("click", async () => {

    try {

        const userCredential = await createUserWithEmailAndPassword(
            auth,
            email.value,
            password.value
        );

        const user = userCredential.user;
        console.log("Creating Firestore document for:", user.uid, user.email);


        //Save user info to Firestore
        await setDoc(doc(db, "users", user.uid), {
            email: user.email


        });

        console.log("Firestore write successful");
        alert("User created!");

    } catch (error) {
         console.error("Error during signup:", error);
        alert(error.message);

    }

});
*/


// LOGIN
loginBtn.addEventListener("click", async () => {

    try {

        await signInWithEmailAndPassword(
            auth,
            email.value,
            password.value
        );

        alert("Login successful!");
        window.location.href = "hubpage.html";


        

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