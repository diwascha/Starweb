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
 * Which BS years a listener should stream.
 *
 * These two collections grow without bound - a row per employee per day,
 * forever - and both listeners used to attach to the whole thing. Every HR
 * screen therefore downloaded every attendance record ever imported, on every
 * mount, and the cost grew every month.
 *
 * Scoping by BS YEAR rather than by month is deliberate. A Nepali fiscal year
 * spans exactly two BS years (Shrawan of one through Ashadh of the next), and
 * all four callers already work in fiscal years and already narrow to the
 * precise month client-side. A single `where('bsYear', '==', y)` equality is
 * enough to cut the read from "all history" to "the selected year", and being
 * equality-only it needs NO composite index and no backfill of existing rows.
 */
export interface AttendanceScope {
    /** Usually the two BS years of a fiscal year. Empty streams nothing. */
    bsYears: number[];
}

/**
 * Fan a listener out over several BS years and merge the results.
 *
 * Firestore has no `IN` on a field you also want live updates for without an
 * index, so one listener per year and a merge is both simpler and cheaper than
 * a composite query. Each year's slice is held separately and the callback
 * fires with the union whenever any slice changes.
 */
const streamByBsYear = <T>(
    getCollection: () => ReturnType<typeof collection>,
    scope: AttendanceScope,
    map: (snap: QueryDocumentSnapshot<DocumentData>) => T,
    path: string,
    callback: (rows: T[]) => void
): () => void => {
    const years = Array.from(new Set(scope.bsYears.filter(y => Number.isFinite(y) && y > 0)));

    // No year selected yet: report empty rather than falling back to the whole
    // collection, which is the behaviour being removed.
    if (years.length === 0) {
        callback([]);
        return () => {};
    }

    const slices = new Map<number, T[]>();

    // Hold the first emission until every year has reported once. Otherwise the
    // caller sees one year's rows, believes loading is finished, and renders a
    // half-populated fiscal year for the moment before the other year arrives.
    // After that first complete pass, every update emits immediately.
    let primed = false;
    const emit = () => {
        if (!primed) {
            if (slices.size < years.length) return;
            primed = true;
        }
        callback(years.flatMap(y => slices.get(y) ?? []));
    };

    const unsubs = years.map(year =>
        onSnapshot(
            query(getCollection(), where('bsYear', '==', year)),
            snapshot => {
                slices.set(year, snapshot.docs.map(map));
                emit();
            },
            async (error) => {
                // Record an empty slice so one failing year cannot hold the
                // priming gate shut and leave the page loading forever.
                slices.set(year, []);
                emit();
                if (error.code === 'permission-denied') {
                    errorEmitter.emit('permission-error', new FirestorePermissionError({
                        path,
                        operation: 'list'
                    }));
                }
            }
        )
    );

    return () => unsubs.forEach(u => u());
};

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