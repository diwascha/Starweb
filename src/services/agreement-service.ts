import { getFirebase } from '@/lib/firebase';
import { collection, addDoc, onSnapshot, DocumentData, QueryDocumentSnapshot, doc, updateDoc, deleteDoc, getDocs, query, where, orderBy, writeBatch } from 'firebase/firestore';
import type { RentalAgreement } from '@/lib/types';
import { COLLECTIONS } from '@/lib/constants';
import { createTimestamp, logServiceError } from '@/lib/service-utils';
import { updateUnit } from './unit-service';

const getCollection = () => {
    const { db } = getFirebase();
    return collection(db, COLLECTIONS.RENTAL_AGREEMENTS);
};

const fromFirestore = (snapshot: QueryDocumentSnapshot<DocumentData>): RentalAgreement => {
    const data = snapshot.data();
    return {
        id: snapshot.id,
        unitId: data.unitId,
        unitNumber: data.unitNumber,
        propertyId: data.propertyId,
        propertyName: data.propertyName,
        tenantId: data.tenantId,
        tenantName: data.tenantName,
        monthlyRent: data.monthlyRent || 0,
        securityDeposit: data.securityDeposit || 0,
        billingDate: data.billingDate || 1,
        lateFee: data.lateFee || 0,
        startDate: data.startDate,
        endDate: data.endDate,
        status: data.status || 'Pending',
        createdBy: data.createdBy,
        createdAt: data.createdAt,
        lastModifiedBy: data.lastModifiedBy,
        lastModifiedAt: data.lastModifiedAt,
    };
};

export const onAgreementsUpdate = (callback: (agreements: RentalAgreement[]) => void): () => void => {
    const q = query(getCollection(), orderBy('createdAt', 'desc'));
    return onSnapshot(q, (snapshot) => {
        callback(snapshot.docs.map(fromFirestore));
    }, (error) => {
        logServiceError('onAgreementsUpdate', error);
    });
};

export const activateAgreement = async (agreement: Omit<RentalAgreement, 'id' | 'createdAt'>): Promise<string> => {
    const { db } = getFirebase();
    const batch = writeBatch(db);
    const now = createTimestamp();
    
    // 1. Create Agreement
    const agreementRef = doc(getCollection());
    batch.set(agreementRef, {
        ...agreement,
        status: 'Active',
        createdAt: now,
    });

    // 2. Update Unit Status
    const unitRef = doc(db, COLLECTIONS.RENTAL_UNITS, agreement.unitId);
    batch.update(unitRef, {
        status: 'Occupied',
        tenantId: agreement.tenantId,
        tenantName: agreement.tenantName,
        lastModifiedAt: now,
    });

    await batch.commit();
    return agreementRef.id;
};

export const terminateAgreement = async (id: string, unitId: string, terminatedBy: string): Promise<void> => {
    const { db } = getFirebase();
    const batch = writeBatch(db);
    const now = createTimestamp();

    batch.update(doc(getCollection(), id), {
        status: 'Terminated',
        lastModifiedBy: terminatedBy,
        lastModifiedAt: now,
    });

    batch.update(doc(db, COLLECTIONS.RENTAL_UNITS, unitId), {
        status: 'Vacant',
        tenantId: null,
        tenantName: null,
        lastModifiedAt: now,
    });

    await batch.commit();
};

export const deleteAgreement = async (id: string): Promise<void> => {
    await deleteDoc(doc(getCollection(), id));
};
