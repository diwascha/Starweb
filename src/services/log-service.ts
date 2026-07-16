'use client';

import { getFirebase } from '@/lib/firebase';
import { collection, addDoc, serverTimestamp, query, orderBy, limit, onSnapshot, DocumentData, QueryDocumentSnapshot } from 'firebase/firestore';
import { COLLECTIONS } from '@/lib/constants';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

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

export const logError = async (error: Error | any, moduleName: string, context?: any) => {
    try {
        const { db } = getFirebase();
        let user = null;
        try {
            const userSession = typeof window !== 'undefined' ? localStorage.getItem('user_session') : null;
            user = userSession ? JSON.parse(userSession) : null;
        } catch (e) {}

        const errorMessage = error?.message || (typeof error === 'string' ? error : 'Unknown Error');
        const errorStack = error?.stack || null;

        const payload = {
            timestamp: new Date().toISOString(),
            level: 'error',
            module: moduleName || 'Unknown',
            message: errorMessage,
            stack: errorStack,
            username: user?.username || 'Guest',
            userId: user?.id || 'anonymous',
            context: context ?? null,
            createdAt: serverTimestamp()
        };

        addDoc(collection(db, COLLECTIONS.LOGS), payload).catch(async (err) => {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: COLLECTIONS.LOGS,
                operation: 'create',
                requestResourceData: payload
            }));
        });
    } catch (e) {}
};

export const logAudit = async (action: string, moduleName: string, context?: any) => {
    try {
        const { db } = getFirebase();
        let user = null;
        try {
            const userSession = typeof window !== 'undefined' ? localStorage.getItem('user_session') : null;
            user = userSession ? JSON.parse(userSession) : null;
        } catch (e) {}

        const payload = {
            timestamp: new Date().toISOString(),
            level: 'info',
            module: moduleName || 'Audit',
            message: action,
            username: user?.username || 'Guest',
            userId: user?.id || 'anonymous',
            context: context ?? null,
            createdAt: serverTimestamp()
        };

        addDoc(collection(db, COLLECTIONS.LOGS), payload).catch(async (err) => {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: COLLECTIONS.LOGS,
                operation: 'create',
                requestResourceData: payload
            }));
        });
    } catch (e) {}
};

export const onLogsUpdate = (callback: (logs: SystemLog[]) => void) => {
    const { db } = getFirebase();
    const q = query(collection(db, COLLECTIONS.LOGS), orderBy('createdAt', 'desc'), limit(50));
    return onSnapshot(q, (snapshot) => {
        callback(snapshot.docs.map(fromFirestore));
    }, async (err) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: COLLECTIONS.LOGS,
            operation: 'list'
        }));
    });
};