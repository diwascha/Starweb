
'use client';
import { getFirebase } from '@/lib/firebase';
import { reportWriteFailure } from '@/lib/write-reporting';
import { collection, doc, getDoc, setDoc, onSnapshot, query, where, getDocs, writeBatch } from 'firebase/firestore';
import { AppSetting, CostSetting, DocumentType, NumberingRule } from '@/lib/types';
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
    reportWriteFailure(
        setDoc(docRef, { value }),
        { path: docRef.path, operation: 'write', requestResourceData: { value } }
    );
};

export const updateCostSettings = async (newCosts: Partial<CostSetting>, updatedBy: string): Promise<void> => {
    const docRef = doc(getSettingsCollection(), 'costing');
    const now = new Date().toISOString();
    const payload = { value: { ...newCosts, lastModifiedBy: updatedBy, lastModifiedAt: now } };

    reportWriteFailure(
        setDoc(docRef, payload, { merge: true }),
        { path: docRef.path, operation: 'update', requestResourceData: payload }
    );
};

const RENUMBER_TARGETS: Record<string, { collection: string, field: string, dateField: string, groupField?: string }> = {
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

// Firestore allows 500 writes per batch; leave headroom for ledger side effects.
const BATCH_LIMIT = 400;

type RenumberDoc = { id: string; data: any; ref: any };
type RenumberPlan = { groups: { docs: RenumberDoc[]; oldNumber: string; newNumber: string }[] };

/**
 * Works out the number every record in the rule's date range should carry.
 * Records are ordered by date, then by their current number so a re-run
 * gives the same result. One number per voucher group, so every record in
 * the range ends up on this rule's single sequence - a fiscal year never
 * holds two numbering schemes side by side.
 */
const planRenumbering = async (type: DocumentType, rule: NumberingRule): Promise<RenumberPlan | null> => {
    const { db } = getFirebase();
    const config = RENUMBER_TARGETS[type];
    if (!config) return null;

    // Basic date query to avoid composite index requirements.
    let q = query(collection(db, config.collection), where(config.dateField, '>=', rule.effectiveFrom));
    if (rule.effectiveTo) q = query(q, where(config.dateField, '<=', rule.effectiveTo));

    const snapshot = await getDocs(q);
    let docs: RenumberDoc[] = snapshot.docs.map(d => ({ id: d.id, data: d.data(), ref: d.ref }));

    // Transaction subtypes are filtered here to avoid strict index requirements.
    if (type === 'purchase') docs = docs.filter(d => d.data.referenceType === 'Purchase Entry');
    else if (type === 'paymentReceipt') docs = docs.filter(d => d.data.referenceType === 'Payment/Receipt Voucher');

    // Group multi-entry vouchers (Payment/Receipt) so they share one number.
    const grouped = new Map<string, RenumberDoc[]>();
    docs.forEach(d => {
        const key = (config.groupField && d.data[config.groupField]) || d.id;
        grouped.set(key, [...(grouped.get(key) || []), d]);
    });

    const ordered = Array.from(grouped.values()).sort((a, b) => {
        const byDate = new Date(a[0].data[config.dateField]).getTime() - new Date(b[0].data[config.dateField]).getTime();
        if (byDate !== 0) return byDate;
        return String(a[0].data[config.field] || '').localeCompare(String(b[0].data[config.field] || ''), undefined, { numeric: true });
    });

    return {
        groups: ordered.map((groupDocs, i) => ({
            docs: groupDocs,
            oldNumber: String(groupDocs[0].data[config.field] || ''),
            newNumber: `${rule.prefix}${(rule.startingNumber + i).toString().padStart(3, '0')}`,
        })),
    };
};

export type RenumberPreview = { total: number; changing: number; first: string; last: string; examples: { from: string; to: string }[] };

/** What a renumber would do, without writing anything - shown for confirmation. */
export const previewRenumbering = async (type: DocumentType, rule: NumberingRule): Promise<RenumberPreview> => {
    const plan = await planRenumbering(type, rule);
    const groups = plan?.groups || [];
    const changes = groups.filter(g => g.oldNumber !== g.newNumber);
    return {
        total: groups.length,
        changing: changes.length,
        first: groups[0]?.newNumber || '',
        last: groups[groups.length - 1]?.newNumber || '',
        examples: changes.slice(0, 3).map(g => ({ from: g.oldNumber || '(none)', to: g.newNumber })),
    };
};

/**
 * Re-sequences existing records onto a numbering rule, keeping linked ledger
 * entries in step. Writes go in chunks under Firestore's 500-per-batch limit.
 * Afterwards the number counter for this prefix is set to the last number
 * used, so the next new document continues the sequence instead of reusing
 * or skipping a number. Safe to re-run: the same records get the same numbers.
 */
export const updateExistingRecordsNumbering = async (type: DocumentType, rule: NumberingRule, modifiedBy: string) => {
    const { db } = getFirebase();
    const config = RENUMBER_TARGETS[type];
    if (!config) return;

    try {
        const plan = await planRenumbering(type, rule);
        if (!plan || plan.groups.length === 0) return;

        const now = new Date().toISOString();
        const stamp = { lastModifiedBy: modifiedBy, lastModifiedAt: now };
        let batch = writeBatch(db);
        let ops = 0;
        const commits: Promise<void>[] = [];
        const add = (ref: any, data: any) => {
            batch.update(ref, data);
            if (++ops >= BATCH_LIMIT) {
                commits.push(batch.commit());
                batch = writeBatch(db);
                ops = 0;
            }
        };

        for (const group of plan.groups) {
            if (group.oldNumber === group.newNumber) continue;
            for (const d of group.docs) {
                const updates: any = { [config.field]: group.newNumber, ...stamp };
                // Purchases in the transaction ledger carry the number twice.
                if (type === 'purchase') updates.referenceId = group.newNumber;
                add(d.ref, updates);

                // Keep the matching ledger entry's reference in step.
                const linkField = type === 'sales' ? 'tripId' : type === 'expense' ? 'expenseId' : null;
                if (linkField) {
                    const tSnap = await getDocs(query(collection(db, 'transactions'), where(linkField, '==', d.id)));
                    tSnap.forEach(tdoc => add(tdoc.ref, { referenceId: group.newNumber, ...stamp }));
                }
            }
        }
        if (ops > 0) commits.push(batch.commit());
        await Promise.all(commits);

        // Not fatal if this fails: reservation never goes below the highest
        // number already on a record, so it can only leave a gap, not a clash.
        const lastNumber = rule.startingNumber + plan.groups.length - 1;
        await setDoc(
            doc(db, COLLECTIONS.NUMBER_COUNTERS, `${type}__${encodeURIComponent(rule.prefix)}`),
            { lastNumber, prefix: rule.prefix, counterKey: type, updatedAt: now },
            { merge: true }
        ).catch(e => console.warn('Could not reset number counter after renumbering:', e));
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
