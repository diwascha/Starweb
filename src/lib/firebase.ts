
import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getFirestore, Firestore } from "firebase/firestore";
import { getStorage, FirebaseStorage } from "firebase/storage";
import { getAuth, Auth } from 'firebase/auth';
import { getDatabase, Database } from 'firebase/database';
import { firebaseConfig } from "./firebase/config";

// This function ensures Firebase is initialized only once.
export const getFirebase = () => {
    let app: FirebaseApp;
    if (getApps().length === 0) {
      app = initializeApp(firebaseConfig);
    } else {
      app = getApp();
    }

    const db: Firestore = getFirestore(app);
    const storage: FirebaseStorage = getStorage(app);
    const auth: Auth = getAuth(app);
    const rtdb: Database = getDatabase(app);

    return { app, db, storage, auth, rtdb };
};
