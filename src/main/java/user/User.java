package main.java.user;

//import org.slf4j.Logger;
//import org.slf4j.LoggerFactory;

/**
 * An abstract class representing a user in the registration system
 * Users can include but are not limited to: Student, Professor and Admin
 * Stores information regarding the user such as username, id, etc.
 * Various methods with default behavior of a user are defined below.
 * @author Andrew Kozinski
 */
public abstract class User {
    //private static final Logger logger = LoggerFactory.getLogger(User.class);

    //User variables
    protected String username;
    protected String password;
    protected String firstName;
    protected String lastName;
    protected String userId;
    protected String email;

    //Default constructor
    /**
     * Default constructor, just sets variable values to default (null)
     */
    public User() {
        username = null;
        password = null;
        firstName = null;
        lastName = null;
        userId = null;
        email = null;
    }
    //Parameterized Constructor

    /**
     * Parameterized constructor, takes in variables and sets them to the corresponding user variables
     * @param username Passed in username
     * @param password Passed in password
     * @param firstName Passed in firstname
     * @param lastName Passed in lastname
     * @param userId Passed in userId
     */
    public User(String username, String password, String firstName, String lastName, String userId) {
        this.username = username;
        this.password = password;
        this.firstName = firstName;
        this.lastName = lastName;
        this.userId = userId;

        //logger.info("User created with age: {}", age);

    }


    //Default implementation of User methods below

    /**
     * Returns username upon call
     * @return username
     */
    public String getUsername() {
        return username;
    }

    /**
     * Sets username upon call
     * @param username username we wish to set
     */
    public void setUsername(String username) {
        this.username = username;
    }

    public String getPassword() {
        return password;
    }

    /**
     * Gets user id of a user
     * @return userId
     */
    public String getUserId() {
        return userId;
    }

    /**
     * Sets user id of a user
     * @param userId user id of a given user
     */
    public void setUserId(String userId) {
        this.userId = userId;
    }

    /**
     * Sets the first name of a user
     * @return first name of a user
     */
    public String getFirstName() {
        return firstName;
    }

    /**
     * Sets the first name of a user
     * @param firstName first name to be set
     */
    public void setFirstName(String firstName) {
        this.firstName = firstName;
    }

    /**
     * Returns the last name of a user
     * @return Last name of a given user
     */
    public String getLastName() {
        return lastName;
    }

    /**
     * Sets the email of a user
     * @param email Email of a given user
     */
    public void setEmail(String email) {
        this.email = email;
    }

    /**
     * Returns the email of a user
     * @return Email of a given user
     */
    public String getEmail() {
        return email;
    }


    /**
     * Sets the last name of a user
     * @param lastName last name to be set
     */
    public void setLastName(String lastName) {
        this.lastName = lastName;
    }
    public void setPassword(String password){this.password = password;}


    //Abstract methods below

    /**
     * Returns user information
     * This methods implementation depends on the user type
     * For example, a student would have a "major" variable while an admin would not
     * @return User information
     */
    public abstract String userInfo();



}
