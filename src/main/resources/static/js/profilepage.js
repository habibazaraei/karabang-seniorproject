const usernameDisplay = document.getElementById("usernameDisplay");
const usernameInput = document.getElementById("usernameInput");
const genreSelect = document.getElementById("genreSelect");
const genreDisplay = document.getElementById("genreDisplay");
const saveProfileBtn = document.getElementById("saveProfileBtn");

const uploadPicBtn = document.getElementById("uploadPicBtn");
const pfpUpload = document.getElementById("pfpUpload");
const profileImage = document.getElementById("profileImage");

saveProfileBtn.addEventListener("click", function () {
    const newUsername = usernameInput.value.trim();
    const favoriteGenre = genreSelect.value;

    if (newUsername !== "") {
        usernameDisplay.textContent = newUsername;
        usernameInput.value = "";
    }

    genreDisplay.textContent = favoriteGenre;
});

uploadPicBtn.addEventListener("click", function () {
    pfpUpload.click();
});

pfpUpload.addEventListener("change", function () {
    const file = this.files[0];

    if (file) {
        const reader = new FileReader();

        reader.onload = function (event) {
            profileImage.src = event.target.result;
        };

        reader.readAsDataURL(file);
    }
});

function goToSongs() {
    window.location.href = "SongSelection.html";
}

function logout() {
    window.location.href = "login.html";
}