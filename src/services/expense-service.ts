
import { getFirebase } from '@/lib/firebase';
import { collection, addDoc, onSnapshot, DocumentData, QueryDocumentSnapshot, doc, updateDoc, deleteDoc, getDocs, query, orderBy, writeBatch } from 'firebase/firestore';
import type { Expense } from '@/lib/expense-types';
import { COLLECTIONS } from '@/lib/constants';
import { addTransaction } from './transaction-service';
import type { Transaction } from '@/lib/types';

const getExpensesCollection = () => {
    const { db } = getFirebase();
    return collection(db, 'expenses');
};

const fromFirestore = (snapshot: QueryDocumentSnapshot<DocumentData>): Expense => {
    const data = snapshot.data();
    return {
        id: snapshot.id,
        date: data.date,
        vehicleId: data.vehicleId,
        expenseType: data.expenseType,
        partyId: data.partyId,
        accountId: data.accountId,
        itemId: data.itemId,
        amount: data.amount,
        paymentMode: data.paymentMode,
        remarks: data.remarks,
        createdBy: data.createdBy,
        createdAt: data.createdAt,
    };
};

export const onExpensesUpdate = (callback: (expenses: Expense[]) => void): () => void => {
    const q = query(getExpensesCollection(), orderBy('createdAt', 'desc'));
    return onSnapshot(q, (snapshot) => {
        callback(snapshot.docs.map(fromFirestore));
    });
};

export const addExpense = async (expense: Omit<Expense, 'id' | 'createdAt'>): Promise<string> => {
    const { db } = getFirebase();
    const now = new Date().toISOString();
    
    // 1. Save to Expenses Collection
    const docRef = await addDoc(getExpensesCollection(), {
        ...expense,
        createdAt: now,
    });

    // 2. Automatically sync to Main Transactions for accounting
    const transactionType = expense.paymentMode === 'Cash' ? 'Payment' : 'Payment';
    const txnData: Omit<Transaction, 'id' | 'createdAt' | 'lastModifiedAt'> = {
        date: expense.date,
        vehicleId: expense.vehicleId,
        type: 'Purchase', // Expenses are recorded as vehicle-specific purchases
        amount: expense.amount,
        billingType: expense.paymentMode,
        invoiceType: 'Normal',
        category: expense.expenseType,
        partyId: expense.partyId || null,
        accountId: expense.accountId || null,
        remarks: `Auto-synced from Expense Entry: ${expense.remarks || ''}`,
        items: [{ particular: `${expense.expenseType} Fee`, quantity: 1, rate: expense.amount }],
        createdBy: expense.createdBy,
    };

    await addTransaction(txnData);

    return docRef.id;
};

export const deleteExpense = async (id: string): Promise<void> => {
    const docRef = doc(getExpensesCollection(), id);
    await deleteDoc(docRef);
};
