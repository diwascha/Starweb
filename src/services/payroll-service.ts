
import {
  addMinutes,
  differenceInMinutes,
  isAfter,
  max as dfMax,
  min as dfMin,
  parse,
  startOfDay,
  startOfWeek,
  setHours,
  setMinutes,
  setSeconds,
  format,
  getDay,
} from 'date-fns';
import NepaliDate from 'nepali-date-converter';
import type { Employee, Payroll, PunctualityInsight, BehaviorInsight, PatternInsight, WorkforceAnalytics, AttendanceRecord } from '@/lib/types';


/* =========================
   Config / policy constants
   ========================= */
const BASE_DAY_HOURS = 8;             // regular cap per workday
const ROUND_STEP_HOURS = 0.5;         // round to nearest 0.5h
const GRACE_MIN = 5;                  // 5-min grace
const LUNCH_START_HHMM = { h: 12, m: 0 }; // 12:00
const LUNCH_END_HHMM   = { h: 13, m: 0 }; // 13:00
const WEEK_STARTS_ON_SUNDAY: 0 | 1 = 0;   // VBA used Sunday-based weeks
const ALLOW_WEEKLY_FREE_LATE = true;
const ALLOW_WEEKLY_FREE_EARLY = true;

/* ===============
   Types
   =============== */
export type RawAttendanceRow = {
  employeeName: string;
  dateAD: string | Date;                     // e.g., "2025-07-17"
  status?: string;                           // "Present" | "TRUE" | "PUBLIC" | "EXTRAOK ..." etc.
  onDuty?: string | null;                    // "08:00" etc.
  offDuty?: string | null;                   // "17:00"
  clockIn?: string | null;                   // "07:58"
  clockOut?: string | null;                  // "17:00"
  remarks?: string | null;                   // may hold holiday name
};

export type CalcAttendanceRow = RawAttendanceRow & {
  dateADISO: string;                         // ISO date (local midnight)
  dateBS: string;                            // "YYYY-MM-DD" (BS)
  weekdayAD: number;                         // 0=Sun ... 6=Sat (AD)
  normalizedStatus: string;
  grossHours: number;
  regularHours: number;
  overtimeHours: number;
  calcRemarks: string | null;
};

export type MonthlyEmployeeTotals = {
  employeeName: string;
  regularHours: number;
  overtimeHours: number;
  grossHours: number;
  absentDays: number;
  saturdaysWorked: number;
};

/* =========================
   AD <-> BS helpers
   ========================= */
export function toBSString(dateAD: Date): string {
  const nd = new NepaliDate(dateAD);
  return nd.format('YYYY-MM-DD');
}

export function parseADDateLoose(input: string | Date): Date | null {
  if (input instanceof Date && !Number.isNaN(input.getTime())) return new Date(input);
  if (typeof input !== 'string') return null;

  const s = input.trim();
  const fmtCandidates = ['yyyy-MM-dd', 'M/d/yyyy', 'd/M/yyyy', 'yyyy/M/d', "yyyy-MM-dd'T'HH:mm:ssXXX"];
  for (const f of fmtCandidates) {
    try {
      const d = parse(s, f, new Date());
      if (!Number.isNaN(d.getTime())) return new Date(d.getFullYear(), d.getMonth(), d.getDate());
    } catch {}
  }
  return null;
}

/* =========================
   Time parsing & utilities
   ========================= */
type HMS = { hours: number; minutes: number; seconds: number };

function parseTimeLoose(timeLike: unknown): HMS | null {
  if (timeLike == null) return null;
  if (typeof timeLike === 'string' && timeLike.trim() === '-') return null;

  if (timeLike instanceof Date && !Number.isNaN(timeLike.getTime())) {
    return { hours: timeLike.getHours(), minutes: timeLike.getMinutes(), seconds: timeLike.getSeconds() };
  }

  if (typeof timeLike === 'string') {
    const t = timeLike.trim();
    const fmts = ['HH:mm:ss', 'H:mm:ss', 'h:mm:ss a', 'HH:mm', 'H:mm', 'h:mm a'];
    for (const f of fmts) {
      try {
        const d = parse(t, f, new Date());
        if (!Number.isNaN(d.getTime())) {
          return { hours: d.getHours(), minutes: d.getMinutes(), seconds: d.getSeconds() };
        }
      } catch {}
    }
  }
  return null;
}

