package org.group4.karabangApp;


import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import data.SongData;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.ClassPathResource;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

@RestController
@RequestMapping("/api")
public class SongController {

    @GetMapping("/songs")
    public List<SongData> getSongs() {
        try {
            ObjectMapper mapper = new ObjectMapper();
            List<SongData> songs = mapper.readValue(
                    new ClassPathResource("songs.json").getInputStream(),
                    new TypeReference<List<SongData>>() {}
            );
            System.out.println("Loaded songs: " + songs.size());
            return songs;
        } catch (Exception e) {
            e.printStackTrace();
            return new ArrayList<>();
        }
    }
}
