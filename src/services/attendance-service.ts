
import { db } from '@/lib/firebase';
import { collection, doc, writeBatch, onSnapshot, DocumentData, QueryDocumentSnapshot, getDocs, updateDoc, deleteDoc, query, where, getDoc } from 'firebase/firestore';
import type { AttendanceRecord, RawAttendanceRow, Payroll, Employee } from '@/lib/types';
import NepaliDate from 'nepali-date-converter';
import { format } from 'date-fns';
import { processAttendanceImport } from '@/lib/attendance';
import { addPayrollRecords } from './payroll-service';


const attendanceCollection = collection(db, 'attendance');

const fromFirestore = (snapshot: QueryDocumentSnapshot<DocumentData>): AttendanceRecord => {
    const data = snapshot.data();
    return {
        id: snapshot.id,
        date: data.date,
        bsDate: data.bsDate,
        employeeName: data.employeeName,
        onDuty: data.onDuty || null,
        offDuty: data.offDuty || null,
        clockIn: data.clockIn || null,
        clockOut: data.clockOut || null,
        status: data.status,
        grossHours: data.grossHours || 0,
        overtimeHours: data.overtimeHours || 0,
        regularHours: data.regularHours || 0,
        remarks: data.remarks || null,
        importedBy: data.importedBy,
        sourceSheet: data.sourceSheet,
    };
};

export const getAttendance = async (): Promise<AttendanceRecord[]> => {
    const snapshot = await getDocs(attendanceCollection);
    return snapshot.docs.map(fromFirestore);
};

export const addAttendanceAndPayrollRecords = async (
    rawRows: RawAttendanceRow[], 
    employees: Employee[],
    importedBy: string, 
    bsYear: number,
    bsMonth: number,
    onProgress: (progress: number) => void
): Promise<{ attendanceCount: number, payrollCount: number }> => {
    const CHUNK_SIZE = 400;
    
    const processedData = processAttendanceImport(rawRows, bsYear, bsMonth);
    
    // 1. Add Attendance Records
    const newAttendanceRecords = processedData
      .filter(p => p.dateADISO && !isNaN(new Date(p.dateADISO).getTime()))
      .map(p => ({
        date: p.dateADISO, bsDate: p.dateBS, employeeName: p.employeeName,
        onDuty: p.onDuty || null, offDuty: p.offDuty || null,
        clockIn: p.clockIn || null, clockOut: p.clockOut || null,
        status: p.normalizedStatus as any, grossHours: p.grossHours,
        overtimeHours: p.overtimeHours, regularHours: p.regularHours,
        remarks: p.calcRemarks, importedBy: importedBy, sourceSheet: p.sourceSheet,
    }));
    
    for (let i = 0; i < newAttendanceRecords.length; i += CHUNK_SIZE) {
        const chunk = newAttendanceRecords.slice(i, i + CHUNK_SIZE);
        const batch = writeBatch(db);
        chunk.forEach(record => {
            const docRef = doc(attendanceCollection);
            batch.set(docRef, record);
        });
        await batch.commit();
        onProgress(chunk.length); // Report progress for this chunk
    }
    
    // 2. Add Payroll Records
    const payrollRecords: Omit<Payroll, 'id'>[] = [];
    const createdPayrollEntries = new Set<string>(); // To avoid duplicates: 'employeeId-year-month'

    for (const row of processedData) { // Use processedData which has correct dates
        const employee = employees.find(e => e.name === row.employeeName);
        if (!employee) continue;

        const payrollKey = `${employee.id}-${bsYear}-${bsMonth}`;
        if (createdPayrollEntries.has(payrollKey)) continue;

        const netPaymentValue = row.netPayment;
        if (netPaymentValue === null || netPaymentValue === undefined || String(netPaymentValue).trim() === '') {
            continue; 
        }

        const netPayment = Number(netPaymentValue);
        if (isNaN(netPayment)) {
            continue;
        }


        payrollRecords.push({
            bsYear, bsMonth,
            employeeId: employee.id,
            employeeName: employee.name,
            totalHours: Number(row.totalHours) || 0,
            otHours: Number(row.otHours) || 0,
            regularHours: Number(row.regularHours) || 0,
            rate: Number(row.rate) || 0,
            regularPay: Number(row.regularPay) || 0,
            otPay: Number(row.otPay) || 0,
            totalPay: Number(row.totalPay) || 0,
            absentDays: Number(row.absentDays) || 0,
            deduction: Number(row.deduction) || 0,
            allowance: Number(row.allowance) || 0,
            bonus: Number(row.bonus) || 0,
            salaryTotal: Number(row.salaryTotal) || 0,
            tds: Number(row.tds) || 0,
            gross: Number(row.gross) || 0,
            advance: Number(row.advance) || 0,
            netPayment: netPayment,
            remark: row.payrollRemark || '',
            createdBy: importedBy,
            createdAt: new Date().toISOString(),
        });
        createdPayrollEntries.add(payrollKey);
    }

    if(payrollRecords.length > 0) {
        await addPayrollRecords(payrollRecords);
    }

    return { attendanceCount: newAttendanceRecords.length, payrollCount: payrollRecords.length };
};


