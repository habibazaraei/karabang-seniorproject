import { auth } from "./firebase.js";

import {
    sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";

const form = document.getElementById("reset-form");
const emailInput = document.getElementById("resetEmail");
const resetMessage = document.getElementById("resetMessage");

form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const email = emailInput.value.trim();

    if (!email) {
        resetMessage.style.color = "#ffca3a";
        resetMessage.textContent = "Please enter your email.";
        return;
    }

    try {
        await sendPasswordResetEmail(auth, email);

        resetMessage.style.color = "#8dffb1";
        resetMessage.textContent = "Password reset email sent successfully!";

        setTimeout(() => {
            window.location.href = "/login";
        }, 2500);

    } catch (error) {
        resetMessage.style.color = "#ff8f8f";

        if (error.code === "auth/invalid-email") {
            resetMessage.textContent = "Please enter a valid email address.";
        } else if (error.code === "auth/user-not-found") {
            resetMessage.textContent = "No account found with this email.";
        } else {
            resetMessage.textContent = "Something went wrong. Please try again.";
        }
    }
});