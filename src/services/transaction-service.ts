
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
        type: data.type,
        category: data.category,
        amount: data.amount,
        description: data.description,
        createdBy: data.createdBy,
        lastModifiedBy: data.lastModifiedBy,
    };
}

export const addTransaction = async (transaction: Omit<Transaction, 'id'>): Promise<string> => {
    const docRef = await addDoc(transactionsCollection, transaction);
    return docRef.id;
};

export const onTransactionsUpdate = (callback: (transactions: Transaction[]) => void): () => void => {
    return onSnapshot(transactionsCollection, (snapshot) => {
        callback(snapshot.docs.map(fromFirestore));
    });
};

export const updateTransaction = async (id: string, transaction: Partial<Omit<Transaction, 'id'>>): Promise<void> => {
    const transactionDoc = doc(db, 'transactions', id);
    await updateDoc(transactionDoc, transaction);
};

export const deleteTransaction = async (id: string): Promise<void> => {
    const transactionDoc = doc(db, 'transactions', id);
    await deleteDoc(transactionDoc);
};
