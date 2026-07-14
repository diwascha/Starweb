import { getFirebase } from '@/lib/firebase';
import { collection, doc, onSnapshot, getDocs, query, where, getDoc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import type { Transaction } from '@/lib/types';
import { COLLECTIONS } from '@/lib/constants';
import { createTimestamp } from '@/lib/service-utils';

export const transactionsCollection = () => {
    const { db } = getFirebase();
    return collection(db, COLLECTIONS.TRANSACTIONS);
};

export const fromFirestore = (snapshot: any): Transaction => {
    const data = snapshot.data();
    return { id: snapshot.id, ...data };
}

export const onTransactionsUpdate = (callback: (txns: Transaction[]) => void): () => void => {
    return onSnapshot(transactionsCollection(), (snapshot) => {
        callback(snapshot.docs.map(fromFirestore));
    });
};

export const addTransaction = async (transaction: Omit<Transaction, 'id' | 'createdAt' | 'lastModifiedAt'>): Promise<string> => {
    const docRef = doc(transactionsCollection());
    const now = createTimestamp();
    await setDoc(docRef, { ...transaction, createdAt: now, lastModifiedAt: now });
    return docRef.id;
};

export const updateTransaction = async (id: string, updates: Partial<Transaction>): Promise<void> => {
    await updateDoc(doc(transactionsCollection(), id), { ...updates, lastModifiedAt: createTimestamp() });
};

export const deleteTransaction = async (id: string): Promise<void> => {
    await deleteDoc(doc(transactionsCollection(), id));
};
