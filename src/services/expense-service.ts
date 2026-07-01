/**
 * @fileOverview Expense service for recording truck-related costs.
 */

import { getFirebase } from '@/lib/firebase';
import { collection, addDoc, onSnapshot, DocumentData, QueryDocumentSnapshot, doc, deleteDoc, query, orderBy, getDocs, setDoc, getDoc, updateDoc, where, writeBatch } from 'firebase/firestore';
import type { Expense } from '@/lib/expense-types';
import { COLLECTIONS } from '@/lib/constants';
import { addTransaction } from './transaction-service';
import type { Transaction, TransactionItem } from '@/lib/types';
import { createTimestamp, logServiceError } from '@/lib/service-utils';

const getExpensesCollection = () => {
    const { db } = getFirebase();
    return collection(db, COLLECTIONS.EXPENSES);
};

const getTransactionsCollection = () => {
    const { db } = getFirebase();
    return collection(db, COLLECTIONS.TRANSACTIONS);
};

const fromFirestore = (snapshot: QueryDocumentSnapshot<DocumentData>): Expense => {
    const data = snapshot.data();
    return {
        id: snapshot.id,
        voucherNo: data.voucherNo || 'EXP-LEGACY',
        date: data.date,
        vehicleId: data.vehicleId,
        expenseType: data.expenseType,
        partyId: data.partyId || undefined,
        accountId: data.accountId || undefined,
        itemId: data.itemId || undefined,
        destination: data.destination || undefined,
        amount: data.amount,
        extraAmount: data.extraAmount || undefined,
        extraRemarks: data.extraRemarks || undefined,
        paymentMode: data.paymentMode,
        remarks: data.remarks || undefined,
        createdBy: data.createdBy,
        createdAt: data.createdAt,
    };
};

/**
 * Fetches all expenses (standard getter).
 */
export const getExpenses = async (): Promise<Expense[]> => {
    try {
        const q = query(getExpensesCollection(), orderBy('createdAt', 'desc'));
        const snapshot = await getDocs(q);
        return snapshot.docs.map(fromFirestore);
    } catch (error) {
        logServiceError('getExpenses', error);
        return [];
    }
};

/**
 * Fetches a single expense by ID.
 */
export const getExpense = async (id: string): Promise<Expense | null> => {
    try {
        const docRef = doc(getExpensesCollection(), id);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            return fromFirestore(docSnap as QueryDocumentSnapshot<DocumentData>);
        }
        return null;
    } catch (error) {
        logServiceError('getExpense', error);
        return null;
    }
};

/**
 * Listens for real-time updates to the expenses collection.
 */
export const onExpensesUpdate = (callback: (expenses: Expense[]) => void): () => void => {
    const q = query(getExpensesCollection(), orderBy('createdAt', 'desc'));
    return onSnapshot(q, 
        (snapshot) => {
            callback(snapshot.docs.map(fromFirestore));
        },
        (error) => {
            logServiceError('onExpensesUpdate', error);
        }
    );
};

/**
 * Adds a new expense record and automatically syncs it to the general accounting ledger.
 * ARCHITECTURE: All entries from this form are categorized as "Payment" (Outflow).
 */
export const addExpense = async (expenseData: Omit<Expense, 'id' | 'createdAt'>): Promise<string> => {
    const { db } = getFirebase();
    const now = createTimestamp();
    
    const expenseId = doc(getExpensesCollection()).id;

    const expenseRecord = {
        voucherNo: expenseData.voucherNo,
        date: expenseData.date,
        vehicleId: expenseData.vehicleId,
        expenseType: expenseData.expenseType,
        amount: Number(expenseData.amount) || 0,
        extraAmount: Number(expenseData.extraAmount) || 0,
        extraRemarks: expenseData.extraRemarks || null,
        paymentMode: expenseData.paymentMode,
        partyId: expenseData.partyId || null,
        accountId: expenseData.accountId || null,
        destination: expenseData.destination || null,
        remarks: expenseData.remarks || null,
        createdBy: expenseData.createdBy,
        createdAt: now,
    };

    await setDoc(doc(getExpensesCollection(), expenseId), expenseRecord);

    const totalAmount = expenseRecord.amount + expenseRecord.extraAmount;
    
    const items: TransactionItem[] = [
        { 
            particular: `${expenseRecord.voucherNo}: ${expenseRecord.expenseType}${expenseRecord.destination ? ` to ${expenseRecord.destination}` : ''}`, 
            quantity: 1, 
            rate: expenseRecord.amount 
        }
    ];

    if (expenseRecord.extraAmount > 0) {
        items.push({
            particular: expenseRecord.extraRemarks || 'Extra Trip Charge',
            quantity: 1,
            rate: expenseRecord.extraAmount
        });
    }

    const txnData: Omit<Transaction, 'id' | 'createdAt' | 'lastModifiedAt'> = {
        date: expenseRecord.date,
        vehicleId: expenseRecord.vehicleId,
        type: 'Payment',
        amount: totalAmount,
        billingType: expenseRecord.paymentMode,
        invoiceType: 'Normal',
        category: expenseRecord.expenseType,
        partyId: expenseRecord.partyId,
        accountId: expenseRecord.accountId,
        remarks: `Expense Entry: ${expenseRecord.expenseType}${expenseRecord.destination ? ` (${expenseRecord.destination})` : ''}`,
        referenceType: "Expense Entry",
        referenceId: expenseRecord.voucherNo,
        items: items,
        createdBy: expenseRecord.createdBy,
        invoiceNumber: null,
        invoiceDate: null,
        chequeNumber: null,
        chequeDate: null,
        dueDate: null,
        tripId: null,
        voucherId: null,
    };

    try {
        await addTransaction(txnData);
    } catch (error) {
        logServiceError('addExpense-transactionSync', error);
    }

    return expenseId;
};

