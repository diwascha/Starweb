import { getFirebase } from '@/lib/firebase';
import { collection, doc, onSnapshot, getDoc, getDocs, orderBy, query } from 'firebase/firestore';
import type { Trip } from '@/lib/types';
import { COLLECTIONS } from '@/lib/constants';

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
    });
};

export const getTrip = async (id: string): Promise<Trip | null> => {
    const snap = await getDoc(doc(getTripsCollection(), id));
    return snap.exists() ? fromFirestore(snap) : null;
};
