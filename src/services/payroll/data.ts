import { getFirebase } from '@/lib/firebase';
import {
    collection,
    doc,
    onSnapshot,
    DocumentData,
    QueryDocumentSnapshot,
    getDocs,
    query,
    where,
    limit
} from 'firebase/firestore';
import type { Payroll } from '@/lib/types';
import { COLLECTIONS } from '@/lib/constants';
import { streamByBsYear, type BsYearScope } from '../bs-year-stream';
import { coerceNumber } from '@/lib/service-utils';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

export const getPayrollCollection = () => {
    const { db } = getFirebase();
    return collection(db, COLLECTIONS.PAYROLL);
}

export const fromFirestore = (snapshot: QueryDocumentSnapshot<DocumentData> | DocumentData): Payroll => {
    const data = snapshot.data();
    return {
        id: snapshot.id,
        bsYear: Number(data.bsYear) || 0,
        bsMonth: Number(data.bsMonth) || 0,
        runTime: data.runTime ? String(data.runTime) : undefined,
        periodAD: String(data.periodAD || ''),
        periodBS: String(data.periodBS || ''),
        employeeId: String(data.employeeId || ''),
        employeeName: String(data.employeeName || ''),
        base: String(data.base || ''),
        presentDays: coerceNumber(data.presentDays),
        extraDays: coerceNumber(data.extraDays),
        leaveDays: coerceNumber(data.leaveDays),
        totalHours: coerceNumber(data.totalHours),
        otHours: coerceNumber(data.otHours),
        regularHours: coerceNumber(data.regularHours),
        rate: coerceNumber(data.rate),
        regularPay: coerceNumber(data.regularPay),
        otPay: coerceNumber(data.otPay),
        allowance: coerceNumber(data.allowance),
        totalPay: coerceNumber(data.totalPay),
        absentDays: coerceNumber(data.absentDays),
        deduction: coerceNumber(data.deduction),
        tds: coerceNumber(data.tds),
        salaryTotal: coerceNumber(data.salaryTotal),
        advance: coerceNumber(data.advance),
        netPayment: coerceNumber(data.netPayment),
        roundedNet: data.roundedNet !== undefined ? coerceNumber(data.roundedNet) : undefined,
        remark: String(data.remark || ''),
        createdBy: String(data.createdBy || 'System'),
        createdAt: String(data.createdAt || ''),
        ownership: data.ownership || 'Both',
        source: data.source || undefined,
        sourceSheet: data.sourceSheet || undefined,
    };
};

/**
 * Payroll for the given BS years only.
 *
 * This collection grows by a row per employee per month forever, and the
 * listener used to attach to all of it: every screen downloaded every payroll
 * record ever imported, on every mount, only to filter down to one month
 * client-side. Scoped the same way attendance already is - see
 * services/bs-year-stream for why BS year is the right granularity.
 */
export const onPayrollUpdate = (
    scope: BsYearScope,
    callback: (records: Payroll[]) => void
): () => void =>
    streamByBsYear(getPayrollCollection, scope, fromFirestore, COLLECTIONS.PAYROLL, callback);

/**
 * Every payroll row for one employee, newest period first. Backs the wage
 * history view: what the person was actually paid each month, which is the
 * authoritative record even when the master wage on their profile has since
 * been edited.
 */
export const getPayrollHistoryForEmployee = async (employeeId: string): Promise<Payroll[]> => {
    const q = query(getPayrollCollection(), where("employeeId", "==", employeeId));
    try {
        const snapshot = await getDocs(q);
        return snapshot.docs
            .map(fromFirestore)
            .sort((a, b) => (b.bsYear - a.bsYear) || (b.bsMonth - a.bsMonth));
    } catch (error) {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: COLLECTIONS.PAYROLL,
            operation: 'list',
        }));
        return [];
    }
};

export const getPayrollForEmployee = async (employeeId: string, bsYear: number, bsMonth: number): Promise<Payroll | null> => {
    const q = query(getPayrollCollection(), where("employeeId", "==", employeeId), where("bsYear", "==", bsYear), where("bsMonth", "==", bsMonth), limit(1));
    try {
        const docSnap = await getDocs(q);
        return docSnap.empty ? null : fromFirestore(docSnap.docs[0]);
    } catch (error) {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: COLLECTIONS.PAYROLL,
            operation: 'list',
        }));
        return null;
    }
};

// Period deletion (Payroll + Attendance + derived metrics together) now
// lives in attendance/data.ts as deleteAttendanceForMonth - both pages
// share that one implementation instead of each deleting a different subset
// of collections.
