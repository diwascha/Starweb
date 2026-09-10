import { getFirebase } from '@/lib/firebase';
import { 
    collection, 
    doc, 
    writeBatch, 
    getDocs, 
    query, 
    where, 
} from 'firebase/firestore';
import { startOfDay, isEqual, isWithinInterval, format, getWeek } from 'date-fns';
import type { AttendanceRecord, HrConfig, HrShift } from '@/lib/types';
import { getEmployees } from '../employee-service';
import { getHolidays, getLeaveRequests, getShifts } from '../hr-admin-service';
import { COLLECTIONS } from '@/lib/constants';
import { createTimestamp } from '@/lib/service-utils';
import { getSetting } from '../settings-service';
import { getAttendanceCollection, getRawLogsCollection, fromFirestoreLog, isPeriodLocked } from './data';
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

    // Enforced here, not just as a disabled button in the UI: a locked
    // period (an imported ledger month, or one deliberately finalized)
    // must never be recomputed, even by a direct/programmatic call.
    if (await isPeriodLocked(year, month)) {
        throw new Error("This period is locked and cannot be recalculated. Unlock it first.");
    }

    const configSetting = await getSetting('hr_config');
    const config = (configSetting?.value as HrConfig) || null;
    if (!config) throw new Error("HR Operational Rules not found.");

    // Default (config-level) break window, used for any employee with no shift
    // assigned - this is the pre-existing single-schedule behavior and stays
    // untouched so employees on the standard shift calculate exactly as before.
    const defaultBreakStartMins = config.hours.breakStart ? timeToMinutes(config.hours.breakStart) : 12 * 60;
    const defaultBreakEndMins = config.hours.breakEnd ? timeToMinutes(config.hours.breakEnd) : 13 * 60;

    const qRaw = query(getRawLogsCollection(), where('bsYear', '==', year), where('bsMonth', '==', month));
    const rawSnap = await getDocs(qRaw).catch(err => {
        if (err.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError({ path: 'raw_machine_logs', operation: 'list' }));
        }
        throw err;
    });
    
    if (rawSnap.empty) throw new Error("No raw machine logs found for selected period.");

    const [employees, holidays, leaveRequests, shifts] = await Promise.all([getEmployees(), getHolidays(), getLeaveRequests(), getShifts()]);
    const employeeMap = new Map(employees.map(e => [e.name.toLowerCase().trim(), e]));
    const shiftMap = new Map(shifts.map(s => [s.id, s]));
    
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

    // Tracks how many late/early incidents (beyond grace) each employee has
    // already used up this period, so the first N are forgiven per
    // Free_Late/Free_Early. Logs are processed in chronological order, so a
    // single running counter per employee (or per employee+week) is enough -
    // no need to pre-group by employee first.
    const lateIncidentCounts = new Map<string, number>();
    const earlyIncidentCounts = new Map<string, number>();
    const periodKey = (employeeId: string, period: 'WEEKLY' | 'MONTHLY', date: Date) =>
        period === 'MONTHLY' ? employeeId : `${employeeId}-${getWeek(date)}`;

    for (const log of rawLogs) {
        const employee = employeeMap.get(log.employeeName.toLowerCase().trim());
        if (!employee) continue;

        // Employee -> Assigned Shift -> Break Configuration. An employee with
        // no shift assigned keeps using the config-level default, so nothing
        // changes for anyone until a shift is explicitly assigned to them.
        const shift: HrShift | undefined = employee.shiftId ? shiftMap.get(employee.shiftId) : undefined;
        const breakStartMins = shift?.breakStart ? timeToMinutes(shift.breakStart) : defaultBreakStartMins;
        const breakEndMins = shift?.breakEnd ? timeToMinutes(shift.breakEnd) : defaultBreakEndMins;
        // Raw log values (from a real punch import) always win; a shift's
        // onDuty/offDuty only fills in when the raw row has none, e.g. rows
        // created via Bulk Clock In/Out which don't carry a schedule of their own.
        const effOnDuty = log.onDuty || shift?.onDuty || null;
        const effOffDuty = log.offDuty || shift?.offDuty || null;

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
            if (!effOnDuty || !effOffDuty || !log.clockIn || !log.clockOut) { finalStatus = (log.clockIn || log.clockOut) ? 'C/I/O Miss' : 'Absent'; finalRemarks = "Incomplete Punches"; }
            else {
                const sOn = timeToMinutes(effOnDuty); const sOff = timeToMinutes(effOffDuty); const aIn = timeToMinutes(log.clockIn); const aOut = timeToMinutes(log.clockOut);
                const lateMin = Math.max(0, aIn - sOn); const earlyMin = Math.max(0, sOff - aOut);

                let latePen = 0;
                if (lateMin > config.hours.graceMin) {
                    const key = periodKey(employee.id, config.hours.freeLatePeriod, logDate);
                    const usedPasses = (lateIncidentCounts.get(key) || 0) + 1;
                    lateIncidentCounts.set(key, usedPasses);
                    if (usedPasses > config.hours.freeLate) {
                        latePen = Math.ceil((lateMin - config.hours.graceMin) / config.hours.blockMin) * config.hours.blockMin;
                    }
                }
                let earlyPen = 0;
                if (earlyMin > config.hours.graceMin) {
                    const key = periodKey(employee.id, config.hours.freeEarlyPeriod, logDate);
                    const usedPasses = (earlyIncidentCounts.get(key) || 0) + 1;
                    earlyIncidentCounts.set(key, usedPasses);
                    if (usedPasses > config.hours.freeEarly) {
                        earlyPen = Math.ceil((earlyMin - config.hours.graceMin) / config.hours.blockMin) * config.hours.blockMin;
                    }
                }

                const effIn = sOn + latePen; const effOut = sOff - earlyPen;
                let paid = effOut > effIn ? applyFixedBreak(effIn, effOut, breakStartMins, breakEndMins) : 0;
                // "OT Ok" - a manual otApproved flag (set from the Attendance
                // Logs UI) has the same effect as an imported EXTRAOK status:
                // pay for time worked outside the assigned shift window.
                const otOk = log.otApproved || log.statusFromMachine.toUpperCase().includes('EXTRAOK');
                let extra = otOk ? (Math.floor((Math.max(0, sOn-aIn)+5)/30)*0.5 + Math.floor((Math.max(0, aOut-sOff)+5)/30)*0.5) : 0;
                const gross = roundToNearest(paid + extra, config.hours.roundStep);
                reg = Math.min(gross, config.hours.baseDayHours); ot = Math.max(0, gross - config.hours.baseDayHours);
                finalStatus = 'Present';

                const netActualHours = aOut > aIn ? applyFixedBreak(aIn, aOut, breakStartMins, breakEndMins) : 0;
                if (netActualHours > config.hours.reviewThresh) {
                    finalRemarks = finalRemarks ? `${finalRemarks}; Review Hours` : 'Review Hours';
                }
            }
        }

        let gTime: number | null = null;
        let breakHours: number | null = null;
        let gHours: number | null = null;
        if (log.clockIn && log.clockOut) {
            const aIn = timeToMinutes(log.clockIn);
            const aOut = timeToMinutes(log.clockOut);
            if (aOut > aIn) {
                gTime = (aOut - aIn) / 60;
                gHours = applyFixedBreak(aIn, aOut, breakStartMins, breakEndMins);
                breakHours = gTime - gHours;
            }
        }

        results.push({
            date: log.date, dateBS: log.dateBS, bsYear: year, bsMonth: month, employeeName: employee.name, employeeId: employee.id,
            onDuty: effOnDuty, offDuty: effOffDuty, clockIn: log.clockIn, clockOut: log.clockOut, status: finalStatus,
            regularHours: reg, overtimeHours: ot, grossHours: reg + ot, calculatedAt: now, calculatedBy,
            remarks: finalRemarks || null, sourceLogId: log.id, rowIndex: log.rowIndex,
            weekday: format(logDate, 'EEEE'), absent: finalStatus === 'Absent', gTime, breakHours, gHours,
        });
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