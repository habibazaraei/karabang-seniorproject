package org.group4.karabangApp;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

@Controller
public class PageController {

    @GetMapping("/musicplayer")
    public String musicPlayer() {
        return "musicplayer";
    }
    @GetMapping("/songselection")
    public String songSelection() {
        return "songselection";
    }
}