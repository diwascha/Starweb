'use client';

import { createContext, useContext, ReactNode, useState, useEffect } from 'react';
import type { FirebaseApp } from 'firebase/app';
import type { Auth } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';
import type { FirebaseStorage } from 'firebase/storage';
import type { Database } from 'firebase/database';
import { ref, onValue, off } from "firebase/database";

interface FirebaseContextType {
    app: FirebaseApp;
    auth: Auth;
    db: Firestore;
    storage: FirebaseStorage;
    rtdb?: Database;
    isConnected: boolean;
}

const FirebaseContext = createContext<FirebaseContextType | null>(null);

interface FirebaseProviderProps {
    children: React.ReactNode;
    app: FirebaseApp;
    auth: Auth;
    db: Firestore;
    storage: FirebaseStorage;
    rtdb?: Database;
}

export const FirebaseProvider = ({ children, app, auth, db, storage, rtdb }: FirebaseProviderProps) => {
    const [isConnected, setIsConnected] = useState(true);

    useEffect(() => {
        // Realtime Database is used here only to monitor connection status.
        // It provides a special '.info/connected' path that toggles automatically.
        if (!rtdb) return;
        
        try {
            const connectedRef = ref(rtdb, '.info/connected');
            const listener = onValue(connectedRef, (snap) => {
                setIsConnected(snap.val() === true);
            }, (err) => {
                // If this fails (e.g. offline start), we assume we're just not connected to cloud yet
                setIsConnected(false);
            });

            return () => {
                off(connectedRef, 'value', listener);
            };
        } catch (e) {
            setIsConnected(false);
        }
    }, [rtdb]);

    return (
        <FirebaseContext.Provider value={{ app, auth, db, storage, rtdb, isConnected }}>
            {children}
        </FirebaseContext.Provider>
    );
};

export const useFirebase = (): FirebaseContextType => {
    const context = useContext(FirebaseContext);
    if (!context) {
        throw new Error('useFirebase must be used within a FirebaseProvider');
    }
    return context;
};

export const useFirebaseApp = () => useFirebase().app;
export const useAuthService = () => useFirebase().auth;
export const useFirestore = () => useFirebase().db;
export const useStorage = () => useFirebase().storage;
export const useDb = () => useFirebase().rtdb;
export const useConnectionStatus = () => useFirebase().isConnected;
