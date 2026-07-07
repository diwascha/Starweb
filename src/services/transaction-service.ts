/**
 * @fileOverview Transaction service for the general ledger.
 * Refactored for non-blocking offline writes.
 */

import { getFirebase } from '@/lib/firebase';
import { collection, addDoc, doc, updateDoc, deleteDoc, onSnapshot, DocumentData, QueryDocumentSnapshot, getDocs, writeBatch, query, where, getDoc, setDoc } from 'firebase/firestore';
import type { Transaction } from '@/lib/types';
import { COLLECTIONS } from '@/lib/constants';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError, type SecurityRuleContext } from '@/firebase/errors';

const transactionsCollection = () => {
    const { db } = getFirebase();
    return collection(db, COLLECTIONS.TRANSACTIONS);
};

const fromFirestore = (snapshot: QueryDocumentSnapshot<DocumentData> | DocumentData): Transaction => {
    const data = snapshot.data();
    
    let type = data.type;
    if (type === 'Expense') type = 'Payment';
    if (type === 'Income') type = 'Receipt';

    return {
        id: snapshot.id,
        purchaseNumber: data.purchaseNumber ?? null,
        vehicleId: data.vehicleId ?? null,
        date: data.date,
        invoiceNumber: data.invoiceNumber ?? null,
        invoiceDate: data.invoiceDate ?? null,
        invoiceType: data.invoiceType,
        billingType: data.billingType,
        chequeNumber: data.chequeNumber ?? null,
        chequeDate: data.chequeDate ?? null,
        dueDate: data.dueDate ?? null,
        partyId: data.partyId ?? null,
        accountId: data.accountId ?? null,
        items: data.items,
        amount: data.amount,
        remarks: data.remarks ?? null,
        tripId: data.tripId ?? null,
        type: type,
        category: data.category ?? null,
        referenceType: data.referenceType ?? null,
        referenceId: data.referenceId ?? null,
        voucherId: data.voucherId ?? null,
        createdBy: data.createdBy,
        createdAt: data.createdAt,
        lastModifiedBy: data.lastModifiedBy ?? null,
        lastModifiedAt: data.lastModifiedAt ?? null,
    };
}

export const getTransactionsForParty = async (partyId: string): Promise<Transaction[]> => {
    if (!partyId) return [];
    const q = query(transactionsCollection(), where("partyId", "==", partyId));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(fromFirestore);
};

export const addTransaction = async (transaction: Omit<Transaction, 'id' | 'createdAt' | 'lastModifiedAt'>): Promise<string> => {
    const docRef = doc(transactionsCollection());
    const id = docRef.id;
    const now = new Date().toISOString();
    
    const payload = {
        ...transaction,
        createdAt: now,
        lastModifiedAt: now,
    };

    setDoc(docRef, payload).catch(async (err) => {
        const permissionError = new FirestorePermissionError({
            path: docRef.path,
            operation: 'create',
            requestResourceData: payload,
        } satisfies SecurityRuleContext);
        errorEmitter.emit('permission-error', permissionError);
    });

    return id;
};

export const updateTransaction = async (id: string, transaction: Partial<Omit<Transaction, 'id'>>): Promise<void> => {
    const transactionDoc = doc(transactionsCollection(), id);
    const now = new Date().toISOString();
    
    updateDoc(transactionDoc, {
        ...transaction,
        lastModifiedAt: now,
    }).catch(async (err) => {
        const permissionError = new FirestorePermissionError({
            path: transactionDoc.path,
            operation: 'update',
            requestResourceData: transaction,
        } satisfies SecurityRuleContext);
        errorEmitter.emit('permission-error', permissionError);
    });
};

