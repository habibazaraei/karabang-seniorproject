import { auth } from "./firebase.js";
import { sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";

const form = document.getElementById("reset-form");
const emailInput = document.getElementById("resetEmail");
const homeBtn = document.getElementById("homeBtn");

form.addEventListener("submit", async (e) => {
    e.preventDefault();

    //Awaits the user input to verify that the email is correct. Redirects to login page after.
    try {
        await sendPasswordResetEmail(auth, emailInput.value);
        alert("Password reset email sent!");
        window.location.href = "login.html";
    } catch (error) {
        alert(error.message);
    }

});

//Home Button
homeBtn.addEventListener("click", () => {
      window.location.href = "login.html"; 
    });