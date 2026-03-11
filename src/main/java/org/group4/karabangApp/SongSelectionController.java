package org.group4.karabangApp;

import data.SongData;
import javafx.beans.binding.Bindings;
import javafx.fxml.FXML;
import javafx.fxml.FXMLLoader;
import javafx.fxml.Initializable;
import javafx.geometry.Insets;
import javafx.scene.Parent;
import javafx.scene.Scene;
import javafx.scene.control.*;
import javafx.scene.image.Image;
import javafx.scene.image.ImageView;
import javafx.scene.layout.*;
import javafx.stage.Stage;

import javax.swing.*;
import java.io.IOException;
import java.net.URL;
import java.util.ArrayList;
import java.util.List;
import java.util.ResourceBundle;

public class SongSelectionController implements Initializable {
    @FXML
    private Label songName;
    @FXML
    private Label artistName;
    @FXML
    private ImageView songImage;
    @FXML
    private ScrollPane songScrollPane;
    @FXML
    private VBox songSelectionVBox;

    @FXML
    private TextField searchField;

    @FXML
    private VBox songListVBox;

    @FXML
    private Button singButton;

    @FXML
    private Label logoTitle;

    @FXML
    private Label subtitle;

    @FXML
    private ImageView backgroundImageView;

    @FXML
    private StackPane rootPane;


    private List<SongData> songs = new ArrayList<>();
    private SongData selectedSong = null;

    @Override
    public void initialize(URL location, ResourceBundle resources) {

        //background image
        Image image = new Image(getClass().getResource("/Images/background1.png").toExternalForm());
        backgroundImageView.setImage(image);

        backgroundImageView.fitWidthProperty().bind(rootPane.widthProperty());
        backgroundImageView.fitHeightProperty().bind(rootPane.heightProperty());
        backgroundImageView.setPreserveRatio(false);

        searchField.textProperty().addListener((obs, oldText, newText) -> refreshSongList());
        songs.add(new SongData(1, "Blinding Lights", "The Weeknd", "Pop", "Easy","src/main/resources/Video/The Weeknd - Blinding Lights (Official Video)_1080p.mp4", "src/main/resources/Audio/The Weeknd - Blinding Lights (karaoke)_320p.mp3", "src/main/resources/Lyrics/BlindingLights.lrc"));
        songs.add(new SongData(2, "Bohemian Rhapsody", "Queen", "Rock", "Hard","src/main/resources/Video/Queen – Bohemian Rhapsody (Official Video Remastered)_1080p.mp4","src/main/resources/Audio/Queen - Bohemian Rhapsody (Karaoke Version)_320p.mp3", "src/main/resources/Lyrics/BohemianRhapsody.lrc"));

        searchField.textProperty().addListener((obs, oldText, newText) -> refreshSongList());
        songListVBox.widthProperty().addListener((obs, oldWidth, newWidth) -> {
            updateSongCardFontSize();
        });
        refreshSongList();
        updateSongCardFontSize();
        Image tempImage = new Image(getClass().getResource("/Images/questionmark.png").toExternalForm());
        songImage.setImage(tempImage);
        ((VBox)songImage.getParent()).spacingProperty().bind(songSelectionVBox.widthProperty().multiply(0.02));
        songSelectionVBox.spacingProperty().bind(rootPane.widthProperty().multiply(0.02));
        songImage.fitWidthProperty().bind(songSelectionVBox.widthProperty().multiply(0.2));
        songImage.fitHeightProperty().bind(songImage.fitWidthProperty());
        singButton.maxWidthProperty().bind(rootPane.widthProperty().multiply(0.2));
        singButton.minWidthProperty().bind(rootPane.widthProperty().multiply(0.15));

        songScrollPane.setHbarPolicy(ScrollPane.ScrollBarPolicy.NEVER);
        songScrollPane.setVbarPolicy(ScrollPane.ScrollBarPolicy.NEVER);
        songScrollPane.setFitToWidth(true);
        songScrollPane.setFitToHeight(true);


        logoTitle.styleProperty().bind(
                Bindings.createStringBinding(() -> {
                    double size = songSelectionVBox.getWidth() / 12;
                    return "-fx-font-size: " + Math.max(16, Math.min(size, 40)) + "px;";
                }, songSelectionVBox.widthProperty())
        );

        subtitle.styleProperty().bind(
                Bindings.createStringBinding(() -> {
                    double size = songSelectionVBox.getWidth() / 25;
                    return "-fx-font-size: " + Math.max(12, Math.min(size, 30)) + "px;";
                }, songSelectionVBox.widthProperty())
        );

        searchField.styleProperty().bind(
                Bindings.createStringBinding(() -> {
                    double size = songSelectionVBox.getWidth() / 50;
                    return "-fx-font-size: " + Math.max(12, Math.min(size, 24)) + "px;";
                }, songSelectionVBox.widthProperty())
        );

        songName.styleProperty().bind(
                Bindings.createStringBinding(() -> {
                    double size = songSelectionVBox.getWidth() / 50;
                    return "-fx-font-size: " + Math.max(12, Math.min(size, 24)) + "px;";
                }, songSelectionVBox.widthProperty())
        );

        artistName.styleProperty().bind(
                Bindings.createStringBinding(() -> {
                    double size = songSelectionVBox.getWidth() / 60;
                    return "-fx-font-size: " + Math.max(10, Math.min(size, 20)) + "px;";
                }, songSelectionVBox.widthProperty())
        );

        singButton.styleProperty().bind(
                Bindings.createStringBinding(() -> {
                    double size = songSelectionVBox.getWidth() / 50;
                    return "-fx-font-size: " + Math.max(12, Math.min(size, 24)) + "px;";
                }, songSelectionVBox.widthProperty())
        );
        singButton.setDisable(true);
        singButton.setOnAction(e -> openMusicPlayer());


    }

