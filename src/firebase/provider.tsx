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
    rtdb: Database;
}

const FirebaseContext = createContext<FirebaseContextType | null>(null);

interface FirebaseProviderProps extends FirebaseContextType {
    children: ReactNode;
}

export const FirebaseProvider = ({ children, app, auth, db, storage, rtdb }: FirebaseProviderProps) => {
    return (
        <FirebaseContext.Provider value={{ app, auth, db, storage, rtdb }}>
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
