package data;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

/**
 * A class representing a song's information
 * Users can include but are not limited to: Student, Professor and Admin
 * Stores information regarding the SongData such as id, title, artist, etc.
 * @author Jason Yi
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public class SongData {
    // SongData variables
    private int id;
    private String title;
    private String artist;
    private String genre;
    private String difficulty;
    private String language;
    private String audioPath;
    private String lyricsPath;
    private String artCoverPath;
    private String songTeaserPath;

    /**
     * Default Constructor
     */
    public SongData() {}
    /**
     * Parameterized Constructor, takes in variables and sets them to the corresponding SongData variables
     * @param id Passed in id
     * @param title Passed in title
     * @param artist Passed in artist
     * @param genre Passed in genre
     * @param difficulty Passed in difficulty
     * @param language Passed in language
     * @param audioPath Passed in audioPath
     * @param lyricsPath Passed in lyricsPath
     * @param artCoverPath Passed in artCoverPath
     * @param songTeaserPath Passed in songTeaserPath
     */
    public SongData(int id, String title, String artist, String genre, String difficulty, String language, String audioPath, String lyricsPath, String artCoverPath, String songTeaserPath) {
        this.id = id;
        this.title = title;
        this.artist = artist;
        this.genre = genre;
        this.difficulty = difficulty;
        this.language = language;
        this.audioPath = audioPath;
        this.lyricsPath = lyricsPath;
        this.artCoverPath = artCoverPath;
        this.songTeaserPath = songTeaserPath;
    }

    // Getters
    /**
     * Returns id upon call
     * @return id
     */
    public int getId() { return id; }
    /**
     * Returns title upon call
     * @return title
     */
    public String getTitle() { return title; }
    /**
     * Returns artist upon call
     * @return artist
     */
    public String getArtist() { return artist; }
    /**
     * Returns genre upon call
     * @return genre
     */
    public String getGenre() { return genre; }
    /**
     * Returns difficulty upon call
     * @return difficulty
     */
    public String getDifficulty() { return difficulty; }
    /**
     * Returns language upon call
     * @return language
     */
    public String getLanguage() { return language; }
    /**
     * Returns audioPath upon call
     * @return audioPath
     */
    public String getAudioPath() { return audioPath; }
    /**
     * Returns lyricsPath upon call
     * @return lyricsPath
     */
    public String getLyricsPath() { return lyricsPath; }
    /**
     * Returns artCoverPath upon call
     * @return artCoverPath
     */
    public String getArtCoverPath() { return artCoverPath; }
    /**
     * Returns songTeaserPath upon call
     * @return songTeaserPath
     */
    public String getSongTeaserPath() { return songTeaserPath; }
    /**
     * Returns Song Data information
     * Example: Bohemian Rhapsody by Queen [Rock, Hard]
     * @return String of Song Data information
     */
    @Override
    public String toString() {
        return title + " by " + artist + " [" + genre + ", " + difficulty + "]";
    }
}
