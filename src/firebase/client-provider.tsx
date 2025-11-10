
'use client';

import { useState, useEffect, ReactNode } from 'react';
import { FirebaseProvider } from './provider';
import { getFirebase } from '@/lib/firebase';
import { Toaster } from '@/components/ui/toaster';

export function FirebaseClientProvider({ children }: { children: ReactNode }) {
    const [isClient, setIsClient] = useState(false);
    const [firebaseServices, setFirebaseServices] = useState<ReturnType<typeof getFirebase> | null>(null);

    useEffect(() => {
        setIsClient(true);
        // Initialize Firebase here, once, on the client.
        setFirebaseServices(getFirebase());
    }, []);

    if (!isClient || !firebaseServices) {
        return (
            <div className="flex h-screen items-center justify-center">
                <p>Loading application...</p>
            </div>
        );
    }

    return (
        <FirebaseProvider {...firebaseServices}>
            {children}
            <Toaster />
        </FirebaseProvider>
    );
}
