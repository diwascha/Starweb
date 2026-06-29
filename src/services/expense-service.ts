/**
 * @fileOverview Expense service for recording truck-related costs.
 */

import { getFirebase } from '@/lib/firebase';
import { collection, addDoc, onSnapshot, DocumentData, QueryDocumentSnapshot, doc, deleteDoc, query, orderBy, getDocs, setDoc } from 'firebase/firestore';
import type { Expense } from '@/lib/expense-types';
import { COLLECTIONS } from '@/lib/constants';
import { addTransaction } from './transaction-service';
import type { Transaction, TransactionItem } from '@/lib/types';
import { createTimestamp, logServiceError } from '@/lib/service-utils';

const getExpensesCollection = () => {
    const { db } = getFirebase();
    return collection(db, COLLECTIONS.EXPENSES);
};

const fromFirestore = (snapshot: QueryDocumentSnapshot<DocumentData>): Expense => {
    const data = snapshot.data();
    return {
        id: snapshot.id,
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
 */
export const addExpense = async (expenseData: Omit<Expense, 'id' | 'createdAt'>): Promise<string> => {
    const { db } = getFirebase();
    const now = createTimestamp();
    
    // Pre-generate expense ID to use for transaction reference
    const expenseId = doc(getExpensesCollection()).id;

    const expenseRecord = {
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

    // 1. Save to Expenses Collection
    await setDoc(doc(getExpensesCollection(), expenseId), expenseRecord);

    // 2. Automatically sync to Main Transactions for accounting
    // Architecture: type: bucket, category: purpose, sourceRef: origin
    const totalAmount = expenseRecord.amount + expenseRecord.extraAmount;
    
    const items: TransactionItem[] = [
        { 
            particular: `${expenseRecord.expenseType}${expenseRecord.destination ? ` to ${expenseRecord.destination}` : ''}`, 
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
        type: 'Payment', // Daily expenses are outflows (Payments)
        amount: totalAmount,
        billingType: expenseRecord.paymentMode,
        invoiceType: 'Normal',
        category: expenseRecord.expenseType,
        partyId: expenseRecord.partyId,
        accountId: expenseRecord.accountId,
        remarks: `Expense Entry: ${expenseRecord.expenseType}${expenseRecord.destination ? ` (${expenseRecord.destination})` : ''}`,
        referenceType: "Expense Entry",
        referenceId: expenseId,
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
 * Deletes an expense record.
 */
export const deleteExpense = async (id: string): Promise<void> => {
    try {
        const docRef = doc(getExpensesCollection(), id);
        await deleteDoc(docRef);
    } catch (error) {
        logServiceError('deleteExpense', error);
        throw error;
    }
};
