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
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import java.io.IOException;
@SpringBootApplication
public class KarabangApp {
    /**
     * This is the main that starts the spring boot web application.
     * To access the web application run the program and go to a search engine \
     * like firefox and type in the search bar "localhost:8080/songselection"
     * @author Jason Yi
     */
    public static void main(String[] args) {
        SpringApplication.run(KarabangApp.class, args);
    }

}


