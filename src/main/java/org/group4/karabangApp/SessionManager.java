package org.group4.karabangApp;

public class SessionManager {
    private static String loggedInUsername;
    private static String loggedInUserRole;

    public static String getLoggedInUsername() {
        return loggedInUsername;
    }

    public static void setLoggedInUsername(String username) {
        SessionManager.loggedInUsername = username;
    }

    public static String getLoggedInUserRole() {
        return loggedInUserRole;
    }

    public static void setLoggedInUserRole(String role) {
        SessionManager.loggedInUserRole = role;
    }

    public static void clearUserSession() {
        loggedInUsername = null;
        loggedInUserRole = null;

    }
}
