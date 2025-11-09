
import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getFirestore, Firestore, onSnapshot, doc } from "firebase/firestore";
import { getStorage, FirebaseStorage } from "firebase/storage";
import { connectionPromise, resolveConnection, rejectConnection } from './firebase-connection';

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
  const connectedDoc = doc(db, '_internal/connected');
  onSnapshot(connectedDoc, {
    next: () => {
      resolveConnection(); // Firestore is connected
    },
    error: (err) => {
      console.error("Firestore connection check failed:", err);
      rejectConnection(err); // Propagate connection error
    }
  });


  firebaseInstances = { app, db, storage };
  return firebaseInstances;
};

const { app, db, storage } = initializeFirebase();

export { app, db, storage, connectionPromise };
