'use client';
import { getFirebase } from '@/lib/firebase';
import { reportWriteFailure } from '@/lib/write-reporting';
import { 
    collection, 
    doc, 
    onSnapshot, 
    DocumentData, 
    QueryDocumentSnapshot, 
    getDocs,
    getDoc,
    query,
    where,
    updateDoc,
    deleteDoc,
    orderBy
} from 'firebase/firestore';
import type { AttendanceRecord, RawMachineLog } from '@/lib/types';
import { format } from 'date-fns';
import { COLLECTIONS } from '@/lib/constants';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { deleteDocsInChunks } from '@/lib/service-utils';

export const getAttendanceCollection = () => {
    const { db } = getFirebase();
    return collection(db, COLLECTIONS.ATTENDANCE);
};

export const getRawLogsCollection = () => {
    const { db } = getFirebase();
    return collection(db, 'raw_machine_logs');
};

export const fromFirestoreLog = (snapshot: QueryDocumentSnapshot<DocumentData>): RawMachineLog => {
    const data = snapshot.data();
    return {
        id: snapshot.id,
        date: String(data.date || ''),
        dateBS: String(data.dateBS || ''),
        bsYear: Number(data.bsYear) || 0,
        bsMonth: Number(data.bsMonth) || 0,
        employeeName: String(data.employeeName || ''),
        onDuty: data.onDuty ? String(data.onDuty) : null,
        offDuty: data.offDuty ? String(data.offDuty) : null,
        clockIn: data.clockIn ? String(data.clockIn) : null,
        clockOut: data.clockOut ? String(data.clockOut) : null,
        statusFromMachine: String(data.statusFromMachine || ''),
        regularHoursFromMachine: Number(data.regularHoursFromMachine) || 0,
        overtimeHoursFromMachine: Number(data.overtimeHoursFromMachine) || 0,
        remarks: data.remarks ? String(data.remarks) : null,
        importId: String(data.importId || ''),
        importedAt: String(data.importedAt || ''),
        importedBy: String(data.importedBy || ''),
        sourceSheet: String(data.sourceSheet || ''),
        rawPayload: (data.rawPayload || {}) as Record<string, any>,
        rowIndex: data.rowIndex !== undefined ? Number(data.rowIndex) : undefined,
        isManual: !!data.isManual,
        otApproved: data.otApproved !== undefined ? Boolean(data.otApproved) : undefined,
    };
};

const fromFirestoreRecord = (snapshot: QueryDocumentSnapshot<DocumentData>): AttendanceRecord => {
    const data = snapshot.data();
    const date = String(data.date || '');
    // weekday/absent/gTime/breakHours/gHours are written by runHourlyCalculation
    // but were never read back here, so they always looked blank in the UI
    // regardless of what got calculated. Weekday additionally falls back to
    // deriving it from the AD date for older records saved before this field
    // existed at all (e.g. legacy ledger imports).
    let weekday = data.weekday ? String(data.weekday) : '';
    if (!weekday && date) {
        const parsed = new Date(date);
        if (!isNaN(parsed.getTime())) weekday = format(parsed, 'EEEE');
    }
    return {
        id: snapshot.id,
        date,
        dateBS: String(data.dateBS || data.bsDate || ''),
        bsYear: Number(data.bsYear) || 0,
        bsMonth: Number(data.bsMonth) || 0,
        employeeName: String(data.employeeName || ''),
        employeeId: String(data.employeeId || ''),
        onDuty: data.onDuty ? String(data.onDuty) : null,
        offDuty: data.offDuty ? String(data.offDuty) : null,
        clockIn: data.clockIn ? String(data.clockIn) : null,
        clockOut: data.clockOut ? String(data.clockOut) : null,
        status: String(data.status || ''),
        grossHours: Number(data.grossHours) || 0,
        overtimeHours: Number(data.overtimeHours) || 0,
        regularHours: Number(data.regularHours) || 0,
        remarks: data.remarks ? String(data.remarks) : null,
        calculatedAt: String(data.calculatedAt || ''),
        calculatedBy: String(data.calculatedBy || ''),
        sourceLogId: data.sourceLogId ? String(data.sourceLogId) : undefined,
        rowIndex: data.rowIndex !== undefined ? Number(data.rowIndex) : undefined,
        weekday: weekday || undefined,
        absent: data.absent !== undefined ? Boolean(data.absent) : undefined,
        gTime: data.gTime !== undefined && data.gTime !== null ? Number(data.gTime) : null,
        breakHours: data.breakHours !== undefined && data.breakHours !== null ? Number(data.breakHours) : null,
        gHours: data.gHours !== undefined && data.gHours !== null ? Number(data.gHours) : null,
    };
};

