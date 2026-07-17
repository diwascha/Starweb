import { getFirebase } from '@/lib/firebase';
import { collection, addDoc, onSnapshot, DocumentData, QueryDocumentSnapshot, doc, updateDoc, deleteDoc, getDocs, query, where, orderBy } from 'firebase/firestore';
import type { RentalUnit } from '@/lib/types';
import { COLLECTIONS } from '@/lib/constants';
import { createTimestamp } from '@/lib/service-utils';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

const getCollection = () => {
    const { db } = getFirebase();
    return collection(db, COLLECTIONS.RENTAL_UNITS);
};

const fromFirestore = (snapshot: QueryDocumentSnapshot<DocumentData>): RentalUnit => {
    const data = snapshot.data();
    return {
        id: snapshot.id,
        propertyId: data.propertyId,
        propertyName: data.propertyName,
        unitNumber: data.unitNumber,
        floor: data.floor,
        type: data.type,
        monthlyRent: data.monthlyRent || 0,
        status: data.status || 'Vacant',
        tenantId: data.tenantId,
        tenantName: data.tenantName,
        outstandingBalance: data.outstandingBalance || 0,
        createdBy: data.createdBy,
        createdAt: data.createdAt,
        lastModifiedBy: data.lastModifiedBy,
        lastModifiedAt: data.lastModifiedAt,
    };
};

export const onUnitsUpdate = (callback: (units: RentalUnit[]) => void): () => void => {
    const q = query(getCollection(), orderBy('unitNumber', 'asc'));
    return onSnapshot(q, (snapshot) => {
        callback(snapshot.docs.map(fromFirestore));
    }, (error) => {
        if (error.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: COLLECTIONS.RENTAL_UNITS,
                operation: 'list',
            }));
        }
    });
};

export const getUnitsByProperty = async (propertyId: string): Promise<RentalUnit[]> => {
    const q = query(getCollection(), where('propertyId', '==', propertyId));
    try {
        const snapshot = await getDocs(q);
        return snapshot.docs.map(fromFirestore);
    } catch (error: any) {
        if (error.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: COLLECTIONS.RENTAL_UNITS,
                operation: 'list',
            }));
        }
        return [];
    }
};

export const addUnit = async (unit: Omit<RentalUnit, 'id' | 'createdAt'>): Promise<string> => {
    const now = createTimestamp();
    const payload = {
        ...unit,
        createdAt: now,
    };
    const docRef = await addDoc(getCollection(), payload).catch(async (err: any) => {
        if (err.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: COLLECTIONS.RENTAL_UNITS,
                operation: 'create',
                requestResourceData: payload,
            }));
        }
        throw err;
    });
    return docRef.id;
};

export const updateUnit = async (id: string, updates: Partial<RentalUnit>): Promise<void> => {
    const docRef = doc(getCollection(), id);
    const payload = {
        ...updates,
        lastModifiedAt: createTimestamp(),
    };
    updateDoc(docRef, payload).catch(async (err: any) => {
        if (err.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: docRef.path,
                operation: 'update',
                requestResourceData: payload,
            }));
        }
    });
};

export const deleteUnit = async (id: string): Promise<void> => {
    const docRef = doc(getCollection(), id);
    deleteDoc(docRef).catch(async (err: any) => {
        if (err.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: docRef.path,
                operation: 'delete',
            }));
        }
    });
};