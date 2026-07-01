'use client';
/**
 * @fileOverview Root Firebase Client Provider with simplified, resilient initialization.
 */

import { useState, useEffect, ReactNode, useMemo } from 'react';
import { FirebaseProvider } from './provider';
import { getFirebase } from '@/lib/firebase';
import { Toaster } from '@/components/ui/toaster';
import { FirebaseErrorListener } from '@/components/firebase-error-listener';

export function FirebaseClientProvider({ children }: { children: ReactNode }) {
    const [isMounted, setIsMounted] = useState(false);

    useEffect(() => {
        setIsMounted(true);
    }, []);

    const firebaseServices = useMemo(() => {
        if (!isMounted) return null;
        try {
            return getFirebase();
        } catch (error) {
            console.error("Critical: Firebase boot failed", error);
            return null;
        }
    }, [isMounted]);

    // While initializing, show a simple, stable loader
    if (!firebaseServices) {
        return (
            <div className="flex h-screen items-center justify-center bg-background">
                <div className="flex flex-col items-center gap-3">
                    <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-xs font-bold tracking-widest text-muted-foreground uppercase">
                        Starting StarSutra...
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