'use client';
import { getFirebase } from '@/lib/firebase';
import { collection, doc, setDoc, onSnapshot, increment, serverTimestamp, query, orderBy, getDocs, DocumentData, QueryDocumentSnapshot } from 'firebase/firestore';
import type { PageVisit } from '@/lib/types';
import { getNormalizedPath } from '@/lib/utils';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { COLLECTIONS } from '@/lib/constants';

const getUsageCollection = () => {
    const { db } = getFirebase();
    return collection(db, COLLECTIONS.PAGE_VISITS);
};

const fromFirestore = (snapshot: QueryDocumentSnapshot<DocumentData>): PageVisit => {
    const data = snapshot.data();
    return {
        id: snapshot.id,
        path: String(data.path || ''),
        count: Number(data.count) || 0,
        lastVisited: data.lastVisited?.toDate?.().toISOString() || new Date().toISOString(),
    };
};

export const trackPageVisit = async (path: string) => {
    const { db } = getFirebase();
    const normalizedPath = getNormalizedPath(path);
    const pathId = normalizedPath.replace(/\//g, '_') || 'home';
    const docRef = doc(getUsageCollection(), pathId);
    
    const payload = {
        path: normalizedPath,
        count: increment(1),
        lastVisited: serverTimestamp()
    };

    setDoc(docRef, payload, { merge: true }).catch(async (err) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: COLLECTIONS.PAGE_VISITS,
            operation: 'write',
            requestResourceData: payload
        }));
    });
};

export const onPageVisitsUpdate = (callback: (visits: PageVisit[]) => void): () => void => {
    const q = query(getUsageCollection(), orderBy('count', 'desc'));
    return onSnapshot(q, (snapshot) => {
        callback(snapshot.docs.map(fromFirestore));
    }, async (err) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: COLLECTIONS.PAGE_VISITS,
            operation: 'list'
        }));
    });
};

export const getPageVisits = async (): Promise<PageVisit[]> => {
    const q = query(getUsageCollection(), orderBy('count', 'desc'));
    try {
        const snapshot = await getDocs(q);
        return snapshot.docs.map(fromFirestore);
    } catch (err) {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: COLLECTIONS.PAGE_VISITS,
            operation: 'list'
        }));
        throw err;
    }
};