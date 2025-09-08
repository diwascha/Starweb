
'use client';

import {
  format,
  parse,
  getDay,
  differenceInMinutes,
  startOfDay,
  getDaysInMonth,
  isAfter,
  isBefore,
  isEqual,
  setHours,
  setMinutes,
  setSeconds,
  startOfWeek,
  endOfWeek,
} from 'date-fns';
import NepaliDate from 'nepali-date-converter';
import type {
  AttendanceRecord,
  Employee,
  Payroll,
  PunctualityInsight,
  BehaviorInsight,
  PatternInsight,
  WorkforceAnalytics,
} from '@/lib/types';
import { addEmployee } from './employee-service';

// --- Constants ---
const kBaseDayHours = 8;
const kRoundStepHours = 0.5;
const kGraceMin = 5;
const PR_MONTH_DAYS = 30;

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
  if (typeof dateInput === 'number') {
    // Excel date serial number
    const excelEpoch = new Date(1899, 11, 30);
    return new Date(excelEpoch.getTime() + dateInput * 24 * 60 * 60 * 1000);
  }
  if (typeof dateInput === 'string') {
    const dateOnlyString = dateInput.split(' ')[0];
    const formats = [
      'MM/dd/yyyy',
      'yyyy-MM-dd',
      'M/d/yy',
      'M/d/yyyy',
      'd/M/yyyy',
    ];
    for (const fmt of formats) {
      try {
        const parsed = parse(dateOnlyString, fmt, new Date());
        if (!isNaN(parsed.getTime())) return parsed;
      } catch {}
    }
  }
  return null;
};

const combineDateAndTime = (
  baseDate: Date,
  time: { hours: number; minutes: number; seconds: number } | null
): Date | null => {
  if (!time) return null;
  return setSeconds(
    setMinutes(setHours(startOfDay(baseDate), time.hours), time.minutes),
    time.seconds
  );
};

const parseTime = (
  timeInput: any
): { hours: number; minutes: number; seconds: number } | null => {
  if (
    timeInput === null ||
    timeInput === undefined ||
    timeInput === '' ||
    (typeof timeInput === 'string' && timeInput.trim() === '-')
  )
    return null;

  if (timeInput instanceof Date && !isNaN(timeInput.getTime())) {
    return {
      hours: timeInput.getHours(),
      minutes: timeInput.getMinutes(),
      seconds: timeInput.getSeconds(),
    };
  }

  if (typeof timeInput === 'string') {
    const trimmedTime = timeInput.trim();
    const formats = ['HH:mm:ss', 'h:mm:ss a', 'HH:mm', 'h:mm a'];
    for (const fmt of formats) {
      try {
        const parsed = parse(trimmedTime, fmt, new Date());
        if (!isNaN(parsed.getTime())) {
          return {
            hours: parsed.getHours(),
            minutes: parsed.getMinutes(),
            seconds: parsed.getSeconds(),
          };
        }
      } catch {}
    }
  }

  if (typeof timeInput === 'number') {
    // Excel time as a fraction of a day
    if (timeInput < 0 || timeInput >= 1) return null;
    const totalSeconds = Math.round(timeInput * 86400);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return { hours, minutes, seconds };
  }

  return null;
};

