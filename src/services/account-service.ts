import { getFirebase } from '@/lib/firebase';
import { collection, addDoc, onSnapshot, DocumentData, QueryDocumentSnapshot, doc, updateDoc, deleteDoc, getDocs } from 'firebase/firestore';
import type { Account, AccountType, AccountOwnership, BankAccountType } from '@/lib/types';
import { logServiceError } from '@/lib/service-utils';

const getAccountsCollection = () => {
    const { db } = getFirebase();
    return collection(db, 'accounts');
}

const fromFirestore = (snapshot: QueryDocumentSnapshot<DocumentData>): Account => {
    const data = snapshot.data();
    return {
        id: snapshot.id,
        name: String(data.name || ''),
        type: (data.type || 'Cash') as AccountType,
        ownership: (data.ownership || 'Both') as AccountOwnership,
        accountNumber: data.accountNumber ? String(data.accountNumber) : undefined,
        bankName: data.bankName ? String(data.bankName) : undefined,
        branch: data.branch ? String(data.branch) : undefined,
        bankAccountType: data.bankAccountType as BankAccountType | undefined,
        createdBy: String(data.createdBy || 'System'),
        createdAt: String(data.createdAt || ''),
        lastModifiedBy: data.lastModifiedBy ? String(data.lastModifiedBy) : undefined,
        lastModifiedAt: data.lastModifiedAt ? String(data.lastModifiedAt) : undefined,
    };
}

export const getAccounts = async (useCache = false): Promise<Account[]> => {
    if (useCache && typeof window !== 'undefined') {
        const cached = sessionStorage.getItem('accounts');
        if (cached) {
            try {
                return JSON.parse(cached);
            } catch (e) {
                logServiceError("getAccountsCache", e);
                sessionStorage.removeItem('accounts');
            }
        }
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
            logServiceError("onAccountsUpdate", error);
        }
    );
};
