package main.java.user;

/**
 * Class which stores data of a user of the admin type
 * Contains information about an admin
 * Including but not limited to: userid, username, etc.
 * @author Andrew Kozinski
 */
public class Admin extends main.java.user.User {

    //Default constructor
    /**
     * Default constructor, just sets variable values to default (null)
     */
    public Admin() {
        super();
    }

    //Parameterized constructor
    /**
     * Parameterized constructor, takes in variables and sets them to the corresponding user variables
     * @param username Passed in username
     * @param password Passed in password
     * @param firstName Passed in first name
     * @param lastName Passed in last name
     * @param userId Passed in user id
     */
    public Admin(String username, String password, String firstName, String lastName, String userId) {
        super(username, password, firstName, lastName, userId);
    }

    /**
     * Returns a string containing information about the user
     * @return String containing user information
     */
    @Override
    public String userInfo() {
        return String.format("Username: %s UserID: %s FirstName: %s LastName: %s", username, userId, firstName, lastName);
    }


}
