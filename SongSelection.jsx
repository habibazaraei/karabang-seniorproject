import { useState, useEffect, useRef } from "react";

// ─── Sample Song Data ─────────────────────────────────────────────────────────
const SONGS = [
  { id: 1, title: "Blinding Lights", artist: "The Weeknd", genre: "Pop", bpm: 171, difficulty: 3, duration: "3:20", cover: "🌃", tags: ["80s vibe", "pop"] },
  { id: 2, title: "Bohemian Rhapsody", artist: "Queen", genre: "Rock", bpm: 76, difficulty: 5, duration: "5:55", cover: "🎸", tags: ["classic", "rock"] },
  { id: 3, title: "Dynamite", artist: "BTS", genre: "K-Pop", bpm: 114, difficulty: 2, duration: "3:19", cover: "💥", tags: ["kpop", "upbeat"] },
  { id: 4, title: "Someone Like You", artist: "Adele", genre: "Soul", bpm: 68, difficulty: 3, duration: "4:45", cover: "🌧️", tags: ["ballad", "emotional"] },
  { id: 5, title: "Shape of You", artist: "Ed Sheeran", genre: "Pop", bpm: 96, difficulty: 2, duration: "3:53", cover: "🎵", tags: ["pop", "chill"] },
  { id: 6, title: "Levitating", artist: "Dua Lipa", genre: "Dance Pop", bpm: 103, difficulty: 2, duration: "3:23", cover: "🪐", tags: ["disco", "dance"] },
  { id: 7, title: "Hotel California", artist: "Eagles", genre: "Rock", bpm: 75, difficulty: 4, duration: "6:30", cover: "🏨", tags: ["classic", "rock"] },
  { id: 8, title: "Rolling in the Deep", artist: "Adele", genre: "Soul", bpm: 105, difficulty: 4, duration: "3:48", cover: "🔥", tags: ["ballad", "powerful"] },
  { id: 9, title: "Starboy", artist: "The Weeknd", genre: "R&B", bpm: 186, difficulty: 3, duration: "3:50", cover: "⭐", tags: ["rnb", "dark"] },
  { id: 10, title: "Bad Guy", artist: "Billie Eilish", genre: "Alt Pop", bpm: 135, difficulty: 2, duration: "3:14", cover: "🖤", tags: ["alt", "dark"] },
  { id: 11, title: "Uptown Funk", artist: "Bruno Mars", genre: "Funk", bpm: 115, difficulty: 3, duration: "4:30", cover: "🕺", tags: ["funk", "dance"] },
  { id: 12, title: "Senorita", artist: "Camila Cabello", genre: "Latin Pop", bpm: 117, difficulty: 3, duration: "3:10", cover: "🌹", tags: ["latin", "romantic"] },
];

const GENRES = ["All", "Pop", "Rock", "K-Pop", "Soul", "Dance Pop", "R&B", "Alt Pop", "Funk", "Latin Pop"];
const DIFFICULTIES = ["All", 1, 2, 3, 4, 5];

// ─── Difficulty Stars ─────────────────────────────────────────────────────────
const DiffStars = ({ level }) => {
  const colors = ["#00ff88", "#88ff00", "#ffee00", "#ff8800", "#ff2255"];
  return (
    <span className="diff-stars">
      {[1,2,3,4,5].map(i => (
        <span key={i} style={{ color: i <= level ? colors[level-1] : "#333", fontSize: "11px" }}>
          {i <= level ? "★" : "☆"}
        </span>
      ))}
    </span>
  );
};

// ─── BPM Bar ──────────────────────────────────────────────────────────────────
const BpmBar = ({ bpm }) => {
  const pct = Math.min((bpm / 220) * 100, 100);
  const hue = Math.round((pct / 100) * 120);
  return (
    <div className="bpm-bar-wrap">
      <span className="bpm-label">BPM {bpm}</span>
      <div className="bpm-track">
        <div className="bpm-fill" style={{ width: `${pct}%`, background: `hsl(${hue}, 100%, 55%)` }} />
      </div>
    </div>
  );
};

