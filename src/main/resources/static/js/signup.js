import { auth, db } from "./firebase.js";

import { createUserWithEmailAndPassword }
    from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";

import { doc, setDoc, getDoc }
    from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

const username = document.getElementById("username");
const email = document.getElementById("email");
const password = document.getElementById("password");
const signupForm = document.getElementById("signup-form");

signupForm.addEventListener("submit", async function(event) {
    event.preventDefault();

    const usernameValue = username.value.trim();
    const emailValue = email.value.trim();
    const passwordValue = password.value.trim();

    if (usernameValue === "" || emailValue === "" || passwordValue === "") {
        alert("Please fill in all fields.");
        return;
    }

    try {
        const usernameDoc = await getDoc(
            doc(db, "usernames", usernameValue.toLowerCase())
        );

        if (usernameDoc.exists()) {
            alert("Username already taken. Please choose another.");
            return;
        }

        const userCredential = await createUserWithEmailAndPassword(
            auth,
            emailValue,
            passwordValue
        );

        const user = userCredential.user;

        await setDoc(doc(db, "users", user.uid), {
            email: user.email,
            username: usernameValue,
            displayName: usernameValue
        });

        await setDoc(doc(db, "usernames", usernameValue.toLowerCase()), {
            uid: user.uid,
            email: user.email
        });

        alert("Account created successfully!");
        window.location.href = "/login";

    } catch (error) {
        alert(error.message);
    }
});