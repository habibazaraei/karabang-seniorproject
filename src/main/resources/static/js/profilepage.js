const usernameDisplay = document.getElementById("usernameDisplay");
const usernameInput = document.getElementById("usernameInput");
const genreSelect = document.getElementById("genreSelect");
const genreDisplay = document.getElementById("genreDisplay");
const saveProfileBtn = document.getElementById("saveProfileBtn");

saveProfileBtn.addEventListener("click", function () {
    const newUsername = usernameInput.value.trim();
    const favoriteGenre = genreSelect.value;

    if (newUsername !== "") {
        usernameDisplay.textContent = newUsername;
        usernameInput.value = "";
    }

    genreDisplay.textContent = favoriteGenre;
});

function goToSongs() {
    window.location.href = "SongSelection.html";
}

function logout() {
    window.location.href = "login.html";
}