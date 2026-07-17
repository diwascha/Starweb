import { getFirebase } from '@/lib/firebase';
import { 
    collection, 
    doc, 
    writeBatch, 
    getDocs, 
    query, 
    where, 
} from 'firebase/firestore';
import { startOfDay, isEqual, isWithinInterval, format } from 'date-fns';
import type { AttendanceRecord, HrConfig } from '@/lib/types';
import { getEmployees } from '../employee-service';
import { getHolidays, getLeaveRequests } from '../hr-admin-service';
import { COLLECTIONS } from '@/lib/constants';
import { createTimestamp } from '@/lib/service-utils';
import { getSetting } from '../settings-service';
import { getAttendanceCollection, getRawLogsCollection, fromFirestoreLog } from './data';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError, type SecurityRuleContext } from '@/firebase/errors';

const timeToMinutes = (time: string): number => {
    const [h, m, s] = time.split(':').map(Number);
    return Math.round(((h || 0) * 3600 + (m || 0) * 60 + (s || 0)) / 60);
};

const roundToNearest = (value: number, step: number): number => {
    if (step <= 0) return value;
    return Math.round(value / step) * step;
};

const applyFixedBreak = (startMins: number, endMins: number, breakStartMins: number, breakEndMins: number): number => {
    const duration = endMins - startMins;
    if (duration <= 0) return 0;
    const overlapStart = Math.max(startMins, breakStartMins);
    const overlapEnd = Math.min(endMins, breakEndMins);
    const overlap = Math.max(0, overlapEnd - overlapStart);
    let finalMins = duration;
    if (overlap > 0 && duration > 240) finalMins -= overlap;
    return finalMins / 60;
};

