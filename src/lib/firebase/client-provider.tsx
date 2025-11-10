
'use client';

import { useState, useEffect, ReactNode } from 'react';
import { FirebaseProvider } from './provider';
import { getFirebase } from '@/lib/firebase'; // We need this to pass to the provider

// This component ensures that Firebase is initialized only on the client side.
export function FirebaseClientProvider({ children }: { children: ReactNode }) {
    const [isClient, setIsClient] = useState(false);

    useEffect(() => {
        setIsClient(true);
    }, []);

    if (!isClient) {
        // You can return a loader here if you want
        return null; 
    }

    // Initialize Firebase here, once, and pass it down.
    const firebaseServices = getFirebase();

    return (
        <FirebaseProvider {...firebaseServices}>
            {children}
        </FirebaseProvider>
    );
}
