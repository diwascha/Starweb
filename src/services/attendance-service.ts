
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
import { isEqual, startOfDay, isWithinInterval, format } from 'date-fns';
import type { AttendanceRecord, RawMachineLog, Employee, HrConfig, HrShift } from '@/lib/types';
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
        sourceLogId: data.sourceLogId,
        rowIndex: data.rowIndex,
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
        rawPayload: data.rawPayload,
        rowIndex: data.rowIndex,
        isManual: !!data.isManual,
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

/**
 * Intelligent raw log importer with duplicate detection, override capabilities,
 * and automatic employee onboarding.
 */
export const addRawMachineLogs = async (
    jsonData: any[][],
    importedBy: string, 
    sourceSheetName: string,
    onProgress: (progress: number, total: number) => void,
    options: { overwrite: boolean } = { overwrite: false }
): Promise<{ createdCount: number, updatedCount: number, skippedCount: number, newEmployeesCount: number }> => {
    const { db } = getFirebase();
    const importId = `imp-${Date.now()}`;
    const now = createTimestamp();
    const CHUNK_SIZE = 400;

    try {
        const { processedData } = processAttendanceImport(jsonData);
        if (processedData.length === 0) return { createdCount: 0, updatedCount: 0, skippedCount: 0, newEmployeesCount: 0 };

        // 1. Handle Automatic Employee Onboarding
        const employees = await getEmployees();
        const existingEmpNames = new Set(employees.map(e => e.name.toLowerCase().trim()));
        const uniqueNamesInSheet = Array.from(new Set(processedData.map(p => p.employeeName.trim()))).filter(n => n.length > 0);
        
        let newEmployeesCount = 0;
        const employeeBatch = writeBatch(db);
        
        for (const name of uniqueNamesInSheet) {
            if (!existingEmpNames.has(name.toLowerCase())) {
                const empRef = doc(collection(db, COLLECTIONS.EMPLOYEES));
                const newEmpData: Omit<Employee, 'id'> = {
                    name: name,
                    status: 'Working',
                    wageBasis: 'Monthly',
                    wageAmount: 0,
                    mobileNumber: 'Not Provided',
                    createdBy: importedBy,
                    createdAt: now,
                };
                employeeBatch.set(empRef, newEmpData);
                newEmployeesCount++;
            }
        }
        
        if (newEmployeesCount > 0) {
            await employeeBatch.commit();
        }

        // 2. Fetch System Default Shift for fallback
        const shiftSnap = await getDocs(collection(db, 'hr_shifts'));
        const allShifts = shiftSnap.docs.map(d => ({ id: d.id, ...d.data() } as HrShift));
        const defaultShift = allShifts.find(s => s.isDefault) || allShifts[0];

        // 3. Determine the scope (which periods are being imported)
        const periods = new Set<string>();
        processedData.forEach(p => periods.add(`${p.bsYear}-${p.bsMonth}`));
        
        // 4. Fetch existing logs in those periods to check for duplicates
        const existingMap = new Map<string, RawMachineLog>();
        for (const period of Array.from(periods)) {
            const [y, m] = period.split('-').map(Number);
            const q = query(getRawLogsCollection(), where('bsYear', '==', y), where('bsMonth', '==', m));
            const snap = await getDocs(q);
            snap.forEach(d => {
                const log = fromFirestoreLog(d as any);
                const dateKey = format(new Date(log.date), 'yyyy-MM-dd');
                const key = `${log.employeeName.toLowerCase().replace(/\s+/g, '_')}_${dateKey}`;
                existingMap.set(key, log);
            });
        }

        let createdCount = 0;
        let updatedCount = 0;
        let skippedCount = 0;

        const operations: { ref: any, data: any, op: 'set' | 'update' | 'skip' }[] = [];

        processedData.forEach(p => {
            const dateKey = format(new Date(p.dateADISO), 'yyyy-MM-dd');
            const compositeKey = `${p.employeeName.toLowerCase().replace(/\s+/g, '_')}_${dateKey}`;
            const existing = existingMap.get(compositeKey);
            
            // Core Reconcilliation: Priority: Sheet -> HR Office Default
            const finalOnDuty = p.onDuty || defaultShift?.onDuty || '09:00:00';
            const finalOffDuty = p.offDuty || defaultShift?.offDuty || '17:00:00';

            const logData: Omit<RawMachineLog, 'id'> = {
                date: p.dateADISO,
                dateBS: p.dateBS,
                bsYear: p.bsYear,
                bsMonth: p.bsMonth,
                employeeName: p.employeeName,
                onDuty: finalOnDuty,
                offDuty: finalOffDuty,
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
                rawPayload: p.rawImportData,
                rowIndex: p.importRowIndex,
            };

            const docRef = doc(getRawLogsCollection(), compositeKey);

            if (!existing) {
                operations.push({ ref: docRef, data: logData, op: 'set' });
                createdCount++;
            } else {
                const isExact = existing.clockIn === logData.clockIn && 
                                existing.clockOut === logData.clockOut && 
                                existing.onDuty === logData.onDuty && 
                                existing.offDuty === logData.offDuty &&
                                existing.statusFromMachine === logData.statusFromMachine;

                if (isExact) {
                    skippedCount++;
                } else if (options.overwrite) {
                    operations.push({ ref: docRef, data: { ...logData, lastModifiedBy: importedBy, lastModifiedAt: now }, op: 'set' });
                    updatedCount++;
                } else {
                    skippedCount++;
                }
            }
        });

        for (let i = 0; i < operations.length; i += CHUNK_SIZE) {
            const chunk = operations.slice(i, i + CHUNK_SIZE);
            const batch = writeBatch(db);
            chunk.forEach(o => {
                if (o.op === 'set') batch.set(o.ref, o.data);
            });
            await batch.commit();
            onProgress(i + chunk.length, operations.length);
        }

        return { createdCount, updatedCount, skippedCount, newEmployeesCount };
    } catch (error) {
        logServiceError('addRawMachineLogs', error);
        throw error;
    }
};

