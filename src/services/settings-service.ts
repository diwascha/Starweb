
'use client';
import { getFirebase } from '@/lib/firebase';
import { collection, doc, getDoc, setDoc, onSnapshot, query, where, getDocs, writeBatch, orderBy } from 'firebase/firestore';
import type { AppSetting, CostSetting, DocumentType, NumberingRule, DocumentPrefixes } from '@/lib/types';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { COLLECTIONS } from '@/lib/constants';

const getSettingsCollection = () => {
    const { db } = getFirebase();
    return collection(db, COLLECTIONS.SETTINGS);
};

export const getSetting = async (id: string): Promise<AppSetting | null> => {
    if (!id || typeof id !== 'string') return null;
    const docRef = doc(getSettingsCollection(), id);
    try {
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            const data = docSnap.data();
            return { id: docSnap.id, value: data.value };
        }
    } catch (error: any) {
        if (error.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError({ path: docRef.path, operation: 'get' }));
        }
    }
    return null;
};

export const onSettingUpdate = (id: string, callback: (setting: AppSetting | null) => void): () => void => {
    if (!id || typeof id !== 'string') {
        callback(null);
        return () => {}; 
    }
    const docRef = doc(getSettingsCollection(), id);
    return onSnapshot(docRef, 
        (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                callback({ id: docSnap.id, value: data.value });
            } else {
                callback(null);
            }
        },
        async (error) => {
            if (error.code === 'permission-denied') {
                errorEmitter.emit('permission-error', new FirestorePermissionError({ path: docRef.path, operation: 'get' }));
            }
            callback(null);
        }
    );
};

export const setSetting = async (id: string, value: any): Promise<void> => {
    if (!id) return;
    const docRef = doc(getSettingsCollection(), id);
    setDoc(docRef, { value }).catch(async (error: any) => {
        if (error.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: docRef.path,
                operation: 'write',
                requestResourceData: { value },
            }));
        }
    });
};

export const updateCostSettings = async (newCosts: Partial<CostSetting>, updatedBy: string): Promise<void> => {
    const docRef = doc(getSettingsCollection(), 'costing');
    const now = new Date().toISOString();
    const payload = { value: { ...newCosts, lastModifiedBy: updatedBy, lastModifiedAt: now } };

    setDoc(docRef, payload, { merge: true }).catch(async (error: any) => {
        if (error.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: docRef.path,
                operation: 'update',
                requestResourceData: payload,
            }));
        }
    });
};

/**
 * Robust bulk update for existing record numbering when rules change.
 * Handles grouping for multi-entry vouchers (like Payment/Receipt) and synchronization to ledgers.
 */
export const updateExistingRecordsNumbering = async (type: DocumentType, rule: NumberingRule, modifiedBy: string) => {
    const { db } = getFirebase();
    
    const mapping: Record<string, { collection: string, field: string, dateField: string, groupField?: string }> = {
        'report': { collection: 'reports', field: 'serialNumber', dateField: 'date' },
        'purchaseOrder': { collection: 'purchaseOrders', field: 'poNumber', dateField: 'poDate' },
        'sales': { collection: 'trips', field: 'tripNumber', dateField: 'date' },
        'purchase': { collection: 'transactions', field: 'purchaseNumber', dateField: 'date' },
        'paymentReceipt': { collection: 'transactions', field: 'referenceId', dateField: 'date', groupField: 'voucherId' },
        'tdsVoucher': { collection: 'tdsCalculations', field: 'voucherNo', dateField: 'date' },
        'estimateInvoice': { collection: 'estimatedInvoices', field: 'invoiceNumber', dateField: 'date' },
        'expense': { collection: 'expenses', field: 'voucherNo', dateField: 'date' },
        'chequeVoucher': { collection: 'cheques', field: 'voucherNo', dateField: 'paymentDate' },
        'gsmVoucher': { collection: 'gsm_reports', field: 'voucherNo', dateField: 'date' },
        'rentalBill': { collection: 'rentalBills', field: 'id', dateField: 'createdAt' },
        'paymentTracker': { collection: 'payment_tracker', field: 'voucherNo', dateField: 'date' }
    };

    const config = mapping[type];
    if (!config) return;

    const from = rule.effectiveFrom;
    const to = rule.effectiveTo;

    // Use a basic date query to avoid complex index requirements (equality + inequality filters)
    let q = query(
        collection(db, config.collection),
        where(config.dateField, '>=', from)
    );

    if (to) {
        q = query(q, where(config.dateField, '<=', to));
    }

    try {
        const snapshot = await getDocs(q);
        if (snapshot.empty) return;

        let docs = snapshot.docs.map(d => ({ id: d.id, data: d.data(), ref: d.ref }));
        
        // Manual filter for transaction subtypes to avoid strict index requirements in Firestore
        if (type === 'purchase') {
            docs = docs.filter(d => d.data.referenceType === 'Purchase Entry');
        } else if (type === 'paymentReceipt') {
            docs = docs.filter(d => d.data.referenceType === 'Payment/Receipt Voucher');
        }

        if (docs.length === 0) return;

        // Group by groupField if defined (crucial for Payment/Receipt Vouchers with multiple entries)
        const groups: Map<string, typeof docs> = new Map();
        if (config.groupField) {
            docs.forEach(d => {
                const key = d.data[config.groupField!] || d.id;
                const arr = groups.get(key) || [];
                arr.push(d);
                groups.set(key, arr);
            });
        } else {
            docs.forEach(d => groups.set(d.id, [d]));
        }

        // Sort groups chronologically
        const sortedGroups = Array.from(groups.values());
        sortedGroups.sort((a, b) => 
            new Date(a[0].data[config.dateField]).getTime() - 
            new Date(b[0].data[config.dateField]).getTime()
        );

        const batch = writeBatch(db);
        let currentNum = rule.startingNumber;
        const now = new Date().toISOString();

        for (const groupDocs of sortedGroups) {
            const newNum = `${rule.prefix}${currentNum.toString().padStart(3, '0')}`;
            
            for (const d of groupDocs) {
                const updates: any = {
                    [config.field]: newNum,
                    lastModifiedBy: modifiedBy,
                    lastModifiedAt: now
                };
                
                // For purchases in transaction ledger, sync both fields
                if (type === 'purchase') {
                    updates.referenceId = newNum;
                }

                batch.update(d.ref, updates);

                // SYNC CROSS-COLLECTION SIDE EFFECTS
                if (type === 'sales') {
                    // Update matching transaction in ledger
                    const tSnap = await getDocs(query(collection(db, 'transactions'), where('tripId', '==', d.id)));
                    tSnap.forEach(tdoc => batch.update(tdoc.ref, { referenceId: newNum, lastModifiedAt: now, lastModifiedBy: modifiedBy }));
                } else if (type === 'expense') {
                    // Update matching transaction in ledger
                    const tSnap = await getDocs(query(collection(db, 'transactions'), where('expenseId', '==', d.id)));
                    tSnap.forEach(tdoc => batch.update(tdoc.ref, { referenceId: newNum, lastModifiedAt: now, lastModifiedBy: modifiedBy }));
                }
            }
            currentNum++;
        }

        await batch.commit();
    } catch (error: any) {
        if (error.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: `${config.collection}_bulk_renumber`,
                operation: 'write'
            }));
        }
        throw error;
    }
};
