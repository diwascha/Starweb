
import { db } from '@/lib/firebase';
import { collection, doc, writeBatch, onSnapshot, DocumentData, QueryDocumentSnapshot, getDocs, query, where, limit, getDoc } from 'firebase/firestore';
import type { Payroll } from '@/lib/types';
import NepaliDate from 'nepali-date-converter';

const payrollCollection = collection(db, 'payroll');

const fromFirestore = (snapshot: QueryDocumentSnapshot<DocumentData> | DocumentData): Payroll => {
    const data = snapshot.data();
    return {
        id: snapshot.id,
        bsYear: data.bsYear,
        bsMonth: data.bsMonth,
        employeeId: data.employeeId,
        employeeName: data.employeeName,
        totalHours: data.totalHours,
        otHours: data.otHours,
        regularHours: data.regularHours,
        rate: data.rate,
        regularPay: data.regularPay,
        otPay: data.otPay,
        totalPay: data.totalPay,
        absentDays: data.absentDays,
        deduction: data.deduction,
        allowance: data.allowance,
        bonus: data.bonus,
        salaryTotal: data.salaryTotal,
        tds: data.tds,
        gross: data.gross,
        advance: data.advance,
        netPayment: data.netPayment,
        remark: data.remark,
        createdBy: data.createdBy,
        createdAt: data.createdAt,
    };
};

export const addPayrollRecords = async (records: Omit<Payroll, 'id'>[]): Promise<void> => {
    const CHUNK_SIZE = 400;
    for (let i = 0; i < records.length; i += CHUNK_SIZE) {
        const chunk = records.slice(i, i + CHUNK_SIZE);
        const batch = writeBatch(db);
        chunk.forEach(record => {
            const docRef = doc(payrollCollection);
            batch.set(docRef, record);
        });
        await batch.commit();
    }
};

export const onPayrollUpdate = (callback: (records: Payroll[]) => void): () => void => {
    return onSnapshot(payrollCollection, (snapshot) => {
        callback(snapshot.docs.map(fromFirestore));
    });
};

export const getPayrollForEmployee = async (employeeId: string, bsYear: number, bsMonth: number): Promise<Payroll | null> => {
    const q = query(payrollCollection, 
        where("employeeId", "==", employeeId),
        where("bsYear", "==", bsYear),
        where("bsMonth", "==", bsMonth),
        limit(1)
    );
    const snapshot = await getDocs(q);
    if (snapshot.empty) {
        return null;
    }
    return fromFirestore(snapshot.docs[0]);
};

export const getPayrollYears = async (): Promise<number[]> => {
    const allRecords = await getDocs(payrollCollection).then(snap => snap.docs.map(d => d.data()));
    const years = new Set(allRecords.map(r => r.bsYear) as number[]);
    return Array.from(years).sort((a, b) => b - a);
};
