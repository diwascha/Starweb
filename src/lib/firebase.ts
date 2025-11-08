
import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore, enableIndexedDbPersistence } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Initialize Firebase
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app);
const storage = getStorage(app);

// Enable offline persistence
try {
  enableIndexedDbPersistence(db)
    .then(() => console.log("Firebase offline persistence enabled."))
    .catch((error: any) => {
        if (error.code == 'failed-precondition') {
            console.warn("Firestore offline persistence could not be enabled, multiple tabs open?");
        } else if (error.code == 'unimplemented') {
            console.log("Firestore offline persistence is not available in this browser.");
        }
    });
} catch (error) {
    console.error("Error enabling offline persistence:", error);
}

export { app, db, storage };
