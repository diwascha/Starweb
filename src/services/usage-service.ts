'use client';
import { getSupabase } from '@/lib/supabase';
import { getFirebase } from '@/lib/firebase';
import { reportWriteFailure } from '@/lib/write-reporting';
import { collection, doc, setDoc, onSnapshot, increment, serverTimestamp, query, orderBy, DocumentData, QueryDocumentSnapshot } from 'firebase/firestore';
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
        lastVisited: (typeof data.lastVisited === 'string' ? data.lastVisited : data.lastVisited?.toDate?.().toISOString()) || new Date().toISOString(),
    };
};

export const trackPageVisit = async (path: string) => {
    const { db } = getFirebase();
    const normalizedPath = getNormalizedPath(path);
    
    // Create a safe document ID from the normalized path.
    // We remove slashes and ensure a consistent key for root.
    const pathId = normalizedPath === '/' ? 'root' : normalizedPath.replace(/^\//, '').replace(/\//g, '--');
    // One atomic +1 in the database (public.record_page_visit); the table
    // itself is not writable directly.
    const { error } = await getSupabase().rpc('record_page_visit', { p_id: pathId, p_path: normalizedPath });
    if (error) console.warn('Page visit not recorded:', error.message);
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

