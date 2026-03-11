package org.group4.karabangApp;
/**
import com.google.auth.Credentials;
import com.google.cloud.Service;
import com.google.auth.oauth2.GoogleCredentials;
import com.google.cloud.firestore.Firestore;
import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import com.google.firebase.cloud.FirestoreClient;
 */
import javafx.application.Application;
import javafx.fxml.FXMLLoader;


import javafx.scene.Parent;
import javafx.scene.Scene;
import javafx.scene.control.Alert;
import javafx.scene.layout.StackPane;
import javafx.stage.Stage;

import java.io.IOException;
public class KarabangApp extends Application {
    private StackPane stackPane;
    private static Scene scene;
    private int heightScene = 450;
    private int widthScene = 800;
    @Override
    public void start(Stage stage) throws IOException {
        //initializeFirebase();
        FXMLLoader fxmlLoader = new FXMLLoader(KarabangApp.class.getResource("/org/group4/karabang-seniorproject/login.fxml"));
        scene = new Scene(fxmlLoader.load(), widthScene, heightScene);
        stage.setMinHeight(heightScene);
        stage.setMinWidth(widthScene);
        stage.setFullScreen(true);
        stage.setTitle("Karabang");
        stage.setScene(scene);

        stage.show();
    }
    /**
    public static Firestore initializeFirebase() {
        try {

            FileInputStream serviceAccount = new FileInputStream("src/main/resources/firebaseAPI.json");

            FirebaseOptions options = new FirebaseOptions.Builder()
                    .setCredentials(GoogleCredentials.fromStream(serviceAccount))
                    .build();
            FirebaseApp.initializeApp(options);

        } catch (IOException ex) {
            ex.printStackTrace();
            System.exit(1);
        }
        return FirestoreClient.getFirestore();
    }
    public static void main(String[] args) {
        launch();
    }
     */
    /**
     * Helper method for setRoot. On call, loads a specified .fxml file
     * @param fxml passed in fxml file name
     * @return result of fxmlLoader load
     */
    private static Parent loadFXML(String fxml) throws IOException {
        FXMLLoader fxmlLoader = new FXMLLoader(KarabangApp.class.getResource(fxml + ".fxml"));
        return fxmlLoader.load();
    }

    /**
     * Sets the scenes root, changes the scene to a specified scene
     * Again, if there's a better way of doing this, feel free to update or replace this method and loadFXML
     * @param fxml passed in fxml file name
     */
    public static void setRoot(String fxml) {
        try {
            scene.setRoot(loadFXML(fxml));
        } catch (IOException e) {
            throw new RuntimeException(e);
        }
    }

    /**
     * Method that can be called to return to log in scene.
     * Intended to be used in User, and Admin controllers
     */
    public static void returnToLogin() {
        setRoot("login");
    }

    /**
     * Method that when called, displays an alert to the user
     * @param title Title to be displayed in the alert
     * @param message Messaged to be displayed in the alert
     */
    public static void raiseAlert(String title, String message) {
        Alert alert = new Alert(Alert.AlertType.ERROR);
        alert.setTitle(title);
        alert.setHeaderText(null);
        alert.setContentText(message);
        alert.showAndWait();
    }


}

