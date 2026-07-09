
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
import { isValid, startOfDay, isEqual, isWithinInterval, format, parse, differenceInMinutes, addMinutes, startOfWeek } from 'date-fns';
import type { AttendanceRecord, RawMachineLog, Employee, HrConfig, HrShift, PublicHoliday, LeaveRequest } from '@/lib/types';
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

        const shiftSnap = await getDocs(collection(db, 'hr_shifts'));
        const existingShifts = shiftSnap.docs.map(d => d.data() as HrShift);
        const defaultShift = existingShifts.find(s => s.isDefault) || existingShifts[0];

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
 * Logic Utilities
 */

const timeToMinutes = (time: string): number => {
    const [h, m, s] = time.split(':').map(Number);
    // Fixed #4: match VBA Round(TimeValue * 1440) by including seconds
    return Math.round(((h || 0) * 3600 + (m || 0) * 60 + (s || 0)) / 60);
};

const roundToNearest = (value: number, step: number): number => {
    if (step <= 0) return value;
    return Math.round(value / step) * step;
};

const getFixedBreakOverlap = (startMins: number, endMins: number, breakStartMins: number, breakEndMins: number): number => {
    const overlapStart = Math.max(startMins, breakStartMins);
    const overlapEnd = Math.min(endMins, breakEndMins);
    return Math.max(0, overlapEnd - overlapStart);
};

const applyFixedBreak = (startMins: number, endMins: number, breakStartMins: number, breakEndMins: number): number => {
    const duration = endMins - startMins;
    if (duration <= 0) return 0;
    
    const overlap = getFixedBreakOverlap(startMins, endMins, breakStartMins, breakEndMins);
    let finalMins = duration;
    // Deduct overlap ONLY if overlap > 0 AND duration > 4h (240 mins)
    if (overlap > 0 && duration > 240) {
        finalMins -= overlap;
    }
    return finalMins / 60;
};

const getPeriodBucket = (dateStr: string, period: 'WEEKLY' | 'MONTHLY'): string => {
    const d = new Date(dateStr);
    if (period === 'WEEKLY') {
        const sunday = startOfWeek(d, { weekStartsOn: 0 });
        return format(sunday, 'yyyyMMdd');
    }
    return format(d, 'yyyyMM');
};

