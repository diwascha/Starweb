
import { getFirebase } from '@/lib/firebase';
import { collection, addDoc, onSnapshot, DocumentData, QueryDocumentSnapshot, doc, updateDoc, deleteDoc, getDocs } from 'firebase/firestore';
import type { Account } from '@/lib/types';

const getAccountsCollection = () => {
    const { db } = getFirebase();
    return collection(db, 'accounts');
}

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

export const getAccounts = async (useCache = false): Promise<Account[]> => {
    // Note: Simple caching strategy. For more complex scenarios, consider libraries like TanStack Query.
    if (useCache && typeof window !== 'undefined') {
        const cached = sessionStorage.getItem('accounts');
        if (cached) return JSON.parse(cached);
    }
    const snapshot = await getDocs(getAccountsCollection());
    const accounts = snapshot.docs.map(fromFirestore);
    if (typeof window !== 'undefined') {
        sessionStorage.setItem('accounts', JSON.stringify(accounts));
    }
    return accounts;
};

export const addAccount = async (account: Omit<Account, 'id'>): Promise<string> => {
    const docRef = await addDoc(getAccountsCollection(), {
        ...account,
        createdAt: new Date().toISOString(),
    });
    return docRef.id;
};

export const updateAccount = async (id: string, account: Partial<Omit<Account, 'id'>>): Promise<void> => {
    const accountDoc = doc(getAccountsCollection(), id);
    await updateDoc(accountDoc, {
        ...account,
        lastModifiedAt: new Date().toISOString(),
    });
};

export const deleteAccount = async (id: string): Promise<void> => {
    const accountDoc = doc(getAccountsCollection(), id);
    await deleteDoc(accountDoc);
};

export const onAccountsUpdate = (callback: (accounts: Account[]) => void): () => void => {
    return onSnapshot(getAccountsCollection(), 
        (snapshot) => {
            const accounts = snapshot.docs.map(fromFirestore);
            if (typeof window !== 'undefined') {
                sessionStorage.setItem('accounts', JSON.stringify(accounts));
            }
            callback(accounts);
        },
        (error) => {
            console.error("FIREBASE FAIL MESSAGE (Accounts):", error.message, error);
        }
    );
};
