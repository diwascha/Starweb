

import { db } from '@/lib/firebase';
import { collection, addDoc, doc, updateDoc, deleteDoc, onSnapshot, DocumentData, QueryDocumentSnapshot, getDocs } from 'firebase/firestore';
import type { Transaction } from '@/lib/types';

const transactionsCollection = collection(db, 'transactions');

const fromFirestore = (snapshot: QueryDocumentSnapshot<DocumentData>): Transaction => {
    const data = snapshot.data();
    return {
        id: snapshot.id,
        vehicleId: data.vehicleId,
        date: data.date,
        invoiceNumber: data.invoiceNumber,
        invoiceDate: data.invoiceDate,
        invoiceType: data.invoiceType,
        billingType: data.billingType,
        chequeNumber: data.chequeNumber,
        chequeDate: data.chequeDate,
        dueDate: data.dueDate,
        partyId: data.partyId,
        accountId: data.accountId,
        items: data.items,
        amount: data.amount,
        remarks: data.remarks,
        tripId: data.tripId,
        type: data.type,
        createdBy: data.createdBy,
        createdAt: data.createdAt,
        lastModifiedBy: data.lastModifiedBy,
        lastModifiedAt: data.lastModifiedAt,
    };
}

export const addTransaction = async (transaction: Omit<Transaction, 'id' | 'createdAt' | 'lastModifiedAt'>): Promise<string> => {
    const docRef = await addDoc(transactionsCollection, {
        ...transaction,
        createdAt: new Date().toISOString(),
    });
    return docRef.id;
};

export const onTransactionsUpdate = (callback: (transactions: Transaction[]) => void): () => void => {
    return onSnapshot(transactionsCollection, (snapshot) => {
        callback(snapshot.docs.map(fromFirestore));
    });
};

export const updateTransaction = async (id: string, transaction: Partial<Omit<Transaction, 'id'>>): Promise<void> => {
    const transactionDoc = doc(db, 'transactions', id);
    await updateDoc(transactionDoc, {
        ...transaction,
        lastModifiedAt: new Date().toISOString(),
    });
};

export const deleteTransaction = async (id: string): Promise<void> => {
    const transactionDoc = doc(db, 'transactions', id);
    await deleteDoc(transactionDoc);
};
