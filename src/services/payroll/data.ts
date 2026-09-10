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
    limit,
    deleteDoc
} from 'firebase/firestore';
import type { Payroll } from '@/lib/types';
import { COLLECTIONS } from '@/lib/constants';
import { coerceNumber, deleteDocsInChunks } from '@/lib/service-utils';
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

export const onPayrollUpdate = (callback: (records: Payroll[]) => void): () => void => {
    return onSnapshot(getPayrollCollection(), 
        (snapshot) => {
            callback(snapshot.docs.map(fromFirestore));
        },
        async (error) => {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: COLLECTIONS.PAYROLL,
                operation: 'list',
            }));
        }
    );
};

export const getPayrollYears = async (): Promise<number[]> => {
    const years = new Set<number>();
    try {
        const snapshot = await getDocs(getPayrollCollection());
        snapshot.docs.forEach(doc => {
            const data = doc.data();
            if (data.bsYear) {
                years.add(Number(data.bsYear));
            }
        });
    } catch (error) {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: COLLECTIONS.PAYROLL,
            operation: 'list',
        }));
    }
    return Array.from(years).sort((a, b) => b - a);
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

export const deletePayrollForMonth = async (bsYear: number, bsMonth: number): Promise<void> => {
    const { db } = getFirebase();
    const year = Number(bsYear); const month = Number(bsMonth);
    const collections = [COLLECTIONS.PAYROLL, 'bonus_ledger', 'behavior_ledger', 'behavior_analytics'];

    try {
        await deleteDoc(doc(db, 'analytics_reports', `${year}-${month}`));
    } catch (err: any) {
        // A missing analytics_reports doc is expected for most periods - only
        // surface a genuine permission problem, and don't let it block the
        // rest of the purge below.
        if (err?.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: 'analytics_reports',
                operation: 'delete',
            }));
        }
    }

    for (const collName of collections) {
        const q = query(collection(db, collName), where("bsYear", "==", year), where("bsMonth", "==", month));
        try {
            const snap = await getDocs(q);
            if (!snap.empty) {
                await deleteDocsInChunks(snap.docs.map(d => d.ref));
            }
        } catch (err: any) {
            if (err?.code === 'permission-denied') {
                errorEmitter.emit('permission-error', new FirestorePermissionError({
                    path: collName,
                    operation: 'write',
                }));
            }
            throw err;
        }
    }
};
