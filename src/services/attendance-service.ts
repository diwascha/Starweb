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
import { isValid, startOfDay, isEqual, isWithinInterval, format, parse, differenceInMinutes } from 'date-fns';
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
 * and automatic employee/shift onboarding.
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

        // 2. Handle Automatic Shift Discovery
        const shiftSnap = await getDocs(collection(db, 'hr_shifts'));
        const existingShifts = shiftSnap.docs.map(d => d.data() as HrShift);
        const shiftBatch = writeBatch(db);
        let discoveredShifts = 0;

        const uniqueShiftPairs = new Set<string>();
        processedData.forEach(p => {
            if (p.onDuty && p.offDuty) {
                uniqueShiftPairs.add(`${p.onDuty.substring(0,5)}|${p.offDuty.substring(0,5)}`);
            }
        });

        uniqueShiftPairs.forEach(pair => {
            const [on, off] = pair.split('|');
            const exists = existingShifts.some(s => s.onDuty.startsWith(on) && s.offDuty.startsWith(off));
            if (!exists) {
                const shiftRef = doc(collection(db, 'hr_shifts'));
                const newShift: Omit<HrShift, 'id'> = {
                    name: `Log Discovery: ${on}-${off}`,
                    onDuty: `${on}:00`,
                    offDuty: `${off}:00`,
                    breakStart: '12:00:00',
                    breakEnd: '13:00:00',
                    isDefault: false,
                    createdBy: importedBy,
                    createdAt: now
                };
                shiftBatch.set(shiftRef, newShift);
                discoveredShifts++;
            }
        });

        if (discoveredShifts > 0) {
            await shiftBatch.commit();
        }

        const defaultShift = existingShifts.find(s => s.isDefault) || existingShifts[0];

        // 3. Determine the scope for log duplicates
        const periods = new Set<string>();
        processedData.forEach(p => periods.add(`${p.bsYear}-${p.bsMonth}`));
        
        const existingMap = new Map<string, RawMachineLog>();
        for (const period of Array.from(periods)) {
            const [y, m] = period.split('-').map(Number);
            const q = query(getRawLogsCollection(), where('bsYear', '==', y), where('bsMonth', '==', m));
            const snap = await getDocs(q);
            snap.forEach(d => {
                const log = fromFirestoreLog(d as any);
                const dateKey = format(new Date(log.date), 'yyyy-MM-dd');
                const key = `${log.employeeName.toLowerCase().trim()}_${dateKey}`;
                existingMap.set(key, log);
            });
        }

        let createdCount = 0;
        let updatedCount = 0;
        let skippedCount = 0;

        const operations: { ref: any, data: any, op: 'set' | 'update' | 'skip' }[] = [];

        processedData.forEach(p => {
            const dateKey = format(new Date(p.dateADISO), 'yyyy-MM-dd');
            const compositeKey = `${p.employeeName.toLowerCase().trim()}_${dateKey}`;
            const existing = existingMap.get(compositeKey);
            
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
                rawPayload: p.rawPayload,
                rowIndex: p.importRowIndex,
            };

            const docRef = doc(getRawLogsCollection(), compositeKey);

            if (!existing) {
                operations.push({ ref: docRef, data: logData, op: 'set' });
                createdCount++;
            } else {
                if (options.overwrite) {
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
            const compositeKey = `${name.toLowerCase().trim()}_${dateKey}`;
            
            const logData: Partial<RawMachineLog> = {
                date: adDate.toISOString(),
                dateBS: nepaliDate.format('YYYY/MM/DD'),
                bsYear: nepaliDate.getYear(),
                bsMonth: nepaliDate.getMonth(),
                employeeName: name,
                statusFromMachine: (times.punchMode === 'BOTH' && times.clockIn && times.clockOut) ? 'Present' : 'Absent',
                remarks: times.remarks || null,
                importId,
                importedAt: now,
                importedBy: createdBy,
                sourceSheet: 'Manual Bulk Entry',
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

/**
 * Calculates duration between two times in decimal hours.
 */
function calculateHours(start: string, end: string): number {
    const s = parse(start, 'HH:mm:ss', new Date());
    const e = parse(end, 'HH:mm:ss', new Date());
    if (!isValid(s) || !isValid(e)) return 0;
    
    let mins = differenceInMinutes(e, s);
    if (mins < 0) mins += 1440; // Handle cross-midnight shifts
    return parseFloat((mins / 60).toFixed(2));
}

export const runHourlyCalculation = async (year: number, month: number, calculatedBy: string): Promise<{ processed: number }> => {
    const { db } = getFirebase();
    
    const configSetting = await getSetting('hr_config');
    const config = configSetting?.value as HrConfig;
    if (!config) throw new Error("HR Operational Rules not found. Please configure them in HR Office.");

    const qRaw = query(getRawLogsCollection(), where('bsYear', '==', year), where('bsMonth', '==', month));
    const rawSnap = await getDocs(qRaw);
    if (rawSnap.empty) throw new Error("No raw machine logs found for selected period.");

    const employees = await getEmployees();
    const employeeMap = new Map(employees.map(e => [e.name.toLowerCase().trim(), e]));

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

            let reg = 0;
            let ot = 0;
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
                // If they actually worked on Saturday, calculate hours as normal
                if (log.clockIn && log.clockOut) {
                    const worked = calculateHours(log.clockIn, log.clockOut);
                    reg = Math.min(worked, config.hours.baseDayHours);
                    ot = Math.max(0, worked - config.hours.baseDayHours);
                } else if (log.statusFromMachine === 'Present' || log.statusFromMachine === 'EXTRAOK') {
                    reg = config.hours.baseDayHours;
                }
            } else if (log.clockIn && log.clockOut) {
                // APPLY HR OFFICE RULES: Grace, Rounding, and Strict OT Classification
                const sOn = parse(log.onDuty || '09:00:00', 'HH:mm:ss', new Date());
                const sOff = parse(log.offDuty || '17:00:00', 'HH:mm:ss', new Date());
                let aIn = parse(log.clockIn, 'HH:mm:ss', new Date());
                let aOut = parse(log.clockOut, 'HH:mm:ss', new Date());
                
                // Track original punches for OT audit
                const rawIn = log.clockIn;
                const rawOut = log.clockOut;

                // 1. Arrival Logic (Grace Period - Criterion 3)
                // If arrived before shift start or within grace: Align to Shift Start.
                const arrivalLateMins = differenceInMinutes(aIn, sOn);
                if (arrivalLateMins <= config.hours.graceMin) {
                    aIn = sOn; 
                }
                
                // 2. Departure Logic (Grace Period - Criterion 3)
                // If left early within grace: Align to Shift End.
                const departureEarlyMins = differenceInMinutes(sOff, aOut);
                if (departureEarlyMins >= 0 && departureEarlyMins <= config.hours.graceMin) {
                    aOut = sOff;
                }

                // 3. Regular Hours Calculation (Criterion 1)
                // Rule: Regular hours are ONLY earned between shift boundaries.
                // Arriving early does NOT count toward Normal hours span.
                const effectiveRegIn = aIn > sOn ? aIn : sOn;
                const effectiveRegOut = aOut < sOff ? aOut : sOff;
                
                let workedRegMins = differenceInMinutes(effectiveRegOut, effectiveRegIn);
                if (workedRegMins < 0) workedRegMins = 0;
                
                // Break Deduction
                let shiftSpanMins = differenceInMinutes(sOff, sOn);
                if (shiftSpanMins < 0) shiftSpanMins += 1440;
                const breakMins = Math.max(0, shiftSpanMins - (config.hours.baseDayHours * 60));
                
                if (workedRegMins > (shiftSpanMins / 2)) {
                    workedRegMins -= breakMins;
                }

                const rawRegHrs = Math.max(0, workedRegMins / 60);
                // Criterion 2: Rounding
                reg = Math.floor(rawRegHrs / config.hours.roundStep) * config.hours.roundStep;
                // Criterion 1: Cap at Base Day
                reg = Math.min(reg, config.hours.baseDayHours);

                // 4. Overtime Logic (Criterion 4: Strict Compliance with blockMin)
                // Rule: OT is earned ONLY by staying late beyond Shift End.
                let extraStayMins = differenceInMinutes(parse(rawOut, 'HH:mm:ss', new Date()), sOff);
                if (extraStayMins < 0) extraStayMins = 0;
                
                if (extraStayMins >= config.hours.blockMin) {
                    const rawOtHrs = extraStayMins / 60;
                    // Criterion 2: Rounding
                    ot = Math.floor(rawOtHrs / config.hours.roundStep) * config.hours.roundStep;
                } else {
                    ot = 0;
                }

                // Criterion 9: Review Flag
                if ((reg + ot) >= config.hours.reviewThresh) {
                    finalRemarks = finalRemarks ? `Admin Review Required; ${finalRemarks}` : `Admin Review Required: High Hours`;
                }

                // Audit Remarks (Criteria 5-8)
                if (arrivalLateMins > config.hours.graceMin) {
                    finalRemarks = finalRemarks ? `${finalRemarks}; Late ${arrivalLateMins}m` : `Late ${arrivalLateMins}m`;
                }
                if (departureEarlyMins > config.hours.graceMin) {
                    finalRemarks = finalRemarks ? `${finalRemarks}; Early exit ${departureEarlyMins}m` : `Early exit ${departureEarlyMins}m`;
                }
                
                finalStatus = 'Present';
            } else if (log.statusFromMachine === 'Present' || log.statusFromMachine === 'EXTRAOK') {
                reg = config.hours.baseDayHours;
                finalStatus = 'Present';
            }

            results.push({
                date: log.date,
                bsDate: log.dateBS || new NepaliDate(new Date(log.date)).format('YYYY/MM/DD'),
                bsYear: year,
                bsMonth: month,
                employeeName: employee.name,
                employeeId: employee.id,
                onDuty: log.onDuty || '09:00:00',
                offDuty: log.offDuty || '17:00:00',
                clockIn: log.clockIn,
                clockOut: log.clockOut,
                status: finalStatus,
                regularHours: reg,
                overtimeHours: ot,
                grossHours: reg + ot,
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
