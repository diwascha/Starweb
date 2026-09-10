/**
 * @fileOverview Lightweight per-period lock for Attendance Logs.
 *
 * A locked period cannot be re-run through the Hourly Calculation Processor -
 * it protects an already-finalized month (or imported historical month) from
 * being silently recomputed under today's rounding/grace/break rules.
 */
import { getFirebase } from '@/lib/firebase';
import { collection, doc, setDoc, onSnapshot, DocumentData, QueryDocumentSnapshot } from 'firebase/firestore';
import { createTimestamp } from '@/lib/service-utils';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

export interface AttendancePeriodLock {
    id: string; // `${bsYear}-${bsMonth}`
    bsYear: number;
    bsMonth: number;
    locked: boolean;
    updatedBy: string;
    updatedAt: string;
}

const getAttendancePeriodLockCollection = () => {
    const { db } = getFirebase();
    return collection(db, 'attendance_periods');
};

const fromFirestore = (snapshot: QueryDocumentSnapshot<DocumentData> | DocumentData): AttendancePeriodLock => {
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

export const onAttendancePeriodLocksUpdate = (callback: (locks: AttendancePeriodLock[]) => void): () => void => {
    return onSnapshot(getAttendancePeriodLockCollection(),
        (snapshot) => callback(snapshot.docs.map(fromFirestore)),
        () => {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: 'attendance_periods',
                operation: 'list',
            }));
        }
    );
};

export const setAttendancePeriodLock = async (bsYear: number, bsMonth: number, locked: boolean, updatedBy: string): Promise<void> => {
    const { db } = getFirebase();
    const id = `${bsYear}-${bsMonth}`;
    const docRef = doc(getAttendancePeriodLockCollection(), id);
    try {
        await setDoc(docRef, { bsYear, bsMonth, locked, updatedBy, updatedAt: createTimestamp() }, { merge: true });
    } catch (err) {
        errorEmitter.emit('permission-error', new FirestorePermissionError({ path: docRef.path, operation: 'write' }));
        throw err;
    }
};
