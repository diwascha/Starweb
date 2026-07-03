import { getFirebase } from '@/lib/firebase';
import { collection, addDoc, onSnapshot, DocumentData, QueryDocumentSnapshot, doc, updateDoc, deleteDoc, getDocs, query, where, orderBy } from 'firebase/firestore';
import type { RentalUnit } from '@/lib/types';
import { COLLECTIONS } from '@/lib/constants';
import { createTimestamp, logServiceError } from '@/lib/service-utils';

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
        logServiceError('onUnitsUpdate', error);
    });
};

export const getUnitsByProperty = async (propertyId: string): Promise<RentalUnit[]> => {
    const q = query(getCollection(), where('propertyId', '==', propertyId));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(fromFirestore);
};

export const addUnit = async (unit: Omit<RentalUnit, 'id' | 'createdAt'>): Promise<string> => {
    const now = createTimestamp();
    const docRef = await addDoc(getCollection(), {
        ...unit,
        createdAt: now,
    });
    return docRef.id;
};

export const updateUnit = async (id: string, updates: Partial<RentalUnit>): Promise<void> => {
    const docRef = doc(getCollection(), id);
    await updateDoc(docRef, {
        ...updates,
        lastModifiedAt: createTimestamp(),
    });
};

export const deleteUnit = async (id: string): Promise<void> => {
    await deleteDoc(doc(getCollection(), id));
};