function combineDateAndTime(baseDate: Date, t: HMS | null): Date | null {
  if (!t) return null;
  return setSeconds(setMinutes(setHours(startOfDay(baseDate), t.hours), t.minutes), t.seconds);
}

function minutesOfDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

function roundToStepHours(x: number, step = ROUND_STEP_HOURS): number {
  return Math.round(x / step) * step;
}

function overlapMinutes(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): number {
  const s = dfMax(aStart, bStart);
  const e = dfMin(aEnd, bEnd);
  return e > s ? differenceInMinutes(e, s) : 0;
}

/** Deduct fixed lunch if (1) paid window overlaps 12:00–13:00 and (2) total > 4h */
function applyFixedLunchDeduction(paidIn: Date, paidOut: Date): number {
  const totalMin = differenceInMinutes(paidOut, paidIn);
  if (totalMin <= 0) return 0;

  const base = startOfDay(paidIn);
  const lunchStart = setMinutes(setHours(base, LUNCH_START_HHMM.h), LUNCH_START_HHMM.m);
  const lunchEnd = setMinutes(setHours(base, LUNCH_END_HHMM.h), LUNCH_END_HHMM.m);

  const lunchOverlapMin = overlapMinutes(paidIn, paidOut, lunchStart, lunchEnd);
  const effectiveMin = (lunchOverlapMin > 0 && totalMin > 240) ? (totalMin - lunchOverlapMin) : totalMin;
  return effectiveMin / 60;
}

function extraCreditBefore(baseIn: Date, actIn: Date): number {
  const extraMin = Math.max(0, minutesOfDay(baseIn) - minutesOfDay(actIn));
  const blocks = Math.floor((extraMin + 5) / 30); // 30-min blocks with +5-min rounding
  return (blocks * 30) / 60;
}

function extraCreditAfter(baseOut: Date, actOut: Date): number {
  const extraMin = Math.max(0, minutesOfDay(actOut) - minutesOfDay(baseOut));
  const blocks = Math.floor((extraMin + 5) / 30);
  return (blocks * 30) / 60;
}

function weeklyKey(dateAD: Date, employeeName: string): string {
  const wkStart = startOfWeek(dateAD, { weekStartsOn: WEEK_STARTS_ON_SUNDAY });
  return `${employeeName}|${format(wkStart, 'yyyy-MM-dd')}`;
}

function missingMessage(hasIn: boolean, okIn: boolean, hasOut: boolean, okOut: boolean): string {
  if (!hasIn && !hasOut) return 'Missing punches';
  if (!hasIn && hasOut) return 'C/I Miss';
  if (hasIn && !hasOut) return 'C/O Miss';
  if (hasIn && hasOut && (!okIn || !okOut)) return 'Bad time format';
  return '';
}

/* =========================
   Core daily calculation
   ========================= */
