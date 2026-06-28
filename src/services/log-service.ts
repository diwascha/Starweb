
'use client';
/**
 * @fileOverview Logging service for capturing system exceptions and telemetry.
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
    stack?: string;
    username: string;
    userId: string;
    context?: any;
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
        stack: data.stack,
        username: data.username,
        userId: data.userId,
        context: data.context,
        createdAt: data.createdAt,
    };
};

/**
 * Logs an error to Firestore.
 */
export const logError = async (error: Error | any, moduleName: string, context?: any) => {
    try {
        const { db } = getFirebase();
        const userSession = typeof window !== 'undefined' ? localStorage.getItem('user_session') : null;
        const user = userSession ? JSON.parse(userSession) : null;

        await addDoc(collection(db, COLLECTIONS.LOGS), {
            timestamp: new Date().toISOString(),
            level: 'error',
            module: moduleName,
            message: error?.message || String(error),
            stack: error?.stack || null,
            username: user?.username || 'Guest',
            userId: user?.id || 'anonymous',
            context: context || null,
            createdAt: serverTimestamp()
        });
    } catch (e) {
        // Fallback to console if logging fails
        console.error("Critical: Logger Failure", e, "Original Error:", error);
    }
};

/**
 * Real-time listener for logs (for settings dashboard).
 */
export const onLogsUpdate = (callback: (logs: SystemLog[]) => void) => {
    const { db } = getFirebase();
    const q = query(collection(db, COLLECTIONS.LOGS), orderBy('createdAt', 'desc'), limit(50));
    return onSnapshot(q, (snapshot) => {
        callback(snapshot.docs.map(fromFirestore));
    });
};
