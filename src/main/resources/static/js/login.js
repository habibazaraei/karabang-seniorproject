
import { auth, db } from "./firebase.js";

import {
    signInWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";

import {
    doc,
    getDoc
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

const loginForm = document.getElementById("loginForm");
const loginMessage = document.getElementById("loginMessage");

const togglePassword = document.getElementById("togglePassword");
const passwordInput = document.getElementById("password");

togglePassword.addEventListener("click", function () {

    const isHidden = passwordInput.type === "password";

    passwordInput.type = isHidden ? "text" : "password";

    togglePassword.textContent = isHidden ? "🙈" : "👁";
});

loginForm.addEventListener("submit", async function (event) {

    event.preventDefault();

    const usernameValue =
        document.getElementById("username").value.trim();

    const passwordValue =
        passwordInput.value.trim();

    if (usernameValue === "" || passwordValue === "") {

        loginMessage.style.color = "#ffbcbc";

        loginMessage.textContent =
            "Please enter your username and password.";

        return;
    }

    try {

        const usernameDoc = await getDoc(
            doc(db, "usernames", usernameValue.toLowerCase())
        );

        if (!usernameDoc.exists()) {

            loginMessage.style.color = "#ffbcbc";

            loginMessage.textContent =
                "No account found with that username.";

            return;
        }

        const email = usernameDoc.data().email;

        await signInWithEmailAndPassword(
            auth,
            email,
            passwordValue
        );

        loginMessage.style.color = "#8dffb1";

        loginMessage.textContent =
            "Login successful. Redirecting...";

        setTimeout(() => {

            window.location.href = "/songselection";

        }, 1000);

    } catch (error) {

        loginMessage.style.color = "#ffbcbc";

        if (error.code === "auth/wrong-password") {

            loginMessage.textContent =
                "Incorrect password. Please try again.";

        } else if (error.code === "auth/invalid-credential") {

            loginMessage.textContent =
                "Invalid username or password.";

        } else if (error.code === "auth/too-many-requests") {

            loginMessage.textContent =
                "Too many attempts. Please try again later.";

        } else {

            loginMessage.textContent =
                "Login failed. Please try again.";
        }
    }
});



