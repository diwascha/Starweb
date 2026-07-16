'use client';
import { getFirebase } from '@/lib/firebase';
import { collection, addDoc, onSnapshot, DocumentData, QueryDocumentSnapshot, doc, updateDoc, deleteDoc, getDocs } from 'firebase/firestore';
import type { UnitOfMeasurement } from '@/lib/types';
import { logServiceError } from '@/lib/service-utils';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError, type SecurityRuleContext } from '@/firebase/errors';

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
    const docRef = await addDoc(getUomCollection(), payload).catch(async (err) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: 'uom',
            operation: 'create',
            requestResourceData: payload,
        }));
        throw err;
    });
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
    updateDoc(uomDoc, payload).catch(async (err) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: uomDoc.path,
            operation: 'update',
            requestResourceData: payload,
        }));
    });
};

export const deleteUom = async (id: string): Promise<void> => {
    if (!id) return;
    const uomDoc = doc(getUomCollection(), id);
    deleteDoc(uomDoc).catch(async (err) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: uomDoc.path,
            operation: 'delete',
        }));
    });
};