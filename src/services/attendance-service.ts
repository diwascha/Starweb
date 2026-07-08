/**
 * @fileOverview Attendance service handling raw machine logs and calculated labor metrics.
 */

import { getFirebase } from '@/lib/firebase';
import { 
    collection, 
    doc, 
    writeBatch, 
    onSnapshot, 
    DocumentData, 
    QueryDocumentSnapshot, 
    getDocs, 
    query, 
    where, 
    limit, 
    getDoc, 
    updateDoc, 
    deleteDoc, 
    orderBy,
    setDoc
} from 'firebase/firestore';
import { isEqual, startOfDay, isWithinInterval } from 'date-fns';
import type { AttendanceRecord, RawMachineLog, Employee, HrConfig } from '@/lib/types';
import NepaliDate from 'nepali-date-converter';
import { processAttendanceImport } from '@/lib/attendance';
import { getEmployees } from './employee-service';
import { getHolidays, getLeaveRequests } from './hr-admin-service';
import { COLLECTIONS } from '@/lib/constants';
import { createTimestamp, logServiceError } from '@/lib/service-utils';
import { getSetting } from './settings-service';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError, type SecurityRuleContext } from '@/firebase/errors';

const getAttendanceCollection = () => {
    const { db } = getFirebase();
    return collection(db, COLLECTIONS.ATTENDANCE);
};

const getRawLogsCollection = () => {
    const { db } = getFirebase();
    return collection(db, 'raw_machine_logs');
};

const fromFirestoreRecord = (snapshot: QueryDocumentSnapshot<DocumentData>): AttendanceRecord => {
    const data = snapshot.data();
    return {
        id: snapshot.id,
        date: data.date,
        bsDate: data.bsDate,
        bsYear: data.bsYear,
        bsMonth: data.bsMonth,
        employeeName: String(data.employeeName || ''),
        employeeId: data.employeeId,
        onDuty: data.onDuty || null,
        offDuty: data.offDuty || null,
        clockIn: data.clockIn || null,
        clockOut: data.clockOut || null,
        status: String(data.status || ''),
        grossHours: Number(data.grossHours) || 0,
        overtimeHours: Number(data.overtimeHours) || 0,
        regularHours: Number(data.regularHours) || 0,
        remarks: data.remarks || null,
        calculatedAt: data.calculatedAt,
        calculatedBy: data.calculatedBy,
        sourceLogId: data.sourceLogId
    };
};

const fromFirestoreLog = (snapshot: QueryDocumentSnapshot<DocumentData>): RawMachineLog => {
    const data = snapshot.data();
    return {
        id: snapshot.id,
        date: data.date,
        dateBS: data.dateBS || '',
        bsYear: data.bsYear,
        bsMonth: data.bsMonth,
        employeeName: data.employeeName,
        onDuty: data.onDuty,
        offDuty: data.offDuty,
        clockIn: data.clockIn,
        clockOut: data.clockOut,
        statusFromMachine: data.statusFromMachine,
        regularHoursFromMachine: data.regularHoursFromMachine,
        overtimeHoursFromMachine: data.overtimeHoursFromMachine,
        remarks: data.remarks,
        importId: data.importId,
        importedAt: data.importedAt,
        importedBy: data.importedBy,
        sourceSheet: data.sourceSheet,
        rawPayload: data.rawPayload
    };
};

// --- Raw Log Management ---

export const onRawLogsUpdate = (callback: (logs: RawMachineLog[]) => void): () => void => {
    const q = query(getRawLogsCollection(), orderBy('importedAt', 'desc'));
    return onSnapshot(q, (snapshot) => {
        callback(snapshot.docs.map(fromFirestoreLog));
    }, (error) => {
        logServiceError('onRawLogsUpdate', error);
    });
};

