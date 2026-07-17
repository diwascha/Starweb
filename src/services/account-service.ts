'use client';
import { getFirebase } from '@/lib/firebase';
import { collection, onSnapshot, DocumentData, QueryDocumentSnapshot, doc, updateDoc, deleteDoc, getDocs, setDoc } from 'firebase/firestore';
import type { Account, AccountType, AccountOwnership, BankAccountType } from '@/lib/types';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

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
    try {
        const snapshot = await getDocs(getAccountsCollection());
        return snapshot.docs.map(fromFirestore);
    } catch (error: any) {
        if (error.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: 'accounts',
                operation: 'list',
            }));
        }
        throw error;
    }
};

export const addAccount = async (account: Omit<Account, 'id'>): Promise<string> => {
    const payload = {
        ...account,
        createdAt: new Date().toISOString(),
    };
    const docRef = doc(getAccountsCollection());
    setDoc(docRef, payload).catch(async (err: any) => {
        if (err.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: 'accounts',
                operation: 'create',
                requestResourceData: payload,
            }));
        }
    });
    return docRef.id;
};

export const updateAccount = async (id: string, account: Partial<Omit<Account, 'id'>>): Promise<void> => {
    const accountDoc = doc(getAccountsCollection(), id);
    const payload = {
        ...account,
        lastModifiedAt: new Date().toISOString(),
    };
    updateDoc(accountDoc, payload).catch(async (err: any) => {
        if (err.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: accountDoc.path,
                operation: 'update',
                requestResourceData: payload,
            }));
        }
    });
};

export const deleteAccount = async (id: string): Promise<void> => {
    const accountDoc = doc(getAccountsCollection(), id);
    deleteDoc(accountDoc).catch(async (err: any) => {
        if (err.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: accountDoc.path,
                operation: 'delete',
            }));
        }
    });
};

export const onAccountsUpdate = (callback: (accounts: Account[]) => void): () => void => {
    return onSnapshot(getAccountsCollection(), 
        (snapshot) => {
            callback(snapshot.docs.map(fromFirestore));
        },
        async (error) => {
            if (error.code === 'permission-denied') {
                errorEmitter.emit('permission-error', new FirestorePermissionError({
                    path: 'accounts',
                    operation: 'list',
                }));
            }
        }
    );
};