const roundToStep = (hours: number, step: number): number => {
  return Math.ceil(hours / step) * step;
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

  const headerRow = jsonData[0].map((h) => String(h).toLowerCase().trim());
  const dataRows = jsonData.slice(1);

  const getIndex = (aliases: string[]) =>
    aliases.map((alias) => headerRow.findIndex((h) => h === alias)).find((i) => i !== -1) ?? -1;

  const nameIndex = getIndex(['name']);
  const dateIndex = getIndex(['date']);
  const onDutyIndex = getIndex(['on duty', 'onduty']);
  const offDutyIndex = getIndex(['off duty', 'offduty']);
  const clockInIndex = getIndex(['clock in', 'clockin', 'clock-in']);
  const clockOutIndex = getIndex(['clock out', 'clockout', 'clock-out']);
  const statusIndex = getIndex(['status']);

  if (nameIndex === -1 || dateIndex === -1) {
    throw new Error(
      'Missing required "Name" or "Date" columns in the Excel file.'
    );
  }

  const newRecords: Omit<AttendanceRecord, 'id'>[] = [];
  const employeeMap = new Map(
    existingEmployees.map((e) => [cleanEmployeeName(e.name), e.name])
  );
  let skippedRows = 0;
  const newlyAddedEmployees = new Set<string>();
  const weeklyGraceUsed = new Map<string, { late: boolean; early: boolean }>();

  for (const row of dataRows) {
    const nameFromFile = String(row[nameIndex] || '').trim();
    const cleanedNameFromFile = cleanEmployeeName(nameFromFile);
    let employeeNameInDb = employeeMap.get(cleanedNameFromFile);
    const adDate = parseDate(row[dateIndex]);

    if (!adDate || !nameFromFile) {
      skippedRows++;
      continue;
    }
    
    // Reset weekly grace tracker for each new week
    const weekKey = `${employeeNameInDb}-${format(startOfWeek(adDate), 'yyyy-MM-dd')}`;
    if (!weeklyGraceUsed.has(weekKey)) {
        weeklyGraceUsed.set(weekKey, { late: false, early: false });
    }
    const grace = weeklyGraceUsed.get(weekKey)!;


    if (!employeeNameInDb) {
      try {
        await addEmployee({
          name: nameFromFile,
          wageBasis: 'Monthly',
          wageAmount: 0,
          createdBy: username,
          status: 'Working',
        });
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
    const weekday = getDay(adDate);

    const clockInTime = parseTime(clockInIndex > -1 ? row[clockInIndex] : null);
    const clockOutTime = parseTime(clockOutIndex > -1 ? row[clockOutIndex] : null);
    const onDutyTime = parseTime(onDutyIndex > -1 ? row[onDutyIndex] : null);
    const offDutyTime = parseTime(offDutyIndex > -1 ? row[offDutyIndex] : null);
    const statusValue =
      statusIndex > -1 ? String(row[statusIndex] || '').toUpperCase().trim() : '';

    let status: AttendanceRecord['status'] = 'Present';
    let remarks: string | null = null;
    let regularHours = 0,
      overtimeHours = 0,
      grossHours = 0;

    const clockInDate = combineDateAndTime(adDate, clockInTime);
    const clockOutDate = combineDateAndTime(adDate, clockOutTime);
    const onDutyDate = combineDateAndTime(adDate, onDutyTime);
    const offDutyDate = combineDateAndTime(adDate, offDutyTime);

    if (weekday === 6) { // Saturday logic
      status = 'Saturday';
      if (clockInDate && clockOutDate && isAfter(clockOutDate, clockInDate)) {
        const totalMinutes = differenceInMinutes(clockOutDate, clockInDate);
        overtimeHours = roundToStep(totalMinutes / 60, kRoundStepHours);
        grossHours = overtimeHours;
      }
    } else if (statusValue === 'PUBLIC') {
        status = 'Public Holiday';
        regularHours = 8.0; // Base 8 hours for public holidays
        if (clockInDate && clockOutDate && isAfter(clockOutDate, clockInDate)) {
            const totalMinutes = differenceInMinutes(clockOutDate, clockInDate);
            overtimeHours = roundToStep(totalMinutes / 60, kRoundStepHours);
        }
        grossHours = regularHours + overtimeHours;
    } else if (statusValue === 'TRUE') {
      status = 'Absent';
    } else {
      // Normal workday logic (Sun-Fri)
      if (!clockInDate || !onDutyDate) {
        status = 'C/I Miss';
        remarks = 'Missing IN';
      } else if (!clockOutDate || !offDutyDate) {
        status = 'C/O Miss';
        remarks = 'Missing OUT';
      } else {
        let lateMinutes = Math.max(0, differenceInMinutes(clockInDate, onDutyDate));
        let earlyMinutes = Math.max(0, differenceInMinutes(offDutyDate, clockOutDate));
        
        let latePenalty = 0;
        if (lateMinutes > kGraceMin) {
            if (!grace.late) {
                grace.late = true; // Use up the weekly grace
            } else {
                latePenalty = Math.ceil(lateMinutes / 30) * 30;
            }
        }

        let earlyPenalty = 0;
        if (earlyMinutes > kGraceMin) {
            if (!grace.early) {
                grace.early = true; // Use up the weekly grace
            } else {
                earlyPenalty = Math.ceil(earlyMinutes / 30) * 30;
            }
        }
        
        const scheduledMinutes = differenceInMinutes(offDutyDate, onDutyDate);
        let paidMinutes = scheduledMinutes - latePenalty - earlyPenalty;
        
        const penaltyTrimmedStart = new Date(onDutyDate.getTime() + latePenalty * 60000);
        const penaltyTrimmedEnd = new Date(offDutyDate.getTime() - earlyPenalty * 60000);

        const breakStart = setMinutes(setHours(startOfDay(adDate), 12), 0);
        const breakEnd = setMinutes(setHours(startOfDay(adDate), 13), 0);
        
        const overlapsBreak = isBefore(penaltyTrimmedStart, breakEnd) && isAfter(penaltyTrimmedEnd, breakStart);
        const longEnoughForBreak = paidMinutes > 4 * 60;
        
        if(overlapsBreak && longEnoughForBreak) {
            paidMinutes -= 60;
        }

        let workedHours = Math.max(0, paidMinutes / 60);
        regularHours = roundToStep(workedHours, kRoundStepHours);

        if (statusValue === 'EXTRAOK') {
            const beforeScheduled = onDutyDate && clockInDate ? Math.max(0, differenceInMinutes(onDutyDate, clockInDate)) : 0;
            const afterScheduled = offDutyDate && clockOutDate ? Math.max(0, differenceInMinutes(clockOutDate, offDutyDate)) : 0;
            
            const extraOTMinutes = (beforeScheduled > kGraceMin ? beforeScheduled : 0) + (afterScheduled > kGraceMin ? afterScheduled : 0);
            overtimeHours = roundToStep(extraOTMinutes / 60, kRoundStepHours);
        }

        grossHours = regularHours + overtimeHours;
      }
    }

    newRecords.push({
      date: dateStr,
      bsDate,
      employeeName: employeeNameInDb,
      onDuty: onDutyTime
        ? format(combineDateAndTime(new Date(), onDutyTime)!, 'HH:mm')
        : null,
      offDuty: offDutyTime
        ? format(combineDateAndTime(new Date(), offDutyTime)!, 'HH:mm')
        : null,
      clockIn: clockInTime
        ? format(combineDateAndTime(new Date(), clockInTime)!, 'HH:mm')
        : null,
      clockOut: clockOutTime
        ? format(combineDateAndTime(new Date(), clockOutTime)!, 'HH:mm')
        : null,
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
  bsYear: number,
  bsMonth: number,
  employees: Employee[],
  attendance: AttendanceRecord[]
): PayrollAndAnalyticsData => {
  const filteredAttendance = attendance.filter((r) => {
    try {
      const nepaliDate = new NepaliDate(new Date(r.date));
      return nepaliDate.getYear() === bsYear && nepaliDate.getMonth() === bsMonth;
    } catch (e) {
      return false;
    }
  });

  const payroll: Payroll[] = employees.map((employee) => {
    const empAttendance = filteredAttendance.filter(
      (r) => r.employeeName === employee.name
    );

    const totalHours = empAttendance.reduce((sum, r) => sum + r.grossHours, 0);
    const regularHours = empAttendance.reduce((sum, r) => sum + r.regularHours, 0);
    const otHours = empAttendance.reduce((sum, r) => sum + r.overtimeHours, 0);
    const absentDays = empAttendance.filter((r) => r.status === 'Absent').length;

    let rate = 0;
    let regularPay = 0;
    let otPay = 0;

    if (employee.wageBasis === 'Monthly') {
      const dailyRate = employee.wageAmount / PR_MONTH_DAYS;
      rate = dailyRate / kBaseDayHours;
      regularPay = employee.wageAmount; // Start with full salary
      otPay = rate * otHours * 2; // OT is double pay
    } else {
      // Hourly
      rate = employee.wageAmount;
      regularPay = regularHours * rate;
      otPay = otHours * rate * 2; // OT is double pay
    }

    const deduction =
      employee.wageBasis === 'Monthly'
        ? (employee.wageAmount / PR_MONTH_DAYS) * absentDays
        : 0;
    const totalPay = regularPay + otPay;
    const allowance = 0; // Will be set by user
    const salaryTotal = totalPay + allowance - deduction;
    const tds = salaryTotal * 0.01;
    const gross = salaryTotal - tds;
    const advance = 0; // Will be set by user
    const netPayment = gross - advance;

    return {
      employeeId: employee.id,
      employeeName: employee.name,
      totalHours,
      otHours,
      regularHours,
      rate,
      regularPay,
      otPay,
      totalPay,
      absentDays,
      deduction,
      allowance,
      salaryTotal,
      tds,
      gross,
      advance,
      netPayment,
      remark: '',
    };
  });

  const nextMonthFirstDayBS = new NepaliDate(
    bsMonth === 11 ? bsYear + 1 : bsYear,
    (bsMonth + 1) % 12,
    1
  );
  const lastDayOfCurrentMonthBS = new NepaliDate(
    nextMonthFirstDayBS.toJsDate().getTime() - 86400000
  );
  const scheduledDays = lastDayOfCurrentMonthBS.getDate();

  const punctuality: PunctualityInsight[] = employees.map((employee) => {
    const empAttendance = filteredAttendance.filter(
      (r) => r.employeeName === employee.name
    );
    const presentDays =
      empAttendance.filter(
        (r) =>
          ['Present', 'Saturday', 'Public Holiday'].includes(r.status) &&
          r.grossHours > 0
      ).length +
      empAttendance.filter((r) => r.status === 'C/I Miss' || r.status === 'C/O Miss')
        .length;

    const absentDays = empAttendance.filter((r) => r.status === 'Absent').length;
    const attendanceRate =
      scheduledDays > 0 ? (presentDays / scheduledDays) * 100 : 0;

    let lateArrivals = 0;
    let earlyDepartures = 0;

    empAttendance.forEach((r) => {
      if (r.onDuty && r.clockIn) {
        const onDuty = parse(r.onDuty, 'HH:mm', new Date());
        const clockIn = parse(r.clockIn, 'HH:mm', new Date());
        if (differenceInMinutes(clockIn, onDuty) > kGraceMin) lateArrivals++;
      }
      if (r.offDuty && r.clockOut) {
        const offDuty = parse(r.offDuty, 'HH:mm', new Date());
        const clockOut = parse(r.clockOut, 'HH:mm', new Date());
        if (differenceInMinutes(offDuty, clockOut) > kGraceMin)
          earlyDepartures++;
      }
    });

    const onTimeDays = presentDays - lateArrivals - earlyDepartures;
    const punctualityScore = presentDays > 0 ? (onTimeDays / presentDays) * 100 : 0;

    return {
      employeeId: employee.id,
      employeeName: employee.name,
      scheduledDays,
      presentDays,
      absentDays,
      attendanceRate,
      lateArrivals,
      earlyDepartures,
      onTimeDays,
      punctualityScore,
    };
  });

  const behavior: BehaviorInsight[] = employees.map((employee) => {
    const empPunctuality = punctuality.find((p) => p.employeeId === employee.id)!;
    const empPayroll = payroll.find((p) => p.employeeId === employee.id)!;
    const empAttendance = filteredAttendance.filter(
      (r) => r.employeeName === employee.name
    );

    let stayLateDays = 0;
    let leaveEarlyDays = 0;
    empAttendance.forEach((r) => {
      if (r.offDuty && r.clockOut) {
        const offDuty = parse(r.offDuty, 'HH:mm', new Date());
        const clockOut = parse(r.clockOut, 'HH:mm', new Date());
        const diff = differenceInMinutes(clockOut, offDuty);
        if (diff >= 5) stayLateDays++;
        else if (diff <= -5) leaveEarlyDays++;
      }
    });

    const shiftEndBehavior =
      leaveEarlyDays > stayLateDays && leaveEarlyDays >= 3
        ? 'Tends to leave early'
        : stayLateDays >= 3 && stayLateDays > leaveEarlyDays
        ? 'Stays late often'
        : 'Consistent timing';

    let performanceInsight = '';
    if (
      empPunctuality.punctualityScore >= 95 &&
      empPayroll.otHours >= 2 &&
      empAttendance.filter((r) => r.status === 'C/I Miss' || r.status === 'C/O Miss')
        .length <= 1
    ) {
      performanceInsight = 'Dedicated with extra effort';
    } else if (
      empPunctuality.punctualityScore >= 90 &&
      empAttendance.filter((r) => r.status === 'C/I Miss' || r.status === 'C/O Miss')
        .length <= 2
    ) {
      performanceInsight = 'Solid performance';
    } else if (
      empPunctuality.punctualityScore < 80 ||
      empAttendance.filter((r) => r.status === 'C/I Miss' || r.status === 'C/O Miss')
        .length >= 3
    ) {
      performanceInsight = 'Needs improvement';
    } else {
      performanceInsight = 'Improving punctuality';
    }

    return {
      employeeId: employee.id,
      employeeName: employee.name,
      punctualityTrend:
        empPunctuality.punctualityScore > 95
          ? 'Consistently punctual'
          : empPunctuality.punctualityScore > 85
          ? 'Stable with some delays'
          : 'Often late',
      absencePattern:
        empPunctuality.absentDays === 0
          ? 'Perfect attendance'
          : empPunctuality.absentDays <= 2
          ? 'Occasional absences'
          : `Frequent absences (${empPunctuality.absentDays} days)`,
      otImpact:
        empPayroll.otHours >= 15
          ? 'High OT - monitor workload'
          : empPayroll.otHours >= 5
          ? 'Moderate OT'
          : 'Balanced workload',
      shiftEndBehavior: shiftEndBehavior,
      performanceInsight: performanceInsight,
    };
  });

  const workforce: WorkforceAnalytics[] = employees.map((employee) => {
    const empPayroll = payroll.find((p) => p.employeeId === employee.id)!;
    const empAttendance = filteredAttendance.filter(
      (r) => r.employeeName === employee.name
    );

    const overtimeRatio =
      empPayroll.regularHours > 0
        ? (empPayroll.otHours / empPayroll.regularHours) * 100
        : 0;
    const saturdaysWorked = empAttendance.filter(
      (r) => r.status === 'Saturday'
    ).length;

    let onTimeStreak = 0;
    let currentStreak = 0;
    empAttendance
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .forEach((r) => {
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

  const dayOfWeekData = [
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
  ].map((dayName, index) => {
    const dayRecords = filteredAttendance.filter(
      (r) => getDay(new Date(r.date)) === index
    );
    let lateArrivals = 0;
    dayRecords.forEach((r) => {
      if (r.onDuty && r.clockIn) {
        const onDuty = parse(r.onDuty, 'HH:mm', new Date());
        const clockIn = parse(r.clockIn, 'HH:mm', new Date());
        if (differenceInMinutes(clockIn, onDuty) > kGraceMin) lateArrivals++;
      }
    });
    const absenteeism = dayRecords.filter((r) => r.status === 'Absent').length;
    const incidents = lateArrivals + absenteeism;
    return { day: dayName, lateArrivals, absenteeism, incidents };
  });

  const patternInsights: PatternInsight[] = [];

  if (filteredAttendance.length > 0) {
    // Highest late arrivals
    const mostLateDay = dayOfWeekData.reduce((max, day) =>
      day.lateArrivals > max.lateArrivals ? day : max
    );
    if (mostLateDay.lateArrivals > 0) {
      patternInsights.push({
        finding: `Highest late arrivals: ${mostLateDay.day} (${mostLateDay.lateArrivals})`,
        description: `${mostLateDay.lateArrivals} late arrivals occurred on ${mostLateDay.day}s this month.`,
      });
    }

    // Highest absenteeism
    const mostAbsentDay = dayOfWeekData.reduce((max, day) =>
      day.absenteeism > max.absenteeism ? day : max
    );
    if (mostAbsentDay.absenteeism > 0) {
      patternInsights.push({
        finding: `Highest absenteeism: ${mostAbsentDay.day} (${mostAbsentDay.absenteeism})`,
        description: `${mostAbsentDay.absenteeism} absences occurred on ${mostAbsentDay.day}s this month.`,
      });
    }

    // Most punctual weekday
    const mostPunctualDay = dayOfWeekData
      .filter((d) => d.day !== 'Saturday')
      .reduce((min, day) => (day.incidents < min.incidents ? day : min));
    patternInsights.push({
      finding: `Most punctual weekday: ${mostPunctualDay.day}`,
      description: `${mostPunctualDay.day} had the fewest incidents (${mostPunctualDay.incidents}) this month.`,
    });

    // Saturday Utilization
    const totalSaturdaysInMonth = filteredAttendance
      .filter((r) => r.status === 'Saturday')
      .map((r) => r.date.substring(0, 10))
      .filter((v, i, a) => a.indexOf(v) === i).length;
    const workedSaturdays = new Set(filteredAttendance.filter(r => r.status === 'Saturday' && r.grossHours > 0).map(r => r.date.substring(0,10))).size;
    const saturdayUtilization =
      totalSaturdaysInMonth > 0
        ? (workedSaturdays / totalSaturdaysInMonth) * 100
        : 0;
    patternInsights.push({
      finding: `Saturday utilization: ${saturdayUtilization.toFixed(0)}%`,
      description: `Work occurred on ${saturdayUtilization.toFixed(0)}% of Saturdays this month.`,
    });

    // Worst shift-start for lateness
    const lateArrivalsByShift = filteredAttendance.reduce(
      (acc, r) => {
        if (
          r.onDuty &&
          r.clockIn &&
          differenceInMinutes(
            parse(r.clockIn, 'HH:mm', new Date()),
            parse(r.onDuty, 'HH:mm', new Date())
          ) > kGraceMin
        ) {
          acc[r.onDuty] = (acc[r.onDuty] || 0) + 1;
        }
        return acc;
      },
      {} as Record<string, number>
    );
    const worstShift = Object.entries(lateArrivalsByShift).sort(
      (a, b) => b[1] - a[1]
    )[0];
    if (worstShift) {
      patternInsights.push({
        finding: `Worst shift-start for lateness: ${worstShift[0]}`,
        description: `The ${worstShift[0]} shift had the highest number of late arrivals (${worstShift[1]}).`,
      });
    }

    // Public Holiday OT
    const holidayOT = filteredAttendance
      .filter((r) => r.status === 'Public Holiday')
      .reduce((sum, r) => sum + r.overtimeHours, 0);
    patternInsights.push({
      finding: `Public Holiday OT total: ${holidayOT.toFixed(1)} hours`,
      description: `A total of ${holidayOT.toFixed(1)} overtime hours were worked on public holidays.`,
    });

    // Late Hotspots
    const lateHotspots = filteredAttendance.reduce(
      (acc, r) => {
        if (
          r.onDuty &&
          r.clockIn &&
          differenceInMinutes(
            parse(r.clockIn, 'HH:mm', new Date()),
            parse(r.onDuty, 'HH:mm', new Date())
          ) > kGraceMin
        ) {
          const date = r.date.substring(0, 10);
          acc[date] = (acc[date] || 0) + 1;
        }
        return acc;
      },
      {} as Record<string, number>
    );
    const sortedHotspots = Object.entries(lateHotspots)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
    if (sortedHotspots.length > 0) {
      patternInsights.push({
        finding: `Late hotspots: ${sortedHotspots
          .map(([date, count]) => `${date} (${count})`)
          .join(', ')}`,
        description: `These dates had the highest number of late arrivals.`,
      });
    }
  }

  return {
    payroll,
    punctuality,
    behavior,
    workforce,
    dayOfWeek: dayOfWeekData,
    patternInsights,
  };
};