/**
 * Updates an expense record and its linked transaction.
 */
export const updateExpense = async (id: string, updates: Partial<Expense>, modifiedBy: string): Promise<void> => {
    const { db } = getFirebase();
    const now = createTimestamp();
    const expenseRef = doc(getExpensesCollection(), id);

    try {
        const expenseSnap = await getDoc(expenseRef);
        if (!expenseSnap.exists()) throw new Error("Expense not found");
        
        const oldData = expenseSnap.data() as Expense;
        const newData = { ...oldData, ...updates };

        const batch = writeBatch(db);

        // 1. Update Expense Document
        batch.update(expenseRef, {
            ...updates,
            lastModifiedBy: modifiedBy,
            lastModifiedAt: now,
        });

        // 2. Update Linked Transaction
        const q = query(
            getTransactionsCollection(), 
            where("referenceType", "==", "Expense Entry"),
            where("referenceId", "==", oldData.voucherNo)
        );
        const txnSnap = await getDocs(q);

        if (!txnSnap.empty) {
            const txnDoc = txnSnap.docs[0];
            const totalAmount = (Number(newData.amount) || 0) + (Number(newData.extraAmount) || 0);
            
            const items: TransactionItem[] = [
                { 
                    particular: `${newData.voucherNo}: ${newData.expenseType}${newData.destination ? ` to ${newData.destination}` : ''}`, 
                    quantity: 1, 
                    rate: Number(newData.amount) || 0 
                }
            ];

            if ((Number(newData.extraAmount) || 0) > 0) {
                items.push({
                    particular: newData.extraRemarks || 'Extra Trip Charge',
                    quantity: 1,
                    rate: Number(newData.extraAmount) || 0
                });
            }

            batch.update(txnDoc.ref, {
                date: newData.date,
                vehicleId: newData.vehicleId,
                amount: totalAmount,
                billingType: newData.paymentMode,
                category: newData.expenseType,
                partyId: newData.partyId || null,
                accountId: newData.accountId || null,
                remarks: `Expense Entry: ${newData.expenseType}${newData.destination ? ` (${newData.destination})` : ''}`,
                items: items,
                referenceId: newData.voucherNo,
                lastModifiedBy: modifiedBy,
                lastModifiedAt: now,
            });
        }

        await batch.commit();
    } catch (error) {
        logServiceError('updateExpense', error);
        throw error;
    }
};

/**
 * Deletes an expense record and its linked transaction.
 */
export const deleteExpense = async (id: string): Promise<void> => {
    const { db } = getFirebase();
    try {
        const expenseSnap = await getDoc(doc(getExpensesCollection(), id));
        if (!expenseSnap.exists()) return;

        const data = expenseSnap.data();
        const batch = writeBatch(db);

        // 1. Delete Expense
        batch.delete(expenseSnap.ref);

        // 2. Delete linked transaction
        const q = query(
            getTransactionsCollection(), 
            where("referenceType", "==", "Expense Entry"),
            where("referenceId", "==", data.voucherNo)
        );
        const txnSnap = await getDocs(q);
        txnSnap.forEach(d => batch.delete(d.ref));

        await batch.commit();
    } catch (error) {
        logServiceError('deleteExpense', error);
        throw error;
    }
};
