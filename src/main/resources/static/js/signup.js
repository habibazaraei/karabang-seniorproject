import { auth, db } from "./firebase.js";
import { createUserWithEmailAndPassword } 
from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import { doc, setDoc } 
from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

const email = document.getElementById("email");
const password = document.getElementById("password");
const signupBtn = document.getElementById("signupBtn");
const homeBtn = document.getElementById("homeBtn");

//Prevents errors from reload
const form = document.getElementById("signup-form");
form.addEventListener("submit", (e) => e.preventDefault());

//User sign up taking information needed for sign up and then awaits the user action. One it is complete it sends them back to the login page.
signupBtn.addEventListener("click", async () => {
    try {
        const userCredential = await createUserWithEmailAndPassword(
            auth,
            email.value,
            password.value
        );

        const user = userCredential.user;

        await setDoc(doc(db, "users", user.uid), {
            email: user.email
        });

        alert("User created!");
        window.location.href = "login";

    } catch (error) {
        alert(error.message);
    }

});
 
//Home Button
homeBtn.addEventListener("click", () => {
      window.location.href = "login";
    });