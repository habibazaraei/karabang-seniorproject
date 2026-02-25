package data;

public class SongData {
    private int id;
    private String title;
    private String artist;
    private String genre;
    private String difficulty;

    private String videoPath;   // e.g., "videos/sample.mp4"
    private String audioPath;   // e.g., "audio/sample.mp3"
    private String lyricsPath;  // e.g., "lyrics/sample.txt" or Firebase URL

    public SongData(int id, String title, String artist, String genre, String difficulty,
                    String videoPath, String audioPath, String lyricsPath) {
        this.id = id;
        this.title = title;
        this.artist = artist;
        this.genre = genre;
        this.difficulty = difficulty;
        this.videoPath = videoPath;
        this.audioPath = audioPath;
        this.lyricsPath = lyricsPath;
    }

    // Getters
    public int getId() { return id; }
    public String getTitle() { return title; }
    public String getArtist() { return artist; }
    public String getGenre() { return genre; }
    public String getDifficulty() { return difficulty; }
    public String getVideoPath() { return videoPath; }
    public String getAudioPath() { return audioPath; }
    public String getLyricsPath() { return lyricsPath; }

    @Override
    public String toString() {
        return title + " by " + artist + " [" + genre + ", " + difficulty + "]";
    }
}
