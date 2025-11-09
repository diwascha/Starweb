
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

export const getTransactionsForParty = async (partyId: string): Promise<Transaction[]> => {
    if (!partyId) return [];
    const q = query(transactionsCollection, where("partyId", "==", partyId));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(fromFirestore);
};


export const addTransaction = async (transaction: Omit<Transaction, 'id' | 'createdAt' | 'lastModifiedAt'>): Promise<string> => {
    const docRef = await addDoc(transactionsCollection, {
        ...transaction,
        createdAt: new Date().toISOString(),
    });
    return docRef.id;
};

export const updateTransaction = async (id: string, transaction: Partial<Omit<Transaction, 'id'>>): Promise<void> => {
    const transactionDoc = doc(db, 'transactions', id);
    await updateDoc(transactionDoc, {
        ...transaction,
        lastModifiedAt: new Date().toISOString(),
    });
};


export const saveVoucher = async (voucherData: any, createdBy: string) => {
    let batch = writeBatch(db);
    let writeCount = 0;
    const BATCH_LIMIT = 499;
    const now = new Date().toISOString();
    const voucherId = doc(collection(db, 'transactions')).id; // Generate a unique ID for the voucher group

    for (const item of voucherData.items) {
        if (writeCount >= BATCH_LIMIT) {
            await batch.commit();
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
            const transactionRef = doc(transactionsCollection);
            const newTransaction: Omit<Transaction, 'id'> = {
                date: voucherData.date.toISOString(),
                type: type,
                billingType: voucherData.billingType,
                vehicleId: vehicleId,
                partyId: ledgerId,
                amount: amount,
                remarks: narration || voucherData.remarks || null,
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
                tripId: null,
                lastModifiedBy: null,
                purchaseNumber: null,
            };
            batch.set(transactionRef, newTransaction);
            writeCount++;
        }
    }
    
    if (writeCount > 0) {
        await batch.commit();
    }
};


export const onTransactionsUpdate = (callback: (transactions: Transaction[]) => void): () => void => {
    return onSnapshot(transactionsCollection, (snapshot) => {
        callback(snapshot.docs.map(fromFirestore));
    });
};

export const getTransaction = async (id: string): Promise<Transaction | null> => {
    if (!id || typeof id !== 'string') return null;
    const transactionDoc = doc(db, 'transactions', id);
    const docSnap = await getDoc(transactionDoc);
    if (docSnap.exists()) {
        return fromFirestore(docSnap);
    } else {
        return null;
    }
};

export const getTransactions = async (): Promise<Transaction[]> => {
    const snapshot = await getDocs(transactionsCollection);
    return snapshot.docs.map(fromFirestore);
};


export const getVoucherTransactions = async (voucherId: string): Promise<Transaction[]> => {
    if (!voucherId || typeof voucherId !== 'string') return [];
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


export const onVoucherTransactionsUpdate = (voucherId: string, callback: (transactions: Transaction[]) => void): () => void => {
    const q = query(transactionsCollection, where("voucherId", "==", voucherId));
    return onSnapshot(q, (snapshot) => {
        callback(snapshot.docs.map(fromFirestore));
    });
};


export const updateVoucher = async (voucherId: string, voucherData: any, modifiedBy: string) => {
    let batch = writeBatch(db);
    let writeCount = 0;
    const BATCH_LIMIT = 499;
    const now = new Date().toISOString();

    // 1. Delete all existing transactions for this voucher
    const existingTxns = await getVoucherTransactions(voucherId);
    for (const txn of existingTxns) {
        if (writeCount >= BATCH_LIMIT) {
            await batch.commit();
            batch = writeBatch(db);
            writeCount = 0;
        }
        batch.delete(doc(db, 'transactions', txn.id));
        writeCount++;
    }
    if (writeCount > 0) {
        await batch.commit();
        batch = writeBatch(db);
        writeCount = 0;
    }


    // 2. Create new transactions based on the updated form data
    for (const item of voucherData.items) {
        if (writeCount >= BATCH_LIMIT) {
            await batch.commit();
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
                tripId: null,
                purchaseNumber: null,
            };
            batch.set(transactionRef, newTransaction);
            writeCount++;
        }
    }

    if (writeCount > 0) {
        await batch.commit();
    }
};


export const deleteTransaction = async (id: string): Promise<void> => {
    if (!id) return;
    const transactionDoc = doc(db, 'transactions', id);
    await deleteDoc(transactionDoc);
};

export const deleteVoucher = async (voucherId: string): Promise<void> => {
    const BATCH_LIMIT = 499;
    
    if (voucherId.startsWith('legacy-')) {
        const docId = voucherId.replace('legacy-', '');
        const docRef = doc(db, 'transactions', docId);
        await deleteDoc(docRef);
    } else {
        const q = query(transactionsCollection, where("voucherId", "==", voucherId));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) return;

        let batch = writeBatch(db);
        let writeCount = 0;

        for (const doc of querySnapshot.docs) {
            batch.delete(doc.ref);
            writeCount++;
            if (writeCount >= BATCH_LIMIT) {
                await batch.commit();
                batch = writeBatch(db);
                writeCount = 0;
            }
        }
        
        if (writeCount > 0) {
            await batch.commit();
        }
    }
};
