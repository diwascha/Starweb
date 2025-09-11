

import { db } from '@/lib/firebase';
import { collection, doc, writeBatch, onSnapshot, DocumentData, QueryDocumentSnapshot, getDocs, updateDoc, deleteDoc, query, where, getDoc } from 'firebase/firestore';
import type { AttendanceRecord, RawAttendanceRow, Payroll, Employee } from '@/lib/types';
import NepaliDate from 'nepali-date-converter';
import { format } from 'date-fns';
import { processAttendanceImport } from '@/lib/attendance';
import { addPayrollRecords, deletePayrollForMonth } from './payroll-service';


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
        rawImportData: data.rawImportData,
    };
};

export const getAttendance = async (): Promise<AttendanceRecord[]> => {
    const snapshot = await getDocs(attendanceCollection);
    return snapshot.docs.map(fromFirestore);
};

export const addAttendanceAndPayrollRecords = async (
    jsonData: any[][],
    employees: Employee[],
    importedBy: string, 
    bsYear: number,
    bsMonth: number,
    sourceSheetName: string,
    onProgress: (progress: number) => void
): Promise<{ attendanceCount: number, payrollCount: number, newEmployees: string[], skippedCount: number }> => {
    const CHUNK_SIZE = 400;
    
    const headerRow = jsonData[0];
    const dataRows = jsonData.slice(1);
    
    const nameIndex = headerRow.map(h => String(h).toLowerCase()).indexOf('name');
    const nonEmptyRows = dataRows.filter(row => row.length > nameIndex && row[nameIndex] != null && String(row[nameIndex]).trim() !== '');


    const { processedData, newEmployees, skippedCount } = await processAttendanceImport(headerRow, nonEmptyRows, bsYear, bsMonth, employees, importedBy);

    // 1. Add Attendance Records
    const newAttendanceRecords = processedData
      .filter(p => p.dateADISO)
      .map(p => ({
        date: p.dateADISO, 
        bsDate: p.dateBS, 
        employeeName: p.employeeName,
        onDuty: p.onDuty || null, 
        offDuty: p.offDuty || null,
        clockIn: p.clockIn || null, 
        clockOut: p.clockOut || null,
        status: p.normalizedStatus as any, 
        grossHours: p.grossHours,
        overtimeHours: p.overtimeHours, 
        regularHours: p.regularHours,
        remarks: p.remarks || null, 
        importedBy: importedBy, 
        sourceSheet: sourceSheetName || null,
        rawImportData: p.rawImportData,
    }));
    
    let processedCount = 0;
    for (let i = 0; i < newAttendanceRecords.length; i += CHUNK_SIZE) {
        const chunk = newAttendanceRecords.slice(i, i + CHUNK_SIZE);
        const batch = writeBatch(db);
        chunk.forEach(record => {
            const docRef = doc(attendanceCollection);
            batch.set(docRef, record);
        });
        await batch.commit();
        processedCount += chunk.length;
        onProgress(processedCount);
    }
    
    // 2. Add Payroll Records
    const payrollRecords: Omit<Payroll, 'id'>[] = [];
    const allEmployees = [...employees, ...newEmployees.map(name => ({ id: '', name, wageBasis: 'Monthly', wageAmount: 0, createdBy: importedBy, createdAt: new Date().toISOString(), status: 'Working' } as Employee))];
    const employeeDataMap = new Map<string, RawAttendanceRow[]>();

    // Group processed data by employee name
    for (const row of processedData) {
        if (!employeeDataMap.has(row.employeeName)) {
            employeeDataMap.set(row.employeeName, []);
        }
        employeeDataMap.get(row.employeeName)!.push(row);
    }

    for (const [employeeName, employeeRows] of employeeDataMap.entries()) {
        const employee = allEmployees.find(e => e.name === employeeName);
        if (!employee) continue;
        
        // Find the first row for this employee that contains payroll data
        const payrollDataSource = employeeRows.find(r => 
            r.netPayment !== null && r.netPayment !== undefined && String(r.netPayment).trim() !== ''
        );
        
        if (payrollDataSource) {
            payrollRecords.push({
                bsYear, 
                bsMonth,
                employeeId: employee.id,
                employeeName: employee.name,
                totalHours: (Number(payrollDataSource.normalHours) || 0) + (Number(payrollDataSource.otHours) || 0),
                otHours: Number(payrollDataSource.otHours) || 0,
                regularHours: Number(payrollDataSource.normalHours) || 0,
                rate: Number(payrollDataSource.rate) || 0,
                regularPay: Number(payrollDataSource.regularPay) || 0,
                otPay: Number(payrollDataSource.otPay) || 0,
                totalPay: Number(payrollDataSource.totalPay) || 0,
                absentDays: Number(payrollDataSource.absentDays) || 0,
                deduction: Number(payrollDataSource.deduction) || 0,
                allowance: Number(payrollDataSource.allowance) || 0,
                bonus: Number(payrollDataSource.bonus) || 0,
                salaryTotal: Number(payrollDataSource.salaryTotal) || 0,
                tds: Number(payrollDataSource.tds) || 0,
                gross: Number(payrollDataSource.gross) || 0,
                advance: Number(payrollDataSource.advance) || 0,
                netPayment: Number(payrollDataSource.netPayment) || 0,
                remark: payrollDataSource.payrollRemark || '',
                createdBy: importedBy,
                createdAt: new Date().toISOString(),
                rawImportData: payrollDataSource.rawImportData,
            });
        }
    }


    if(payrollRecords.length > 0) {
        await addPayrollRecords(payrollRecords);
    }

    return { attendanceCount: newAttendanceRecords.length, payrollCount: payrollRecords.length, newEmployees: Array.from(newEmployees), skippedCount };
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
    await deletePayrollForMonth(bsYear, bsMonth);

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
        return;
    }

    const CHUNK_SIZE = 400;
    for (let i = 0; i < recordsToDelete.length; i += CHUNK_SIZE) {
        const chunk = recordsToDelete.slice(i, i + CHUNK_SIZE);
        const batch = writeBatch(db);
        chunk.forEach(doc => {
            batch.delete(doc.ref);
        });
        await batch.commit();
    }
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
