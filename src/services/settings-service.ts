'use client';
import { getFirebase } from '@/lib/firebase';
import { collection, doc, getDoc, setDoc, onSnapshot, query, where, getDocs, writeBatch, orderBy } from 'firebase/firestore';
import type { AppSetting, CostSetting, DocumentType, NumberingRule } from '@/lib/types';
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
 */
export const updateExistingRecordsNumbering = async (type: DocumentType, rule: NumberingRule, modifiedBy: string) => {
    const { db } = getFirebase();
    
    const mapping: Record<string, { collection: string, field: string, dateField: string, filter?: any }> = {
        'report': { collection: 'reports', field: 'serialNumber', dateField: 'date' },
        'purchaseOrder': { collection: 'purchaseOrders', field: 'poNumber', dateField: 'poDate' },
        'sales': { collection: 'trips', field: 'tripNumber', dateField: 'date' },
        'purchase': { collection: 'transactions', field: 'purchaseNumber', dateField: 'date', filter: where('referenceType', '==', 'Purchase Entry') },
        'paymentReceipt': { collection: 'transactions', field: 'referenceId', dateField: 'date', filter: where('referenceType', '==', 'Payment/Receipt Voucher') },
        'tdsVoucher': { collection: 'tdsCalculations', field: 'voucherNo', dateField: 'date' },
        'estimateInvoice': { collection: 'estimatedInvoices', field: 'invoiceNumber', dateField: 'date' },
        'expense': { collection: 'expenses', field: 'voucherNo', dateField: 'date' },
        'chequeVoucher': { collection: 'cheques', field: 'voucherNo', dateField: 'paymentDate' },
        'gsmVoucher': { collection: 'gsm_reports', field: 'voucherNo', dateField: 'date' },
        'rentalBill': { collection: 'rentalBills', field: 'id', dateField: 'createdAt' }
    };

    const config = mapping[type];
    if (!config) return;

    const from = rule.effectiveFrom;
    const to = rule.effectiveTo;

    let q = query(
        collection(db, config.collection),
        where(config.dateField, '>=', from)
    );

    if (to) {
        q = query(q, where(config.dateField, '<=', to));
    }

    if (config.filter) {
        q = query(q, config.filter);
    }

    try {
        const snapshot = await getDocs(q);
        if (snapshot.empty) return;

        // Sort by date ascending to ensure sequence follows chronological order
        const sortedDocs = snapshot.docs.map(d => ({ id: d.id, data: d.data(), ref: d.ref }));
        sortedDocs.sort((a, b) => new Date(a.data[config.dateField]).getTime() - new Date(b.data[config.dateField]).getTime());

        const batch = writeBatch(db);
        let currentNum = rule.startingNumber;
        const now = new Date().toISOString();

        sortedDocs.forEach(d => {
            const newNum = `${rule.prefix}${currentNum.toString().padStart(3, '0')}`;
            const updates: any = {
                [config.field]: newNum,
                lastModifiedBy: modifiedBy,
                lastModifiedAt: now
            };
            
            // For purchases in transaction ledger, sync referenceId as well
            if (type === 'purchase') {
                updates.referenceId = newNum;
            }

            batch.update(d.ref, updates);
            currentNum++;
        });

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