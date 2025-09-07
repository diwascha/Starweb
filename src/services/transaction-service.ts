

import { db } from '@/lib/firebase';
import { collection, addDoc, doc, updateDoc, deleteDoc, onSnapshot, DocumentData, QueryDocumentSnapshot, getDocs, writeBatch, query, where, getDoc } from 'firebase/firestore';
import type { Transaction } from '@/lib/types';

const transactionsCollection = collection(db, 'transactions');

const fromFirestore = (snapshot: QueryDocumentSnapshot<DocumentData> | DocumentData): Transaction => {
    const data = snapshot.data();
    return {
        id: snapshot.id,
        purchaseNumber: data.purchaseNumber,
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
        voucherId: data.voucherId,
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

export const saveVoucher = async (voucherData: any, createdBy: string) => {
    const batch = writeBatch(db);
    const now = new Date().toISOString();
    const voucherId = doc(collection(db, 'transactions')).id; // Generate a unique ID for the voucher group

    voucherData.items.forEach((item: any) => {
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
            const transactionRef = doc(transactionsCollection);
            const newTransaction: Omit<Transaction, 'id'> = {
                date: voucherData.date.toISOString(),
                type: type,
                billingType: voucherData.billingType,
                vehicleId: vehicleId,
                partyId: ledgerId,
                amount: amount,
                remarks: narration || voucherData.remarks || '',
                invoiceType: 'Normal', // Default for payments/receipts
                items: [{ particular: `${voucherData.voucherNo}-${type}`, quantity: 1, rate: amount }],
                accountId: voucherData.accountId || null,
                chequeNumber: voucherData.chequeNo || null,
                chequeDate: voucherData.chequeDate ? voucherData.chequeDate.toISOString() : null,
                voucherId: voucherId,
                createdBy: createdBy,
                createdAt: now,
                lastModifiedAt: now,
                dueDate: null,
                invoiceDate: null,
                invoiceNumber: null,
                tripId: undefined,
                lastModifiedBy: undefined,
                purchaseNumber: undefined,
            };
            batch.set(transactionRef, newTransaction);
        }
    });

    await batch.commit();
};


export const onTransactionsUpdate = (callback: (transactions: Transaction[]) => void): () => void => {
    return onSnapshot(transactionsCollection, (snapshot) => {
        callback(snapshot.docs.map(fromFirestore));
    });
};

export const getTransaction = async (id: string): Promise<Transaction | null> => {
    const transactionDoc = doc(db, 'transactions', id);
    const docSnap = await getDoc(transactionDoc);
    if (docSnap.exists()) {
        return fromFirestore(docSnap);
    } else {
        return null;
    }
};

export const getVoucherTransactions = async (voucherId: string): Promise<Transaction[]> => {
    const q = query(transactionsCollection, where("voucherId", "==", voucherId));
    const querySnapshot = await getDocs(q);
    if (!querySnapshot.empty) {
        return querySnapshot.docs.map(fromFirestore);
    }
    
    // Fallback for legacy vouchers without a voucherId
    const legacyId = voucherId.replace('legacy-', '');
    const docSnap = await getDoc(doc(db, 'transactions', legacyId));
    if (docSnap.exists()) {
        return [fromFirestore(docSnap)];
    }

    return [];
};


export const updateTransaction = async (id: string, transaction: Partial<Omit<Transaction, 'id'>>): Promise<void> => {
    const transactionDoc = doc(db, 'transactions', id);
    await updateDoc(transactionDoc, {
        ...transaction,
        lastModifiedAt: new Date().toISOString(),
    });
};

export const updateVoucher = async (voucherId: string, voucherData: any, modifiedBy: string) => {
    const batch = writeBatch(db);
    const now = new Date().toISOString();

    // 1. Delete all existing transactions for this voucher
    const existingTxns = await getVoucherTransactions(voucherId);
    existingTxns.forEach(txn => {
        batch.delete(doc(db, 'transactions', txn.id));
    });

    // 2. Create new transactions based on the updated form data
    voucherData.items.forEach((item: any) => {
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
            const transactionRef = doc(transactionsCollection);
            const newTransaction: Omit<Transaction, 'id'|'createdAt'|'createdBy'> = {
                date: voucherData.date.toISOString(),
                type: type,
                billingType: voucherData.billingType,
                vehicleId: vehicleId,
                partyId: ledgerId,
                amount: amount,
                remarks: narration || voucherData.remarks || '',
                invoiceType: 'Normal',
                items: [{ particular: `${voucherData.voucherNo}-${type}`, quantity: 1, rate: amount }],
                accountId: voucherData.accountId || null,
                chequeNumber: voucherData.chequeNo || null,
                chequeDate: voucherData.chequeDate ? voucherData.chequeDate.toISOString() : null,
                voucherId: voucherId,
                lastModifiedBy: modifiedBy,
                lastModifiedAt: now,
                createdBy: existingTxns[0]?.createdBy || modifiedBy,
                createdAt: existingTxns[0]?.createdAt || now,
                dueDate: null,
                invoiceDate: null,
                invoiceNumber: null,
                tripId: undefined,
                purchaseNumber: undefined,
            };
            batch.set(transactionRef, newTransaction);
        }
    });

    await batch.commit();
};


export const deleteTransaction = async (id: string): Promise<void> => {
    const transactionDoc = doc(db, 'transactions', id);
    await deleteDoc(transactionDoc);
};

export const deleteVoucher = async (voucherId: string): Promise<void> => {
    const batch = writeBatch(db);

    if (voucherId.startsWith('legacy-')) {
        const docId = voucherId.replace('legacy-', '');
        const docRef = doc(db, 'transactions', docId);
        batch.delete(docRef);
    } else {
        const q = query(transactionsCollection, where("voucherId", "==", voucherId));
        const querySnapshot = await getDocs(q);
        querySnapshot.forEach((doc) => {
            batch.delete(doc.ref);
        });
    }
    
    await batch.commit();
};
