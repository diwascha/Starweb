import { getFirebase } from '@/lib/firebase';
import { collection, doc, writeBatch, getDocs, query, where } from 'firebase/firestore';
import { RawMachineLog, HrShift } from '@/lib/types';
import { COLLECTIONS } from '@/lib/constants';
import { createTimestamp, logServiceError } from '@/lib/service-utils';
import { processAttendanceImport, resolveDominantPeriod } from '@/lib/attendance';
import { getEmployees } from '../employee-service';
import { getRawLogsCollection, fromFirestoreLog } from './data';
import { format, startOfDay } from 'date-fns';
import NepaliDate from 'nepali-date-converter';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

export const addRawMachineLogs = async (
    jsonData: any[][],
    importedBy: string, 
    sourceSheetName: string,
    onProgress: (progress: number, total: number) => void,
    options: { overwrite: boolean } = { overwrite: false }
): Promise<{ createdCount: number, updatedCount: number, skippedCount: number, newEmployeesCount: number, headerRow: any[], headerIndex: number, dominantPeriod: { year: number, month: number } | null }> => {
    const { db } = getFirebase();
    const importId = `imp-${Date.now()}`;
    const now = createTimestamp();
    const CHUNK_SIZE = 400;

    try {
        const { processedData, headerRow, headerIndex } = processAttendanceImport(jsonData);
        const dominantPeriod = resolveDominantPeriod(processedData);
        if (processedData.length === 0) return { createdCount: 0, updatedCount: 0, skippedCount: 0, newEmployeesCount: 0, headerRow, headerIndex, dominantPeriod };

        const employees = await getEmployees();
        const existingEmpNames = new Set(employees.map(e => e.name.toLowerCase().trim()));
        const uniqueNamesInSheet = Array.from(new Set(processedData.map(p => p.employeeName.trim()))).filter(n => n.length > 0);
        
        let newEmployeesCount = 0;
        const employeeBatch = writeBatch(db);
        for (const name of uniqueNamesInSheet) {
            if (!existingEmpNames.has(name.toLowerCase())) {
                const empRef = doc(collection(db, COLLECTIONS.EMPLOYEES));
                employeeBatch.set(empRef, { name: name.trim(), status: 'Working', wageBasis: 'Monthly', wageAmount: 0, mobileNumber: 'Not Provided', createdBy: importedBy, createdAt: now });
                newEmployeesCount++;
            }
        }
        if (newEmployeesCount > 0) await employeeBatch.commit();

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
                existingMap.set(`${log.employeeName.toLowerCase().trim()}_${dateKey}`, log);
            });
        }

        let createdCount = 0; let updatedCount = 0; let skippedCount = 0;
        const operations: { ref: any, data: any }[] = [];

        processedData.forEach(p => {
            const dateKey = format(new Date(p.dateADISO), 'yyyy-MM-dd');
            const compositeKey = `${p.employeeName.toLowerCase().trim()}_${dateKey}`;
            const existing = existingMap.get(compositeKey);
            const logData: Omit<RawMachineLog, 'id'> = {
                date: p.dateADISO, dateBS: p.dateBS, bsYear: p.bsYear, bsMonth: p.bsMonth, employeeName: p.employeeName,
                onDuty: p.onDuty || defaultShift?.onDuty || '09:00:00',
                offDuty: p.offDuty || defaultShift?.offDuty || '17:00:00',
                clockIn: p.clockIn, clockOut: p.clockOut, statusFromMachine: p.status,
                regularHoursFromMachine: p.regularHours, overtimeHoursFromMachine: p.overtimeHours,
                remarks: p.remarks, importId, importedAt: now, importedBy, sourceSheet: sourceSheetName,
                rawPayload: p.rawImportData, rowIndex: p.importRowIndex,
            };
            const docRef = doc(getRawLogsCollection(), compositeKey);
            if (!existing) { operations.push({ ref: docRef, data: logData }); createdCount++; }
            else if (options.overwrite) { operations.push({ ref: docRef, data: { ...logData, lastModifiedBy: importedBy, lastModifiedAt: now } }); updatedCount++; }
            else skippedCount++;
        });

        for (let i = 0; i < operations.length; i += CHUNK_SIZE) {
            const chunk = operations.slice(i, i + CHUNK_SIZE);
            const batch = writeBatch(db);
            chunk.forEach(o => batch.set(o.ref, o.data));
            await batch.commit();
            onProgress(i + chunk.length, operations.length);
        }
        return { createdCount, updatedCount, skippedCount, newEmployeesCount, headerRow, headerIndex, dominantPeriod };
    } catch (error: any) {
        if (error.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: 'raw_machine_logs_import',
                operation: 'write'
            }));
        }
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
    const CHUNK_SIZE = 400;
    const dates: Date[] = [];
    let curr = startOfDay(new Date(dateRange.from));
    const end = startOfDay(new Date(dateRange.to));
    while (curr <= end) { dates.push(new Date(curr)); curr.setDate(curr.getDate() + 1); }

    const operations: { ref: any, data: any }[] = [];
    employeeNames.forEach(name => {
        dates.forEach(adDate => {
            const nepaliDate = new NepaliDate(adDate);
            const compositeKey = `${name.toLowerCase().trim()}_${format(adDate, 'yyyy-MM-dd')}`;
            const logData: Partial<RawMachineLog> = {
                date: adDate.toISOString(), dateBS: nepaliDate.format('YYYY/MM/DD'), bsYear: nepaliDate.getYear(), bsMonth: nepaliDate.getMonth(),
                employeeName: name, statusFromMachine: (times.punchMode === 'BOTH' && times.clockIn && times.clockOut) ? 'Present' : 'Absent',
                remarks: times.remarks || null, importedAt: now, importedBy: createdBy, sourceSheet: 'Manual Bulk Entry', isManual: true,
            };
            if (times.punchMode === 'BOTH' || times.punchMode === 'IN_ONLY') logData.clockIn = times.clockIn || null;
            if (times.punchMode === 'BOTH' || times.punchMode === 'OUT_ONLY') logData.clockOut = times.clockOut || null;
            operations.push({ ref: doc(getRawLogsCollection(), compositeKey), data: logData });
        });
    });

    for (let i = 0; i < operations.length; i += CHUNK_SIZE) {
        const chunk = operations.slice(i, i + CHUNK_SIZE);
        const batch = writeBatch(db);
        chunk.forEach(o => batch.set(o.ref, o.data, { merge: true }));
        await batch.commit().catch(err => {
            if (err.code === 'permission-denied') {
                errorEmitter.emit('permission-error', new FirestorePermissionError({
                    path: 'raw_machine_logs_bulk',
                    operation: 'write'
                }));
            }
        });
    }
    return operations.length;
};

