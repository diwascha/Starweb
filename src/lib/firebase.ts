
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

// Initialize Firebase
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// --- Robust Offline Persistence ---
let db: ReturnType<typeof getFirestore>;

if (typeof window !== 'undefined') {
  try {
    // Use initializeFirestore for more control over caching
    db = initializeFirestore(app, {
      localCache: persistentLocalCache({})
    });
  } catch (error: any) {
    console.error("Failed to initialize Firestore with persistent cache, falling back.", error);
    // Fallback to default getFirestore if initialization fails
    db = getFirestore(app);
  }
} else {
  // Server-side rendering or environments without window
  db = getFirestore(app);
}

const storage = getStorage(app);

export { app, db, storage };
