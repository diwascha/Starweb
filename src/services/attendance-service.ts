
import { getFirebase } from '@/lib/firebase';
import { collection, doc, writeBatch, onSnapshot, DocumentData, QueryDocumentSnapshot, getDocs, query, where, limit, getDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import type { AttendanceRecord, RawAttendanceRow, Employee } from '@/lib/types';
import NepaliDate from 'nepali-date-converter';
import { processAttendanceImport } from '@/lib/attendance';
import { addEmployee } from './employee-service';
import { COLLECTIONS } from '@/lib/constants';
import { createTimestamp, logServiceError } from '@/lib/service-utils';

const getAttendanceCollection = () => {
    const { db } = getFirebase();
    return collection(db, COLLECTIONS.ATTENDANCE);
};

const getPayrollCollection = () => {
    const { db } = getFirebase();
    return collection(db, COLLECTIONS.PAYROLL);
}

const fromFirestore = (snapshot: QueryDocumentSnapshot<DocumentData>): AttendanceRecord => {
    const data = snapshot.data();
    return {
        id: snapshot.id,
        date: data.date,
        bsDate: data.bsDate,
        employeeName: String(data.employeeName || ''),
        onDuty: data.onDuty || null,
        offDuty: data.offDuty || null,
        clockIn: data.clockIn || null,
        clockOut: data.clockOut || null,
        status: String(data.status || ''),
        grossHours: Number(data.grossHours) || 0,
        overtimeHours: Number(data.overtimeHours) || 0,
        regularHours: Number(data.regularHours) || 0,
        remarks: data.remarks || null,
        importedBy: data.importedBy,
        sourceSheet: data.sourceSheet,
        rawImportData: data.rawImportData,
    };
};

export const getAttendance = async (): Promise<AttendanceRecord[]> => {
    try {
        const snapshot = await getDocs(getAttendanceCollection());
        return snapshot.docs.map(fromFirestore);
    } catch (error) {
        logServiceError('getAttendance', error);
        throw error;
    }
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
    const { db } = getFirebase();
    const CHUNK_SIZE = 400;
    
    try {
        const headerRow = jsonData[0];
        const dataRows = jsonData.slice(1);
        
        const nameIndex = headerRow.map(h => String(h).toLowerCase()).indexOf('name');
        if (nameIndex === -1) {
            throw new Error("Could not find 'name' column in the imported sheet.");
        }
        const nonEmptyRows = dataRows.filter(row => row.length > nameIndex && row[nameIndex] != null && String(row[nameIndex]).trim() !== '');

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
                const now = createTimestamp();
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
            status: p.status, 
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
                const docRef = doc(getAttendanceCollection());
                batch.set(docRef, record);
            });
            await batch.commit();
            processedCount += chunk.length;
            onProgress(processedCount);
        }

        return { attendanceCount: newAttendanceRecords.length, newEmployees: Array.from(newEmployeeNames), skippedCount };
    } catch (error) {
        logServiceError('addAttendanceRecords', error);
        throw error;
    }
};


export const updateAttendanceRecord = async (id: string, record: Partial<AttendanceRecord>): Promise<void> => {
    try {
        const recordDoc = doc(getAttendanceCollection(), id);
        await updateDoc(recordDoc, record);
    } catch (error) {
        logServiceError('updateAttendanceRecord', error);
        throw error;
    }
};

export const deleteAttendanceRecord = async (id: string): Promise<void> => {
    try {
        const recordDoc = doc(getAttendanceCollection(), id);
        await deleteDoc(recordDoc);
    } catch (error) {
        logServiceError('deleteAttendanceRecord', error);
        throw error;
    }
};

export const deleteAttendanceForMonth = async (bsYear: number, bsMonth: number): Promise<void> => {
    const { db } = getFirebase();
    try {
        const payrollCollection = getPayrollCollection();
        const attendanceCollection = getAttendanceCollection();

        const qPayroll = query(payrollCollection, where("bsYear", "==", bsYear), where("bsMonth", "==", bsMonth));
        const payrollSnapshot = await getDocs(qPayroll);

        const attendanceSnapshot = await getDocs(attendanceCollection);
        const recordsToDelete = attendanceSnapshot.docs.filter(doc => {
            const data = doc.data();
            if (data.date) {
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

        if (allDocsToDelete.length === 0) return;

        const CHUNK_SIZE = 400;
        for (let i = 0; i < allDocsToDelete.length; i += CHUNK_SIZE) {
            const chunk = allDocsToDelete.slice(i, i + CHUNK_SIZE);
            const batch = writeBatch(db);
            chunk.forEach(doc => {
                batch.delete(doc.ref);
            });
            await batch.commit();
        }
    } catch (error) {
        logServiceError('deleteAttendanceForMonth', error);
        throw error;
    }
};

export const deleteAllAttendance = async (): Promise<void> => {
    const { db } = getFirebase();
    try {
        const attendanceSnapshot = await getDocs(getAttendanceCollection());
        const payrollSnapshot = await getDocs(getPayrollCollection());

        const allDocsToDelete = [...attendanceSnapshot.docs, ...payrollSnapshot.docs];

        if (allDocsToDelete.length === 0) return;

        const CHUNK_SIZE = 400;
        for (let i = 0; i < allDocsToDelete.length; i += CHUNK_SIZE) {
            const chunk = allDocsToDelete.slice(i, i + CHUNK_SIZE);
            const batch = writeBatch(db);
            chunk.forEach(doc => {
                batch.delete(doc.ref);
            });
            await batch.commit();
        }
    } catch (error) {
        logServiceError('deleteAllAttendance', error);
        throw error;
    }
};

export const onAttendanceUpdate = (callback: (records: AttendanceRecord[]) => void): () => void => {
    return onSnapshot(getAttendanceCollection(), 
        (snapshot) => {
            callback(snapshot.docs.map(fromFirestore));
        },
        (error) => {
            logServiceError('onAttendanceUpdate', error);
        }
    );
};

export const getAttendanceForMonth = async (bsYear: number, bsMonth: number): Promise<AttendanceRecord[]> => {
    try {
        const allRecords = await getAttendance();
        return allRecords.filter(r => {
            try {
                if (!r.date) return false;
                const nepaliDate = new NepaliDate(new Date(r.date));
                return nepaliDate.getYear() === bsYear && nepaliDate.getMonth() === bsMonth;
            } catch {
                return false;
            }
        });
    } catch (error) {
        logServiceError('getAttendanceForMonth', error);
        return [];
    }
};

export const getAttendanceYears = async (): Promise<number[]> => {
    try {
        const allRecords = await getAttendance();
        const years = new Set(allRecords.map(r => {
            try {
                if (!r.date) return null;
                return new NepaliDate(new Date(r.date)).getYear();
            } catch {
                return null;
            }
        }).filter(year => year !== null) as number[]);
        return Array.from(years).sort((a, b) => b - a);
    } catch (error) {
        logServiceError('getAttendanceYears', error);
        return [];
    }
};
