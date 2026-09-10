/**
 * @fileOverview Lightweight per-period lock for the Financial Registry.
 *
 * A locked period cannot be recalculated or purged - it protects a finalized
 * month (or an imported historical month) from being accidentally overwritten.
 * This is the web-app equivalent of the VBA workbook's sheet protection.
 */
import { getFirebase } from '@/lib/firebase';
import { collection, doc, setDoc, onSnapshot, DocumentData, QueryDocumentSnapshot } from 'firebase/firestore';
import { createTimestamp } from '@/lib/service-utils';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

export interface PayrollPeriodLock {
    id: string; // `${bsYear}-${bsMonth}`
    bsYear: number;
    bsMonth: number;
    locked: boolean;
    updatedBy: string;
    updatedAt: string;
}

const getPeriodLockCollection = () => {
    const { db } = getFirebase();
    return collection(db, 'payroll_periods');
};

const fromFirestore = (snapshot: QueryDocumentSnapshot<DocumentData> | DocumentData): PayrollPeriodLock => {
    const data = snapshot.data();
    return {
        id: snapshot.id,
        bsYear: Number(data.bsYear) || 0,
        bsMonth: Number(data.bsMonth) || 0,
        locked: Boolean(data.locked),
        updatedBy: String(data.updatedBy || ''),
        updatedAt: String(data.updatedAt || ''),
    };
};

export const onPeriodLocksUpdate = (callback: (locks: PayrollPeriodLock[]) => void): () => void => {
    return onSnapshot(getPeriodLockCollection(),
        (snapshot) => callback(snapshot.docs.map(fromFirestore)),
        () => {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: 'payroll_periods',
                operation: 'list',
            }));
        }
    );
};

export const setPeriodLock = async (bsYear: number, bsMonth: number, locked: boolean, updatedBy: string): Promise<void> => {
    const { db } = getFirebase();
    const id = `${bsYear}-${bsMonth}`;
    const docRef = doc(getPeriodLockCollection(), id);
    try {
        await setDoc(docRef, { bsYear, bsMonth, locked, updatedBy, updatedAt: createTimestamp() }, { merge: true });
    } catch (err) {
        errorEmitter.emit('permission-error', new FirestorePermissionError({ path: docRef.path, operation: 'write' }));
        throw err;
    }
};
