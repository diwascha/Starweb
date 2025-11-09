
import { db } from '@/lib/firebase';
import { collection, addDoc, onSnapshot, DocumentData, QueryDocumentSnapshot, doc, updateDoc, deleteDoc, getDocs } from 'firebase/firestore';
import type { Account } from '@/lib/types';

const accountsCollection = collection(db, 'accounts');

const fromFirestore = (snapshot: QueryDocumentSnapshot<DocumentData>): Account => {
    const data = snapshot.data();
    return {
        id: snapshot.id,
        name: data.name,
        type: data.type,
        accountNumber: data.accountNumber,
        bankName: data.bankName,
        branch: data.branch,
        createdBy: data.createdBy,
        createdAt: data.createdAt,
        lastModifiedBy: data.lastModifiedBy,
        lastModifiedAt: data.lastModifiedAt,
    };
}

export const getAccounts = async (forceFetch: boolean = false): Promise<Account[]> => {
    const snapshot = await getDocs(accountsCollection);
    return snapshot.docs.map(fromFirestore);
};

export const addAccount = async (account: Omit<Account, 'id'>): Promise<string> => {
    const docRef = await addDoc(accountsCollection, {
        ...account,
        createdAt: new Date().toISOString(),
    });
    return docRef.id;
};

export const updateAccount = async (id: string, account: Partial<Omit<Account, 'id'>>): Promise<void> => {
    const accountDoc = doc(db, 'accounts', id);
    await updateDoc(accountDoc, {
        ...account,
        lastModifiedAt: new Date().toISOString(),
    });
};

export const deleteAccount = async (id: string): Promise<void> => {
    const accountDoc = doc(db, 'accounts', id);
    await deleteDoc(accountDoc);
};

export const onAccountsUpdate = (callback: (accounts: Account[]) => void): () => void => {
    return onSnapshot(accountsCollection, (snapshot) => {
        callback(snapshot.docs.map(fromFirestore));
    });
};
