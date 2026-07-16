import { getFirebase } from '@/lib/firebase';
import { doc, writeBatch, query, where, getDocs } from 'firebase/firestore';
import { COLLECTIONS } from '@/lib/constants';
import { createTimestamp } from '@/lib/service-utils';
import { transactionsCollection, fromFirestore } from './data';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

export const getVoucherTransactions = async (voucherId: string) => {
    const q = query(transactionsCollection(), where("voucherId", "==", voucherId));
    try {
        const snap = await getDocs(q);
        return snap.docs.map(fromFirestore);
    } catch (error) {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: COLLECTIONS.TRANSACTIONS,
            operation: 'list',
        }));
        throw error;
    }
};

export const saveVoucher = async (data: any, createdBy: string) => {
    const { db } = getFirebase();
    const batch = writeBatch(db);
    const voucherId = doc(transactionsCollection()).id;
    const now = createTimestamp();
    
    data.items.forEach((item: any) => {
        const ref = doc(transactionsCollection());
        batch.set(ref, { 
            voucherId, 
            date: data.date.toISOString(), 
            createdBy, 
            createdAt: now, 
            ...item 
        });
    });

    batch.commit().catch(async (err) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: COLLECTIONS.TRANSACTIONS,
            operation: 'write',
            requestResourceData: data,
        }));
    });
};

export const deleteVoucher = async (voucherId: string) => {
    const { db } = getFirebase();
    const q = query(transactionsCollection(), where("voucherId", "==", voucherId));
    
    getDocs(q).then(async (txnsSnap) => {
        if (txnsSnap.empty) return;
        const batch = writeBatch(db);
        txnsSnap.docs.forEach(t => batch.delete(t.ref));
        await batch.commit();
    }).catch(async (err) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: COLLECTIONS.TRANSACTIONS,
            operation: 'write',
        }));
    });
};

export const updateVoucher = async (voucherId: string, data: any, modifiedBy: string) => {
    const { db } = getFirebase();
    const q = query(transactionsCollection(), where("voucherId", "==", voucherId));
    
    getDocs(q).then(async (txnsSnap) => {
        const batch = writeBatch(db);
        const now = createTimestamp();

        // Delete existing items in the voucher
        txnsSnap.docs.forEach(t => batch.delete(t.ref));

        // Re-add modified items
        data.items.forEach((item: any) => {
            const ref = doc(transactionsCollection());
            batch.set(ref, { 
                voucherId, 
                date: data.date.toISOString(), 
                createdBy: data.createdBy || modifiedBy,
                createdAt: data.createdAt || now,
                lastModifiedBy: modifiedBy,
                lastModifiedAt: now,
                ...item 
            });
        });

        await batch.commit();
    }).catch(async (err) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: COLLECTIONS.TRANSACTIONS,
            operation: 'write',
        }));
    });
};