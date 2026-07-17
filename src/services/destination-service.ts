import { getFirebase } from '@/lib/firebase';
import { collection, onSnapshot, DocumentData, QueryDocumentSnapshot, doc, updateDoc, deleteDoc, getDocs, setDoc } from 'firebase/firestore';
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

export const getDestinations = async (): Promise<Destination[]> => {
    try {
        const snapshot = await getDocs(getDestinationsCollection());
        return snapshot.docs.map(fromFirestore);
    } catch (error: any) {
        if (error.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: 'destinations',
                operation: 'list',
            }));
        }
        throw error;
    }
}

export const addDestination = async (destination: Omit<Destination, 'id'>): Promise<string> => {
    const payload = {
        ...destination,
        createdAt: new Date().toISOString(),
    };
    const docRef = doc(getDestinationsCollection());
    setDoc(docRef, payload).catch(async (err: any) => {
        if (err.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: 'destinations',
                operation: 'create',
                requestResourceData: payload,
            }));
        }
    });
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
    updateDoc(destDoc, payload).catch(async (err: any) => {
        if (err.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: destDoc.path,
                operation: 'update',
                requestResourceData: payload,
            }));
        }
    });
};

export const deleteDestination = async (id: string): Promise<void> => {
    const destDoc = doc(getDestinationsCollection(), id);
    deleteDoc(destDoc).catch(async (err: any) => {
        if (err.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: destDoc.path,
                operation: 'delete',
            }));
        }
    });
};