export const updateAttendanceRecord = async (id: string, record: Partial<AttendanceRecord>): Promise<void> => {
    const recordDoc = doc(db, 'attendance', id);
    await updateDoc(recordDoc, record);
};

export const deleteAttendanceRecord = async (id: string): Promise<void> => {
    const recordDoc = doc(db, 'attendance', id);
    await deleteDoc(recordDoc);
};

export const deleteAttendanceForMonth = async (bsYear: number, bsMonth: number): Promise<void> => {
    const snapshot = await getDocs(attendanceCollection);
    const recordsToDelete = snapshot.docs.filter(doc => {
        const data = doc.data();
        if (data.date && !isNaN(new Date(data.date).getTime())) {
            const nepaliDate = new NepaliDate(new Date(data.date));
            return nepaliDate.getYear() === bsYear && nepaliDate.getMonth() === bsMonth;
        }
        return false;
    });

    if (recordsToDelete.length === 0) {
        console.log("No records to delete for the specified month.");
        return;
    }

    const CHUNK_SIZE = 400; // Use a safe chunk size of 400
    for (let i = 0; i < recordsToDelete.length; i += CHUNK_SIZE) {
        const chunk = recordsToDelete.slice(i, i + CHUNK_SIZE);
        const batch = writeBatch(db);
        chunk.forEach(doc => {
            batch.delete(doc.ref);
        });
        await batch.commit();
    }

    console.log(`Deleted ${recordsToDelete.length} records for ${bsYear}-${bsMonth + 1}.`);
};



export const onAttendanceUpdate = (callback: (records: AttendanceRecord[]) => void): () => void => {
    return onSnapshot(attendanceCollection, (snapshot) => {
        callback(snapshot.docs.map(fromFirestore));
    });
};

export const getAttendanceForMonth = async (bsYear: number, bsMonth: number): Promise<AttendanceRecord[]> => {
    const allRecords = await getAttendance();
    return allRecords.filter(r => {
        try {
            if (!r.date || isNaN(new Date(r.date).getTime())) return false;
            const nepaliDate = new NepaliDate(new Date(r.date));
            return nepaliDate.getYear() === bsYear && nepaliDate.getMonth() === bsMonth;
        } catch {
            return false;
        }
    });
};

export const getAttendanceYears = async (): Promise<number[]> => {
    const allRecords = await getAttendance();
    const years = new Set(allRecords.map(r => {
        try {
            if (!r.date || isNaN(new Date(r.date).getTime())) return null;
            return new NepaliDate(new Date(r.date)).getYear();
        } catch {
            return null;
        }
    }).filter(year => year !== null) as number[]);
    return Array.from(years).sort((a, b) => b - a);
};