// ─── Song Card ────────────────────────────────────────────────────────────────
const SongCard = ({ song, isSelected, onSelect, onPlay }) => {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className={`song-card ${isSelected ? "selected" : ""} ${hovered ? "hovered" : ""}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => onSelect(song)}
    >
      {/* Scanline overlay */}
      <div className="scanlines" />

      {/* Corner accent */}
      <div className="corner-tl" /><div className="corner-br" />

      {/* Top row */}
      <div className="card-top">
        <div className="song-cover">{song.cover}</div>
        <div className="song-meta">
          <div className="song-title">{song.title}</div>
          <div className="song-artist">— {song.artist}</div>
          <div className="song-genre-badge">{song.genre}</div>
        </div>
        <div className="card-duration">{song.duration}</div>
      </div>

      {/* Stats */}
      <div className="card-stats">
        <DiffStars level={song.difficulty} />
        <BpmBar bpm={song.bpm} />
      </div>

      {/* Tags */}
      <div className="card-tags">
        {song.tags.map(t => <span key={t} className="tag">#{t}</span>)}
      </div>

      {/* Play button - appears on select */}
      {isSelected && (
        <button className="play-btn" onClick={e => { e.stopPropagation(); onPlay(song); }}>
          ▶ SING NOW
        </button>
      )}
    </div>
  );
};

// ─── Main Component ────────────────────────────────────────────────────────────
export default function SongSelection() {
  const [search, setSearch] = useState("");
  const [genre, setGenre] = useState("All");
  const [diff, setDiff] = useState("All");
  const [selected, setSelected] = useState(null);
  const [sortBy, setSortBy] = useState("title");
  const [playing, setPlaying] = useState(null);
  const [particles, setParticles] = useState([]);
  const tickRef = useRef(0);

  // Tick for animated BPM pulse on selected card
  useEffect(() => {
    if (!selected) return;
    const iv = setInterval(() => { tickRef.current++; }, 500);
    return () => clearInterval(iv);
  }, [selected]);

  // Particle burst on play
  const handlePlay = (song) => {
    setPlaying(song);
    const burst = Array.from({ length: 16 }, (_, i) => ({
      id: Date.now() + i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      dx: (Math.random() - 0.5) * 200,
      dy: (Math.random() - 0.5) * 200,
    }));
    setParticles(burst);
    setTimeout(() => setParticles([]), 1000);
  };

  const filtered = SONGS.filter(s => {
    const matchSearch = s.title.toLowerCase().includes(search.toLowerCase()) ||
      s.artist.toLowerCase().includes(search.toLowerCase());
    const matchGenre = genre === "All" || s.genre === genre;
    const matchDiff = diff === "All" || s.difficulty === diff;
    return matchSearch && matchGenre && matchDiff;
  }).sort((a, b) => {
    if (sortBy === "title") return a.title.localeCompare(b.title);
    if (sortBy === "bpm") return b.bpm - a.bpm;
    if (sortBy === "difficulty") return b.difficulty - a.difficulty;
    if (sortBy === "duration") return a.duration.localeCompare(b.duration);
    return 0;
  });

  return (
    <div className="app">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Share+Tech+Mono&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        :root {
          --bg: #080c14;
          --panel: #0d1320;
          --accent: #00d4ff;
          --accent2: #ff2d78;
          --accent3: #c3ff00;
          --text: #e8f0ff;
          --muted: #4a5a7a;
          --card-bg: #111827;
          --card-border: #1e2d4a;
          --glow: 0 0 20px rgba(0,212,255,0.3);
        }

        body { background: var(--bg); color: var(--text); font-family: 'Share Tech Mono', monospace; }

        .app {
          min-height: 100vh;
          background:
            radial-gradient(ellipse at 20% 0%, rgba(0,80,255,0.08) 0%, transparent 60%),
            radial-gradient(ellipse at 80% 100%, rgba(255,45,120,0.06) 0%, transparent 60%),
            var(--bg);
          padding: 0 0 60px;
        }

        /* ── Header ── */
        .header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 24px 40px;
          border-bottom: 1px solid #1a2540;
          background: rgba(13,19,32,0.9);
          backdrop-filter: blur(10px);
          position: sticky; top: 0; z-index: 100;
        }
        .logo {
          font-family: 'Orbitron', sans-serif;
          font-size: 22px;
          font-weight: 900;
          letter-spacing: 4px;
          color: var(--accent);
          text-shadow: 0 0 20px rgba(0,212,255,0.6);
        }
        .logo span { color: var(--accent2); }
        .header-tagline {
          font-size: 11px;
          color: var(--muted);
          letter-spacing: 2px;
          text-transform: uppercase;
        }
        .header-count {
          font-size: 12px;
          color: var(--accent3);
          border: 1px solid var(--accent3);
          padding: 4px 12px;
          border-radius: 2px;
        }

        /* ── Hero title ── */
        .hero {
          text-align: center;
          padding: 48px 20px 32px;
        }
        .hero-title {
          font-family: 'Orbitron', sans-serif;
          font-size: clamp(28px, 5vw, 56px);
          font-weight: 900;
          letter-spacing: 8px;
          text-transform: uppercase;
          background: linear-gradient(135deg, var(--accent), var(--accent2));
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          animation: flicker 6s infinite;
        }
        .hero-sub {
          color: var(--muted);
          font-size: 13px;
          letter-spacing: 3px;
          margin-top: 8px;
        }

        @keyframes flicker {
          0%, 100% { opacity: 1; }
          92% { opacity: 1; }
          93% { opacity: 0.8; }
          94% { opacity: 1; }
          96% { opacity: 0.9; }
          97% { opacity: 1; }
        }

        /* ── Controls ── */
        .controls {
          max-width: 1200px;
          margin: 0 auto;
          padding: 0 32px 24px;
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          align-items: center;
        }
        .search-wrap {
          position: relative;
          flex: 1 1 240px;
          min-width: 200px;
        }
        .search-icon {
          position: absolute;
          left: 12px;
          top: 50%;
          transform: translateY(-50%);
          color: var(--muted);
          font-size: 14px;
        }
        .search-input {
          width: 100%;
          background: var(--panel);
          border: 1px solid var(--card-border);
          border-radius: 4px;
          color: var(--text);
          font-family: 'Share Tech Mono', monospace;
          font-size: 13px;
          padding: 10px 12px 10px 36px;
          outline: none;
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        .search-input:focus {
          border-color: var(--accent);
          box-shadow: 0 0 12px rgba(0,212,255,0.2);
        }
        .search-input::placeholder { color: var(--muted); }

        .filter-group { display: flex; gap: 8px; flex-wrap: wrap; }

        .filter-btn {
          background: var(--panel);
          border: 1px solid var(--card-border);
          color: var(--muted);
          font-family: 'Share Tech Mono', monospace;
          font-size: 11px;
          padding: 8px 14px;
          border-radius: 3px;
          cursor: pointer;
          letter-spacing: 1px;
          transition: all 0.15s;
        }
        .filter-btn:hover { border-color: var(--accent); color: var(--accent); }
        .filter-btn.active {
          background: rgba(0,212,255,0.1);
          border-color: var(--accent);
          color: var(--accent);
          box-shadow: 0 0 8px rgba(0,212,255,0.2);
        }
        .filter-btn.diff-active {
          background: rgba(195,255,0,0.08);
          border-color: var(--accent3);
          color: var(--accent3);
        }

        select {
          background: var(--panel);
          border: 1px solid var(--card-border);
          color: var(--text);
          font-family: 'Share Tech Mono', monospace;
          font-size: 11px;
          padding: 8px 12px;
          border-radius: 3px;
          cursor: pointer;
          outline: none;
        }
        select:focus { border-color: var(--accent); }

        /* ── Grid ── */
        .grid-wrap {
          max-width: 1200px;
          margin: 0 auto;
          padding: 0 32px;
        }
        .songs-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
          gap: 16px;
        }

        /* ── Song Card ── */
        .song-card {
          position: relative;
          background: var(--card-bg);
          border: 1px solid var(--card-border);
          border-radius: 6px;
          padding: 18px;
          cursor: pointer;
          transition: transform 0.2s, border-color 0.2s, box-shadow 0.2s;
          overflow: hidden;
        }
        .song-card:hover {
          transform: translateY(-2px);
          border-color: rgba(0,212,255,0.4);
          box-shadow: 0 8px 30px rgba(0,0,0,0.4), 0 0 20px rgba(0,212,255,0.1);
        }
        .song-card.selected {
          border-color: var(--accent2);
          box-shadow: 0 0 0 1px var(--accent2), 0 8px 40px rgba(255,45,120,0.2);
          transform: translateY(-3px);
        }

        .scanlines {
          position: absolute; inset: 0;
          background: repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.03) 2px, rgba(0,0,0,0.03) 4px);
          pointer-events: none;
        }
        .corner-tl, .corner-br {
          position: absolute;
          width: 12px; height: 12px;
          border-color: var(--accent);
        }
        .corner-tl { top: 6px; left: 6px; border-top: 2px solid; border-left: 2px solid; }
        .corner-br { bottom: 6px; right: 6px; border-bottom: 2px solid; border-right: 2px solid; }
        .selected .corner-tl, .selected .corner-br { border-color: var(--accent2); }

        .card-top {
          display: flex;
          align-items: flex-start;
          gap: 14px;
          margin-bottom: 14px;
        }
        .song-cover {
          font-size: 36px;
          width: 52px; height: 52px;
          display: flex; align-items: center; justify-content: center;
          background: rgba(255,255,255,0.04);
          border-radius: 4px;
          border: 1px solid var(--card-border);
          flex-shrink: 0;
        }
        .song-meta { flex: 1; min-width: 0; }
        .song-title {
          font-family: 'Orbitron', sans-serif;
          font-size: 13px;
          font-weight: 700;
          color: var(--text);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          letter-spacing: 1px;
        }
        .song-artist {
          font-size: 11px;
          color: var(--muted);
          margin-top: 4px;
          letter-spacing: 1px;
        }
        .song-genre-badge {
          display: inline-block;
          margin-top: 6px;
          font-size: 9px;
          letter-spacing: 2px;
          text-transform: uppercase;
          color: var(--accent);
          border: 1px solid rgba(0,212,255,0.3);
          padding: 2px 6px;
          border-radius: 2px;
        }
        .card-duration {
          font-size: 11px;
          color: var(--muted);
          white-space: nowrap;
          padding-top: 2px;
        }

        .card-stats {
          display: flex;
          align-items: center;
          gap: 16px;
          margin-bottom: 10px;
        }
        .diff-stars { letter-spacing: 2px; }

        .bpm-bar-wrap { flex: 1; display: flex; align-items: center; gap: 8px; }
        .bpm-label { font-size: 10px; color: var(--muted); white-space: nowrap; }
        .bpm-track { flex: 1; height: 4px; background: rgba(255,255,255,0.06); border-radius: 2px; overflow: hidden; }
        .bpm-fill { height: 100%; border-radius: 2px; transition: width 0.5s ease; }

        .card-tags { display: flex; flex-wrap: wrap; gap: 6px; }
        .tag {
          font-size: 9px;
          color: var(--muted);
          letter-spacing: 1px;
          border: 1px solid #1e2d4a;
          padding: 2px 6px;
          border-radius: 2px;
          transition: color 0.2s, border-color 0.2s;
        }
        .song-card:hover .tag { color: rgba(0,212,255,0.5); border-color: rgba(0,212,255,0.2); }

        .play-btn {
          display: block;
          width: 100%;
          margin-top: 14px;
          padding: 12px;
          background: linear-gradient(135deg, var(--accent2), #ff6b9d);
          border: none;
          border-radius: 4px;
          color: #fff;
          font-family: 'Orbitron', sans-serif;
          font-size: 13px;
          font-weight: 700;
          letter-spacing: 4px;
          cursor: pointer;
          transition: transform 0.15s, box-shadow 0.15s;
          animation: pulseBtn 1.5s ease-in-out infinite;
        }
        .play-btn:hover {
          transform: scale(1.02);
          box-shadow: 0 0 30px rgba(255,45,120,0.5);
        }
        @keyframes pulseBtn {
          0%, 100% { box-shadow: 0 0 12px rgba(255,45,120,0.3); }
          50% { box-shadow: 0 0 24px rgba(255,45,120,0.6); }
        }

        /* ── Empty state ── */
        .empty {
          text-align: center;
          padding: 80px 20px;
          color: var(--muted);
          grid-column: 1 / -1;
        }
        .empty-icon { font-size: 48px; margin-bottom: 16px; }
        .empty-text { font-family: 'Orbitron', sans-serif; font-size: 14px; letter-spacing: 3px; }

        /* ── Playing overlay ── */
        .playing-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.92);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          z-index: 999;
          animation: fadeIn 0.3s ease;
        }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        .playing-emoji { font-size: 80px; animation: bounce 0.5s ease infinite alternate; }
        @keyframes bounce { from { transform: scale(1); } to { transform: scale(1.1); } }
        .playing-title {
          font-family: 'Orbitron', sans-serif;
          font-size: clamp(20px, 4vw, 40px);
          font-weight: 900;
          margin-top: 24px;
          color: var(--accent);
          letter-spacing: 4px;
          text-shadow: 0 0 30px rgba(0,212,255,0.8);
        }
        .playing-artist {
          font-size: 14px;
          color: var(--muted);
          margin-top: 8px;
          letter-spacing: 3px;
        }
        .playing-bar {
          width: 300px;
          height: 3px;
          background: rgba(255,255,255,0.1);
          border-radius: 2px;
          margin-top: 32px;
          overflow: hidden;
        }
        .playing-bar-fill {
          height: 100%;
          background: linear-gradient(90deg, var(--accent), var(--accent2));
          animation: load 4s linear forwards;
          border-radius: 2px;
        }
        @keyframes load { from { width: 0%; } to { width: 100%; } }
        .playing-close {
          margin-top: 32px;
          background: transparent;
          border: 1px solid var(--muted);
          color: var(--muted);
          font-family: 'Share Tech Mono', monospace;
          font-size: 12px;
          padding: 10px 28px;
          border-radius: 3px;
          cursor: pointer;
          letter-spacing: 2px;
          transition: all 0.2s;
        }
        .playing-close:hover { border-color: var(--accent2); color: var(--accent2); }

        /* ── Particles ── */
        .particle {
          position: fixed;
          width: 6px; height: 6px;
          border-radius: 50%;
          pointer-events: none;
          z-index: 9999;
          animation: particleAnim 1s ease-out forwards;
        }
        @keyframes particleAnim {
          from { opacity: 1; transform: translate(0, 0) scale(1); }
          to { opacity: 0; transform: translate(var(--dx), var(--dy)) scale(0); }
        }

        /* ── Scrollbar ── */
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: var(--bg); }
        ::-webkit-scrollbar-thumb { background: var(--card-border); border-radius: 2px; }
      `}</style>

      {/* Header */}
      <div className="header">
        <div>
          <div className="logo">KARA<span>BANG</span></div>
          <div className="header-tagline">Free Karaoke Platform</div>
        </div>
        <div className="header-count">{filtered.length} SONGS</div>
      </div>

      {/* Hero */}
      <div className="hero">
        <div className="hero-title">SELECT YOUR SONG</div>
        <div className="hero-sub">// CHOOSE A TRACK AND START SINGING //</div>
      </div>

      {/* Controls */}
      <div className="controls">
        {/* Search */}
        <div className="search-wrap">
          <span className="search-icon">⌕</span>
          <input
            className="search-input"
            placeholder="Search title or artist..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {/* Genre Filter */}
        <div className="filter-group">
          {GENRES.map(g => (
            <button
              key={g}
              className={`filter-btn ${genre === g ? "active" : ""}`}
              onClick={() => setGenre(g)}
            >
              {g}
            </button>
          ))}
        </div>

        {/* Difficulty Filter */}
        <div className="filter-group">
          {DIFFICULTIES.map(d => (
            <button
              key={d}
              className={`filter-btn ${diff === d ? "diff-active" : ""}`}
              onClick={() => setDiff(d)}
            >
              {d === "All" ? "ALL ★" : "★".repeat(d)}
            </button>
          ))}
        </div>

        {/* Sort */}
        <select value={sortBy} onChange={e => setSortBy(e.target.value)}>
          <option value="title">SORT: A→Z</option>
          <option value="bpm">SORT: BPM</option>
          <option value="difficulty">SORT: DIFFICULTY</option>
          <option value="duration">SORT: LENGTH</option>
        </select>
      </div>

      {/* Song Grid */}
      <div className="grid-wrap">
        <div className="songs-grid">
          {filtered.length === 0 ? (
            <div className="empty">
              <div className="empty-icon">🎵</div>
              <div className="empty-text">NO SONGS FOUND</div>
            </div>
          ) : (
            filtered.map(song => (
              <SongCard
                key={song.id}
                song={song}
                isSelected={selected?.id === song.id}
                onSelect={s => setSelected(selected?.id === s.id ? null : s)}
                onPlay={handlePlay}
              />
            ))
          )}
        </div>
      </div>

      {/* Playing Overlay */}
      {playing && (
        <div className="playing-overlay" onClick={() => setPlaying(null)}>
          <div className="playing-emoji">{playing.cover}</div>
          <div className="playing-title">{playing.title}</div>
          <div className="playing-artist">{playing.artist}</div>
          <div className="playing-bar">
            <div className="playing-bar-fill" />
          </div>
          <button className="playing-close" onClick={() => setPlaying(null)}>
            [ STOP ]
          </button>
        </div>
      )}

      {/* Particle Effects */}
      {particles.map(p => (
        <div
          key={p.id}
          className="particle"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            background: Math.random() > 0.5 ? "#00d4ff" : "#ff2d78",
            "--dx": `${p.dx}px`,
            "--dy": `${p.dy}px`,
          }}
        />
      ))}
    </div>
  );
}
