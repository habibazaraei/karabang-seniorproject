import { auth, db } from "./firebase.js";
import { signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

const loginForm = document.getElementById("loginForm");
const loginMessage = document.getElementById("loginMessage");

// Password toggle - outside the submit listener
const togglePassword = document.getElementById("togglePassword");
const passwordInput = document.getElementById("password");

togglePassword.addEventListener("click", function() {
    const isHidden = passwordInput.type === "password";
    passwordInput.type = isHidden ? "text" : "password";
    togglePassword.textContent = isHidden ? "🙈" : "👁";
});

loginForm.addEventListener("submit", async function(event) {
    event.preventDefault();

    const usernameValue = document.getElementById("username").value.trim();
    const passwordValue = document.getElementById("password").value.trim();

    if (usernameValue === "" || passwordValue === "") {
        loginMessage.style.color = "#ffbcbc";
        loginMessage.textContent = "Please enter your username and password.";
        return;
    }

    try {
        const usernameDoc = await getDoc(
            doc(db, "usernames", usernameValue.toLowerCase())
        );

        if (!usernameDoc.exists()) {
            loginMessage.style.color = "#ffbcbc";
            loginMessage.textContent = "No account found with that username.";
            return;
        }

        const email = usernameDoc.data().email;

        await signInWithEmailAndPassword(auth, email, passwordValue);

        loginMessage.style.color = "#dcd7ff";
        loginMessage.textContent = "Login successful. Redirecting...";
        setTimeout(() => {
            window.location.href = "/songselection";
        }, 1000);

    } catch (error) {
        loginMessage.style.color = "#ffbcbc";
        switch (error.code) {
            case "auth/wrong-password":
                loginMessage.textContent = "Incorrect password. Please try again.";
                break;
            case "auth/invalid-credential":
                loginMessage.textContent = "Invalid username or password.";
                break;
            case "auth/too-many-requests":
                loginMessage.textContent = "Too many attempts. Please try again later.";
                break;
            default:
                loginMessage.textContent = "Login failed. Please try again.";
        }
    }
});



