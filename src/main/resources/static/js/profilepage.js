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

const userStats = {
    highestScore: 9850,
    favoriteSongs: [
        "Blinding Lights - The Weeknd",
        "Bohemian Rhapsody - Queen",
        "We Are The Champions - Queen",
        "Nagging - IU",
        "We Can't Be Friends - Ariana Grande"
    ]
};

document.getElementById("highestScore").textContent = userStats.highestScore;

const favoriteSongsList = document.getElementById("favoriteSongsList");

userStats.favoriteSongs.slice(0, 5).forEach(function(song) {
    const li = document.createElement("li");
    li.textContent = song;
    favoriteSongsList.appendChild(li);
});

const profileForm = document.getElementById("profile-form");

profileForm.addEventListener("submit", function(event) {
    event.preventDefault();
    alert("Profile changes saved!");
});