export const onRawLogsUpdate = (callback: (logs: RawMachineLog[]) => void): () => void => {
    const collectionRef = getRawLogsCollection();
    const q = query(collectionRef, orderBy('importedAt', 'desc'));
    return onSnapshot(q, (snapshot) => {
        callback(snapshot.docs.map(fromFirestoreLog));
    }, async (error) => {
        if (error.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: 'raw_machine_logs',
                operation: 'list'
            }));
        }
    });
};

export const onAttendanceUpdate = (callback: (records: AttendanceRecord[]) => void): () => void => {
    const collectionRef = getAttendanceCollection();
    return onSnapshot(collectionRef, (snapshot) => {
        callback(snapshot.docs.map(fromFirestoreRecord));
    }, async (error) => {
        if (error.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: COLLECTIONS.ATTENDANCE,
                operation: 'list'
            }));
        }
    });
};

export const getAttendanceForMonth = async (bsYear: number, bsMonth: number): Promise<AttendanceRecord[]> => {
    const q = query(getAttendanceCollection(), where("bsYear", "==", bsYear), where("bsMonth", "==", bsMonth));
    try {
        const snapshot = await getDocs(q);
        return snapshot.docs.map(fromFirestoreRecord);
    } catch (err: any) {
        if (err.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: COLLECTIONS.ATTENDANCE,
                operation: 'list'
            }));
        }
        throw err;
    }
};

export const deleteRawLog = async (id: string) => {
    const docRef = doc(getRawLogsCollection(), id);
    reportWriteFailure(
        deleteDoc(docRef),
        { path: docRef.path, operation: 'delete' }
    );
};

export const deleteRawLogsForMonth = async (year: number, month: number): Promise<void> => {
    const q = query(getRawLogsCollection(), where('bsYear', '==', year), where('bsMonth', '==', month));
    const snap = await getDocs(q);
    try {
        await deleteDocsInChunks(snap.docs.map(d => d.ref));
    } catch (err: any) {
        if (err.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: 'raw_machine_logs_batch_delete',
                operation: 'write'
            }));
        }
        throw err;
    }
};

export const deleteAttendanceRecord = async (id: string) => {
    const docRef = doc(getAttendanceCollection(), id);
    reportWriteFailure(
        deleteDoc(docRef),
        { path: docRef.path, operation: 'delete' }
    );
};

/**
 * True if either the attendance or the payroll period lock for this BS
 * year/month is set. Deletion (single-month or fiscal-year-wide) must never
 * touch a locked period - that lock exists specifically to protect a
 * finalized or imported month from being wiped.
 */
export const isPeriodLocked = async (bsYear: number, bsMonth: number): Promise<boolean> => {
    const { db } = getFirebase();
    const id = `${bsYear}-${bsMonth}`;
    const [attLock, payLock] = await Promise.all([
        getDoc(doc(collection(db, 'attendance_periods'), id)),
        getDoc(doc(collection(db, 'payroll_periods'), id)),
    ]);
    return Boolean(attLock.data()?.locked) || Boolean(payLock.data()?.locked);
};

/**
 * Deletes processed Attendance and Payroll records for one BS year/month
 * together - payroll is derived from attendance, so leaving stale payroll
 * behind after wiping its source attendance would be worse than deleting
 * nothing. Refuses (no-op) if the period is locked.
 */
/**
 * "Delete Records" for one BS period: removes every derived record tied to
 * it - Attendance, Payroll, and the metrics generated from Payroll (bonus
 * ledger, behavior ledger/analytics, the saved analytics report) - in one
 * pass, so nothing is left half-deleted regardless of which page (Attendance
 * Logs or Payroll) triggered it. Refuses (no-op) on a locked period.
 */
