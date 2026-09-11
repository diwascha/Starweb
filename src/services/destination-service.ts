import { getFirebase } from '@/lib/firebase';
import { reportWriteFailure } from '@/lib/write-reporting';
import { collection, onSnapshot, DocumentData, QueryDocumentSnapshot, doc, updateDoc, setDoc } from 'firebase/firestore';
import type { Destination } from '@/lib/types';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

const getDestinationsCollection = () => {
    const { db } = getFirebase();
    return collection(db, 'destinations');
};

const fromFirestore = (snapshot: QueryDocumentSnapshot<DocumentData>): Destination => {
    const data = snapshot.data();
    return {
        id: snapshot.id,
        name: data.name,
        standardAdvanceAmount: data.standardAdvanceAmount || 0,
        remarks: data.remarks || '',
        createdBy: data.createdBy,
        createdAt: data.createdAt,
        lastModifiedBy: data.lastModifiedBy,
        lastModifiedAt: data.lastModifiedAt,
    };
}

export const addDestination = async (destination: Omit<Destination, 'id'>): Promise<string> => {
    const payload = {
        ...destination,
        createdAt: new Date().toISOString(),
    };
    const docRef = doc(getDestinationsCollection());
    reportWriteFailure(
        setDoc(docRef, payload),
        { path: 'destinations', operation: 'create', requestResourceData: payload }
    );
    return docRef.id;
};

export const onDestinationsUpdate = (callback: (destinations: Destination[]) => void): () => void => {
    return onSnapshot(getDestinationsCollection(), 
        (snapshot) => {
            callback(snapshot.docs.map(fromFirestore));
        },
        async (error) => {
            if (error.code === 'permission-denied') {
                errorEmitter.emit('permission-error', new FirestorePermissionError({
                    path: 'destinations',
                    operation: 'list',
                }));
            }
        }
    );
};

export const updateDestination = async (id: string, destination: Partial<Omit<Destination, 'id'>>): Promise<void> => {
    const destDoc = doc(getDestinationsCollection(), id);
    const payload = {
        ...destination,
        lastModifiedAt: new Date().toISOString(),
    };
    reportWriteFailure(
        updateDoc(destDoc, payload),
        { path: destDoc.path, operation: 'update', requestResourceData: payload }
    );
};

