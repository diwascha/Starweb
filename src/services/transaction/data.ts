'use client';
import { getFirebase } from '@/lib/firebase';
import { 
    collection, 
    doc, 
    onSnapshot, 
    getDocs, 
    query, 
    orderBy, 
    setDoc, 
    updateDoc, 
    deleteDoc, 
    getDoc,
    DocumentData, 
    QueryDocumentSnapshot 
} from 'firebase/firestore';
import type { Transaction, TransactionType, InvoiceType, BillingType } from '@/lib/types';
import { COLLECTIONS } from '@/lib/constants';
import { createTimestamp } from '@/lib/service-utils';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

export const transactionsCollection = () => {
    const { db } = getFirebase();
    return collection(db, COLLECTIONS.TRANSACTIONS);
};

export const fromFirestore = (snapshot: QueryDocumentSnapshot<DocumentData> | any): Transaction => {
    const data = typeof snapshot.data === 'function' ? snapshot.data() : snapshot;
    return { 
        id: snapshot.id,
        purchaseNumber: data.purchaseNumber ? String(data.purchaseNumber) : null,
        vehicleId: data.vehicleId ? String(data.vehicleId) : null,
        date: String(data.date || ''),
        invoiceNumber: data.invoiceNumber ? String(data.invoiceNumber) : null,
        invoiceDate: data.invoiceDate ? String(data.invoiceDate) : null,
        invoiceType: (data.invoiceType || 'Normal') as InvoiceType,
        billingType: (data.billingType || 'Cash') as BillingType,
        chequeNumber: data.chequeNumber ? String(data.chequeNumber) : null,
        chequeDate: data.chequeDate ? String(data.chequeDate) : null,
        dueDate: data.dueDate ? String(data.dueDate) : null,
        partyId: data.partyId ? String(data.partyId) : null,
        accountId: data.accountId ? String(data.accountId) : null,
        items: Array.isArray(data.items) ? data.items : [],
        amount: Number(data.amount) || 0,
        remarks: data.remarks ? String(data.remarks) : null,
        tripId: data.tripId ? String(data.tripId) : null,
        expenseId: data.expenseId ? String(data.expenseId) : null,
        type: (data.type || 'Payment') as TransactionType,
        category: data.category ? String(data.category) : null,
        referenceType: data.referenceType ? String(data.referenceType) : null,
        referenceId: data.referenceId ? String(data.referenceId) : null,
        voucherId: data.voucherId ? String(data.voucherId) : null,
        createdBy: String(data.createdBy || 'System'),
        createdAt: String(data.createdAt || ''),
        lastModifiedBy: data.lastModifiedBy ? String(data.lastModifiedBy) : null,
        lastModifiedAt: data.lastModifiedAt ? String(data.lastModifiedAt) : null,
        ownership: data.ownership || 'Both',
    };
}

export const getTransaction = async (id: string): Promise<Transaction | null> => {
    const docRef = doc(transactionsCollection(), id);
    try {
        const snap = await getDoc(docRef);
        return snap.exists() ? fromFirestore(snap) : null;
    } catch (error: any) {
        if (error.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: docRef.path,
                operation: 'get',
            }));
        }
        return null;
    }
};

export const getTransactions = async (): Promise<Transaction[]> => {
    const q = query(transactionsCollection(), orderBy('date', 'desc'));
    try {
        const snapshot = await getDocs(q);
        return snapshot.docs.map(fromFirestore);
    } catch (error: any) {
        if (error.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: COLLECTIONS.TRANSACTIONS,
                operation: 'list',
            }));
        }
        throw error;
    }
};

export const onTransactionsUpdate = (callback: (txns: Transaction[]) => void): () => void => {
    const q = query(transactionsCollection(), orderBy('date', 'desc'));
    return onSnapshot(q, (snapshot) => {
        callback(snapshot.docs.map(fromFirestore));
    }, async (error) => {
        if (error.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: COLLECTIONS.TRANSACTIONS,
                operation: 'list',
            }));
        }
    });
};

export const addTransaction = async (transaction: Omit<Transaction, 'id' | 'createdAt' | 'lastModifiedAt'>): Promise<string> => {
    const docRef = doc(transactionsCollection());
    const now = createTimestamp();
    const payload = { ...transaction, createdAt: now, lastModifiedAt: now };
    setDoc(docRef, payload).catch(async (err: any) => {
        if (err.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: docRef.path,
                operation: 'create',
                requestResourceData: payload,
            }));
        }
    });
    return docRef.id;
};

export const updateTransaction = async (id: string, updates: Partial<Transaction>): Promise<void> => {
    const docRef = doc(transactionsCollection(), id);
    const payload = { ...updates, lastModifiedAt: createTimestamp() };
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

export const deleteTransaction = async (id: string): Promise<void> => {
    const docRef = doc(transactionsCollection(), id);
    deleteDoc(docRef).catch(async (err: any) => {
        if (err.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: docRef.path,
                operation: 'delete',
            }));
        }
    });
};
