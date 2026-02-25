package org.group4.karabangApp;

import javafx.fxml.FXML;
import javafx.fxml.FXMLLoader;
import javafx.scene.Scene;
import javafx.scene.control.Button;
import javafx.scene.layout.VBox;
import javafx.stage.Stage;

import java.io.IOException;

public class LoginController {

    @FXML
    private Button goToSongsButton;

    @FXML
    private void initialize() {
        goToSongsButton.setOnAction(e -> openSongSelection());
    }

    private void openSongSelection() {
        try {
            FXMLLoader loader = new FXMLLoader(getClass().getResource("/org/group4/karabang-seniorproject/SongSelection.fxml"));
            VBox root = loader.load();

            Stage stage = new Stage();
            stage.setTitle("Song Selection");
            stage.setScene(new Scene(root, 500, 600));
            stage.show();


            goToSongsButton.getScene().getWindow().hide();
        } catch (IOException ex) {
            ex.printStackTrace();
        }
    }

}
