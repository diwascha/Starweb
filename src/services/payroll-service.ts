
'use client';

import { format, parse, getDay, startOfWeek, differenceInMinutes, addMinutes, setHours, setMinutes, setSeconds, startOfDay, endOfDay } from 'date-fns';
import NepaliDate from 'nepali-date-converter';
import type { AttendanceRecord, Employee } from '@/lib/types';
import { addEmployee } from './employee-service';

// --- Constants translated from VBA ---
const kBaseDayHours = 8;
const kRoundStepHours = 0.5;
const kGraceMin = 5;
const kWeeklyFreeLate = true;
const kWeeklyFreeEarly = true;

// --- Helper Functions ---
const cleanEmployeeName = (name: any): string => {
  if (typeof name !== 'string') return '';
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
};

const parseDate = (dateInput: any): Date | null => {
    if (!dateInput) return null;
    if (dateInput instanceof Date && !isNaN(dateInput.getTime())) {
        return dateInput;
    }
    if (typeof dateInput === 'number') { // Excel date serial number
        const excelEpoch = new Date(1899, 11, 30);
        return new Date(excelEpoch.getTime() + dateInput * 24 * 60 * 60 * 1000);
    }
    if (typeof dateInput === 'string') {
        const dateOnlyString = dateInput.split(' ')[0];
        const formats = ['MM/dd/yyyy', 'yyyy-MM-dd', 'M/d/yy', 'M/d/yyyy', 'd/M/yyyy'];
        for (const fmt of formats) {
            try {
                const parsed = parse(dateOnlyString, fmt, new Date());
                if(!isNaN(parsed.getTime())) return parsed;
            } catch {}
        }
    }
    return null;
};

const parseTime = (time: any): Date | null => {
    if (time === null || time === undefined || time === '' || time === 0 || (typeof time === 'string' && time.trim() === '-')) return null;
    if (time instanceof Date) {
      if (isNaN(time.getTime())) return null;
      return time;
    }
    if (typeof time === 'string') {
      const trimmedTime = time.trim();
      const formats = ['HH:mm:ss', 'h:mm:ss a', 'HH:mm', 'h:mm a'];
      for (const fmt of formats) {
          try {
              const parsedTime = parse(trimmedTime, fmt, new Date());
              if (!isNaN(parsedTime.getTime())) return parsedTime;
          } catch {}
      }
    }
    if (typeof time === 'number') { 
      if (time < 0 || time >= 1) return null;
      const excelEpoch = new Date(1899, 11, 30);
      const date = new Date(excelEpoch.getTime() + time * 24 * 60 * 60 * 1000);
      if (isNaN(date.getTime())) return null;
      return date;
    }
    return null;
};

const combineDateAndTime = (baseDate: Date, time: Date): Date => {
    return new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate(), time.getHours(), time.getMinutes(), time.getSeconds());
};

const roundToStep = (hours: number, step: number): number => {
    return Math.round(hours / step) * step;
};

const applyFixedBreak = (start: Date, end: Date): number => {
    const totalMinutes = differenceInMinutes(end, start);
    if (totalMinutes <= 0) return 0;

    const breakStartOnDate = setSeconds(setMinutes(setHours(start, 12), 0), 0);
    const breakEndOnDate = setSeconds(setMinutes(setHours(start, 13), 0), 0);

    const overlapStart = Math.max(start.getTime(), breakStartOnDate.getTime());
    const overlapEnd = Math.min(end.getTime(), breakEndOnDate.getTime());
    
    const overlapMinutes = Math.max(0, (overlapEnd - overlapStart) / (1000 * 60));

    if (overlapMinutes > 0 && totalMinutes > 4 * 60) { // totalMinutes is > 4 hours
        return (totalMinutes - overlapMinutes) / 60;
    }
    return totalMinutes / 60;
};


