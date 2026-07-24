'use client';
/**
 * @fileOverview Expense service for recording truck-related costs.
 * Optimized for deterministic ledger tracking and non-blocking offline writes.
 */

import { getFirebase } from '@/lib/firebase';
import { 
    collection, 
    onSnapshot, 
    DocumentData, 
    QueryDocumentSnapshot, 
    doc, 
    query, 
    orderBy, 
    getDocs, 
    getDoc, 
    writeBatch, 
    setDoc,
    deleteDoc
} from 'firebase/firestore';
import type { Expense } from '@/lib/expense-types';
import { COLLECTIONS } from '@/lib/constants';
import type { Transaction, TransactionItem } from '@/lib/types';
import { createTimestamp } from '@/lib/service-utils';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

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
        partyId: data.partyId ?? null,
        accountId: data.accountId ?? null,
        itemId: data.itemId ?? null,
        destination: data.destination ?? null,
        amount: data.amount,
        extraAmount: data.extraAmount ?? 0,
        extraRemarks: data.extraRemarks ?? null,
        paymentMode: data.paymentMode || 'Cash',
        cashAmount: data.cashAmount ?? 0,
        bankAmount: data.bankAmount ?? 0,
        remarks: data.remarks ?? null,
        createdBy: data.createdBy,
        createdAt: data.createdAt,
        ownership: data.ownership || 'Sijan',
    };
};

export const onExpensesUpdate = (callback: (expenses: Expense[]) => void): () => void => {
    const q = query(getExpensesCollection(), orderBy('createdAt', 'desc'));
    return onSnapshot(q, 
        (snapshot) => {
            callback(snapshot.docs.map(fromFirestore));
        },
        async (error) => {
            if (error.code === 'permission-denied') {
                errorEmitter.emit('permission-error', new FirestorePermissionError({ path: COLLECTIONS.EXPENSES, operation: 'list' }));
            }
        }
    );
};

const generateLedgerTransactions = (expense: Expense, createdAt: string): Transaction[] => {
    const transactions: Transaction[] = [];
    const baseNarrative = `${expense.voucherNo}: ${expense.expenseType}${expense.destination ? ` to ${expense.destination}` : ''}`;
    const now = createTimestamp();
    
    const safeVoucherId = expense.voucherNo.replace(/\//g, '-');

    const createTxn = (mode: string, amt: number, suffix: string): Transaction => {
        const items: TransactionItem[] = [{ particular: `${baseNarrative} (${suffix})`, quantity: 1, rate: amt }];
        
        return {
            id: `ledger-${safeVoucherId}-${mode.toLowerCase().replace(/ /g, '-')}`, 
            date: expense.date,
            vehicleId: expense.vehicleId || null,
            type: 'Payment',
            amount: amt,
            billingType: mode,
            invoiceType: 'Normal' as const,
            category: expense.expenseType,
            partyId: expense.partyId || null,
            accountId: mode === 'Cash' ? null : expense.accountId || null,
            remarks: expense.remarks || `Expense: ${expense.expenseType}`,
            referenceType: "Expense Entry",
            referenceId: expense.voucherNo,
            expenseId: expense.id,
            items: items,
            purchaseNumber: null,
            dueDate: null,
            invoiceNumber: null,
            invoiceDate: null,
            createdBy: expense.createdBy,
            createdAt: createdAt,
            lastModifiedAt: now,
            chequeNumber: null,
            chequeDate: null,
            tripId: null,
            voucherId: expense.voucherNo,
            lastModifiedBy: null,
            ownership: expense.ownership || 'Sijan'
        };
    };

    if (expense.paymentMode === 'Mixed') {
        if ((expense.cashAmount || 0) > 0) transactions.push(createTxn('Cash', expense.cashAmount!, 'Cash Portion'));
        if ((expense.bankAmount || 0) > 0) transactions.push(createTxn('Bank', expense.bankAmount!, 'Bank Portion'));
    } else {
        const totalAmount = expense.amount + (expense.extraAmount || 0);
        transactions.push(createTxn(expense.paymentMode, totalAmount, expense.paymentMode));
    }

    return transactions;
};

export const addExpense = async (expenseData: Omit<Expense, 'id' | 'createdAt'>): Promise<string> => {
    const { db } = getFirebase();
    const now = createTimestamp();
    const expenseId = doc(getExpensesCollection()).id;

    const expenseRecord: Expense = {
        id: expenseId,
        ...expenseData,
        amount: Number(expenseData.amount) || 0,
        extraAmount: Number(expenseData.extraAmount) || 0,
        cashAmount: Number(expenseData.cashAmount) || 0,
        bankAmount: Number(expenseData.bankAmount) || 0,
        createdAt: now,
    };

    const batch = writeBatch(db);
    batch.set(doc(getExpensesCollection(), expenseId), expenseRecord);

    const ledgerTxns = generateLedgerTransactions(expenseRecord, now);
    ledgerTxns.forEach(txn => {
        const { id, ...data } = txn;
        batch.set(doc(getTransactionsCollection(), id), data);
    });

    batch.commit().catch(err => {
        if (err.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: `expenses/${expenseId}`,
                operation: 'write',
                requestResourceData: expenseRecord,
            }));
        }
    });

    return expenseId;
};

export const updateExpense = async (id: string, updates: Partial<Expense>, modifiedBy: string): Promise<void> => {
    const { db } = getFirebase();
    const expenseRef = doc(getExpensesCollection(), id);
    const snap = await getDoc(expenseRef);
    if (!snap.exists()) return;
    
    const oldData = snap.data() as Expense;
    const newData = { ...oldData, ...updates };
    const now = createTimestamp();

    const batch = writeBatch(db);
    batch.update(expenseRef, { ...updates, lastModifiedBy: modifiedBy, lastModifiedAt: now });

    // Purge all possible ledger variations for this voucher
    const safeOldVoucherId = oldData.voucherNo.replace(/\//g, '-');
    ['cash', 'bank', 'mixed'].forEach(mode => {
        batch.delete(doc(getTransactionsCollection(), `ledger-${safeOldVoucherId}-${mode}`));
    });

    const ledgerTxns = generateLedgerTransactions(newData, oldData.createdAt);
    ledgerTxns.forEach(txn => {
        const { id: txnId, ...data } = txn;
        batch.set(doc(getTransactionsCollection(), txnId), { ...data, lastModifiedBy: modifiedBy });
    });

    batch.commit().catch(err => {
        if (err.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError({ path: expenseRef.path, operation: 'update' }));
        }
    });
};

export const deleteExpense = async (id: string): Promise<void> => {
    const { db } = getFirebase();
    const expenseRef = doc(getExpensesCollection(), id);
    const snap = await getDoc(expenseRef);
    if (!snap.exists()) return;

    const data = snap.data();
    const batch = writeBatch(db);
    batch.delete(expenseRef);

    const safeVoucherId = data.voucherNo.replace(/\//g, '-');
    ['cash', 'bank', 'mixed'].forEach(mode => {
        batch.delete(doc(getTransactionsCollection(), `ledger-${safeVoucherId}-${mode}`));
    });

    batch.commit().catch(err => {
        if (err.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError({ path: expenseRef.path, operation: 'delete' }));
        }
    });
};

export const getExpense = async (id: string): Promise<Expense | null> => {
    const docRef = doc(getExpensesCollection(), id);
    try {
        const snap = await getDoc(docRef);
        return snap.exists() ? fromFirestore(snap as QueryDocumentSnapshot<DocumentData>) : null;
    } catch {
        return null;
    }
};
