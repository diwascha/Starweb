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

/**
 * Who a log entry is attributed to. The uid comes from the live Firebase
 * session - never from localStorage, which the user can edit - and the rules
 * reject any entry whose userId is not the caller's. The username is only a
 * display label: taken from the cached profile when it belongs to this same
 * uid, otherwise from the sign-in email. Returns null when nobody is signed
 * in, since such a write would be rejected anyway.
 */
const currentActor = (): { uid: string; username: string } | null => {
    const { auth } = getFirebase();
    const firebaseUser = auth?.currentUser;
    if (!firebaseUser) return null;
    let username = firebaseUser.email || firebaseUser.uid;
    try {
        const cached = typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('user_session') || 'null') : null;
        if (cached?.id === firebaseUser.uid && cached?.username) username = cached.username;
    } catch { /* fall back to the email */ }
    return { uid: firebaseUser.uid, username };
};

export const logError = async (error: Error | any, moduleName: string, context?: any) => {
    try {
        const { db } = getFirebase();
        const actor = currentActor();
        if (!actor) return;

        const errorMessage = error?.message || (typeof error === 'string' ? error : 'Unknown Error');
        const errorStack = error?.stack || null;

        const payload = {
            timestamp: new Date().toISOString(),
            level: 'error',
            module: moduleName || 'Unknown',
            message: errorMessage,
            stack: errorStack,
            username: actor.username,
            userId: actor.uid,
            context: context ?? null,
            createdAt: serverTimestamp()
        };

        addDoc(collection(db, COLLECTIONS.LOGS), payload).catch(async (err) => {
            // Log creation errors are silenced in the UI to prevent loops
            if (process.env.NODE_ENV === 'development') {
                console.warn("Background log creation failed:", err.message);
            }
        });
    } catch (e) {}
};

export const logAudit = async (action: string, moduleName: string, context?: any) => {
    try {
        const { db } = getFirebase();
        const actor = currentActor();
        if (!actor) return;

        const payload = {
            timestamp: new Date().toISOString(),
            level: 'info',
            module: moduleName || 'Audit',
            message: action,
            username: actor.username,
            userId: actor.uid,
            context: context ?? null,
            createdAt: serverTimestamp()
        };

        addDoc(collection(db, COLLECTIONS.LOGS), payload).catch(async (err) => {
             if (process.env.NODE_ENV === 'development') {
                console.warn("Background audit creation failed:", err.message);
            }
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