/**
 * Records manual bulk entries directly into the raw machine dump.
 */
export const addBulkManualLogs = async (
    dateRange: { from: Date, to: Date },
    employeeNames: string[],
    times: { clockIn: string, clockOut: string, remarks: string, punchMode: 'BOTH' | 'IN_ONLY' | 'OUT_ONLY' },
    createdBy: string
): Promise<number> => {
    const { db } = getFirebase();
    const now = createTimestamp();
    const importId = `manual-bulk-${Date.now()}`;
    const CHUNK_SIZE = 400;

    const dates: Date[] = [];
    let curr = startOfDay(new Date(dateRange.from));
    const end = startOfDay(new Date(dateRange.to));
    
    while (curr <= end) {
        dates.push(new Date(curr));
        curr.setDate(curr.getDate() + 1);
    }

    const operations: { ref: any, data: any }[] = [];

    employeeNames.forEach(name => {
        dates.forEach(adDate => {
            const nepaliDate = new NepaliDate(adDate);
            const dateKey = format(adDate, 'yyyy-MM-dd');
            const compositeKey = `${name.toLowerCase().replace(/\s+/g, '_')}_${dateKey}`;
            
            const logData: Partial<RawMachineLog> = {
                date: adDate.toISOString(),
                dateBS: nepaliDate.format('YYYY/MM/DD'),
                bsYear: nepaliDate.getYear(),
                bsMonth: nepaliDate.getMonth(),
                employeeName: name,
                statusFromMachine: (times.punchMode === 'BOTH' && times.clockIn && times.clockOut) ? 'Present' : 'Absent',
                regularHoursFromMachine: 0, 
                overtimeHoursFromMachine: 0,
                remarks: times.remarks || null,
                importId,
                importedAt: now,
                importedBy: createdBy,
                sourceSheet: 'Manual Bulk Entry',
                rawPayload: {},
                isManual: true,
            };

            if (times.punchMode === 'BOTH' || times.punchMode === 'IN_ONLY') {
                logData.clockIn = times.clockIn || null;
            }
            if (times.punchMode === 'BOTH' || times.punchMode === 'OUT_ONLY') {
                logData.clockOut = times.clockOut || null;
            }

            const docRef = doc(getRawLogsCollection(), compositeKey);
            operations.push({ ref: docRef, data: logData });
        });
    });

    for (let i = 0; i < operations.length; i += CHUNK_SIZE) {
        const chunk = operations.slice(i, i + CHUNK_SIZE);
        const batch = writeBatch(db);
        chunk.forEach(o => batch.set(o.ref, o.data, { merge: true }));
        await batch.commit();
    }

    return operations.length;
};

