
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

const parseTime = (timeInput: any): { hours: number, minutes: number, seconds: number } | null => {
    if (timeInput === null || timeInput === undefined || timeInput === '' || (typeof timeInput === 'string' && timeInput.trim() === '-')) return null;

    if (timeInput instanceof Date && !isNaN(timeInput.getTime())) {
        return { hours: timeInput.getHours(), minutes: timeInput.getMinutes(), seconds: timeInput.getSeconds() };
    }

    if (typeof timeInput === 'string') {
        const trimmedTime = timeInput.trim();
        const formats = ['HH:mm:ss', 'h:mm:ss a', 'HH:mm', 'h:mm a'];
        for (const fmt of formats) {
            try {
                const parsed = parse(trimmedTime, fmt, new Date());
                if (!isNaN(parsed.getTime())) {
                    return { hours: parsed.getHours(), minutes: parsed.getMinutes(), seconds: parsed.getSeconds() };
                }
            } catch {}
        }
    }
    
    if (typeof timeInput === 'number') { // Excel time as a fraction of a day
        if (timeInput < 0 || timeInput >= 1) return null;
        const totalSeconds = Math.round(timeInput * 86400);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        return { hours, minutes, seconds };
    }
    
    return null;
};

const combineDateAndTime = (baseDate: Date, time: { hours: number, minutes: number, seconds: number } | null): Date | null => {
    if (!time) return null;
    return setSeconds(setMinutes(setHours(startOfDay(baseDate), time.hours), time.minutes), time.seconds);
};

const roundToStep = (hours: number, step: number): number => {
    return Math.round(hours / step) * step;
};

const applyFixedBreak = (start: Date, end: Date): number => {
    if (!start || !end || end <= start) return 0;

    const totalMinutes = differenceInMinutes(end, start);
    
    // Break is from 12:00 (720 minutes) to 13:00 (780 minutes)
    const breakStartMinutes = 12 * 60;
    const breakEndMinutes = 13 * 60;

    const startMinutes = start.getHours() * 60 + start.getMinutes();
    const endMinutes = end.getHours() * 60 + end.getMinutes();

    const overlapStart = Math.max(startMinutes, breakStartMinutes);
    const overlapEnd = Math.min(endMinutes, breakEndMinutes);
    
    const overlapMinutes = Math.max(0, overlapEnd - overlapStart);

    // Only apply break if they worked more than 4 hours total
    if (overlapMinutes > 0 && totalMinutes > 4 * 60) {
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
    const clockInIndex = getIndex(['clock in', 'clockin', 'clock-in']);
    const clockOutIndex = getIndex(['clock out', 'clockout', 'clock-out']);
    const statusIndex = getIndex(['status']);


    if (nameIndex === -1 || dateIndex === -1) {
        throw new Error('Missing required "Name" or "Date" columns in the Excel file.');
    }

    const newRecords: Omit<AttendanceRecord, 'id'>[] = [];
    const employeeMap = new Map(existingEmployees.map(e => [cleanEmployeeName(e.name), e.name]));
    let skippedRows = 0;
    const newlyAddedEmployees = new Set<string>();

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

        const clockInTime = parseTime(clockInIndex > -1 ? row[clockInIndex] : null);
        const clockOutTime = parseTime(clockOutIndex > -1 ? row[clockOutIndex] : null);
        const onDutyTime = parseTime(onDutyIndex > -1 ? row[onDutyIndex] : null);
        const offDutyTime = parseTime(offDutyIndex > -1 ? row[offDutyIndex] : null);
        const statusValue = statusIndex > -1 ? String(row[statusIndex] || '').toUpperCase().trim() : '';

        
        let status: AttendanceRecord['status'] = 'Present';
        let remarks: string | null = null;
        let regularHours = 0, overtimeHours = 0, grossHours = 0;

        const clockInDate = combineDateAndTime(adDate, clockInTime);
        const clockOutDate = combineDateAndTime(adDate, clockOutTime);

        if (weekday === 6) { // Saturday
            status = 'Saturday';
            if (clockInDate && clockOutDate) {
                const workedHours = applyFixedBreak(clockInDate, clockOutDate);
                overtimeHours = roundToStep(workedHours, kRoundStepHours);
                grossHours = overtimeHours;
            }
        } else if (statusValue === 'TRUE') {
            status = 'Absent';
        } else if (statusValue === 'PUBLIC') {
            status = 'Public Holiday';
        } else { // Workday
            if (!clockInDate) {
                status = 'C/I Miss';
                remarks = "Missing IN";
            } else if (!clockOutDate) {
                status = 'C/O Miss';
                remarks = "Missing OUT";
            } else {
                const workedHours = applyFixedBreak(clockInDate, clockOutDate);
                grossHours = roundToStep(workedHours, kRoundStepHours);
                regularHours = Math.min(kBaseDayHours, grossHours);
                overtimeHours = Math.max(0, grossHours - kBaseDayHours);
            }
        }
        
        newRecords.push({
            date: dateStr,
            bsDate,
            employeeName: employeeNameInDb,
            onDuty: onDutyTime ? format(combineDateAndTime(new Date(), onDutyTime)!, 'HH:mm') : null,
            offDuty: offDutyTime ? format(combineDateAndTime(new Date(), offDutyTime)!, 'HH:mm') : null,
            clockIn: clockInTime ? format(combineDateAndTime(new Date(), clockInTime)!, 'HH:mm') : null,
            clockOut: clockOutTime ? format(combineDateAndTime(new Date(), clockOutTime)!, 'HH:mm') : null,
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

    