
'use client';

import { getFirebase } from '@/lib/firebase';
import { 
    collection, 
    doc, 
    setDoc, 
    onSnapshot, 
    updateDoc, 
    deleteDoc, 
    getDocs, 
    query, 
    where, 
    orderBy,
    limit,
    serverTimestamp,
    DocumentData,
    QueryDocumentSnapshot
} from 'firebase/firestore';
import type { SessionRecord } from '@/lib/types';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

const SESSIONS_COLLECTION = 'sessions';

const fromFirestore = (snapshot: QueryDocumentSnapshot<DocumentData>): SessionRecord => {
    const data = snapshot.data();
    return {
        id: snapshot.id,
        userId: data.userId,
        username: data.username,
        deviceId: data.deviceId,
        userAgent: data.userAgent,
        loginAt: data.loginAt,
        lastActive: data.lastActive,
        isRevoked: !!data.isRevoked,
    };
};

/**
 * Registers a new session for the current user and device.
 */
export const startSession = async (user: { id: string, username: string }, deviceId: string): Promise<string> => {
    const { db } = getFirebase();
    const sessionId = doc(collection(db, SESSIONS_COLLECTION)).id;
    const now = new Date().toISOString();
    
    const session: Omit<SessionRecord, 'id'> = {
        userId: user.id,
        username: user.username,
        deviceId,
        userAgent: navigator.userAgent,
        loginAt: now,
        lastActive: now,
        isRevoked: false,
    };

    try {
        await setDoc(doc(db, SESSIONS_COLLECTION, sessionId), session);
        return sessionId;
    } catch (error: any) {
        if (error.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: SESSIONS_COLLECTION,
                operation: 'create',
                requestResourceData: session
            }));
        }
        throw error;
    }
};

/**
 * Updates the activity heartbeat for a session.
 */
export const updateHeartbeat = async (sessionId: string) => {
    const { db } = getFirebase();
    const docRef = doc(db, SESSIONS_COLLECTION, sessionId);
    const now = new Date().toISOString();
    
    try {
        await updateDoc(docRef, { lastActive: now });
    } catch (error: any) {
        if (error.code === 'permission-denied') {
            // Silently fail heartbeats unless it's a critical error
        }
    }
};

/**
 * Terminates a session.
 */
export const endSession = async (sessionId: string) => {
    const { db } = getFirebase();
    try {
        await deleteDoc(doc(db, SESSIONS_COLLECTION, sessionId));
    } catch (error: any) {
        // Silently fail deletion on logout
    }
};

/**
 * Listens for revocation status of the current session.
 */
export const onSessionRevoked = (sessionId: string, onRevoke: () => void): (() => void) => {
    const { db } = getFirebase();
    return onSnapshot(doc(db, SESSIONS_COLLECTION, sessionId), (snapshot) => {
        if (snapshot.exists() && snapshot.data().isRevoked === true) {
            onRevoke();
        }
    });
};

/**
 * Admin: List all active sessions.
 */
export const onAllSessionsUpdate = (callback: (sessions: SessionRecord[]) => void): () => void => {
    const { db } = getFirebase();
    const q = query(collection(db, SESSIONS_COLLECTION), orderBy('lastActive', 'desc'));
    
    return onSnapshot(q, (snapshot) => {
        callback(snapshot.docs.map(fromFirestore));
    }, (error) => {
        if (error.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: SESSIONS_COLLECTION,
                operation: 'list'
            }));
        }
    });
};

/**
 * Admin: Remotely terminate a session.
 */
export const revokeSession = async (sessionId: string) => {
    const { db } = getFirebase();
    try {
        await updateDoc(doc(db, SESSIONS_COLLECTION, sessionId), { isRevoked: true });
    } catch (error: any) {
        if (error.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: `${SESSIONS_COLLECTION}/${sessionId}`,
                operation: 'update'
            }));
        }
        throw error;
    }
};