export const deleteAttendanceForMonth = async (year: number, month: number): Promise<{ deleted: boolean; locked: boolean }> => {
    if (await isPeriodLocked(year, month)) {
        return { deleted: false, locked: true };
    }
    const { db } = getFirebase();

    try {
        await deleteDoc(doc(db, 'analytics_reports', `${year}-${month}`));
    } catch (err: any) {
        // A missing analytics_reports doc is expected for most periods - only
        // surface a genuine permission problem, and don't let it block the
        // rest of the deletion below.
        if (err?.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: 'analytics_reports',
                operation: 'delete',
            }));
        }
    }

    const metricsCollections = ['bonus_ledger', 'behavior_ledger', 'behavior_analytics'];
    const [attSnap, paySnap, ...metricsSnaps] = await Promise.all([
        getDocs(query(getAttendanceCollection(), where('bsYear', '==', year), where('bsMonth', '==', month))),
        getDocs(query(collection(db, COLLECTIONS.PAYROLL), where('bsYear', '==', year), where('bsMonth', '==', month))),
        ...metricsCollections.map(name => getDocs(query(collection(db, name), where('bsYear', '==', year), where('bsMonth', '==', month)))),
    ]);
    try {
        await deleteDocsInChunks([...attSnap.docs, ...paySnap.docs, ...metricsSnaps.flatMap(s => s.docs)].map(d => d.ref));
    } catch (err: any) {
        if (err.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: 'attendance_batch_delete',
                operation: 'write'
            }));
        }
        throw err;
    }
    return { deleted: true, locked: false };
};

/**
 * Deletes processed Attendance and Payroll records for every month in a
 * fiscal year (Shrawan through Ashadh), skipping any month whose period is
 * locked. Used for bulk test-data cleanup, never on locked/finalized data.
 */
export const deleteAttendanceAndPayrollForFiscalYear = async (
    fyMonths: { bsYear: number; bsMonth: number }[]
): Promise<{ monthsDeleted: number; monthsSkippedLocked: number }> => {
    let monthsDeleted = 0;
    let monthsSkippedLocked = 0;
    for (const { bsYear, bsMonth } of fyMonths) {
        const result = await deleteAttendanceForMonth(bsYear, bsMonth);
        if (result.deleted) monthsDeleted++;
        else if (result.locked) monthsSkippedLocked++;
    }
    return { monthsDeleted, monthsSkippedLocked };
};

export const deleteAllRawLogs = async (): Promise<void> => {
    const snap = await getDocs(getRawLogsCollection());
    if (snap.empty) return;
    try {
        await deleteDocsInChunks(snap.docs.map(d => d.ref));
    } catch (err: any) {
        if (err.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: 'raw_machine_logs_purge',
                operation: 'write'
            }));
        }
        throw err;
    }
};

export const deleteAllAttendance = async (): Promise<void> => {
    const { db } = getFirebase();
    const snaps = await Promise.all([
        getDocs(getAttendanceCollection()),
        getDocs(getRawLogsCollection()),
        getDocs(collection(db, COLLECTIONS.PAYROLL)),
        getDocs(collection(db, 'analytics_reports'))
    ]);
    try {
        await deleteDocsInChunks(snaps.flatMap(snap => snap.docs.map(d => d.ref)));
    } catch (err: any) {
        if (err.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: 'attendance_system_purge',
                operation: 'write'
            }));
        }
        throw err;
    }
};

export const getAttendanceYears = async (): Promise<number[]> => {
    const { db } = getFirebase();
    const years = new Set<number>();
    try {
        const [attSnap, blSnap, paySnap, rawSnap] = await Promise.all([
            getDocs(getAttendanceCollection()),
            getDocs(collection(db, 'behavior_ledger')),
            getDocs(collection(db, COLLECTIONS.PAYROLL)),
            getDocs(getRawLogsCollection())
        ]);
        attSnap.docs.forEach(d => years.add(d.data().bsYear as number));
        blSnap.docs.forEach(d => years.add(d.data().bsYear as number));
        paySnap.docs.forEach(d => years.add(d.data().bsYear as number));
        rawSnap.docs.forEach(d => years.add(d.data().bsYear as number));
    } catch (e) {}
    return Array.from(years).sort((a, b) => b - a);
};

export const updateRawLog = async (id: string, updates: Partial<RawMachineLog>) => {
    const docRef = doc(getRawLogsCollection(), id);
    reportWriteFailure(
        updateDoc(docRef, updates),
        { path: docRef.path, operation: 'update' }
    );
};

export const updateAttendanceRecord = async (id: string, updates: Partial<AttendanceRecord>) => {
    const docRef = doc(getAttendanceCollection(), id);
    reportWriteFailure(
        updateDoc(docRef, updates),
        { path: docRef.path, operation: 'update' }
    );
};