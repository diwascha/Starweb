
import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getFirestore, enableIndexedDbPersistence, Firestore } from "firebase/firestore";
import { getStorage, FirebaseStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

interface FirebaseInstances {
  app: FirebaseApp;
  db: Firestore;
  storage: FirebaseStorage;
}

let firebaseInstances: FirebaseInstances | null = null;
let persistenceEnabled = false;

const initializeFirebase = (): FirebaseInstances => {
  if (firebaseInstances) {
    return firebaseInstances;
  }

  const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
  const db = getFirestore(app);
  const storage = getStorage(app);

  firebaseInstances = { app, db, storage };
  return firebaseInstances;
};

const { app, db, storage } = initializeFirebase();

// --- Robust Offline Persistence ---
// This function is called only once.
const initializeOfflinePersistence = async () => {
  if (persistenceEnabled || typeof window === 'undefined') {
    return;
  }

  try {
    console.log("Attempting to enable Firestore offline persistence...");
    await enableIndexedDbPersistence(db);
    persistenceEnabled = true;
    console.log("Firestore offline persistence enabled successfully.");
  } catch (error: any) {
    if (error.code === 'failed-precondition') {
      console.warn("Firestore: Multiple tabs open, persistence can only be enabled in one. Offline support will be limited for this tab.");
    } else if (error.code === 'unimplemented') {
      console.warn("Firestore: The current browser does not support all of the features required to enable persistence.");
    } else {
      console.error("Firestore: Error enabling persistence:", error);
    }
    // The app will continue to work with in-memory caching.
  }
};

// Attempt to initialize persistence when this module is loaded on the client
initializeOfflinePersistence();


export { app, db, storage };