export const runHourlyCalculation = async (year: number, month: number, calculatedBy: string): Promise<{ processed: number }> => {
    const { db } = getFirebase();
    const configSetting = await getSetting('hr_config');
    const config = (configSetting?.value as HrConfig) || null;
    if (!config) throw new Error("HR Operational Rules not found.");

    const breakStartMins = config.hours.breakStart ? timeToMinutes(config.hours.breakStart) : 12 * 60;
    const breakEndMins = config.hours.breakEnd ? timeToMinutes(config.hours.breakEnd) : 13 * 60;

    const qRaw = query(getRawLogsCollection(), where('bsYear', '==', year), where('bsMonth', '==', month));
    const rawSnap = await getDocs(qRaw).catch(err => {
        if (err.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError({ path: 'raw_machine_logs', operation: 'list' }));
        }
        throw err;
    });
    
    if (rawSnap.empty) throw new Error("No raw machine logs found for selected period.");

    const [employees, holidays, leaveRequests] = await Promise.all([getEmployees(), getHolidays(), getLeaveRequests()]);
    const employeeMap = new Map(employees.map(e => [e.name.toLowerCase().trim(), e]));
    
    const qProcessed = query(getAttendanceCollection(), where('bsYear', '==', year), where('bsMonth', '==', month));
    const processedSnap = await getDocs(qProcessed).catch(err => {
        if (err.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError({ path: COLLECTIONS.ATTENDANCE, operation: 'list' }));
        }
        throw err;
    });

    if (!processedSnap.empty) {
        const deleteBatch = writeBatch(db);
        processedSnap.forEach(d => deleteBatch.delete(d.ref));
        await deleteBatch.commit();
    }

    const rawLogs = rawSnap.docs.map(d => fromFirestoreLog(d as any)).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const results: Omit<AttendanceRecord, 'id'>[] = [];
    const now = createTimestamp();

    for (const log of rawLogs) {
        const employee = employeeMap.get(log.employeeName.toLowerCase().trim());
        if (!employee) continue;

        const logDate = startOfDay(new Date(log.date));
        const holiday = holidays.find(h => isEqual(startOfDay(new Date(h.date)), logDate));
        const leave = leaveRequests.find(l => l.employeeId === employee.id && l.status === 'Approved' && isWithinInterval(logDate, { start: startOfDay(new Date(l.startDate)), end: startOfDay(new Date(l.endDate)) }));

        let reg = 0; let ot = 0; let finalStatus = log.statusFromMachine; let finalRemarks = '';

        if (holiday) { finalStatus = 'Public Holiday'; finalRemarks = `Public Holiday - ${holiday.name}`; reg = config.hours.baseDayHours;
            if (log.clockIn && log.clockOut) ot = roundToNearest(applyFixedBreak(timeToMinutes(log.clockIn), timeToMinutes(log.clockOut), breakStartMins, breakEndMins), config.hours.roundStep);
        } else if (leave) { finalStatus = 'Leave'; finalRemarks = `${leave.leaveType} Leave: ${leave.reason}`; reg = leave.leaveType === 'Paid' ? config.hours.baseDayHours : 0;
        } else if (log.statusFromMachine === 'Absent' || log.statusFromMachine === 'TRUE') { finalStatus = 'Absent';
        } else if (logDate.getDay() === 6) { finalStatus = 'Saturday';
            if (log.clockIn && log.clockOut) ot = roundToNearest(applyFixedBreak(timeToMinutes(log.clockIn), timeToMinutes(log.clockOut), breakStartMins, breakEndMins), config.hours.roundStep);
        } else {
            if (!log.onDuty || !log.offDuty || !log.clockIn || !log.clockOut) { finalStatus = (log.clockIn || log.clockOut) ? 'C/I/O Miss' : 'Absent'; finalRemarks = "Incomplete Punches"; }
            else {
                const sOn = timeToMinutes(log.onDuty); const sOff = timeToMinutes(log.offDuty); const aIn = timeToMinutes(log.clockIn); const aOut = timeToMinutes(log.clockOut);
                const lateMin = Math.max(0, aIn - sOn); const earlyMin = Math.max(0, sOff - aOut);
                let latePen = 0; if (lateMin > config.hours.graceMin) latePen = Math.ceil((lateMin - config.hours.graceMin) / config.hours.blockMin) * config.hours.blockMin;
                let earlyPen = 0; if (earlyMin > config.hours.graceMin) earlyPen = Math.ceil((earlyMin - config.hours.graceMin) / config.hours.blockMin) * config.hours.blockMin;
                const effIn = sOn + latePen; const effOut = sOff - earlyPen;
                let paid = effOut > effIn ? applyFixedBreak(effIn, effOut, breakStartMins, breakEndMins) : 0;
                let extra = log.statusFromMachine.toUpperCase().includes('EXTRAOK') ? (Math.floor((Math.max(0, sOn-aIn)+5)/30)*0.5 + Math.floor((Math.max(0, aOut-sOff)+5)/30)*0.5) : 0;
                const gross = roundToNearest(paid + extra, config.hours.roundStep);
                reg = Math.min(gross, config.hours.baseDayHours); ot = Math.max(0, gross - config.hours.baseDayHours);
                finalStatus = 'Present';
            }
        }

        results.push({ date: log.date, dateBS: log.dateBS, bsYear: year, bsMonth: month, employeeName: employee.name, employeeId: employee.id, onDuty: log.onDuty, offDuty: log.offDuty, clockIn: log.clockIn, clockOut: log.clockOut, status: finalStatus, regularHours: reg, overtimeHours: ot, grossHours: reg + ot, calculatedAt: now, calculatedBy, remarks: finalRemarks || null, sourceLogId: log.id, rowIndex: log.rowIndex });
    }

    const CHUNK = 400;
    for (let i = 0; i < results.length; i += CHUNK) {
        const batch = writeBatch(db);
        results.slice(i, i + CHUNK).forEach(r => batch.set(doc(getAttendanceCollection()), r));
        await batch.commit().catch(err => {
            if (err.code === 'permission-denied') {
                errorEmitter.emit('permission-error', new FirestorePermissionError({ path: COLLECTIONS.ATTENDANCE, operation: 'write' }));
            }
            throw err;
        });
    }
    return { processed: results.length };
};