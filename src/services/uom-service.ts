'use client';
import { getFirebase } from '@/lib/firebase';
import { reportWriteFailure } from '@/lib/write-reporting';
import { collection, onSnapshot, DocumentData, QueryDocumentSnapshot, doc, updateDoc, deleteDoc, getDocs, setDoc } from 'firebase/firestore';
import type { UnitOfMeasurement } from '@/lib/types';

import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
const getUomCollection = () => {
    const { db } = getFirebase();
    return collection(db, 'uom');
}

const fromFirestore = (snapshot: QueryDocumentSnapshot<DocumentData>): UnitOfMeasurement => {
    const data = snapshot.data();
    return {
        id: snapshot.id,
        name: data.name,
        abbreviation: data.abbreviation,
        createdBy: data.createdBy,
        createdAt: data.createdAt,
        lastModifiedBy: data.lastModifiedBy,
        lastModifiedAt: data.lastModifiedAt,
    };
}

export const getUoms = async (): Promise<UnitOfMeasurement[]> => {
    try {
        const snapshot = await getDocs(getUomCollection());
        return snapshot.docs.map(fromFirestore);
    } catch (error) {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: 'uom',
            operation: 'list',
        }));
        throw error;
    }
};

export const addUom = async (uom: Omit<UnitOfMeasurement, 'id'>): Promise<string> => {
    const payload = {
        ...uom,
        createdAt: new Date().toISOString(),
    };
    // doc() mints the id locally; setDoc then writes without
    // blocking on the server, so this works offline too.
    const docRef = doc(getUomCollection());
    reportWriteFailure(
        setDoc(docRef, payload),
    { path: 'uom', operation: 'create', requestResourceData: payload }
    );
    return docRef.id;
};

export const onUomsUpdate = (callback: (uoms: UnitOfMeasurement[]) => void): () => void => {
    return onSnapshot(getUomCollection(), 
        (snapshot) => {
            callback(snapshot.docs.map(fromFirestore));
        },
        async (error) => {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: 'uom',
                operation: 'list',
            }));
        }
    );
};

export const updateUom = async (id: string, uom: Partial<Omit<UnitOfMeasurement, 'id'>>): Promise<void> => {
    if (!id) return;
    const uomDoc = doc(getUomCollection(), id);
    const payload = {
        ...uom,
        lastModifiedAt: new Date().toISOString(),
    };
    reportWriteFailure(
        updateDoc(uomDoc, payload),
        { path: uomDoc.path, operation: 'update', requestResourceData: payload }
    );
};

export const deleteUom = async (id: string): Promise<void> => {
    if (!id) return;
    const uomDoc = doc(getUomCollection(), id);
    reportWriteFailure(
        deleteDoc(uomDoc),
        { path: uomDoc.path, operation: 'delete' }
    );
};