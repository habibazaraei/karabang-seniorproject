import { auth, db } from "./firebase.js";
import { signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import { collection, getDocs, addDoc, deleteDoc, doc } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

//Redirect to login page if not logged in
onAuthStateChanged(auth, (user) => {
    if (user) {
        //User is logged in
        console.log("User logged in:", user.uid, user.email);
        document.getElementById("welcomeMsg").textContent = `Hello, ${user.email}!`;
        //Loads favorites when the page loads
        loadFavorites(user);
        //Add favorite button "Event"
        const addBtn = document.getElementById("addFavoriteBtn");
        addBtn.addEventListener("click", () => {
            addFavorite(user);
        });

    } else {

        window.location.href = "login.html";

    }

});

//Logout button
const logoutBtn = document.getElementById("logoutBtn");
logoutBtn.addEventListener("click", async () => {
    await signOut(auth);
    window.location.href = "login.html";
});

//Adds favorited items ro user lists
async function addFavorite(user) {

    const input = document.getElementById("favoriteInput");
    const itemName = input.value;

    if (itemName === "") return;

    try {

        await addDoc(
            collection(db, "users", user.uid, "favorites"),
            {
                name: itemName,
                createdAt: Date.now()
            }
        );

        input.value = "";

        loadFavorites(user); //refreshs the list

    } catch (error) {

        console.error("Error adding favorite:", error);

    }

}

//Function to delete a favorited items
async function deleteFavorite(user, favoriteId) {

    try {

        await deleteDoc(
            doc(db, "users", user.uid, "favorites", favoriteId)
        );

        loadFavorites(user); // refresh list

    } catch (error) {

        console.error("Error deleting favorite:", error);

    }

}

//Loads user favorited items
async function loadFavorites(user) {

    const list = document.getElementById("favoriteList");

    const snapshot = await getDocs(
        collection(db, "users", user.uid, "favorites")
    );

    list.innerHTML = "";

    snapshot.forEach((docItem) => {

        const data = docItem.data();
        const favoriteId = docItem.id;

        const li = document.createElement("li");

        //Shows text of the users favorite items
        const text = document.createElement("span");
        text.textContent = data.name;

        //Delete user favorite item button
        const deleteBtn = document.createElement("button");
        deleteBtn.textContent = "Delete";

        deleteBtn.addEventListener("click", () => {
            deleteFavorite(user, favoriteId);
        });

        li.appendChild(text);
        li.appendChild(deleteBtn);

        list.appendChild(li);

    });

}