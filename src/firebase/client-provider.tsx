'use client';
/**
 * @fileOverview Optimized root Firebase Client Provider.
 * Initializing services at the module level to avoid delays in the component lifecycle.
 */

import { useState, useEffect, ReactNode, useMemo } from 'react';
import { FirebaseProvider } from './provider';
import { getFirebase } from '@/lib/firebase';
import { Toaster } from '@/components/ui/toaster';
import { FirebaseErrorListener } from '@/components/firebase-error-listener';

// Initialize Firebase services immediately at the module level for faster access.
// The getFirebase() utility is idempotent and safe to call here.
const firebaseServices = getFirebase();

export function FirebaseClientProvider({ children }: { children: ReactNode }) {
    const [isMounted, setIsMounted] = useState(false);

    useEffect(() => {
        // Delay children rendering until after hydration to prevent mismatch.
        setIsMounted(true);
    }, []);

    if (!isMounted) {
        // Render a lightweight placeholder during the initial hydration phase.
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
