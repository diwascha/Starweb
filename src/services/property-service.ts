import { getFirebase } from '@/lib/firebase';
import { collection, addDoc, onSnapshot, DocumentData, QueryDocumentSnapshot, doc, updateDoc, deleteDoc, getDocs, query, orderBy } from 'firebase/firestore';
import type { RentalProperty } from '@/lib/types';
import { COLLECTIONS } from '@/lib/constants';
import { createTimestamp, logServiceError } from '@/lib/service-utils';

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
        logServiceError('onPropertiesUpdate', error);
    });
};

export const getProperties = async (): Promise<RentalProperty[]> => {
    const q = query(getCollection(), orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(fromFirestore);
};

export const addProperty = async (property: Omit<RentalProperty, 'id' | 'createdAt'>): Promise<string> => {
    const now = createTimestamp();
    const docRef = await addDoc(getCollection(), {
        ...property,
        createdAt: now,
    });
    return docRef.id;
};

export const updateProperty = async (id: string, updates: Partial<RentalProperty>): Promise<void> => {
    const docRef = doc(getCollection(), id);
    await updateDoc(docRef, {
        ...updates,
        lastModifiedAt: createTimestamp(),
    });
};

export const deleteProperty = async (id: string): Promise<void> => {
    await deleteDoc(doc(getCollection(), id));
};
