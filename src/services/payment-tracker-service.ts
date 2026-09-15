
'use client';
import { getFirebase } from '@/lib/firebase';
import { collection, onSnapshot, DocumentData, QueryDocumentSnapshot, doc, getDocs, query, where, orderBy, writeBatch } from 'firebase/firestore';
import type { PaymentTrackerEntry } from '@/lib/types';
import { COLLECTIONS } from '@/lib/constants';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

const getCollection = () => {
    const { db } = getFirebase();
    return collection(db, COLLECTIONS.PAYMENT_TRACKER);
};

const fromFirestore = (snapshot: QueryDocumentSnapshot<DocumentData>): PaymentTrackerEntry => {
    const data = snapshot.data();
    return {
        id: snapshot.id,
        voucherNo: data.voucherNo,
        date: data.date,
        type: data.type as 'Received' | 'Outflow',
        partyName: data.partyName || '',
        description: data.description || '',
        amount: Number(data.amount) || 0,
        createdBy: data.createdBy || 'System',
        createdAt: data.createdAt,
        lastModifiedBy: data.lastModifiedBy,
        lastModifiedAt: data.lastModifiedAt,
        ownership: data.ownership || 'Both',
    };
};

export const onPaymentEntriesUpdate = (callback: (entries: PaymentTrackerEntry[]) => void): () => void => {
    const q = query(getCollection(), orderBy('date', 'desc'));
    return onSnapshot(q, (snapshot) => {
        callback(snapshot.docs.map(fromFirestore));
    }, (error) => {
        if (error.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: COLLECTIONS.PAYMENT_TRACKER,
                operation: 'list',
            }));
        }
    });
};

export const savePaymentVoucher = async (data: {
    voucherNo: string;
    date: string;
    entries: Omit<PaymentTrackerEntry, 'id' | 'createdAt' | 'createdBy' | 'date' | 'voucherNo'>[];
    createdBy: string;
}): Promise<void> => {
    const { db } = getFirebase();
    const batch = writeBatch(db);
    const createdAt = new Date().toISOString();

    data.entries.forEach(entry => {
        const docRef = doc(getCollection());
        batch.set(docRef, {
            ...entry,
            voucherNo: data.voucherNo,
            date: data.date,
            createdBy: data.createdBy,
            createdAt
        });
    });

    await batch.commit().catch(async (err) => {
        if (err.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: COLLECTIONS.PAYMENT_TRACKER,
                operation: 'create',
                requestResourceData: data,
            }));
        }
        // Rethrow: the caller has already reserved a voucher number by this
        // point, so a swallowed failure would report success, leave nothing
        // saved, and burn that number out of the sequence for good.
        throw err;
    });
};

/**
 * Replaces an entire voucher atomically using a Firestore batch.
 * This ensures that if the user edits a daily ledger, the old lines are 
 * removed and new lines added in a single transaction.
 */
export const replacePaymentVoucher = async (oldVoucherNo: string, data: {
    voucherNo: string;
    date: string;
    entries: any[];
    createdBy: string;
}): Promise<void> => {
    const { db } = getFirebase();
    const batch = writeBatch(db);
    
    // 1. Find all old entries for this voucher number
    const q = query(getCollection(), where('voucherNo', '==', oldVoucherNo));
    const snap = await getDocs(q);
    
    // 2. Queue deletions for old records
    snap.docs.forEach(d => batch.delete(d.ref));
    
    // 3. Queue new entries
    const createdAt = new Date().toISOString();
    data.entries.forEach(entry => {
        const docRef = doc(getCollection());
        batch.set(docRef, {
            ...entry,
            voucherNo: data.voucherNo,
            date: data.date,
            createdBy: data.createdBy,
            createdAt
        });
    });

    await batch.commit().catch(async (err) => {
        if (err.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: 'payment_tracker_replace_batch',
                operation: 'write',
            }));
        }
        throw err;
    });
};



export const deletePaymentVoucher = async (voucherNo: string): Promise<void> => {
    const { db } = getFirebase();
    const q = query(getCollection(), where('voucherNo', '==', voucherNo));
    const snap = await getDocs(q);
    if (snap.empty) return;

    const batch = writeBatch(db);
    snap.docs.forEach(d => batch.delete(d.ref));
    
    await batch.commit().catch(async (err) => {
        if (err.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: 'payment_tracker_voucher_batch_delete',
                operation: 'write'
            }));
        }
        throw err;
    });
};
