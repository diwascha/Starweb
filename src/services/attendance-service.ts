
import { db } from '@/lib/firebase';
import { collection, doc, writeBatch, onSnapshot, DocumentData, QueryDocumentSnapshot, getDocs, query, where, limit, getDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import type { AttendanceRecord, RawAttendanceRow, Payroll, Employee } from '@/lib/types';
import NepaliDate from 'nepali-date-converter';
import { format } from 'date-fns';
import { processAttendanceImport } from '@/lib/attendance';
import { addEmployee, getEmployees } from './employee-service';


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

export const getAttendance = async (forceFetch: boolean = false): Promise<AttendanceRecord[]> => {
    const isDesktop = process.env.TAURI_BUILD === 'true';
    if (isDesktop && !forceFetch) {
        return [];
    }
    const snapshot = await getDocs(attendanceCollection);
    return snapshot.docs.map(fromFirestore);
};

export const addAttendanceRecords = async (
    jsonData: any[][],
    existingEmployees: Employee[],
    importedBy: string, 
    bsYear: number,
    bsMonth: number,
    sourceSheetName: string,
    onProgress: (progress: number) => void
): Promise<{ attendanceCount: number, newEmployees: string[], skippedCount: number }> => {
    const CHUNK_SIZE = 400;
    
    const headerRow = jsonData[0];
    const dataRows = jsonData.slice(1);
    
    const nameIndex = headerRow.map(h => String(h).toLowerCase()).indexOf('name');
    if (nameIndex === -1) {
        throw new Error("Could not find 'name' column in the imported sheet.");
    }
    const nonEmptyRows = dataRows.filter(row => row.length > nameIndex && row[nameIndex] != null && String(row[nameIndex]).trim() !== '');

    // --- Phase 1: Pre-process to find and create new employees ---
    const existingEmployeeNames = new Set(existingEmployees.map(emp => emp.name.toLowerCase()));
    const uniqueNamesInSheet = new Set(nonEmptyRows.map(row => String(row[nameIndex]).trim()));
    const newEmployeeNames = new Set<string>();

    for (const name of uniqueNamesInSheet) {
        if (!existingEmployeeNames.has(name.toLowerCase())) {
            newEmployeeNames.add(name);
        }
    }

    if (newEmployeeNames.size > 0) {
        const creationPromises = Array.from(newEmployeeNames).map(name => {
            const now = new Date().toISOString();
            const newEmployee: Omit<Employee, 'id'> = {
                name: name,
                wageBasis: 'Monthly',
                wageAmount: 0,
                createdBy: importedBy,
                createdAt: now,
                joiningDate: now, 
                status: 'Working'
            };
            return addEmployee(newEmployee);
        });
        await Promise.all(creationPromises);
    }
    
    // --- Phase 2: Process all data now that employees exist ---
    const { processedData, skippedCount } = processAttendanceImport(jsonData, bsYear, bsMonth);

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
        status: p.status as any, 
        grossHours: p.regularHours + p.overtimeHours,
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

    return { attendanceCount: newAttendanceRecords.length, newEmployees: Array.from(newEmployeeNames), skippedCount };
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
    const payrollCollection = collection(db, 'payroll');
    const qPayroll = query(payrollCollection, where("bsYear", "==", bsYear), where("bsMonth", "==", bsMonth));
    const payrollSnapshot = await getDocs(qPayroll);

    const attendanceSnapshot = await getDocs(attendanceCollection);
    const recordsToDelete = attendanceSnapshot.docs.filter(doc => {
        const data = doc.data();
        if (data.date && !isNaN(new Date(data.date).getTime())) {
            try {
                const nepaliDate = new NepaliDate(new Date(data.date));
                return nepaliDate.getYear() === bsYear && nepaliDate.getMonth() === bsMonth;
            } catch {
                return false;
            }
        }
        return false;
    });

    const allDocsToDelete = [...payrollSnapshot.docs, ...recordsToDelete];

    if (allDocsToDelete.length === 0) {
        return;
    }

    const CHUNK_SIZE = 400;
    for (let i = 0; i < allDocsToDelete.length; i += CHUNK_SIZE) {
        const chunk = allDocsToDelete.slice(i, i + CHUNK_SIZE);
        const batch = writeBatch(db);
        chunk.forEach(doc => {
            batch.delete(doc.ref);
        });
        await batch.commit();
    }
};

export const deleteAllAttendance = async (): Promise<void> => {
    const attendanceSnapshot = await getDocs(attendanceCollection);
    const payrollSnapshot = await getDocs(collection(db, 'payroll'));

    const allDocsToDelete = [...attendanceSnapshot.docs, ...payrollSnapshot.docs];

    if (allDocsToDelete.length === 0) {
        return;
    }

    const CHUNK_SIZE = 400;
    for (let i = 0; i < allDocsToDelete.length; i += CHUNK_SIZE) {
        const chunk = allDocsToDelete.slice(i, i + CHUNK_SIZE);
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
    const allRecords = await getAttendance(true);
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
    const allRecords = await getAttendance(true);
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