export const saveVoucher = async (voucherData: any, createdBy: string) => {
    const { db } = getFirebase();
    let batch = writeBatch(db);
    let writeCount = 0;
    const BATCH_LIMIT = 499;
    const now = new Date().toISOString();
    const voucherId = doc(collection(db, COLLECTIONS.TRANSACTIONS)).id; 

    for (const item of voucherData.items) {
        if (writeCount >= BATCH_LIMIT) {
            batch.commit().catch(async (err) => {
                errorEmitter.emit('permission-error', new FirestorePermissionError({ path: COLLECTIONS.TRANSACTIONS, operation: 'write' }));
            });
            batch = writeBatch(db);
            writeCount = 0;
        }

        const { ledgerId, vehicleId, recAmount, payAmount, narration } = item;
        
        let amount = 0;
        let type: 'Payment' | 'Receipt' | null = null;
        
        if (payAmount > 0) {
            amount = payAmount;
            type = 'Payment';
        } else if (recAmount > 0) {
            amount = recAmount;
            type = 'Receipt';
        }

        if (type && amount > 0) {
            const transactionRef = doc(transactionsCollection());
            const newTransaction: Omit<Transaction, 'id' | 'createdAt' | 'lastModifiedAt'> = {
                date: voucherData.date.toISOString(),
                type: type,
                billingType: voucherData.billingType,
                vehicleId: vehicleId || null,
                partyId: ledgerId || null,
                amount: amount,
                remarks: narration || voucherData.remarks || null,
                category: 'Settlement', 
                invoiceType: 'Normal', 
                items: [{ particular: `${voucherData.voucherNo}-${type}`, quantity: 1, rate: amount }],
                accountId: voucherData.accountId || null,
                chequeNumber: voucherData.chequeNo || null,
                chequeDate: voucherData.chequeDate ? voucherData.chequeDate.toISOString() : null,
                voucherId: voucherId,
                referenceType: "Voucher",
                referenceId: voucherData.voucherNo,
                createdBy: createdBy,
                dueDate: null,
                invoiceDate: null,
                invoiceNumber: null,
                tripId: null,
                lastModifiedBy: null,
                purchaseNumber: null,
            };
            batch.set(transactionRef, {
                ...newTransaction,
                createdAt: now,
                lastModifiedAt: now
            });
            writeCount++;
        }
    }
    
    if (writeCount > 0) {
        batch.commit().catch(async (err) => {
             errorEmitter.emit('permission-error', new FirestorePermissionError({ path: COLLECTIONS.TRANSACTIONS, operation: 'write' }));
        });
    }
};

export const onTransactionsUpdate = (callback: (transactions: Transaction[]) => void): () => void => {
    return onSnapshot(transactionsCollection(), 
        (snapshot) => {
            callback(snapshot.docs.map(fromFirestore));
        },
        async (error) => {
            errorEmitter.emit('permission-error', new FirestorePermissionError({ path: COLLECTIONS.TRANSACTIONS, operation: 'list' }));
        }
    );
};

export const getTransaction = async (id: string): Promise<Transaction | null> => {
    if (!id || typeof id !== 'string') return null;
    const transactionDoc = doc(transactionsCollection(), id);
    const docSnap = await getDoc(transactionDoc);
    if (docSnap.exists()) {
        return fromFirestore(docSnap);
    } else {
        return null;
    }
};

export const getTransactions = async (): Promise<Transaction[]> => {
    const snapshot = await getDocs(transactionsCollection());
    return snapshot.docs.map(fromFirestore);
};

export const getVoucherTransactions = async (voucherId: string): Promise<Transaction[]> => {
    if (!voucherId || typeof voucherId !== 'string') return [];
    const q = query(transactionsCollection(), where("voucherId", "==", voucherId));
    const querySnapshot = await getDocs(q);
    if (!querySnapshot.empty) {
        return querySnapshot.docs.map(fromFirestore);
    }
    
    const { db } = getFirebase();
    const legacyId = voucherId.replace('legacy-', '');
    const docSnap = await getDoc(doc(db, COLLECTIONS.TRANSACTIONS, legacyId));
    if (docSnap.exists()) {
        return [fromFirestore(docSnap)];
    }

    return [];
};

