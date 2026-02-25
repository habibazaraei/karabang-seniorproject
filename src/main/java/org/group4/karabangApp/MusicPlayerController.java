package org.group4.karabangApp;

import data.SongData;
import javafx.animation.PauseTransition;
import javafx.fxml.FXML;
import javafx.scene.control.Label;
import javafx.scene.control.Slider;
import javafx.scene.image.Image;
import javafx.scene.image.ImageView;
import javafx.scene.layout.VBox;
import javafx.scene.media.Media;
import javafx.scene.media.MediaPlayer;
import javafx.scene.media.MediaView;
import javafx.util.Duration;

import java.io.File;
import java.io.IOException;
import java.net.URL;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.TreeMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class MusicPlayerController {

    @FXML private MediaView videoView;
    @FXML private Label subtitleLabel;
    @FXML private Slider volumeSlider;
    @FXML private ImageView playPauseImage;
    @FXML private ImageView restartImage;
    @FXML private ImageView volumeIcon;

    private MediaPlayer videoPlayer;
    private MediaPlayer audioPlayer;
    private SongData currentSong;

    private List<LyricsLine> lyrics = new ArrayList<>();
    private boolean isPlaying = false;

    private final Image playImg = new Image(getClass().getResource("/images/play.png").toString());
    private final Image pauseImg = new Image(getClass().getResource("/images/pause.png").toString());
    private final Image restartImg = new Image(getClass().getResource("/images/restart.png").toString());
    private final Image volumeHigh = new Image(getClass().getResource("/images/volume_high.png").toString());
    private final Image volumeLow = new Image(getClass().getResource("/images/volume_low.png").toString());
    private final Image volumeMute = new Image(getClass().getResource("/images/volume_mute.png").toString());

    private static class LyricsLine {
        private final double time;
        private final String text;
        public LyricsLine(double time, String text) { this.time = time; this.text = text; }
        public double getTime() { return time; }
        public String getText() { return text; }
    }

    public void setSong(SongData song) {
        this.currentSong = song;
        loadSong();
    }

    @FXML
    public void initialize() {
        subtitleLabel.setText("");
        playPauseImage.setImage(playImg);
        restartImage.setImage(restartImg);
        updateVolumeIcon(volumeSlider.getValue());

        volumeSlider.valueProperty().addListener((obs, oldVal, newVal) -> {
            double vol = newVal.doubleValue();
            if (audioPlayer != null) audioPlayer.setVolume(vol);
            if (videoPlayer != null) videoPlayer.setVolume(vol);
            updateVolumeIcon(vol);
        });

        videoView.sceneProperty().addListener((obs, oldScene, newScene) -> {
            if (newScene != null) {
                videoView.fitWidthProperty().bind(newScene.widthProperty());
                videoView.fitHeightProperty().bind(newScene.heightProperty().subtract(120));
            }
        });
        videoView.sceneProperty().addListener((obs, oldScene, newScene) -> {
            if (newScene != null) {

                videoView.fitWidthProperty().bind(newScene.widthProperty());
                videoView.fitHeightProperty().bind(newScene.heightProperty().subtract(120));

                newScene.heightProperty().addListener((o, oldH, newH) -> {

                    subtitleLabel.setStyle(String.format("-fx-text-fill: yellow; -fx-font-weight: bold; -fx-font-size: %.0fpx;", newH.doubleValue() * 0.05));
                });
            }
        });
    }

    private void updateVolumeIcon(double vol) {
        if (vol == 0) volumeIcon.setImage(volumeMute);
        else if (vol < 0.33) volumeIcon.setImage(volumeLow);
        else volumeIcon.setImage(volumeHigh);
    }

    private void loadSong() {
        if (currentSong == null) return;
        if (currentSong.getVideoPath() != null) {
            File videoFile = new File(currentSong.getVideoPath());
            if (videoFile.exists()) {
                Media videoMedia = new Media(videoFile.toURI().toString());
                videoPlayer = new MediaPlayer(videoMedia);
                videoPlayer.setVolume(volumeSlider.getValue());
                videoView.setMediaPlayer(videoPlayer);
            }
        }
        if (currentSong.getAudioPath() != null) {
            File audioFile = new File(currentSong.getAudioPath());
            if (audioFile.exists()) {
                Media audioMedia = new Media(audioFile.toURI().toString());
                audioPlayer = new MediaPlayer(audioMedia);
                audioPlayer.setVolume(volumeSlider.getValue());
            }
        }
        if (currentSong.getLyricsPath() != null) {
            File lrcFile = new File(currentSong.getLyricsPath());
            if (lrcFile.exists()) {
                try {
                    parseLRC(lrcFile);
                } catch (IOException e) {
                    e.printStackTrace();
                }
            }
        }

        MediaPlayer lyricSource = (audioPlayer != null) ? audioPlayer : videoPlayer;
        if (audioPlayer != null) {
            audioPlayer.setOnReady(() -> {
                audioPlayer.play();
                if (videoPlayer != null) videoPlayer.play();
                playPauseImage.setImage(pauseImg);
                isPlaying = true;
            });
        }
        if (lyricSource != null) {
            lyricSource.currentTimeProperty().addListener((obs, oldTime, newTime) -> {
                double sec = newTime.toSeconds();
                String line = getLyricsAt(sec);
                if (!line.equals(subtitleLabel.getText())) {
                    subtitleLabel.setText(line);
                    subtitleLabel.setStyle(String.format(
                            "-fx-text-fill: yellow; -fx-font-weight: bold; -fx-font-size: %.0fpx;",
                            subtitleLabel.getScene().getHeight() * 0.05
                    ));

                    PauseTransition pause = new PauseTransition(Duration.seconds(1.0));
                    pause.setOnFinished(e -> subtitleLabel.setStyle(String.format(
                            "-fx-text-fill: white; -fx-font-weight: bold; -fx-font-size: %.0fpx;",
                            subtitleLabel.getScene().getHeight() * 0.05
                    )));
                    pause.play();
                }
            });
        }
    }

    private void parseLRC(File lrcFile) throws IOException {
        lyrics.clear();
        List<String> lines = Files.readAllLines(lrcFile.toPath());
        Pattern pattern = Pattern.compile("\\[(\\d+):(\\d+\\.\\d+)\\](.*)");
        for (String line : lines) {
            Matcher m = pattern.matcher(line);
            if (m.matches()) {
                double min = Double.parseDouble(m.group(1));
                double sec = Double.parseDouble(m.group(2));
                double time = min * 60 + sec;
                String lyric = m.group(3);
                lyrics.add(new LyricsLine(time, lyric));
            }
        }
        lyrics.sort(Comparator.comparingDouble(LyricsLine::getTime));
    }

    private String getLyricsAt(double seconds) {
        String lastLine = "";
        for (LyricsLine line : lyrics) {
            if (line.getTime() <= seconds) lastLine = line.getText();
            else break;
        }
        return lastLine;
    }

    @FXML
    private void togglePlayPause() {
        if (isPlaying) {
            if (audioPlayer != null) audioPlayer.pause();
            if (videoPlayer != null) videoPlayer.pause();
            playPauseImage.setImage(playImg);
            isPlaying = false;
        } else {
            if (audioPlayer != null) audioPlayer.play();
            if (videoPlayer != null) videoPlayer.play();
            playPauseImage.setImage(pauseImg);
            isPlaying = true;
        }
    }

    @FXML
    private void restart() {
        if (audioPlayer != null) audioPlayer.stop();
        if (videoPlayer != null) videoPlayer.stop();
        if (audioPlayer != null) audioPlayer.play();
        if (videoPlayer != null) videoPlayer.play();
        playPauseImage.setImage(pauseImg);
        isPlaying = true;
    }
}