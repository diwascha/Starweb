'use client';
/**
 * @fileOverview Cheque service for managing post-dated and issued cheques.
 * Standardized for contextual error handling and ownership enforcement.
 */

import { getFirebase } from '@/lib/firebase';
import { reportWriteFailure } from '@/lib/write-reporting';
import { collection, onSnapshot, DocumentData, QueryDocumentSnapshot, doc, updateDoc, deleteDoc, query, orderBy, setDoc, runTransaction } from 'firebase/firestore';
import type { Cheque } from '@/lib/types';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { COLLECTIONS } from '@/lib/constants';

/**
 * Cheques written before splits carried an id still exist, and a split with
 * no id cannot be addressed for an update at all: the row renders, but
 * marking it paid asks the transaction for split `undefined` and fails. The
 * id given here is POSITIONAL rather than random so the same split resolves
 * to the same value on every read - a fresh random id would never match the
 * stored document. updateChequeSplit writes a real id back the first time
 * such a split is touched, so this only applies until then.
 */
export const LEGACY_SPLIT_ID_PREFIX = 'legacy-split-';

const legacySplitIndex = (splitId: string): number => {
    if (!splitId.startsWith(LEGACY_SPLIT_ID_PREFIX)) return -1;
    const index = Number(splitId.slice(LEGACY_SPLIT_ID_PREFIX.length));
    return Number.isInteger(index) && index >= 0 ? index : -1;
};

const getChequesCollection = () => {
    const { db } = getFirebase();
    return collection(db, COLLECTIONS.CHEQUES);
};

const fromFirestore = (snapshot: QueryDocumentSnapshot<DocumentData>): Cheque => {
    const data = snapshot.data();
    return {
        id: snapshot.id,
        voucherNo: data.voucherNo || 'PDC-LEGACY',
        paymentDate: data.paymentDate,
        invoiceDate: data.invoiceDate,
        invoiceNumber: data.invoiceNumber,
        partyName: String(data.partyName || ''),
        payeeName: String(data.payeeName || ''),
        amount: Number(data.amount) || 0,
        amountInWords: String(data.amountInWords || ''),
        accountId: data.accountId,
        ownership: data.ownership || 'Both',
        splits: (data.splits || []).map((split: any, index: number) => ({
            ...split,
            id: split.id || `${LEGACY_SPLIT_ID_PREFIX}${index}`,
            remarks: split.remarks || '',
        })),
        createdBy: String(data.createdBy || 'System'),
        createdAt: data.createdAt,
        lastModifiedBy: data.lastModifiedBy,
        lastModifiedAt: data.lastModifiedAt,
    };
};


export const addCheque = async (cheque: Omit<Cheque, 'id' | 'createdAt'>): Promise<string> => {
    const docRef = doc(getChequesCollection());
    const payload = { ...cheque, createdAt: new Date().toISOString() };
    
    reportWriteFailure(
        setDoc(docRef, payload),
        { path: COLLECTIONS.CHEQUES, operation: 'create', requestResourceData: payload }
    );
    return docRef.id;
};

export const updateCheque = async (id: string, cheque: Partial<Omit<Cheque, 'id'>>): Promise<void> => {
    const chequeDoc = doc(getChequesCollection(), id);
    const payload = { ...cheque, lastModifiedAt: new Date().toISOString() };
    
    reportWriteFailure(
        updateDoc(chequeDoc, payload),
        { path: COLLECTIONS.CHEQUES, operation: 'update', requestResourceData: payload }
    );
};

export const deleteCheque = async (id: string): Promise<void> => {
    const chequeDoc = doc(getChequesCollection(), id);
    reportWriteFailure(
        deleteDoc(chequeDoc),
        { path: COLLECTIONS.CHEQUES, operation: 'delete' }
    );
};

export const onChequesUpdate = (callback: (cheques: Cheque[]) => void): () => void => {
    const q = query(getChequesCollection(), orderBy('createdAt', 'desc'));
    return onSnapshot(q, 
        (snapshot) => {
            callback(snapshot.docs.map(fromFirestore));
        },
        async (error) => {
            if (error.code === 'permission-denied') {
                errorEmitter.emit('permission-error', new FirestorePermissionError({ 
                    path: COLLECTIONS.CHEQUES, 
                    operation: 'list' 
                }));
            }
        }
    );
};

/**
 * Apply a change to ONE split of a cheque, atomically.
 *
 * Recording a partial payment, settling a cheque or reversing a payment all
 * used to be read-modify-write from the client: take the splits array off the
 * snapshot, map over it, write the whole array back. The snapshot is live, so
 * the window is narrow - but two people posting against the same cheque at
 * the same moment still both wrote a full array built from the state before
 * the other's write, and one payment vanished with no trace.
 *
 * The mutation now runs inside a Firestore transaction against freshly read
 * splits, so concurrent posts serialise instead of overwriting each other.
 * `mutate` may be called more than once if the transaction retries, so it
 * must be pure - derive the new split from the `split` it is handed, never
 * from anything captured outside.
 */
export const updateChequeSplit = async (
    chequeId: string,
    splitId: string,
    mutate: (split: any, allSplits: any[]) => any,
    modifiedBy: string
): Promise<void> => {
    const { db } = getFirebase();
    const chequeRef = doc(getChequesCollection(), chequeId);

    try {
        await runTransaction(db, async (tx) => {
            const snap = await tx.get(chequeRef);
            if (!snap.exists()) {
                throw new Error(`Cheque ${chequeId} no longer exists.`);
            }

            const splits: any[] = snap.data()?.splits || [];

            // Match on the stored id, falling back to the positional id given
            // to a split that has none (see LEGACY_SPLIT_ID_PREFIX).
            let target = splits.findIndex(s => s.id === splitId);
            if (target === -1) {
                const index = legacySplitIndex(splitId);
                if (index !== -1 && splits[index] && !splits[index].id) target = index;
            }
            if (target === -1) {
                throw new Error(`Cheque ${chequeId} has no split ${splitId}.`);
            }

            const updated = splits.map((s, i) => {
                if (i !== target) return s;
                const next = mutate(s, splits);
                // Leaves the split permanently addressable by a real id.
                return next.id ? next : { ...next, id: splitId };
            });
            tx.update(chequeRef, {
                splits: updated,
                lastModifiedBy: modifiedBy,
                lastModifiedAt: new Date().toISOString(),
            });
        });
    } catch (error: any) {
        if (error?.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: chequeRef.path,
                operation: 'update',
            }));
        }
        throw error;
    }
};
