'use client';
/**
 * @fileOverview Root Firebase Client Provider with error listener integration.
 */

import { useState, useEffect, ReactNode } from 'react';
import { FirebaseProvider } from './provider';
import { getFirebase } from '@/lib/firebase';
import { Toaster } from '@/components/ui/toaster';
import { FirebaseErrorListener } from '@/components/firebase-error-listener';

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
                <div className="flex flex-col items-center gap-2">
                    <p className="text-sm font-medium animate-pulse">Initializing Services...</p>
                </div>
            </div>
        );
    }

    return (
        <FirebaseProvider {...firebaseServices}>
            {/* The listener re-throws errors to be caught by Next.js error segments or ErrorBoundary */}
            <FirebaseErrorListener />
            {children}
            <Toaster />
        </FirebaseProvider>
    );
}
