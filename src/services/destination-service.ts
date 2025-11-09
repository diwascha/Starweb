
import { db } from '@/lib/firebase';
import { collection, addDoc, onSnapshot, DocumentData, QueryDocumentSnapshot, doc, updateDoc, deleteDoc, getDocs } from 'firebase/firestore';
import type { Destination } from '@/lib/types';

const destinationsCollection = collection(db, 'destinations');

const fromFirestore = (snapshot: QueryDocumentSnapshot<DocumentData>): Destination => {
    const data = snapshot.data();
    return {
        id: snapshot.id,
        name: data.name,
        createdBy: data.createdBy,
        createdAt: data.createdAt,
        lastModifiedBy: data.lastModifiedBy,
        lastModifiedAt: data.lastModifiedAt,
    };
}

export const getDestinations = async (forceFetch = false): Promise<Destination[]> => {
    const snapshot = await getDocs(destinationsCollection);
    return snapshot.docs.map(fromFirestore);
}

export const addDestination = async (destination: Omit<Destination, 'id'>): Promise<string> => {
    const docRef = await addDoc(destinationsCollection, {
        ...destination,
        createdAt: new Date().toISOString(),
    });
    return docRef.id;
};

export const onDestinationsUpdate = (callback: (destinations: Destination[]) => void): () => void => {
    return onSnapshot(destinationsCollection, 
        (snapshot) => {
            callback(snapshot.docs.map(fromFirestore));
        },
        (error) => {
            console.error("onDestinationsUpdate listener failed: ", error);
        }
    );
};

export const updateDestination = async (id: string, destination: Partial<Omit<Destination, 'id'>>): Promise<void> => {
    const destDoc = doc(db, 'destinations', id);
    await updateDoc(destDoc, {
        ...destination,
        lastModifiedAt: new Date().toISOString(),
    });
};

export const deleteDestination = async (id: string): Promise<void> => {
    const destDoc = doc(db, 'destinations', id);
    await deleteDoc(destDoc);
};
