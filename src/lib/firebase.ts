import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getFirestore, Firestore } from "firebase/firestore";
import { getStorage, FirebaseStorage } from "firebase/storage";
import { getAuth, Auth } from 'firebase/auth';
import { getDatabase, Database } from 'firebase/database';
import { firebaseConfig } from "@/firebase/config";

/**
 * @fileOverview Resilient Firebase initialization utility.
 */

export const getFirebase = () => {
  let app: FirebaseApp;

  // Use existing app if already initialized to prevent redundant connections
  if (getApps().length === 0) {
    app = initializeApp(firebaseConfig);
  } else {
    app = getApp();
  }

  const auth = getAuth(app);
  const db = getFirestore(app);
  const storage = getStorage(app);
  
  // Initialize Realtime Database (used for connection status)
  // We use a try-catch specifically for DB as it can fail on some networks/proxies
  let rtdb;
  try {
    rtdb = getDatabase(app);
  } catch (e) {
    console.warn("RTDB Initialization failed, connection status may be unavailable.", e);
  }

  return { app, db, storage, auth, rtdb };
};
