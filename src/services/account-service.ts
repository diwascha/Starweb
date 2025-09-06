
import { db } from '@/lib/firebase';
import { collection, addDoc, onSnapshot, DocumentData, QueryDocumentSnapshot } from 'firebase/firestore';
import type { Account } from '@/lib/types';

const accountsCollection = collection(db, 'accounts');

const fromFirestore = (snapshot: QueryDocumentSnapshot<DocumentData>): Account => {
    const data = snapshot.data();
    return {
        id: snapshot.id,
        name: data.name,
        type: data.type,
        createdBy: data.createdBy,
        createdAt: data.createdAt,
        lastModifiedBy: data.lastModifiedBy,
        lastModifiedAt: data.lastModifiedAt,
    };
}

export const addAccount = async (account: Omit<Account, 'id'>): Promise<string> => {
    const docRef = await addDoc(accountsCollection, {
        ...account,
        createdAt: new Date().toISOString(),
    });
    return docRef.id;
};

export const onAccountsUpdate = (callback: (accounts: Account[]) => void): () => void => {
    return onSnapshot(accountsCollection, (snapshot) => {
        callback(snapshot.docs.map(fromFirestore));
    });
};
