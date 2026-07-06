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
        cashAmount: data.cashAmount || undefined,
        bankAmount: data.bankAmount || undefined,
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
 * Generates transaction data for the ledger based on an expense.
 * Handles split payments by returning multiple transactions.
 */
const generateLedgerTransactions = (expense: Omit<Expense, 'id' | 'createdAt'>, now: string): Omit<Transaction, 'id' | 'createdAt' | 'lastModifiedAt'>[] => {
    const transactions: Omit<Transaction, 'id' | 'createdAt' | 'lastModifiedAt'>[] = [];
    const baseNarrative = `${expense.voucherNo}: ${expense.expenseType}${expense.destination ? ` to ${expense.destination}` : ''}`;

    const createTxn = (mode: 'Cash' | 'Bank', amt: number, specificNarration: string) => {
        const items: TransactionItem[] = [{ particular: specificNarration, quantity: 1, rate: amt }];
        
        return {
            date: expense.date,
            vehicleId: expense.vehicleId || null,
            type: 'Payment' as const,
            amount: amt,
            billingType: mode,
            invoiceType: 'Normal' as const,
            category: expense.expenseType,
            partyId: expense.partyId || null,
            accountId: expense.accountId || null,
            remarks: `Expense Entry: ${expense.expenseType}${expense.destination ? ` (${expense.destination})` : ''}`,
            referenceType: "Expense Entry",
            referenceId: expense.voucherNo,
            items: items,
            purchaseNumber: null,
            isSystemTransaction: true,
            createdBy: expense.createdBy,
            invoiceNumber: null,
            invoiceDate: null,
            chequeNumber: null,
            chequeDate: null,
            dueDate: null,
            tripId: null,
            voucherId: expense.voucherNo,
            lastModifiedBy: null
        };
    };

    if (expense.paymentMode === 'Mixed') {
        if ((expense.cashAmount || 0) > 0) {
            transactions.push(createTxn('Cash', expense.cashAmount!, `${baseNarrative} (Cash Portion)`));
        }
        if ((expense.bankAmount || 0) > 0) {
            transactions.push(createTxn('Bank', expense.bankAmount!, `${baseNarrative} (Bank Portion)`));
        }
    } else {
        const totalAmount = expense.amount + (expense.extraAmount || 0);
        transactions.push(createTxn(expense.paymentMode, totalAmount, baseNarrative));
    }

    return transactions;
};

/**
 * Adds a new expense record and automatically syncs it to the general accounting ledger.
 */
export const addExpense = async (expenseData: Omit<Expense, 'id' | 'createdAt'>): Promise<string> => {
    const { db } = getFirebase();
    const now = createTimestamp();
    
    const expenseId = doc(getExpensesCollection()).id;

    const expenseRecord = {
        ...expenseData,
        voucherNo: expenseData.voucherNo,
        date: expenseData.date,
        vehicleId: expenseData.vehicleId,
        expenseType: expenseData.expenseType,
        amount: Number(expenseData.amount) || 0,
        extraAmount: Number(expenseData.extraAmount) || 0,
        extraRemarks: expenseData.extraRemarks || null,
        paymentMode: expenseData.paymentMode,
        cashAmount: Number(expenseData.cashAmount) || 0,
        bankAmount: Number(expenseData.bankAmount) || 0,
        partyId: expenseData.partyId || null,
        accountId: expenseData.accountId || null,
        destination: expenseData.destination || null,
        remarks: expenseData.remarks || null,
        createdBy: expenseData.createdBy,
        createdAt: now,
    };

    const batch = writeBatch(db);
    batch.set(doc(getExpensesCollection(), expenseId), expenseRecord);

    const ledgerTxns = generateLedgerTransactions(expenseRecord, now);
    ledgerTxns.forEach(txn => {
        const txnRef = doc(getTransactionsCollection());
        batch.set(txnRef, { ...txn, createdAt: now, lastModifiedAt: now });
    });

    await batch.commit();
    return expenseId;
};

/**
 * Updates an expense record and its linked transaction(s).
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

        // 2. Refresh Ledger Entries
        // Delete all old linked txns for this voucher
        const q = query(
            getTransactionsCollection(), 
            where("referenceType", "==", "Expense Entry"),
            where("referenceId", "==", oldData.voucherNo)
        );
        const txnSnap = await getDocs(q);
        txnSnap.forEach(d => batch.delete(d.ref));

        // Create new ones based on current data
        const ledgerTxns = generateLedgerTransactions(newData, now);
        ledgerTxns.forEach(txn => {
            const txnRef = doc(getTransactionsCollection());
            batch.set(txnRef, { 
                ...txn, 
                createdAt: oldData.createdAt, 
                lastModifiedAt: now,
                lastModifiedBy: modifiedBy
            });
        });

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

        // 2. Delete linked transaction(s)
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