export function calculateAttendanceRows(rows: RawAttendanceRow[]): CalcAttendanceRow[] {
  const freeLateUsed = new Map<string, true>();
  const freeEarlyUsed = new Map<string, true>();

  return rows.map((raw): CalcAttendanceRow => {
    const name = (raw.employeeName || '').trim();
    const ad = parseADDateLoose(raw.dateAD) ?? new Date(NaN);
    const weekday = ad.getDay(); // 0=Sun ... 6=Sat
    const bs = Number.isNaN(ad.getTime()) ? '' : toBSString(ad);

    const normalizedStatus = (raw.status || '').toUpperCase().trim();
    const isSaturday = weekday === 6;
    const isAbsent = normalizedStatus === 'TRUE' || normalizedStatus === 'ABSENT';
    const isPublic = normalizedStatus.startsWith('PUBLIC');

    // Parse time fields
    const sIn = parseTimeLoose(raw.onDuty);
    const sOut = parseTimeLoose(raw.offDuty);
    const cIn = parseTimeLoose(raw.clockIn);
    const cOut = parseTimeLoose(raw.clockOut);

    const baseIn = combineDateAndTime(ad, sIn);
    const baseOut = combineDateAndTime(ad, sOut);
    let actIn = combineDateAndTime(ad, cIn);
    let actOut = combineDateAndTime(ad, cOut);

    let gross = 0, reg = 0, ot = 0;
    let calcRemarks: string | null = null;

    // Absent rows
    if (isAbsent) {
      return finalize();
    }

    // Public holiday: pay base 8h, any worked time is OT
    if (isPublic) {
      const worked = workedIfBothValid(ad, actIn, actOut);
      const workedRounded = roundToStepHours(worked);
      gross = BASE_DAY_HOURS + workedRounded;
      ot = workedRounded;
      reg = BASE_DAY_HOURS;
      calcRemarks = `Public Holiday${raw.remarks ? ` - ${raw.remarks}` : ''}`;
      return finalize();
    }

    // Saturday: all valid worked hours are OT; Regular=0
    if (isSaturday) {
      const worked = workedIfBothValid(ad, actIn, actOut);
      const satWorked = roundToStepHours(worked);
      if (satWorked > 0) {
        gross = ot = satWorked;
      }
      return finalize();
    }

    // Workday (Sun–Fri)
    if (!baseIn || !baseOut) {
      calcRemarks = 'Missing schedule';
      return finalize();
    }

    // Check punches
    const hasIn = !!actIn, hasOut = !!actOut;
    const okIn = !!actIn, okOut = !!actOut;
    if (!(hasIn && hasOut && okIn && okOut)) {
      calcRemarks = missingMessage(hasIn, okIn, hasOut, okOut) || 'Missing punches';
      return finalize();
    }

    // Safety: cross-midnight guard like VBA (add 1 day to out if < in)
    if (isAfter(actIn!, actOut!)) actOut = addMinutes(actOut!, 24 * 60);

    // Late/Early penalties (time-of-day only)
    const sInOnly = baseIn!;
    const sOutOnly = baseOut!;
    const tInOnly = actIn!;
    const tOutOnly = actOut!;

    let lateMin0 = 0, earlyMin0 = 0;
    if (tInOnly >= sInOnly) lateMin0 = minutesOfDay(tInOnly) - minutesOfDay(sInOnly);
    if (tOutOnly <= sOutOnly) earlyMin0 = minutesOfDay(sOutOnly) - minutesOfDay(tOutOnly);

    const wkKey = weeklyKey(ad, name);
    let latePen = 0, earlyPen = 0;

    // Late
    if (lateMin0 > 0) {
      if (lateMin0 <= GRACE_MIN) {
        if (ALLOW_WEEKLY_FREE_LATE && !freeLateUsed.has(wkKey)) {
          freeLateUsed.set(wkKey, true);
        } else {
          latePen = 30;
        }
      } else {
        latePen = Math.ceil((lateMin0 - GRACE_MIN) / 30) * 30;
      }
    }

    // Early
    if (earlyMin0 > 0) {
      if (earlyMin0 <= GRACE_MIN) {
        if (ALLOW_WEEKLY_FREE_EARLY && !freeEarlyUsed.has(wkKey)) {
          freeEarlyUsed.set(wkKey, true);
        } else {
          earlyPen = 30;
        }
      } else {
        earlyPen = Math.ceil((earlyMin0 - GRACE_MIN) / 30) * 30;
      }
    }

    // Effective paid window (schedule trimmed by penalties)
    const effIn = addMinutes(baseIn!, latePen);
    const effOut = addMinutes(baseOut!, -earlyPen);

    let paid = 0;
    if (isAfter(effOut, effIn)) {
      paid = applyFixedLunchDeduction(effIn, effOut);
    }

    // ExtraOK (AM before / PM after) — in 30-min blocks, +5-min rounding
    const extraOK = normalizedStatus.includes('EXTRAOK');
    let extraAM = 0, extraPM = 0;
    if (extraOK) {
      extraAM = extraCreditBefore(baseIn!, actIn!);
      extraPM = extraCreditAfter(baseOut!, actOut!);
    }

    // Gross / OT / Regular
    gross = roundToStepHours(paid + extraAM + extraPM + 1e-6, ROUND_STEP_HOURS);
    if (gross > BASE_DAY_HOURS) {
      ot = gross - BASE_DAY_HOURS;
      reg = BASE_DAY_HOURS;
    } else {
      reg = gross;
      ot = 0;
    }

    return finalize();

    function finalize(): CalcAttendanceRow {
      return {
        ...raw,
        dateADISO: Number.isNaN(ad.getTime()) ? '' : format(ad, 'yyyy-MM-dd'),
        dateBS: bs,
        weekdayAD: weekday,
        normalizedStatus,
        grossHours: +gross.toFixed(1),
        regularHours: +reg.toFixed(1),
        overtimeHours: +ot.toFixed(1),
        calcRemarks: calcRemarks ?? '',
      };
    }
  });
}

