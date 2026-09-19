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
    orderBy,
    limit
} from 'firebase/firestore';
import type { AttendanceRecord, RawMachineLog } from '@/lib/types';
import { format } from 'date-fns';
import NepaliDate from 'nepali-date-converter';
import { COLLECTIONS } from '@/lib/constants';
import { streamByBsYear, type BsYearScope } from '../bs-year-stream';
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

/**
 * A BS-year scope for these listeners. Kept as an alias so existing callers
 * and their imports read the same; the streaming itself is shared with
 * payroll in services/bs-year-stream.
 */
export type AttendanceScope = BsYearScope;


export const onRawLogsUpdate = (
    scope: AttendanceScope,
    callback: (logs: RawMachineLog[]) => void
): () => void =>
    streamByBsYear(getRawLogsCollection, scope, fromFirestoreLog, 'raw_machine_logs', logs => {
        // The old query carried orderBy('importedAt','desc'). Sorting here keeps
        // that order across the merged per-year slices.
        callback([...logs].sort((a, b) =>
            String(b.importedAt ?? '').localeCompare(String(a.importedAt ?? ''))
        ));
    });

export const onAttendanceUpdate = (
    scope: AttendanceScope,
    callback: (records: AttendanceRecord[]) => void
): () => void =>
    streamByBsYear(getAttendanceCollection, scope, fromFirestoreRecord, COLLECTIONS.ATTENDANCE, callback);


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

/**
 * Deletes only `attendance` and `raw_machine_logs` rows for every month in a
 * fiscal year - the two collections that stream a whole fiscal year on every
 * visit and drove the app past Firestore's free read quota. Nothing shown on
 * the Payroll page is touched: `payroll`, `bonus_ledger`, `bonus_summaries`,
 * `behavior_ledger` and `behavior_analytics` are left exactly as they are, so
 * finalized pay figures survive a purge of the raw punch data they were
 * calculated from. A locked month (finalized or imported) is skipped unless
 * `force` is set, same as the existing fiscal-year cleanup.
 *
 * `force` exists because this purge is only reachable from Settings > System
 * by an administrator, deliberately deleting raw punch data that has already
 * served its purpose. The lock exists to protect that data from being
 * recalculated or re-synced over by accident during normal HR use - it was
 * never meant to block an admin from clearing it out on purpose here, and
 * without `force` a fully-imported fiscal year (locked precisely because it
 * is finalized) could never be purged at all.
 *
 * Meant as a one-off: once a fiscal year's attendance has been fully entered
 * into payroll and is no longer needed, this frees the stored data without
 * requiring it to ever be re-imported.
 */
export const deleteAttendanceLogsForFiscalYear = async (
    fyMonths: { bsYear: number; bsMonth: number }[],
    force: boolean = false
): Promise<{ monthsCleared: number; monthsSkippedLocked: number; recordsDeleted: number }> => {
    let monthsCleared = 0;
    let monthsSkippedLocked = 0;
    let recordsDeleted = 0;

    for (const { bsYear, bsMonth } of fyMonths) {
        if (!force && await isPeriodLocked(bsYear, bsMonth)) {
            monthsSkippedLocked++;
            continue;
        }

        const [attSnap, rawSnap] = await Promise.all([
            getDocs(query(getAttendanceCollection(), where('bsYear', '==', bsYear), where('bsMonth', '==', bsMonth))),
            getDocs(query(getRawLogsCollection(), where('bsYear', '==', bsYear), where('bsMonth', '==', bsMonth))),
        ]);
        const refs = [...attSnap.docs, ...rawSnap.docs].map(d => d.ref);

        if (refs.length > 0) {
            try {
                await deleteDocsInChunks(refs);
            } catch (err: any) {
                if (err.code === 'permission-denied') {
                    errorEmitter.emit('permission-error', new FirestorePermissionError({
                        path: 'attendance_logs_only_batch_delete',
                        operation: 'write',
                    }));
                }
                throw err;
            }
        }
        recordsDeleted += refs.length;
        monthsCleared++;
    }

    return { monthsCleared, monthsSkippedLocked, recordsDeleted };
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

/** Oldest BS year worth probing for data. The business predates the system by
 *  a long way, but nothing was ever imported below this. */
const EARLIEST_BS_YEAR = 2070;

/**
 * Which BS years actually hold data.
 *
 * This used to read FOUR ENTIRE COLLECTIONS with getDocs - attendance,
 * behavior_ledger, payroll and raw logs - purely to collect the distinct
 * `bsYear` values, then throw every document away. It was the single most
 * expensive read in the app and it grew without bound; on a database with a
 * hundred thousand attendance rows it billed a hundred thousand reads to
 * populate a dropdown.
 *
 * Firestore has no DISTINCT, but the candidate set here is tiny and known: BS
 * years from EARLIEST_BS_YEAR to next year. So probe each one with limit(1) and
 * keep the years that come back non-empty. That is a fixed handful of reads
 * returning at most one document each, it stays constant as the data grows, and
 * it is exact rather than sampled.
 */
export const getAttendanceYears = async (): Promise<number[]> => {
    const { db } = getFirebase();

    const sources = [
        getAttendanceCollection(),
        getRawLogsCollection(),
        collection(db, COLLECTIONS.PAYROLL),
        collection(db, 'behavior_ledger'),
    ];

    const latest = new NepaliDate().getYear() + 1;
    const candidates: number[] = [];
    for (let y = latest; y >= EARLIEST_BS_YEAR; y--) candidates.push(y);

    const probes = candidates.flatMap(year =>
        sources.map(async source => {
            const snap = await getDocs(query(source, where('bsYear', '==', year), limit(1)));
            return snap.empty ? null : year;
        })
    );

    try {
        const found = await Promise.all(probes);
        return Array.from(new Set(found.filter((y): y is number => y !== null)))
            .sort((a, b) => b - a);
    } catch {
        // A permission error or a dropped connection should not empty the year
        // picker and strand the user on a blank page; fall back to the current
        // fiscal year's two BS years.
        return [latest, latest - 1];
    }
};

/**
 * Which BS years hold `attendance` or `raw_machine_logs` data specifically -
 * the two collections the fiscal-year purge in Settings > System deletes.
 *
 * `getAttendanceYears` also probes `payroll` and `behavior_ledger`, which is
 * right for a fiscal-year picker that's about VIEWING data, but wrong here:
 * a year with payroll but no attendance left has nothing for this purge to
 * delete, and offering it just brings back the "which year do I check"
 * hassle this picker exists to remove.
 */
export const getAttendanceLogsBsYears = async (): Promise<number[]> => {
    const sources = [getAttendanceCollection(), getRawLogsCollection()];

    const latest = new NepaliDate().getYear() + 1;
    const candidates: number[] = [];
    for (let y = latest; y >= EARLIEST_BS_YEAR; y--) candidates.push(y);

    const probes = candidates.flatMap(year =>
        sources.map(async source => {
            const snap = await getDocs(query(source, where('bsYear', '==', year), limit(1)));
            return snap.empty ? null : year;
        })
    );

    try {
        const found = await Promise.all(probes);
        return Array.from(new Set(found.filter((y): y is number => y !== null)))
            .sort((a, b) => b - a);
    } catch {
        return [];
    }
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