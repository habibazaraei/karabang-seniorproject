const songs = [
    {
        title: "Blinding Lights",
        artist: "The Weeknd",
        image: "https://upload.wikimedia.org/wikipedia/en/e/e6/The_Weeknd_-_Blinding_Lights.png"
    },
    {
        title: "Bohemian Rhapsody",
        artist: "Queen",
        image: "https://upload.wikimedia.org/wikipedia/en/9/9f/Bohemian_Rhapsody.png"
    }
];

const songTitle = document.querySelector(".song-title");
const artist = document.querySelector(".artist");
const image = document.querySelector(".album-card img");

let index = 0;

function changeSong() {
    index = (index + 1) % songs.length;
    songTitle.textContent = songs[index].title;
    artist.textContent = songs[index].artist;
    image.src = songs[index].image;
}

setInterval(changeSong, 15000);

const profileForm = document.getElementById("profile-form");
profileForm.addEventListener("submit", function(event) {
    event.preventDefault();
    alert("Profile changes saved!");
});