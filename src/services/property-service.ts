import { getFirebase } from '@/lib/firebase';
import { reportWriteFailure } from '@/lib/write-reporting';
import { collection, onSnapshot, DocumentData, QueryDocumentSnapshot, doc, updateDoc, deleteDoc, query, orderBy, setDoc } from 'firebase/firestore';
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
        ownership: data.ownership || 'Rental',
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

export const addProperty = async (property: Omit<RentalProperty, 'id' | 'createdAt'>): Promise<string> => {
    const now = createTimestamp();
    const payload = {
        ...property,
        createdAt: now,
    };
    // doc() mints the id locally; setDoc then writes without
    // blocking on the server, so this works offline too.
    const docRef = doc(getCollection());
    reportWriteFailure(
        setDoc(docRef, payload),
    { path: COLLECTIONS.RENTAL_PROPERTIES, operation: 'create', requestResourceData: payload }
    );
    return docRef.id;
};

export const updateProperty = async (id: string, updates: Partial<RentalProperty>): Promise<void> => {
    const docRef = doc(getCollection(), id);
    const payload = {
        ...updates,
        lastModifiedAt: createTimestamp(),
    };
    reportWriteFailure(
        updateDoc(docRef, payload),
        { path: docRef.path, operation: 'update', requestResourceData: payload }
    );
};

export const deleteProperty = async (id: string): Promise<void> => {
    const docRef = doc(getCollection(), id);
    reportWriteFailure(
        deleteDoc(docRef),
        { path: docRef.path, operation: 'delete' }
    );
};