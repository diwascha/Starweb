'use client';
/**
 * @fileOverview Root Firebase Client Provider with simplified, resilient initialization.
 */

import { useState, useEffect, ReactNode } from 'react';
import { FirebaseProvider } from './provider';
import { getFirebase } from '@/lib/firebase';
import { Toaster } from '@/components/ui/toaster';
import { FirebaseErrorListener } from '@/components/firebase-error-listener';

export function FirebaseClientProvider({ children }: { children: ReactNode }) {
    const [firebaseServices, setFirebaseServices] = useState<any>(null);
    const [initError, setInitError] = useState<boolean>(false);

    useEffect(() => {
        // Safe client-side initialization after component mount
        try {
            const services = getFirebase();
            setFirebaseServices(services);
        } catch (error) {
            console.error("Critical: Firebase boot failed", error);
            setInitError(true);
        }
    }, []);

    // While initializing, show a simple, stable loader
    if (!firebaseServices) {
        return (
            <div className="flex h-screen items-center justify-center bg-background">
                <div className="flex flex-col items-center gap-3">
                    <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-xs font-bold tracking-widest text-muted-foreground uppercase">
                        {initError ? 'System Error - Please Refresh' : 'System Booting...'}
                    </p>
                </div>
            </div>
        );
    }

    return (
        <FirebaseProvider {...firebaseServices}>
            {/* Re-throw Firebase errors into the React tree for boundary handling */}
            <FirebaseErrorListener />
            {children}
            <Toaster />
        </FirebaseProvider>
    );
}
