import { useState } from "react";

const SONGS = [
  { id: 1, title: "Blinding Lights", artist: "The Weeknd", genre: "Pop", difficulty: "Easy", cover: "🌃" },
  { id: 2, title: "Bohemian Rhapsody", artist: "Queen", genre: "Rock", difficulty: "Hard", cover: "🎸" },
];

export default function SongSelection() {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [playing, setPlaying] = useState(false);

  const filtered = SONGS.filter(s =>
    s.title.toLowerCase().includes(search.toLowerCase()) ||
    s.artist.toLowerCase().includes(search.toLowerCase())
  );

  if (playing && selected) {
    return (
      <div style={{ minHeight: "100vh", background: "#1a1a2e", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "white", fontFamily: "Arial, sans-serif" }}>
        <div style={{ fontSize: 80 }}>{selected.cover}</div>
        <h2 style={{ marginTop: 20, fontSize: 32 }}>Now Playing</h2>
        <h3 style={{ color: "#e94560", fontSize: 24 }}>{selected.title}</h3>
        <p style={{ color: "#aaa" }}>by {selected.artist}</p>
        <p style={{ marginTop: 20, color: "#ccc", fontSize: 18 }}>🎤 Sing along!</p>
        <button
          onClick={() => setPlaying(false)}
          style={{ marginTop: 30, padding: "12px 30px", background: "#e94560", color: "white", border: "none", borderRadius: 8, fontSize: 16, cursor: "pointer" }}
        >
          ← Go Back
        </button>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#1a1a2e", color: "white", fontFamily: "Arial, sans-serif", padding: 30 }}>

      {/* Title */}
      <h1 style={{ textAlign: "center", color: "#e94560", fontSize: 36, marginBottom: 8 }}>
        🎤 KaraBang
      </h1>
      <p style={{ textAlign: "center", color: "#aaa", marginBottom: 30 }}>Pick a song and start singing!</p>

      {/* Search Bar */}
      <div style={{ maxWidth: 500, margin: "0 auto 30px" }}>
        <input
          placeholder="🔍 Search songs or artists..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ width: "100%", padding: "12px 16px", borderRadius: 8, border: "1px solid #e94560", background: "#16213e", color: "white", fontSize: 15, outline: "none" }}
        />
      </div>

      {/* Song Cards */}
      <div style={{ maxWidth: 500, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
        {filtered.length === 0 && (
          <p style={{ textAlign: "center", color: "#aaa" }}>No songs found.</p>
        )}

        {filtered.map(song => (
          <div
            key={song.id}
            onClick={() => setSelected(song)}
            style={{
              background: selected?.id === song.id ? "#e94560" : "#16213e",
              border: `2px solid ${selected?.id === song.id ? "#fff" : "#e94560"}`,
              borderRadius: 12,
              padding: 20,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 16,
              transition: "all 0.2s",
            }}
          >
            <div style={{ fontSize: 48 }}>{song.cover}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 20, fontWeight: "bold" }}>{song.title}</div>
              <div style={{ color: selected?.id === song.id ? "#ffe" : "#aaa", marginTop: 4 }}>by {song.artist}</div>
              <div style={{ marginTop: 6, fontSize: 12 }}>
                <span style={{ background: "rgba(255,255,255,0.15)", padding: "3px 8px", borderRadius: 4, marginRight: 8 }}>{song.genre}</span>
                <span style={{ background: "rgba(255,255,255,0.15)", padding: "3px 8px", borderRadius: 4 }}>{song.difficulty}</span>
              </div>
            </div>
            {selected?.id === song.id && (
              <div style={{ fontSize: 24 }}>✅</div>
            )}
          </div>
        ))}
      </div>

      {/* Sing Button */}
      {selected && (
        <div style={{ textAlign: "center", marginTop: 30 }}>
          <button
            onClick={() => setPlaying(true)}
            style={{ padding: "14px 40px", background: "#e94560", color: "white", border: "none", borderRadius: 10, fontSize: 18, fontWeight: "bold", cursor: "pointer" }}
          >
            ▶ Sing Now — {selected.title}
          </button>
        </div>
      )}
    </div>
  );
}
