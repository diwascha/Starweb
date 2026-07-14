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
    deleteDoc, 
    writeBatch 
} from 'firebase/firestore';
import type { Payroll } from '@/lib/types';
import { COLLECTIONS } from '@/lib/constants';
import { logServiceError, coerceNumber } from '@/lib/service-utils';

export const getPayrollCollection = () => {
    const { db } = getFirebase();
    return collection(db, COLLECTIONS.PAYROLL);
}

export const fromFirestore = (snapshot: QueryDocumentSnapshot<DocumentData> | DocumentData): Payroll => {
    const data = snapshot.data();
    return {
        id: snapshot.id, bsYear: data.bsYear, bsMonth: data.bsMonth, employeeId: data.employeeId, employeeName: String(data.employeeName || ''),
        totalHours: coerceNumber(data.totalHours), otHours: coerceNumber(data.otHours), regularHours: coerceNumber(data.regularHours),
        rate: coerceNumber(data.rate), regularPay: coerceNumber(data.regularPay), otPay: coerceNumber(data.otPay), allowance: coerceNumber(data.allowance),
        totalPay: coerceNumber(data.totalPay), absentDays: coerceNumber(data.absentDays), deduction: coerceNumber(data.deduction), tds: coerceNumber(data.tds),
        salaryTotal: coerceNumber(data.salaryTotal), advance: coerceNumber(data.advance), netPayment: coerceNumber(data.netPayment),
        remark: String(data.remark || ''), createdBy: data.createdBy, createdAt: data.createdAt,
    };
};

export const onPayrollUpdate = (callback: (records: Payroll[]) => void): () => void => {
    return onSnapshot(getPayrollCollection(), (snapshot) => {
        callback(snapshot.docs.map(fromFirestore));
    }, (error) => {
        logServiceError('onPayrollUpdate', error);
    });
};

/**
 * Scans the payroll registry to discover all unique years for which financial records exist.
 * 
 * @returns Promise resolving to a sorted array of BS years (descending).
 */
export const getPayrollYears = async (): Promise<number[]> => {
    const { db } = getFirebase();
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
        logServiceError('getPayrollYears', error);
    }
    return Array.from(years).sort((a, b) => b - a);
};

export const getPayrollForEmployee = async (employeeId: string, bsYear: number, bsMonth: number): Promise<Payroll | null> => {
    const docSnap = await getDocs(query(getPayrollCollection(), where("employeeId", "==", employeeId), where("bsYear", "==", bsYear), where("bsMonth", "==", bsMonth), limit(1)));
    return docSnap.empty ? null : fromFirestore(docSnap.docs[0]);
};

export const deletePayrollForMonth = async (bsYear: number, bsMonth: number): Promise<void> => {
    const { db } = getFirebase();
    const year = Number(bsYear); const month = Number(bsMonth);
    const collections = [COLLECTIONS.PAYROLL, 'bonus_ledger', 'behavior_ledger', 'behavior_analytics'];
    await deleteDoc(doc(db, 'analytics_reports', `${year}-${month}`));
    for (const collName of collections) {
        const snap = await getDocs(query(collection(db, collName), where("bsYear", "==", year), where("bsMonth", "==", month)));
        if (!snap.empty) {
            const batch = writeBatch(db);
            snap.docs.forEach(d => batch.delete(d.ref));
            await batch.commit();
        }
    }
};
