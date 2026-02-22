import { useState } from "react";
import "./SongSelection.css";

const SONGS = [
  { id: 1, title: "Blinding Lights", artist: "The Weeknd", genre: "Pop", difficulty: "Easy" },
  { id: 2, title: "Bohemian Rhapsody", artist: "Queen", genre: "Rock", difficulty: "Hard" },
];

function SongSelection() {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [playing, setPlaying] = useState(false);

  const filtered = SONGS.filter(s =>
    s.title.toLowerCase().includes(search.toLowerCase()) ||
    s.artist.toLowerCase().includes(search.toLowerCase())
  );

  if (playing && selected) {
    return (
      <div className="playing-screen">
        <h2>Now Playing</h2>
        <h3>{selected.title}</h3>
        <p>by {selected.artist}</p>
        <p className="sing-text">Sing along!</p>
        <button className="back-btn" onClick={() => setPlaying(false)}>Go Back</button>
      </div>
    );
  }

  return (
    <div className="song-selection">
      <h1>KaraBang</h1>
      <p className="subtitle">Pick a song and start singing!</p>
      <input
        className="search-bar"
        placeholder="Search songs or artists..."
        value={search}
        onChange={e => setSearch(e.target.value)}
      />
      <div className="song-list">
        {filtered.length === 0 && <p className="no-results">No songs found.</p>}
        {filtered.map(song => (
          <div
            key={song.id}
            className={`song-card ${selected?.id === song.id ? "selected" : ""}`}
            onClick={() => setSelected(song)}
          >
            <div className="song-info">
              <div className="song-title">{song.title}</div>
              <div className="song-artist">by {song.artist}</div>
              <div className="song-tags">
                <span className="tag">{song.genre}</span>
                <span className="tag">{song.difficulty}</span>
              </div>
            </div>
            {selected?.id === song.id && <span className="checkmark">Selected</span>}
          </div>
        ))}
      </div>
      {selected && (
        <div className="sing-btn-wrap">
          <button className="sing-btn" onClick={() => setPlaying(true)}>
            Sing Now - {selected.title}
          </button>
        </div>
      )}
    </div>
  );
}

export default SongSelection;
