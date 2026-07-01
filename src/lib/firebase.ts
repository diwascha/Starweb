import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getFirestore, Firestore } from "firebase/firestore";
import { getStorage, FirebaseStorage } from "firebase/storage";
import { getAuth, Auth } from 'firebase/auth';
import { getDatabase, Database } from 'firebase/database';
import { firebaseConfig } from "@/firebase/config";

// Idempotent Firebase initialization helper
export const getFirebase = () => {
  let app: FirebaseApp;

  if (getApps().length === 0) {
    app = initializeApp(firebaseConfig);
  } else {
    app = getApp();
  }

  const auth = getAuth(app);
  const db = getFirestore(app);
  const storage = getStorage(app);
  
  // Initialize RTDB using the default URL from the config
  const rtdb = getDatabase(app);

  return { app, db, storage, auth, rtdb };
};
