import { getFirebase } from '@/lib/firebase';
import { collection, doc, onSnapshot, getDoc, getDocs, orderBy, query } from 'firebase/firestore';
import type { Trip } from '@/lib/types';
import { COLLECTIONS } from '@/lib/constants';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

export const getTripsCollection = () => {
    const { db } = getFirebase();
    return collection(db, COLLECTIONS.TRIPS);
}

const fromFirestore = (snapshot: any): Trip => {
    return { id: snapshot.id, ...snapshot.data() };
}

export const onTripsUpdate = (callback: (trips: Trip[]) => void): () => void => {
    const q = query(getTripsCollection(), orderBy('date', 'desc'));
    return onSnapshot(q, (snapshot) => {
        callback(snapshot.docs.map(fromFirestore));
    }, async (error) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: COLLECTIONS.TRIPS,
            operation: 'list',
        }));
    });
};

export const getTrip = async (id: string): Promise<Trip | null> => {
    const docRef = doc(getTripsCollection(), id);
    try {
        const snap = await getDoc(docRef);
        return snap.exists() ? fromFirestore(snap) : null;
    } catch (error) {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: docRef.path,
            operation: 'get',
        }));
        return null;
    }
};
