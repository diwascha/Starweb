
'use client';

import { format, parse, getDay, startOfWeek, differenceInMinutes, addMinutes, setHours, setMinutes, setSeconds, startOfDay, endOfDay, getDaysInMonth, addDays, isSameDay } from 'date-fns';
import NepaliDate from 'nepali-date-converter';
import type { AttendanceRecord, Employee, Payroll, PunctualityInsight, BehaviorInsight, PatternInsight, WorkforceAnalytics } from '@/lib/types';
import { addEmployee } from './employee-service';

// --- Constants translated from VBA ---
const kBaseDayHours = 8;
const kRoundStepHours = 0.5;
const kGraceMin = 5;
const kWeeklyFreeLate = true;
const kWeeklyFreeEarly = true;
const PR_MONTH_DAYS = 30;
const PR_BLOCK_MIN = 30;

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
    if (!start || !end || isBefore(end, start)) return 0;

    const totalMinutes = differenceInMinutes(end, start);
    
    // Break is from 12:00 PM to 1:00 PM
    const breakStartMinutes = 12 * 60;
    const breakEndMinutes = 13 * 60;

    const startMinutes = start.getHours() * 60 + start.getMinutes();
    const endMinutes = end.getHours() * 60 + end.getMinutes();

    // Calculate overlap between work period and break period
    const overlapStart = Math.max(startMinutes, breakStartMinutes);
    const overlapEnd = Math.min(endMinutes, breakEndMinutes);
    
    const overlapMinutes = Math.max(0, overlapEnd - overlapStart);
    
    // Only apply break if they worked more than 4 hours, to avoid penalizing short shifts
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

export interface PayrollAndAnalyticsData {
  payroll: Payroll[];
  punctuality: PunctualityInsight[];
  behavior: BehaviorInsight[];
  workforce: WorkforceAnalytics[];
  dayOfWeek: { day: string; lateArrivals: number; absenteeism: number }[];
  patternInsights: PatternInsight[];
}