export function reprocessSingleRecord(raw: RawAttendanceRow): Partial<AttendanceRecord> {
  const result = calculateAttendanceRows([raw])[0];
  return {
    date: result.dateADISO,
    bsDate: result.dateBS,
    status: result.normalizedStatus as any,
    grossHours: result.grossHours,
    regularHours: result.regularHours,
    overtimeHours: result.overtimeHours,
    remarks: result.calcRemarks,
  };
}

/* =========================
   Worked-if-both-valid (holiday/Saturday)
   ========================= */
function workedIfBothValid(ad: Date, actIn: Date | null, actOut: Date | null): number {
  if (!actIn || !actOut) return 0;
  let aIn = actIn, aOut = actOut;
  // safety like VBA: if out < in, assume crossed midnight
  if (!isAfter(aOut, aIn)) aOut = addMinutes(aOut, 24 * 60);
  return applyFixedLunchDeduction(aIn, aOut);
}

/* =========================
   Simple monthly aggregator
   ========================= */
export function aggregateByEmployee(rows: CalcAttendanceRow[]): MonthlyEmployeeTotals[] {
  const byEmp = new Map<string, MonthlyEmployeeTotals>();
  for (const r of rows) {
    const key = r.employeeName;
    if (!byEmp.has(key)) {
      byEmp.set(key, {
        employeeName: key,
        regularHours: 0, overtimeHours: 0, grossHours: 0,
        absentDays: 0, saturdaysWorked: 0,
      });
    }
    const agg = byEmp.get(key)!;
    agg.regularHours += r.regularHours;
    agg.overtimeHours += r.overtimeHours;
    agg.grossHours += r.grossHours;
    if ((r.normalizedStatus === 'TRUE' || r.normalizedStatus === 'ABSENT')) agg.absentDays += 1;
    if (r.weekdayAD === 6 && r.overtimeHours > 0) agg.saturdaysWorked += 1;
  }
  // round to 0.1 like grid
  for (const a of byEmp.values()) {
    a.regularHours = +a.regularHours.toFixed(1);
    a.overtimeHours = +a.overtimeHours.toFixed(1);
    a.grossHours = +a.grossHours.toFixed(1);
  }
  return [...byEmp.values()];
}


// Placeholder for the main payroll and analytics function
export interface PayrollAndAnalyticsData {
    payroll: Payroll[];
    punctuality: PunctualityInsight[];
    behavior: BehaviorInsight[];
    patternInsights: PatternInsight[];
    workforce: WorkforceAnalytics[];
    dayOfWeek: { day: string; lateArrivals: number; absenteeism: number }[];
}


