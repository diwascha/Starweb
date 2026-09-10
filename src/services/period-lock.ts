/**
 * @fileOverview Shared period-lock operations spanning both the Attendance
 * (`attendance_periods`) and Payroll (`payroll_periods`) lock collections.
 *
 * The two collections exist separately because Attendance Logs and Payroll
 * each listen to their own for instant UI feedback, but a lock is a single
 * business concept - a period should never be lockable on one page and not
 * the other. Every write in this file always touches both collections in
 * one batch so they can't drift out of sync; `isPeriodLocked` (re-exported
 * from attendance/data.ts, which already treats either collection saying
 * locked as authoritative) is the single read-side source of truth used
 * everywhere a lock needs to be checked, including inside the calculation
 * services themselves - not just to disable a button in the UI.
 */
import { getFirebase } from '@/lib/firebase';
import { collection, doc, writeBatch } from 'firebase/firestore';
import { createTimestamp } from '@/lib/service-utils';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

export { isPeriodLocked } from './attendance/data';

const periodId = (bsYear: number, bsMonth: number) => `${bsYear}-${bsMonth}`;

/**
 * Locks or unlocks one BS period across both collections together.
 */
export const setCombinedPeriodLock = async (bsYear: number, bsMonth: number, locked: boolean, updatedBy: string): Promise<void> => {
    const { db } = getFirebase();
    const id = periodId(bsYear, bsMonth);
    const now = createTimestamp();
    const batch = writeBatch(db);
    batch.set(doc(collection(db, 'attendance_periods'), id), { bsYear, bsMonth, locked, updatedBy, updatedAt: now }, { merge: true });
    batch.set(doc(collection(db, 'payroll_periods'), id), { bsYear, bsMonth, locked, updatedBy, updatedAt: now }, { merge: true });
    try {
        await batch.commit();
    } catch (err) {
        errorEmitter.emit('permission-error', new FirestorePermissionError({ path: `period_locks/${id}`, operation: 'write' }));
        throw err;
    }
};

/**
 * Locks or unlocks every month in a fiscal year, both collections, as the
 * "Lock All" / "Unlock All" bulk action. Chunked to stay under Firestore's
 * 500-write-per-batch limit (2 writes per month).
 */
export const setFiscalYearPeriodLock = async (
    fyMonths: { bsYear: number; bsMonth: number }[],
    locked: boolean,
    updatedBy: string
): Promise<void> => {
    const { db } = getFirebase();
    const now = createTimestamp();
    const CHUNK = 200;
    for (let i = 0; i < fyMonths.length; i += CHUNK) {
        const batch = writeBatch(db);
        fyMonths.slice(i, i + CHUNK).forEach(({ bsYear, bsMonth }) => {
            const id = periodId(bsYear, bsMonth);
            batch.set(doc(collection(db, 'attendance_periods'), id), { bsYear, bsMonth, locked, updatedBy, updatedAt: now }, { merge: true });
            batch.set(doc(collection(db, 'payroll_periods'), id), { bsYear, bsMonth, locked, updatedBy, updatedAt: now }, { merge: true });
        });
        try {
            await batch.commit();
        } catch (err) {
            errorEmitter.emit('permission-error', new FirestorePermissionError({ path: 'period_locks_bulk', operation: 'write' }));
            throw err;
        }
    }
};