export const runHourlyCalculation = async (year: number, month: number, calculatedBy: string): Promise<{ processed: number }> => {
    const { db } = getFirebase();
    
    const configSetting = await getSetting('hr_config');
    const config = (configSetting?.value as HrConfig) || null;
    if (!config) throw new Error("HR Operational Rules not found. Please configure them in HR Office.");

    // Fixed #1: resolve break window from config
    const breakStartMins = config.hours.breakStart ? timeToMinutes(config.hours.breakStart) : 12 * 60;
    const breakEndMins = config.hours.breakEnd ? timeToMinutes(config.hours.breakEnd) : 13 * 60;

    const qRaw = query(getRawLogsCollection(), where('bsYear', '==', year), where('bsMonth', '==', month));
    const rawSnap = await getDocs(qRaw);
    if (rawSnap.empty) throw new Error("No raw machine logs found for selected period.");

    const employees = await getEmployees();
    const employeeMap = new Map(employees.map(e => [e.name.toLowerCase().trim(), e]));
    const holidays = await getHolidays();
    const leaveRequests = await getLeaveRequests();
    
    // Clear existing processed records for target period
    const qProcessed = query(getAttendanceCollection(), where('bsYear', '==', year), where('bsMonth', '==', month));
    const processedSnap = await getDocs(qProcessed);
    if (!processedSnap.empty) {
        const deleteBatch = writeBatch(db);
        processedSnap.forEach(d => deleteBatch.delete(d.ref));
        await deleteBatch.commit();
    }

    const passCounters = new Map<string, number>();
    const rawLogs = rawSnap.docs.map(d => fromFirestoreLog(d as any)).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const results: Omit<AttendanceRecord, 'id'>[] = [];
    const now = createTimestamp();

    for (const log of rawLogs) {
        const employee = employeeMap.get(log.employeeName.toLowerCase().trim());
        if (!employee) continue;

        const logDate = startOfDay(new Date(log.date));
        const holiday = holidays.find(h => isEqual(startOfDay(new Date(h.date)), logDate));
        const leave = leaveRequests.find(l => 
            l.employeeId === employee.id && 
            l.status === 'Approved' &&
            isWithinInterval(logDate, { 
                start: startOfDay(new Date(l.startDate)), 
                end: startOfDay(new Date(l.endDate)) 
            })
        );

        let reg = 0;
        let ot = 0;
        let finalStatus = log.statusFromMachine;
        let finalRemarks = '';

        // Fixed #2: Precedence chain: Holiday > Leave > Absent > Saturday > Normal
        if (holiday) {
            finalStatus = 'Public Holiday';
            finalRemarks = `Public Holiday - ${holiday.name}`;
            reg = config.hours.baseDayHours;
            if (log.clockIn && log.clockOut) {
                const worked = applyFixedBreak(timeToMinutes(log.clockIn), timeToMinutes(log.clockOut), breakStartMins, breakEndMins);
                ot = roundToNearest(worked, config.hours.roundStep);
            }
        }
        else if (leave) {
            finalStatus = 'Leave';
            finalRemarks = `${leave.leaveType} Leave: ${leave.reason}`;
            reg = leave.leaveType === 'Paid' ? config.hours.baseDayHours : 0;
            ot = 0;
        }
        else if (log.statusFromMachine === 'Absent' || log.statusFromMachine === 'TRUE') {
            finalStatus = 'Absent';
            reg = 0; ot = 0;
            finalRemarks = '';
        }
        else if (logDate.getDay() === 6) {
            finalStatus = 'Saturday';
            finalRemarks = '';
            if (log.clockIn && log.clockOut) {
                const worked = applyFixedBreak(timeToMinutes(log.clockIn), timeToMinutes(log.clockOut), breakStartMins, breakEndMins);
                if (worked > 0) {
                    ot = roundToNearest(worked, config.hours.roundStep);
                    reg = 0;
                }
            }
        }
        else {
            // Normal workday branch
            if (!log.onDuty || !log.offDuty || !log.clockIn || !log.clockOut) {
                // Fixed #3: Explicit missing-punch remarks
                const missIn = !log.clockIn;
                const missOut = !log.clockOut;
                if (missIn && missOut) {
                    finalRemarks = "Missing IN & OUT";
                } else if (missIn) {
                    finalRemarks = "Missing IN";
                } else {
                    finalRemarks = "Missing OUT";
                }
                finalStatus = (log.clockIn || log.clockOut) ? 'C/I/O Miss' : 'Absent';
                reg = 0; ot = 0;
            } else {
                const sOn = timeToMinutes(log.onDuty);
                const sOff = timeToMinutes(log.offDuty);
                const aIn = timeToMinutes(log.clockIn);
                const aOut = timeToMinutes(log.clockOut);

                const lateMin = Math.max(0, aIn - sOn);
                const earlyMin = Math.max(0, sOff - aOut);

                let latePen = 0;
                if (lateMin > 0) {
                    if (lateMin <= config.hours.graceMin) {
                        const bucket = getPeriodBucket(log.date, config.hours.freeLatePeriod);
                        const key = `${employee.id}|L|${bucket}`;
                        const used = passCounters.get(key) || 0;
                        if (config.hours.freeLate > 0 && used < config.hours.freeLate) {
                            passCounters.set(key, used + 1);
                            latePen = 0;
                        } else {
                            latePen = config.hours.blockMin;
                        }
                    } else {
                        latePen = Math.ceil((lateMin - config.hours.graceMin) / config.hours.blockMin) * config.hours.blockMin;
                    }
                }

                let earlyPen = 0;
                if (earlyMin > 0) {
                    if (earlyMin <= config.hours.graceMin) {
                        const bucket = getPeriodBucket(log.date, config.hours.freeEarlyPeriod);
                        const key = `${employee.id}|E|${bucket}`;
                        const used = passCounters.get(key) || 0;
                        if (config.hours.freeEarly > 0 && used < config.hours.freeEarly) {
                            passCounters.set(key, used + 1);
                            earlyPen = 0;
                        } else {
                            earlyPen = config.hours.blockMin;
                        }
                    } else {
                        earlyPen = Math.ceil((earlyMin - config.hours.graceMin) / config.hours.blockMin) * config.hours.blockMin;
                    }
                }

                const effIn = sOn + latePen;
                const effOut = sOff - earlyPen;

                let paid = 0;
                if (effOut > effIn) {
                    paid = applyFixedBreak(effIn, effOut, breakStartMins, breakEndMins);
                }

                let extraBefore = 0;
                let extraAfter = 0;
                if (log.statusFromMachine.toUpperCase().includes('EXTRAOK')) {
                    extraBefore = Math.floor((Math.max(0, sOn - aIn) + 5) / 30) * 0.5;
                    extraAfter = Math.floor((Math.max(0, aOut - sOff) + 5) / 30) * 0.5;
                }

                const grossRaw = paid + extraBefore + extraAfter + 0.000001;
                const gross = roundToNearest(grossRaw, config.hours.roundStep);
                
                if (gross > config.hours.baseDayHours) {
                    reg = config.hours.baseDayHours;
                    ot = gross - config.hours.baseDayHours;
                } else {
                    reg = gross;
                    ot = 0;
                }
                
                finalStatus = 'Present';

                const actualWorked = applyFixedBreak(aIn, aOut, breakStartMins, breakEndMins);
                if (actualWorked > config.hours.reviewThresh) {
                    finalRemarks = "Review Hours";
                }
            }
        }

        results.push({
            date: log.date,
            bsDate: log.dateBS || new NepaliDate(new Date(log.date)).format('YYYY/MM/DD'),
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
            remarks: finalRemarks || null,
            sourceLogId: log.id,
            rowIndex: log.rowIndex,
        });
    }

    const batchSize = 400;
    for (let i = 0; i < results.length; i += batchSize) {
        const chunk = results.slice(i, i + batchSize);
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
