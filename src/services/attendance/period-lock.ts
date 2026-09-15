/**
 * @fileOverview Lightweight per-period lock for Attendance Logs.
 *
 * A locked period cannot be re-run through the Hourly Calculation Processor -
 * it protects an already-finalized month (or imported historical month) from
 * being silently recomputed under today's rounding/grace/break rules.
 */
import { getFirebase } from '@/lib/firebase';
import { collection, onSnapshot, DocumentData, QueryDocumentSnapshot } from 'firebase/firestore';

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