export const updateRawLog = async (id: string, updates: Partial<RawMachineLog>) => {
    const docRef = doc(getRawLogsCollection(), id);
    updateDoc(docRef, updates).catch(async (err) => {
        const permissionError = new FirestorePermissionError({
            path: docRef.path,
            operation: 'update',
            requestResourceData: updates,
        } satisfies SecurityRuleContext);
        errorEmitter.emit('permission-error', permissionError);
    });
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
    
    // 1. Get Core Config
    const configSetting = await getSetting('hr_config');
    const config = configSetting?.value as HrConfig;
    if (!config) throw new Error("HR Operational Rules not found. Please configure them in HR Office.");

    // 2. Get Data Dependencies
    const qRaw = query(getRawLogsCollection(), where('bsYear', '==', year), where('bsMonth', '==', month));
    const rawSnap = await getDocs(qRaw);
    if (rawSnap.empty) throw new Error("No raw machine logs found for selected period.");

    const employees = await getEmployees();
    const employeeMap = new Map(employees.map(e => [e.name.toLowerCase().trim(), e]));

    const holidays = await getHolidays();
    const leaveRequests = await getLeaveRequests();
    const approvedLeaves = leaveRequests.filter(l => l.status === 'Approved');
    
    // 3. Clear Existing Processed Records for this month
    const qProcessed = query(getAttendanceCollection(), where('bsYear', '==', year), where('bsMonth', '==', month));
    const processedSnap = await getDocs(qProcessed);
    if (!processedSnap.empty) {
        const deleteBatch = writeBatch(db);
        processedSnap.forEach(d => deleteBatch.delete(d.ref));
        await deleteBatch.commit();
    }

    const results: Omit<AttendanceRecord, 'id'>[] = [];
    const now = createTimestamp();

    // 4. Process each raw log into a calculated labor record
    rawSnap.forEach(docSnap => {
        const log = fromFirestoreLog(docSnap as QueryDocumentSnapshot<DocumentData>);
        const employee = employeeMap.get(log.employeeName.toLowerCase().trim());
        
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

            // Calculation Logic Priority:
            // Shift timings from Raw Log (which now defaults to HR Office shift if sheet was empty)
            let onDutyRef = log.onDuty || '09:00:00';
            let offDutyRef = log.offDuty || '17:00:00';

            let reg = log.regularHoursFromMachine;
            let ot = log.overtimeHoursFromMachine;
            let finalStatus = log.statusFromMachine;
            let finalRemarks = log.remarks;

            if (holiday) {
                finalStatus = 'Public Holiday';
                finalRemarks = `Public Holiday: ${holiday.name}`;
                reg = config.hours.baseDayHours;
                ot = 0;
            } else if (leave) {
                finalStatus = 'Leave';
                finalRemarks = `${leave.leaveType} Leave: ${leave.reason}`;
                reg = leave.leaveType === 'Paid' ? config.hours.baseDayHours : 0;
                ot = 0;
            } else if (logDate.getDay() === 6) {
                finalStatus = 'Saturday';
                finalRemarks = 'Weekly Off (Saturday)';
                if (reg === 0 && (log.statusFromMachine === 'Present' || log.statusFromMachine === 'EXTRAOK')) {
                    reg = config.hours.baseDayHours;
                }
            } else {
                if (reg === 0 && (log.statusFromMachine === 'Present' || log.statusFromMachine === 'EXTRAOK')) {
                    reg = config.hours.baseDayHours;
                }
            }

            results.push({
                date: log.date,
                bsDate: log.dateBS || new NepaliDate(new Date(log.date)).format('YYYY/MM/DD'),
                bsYear: year,
                bsMonth: month,
                employeeName: employee.name,
                employeeId: employee.id,
                onDuty: onDutyRef,
                offDuty: offDutyRef,
                clockIn: log.clockIn,
                clockOut: log.clockOut,
                status: finalStatus,
                regularHours: Number(reg) || 0,
                overtimeHours: Number(ot) || 0,
                grossHours: (Number(reg) || 0) + (Number(ot) || 0),
                calculatedAt: now,
                calculatedBy: calculatedBy,
                remarks: finalRemarks,
                sourceLogId: log.id,
                rowIndex: log.rowIndex,
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