export const updateVoucher = async (voucherId: string, voucherData: any, modifiedBy: string) => {
    const { db } = getFirebase();
    let batch = writeBatch(db);
    let writeCount = 0;
    const BATCH_LIMIT = 499;
    const now = new Date().toISOString();

    const existingTxns = await getVoucherTransactions(voucherId);
    for (const txn of existingTxns) {
        if (writeCount >= BATCH_LIMIT) {
            batch.commit().catch(async (err) => {
                errorEmitter.emit('permission-error', new FirestorePermissionError({ path: COLLECTIONS.TRANSACTIONS, operation: 'write' }));
            });
            batch = writeBatch(db);
            writeCount = 0;
        }
        batch.delete(doc(db, COLLECTIONS.TRANSACTIONS, txn.id));
        writeCount++;
    }
    
    for (const item of voucherData.items) {
        if (writeCount >= BATCH_LIMIT) {
            batch.commit().catch(async (err) => {
                errorEmitter.emit('permission-error', new FirestorePermissionError({ path: COLLECTIONS.TRANSACTIONS, operation: 'write' }));
            });
            batch = writeBatch(db);
            writeCount = 0;
        }
        
        const { ledgerId, vehicleId, recAmount, payAmount, narration } = item;
        
        let amount = 0;
        let type: 'Payment' | 'Receipt' | null = null;
        
        if (payAmount > 0) {
            amount = payAmount;
            type = 'Payment';
        } else if (recAmount > 0) {
            amount = recAmount;
            type = 'Receipt';
        }

        if (type && amount > 0) {
            const transactionRef = doc(transactionsCollection());
            const newTransaction: Omit<Transaction, 'id'|'createdAt'|'createdBy'> = {
                date: voucherData.date.toISOString(),
                type: type,
                billingType: voucherData.billingType,
                vehicleId: vehicleId || null,
                partyId: ledgerId || null,
                amount: amount,
                remarks: narration || voucherData.remarks || null,
                category: 'Settlement',
                invoiceType: 'Normal',
                items: [{ particular: `${voucherData.voucherNo}-${type}`, quantity: 1, rate: amount }],
                accountId: voucherData.accountId || null,
                chequeNumber: voucherData.chequeNo || null,
                chequeDate: voucherData.chequeDate ? voucherData.chequeDate.toISOString() : null,
                voucherId: voucherId,
                referenceType: "Voucher",
                referenceId: voucherData.voucherNo,
                lastModifiedBy: modifiedBy,
                lastModifiedAt: now,
                dueDate: null,
                invoiceDate: null,
                invoiceNumber: null,
                tripId: null,
                purchaseNumber: null,
            };
            batch.set(transactionRef, {
                ...newTransaction,
                createdBy: existingTxns[0]?.createdBy || modifiedBy,
                createdAt: existingTxns[0]?.createdAt || now,
            });
            writeCount++;
        }
    }

    if (writeCount > 0) {
        batch.commit().catch(async (err) => {
            errorEmitter.emit('permission-error', new FirestorePermissionError({ path: COLLECTIONS.TRANSACTIONS, operation: 'write' }));
        });
    }
};

export const deleteTransaction = async (id: string): Promise<void> => {
    if (!id) return;
    const transactionDoc = doc(transactionsCollection(), id);
    deleteDoc(transactionDoc).catch(async (err) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({ path: transactionDoc.path, operation: 'delete' }));
    });
};

export const deleteVoucher = async (voucherId: string): Promise<void> => {
    const { db } = getFirebase();
    const BATCH_LIMIT = 499;
    
    if (voucherId.startsWith('legacy-')) {
        const docId = voucherId.replace('legacy-', '');
        const docRef = doc(db, COLLECTIONS.TRANSACTIONS, docId);
        deleteDoc(docRef).catch(async (err) => {
            errorEmitter.emit('permission-error', new FirestorePermissionError({ path: docRef.path, operation: 'delete' }));
        });
    } else {
        const q = query(transactionsCollection(), where("voucherId", "==", voucherId));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) return;

        let batch = writeBatch(db);
        let writeCount = 0;

        for (const doc of querySnapshot.docs) {
            batch.delete(doc.ref);
            writeCount++;
            if (writeCount >= BATCH_LIMIT) {
                batch.commit().catch(async (err) => {
                     errorEmitter.emit('permission-error', new FirestorePermissionError({ path: COLLECTIONS.TRANSACTIONS, operation: 'write' }));
                });
                batch = writeBatch(db);
                writeCount = 0;
            }
        }
        
        if (writeCount > 0) {
            batch.commit().catch(async (err) => {
                 errorEmitter.emit('permission-error', new FirestorePermissionError({ path: COLLECTIONS.TRANSACTIONS, operation: 'write' }));
            });
        }
    }
};