// --- Main Processing Logic ---
export const processAttendanceImport = async (
    jsonData: any[][], 
    existingEmployees: Employee[], 
    username: string
) => {
    if (!jsonData || jsonData.length < 2) {
        throw new Error('Excel file is empty or missing a header row.');
    }

    const headerRow = jsonData[0].map(h => String(h).toLowerCase().trim());
    const dataRows = jsonData.slice(1);
    
    const getIndex = (aliases: string[]) => aliases.map(alias => headerRow.findIndex(h => h === alias)).find(i => i !== -1) ?? -1;

    const nameIndex = getIndex(['name']);
    const dateIndex = getIndex(['date']);
    const onDutyIndex = getIndex(['on duty', 'onduty']);
    const offDutyIndex = getIndex(['off duty', 'offduty']);
    const clockInIndex = getIndex(['clock in', 'clockin']);
    const clockOutIndex = getIndex(['clock out', 'clockout']);
    const statusIndex = getIndex(['status']);


    if (nameIndex === -1 || dateIndex === -1) {
        throw new Error('Missing required "Name" or "Date" columns in the Excel file.');
    }

    const newRecords: Omit<AttendanceRecord, 'id'>[] = [];
    const employeeMap = new Map(existingEmployees.map(e => [cleanEmployeeName(e.name), e.name]));
    let skippedRows = 0;
    const newlyAddedEmployees = new Set<string>();

    const weeklyFreeLateUsed = new Map<string, boolean>();
    const weeklyFreeEarlyUsed = new Map<string, boolean>();

    for (const row of dataRows) {
        const nameFromFile = String(row[nameIndex] || '').trim();
        const cleanedNameFromFile = cleanEmployeeName(nameFromFile);
        let employeeNameInDb = employeeMap.get(cleanedNameFromFile);
        const adDate = parseDate(row[dateIndex]);

        if (!adDate || !nameFromFile) {
            skippedRows++;
            continue;
        }

        if (!employeeNameInDb) {
            try {
                await addEmployee({ name: nameFromFile, wageBasis: 'Monthly', wageAmount: 0, createdBy: username });
                employeeNameInDb = nameFromFile;
                employeeMap.set(cleanedNameFromFile, nameFromFile);
                newlyAddedEmployees.add(nameFromFile);
            } catch (error) {
                console.error(`Failed to add new employee ${nameFromFile}:`, error);
                skippedRows++;
                continue;
            }
        }

        const dateStr = adDate.toISOString();
        const nepaliDate = new NepaliDate(adDate);
        const bsDate = nepaliDate.format('YYYY-MM-DD');
        const weekday = getDay(adDate); // 0 = Sunday

        const clockInValue = parseTime(clockInIndex > -1 ? row[clockInIndex] : null);
        const clockOutValue = parseTime(clockOutIndex > -1 ? row[clockOutIndex] : null);
        const onDutyValue = parseTime(onDutyIndex > -1 ? row[onDutyIndex] : null);
        const offDutyValue = parseTime(offDutyIndex > -1 ? row[offDutyIndex] : null);
        const statusValue = statusIndex > -1 ? String(row[statusIndex] || '').toUpperCase().trim() : '';

        
        let status: AttendanceRecord['status'] = 'Present';
        let remarks: string | null = null;
        let regularHours = 0, overtimeHours = 0, grossHours = 0;

        if (weekday === 6) { // Saturday
            status = 'Saturday';
            if (clockInValue && clockOutValue) {
                const workedHours = applyFixedBreak(combineDateAndTime(adDate, clockInValue), combineDateAndTime(adDate, clockOutValue));
                overtimeHours = roundToStep(workedHours, kRoundStepHours);
                grossHours = overtimeHours;
            }
        } else if (statusValue === 'TRUE') {
            status = 'Absent';
        } else if (statusValue === 'PUBLIC') {
            status = 'Public Holiday';
        } else { // Workday
            if (!clockInValue) {
                status = 'C/I Miss';
                remarks = "Missing IN";
            } else if (!clockOutValue) {
                status = 'C/O Miss';
                remarks = "Missing OUT";
            } else if (!onDutyValue || !offDutyValue) {
                status = 'Present';
                remarks = "Missing schedule On/Off Duty";
                const worked = applyFixedBreak(combineDateAndTime(adDate, clockInValue), combineDateAndTime(adDate, clockOutValue));
                grossHours = roundToStep(worked, kRoundStepHours);
                regularHours = Math.min(kBaseDayHours, grossHours);
                overtimeHours = Math.max(0, grossHours - kBaseDayHours);
            } else {
                // Full calculation logic
                const scheduleIn = combineDateAndTime(adDate, onDutyValue);
                const scheduleOut = combineDateAndTime(adDate, offDutyValue);
                const actualIn = combineDateAndTime(adDate, clockInValue);
                const actualOut = combineDateAndTime(adDate, clockOutValue);

                let lateMin = Math.max(0, differenceInMinutes(actualIn, scheduleIn));
                let earlyMin = Math.max(0, differenceInMinutes(scheduleOut, actualOut));
                
                let latePenaltyMin = 0;
                let earlyPenaltyMin = 0;
                const weekKey = `${employeeNameInDb}-${format(startOfWeek(adDate, { weekStartsOn: 0 }), 'yyyy-MM-dd')}`;
                
                if (lateMin > 0) {
                    if (lateMin <= kGraceMin) {
                        if (kWeeklyFreeLate && !weeklyFreeLateUsed.has(weekKey)) {
                            weeklyFreeLateUsed.set(weekKey, true);
                        } else {
                            latePenaltyMin = 30;
                        }
                    } else {
                        latePenaltyMin = Math.ceil((lateMin - kGraceMin) / 30) * 30;
                    }
                }
                
                if (earlyMin > 0) {
                     if (earlyMin <= kGraceMin) {
                        if (kWeeklyFreeEarly && !weeklyFreeEarlyUsed.has(weekKey)) {
                            weeklyFreeEarlyUsed.set(weekKey, true);
                        } else {
                            earlyPenaltyMin = 30;
                        }
                    } else {
                        earlyPenaltyMin = Math.ceil((earlyMin - kGraceMin) / 30) * 30;
                    }
                }

                const effectiveIn = addMinutes(scheduleIn, latePenaltyMin);
                const effectiveOut = addMinutes(scheduleOut, -earlyPenaltyMin);
                
                const paidHours = effectiveOut > effectiveIn ? applyFixedBreak(effectiveIn, effectiveOut) : 0;
                grossHours = roundToStep(paidHours, kRoundStepHours);
                regularHours = Math.min(kBaseDayHours, grossHours);
                overtimeHours = Math.max(0, grossHours - kBaseDayHours);
            }
        }
        
        newRecords.push({
            date: dateStr,
            bsDate,
            employeeName: employeeNameInDb,
            onDuty: onDutyValue ? format(onDutyValue, 'HH:mm') : null,
            offDuty: offDutyValue ? format(offDutyValue, 'HH:mm') : null,
            clockIn: clockInValue ? format(clockInValue, 'HH:mm') : null,
            clockOut: clockOutValue ? format(clockOutValue, 'HH:mm') : null,
            status,
            grossHours,
            overtimeHours,
            regularHours,
            remarks,
            importedBy: username,
        });
    }

    return { newRecords, newlyAddedEmployees, skippedRows };
};
