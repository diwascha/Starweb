import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { 
  getFirestore, 
  initializeFirestore, 
  persistentLocalCache, 
  persistentMultipleTabManager, 
  Firestore 
} from "firebase/firestore";
import { getStorage, FirebaseStorage } from "firebase/storage";
import { getAuth, Auth } from 'firebase/auth';
import { getDatabase, Database } from 'firebase/database';
import { firebaseConfig } from "@/firebase/config";

/**
 * @fileOverview Resilient Firebase initialization utility with Native Offline Persistence.
 * This enables the app to function without internet, queuing writes and syncing 
 * automatically upon reconnection.
 */

export const getFirebase = () => {
  let app: FirebaseApp;

  // Initialize or retrieve existing App instance
  if (getApps().length === 0) {
    app = initializeApp(firebaseConfig);
  } else {
    app = getApp();
  }

  const auth = getAuth(app);
  const storage = getStorage(app);
  
  // Use initializeFirestore with Persistent Cache enabled.
  // This allows data to be saved locally when offline and synced when online.
  let db: Firestore;
  try {
    db = initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager()
      })
    });
  } catch (e) {
    // If Firestore is already initialized (e.g. during Hot Module Replacement),
    // we retrieve the existing instance.
    db = getFirestore(app);
  }

  // Initialize Realtime Database (used primarily for connection status monitoring)
  let rtdb: Database | undefined;
  try {
    rtdb = getDatabase(app);
  } catch (e) {
    if (process.env.NODE_ENV === 'development') {
        console.warn("RTDB Initialization failed, connection status may be unavailable.", e);
    }
  }

  return { app, db, storage, auth, rtdb };
};
