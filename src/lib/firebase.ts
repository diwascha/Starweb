
import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore, enableIndexedDbPersistence, initializeFirestore, persistentLocalCache } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

const db = getFirestore(app);
const storage = getStorage(app);

// --- Robust Offline Persistence ---
let persistenceEnabled = false;

export const initializeOfflinePersistence = async () => {
  if (persistenceEnabled || typeof window === 'undefined') {
    return;
  }
  
  try {
    await enableIndexedDbPersistence(db);
    persistenceEnabled = true;
  } catch (error: any) {
    if (error.code === 'failed-precondition') {
      console.warn("Firestore: Multiple tabs open, persistence can only be enabled in one. Offline support will be disabled for this tab.");
    } else if (error.code === 'unimplemented') {
      console.warn("Firestore: The current browser does not support all of the features required to enable persistence.");
    } else {
      console.error("Firestore: Error enabling persistence:", error);
    }
  }
};

// Attempt to initialize persistence when this module is loaded
initializeOfflinePersistence();

export { app, db, storage };
