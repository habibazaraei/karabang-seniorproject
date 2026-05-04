const loginForm = document.getElementById("loginForm");
const loginMessage = document.getElementById("loginMessage");

loginForm.addEventListener("submit", function(event) {
    event.preventDefault();

    const username = document.getElementById("username").value.trim();
    const password = document.getElementById("password").value.trim();

    if (username === "" || password === "") {
        loginMessage.style.color = "#ffbcbc";
        loginMessage.textContent = "Please enter your username and password.";
        return;
    }

    loginMessage.style.color = "#dcd7ff";
    loginMessage.textContent = "Login successful. Redirecting...";

    setTimeout(function() {
        window.location.href = "profilepage.html";
    }, 1000);
});