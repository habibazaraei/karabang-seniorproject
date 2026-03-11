package org.group4.karabangApp;

import data.SongData;
import javafx.animation.*;
import javafx.beans.binding.Bindings;
import javafx.fxml.FXML;
import javafx.geometry.Rectangle2D;
import javafx.scene.control.Label;
import javafx.scene.control.Slider;
import javafx.scene.image.Image;
import javafx.scene.image.ImageView;
import javafx.scene.layout.Pane;
import javafx.scene.layout.StackPane;
import javafx.scene.layout.VBox;
import javafx.scene.media.Media;
import javafx.scene.media.MediaPlayer;
import javafx.scene.media.MediaView;
import javafx.scene.shape.Rectangle;
import javafx.scene.shape.SVGPath;
import javafx.stage.Screen;
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
    @FXML private SVGPath restart;

    //play icon
    @FXML private Rectangle leftPause;
    @FXML private Rectangle rightPause;
    @FXML private SVGPath play;
    //volume icon
    @FXML private StackPane volumeIconPane;
    @FXML private SVGPath volumeMute;
    @FXML private SVGPath volumeLowLine;
    @FXML private SVGPath volumeHighLine;
    //media player
    @FXML private ImageView backgroundImageView;
    @FXML private StackPane backgroundPane;
    private MediaPlayer videoPlayer;
    private MediaPlayer audioPlayer;
    private SongData currentSong;



    private List<LyricsLine> lyrics = new ArrayList<>();
    private boolean isPlaying = false;


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

        updateVolumeIcon(volumeSlider.getValue());

        subtitleLabel.setText("");

        //play and pause svg opacity
        play.setOpacity(0);
        leftPause.setOpacity(1);
        rightPause.setOpacity(1);
        leftPause.setTranslateX(-5);
        rightPause.setTranslateX(5);

        volumeMute.setVisible(false);

        ImageView bgView = new ImageView(new Image(new File("src/main/resources/Images/background1.png").toURI().toString()));
        bgView.setPreserveRatio(true);
        bgView.setSmooth(true);
        backgroundImageView.fitWidthProperty().bind(backgroundPane.widthProperty());
        backgroundImageView.fitHeightProperty().bind(backgroundPane.heightProperty());
        backgroundPane.getChildren().add(0, bgView);

        backgroundPane.widthProperty().addListener((obs, oldVal, newVal) -> resizeBackground(bgView));
        backgroundPane.heightProperty().addListener((obs, oldVal, newVal) -> resizeBackground(bgView));

        volumeSlider.valueProperty().addListener((obs, oldVal, newVal) -> {
            double vol = newVal.doubleValue();
            if (audioPlayer != null) audioPlayer.setVolume(vol);
            if (videoPlayer != null) videoPlayer.setVolume(vol);
            updateVolumeIcon(vol);
        });
        backgroundPane.heightProperty().addListener((obs, oldH, newH) -> {
            subtitleLabel.setStyle(String.format(
                    "-fx-text-fill: yellow; -fx-font-weight: bold; -fx-font-size: %.0fpx;",
                    newH.doubleValue() * 0.05
            ));
        });

    }

    private void updateVolumeIcon(double vol) {
        if (vol == 0) {
            volumeMute.setVisible(true);
            volumeLowLine.setVisible(false);
            volumeHighLine.setVisible(false);
        } else if (vol < 0.33) {
            volumeMute.setVisible(false);
            volumeLowLine.setVisible(true);
            volumeHighLine.setVisible(false);
        } else {
            volumeMute.setVisible(false);
            volumeLowLine.setVisible(false);
            volumeHighLine.setVisible(true);
        }
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
            pauseToPlay();
        } else {
            if (audioPlayer != null) audioPlayer.play();
            if (videoPlayer != null) videoPlayer.play();
            playToPause();
        }
        isPlaying = !isPlaying;
    }
    private void playToPause() {
        FadeTransition playFade = new FadeTransition(Duration.millis(150), play);
        playFade.setToValue(0);

        FadeTransition leftFade = new FadeTransition(Duration.millis(150), leftPause);
        leftFade.setToValue(1);

        FadeTransition rightFade = new FadeTransition(Duration.millis(150), rightPause);
        rightFade.setToValue(1);
        rightFade.setDelay(Duration.millis(50));

        new ParallelTransition(playFade, leftFade, rightFade).play();
    }

    private void pauseToPlay() {
        FadeTransition playFade = new FadeTransition(Duration.millis(150), play);
        playFade.setToValue(1);

        FadeTransition leftFade = new FadeTransition(Duration.millis(150), leftPause);
        leftFade.setToValue(0);

        FadeTransition rightFade = new FadeTransition(Duration.millis(150), rightPause);
        rightFade.setToValue(0);

        new ParallelTransition(playFade, leftFade, rightFade).play();
    }
    @FXML
    private void restart() {
        if (audioPlayer != null) audioPlayer.stop();
        if (videoPlayer != null) videoPlayer.stop();
        if (audioPlayer != null) audioPlayer.play();
        if (videoPlayer != null) videoPlayer.play();
        if (!isPlaying) audioPlayer.stop(); videoPlayer.stop(); audioPlayer.pause(); videoPlayer.pause();

    }
    private void resizeBackground(ImageView bgView) {
        double paneWidth = backgroundPane.getWidth();
        double paneHeight = backgroundPane.getHeight();
        double imgWidth = bgView.getImage().getWidth();
        double imgHeight = bgView.getImage().getHeight();

        double scale = Math.max(paneWidth / imgWidth, paneHeight / imgHeight);
        bgView.setFitWidth(imgWidth * scale);
        bgView.setFitHeight(imgHeight * scale);
    }
}