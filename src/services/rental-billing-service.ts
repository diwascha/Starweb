import { getFirebase } from '@/lib/firebase';
import { collection, addDoc, onSnapshot, DocumentData, QueryDocumentSnapshot, doc, updateDoc, deleteDoc, getDocs, query, where, orderBy, writeBatch } from 'firebase/firestore';
import type { RentalBill, RentalAgreement, Transaction } from '@/lib/types';
import { COLLECTIONS } from '@/lib/constants';
import { createTimestamp, logServiceError } from '@/lib/service-utils';
import { addTransaction } from './transaction-service';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

const getCollection = () => {
    const { db } = getFirebase();
    return collection(db, COLLECTIONS.RENTAL_BILLS);
};

const fromFirestore = (snapshot: QueryDocumentSnapshot<DocumentData>): RentalBill => {
    const data = snapshot.data();
    return {
        id: snapshot.id,
        agreementId: data.agreementId,
        tenantId: data.tenantId,
        tenantName: data.tenantName,
        unitId: data.unitId,
        unitNumber: data.unitNumber,
        propertyId: data.propertyId,
        propertyName: data.propertyName,
        type: data.type,
        amount: data.amount || 0,
        billingMonth: data.billingMonth,
        billingYear: data.billingYear,
        dueDate: data.dueDate,
        status: data.status,
        transactionId: data.transactionId,
        remarks: data.remarks,
        createdBy: data.createdBy,
        createdAt: data.createdAt,
        ownership: data.ownership || 'Rental',
    };
};

export const onRentalBillsUpdate = (callback: (bills: RentalBill[]) => void): () => void => {
    const q = query(getCollection(), orderBy('createdAt', 'desc'));
    return onSnapshot(q, (snapshot) => {
        callback(snapshot.docs.map(fromFirestore));
    }, (error) => {
        if (error.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: COLLECTIONS.RENTAL_BILLS,
                operation: 'list',
            }));
        }
    });
};

export const generateRentBill = async (agreement: RentalAgreement, month: number, year: number, generatedBy: string): Promise<string> => {
    const { db } = getFirebase();
    const now = createTimestamp();
    
    // 1. Create Ledger Transaction (Sales)
    const txn: Omit<Transaction, 'id' | 'createdAt' | 'lastModifiedAt'> = {
        date: now,
        type: 'Sales',
        category: 'Rent',
        amount: agreement.monthlyRent,
        invoiceType: 'Normal',
        billingType: 'Credit',
        partyId: agreement.tenantId,
        items: [{
            particular: `Rent for ${agreement.unitNumber} - ${month+1}/${year}`,
            quantity: 1,
            rate: agreement.monthlyRent
        }],
        remarks: `Auto-generated rent bill for ${agreement.propertyName}`,
        createdBy: generatedBy,
        referenceType: 'Rental Bill',
        referenceId: agreement.id,
        ownership: agreement.ownership || 'Rental'
    };

    const txnId = await addTransaction(txn);

    // 2. Create Rental Bill Record
    const billData: Omit<RentalBill, 'id' | 'createdAt'> = {
        agreementId: agreement.id,
        tenantId: agreement.tenantId,
        tenantName: agreement.tenantName || 'Tenant',
        unitId: agreement.unitId,
        unitNumber: agreement.unitNumber || '?',
        propertyId: agreement.propertyId,
        propertyName: agreement.propertyName || 'Property',
        type: 'Rent',
        amount: agreement.monthlyRent,
        billingMonth: month,
        billingYear: year,
        dueDate: now, // Default to generation date
        status: 'Unpaid',
        transactionId: txnId,
        createdBy: generatedBy,
        ownership: agreement.ownership || 'Rental'
    };

    const payload = {
        ...billData,
        createdAt: now,
    };

    const docRef = await addDoc(getCollection(), payload).catch(async (err: any) => {
        if (err.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: COLLECTIONS.RENTAL_BILLS,
                operation: 'create',
                requestResourceData: payload,
            }));
        }
        throw err;
    });

    return docRef.id;
};

export const deleteRentalBill = async (id: string): Promise<void> => {
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