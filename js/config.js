// ---------------------------------------------------------------------------
// Firebase configuration
// ---------------------------------------------------------------------------
// Leave `firebaseConfig = null` to run in LOCAL DEMO MODE: everything is stored
// in this browser's localStorage, so the game only syncs between tabs of the
// same browser on the same computer (handy for testing before class).
//
// For the real classroom game, create a free Firebase project with a
// Realtime Database (see README.md) and paste the config object here, e.g.:
//
// export const firebaseConfig = {
//   apiKey: "AIza...",
//   authDomain: "merit-order-game.firebaseapp.com",
//   databaseURL: "https://merit-order-game-default-rtdb.europe-west1.firebasedatabase.app",
//   projectId: "merit-order-game",
//   appId: "1:1234567890:web:abcdef",
// };
export const firebaseConfig = null;

// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyC3ZbSkaxJi0NqJgoO266AhlULdlni1POU",
  authDomain: "electricitymarketgame.firebaseapp.com",
  databaseURL: "https://electricitymarketgame-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "electricitymarketgame",
  storageBucket: "electricitymarketgame.firebasestorage.app",
  messagingSenderId: "908001530553",
  appId: "1:908001530553:web:015964b8f46ea0cd854168",
  measurementId: "G-GBFS4P09Y5"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);