    private void refreshSongList() {
        songListVBox.getChildren().clear();
        String query = searchField.getText().toLowerCase();
        boolean anyMatch = false;

        for (SongData song : songs) {
            if (song.getTitle().toLowerCase().contains(query) || song.getArtist().toLowerCase().contains(query)) {
                anyMatch = true;
                songListVBox.getChildren().add(createSongCard(song));
            }
        }

        if (!anyMatch) {
            Label noResults = new Label("No songs found.");
            noResults.getStyleClass().add("no-results");
            songListVBox.getChildren().add(noResults);
            singButton.setDisable(true);
        }
        updateSongCardFontSize();
    }

    private void updateSongCardFontSize() {

        double base = Math.max(songListVBox.getWidth(), 400);

        double titleSize = base / 25;
        double artistSize = base / 40;

        for (var node : songListVBox.getChildren()) {
            if (node instanceof HBox card) {
                VBox infoBox = (VBox) card.getChildren().get(0);
                Label titleLabel = (Label) infoBox.getChildren().get(0);
                Label artistLabel = (Label) infoBox.getChildren().get(1);

                titleLabel.setStyle(
                        "-fx-font-size: " + titleSize + "px; -fx-font-weight: bold;"
                );

                artistLabel.setStyle(
                        "-fx-font-size: " + artistSize + "px; -fx-text-fill: #666;"
                );
            }
        }
    }

    private HBox createSongCard(SongData song) {
        HBox card = new HBox();
        card.setSpacing(10);
        card.setPadding(new Insets(10));

        card.getStyleClass().add("songCard");

        VBox infoBox = new VBox();

        Label titleLabel = new Label(song.getTitle());
        titleLabel.getStyleClass().add("songTitle");

        Label artistLabel = new Label("by " + song.getArtist());
        artistLabel.getStyleClass().add("songArtist");

        infoBox.getChildren().addAll(titleLabel, artistLabel);
        HBox.setHgrow(infoBox, Priority.ALWAYS);
        card.getChildren().add(infoBox);

        card.setOnMouseClicked(e -> {
            selectedSong = song;
            updateSelectionUI();
        });

        return card;
    }

    private void updateSelectionUI() {
        for (var node : songListVBox.getChildren()) {
            node.getStyleClass().remove("selected");
        }

        for (var node : songListVBox.getChildren()) {
            if (node instanceof HBox card) {
                Label label = (Label) ((VBox) card.getChildren().get(0)).getChildren().get(0);
                if (label.getText().equals(selectedSong.getTitle())) {
                    card.getStyleClass().add("selected");
                    break;
                }
            }
        }

        singButton.setDisable(selectedSong == null);
        if (selectedSong != null) {
            songName.setText(selectedSong.getTitle());
            artistName.setText(selectedSong.getArtist());
        }
    }


    private void openMusicPlayer() {
        try {
            FXMLLoader loader = new FXMLLoader(getClass().getResource("/org/group4/karabang-seniorproject/MusicPlayer.fxml"));
            Parent root = loader.load();

            MusicPlayerController controller = loader.getController();
            controller.setSong(selectedSong);

            Stage stage = new Stage();
            stage.setScene(new Scene(root));
            stage.show();

            singButton.getScene().getWindow().hide();
        } catch (IOException ex) {
            ex.printStackTrace();
        }
    }
}