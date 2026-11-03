// ---------------------------------------------------------------------------
// Firebase configuration
// ---------------------------------------------------------------------------
// Set `firebaseConfig = null` to run in LOCAL DEMO MODE: everything is stored
// in this browser's localStorage, so the game only syncs between tabs of the
// same browser on the same computer (handy for testing before class).
//
// Paste ONLY the config object from the Firebase console here. Do not paste
// the `import ... from "firebase/app"` / initializeApp / getAnalytics lines:
// those need a bundler and stop the page from loading. js/store.js loads the
// Firebase SDK itself.
export const firebaseConfig = {
  apiKey: "AIzaSyC3ZbSkaxJi0NqJgoO266AhlULdlni1POU",
  authDomain: "electricitymarketgame.firebaseapp.com",
  databaseURL: "https://electricitymarketgame-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "electricitymarketgame",
  storageBucket: "electricitymarketgame.firebasestorage.app",
  messagingSenderId: "908001530553",
  appId: "1:908001530553:web:015964b8f46ea0cd854168",
};
