package org.group4.karabangApp;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

@Controller
public class PageController {

    @GetMapping("/login")
    public String login() {
        return "login";
    }
    @GetMapping("/signup")
    public String signup() {
        return "signup";
    }
    @GetMapping("/forgot")
    public String forgot() {
        return "forgot";
    }
    @GetMapping("/musicplayer")
    public String musicPlayer() {
        return "musicplayer";
    }
    @GetMapping("/songselection")
    public String songSelection() {
        return "songselection";
    }
    @GetMapping("/profilepage")
    public String profilePage() { return "profilepage"; }
    @GetMapping("/musicplayerplay")
    public String musicPlayerPlay() { return "musicplayerplay"; }
    @GetMapping("/musicplayervs")
    public String battle() { return "musicplayervs"; }
}