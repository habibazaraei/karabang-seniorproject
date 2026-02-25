package data;


public class SongData {
    private int id;
    private String title;
    private String artist;
    private String genre;
    private String difficulty;

    public SongData(int id, String title, String artist, String genre, String difficulty) {
        this.id = id;
        this.title = title;
        this.artist = artist;
        this.genre = genre;
        this.difficulty = difficulty;
    }

    // Getters
    public int getId() { return id; }
    public String getTitle() { return title; }
    public String getArtist() { return artist; }
    public String getGenre() { return genre; }
    public String getDifficulty() { return difficulty; }

    @Override
    public String toString() {
        return title + " by " + artist + " [" + genre + ", " + difficulty + "]";
    }
}

