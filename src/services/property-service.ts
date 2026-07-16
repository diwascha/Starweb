import { getFirebase } from '@/lib/firebase';
import { collection, addDoc, onSnapshot, DocumentData, QueryDocumentSnapshot, doc, updateDoc, deleteDoc, getDocs, query, orderBy } from 'firebase/firestore';
import type { RentalProperty } from '@/lib/types';
import { COLLECTIONS } from '@/lib/constants';
import { createTimestamp } from '@/lib/service-utils';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

const getCollection = () => {
    const { db } = getFirebase();
    return collection(db, COLLECTIONS.RENTAL_PROPERTIES);
};

const fromFirestore = (snapshot: QueryDocumentSnapshot<DocumentData>): RentalProperty => {
    const data = snapshot.data();
    return {
        id: snapshot.id,
        name: data.name,
        address: data.address,
        totalUnits: data.totalUnits || 0,
        createdBy: data.createdBy,
        createdAt: data.createdAt,
        lastModifiedBy: data.lastModifiedBy,
        lastModifiedAt: data.lastModifiedAt,
    };
};

export const onPropertiesUpdate = (callback: (properties: RentalProperty[]) => void): () => void => {
    const q = query(getCollection(), orderBy('createdAt', 'desc'));
    return onSnapshot(q, (snapshot) => {
        callback(snapshot.docs.map(fromFirestore));
    }, (error) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: COLLECTIONS.RENTAL_PROPERTIES,
            operation: 'list',
        }));
    });
};

export const getProperties = async (): Promise<RentalProperty[]> => {
    const q = query(getCollection(), orderBy('createdAt', 'desc'));
    try {
        const snapshot = await getDocs(q);
        return snapshot.docs.map(fromFirestore);
    } catch (error) {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: COLLECTIONS.RENTAL_PROPERTIES,
            operation: 'list',
        }));
        throw error;
    }
};

export const addProperty = async (property: Omit<RentalProperty, 'id' | 'createdAt'>): Promise<string> => {
    const now = createTimestamp();
    const payload = {
        ...property,
        createdAt: now,
    };
    const docRef = await addDoc(getCollection(), payload).catch(async (err) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: COLLECTIONS.RENTAL_PROPERTIES,
            operation: 'create',
            requestResourceData: payload,
        }));
        throw err;
    });
    return docRef.id;
};

export const updateProperty = async (id: string, updates: Partial<RentalProperty>): Promise<void> => {
    const docRef = doc(getCollection(), id);
    const payload = {
        ...updates,
        lastModifiedAt: createTimestamp(),
    };
    updateDoc(docRef, payload).catch(async (err) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: docRef.path,
            operation: 'update',
            requestResourceData: payload,
        }));
    });
};

export const deleteProperty = async (id: string): Promise<void> => {
    const docRef = doc(getCollection(), id);
    deleteDoc(docRef).catch(async (err) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: docRef.path,
            operation: 'delete',
        }));
    });
};
