
'use client';

import { createContext, useContext, ReactNode, useMemo } from 'react';
import { getFirebase } from '@/lib/firebase';
import type { FirebaseApp } from 'firebase/app';
import type { Auth } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';
import type { FirebaseStorage } from 'firebase/storage';

interface FirebaseContextType {
    app: FirebaseApp;
    auth: Auth;
    db: Firestore;
    storage: FirebaseStorage;
}

const FirebaseContext = createContext<FirebaseContextType | null>(null);

export const FirebaseProvider = ({ children }: { children: ReactNode }) => {
    const firebaseServices = useMemo(() => getFirebase(), []);

    return (
        <FirebaseContext.Provider value={firebaseServices}>
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

export const useAuthService = () => useFirebase().auth;
export const useFirestoreService = () => useFirebase().db;
export const useStorageService = () => useFirebase().storage;
