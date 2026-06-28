'use client';

import { getFirebase } from '@/lib/firebase';
import { collection, doc, setDoc, onSnapshot, increment, serverTimestamp, query, orderBy, getDocs, DocumentData, QueryDocumentSnapshot } from 'firebase/firestore';
import type { PageVisit } from '@/lib/types';
import { getNormalizedPath } from '@/lib/utils';

const getUsageCollection = () => {
    const { db } = getFirebase();
    return collection(db, 'pageVisits');
};

const fromFirestore = (snapshot: QueryDocumentSnapshot<DocumentData>): PageVisit => {
    const data = snapshot.data();
    return {
        id: snapshot.id,
        path: data.path,
        count: data.count || 0,
        lastVisited: data.lastVisited?.toDate?.().toISOString() || new Date().toISOString(),
    };
};

export const trackPageVisit = async (path: string) => {
    const { db } = getFirebase();
    
    // Double-ensure normalization for storage consistency
    const normalizedPath = getNormalizedPath(path);
    
    // Use encoded path as ID to avoid issues with slashes, but keep path field readable
    const pathId = normalizedPath.replace(/\//g, '_') || 'home';
    const docRef = doc(getUsageCollection(), pathId);
    
    await setDoc(docRef, {
        path: normalizedPath,
        count: increment(1),
        lastVisited: serverTimestamp()
    }, { merge: true });
};

export const onPageVisitsUpdate = (callback: (visits: PageVisit[]) => void): () => void => {
    const q = query(getUsageCollection(), orderBy('count', 'desc'));
    return onSnapshot(q, (snapshot) => {
        callback(snapshot.docs.map(fromFirestore));
    });
};

export const getPageVisits = async (): Promise<PageVisit[]> => {
    const q = query(getUsageCollection(), orderBy('count', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(fromFirestore);
};