export function generatePayrollAndAnalytics(
    bsYear: number,
    bsMonth: number,
    employees: Employee[],
    allAttendance: AttendanceRecord[]
): PayrollAndAnalyticsData {
    
    const monthlyAttendance = allAttendance.filter(r => {
        try {
            const nepaliDate = new NepaliDate(new Date(r.date));
            return nepaliDate.getYear() === bsYear && nepaliDate.getMonth() === bsMonth;
        } catch (e) {
            return false;
        }
    });

    const payroll: Payroll[] = employees.map(employee => {
        const employeeAttendance = monthlyAttendance.filter(r => r.employeeName === employee.name);
        
        const regularHours = employeeAttendance.reduce((sum, r) => sum + (r.regularHours || 0), 0);
        const overtimeHours = employeeAttendance.reduce((sum, r) => sum + (r.overtimeHours || 0), 0);
        const totalHours = regularHours + overtimeHours;
        
        const absentDays = employeeAttendance.filter(r => ['ABSENT', 'C/I MISS', 'C/O MISS'].includes(r.status.toUpperCase())).length;
        
        let rate = 0;
        let regularPay = 0;
        let otPay = 0;
        let deduction = 0;
        
        if (employee.wageBasis === 'Monthly') {
            const monthlySalary = employee.wageAmount;
            const daysInMonth = new NepaliDate(bsYear, bsMonth, 1).getDaysInMonth();
            const dailyRate = monthlySalary / daysInMonth;
            const hourlyRate = dailyRate / 8;
            rate = hourlyRate;

            regularPay = regularHours * hourlyRate;
            otPay = overtimeHours * hourlyRate * 1.5; // Assuming 1.5x OT rate
            deduction = absentDays * dailyRate;

        } else { // Hourly
            rate = employee.wageAmount;
            regularPay = regularHours * rate;
            otPay = overtimeHours * rate * 1.5;
        }

        const totalPay = regularPay + otPay;
        const allowance = employee.allowance || 0;
        const salaryTotal = totalPay + allowance - deduction;
        const tds = salaryTotal * 0.01; // Simplified 1% TDS
        const gross = salaryTotal - tds;
        const advance = 0; // This will be handled by adjustments
        const netPayment = gross - advance;
        
        return {
            employeeId: employee.id,
            employeeName: employee.name,
            totalHours: +totalHours.toFixed(1),
            otHours: +overtimeHours.toFixed(1),
            regularHours: +regularHours.toFixed(1),
            rate: +rate.toFixed(2),
            regularPay: +regularPay.toFixed(2),
            otPay: +otPay.toFixed(2),
            totalPay: +totalPay.toFixed(2),
            absentDays,
            deduction: +deduction.toFixed(2),
            allowance,
            salaryTotal: +salaryTotal.toFixed(2),
            tds: +tds.toFixed(2),
            gross: +gross.toFixed(2),
            advance,
            netPayment: +netPayment.toFixed(2),
            remark: '',
        };
    });

    // --- Analytics Calculations ---
    const punctuality: PunctualityInsight[] = [];
    const behavior: BehaviorInsight[] = [];
    const patternInsights: PatternInsight[] = [];
    const workforce: WorkforceAnalytics[] = [];
    
    const dayOfWeekStats = { 0: {l:0,a:0}, 1:{l:0,a:0}, 2:{l:0,a:0}, 3:{l:0,a:0}, 4:{l:0,a:0}, 5:{l:0,a:0}, 6:{l:0,a:0} };

    employees.forEach(employee => {
        const empAttendance = monthlyAttendance.filter(r => r.employeeName === employee.name);
        if (empAttendance.length === 0) return;

        let lateArrivals = 0;
        let earlyDepartures = 0;
        let onTimeStreak = 0;
        let currentStreak = 0;

        empAttendance.forEach(r => {
            const day = getDay(new Date(r.date));
            let isLate = false;
            let isEarly = false;

            if(r.clockIn && r.onDuty) {
                const clockInTime = parse(r.clockIn, 'HH:mm', new Date());
                const onDutyTime = parse(r.onDuty, 'HH:mm', new Date());
                if(differenceInMinutes(clockInTime, onDutyTime) > GRACE_MIN) {
                    lateArrivals++;
                    isLate = true;
                    dayOfWeekStats[day as keyof typeof dayOfWeekStats].l++;
                }
            }
             if(r.clockOut && r.offDuty) {
                const clockOutTime = parse(r.clockOut, 'HH:mm', new Date());
                const offDutyTime = parse(r.offDuty, 'HH:mm', new Date());
                if(differenceInMinutes(offDutyTime, clockOutTime) > GRACE_MIN) {
                    earlyDepartures++;
                    isEarly = true;
                }
            }
            if (r.status === 'Absent') {
                dayOfWeekStats[day as keyof typeof dayOfWeekStats].a++;
            }

            if (!isLate && !isEarly && r.status === 'Present') {
                currentStreak++;
            } else {
                onTimeStreak = Math.max(onTimeStreak, currentStreak);
                currentStreak = 0;
            }
        });
        onTimeStreak = Math.max(onTimeStreak, currentStreak);


        const scheduledDays = empAttendance.filter(r => r.status !== 'Saturday' && r.status !== 'Public Holiday').length;
        const presentDays = empAttendance.filter(r => r.status === 'Present' || r.status === 'EXTRAOK').length;
        const absentDays = scheduledDays - presentDays;
        
        punctuality.push({
            employeeId: employee.id,
            employeeName: employee.name,
            scheduledDays,
            presentDays,
            absentDays,
            attendanceRate: scheduledDays > 0 ? (presentDays / scheduledDays) * 100 : 0,
            lateArrivals,
            earlyDepartures,
            onTimeDays: presentDays - lateArrivals - earlyDepartures,
            punctualityScore: presentDays > 0 ? ((presentDays - lateArrivals - earlyDepartures) / presentDays) * 100 : 0,
        });

        workforce.push({
            employeeId: employee.id,
            employeeName: employee.name,
            overtimeRatio: (employeeAttendance.reduce((sum, r) => sum + r.overtimeHours, 0) / employeeAttendance.reduce((sum, r) => sum + r.regularHours, 1)) * 100,
            onTimeStreak,
            saturdaysWorked: empAttendance.filter(r => getDay(new Date(r.date)) === 6 && r.grossHours > 0).length,
        });
        
        behavior.push({
            employeeId: employee.id,
            employeeName: employee.name,
            punctualityTrend: 'Stable', // Placeholder
            absencePattern: absentDays > 3 ? 'High' : 'Normal', // Placeholder
            otImpact: 'N/A', // Placeholder
            shiftEndBehavior: earlyDepartures > 3 ? 'Leaves Early' : 'Stays Full Shift', // Placeholder
            performanceInsight: 'Consistent', // Placeholder
        });
    });

    patternInsights.push({ finding: "No significant patterns detected.", description: "Overall attendance behavior is within normal parameters for the selected period." });

    const dayOfWeek = [
        { day: 'Sunday', lateArrivals: dayOfWeekStats[0].l, absenteeism: dayOfWeekStats[0].a },
        { day: 'Monday', lateArrivals: dayOfWeekStats[1].l, absenteeism: dayOfWeekStats[1].a },
        { day: 'Tuesday', lateArrivals: dayOfWeekStats[2].l, absenteeism: dayOfWeekStats[2].a },
        { day: 'Wednesday', lateArrivals: dayOfWeekStats[3].l, absenteeism: dayOfWeekStats[3].a },
        { day: 'Thursday', lateArrivals: dayOfWeekStats[4].l, absenteeism: dayOfWeekStats[4].a },
        { day: 'Friday', lateArrivals: dayOfWeekStats[5].l, absenteeism: dayOfWeekStats[5].a },
    ];


    return { payroll, punctuality, behavior, patternInsights, workforce, dayOfWeek };
}
