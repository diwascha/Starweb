'use client';
/**
 * @fileOverview Logging service for capturing system exceptions and telemetry.
 * Optimized to handle offline states gracefully by allowing Firestore to queue logs.
 */

import { getFirebase } from '@/lib/firebase';
import { collection, addDoc, serverTimestamp, query, orderBy, limit, onSnapshot, DocumentData, QueryDocumentSnapshot } from 'firebase/firestore';
import { COLLECTIONS } from '@/lib/constants';

export interface SystemLog {
    id: string;
    timestamp: string;
    level: 'error' | 'warn' | 'info';
    module: string;
    message: string;
    stack?: string | null;
    username: string;
    userId: string;
    context?: any | null;
    createdAt: any;
}

const fromFirestore = (snapshot: QueryDocumentSnapshot<DocumentData>): SystemLog => {
    const data = snapshot.data();
    return {
        id: snapshot.id,
        timestamp: data.timestamp,
        level: data.level,
        module: data.module,
        message: data.message,
        stack: data.stack ?? null,
        username: data.username,
        userId: data.userId,
        context: data.context ?? null,
        createdAt: data.createdAt,
    };
};

/**
 * Logs an error to Firestore. 
 * Because persistent cache is enabled, this will save locally if offline
 * and sync to the cloud later.
 */
export const logError = async (error: Error | any, moduleName: string, context?: any) => {
    try {
        const { db } = getFirebase();
        
        let user = null;
        try {
            const userSession = typeof window !== 'undefined' ? localStorage.getItem('user_session') : null;
            user = userSession ? JSON.parse(userSession) : null;
        } catch (e) {
            // Silently fail session parsing
        }

        const errorMessage = error?.message || (typeof error === 'string' ? error : 'Unknown Error');
        const errorStack = error?.stack || null;

        // addDoc will work offline and sync automatically
        await addDoc(collection(db, COLLECTIONS.LOGS), {
            timestamp: new Date().toISOString(),
            level: 'error',
            module: moduleName || 'Unknown',
            message: errorMessage,
            stack: errorStack,
            username: user?.username || 'Guest',
            userId: user?.id || 'anonymous',
            context: context ?? null,
            createdAt: serverTimestamp()
        });
    } catch (e) {
        // Absolute fallback to prevent recursion in error handling
        console.error("Critical: Logger Failure", e, "Original Error:", error);
    }
};

/**
 * Real-time listener for logs (for settings dashboard).
 */
export const onLogsUpdate = (callback: (logs: SystemLog[]) => void) => {
    try {
        const { db } = getFirebase();
        const q = query(collection(db, COLLECTIONS.LOGS), orderBy('createdAt', 'desc'), limit(50));
        return onSnapshot(q, (snapshot) => {
            callback(snapshot.docs.map(fromFirestore));
        });
    } catch (e) {
        console.error("Failed to subscribe to logs", e);
        return () => {};
    }
};
