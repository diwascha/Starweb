
import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getFirestore, Firestore, onSnapshot, doc } from "firebase/firestore";
import { getStorage, FirebaseStorage } from "firebase/storage";
import { connectionPromiseInstance as connectionPromise, resolveConnection, rejectConnection } from './firebase-connection';

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

const initializeFirebase = (): FirebaseInstances => {
  if (firebaseInstances) {
    return firebaseInstances;
  }

  const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
  const db = getFirestore(app);
  const storage = getStorage(app);
  
  // Connection status listener
  try {
    const connectedDoc = doc(db, '_internal/checkConnection');
    onSnapshot(connectedDoc, {
      next: (snapshot) => {
        // This confirms we can reach the server.
        resolveConnection();
      },
      error: (err) => {
        // This can happen if offline, but onSnapshot might eventually connect.
        // For a more robust check, you might need a different strategy,
        // but for now, we'll assume an error here means a significant problem.
        console.warn("Firestore connection check snapshot error:", err.message);
        // We don't reject here because onSnapshot will keep trying.
        // The timeout in firebase-connection.ts will handle persistent failures.
      }
    });
  } catch (err) {
      console.error("Error setting up connection listener:", err);
      rejectConnection(err);
  }

  firebaseInstances = { app, db, storage };
  return firebaseInstances;
};

const { app, db, storage } = initializeFirebase();

export { app, db, storage };