export const generatePayrollAndAnalytics = (
    bsYear: number, bsMonth: number, employees: Employee[], attendance: AttendanceRecord[]
): PayrollAndAnalyticsData => {
    
    const filteredAttendance = attendance.filter(r => {
        const nepaliDate = new NepaliDate(new Date(r.date));
        return nepaliDate.getYear() === bsYear && nepaliDate.getMonth() === bsMonth;
    });

    const payroll: Payroll[] = employees.map(employee => {
        const empAttendance = filteredAttendance.filter(r => r.employeeName === employee.name);
        
        const totalHours = empAttendance.reduce((sum, r) => sum + r.grossHours, 0);
        const regularHours = empAttendance.reduce((sum, r) => sum + r.regularHours, 0);
        const otHours = empAttendance.reduce((sum, r) => sum + r.overtimeHours, 0);
        const absentDays = empAttendance.filter(r => r.status === 'Absent').length;
        
        let rate = 0;
        let regularPay = 0;
        let otPay = 0;

        if (employee.wageBasis === 'Monthly') {
            const dailyRate = employee.wageAmount / PR_MONTH_DAYS;
            rate = dailyRate / kBaseDayHours;
            regularPay = employee.wageAmount; // Start with full salary
            otPay = rate * otHours;
        } else { // Hourly
            rate = employee.wageAmount;
            regularPay = regularHours * rate;
            otPay = otHours * rate;
        }
        
        const deduction = (employee.wageBasis === 'Monthly' ? (employee.wageAmount / PR_MONTH_DAYS) * absentDays : 0);
        const totalPay = regularPay + otPay;
        const allowance = 0; // Will be set by user
        const salaryTotal = totalPay + allowance - deduction;
        const tds = salaryTotal * 0.01;
        const gross = salaryTotal - tds;
        const advance = 0; // Will be set by user
        const netPayment = gross - advance;

        return {
            employeeId: employee.id, employeeName: employee.name,
            totalHours, otHours, regularHours, rate,
            regularPay, otPay, totalPay, absentDays, deduction, allowance,
            salaryTotal, tds, gross, advance, netPayment, remark: ''
        };
    });

    const scheduledDays = new NepaliDate(bsYear, bsMonth, 1).daysInMonth;
    const punctuality: PunctualityInsight[] = employees.map(employee => {
        const empAttendance = filteredAttendance.filter(r => r.employeeName === employee.name);
        const presentDays = empAttendance.filter(r => ['Present', 'Saturday', 'Public Holiday'].includes(r.status) && r.grossHours > 0).length + empAttendance.filter(r => r.status === 'C/I Miss' || r.status === 'C/O Miss').length;

        const absentDays = empAttendance.filter(r => r.status === 'Absent').length;
        const attendanceRate = scheduledDays > 0 ? (presentDays / scheduledDays) * 100 : 0;
        
        let lateArrivals = 0;
        let earlyDepartures = 0;

        empAttendance.forEach(r => {
            if (r.onDuty && r.clockIn) {
                const onDuty = parse(r.onDuty, 'HH:mm', new Date());
                const clockIn = parse(r.clockIn, 'HH:mm', new Date());
                if (differenceInMinutes(clockIn, onDuty) > kGraceMin) lateArrivals++;
            }
             if (r.offDuty && r.clockOut) {
                const offDuty = parse(r.offDuty, 'HH:mm', new Date());
                const clockOut = parse(r.clockOut, 'HH:mm', new Date());
                if (differenceInMinutes(offDuty, clockOut) > kGraceMin) earlyDepartures++;
            }
        });
        
        const onTimeDays = presentDays - lateArrivals - earlyDepartures;
        const punctualityScore = presentDays > 0 ? (onTimeDays / presentDays) * 100 : 0;

        return { employeeId: employee.id, employeeName: employee.name, scheduledDays, presentDays, absentDays, attendanceRate, lateArrivals, earlyDepartures, onTimeDays, punctualityScore };
    });
    
    const behavior: BehaviorInsight[] = employees.map(employee => {
        const empPunctuality = punctuality.find(p => p.employeeId === employee.id)!;
        const empPayroll = payroll.find(p => p.employeeId === employee.id)!;
        const empAttendance = filteredAttendance.filter(r => r.employeeName === employee.name);

        let stayLateDays = 0;
        let leaveEarlyDays = 0;
        empAttendance.forEach(r => {
             if (r.offDuty && r.clockOut) {
                const offDuty = parse(r.offDuty, 'HH:mm', new Date());
                const clockOut = parse(r.clockOut, 'HH:mm', new Date());
                const diff = differenceInMinutes(clockOut, offDuty);
                if (diff >= 5) stayLateDays++;
                else if (diff <= -5) leaveEarlyDays++;
            }
        });

        const shiftEndBehavior = (leaveEarlyDays > stayLateDays) && (leaveEarlyDays >= 3) 
            ? 'Tends to leave early'
            : (stayLateDays >= 3) && (stayLateDays > leaveEarlyDays) 
            ? 'Stays late often'
            : 'Consistent timing';

        let performanceInsight = '';
        if (empPunctuality.punctualityScore >= 95 && empPayroll.otHours >= 2 && empAttendance.filter(r => r.status === 'C/I Miss' || r.status === 'C/O Miss').length <= 1) {
            performanceInsight = 'Dedicated with extra effort';
        } else if (empPunctuality.punctualityScore >= 90 && empAttendance.filter(r => r.status === 'C/I Miss' || r.status === 'C/O Miss').length <= 2) {
            performanceInsight = 'Solid performance';
        } else if (empPunctuality.punctualityScore < 80 || empAttendance.filter(r => r.status === 'C/I Miss' || r.status === 'C/O Miss').length >= 3) {
            performanceInsight = 'Needs improvement';
        } else {
            performanceInsight = 'Improving punctuality';
        }
        
        return {
            employeeId: employee.id, employeeName: employee.name,
            punctualityTrend: empPunctuality.punctualityScore > 95 ? 'Consistently punctual' : empPunctuality.punctualityScore > 85 ? 'Stable with some delays' : 'Often late',
            absencePattern: empPunctuality.absentDays === 0 ? 'Perfect attendance' : empPunctuality.absentDays <= 2 ? 'Occasional absences' : `Frequent absences (${empPunctuality.absentDays} days)`,
            otImpact: empPayroll.otHours >= 15 ? 'High OT - monitor workload' : empPayroll.otHours >= 5 ? 'Moderate OT' : 'Balanced workload',
            shiftEndBehavior: shiftEndBehavior,
            performanceInsight: performanceInsight,
        };
    });
    
    const workforce: WorkforceAnalytics[] = employees.map(employee => {
        const empPayroll = payroll.find(p => p.employeeId === employee.id)!;
        const empAttendance = filteredAttendance.filter(r => r.employeeName === employee.name);

        const overtimeRatio = empPayroll.regularHours > 0 ? (empPayroll.otHours / empPayroll.regularHours) * 100 : 0;
        const saturdaysWorked = empAttendance.filter(r => r.status === 'Saturday').length;

        let onTimeStreak = 0;
        let currentStreak = 0;
        empAttendance
            .sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime())
            .forEach(r => {
                let isLate = false;
                let isEarly = false;
                if (r.onDuty && r.clockIn) {
                    const onDuty = parse(r.onDuty, 'HH:mm', new Date());
                    const clockIn = parse(r.clockIn, 'HH:mm', new Date());
                    if (differenceInMinutes(clockIn, onDuty) > kGraceMin) isLate = true;
                }
                if (r.offDuty && r.clockOut) {
                    const offDuty = parse(r.offDuty, 'HH:mm', new Date());
                    const clockOut = parse(r.clockOut, 'HH:mm', new Date());
                    if (differenceInMinutes(offDuty, clockOut) > kGraceMin) isEarly = true;
                }

                if (!isLate && !isEarly && ['Present', 'Saturday'].includes(r.status)) {
                    currentStreak++;
                } else {
                    onTimeStreak = Math.max(onTimeStreak, currentStreak);
                    currentStreak = 0;
                }
            });
        onTimeStreak = Math.max(onTimeStreak, currentStreak);

        return {
            employeeId: employee.id,
            employeeName: employee.name,
            overtimeRatio,
            onTimeStreak,
            saturdaysWorked,
        };
    });

    const dayOfWeekData = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((dayName, index) => {
        const dayRecords = filteredAttendance.filter(r => getDay(new Date(r.date)) === index);
        let lateArrivals = 0;
        dayRecords.forEach(r => {
             if (r.onDuty && r.clockIn) {
                const onDuty = parse(r.onDuty, 'HH:mm', new Date());
                const clockIn = parse(r.clockIn, 'HH:mm', new Date());
                if (differenceInMinutes(clockIn, onDuty) > kGraceMin) lateArrivals++;
            }
        });
        const absenteeism = dayRecords.filter(r => r.status === 'Absent').length;
        return { day: dayName, lateArrivals, absenteeism };
    });

    // Pattern Insights Calculation
    const patternInsights: PatternInsight[] = [];
    const totalLateArrivals = dayOfWeekData.reduce((sum, d) => sum + d.lateArrivals, 0);
    const totalAbsenteeism = dayOfWeekData.reduce((sum, d) => sum + d.absenteeism, 0);

    if (totalLateArrivals > 0) {
        const mostLateDay = dayOfWeekData.reduce((max, day) => day.lateArrivals > max.lateArrivals ? day : max);
        patternInsights.push({ finding: `Highest late arrivals: ${mostLateDay.day}`, description: `${mostLateDay.lateArrivals} late arrivals occurred on ${mostLateDay.day}s this month.` });
    }

    if (totalAbsenteeism > 0) {
        const mostAbsentDay = dayOfWeekData.reduce((max, day) => day.absenteeism > max.absenteeism ? day : max);
        patternInsights.push({ finding: `Highest absenteeism: ${mostAbsentDay.day}`, description: `${mostAbsentDay.absenteeism} absences occurred on ${mostAbsentDay.day}s this month.` });
    }

    const firstWeekLate = filteredAttendance.filter(r => new NepaliDate(new Date(r.date)).getDate() <= 7 && r.clockIn && r.onDuty && differenceInMinutes(parse(r.clockIn, 'HH:mm', new Date()), parse(r.onDuty, 'HH:mm', new Date())) > kGraceMin).length;
    const lastWeekLate = filteredAttendance.filter(r => new NepaliDate(new Date(r.date)).getDate() >= scheduledDays - 6 && r.clockIn && r.onDuty && differenceInMinutes(parse(r.clockIn, 'HH:mm', new Date()), parse(r.onDuty, 'HH:mm', new Date())) > kGraceMin).length;
    if (lastWeekLate > firstWeekLate && firstWeekLate > 0) {
        const increase = ((lastWeekLate - firstWeekLate) / firstWeekLate) * 100;
        patternInsights.push({ finding: `End-of-month trend: Late arrivals increase by ${increase.toFixed(0)}%`, description: `Compared to the first week, late arrivals increased by ${increase.toFixed(0)}% in the last week of the month.` });
    }

    let highOtNextDayLate = 0;
    const highOtThreshold = 3; // e.g., 3 hours of OT
    employees.forEach(emp => {
        const empAttendance = filteredAttendance.filter(r => r.employeeName === emp.name).sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        for (let i = 0; i < empAttendance.length - 1; i++) {
            const currentDay = empAttendance[i];
            const nextDay = empAttendance[i+1];
            if (currentDay.overtimeHours > highOtThreshold) {
                const nextDayDate = new Date(nextDay.date);
                const expectedNextDay = addDays(new Date(currentDay.date), 1);
                if (isSameDay(nextDayDate, expectedNextDay) && nextDay.clockIn && nextDay.onDuty && differenceInMinutes(parse(nextDay.clockIn, 'HH:mm', new Date()), parse(nextDay.onDuty, 'HH:mm', new Date())) > kGraceMin) {
                     highOtNextDayLate++;
                }
            }
        }
    });

    if (highOtNextDayLate > 0) {
        patternInsights.push({ finding: 'Employees with high OT may arrive late the next day', description: `There were ${highOtNextDayLate} instances of an employee being late the day after working significant overtime.` });
    }

    return { payroll, punctuality, behavior, workforce, dayOfWeek: dayOfWeekData, patternInsights };
};