export const addRawMachineLogs = async (
    jsonData: any[][],
    importedBy: string, 
    sourceSheetName: string,
    onProgress: (progress: number) => void
): Promise<{ logCount: number }> => {
    const { db } = getFirebase();
    const importId = generateLocalId();
    const now = createTimestamp();
    const CHUNK_SIZE = 400;

    try {
        const { processedData } = processAttendanceImport(jsonData);

        if (processedData.length === 0) return { logCount: 0 };

        const logs: Omit<RawMachineLog, 'id'>[] = processedData.map(p => ({
            date: p.dateADISO,
            dateBS: p.dateBS,
            bsYear: p.bsYear,
            bsMonth: p.bsMonth,
            employeeName: p.employeeName,
            onDuty: p.onDuty,
            offDuty: p.offDuty,
            clockIn: p.clockIn,
            clockOut: p.clockOut,
            statusFromMachine: p.status,
            regularHoursFromMachine: p.regularHours,
            overtimeHoursFromMachine: p.overtimeHours,
            remarks: p.remarks,
            importId,
            importedAt: now,
            importedBy,
            sourceSheet: sourceSheetName,
            rawPayload: p.rawImportData
        }));

        let processedCount = 0;
        for (let i = 0; i < logs.length; i += CHUNK_SIZE) {
            const chunk = logs.slice(i, i + CHUNK_SIZE);
            const batch = writeBatch(db);
            chunk.forEach(log => {
                const docRef = doc(getRawLogsCollection());
                batch.set(docRef, log);
            });
            await batch.commit();
            processedCount += chunk.length;
            onProgress(processedCount);
        }

        return { logCount: logs.length };
    } catch (error) {
        logServiceError('addRawMachineLogs', error);
        throw error;
    }
};

export const deleteRawLog = async (id: string) => {
    await deleteDoc(doc(getRawLogsCollection(), id));
};

export const deleteRawLogsForMonth = async (year: number, month: number) => {
    const { db } = getFirebase();
    const q = query(getRawLogsCollection(), where('bsYear', '==', year), where('bsMonth', '==', month));
    const snap = await getDocs(q);
    const batch = writeBatch(db);
    snap.forEach(d => batch.delete(d.ref));
    await batch.commit();
};

export const deleteAllRawLogs = async (): Promise<void> => {
    const { db } = getFirebase();
    const snap = await getDocs(getRawLogsCollection());
    
    if (snap.empty) return;

    const CHUNK_SIZE = 400;
    const docs = snap.docs;

    for (let i = 0; i < docs.length; i += CHUNK_SIZE) {
        const chunk = docs.slice(i, i + CHUNK_SIZE);
        const batch = writeBatch(db);
        chunk.forEach(d => batch.delete(d.ref));
        await batch.commit();
    }
};

// --- Hourly Calculation Logic ---

