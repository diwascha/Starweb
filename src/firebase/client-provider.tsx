'use client';
/**
 * @fileOverview Root Firebase Client Provider with resilient initialization.
 */

import { useState, useEffect, ReactNode, useMemo } from 'react';
import { FirebaseProvider } from './provider';
import { getFirebase } from '@/lib/firebase';
import { Toaster } from '@/components/ui/toaster';
import { FirebaseErrorListener } from '@/components/firebase-error-listener';

export function FirebaseClientProvider({ children }: { children: ReactNode }) {
    const [isMounted, setIsMounted] = useState(false);

    useEffect(() => {
        // Mark as mounted on the client to allow initialization
        setIsMounted(true);
    }, []);

    // Initialize Firebase services only once the component has mounted on the client.
    // This avoids crashes during Next.js pre-rendering or hydration mismatches.
    const firebaseServices = useMemo(() => {
        if (!isMounted) return null;
        try {
            return getFirebase();
        } catch (error) {
            console.error("Critical: Firebase initialization failed", error);
            return null;
        }
    }, [isMounted]);

    if (!isMounted || !firebaseServices) {
        // Render a lightweight, non-blocking shell while React hydrates.
        return (
            <div className="flex h-screen items-center justify-center bg-background">
                <div className="flex flex-col items-center gap-2">
                    <p className="text-xs font-semibold tracking-widest text-muted-foreground uppercase animate-pulse">
                        Initializing StarSutra...
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
