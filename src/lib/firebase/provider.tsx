
'use client';

import { createContext, useContext, ReactNode, useState, useEffect } from 'react';
import type { FirebaseApp } from 'firebase/app';
import type { Auth } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';
import type { FirebaseStorage } from 'firebase/storage';
import type { Database } from 'firebase/database';
import { ref, onValue, off } from "firebase/database";
import { ConnectionStatusContext } from '@/hooks/use-connection-status';

interface FirebaseContextType {
    app: FirebaseApp;
    auth: Auth;
    db: Firestore;
    storage: FirebaseStorage;
    rtdb: Database;
}

const FirebaseContext = createContext<FirebaseContextType | null>(null);

interface FirebaseProviderProps extends FirebaseContextType {
    children: ReactNode;
}

export const FirebaseProvider = ({ children, app, auth, db, storage, rtdb }: FirebaseProviderProps) => {
    const [isConnected, setIsConnected] = useState(true);

    useEffect(() => {
        if (!rtdb) return;

        const connectedRef = ref(rtdb, '.info/connected');

        const listener = onValue(connectedRef, (snap) => {
            const connected = snap.val() === true;
            setIsConnected(connected);
        }, (error) => {
            console.error("Connection status listener error:", error);
            setIsConnected(false);
        });

        return () => {
            off(connectedRef, 'value', listener);
        };
    }, [rtdb]);

    return (
        <FirebaseContext.Provider value={{ app, auth, db, storage, rtdb }}>
            <ConnectionStatusContext.Provider value={isConnected}>
                {children}
            </ConnectionStatusContext.Provider>
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

export const useAuthService = () => useFirebase().auth;
export const useFirestoreService = () => useFirebase().db;
export const useStorageService = () => useFirebase().storage;
export const useDatabaseService = () => useFirebase().rtdb;
