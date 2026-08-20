
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
    QueryDocumentSnapshot,
    writeBatch
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
 * Uses a deterministic ID (userId_deviceId) to prevent record pile-up.
 */
export const startSession = async (user: { id: string, username: string }, deviceId: string): Promise<string> => {
    const { db } = getFirebase();
    // Unique ID per user-device pair ensures we only ever have one record per workstation
    const sessionId = `${user.id}_${deviceId}`;
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
        await setDoc(doc(db, SESSIONS_COLLECTION, sessionId), session, { merge: true });
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
        // Silently fail heartbeats to maintain UX
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
 * Admin: List all active sessions, filtering out revoked ones to prevent pile-up.
 */
export const onAllSessionsUpdate = (callback: (sessions: SessionRecord[]) => void): () => void => {
    const { db } = getFirebase();
    const q = query(collection(db, SESSIONS_COLLECTION), orderBy('lastActive', 'desc'));
    
    return onSnapshot(q, (snapshot) => {
        // Filter out revoked sessions so they disappear from the active workstation list immediately
        const activeSessions = snapshot.docs
            .map(fromFirestore)
            .filter(s => !s.isRevoked);
        callback(activeSessions);
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

/**
 * Maintenance: Remove stale sessions that haven't sent a heartbeat within the threshold.
 */
export const cleanupStaleSessions = async (thresholdMinutes: number): Promise<number> => {
    const { db } = getFirebase();
    const cutoff = new Date(Date.now() - thresholdMinutes * 60 * 1000).toISOString();
    const q = query(collection(db, SESSIONS_COLLECTION), where('lastActive', '<', cutoff));
    
    const snap = await getDocs(q);
    if (snap.empty) return 0;

    const batch = writeBatch(db);
    snap.docs.forEach(d => batch.delete(d.ref));
    
    await batch.commit().catch(err => {
        if (err.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: 'sessions_cleanup_batch',
                operation: 'write'
            }));
        }
    });

    return snap.size;
};