export const runHourlyCalculation = async (year: number, month: number, calculatedBy: string): Promise<{ processed: number }> => {
    const { db } = getFirebase();
    const configSetting = await getSetting('hr_config');
    const config = configSetting?.value as HrConfig;
    if (!config) throw new Error("HR Operational Rules not found. Please configure them in HR Office.");

    const qRaw = query(getRawLogsCollection(), where('bsYear', '==', year), where('bsMonth', '==', month));
    const rawSnap = await getDocs(qRaw);
    if (rawSnap.empty) throw new Error("No raw machine logs found for selected period.");

    const employees = await getEmployees();
    const employeeMap = new Map(employees.map(e => [e.name.toLowerCase(), e]));

    const holidays = await getHolidays();
    const leaveRequests = await getLeaveRequests();
    const approvedLeaves = leaveRequests.filter(l => l.status === 'Approved');

    const qProcessed = query(getAttendanceCollection(), where('bsYear', '==', year), where('bsMonth', '==', month));
    const processedSnap = await getDocs(qProcessed);
    if (!processedSnap.empty) {
        const deleteBatch = writeBatch(db);
        processedSnap.forEach(d => deleteBatch.delete(d.ref));
        await deleteBatch.commit();
    }

    const results: Omit<AttendanceRecord, 'id'>[] = [];
    const now = createTimestamp();

    rawSnap.forEach(docSnap => {
        const log = fromFirestoreLog(docSnap as QueryDocumentSnapshot<DocumentData>);
        const employee = employeeMap.get(log.employeeName.toLowerCase());
        
        if (employee) {
            const logDate = startOfDay(new Date(log.date));
            const holiday = holidays.find(h => isEqual(startOfDay(new Date(h.date)), logDate));
            const leave = approvedLeaves.find(l => 
                l.employeeId === employee.id && 
                isWithinInterval(logDate, { 
                    start: startOfDay(new Date(l.startDate)), 
                    end: startOfDay(new Date(l.endDate)) 
                })
            );

            let reg = log.regularHoursFromMachine;
            let ot = log.overtimeHoursFromMachine;
            let finalStatus = log.statusFromMachine;
            let finalRemarks = log.remarks;

            if (holiday) {
                finalStatus = 'Public Holiday';
                finalRemarks = `Public Holiday: ${holiday.name}`;
                reg = config.hours.baseDayHours;
            } else if (leave) {
                finalStatus = 'Leave';
                finalRemarks = `${leave.leaveType} Leave: ${leave.reason}`;
            } else if (logDate.getDay() === 6) {
                finalStatus = 'Saturday';
                finalRemarks = 'Weekly Off (Saturday)';
                reg = config.hours.baseDayHours;
            } else if (reg === 0 && (log.statusFromMachine === 'Present' || log.statusFromMachine === 'EXTRAOK')) {
                reg = config.hours.baseDayHours;
            }

            results.push({
                date: log.date,
                bsDate: new NepaliDate(new Date(log.date)).format('YYYY/MM/DD'),
                bsYear: year,
                bsMonth: month,
                employeeName: employee.name,
                employeeId: employee.id,
                onDuty: log.onDuty,
                offDuty: log.offDuty,
                clockIn: log.clockIn,
                clockOut: log.clockOut,
                status: finalStatus,
                regularHours: reg,
                overtimeHours: ot,
                grossHours: reg + ot,
                calculatedAt: now,
                calculatedBy: calculatedBy,
                remarks: finalRemarks,
                sourceLogId: log.id
            });
        }
    });

    const writeChunkSize = 400;
    for (let i = 0; i < results.length; i += writeChunkSize) {
        const chunk = results.slice(i, i + writeChunkSize);
        const batch = writeBatch(db);
        chunk.forEach(record => {
            const docRef = doc(getAttendanceCollection());
            batch.set(docRef, record);
        });
        await batch.commit();
    }

    return { processed: results.length };
};

// --- Attendance Registry (Processed) ---

export const onAttendanceUpdate = (callback: (records: AttendanceRecord[]) => void): () => void => {
    return onSnapshot(getAttendanceCollection(), (snapshot) => {
        callback(snapshot.docs.map(fromFirestoreRecord));
    }, (error) => {
        logServiceError('onAttendanceUpdate', error);
    });
};

export const getAttendanceForMonth = async (bsYear: number, bsMonth: number): Promise<AttendanceRecord[]> => {
    const q = query(getAttendanceCollection(), where("bsYear", "==", bsYear), where("bsMonth", "==", bsMonth));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(fromFirestoreRecord);
};

export const deleteAttendanceRecord = async (id: string) => {
    await deleteDoc(doc(getAttendanceCollection(), id));
};

export const getAttendanceYears = async (): Promise<number[]> => {
    const snapshot = await getDocs(getAttendanceCollection());
    const years = new Set(snapshot.docs.map(d => d.data().bsYear as number));
    return Array.from(years).sort((a, b) => b - a);
};

export const deleteAllAttendance = async (): Promise<void> => {
    const { db } = getFirebase();
    const snaps = await Promise.all([
        getDocs(getAttendanceCollection()),
        getDocs(getRawLogsCollection()),
        getDocs(collection(db, COLLECTIONS.PAYROLL))
    ]);

    const batch = writeBatch(db);
    snaps.forEach(snap => snap.forEach(d => batch.delete(d.ref)));
    await batch.commit();
};

export const updateAttendanceRecord = async (id: string, updates: Partial<AttendanceRecord>) => {
    await updateDoc(doc(getAttendanceCollection(), id), updates);
};

export const deleteAttendanceForMonth = async (year: number, month: number) => {
    const { db } = getFirebase();
    const q = query(getAttendanceCollection(), where('bsYear', '==', year), where('bsMonth', '==', month));
    const snap = await getDocs(q);
    const batch = writeBatch(db);
    snap.forEach(d => batch.delete(d.ref));
    await batch.commit();
};

function generateLocalId(): string {
    return Math.random().toString(36).substring(2, 11);
}