/**
 * Bulk Clock In / Clock Out: stamps just one side of the punch (clockIn or
 * clockOut) for every selected employee on one date, merging into whatever
 * raw log already exists for that employee+date. Unlike addBulkManualLogs
 * (which writes a full day's worth of data in one shot and is meant for
 * backfilling), this never touches statusFromMachine, the other punch side,
 * onDuty/offDuty, or remarks - so clocking a group in during the morning and
 * clocking them out again in the evening never clobbers either record, and
 * each employee's individual attendance stays intact.
 */
export const bulkClockInOut = async (
    date: Date,
    employeeNames: string[],
    action: 'IN' | 'OUT',
    time: string,
    performedBy: string
): Promise<number> => {
    const { db } = getFirebase();
    const now = createTimestamp();
    const adDate = startOfDay(date);
    const nepaliDate = new NepaliDate(adDate);
    const dateISO = adDate.toISOString();
    const dateBS = nepaliDate.format('YYYY/MM/DD');
    const bsYear = nepaliDate.getYear();
    const bsMonth = nepaliDate.getMonth();
    const CHUNK_SIZE = 400;

    const operations = employeeNames.map(name => {
        const compositeKey = `${name.toLowerCase().trim()}_${format(adDate, 'yyyy-MM-dd')}`;
        const data: Partial<RawMachineLog> = {
            date: dateISO, dateBS, bsYear, bsMonth, employeeName: name,
            importedAt: now, importedBy: performedBy, sourceSheet: 'Bulk Clock Action', isManual: true,
        };
        if (action === 'IN') data.clockIn = time; else data.clockOut = time;
        return { ref: doc(getRawLogsCollection(), compositeKey), data };
    });

    for (let i = 0; i < operations.length; i += CHUNK_SIZE) {
        const chunk = operations.slice(i, i + CHUNK_SIZE);
        const batch = writeBatch(db);
        chunk.forEach(o => batch.set(o.ref, o.data, { merge: true }));
        await batch.commit().catch(err => {
            if (err.code === 'permission-denied') {
                errorEmitter.emit('permission-error', new FirestorePermissionError({
                    path: 'raw_machine_logs_bulk_clock',
                    operation: 'write'
                }));
            }
            throw err;
        });
    }
    return operations.length;
};