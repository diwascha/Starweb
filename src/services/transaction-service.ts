

import { db } from '@/lib/firebase';
import { collection, addDoc, doc, updateDoc, deleteDoc, onSnapshot, DocumentData, QueryDocumentSnapshot, getDocs, writeBatch } from 'firebase/firestore';
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

export const saveVoucher = async (voucherData: any, createdBy: string) => {
    const batch = writeBatch(db);
    const now = new Date().toISOString();

    voucherData.items.forEach((item: any) => {
        const { ledgerId, vehicleId, recAmount, payAmount, narration } = item;
        
        let amount = 0;
        let type: 'Payment' | 'Receipt' | null = null;
        
        if (voucherData.voucherType === 'Payment' && payAmount > 0) {
            amount = payAmount;
            type = 'Payment';
        } else if (voucherData.voucherType === 'Receipt' && recAmount > 0) {
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
                items: [{ particular: type, quantity: 1, rate: amount }],
                accountId: voucherData.accountId || null,
                chequeNumber: voucherData.chequeNo || null,
                chequeDate: voucherData.chequeDate ? voucherData.chequeDate.toISOString() : null,
                createdBy: createdBy,
                createdAt: now,
                lastModifiedAt: now
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

    