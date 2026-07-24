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
        // A single row can theoretically have both receipt and payment, though usually it's one.
        // We create separate ledger entries for each to ensure correct filtering.
        const types: ('Receipt' | 'Payment')[] = [];
        if (Number(item.recAmount) > 0) types.push('Receipt');
        if (Number(item.payAmount) > 0) types.push('Payment');

        types.forEach(type => {
            const ref = doc(transactionsCollection());
            const amount = type === 'Receipt' ? Number(item.recAmount) : Number(item.payAmount);
            
            batch.set(ref, { 
                voucherId, 
                date: data.date.toISOString(), 
                createdBy, 
                createdAt: now,
                type,
                amount,
                billingType: data.billingType,
                accountId: data.billingType === 'Bank' ? data.accountId : null,
                vehicleId: item.vehicleId || null,
                partyId: item.ledgerId || null,
                remarks: item.narration || data.remarks || null,
                referenceType: "Payment/Receipt Voucher",
                referenceId: data.voucherNo,
                chequeNumber: data.chequeNo || null,
                chequeDate: data.chequeDate?.toISOString() || null,
                ownership: 'Sijan' // Fleet vouchers are Sijan scope
            });
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

        // Delete existing items in the voucher to handle potential row splits/merges
        txnsSnap.docs.forEach(t => batch.delete(t.ref));

        // Re-add modified items with correct metadata
        data.items.forEach((item: any) => {
            const types: ('Receipt' | 'Payment')[] = [];
            if (Number(item.recAmount) > 0) types.push('Receipt');
            if (Number(item.payAmount) > 0) types.push('Payment');

            types.forEach(type => {
                const ref = doc(transactionsCollection());
                const amount = type === 'Receipt' ? Number(item.recAmount) : Number(item.payAmount);
                
                batch.set(ref, { 
                    voucherId, 
                    date: data.date.toISOString(), 
                    createdBy: data.createdBy || modifiedBy,
                    createdAt: data.createdAt || now,
                    lastModifiedBy: modifiedBy,
                    lastModifiedAt: now,
                    type,
                    amount,
                    billingType: data.billingType,
                    accountId: data.billingType === 'Bank' ? data.accountId : null,
                    vehicleId: item.vehicleId || null,
                    partyId: item.ledgerId || null,
                    remarks: item.narration || data.remarks || null,
                    referenceType: "Payment/Receipt Voucher",
                    referenceId: data.voucherNo,
                    chequeNumber: data.chequeNo || null,
                    chequeDate: data.chequeDate?.toISOString() || null,
                    ownership: 'Sijan'
                });
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