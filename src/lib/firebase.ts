// Import the functions you need from the SDKs you need
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  "projectId": "testreportgen",
  "appId": "1:671245122025:web:03c816c0680afebe7af378",
  "storageBucket": "testreportgen.firebasestorage.app",
  "apiKey": "AIzaSyAsknobpAc2DPWsvQMHnxoY0u-TGVt-fXI",
  "authDomain": "testreportgen.firebaseapp.com",
  "measurementId": "",
  "messagingSenderId": "671245122025"
};

// Initialize Firebase
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);

export { app, auth };
