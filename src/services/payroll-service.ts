
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
import type { Employee, Payroll, PunctualityInsight, BehaviorInsight, PatternInsight, WorkforceAnalytics, AttendanceRecord, AttendanceStatus } from '@/lib/types';


/* =========================
   Config / policy constants
   ========================= */
const BASE_DAY_HOURS = 8;
const GRACE_MIN = 5;
const BLOCK_MIN = 30;               // penalty/extra in 30-min blocks
const ROUND_STEP_HOURS = 0.5;
const WEEK_STARTS_ON: 0 | 1 = 0;    // 0 = Sunday
const LUNCH_START = { h: 12, m: 0 };
const LUNCH_END   = { h: 13, m: 0 };


/* =========================
   Types
   ========================= */
export type RawAttendanceRow = {
  employeeName: string;
  dateAD: string | Date;                     // e.g., "2025-07-17"
  status?: string;                           // "Present" | "TRUE" | "PUBLIC" | "EXTRAOK ..." etc.
  onDuty?: string | null;                    // "08:00" etc.
  offDuty?: string | null;                   // "17:00"
  clockIn?: string | null;                   // "07:58"
  clockOut?: string | null;                  // "17:00"
  onOffDuty?: string | null;      // "08:00 / 17:00" or "-"
  clockInOut?: string | null;     // "07:58 / 17:00" or "- / -"
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
  calcRemarks: string;
};

/* =========================
   AD <-> BS helpers
   ========================= */
export function toBSString(dateAD: Date): string {
  try {
    const nd = new NepaliDate(dateAD);
    return nd.format('YYYY-MM-DD');
  } catch {
    return '';
  }
}

export function parseADDateLoose(input: string | Date): Date | null {
  if (input instanceof Date && !Number.isNaN(input.getTime())) {
    return new Date(input.getFullYear(), input.getMonth(), input.getDate());
  }
  if (typeof input !== 'string') return null;
  const candidates = ['yyyy-MM-dd', 'M/d/yyyy', 'd/M/yyyy', "yyyy-MM-dd'T'HH:mm:ssXXX"];
  for (const f of candidates) {
    try {
      const d = parse(input.trim(), f, new Date());
      if (!Number.isNaN(d.getTime())) return new Date(d.getFullYear(), d.getMonth(), d.getDate());
    } catch {}
  }
  return null;
}

/* =========================
   Time parsing & utilities
   ========================= */
type HMS = { hours: number; minutes: number; seconds: number };

function parseTimeLoose(s?: string | null): HMS | null {
  if (!s) return null;
  const t = s.trim();
  if (t === '-' || t === '') return null;

  const fmts = ['HH:mm:ss', 'H:mm:ss', 'h:mm:ss a', 'HH:mm', 'H:mm', 'h:mm a'];
  for (const f of fmts) {
    try {
      const d = parse(t, f, new Date());
      if (!Number.isNaN(d.getTime())) return { hours: d.getHours(), minutes: d.getMinutes(), seconds: d.getSeconds() };
    } catch {}
  }
  return null;
}

function combine(base: Date, t: HMS | null): Date | null {
  if (!t) return null;
  return setSeconds(setMinutes(setHours(startOfDay(base), t.hours), t.minutes), t.seconds);
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

/** Deduct lunch (12:00–13:00) only if the effective paid window overlaps it and total > 4h */
function applyFixedLunch(paidIn: Date, paidOut: Date): number {
  const totalMin = differenceInMinutes(paidOut, paidIn);
  if (totalMin <= 0) return 0;
  const base = startOfDay(paidIn);
  const l0 = setMinutes(setHours(base, LUNCH_START.h), LUNCH_START.m);
  const l1 = setMinutes(setHours(base, LUNCH_END.h), LUNCH_END.m);
  const lunchOverlap = overlapMinutes(paidIn, paidOut, l0, l1);
  const effectiveMin = (lunchOverlap > 0 && totalMin > 240) ? totalMin - lunchOverlap : totalMin;
  return effectiveMin / 60;
}

function extraBefore(baseIn: Date, actIn: Date): number {
  const extraMin = Math.max(0, minutesOfDay(baseIn) - minutesOfDay(actIn));
  const blocks = Math.floor((extraMin + 5) / BLOCK_MIN);
  return (blocks * BLOCK_MIN) / 60;
}
function extraAfter(baseOut: Date, actOut: Date): number {
  const extraMin = Math.max(0, minutesOfDay(actOut) - minutesOfDay(baseOut));
  const blocks = Math.floor((extraMin + 5) / BLOCK_MIN);
  return (blocks * BLOCK_MIN) / 60;
}

function weekKey(dateAD: Date, employeeName: string): string {
  const wk = startOfWeek(dateAD, { weekStartsOn: WEEK_STARTS_ON });
  return `${employeeName}|${format(wk, 'yyyy-MM-dd')}`;
}

/* =========================
   NEW: paired-time adapter
   ========================= */
function splitPair(s?: string | null): [string | null, string | null] {
  if (!s) return [null, null];
  const raw = s.replace(/\s+/g, ' ').trim();     // normalize spaces
  if (raw === '-' || raw === '- / -') return [null, null];
  // allow "08:00 / 17:00" or "08:00/17:00"
  const m = raw.split('/').map(x => x.trim());
  if (m.length === 2) return [m[0] || null, m[1] || null];
  return [null, null];
}

function adaptWebRow(row: RawAttendanceRow) {
  // prefer split fields if present; otherwise parse the pairs
  let onDuty = row.onDuty, offDuty = row.offDuty, clockIn = row.clockIn, clockOut = row.clockOut;
  if (!onDuty || !offDuty) {
    const [a, b] = splitPair(row.onOffDuty ?? null);
    onDuty = onDuty ?? a;
    offDuty = offDuty ?? b;
  }
  if (!clockIn || !clockOut) {
    const [a, b] = splitPair(row.clockInOut ?? null);
    clockIn = clockIn ?? a;
    clockOut = clockOut ?? b;
  }
  return { ...row, onDuty, offDuty, clockIn, clockOut };
}


/* =========================
   Core calculator
   ========================= */
export function calculateAttendanceRows(rows: RawAttendanceRow[]): CalcAttendanceRow[] {
  const freeLateUsed = new Map<string, true>();
  const freeEarlyUsed = new Map<string, true>();

  return rows.map((r0): CalcAttendanceRow => {
    const row = adaptWebRow(r0);

    const ad = parseADDateLoose(row.dateAD) ?? new Date(NaN);
    const weekday = ad.getDay();
    const isSaturdayAD = weekday === 6;

    const status = (row.status || '').trim().toUpperCase();
    const isAbsent = status === 'ABSENT' || status === 'TRUE';   // VBA legacy used TRUE for absence
    const isPublic = status.startsWith('PUBLIC');
    const extraOK = status.includes('EXTRAOK');

    const sIn = parseTimeLoose(row.onDuty);
    const sOut = parseTimeLoose(row.offDuty);
    const cIn = parseTimeLoose(row.clockIn);
    const cOut = parseTimeLoose(row.clockOut);

    const baseIn = combine(ad, sIn);
    const baseOut = combine(ad, sOut);
    let actIn = combine(ad, cIn);
    let actOut = combine(ad, cOut);

    let gross = 0, regular = 0, ot = 0;
    let remarks = '';

    // quick exits
    if (Number.isNaN(ad.getTime())) {
      remarks = 'Missing date';
      return finalize();
    }

    const dateBS = toBSString(ad);

    if (isAbsent) {
      return finalize();
    }

    // PUBLIC HOLIDAY: Regular=8h baseline; any worked time is OT
    if (isPublic) {
      const worked = workedIfBoth(actIn, actOut);
      const wRounded = roundToStepHours(worked);
      regular = BASE_DAY_HOURS;
      ot = wRounded;
      gross = regular + ot;
      remarks = row.remarks ? `Public Holiday - ${row.remarks}` : 'Public Holiday';
      return finalize();
    }

    // SATURDAY: all worked time = OT
    if (isSaturdayAD) {
      const worked = workedIfBoth(actIn, actOut);
      const satH = roundToStepHours(worked);
      ot = satH;
      gross = ot;
      return finalize();
    }

    // Workday:
    if (!baseIn || !baseOut) {
      remarks = 'Missing schedule';
      return finalize();
    }
    if (!actIn || !actOut) {
      remarks = !actIn && !actOut ? 'Missing punches' : (!actIn ? 'C/I Miss' : 'C/O Miss');
      return finalize();
    }

    // guard cross-midnight
    if (!isAfter(actOut, actIn)) actOut = addMinutes(actOut, 24 * 60);

    // Penalties (based on time-of-day mins)
    const lateMin0  = Math.max(0, minutesOfDay(actIn)  - minutesOfDay(baseIn));
    const earlyMin0 = Math.max(0, minutesOfDay(baseOut) - minutesOfDay(actOut));

    const key = weekKey(ad, row.employeeName ?? '');
    let latePen = 0, earlyPen = 0;

    if (lateMin0 > 0) {
      if (lateMin0 <= GRACE_MIN) {
        if (!freeLateUsed.has(key)) freeLateUsed.set(key, true);
        else latePen = BLOCK_MIN;
      } else {
        latePen = Math.ceil((lateMin0 - GRACE_MIN) / BLOCK_MIN) * BLOCK_MIN;
      }
    }

    if (earlyMin0 > 0) {
      if (earlyMin0 <= GRACE_MIN) {
        if (!freeEarlyUsed.has(key)) freeEarlyUsed.set(key, true);
        else earlyPen = BLOCK_MIN;
      } else {
        earlyPen = Math.ceil((earlyMin0 - GRACE_MIN) / BLOCK_MIN) * BLOCK_MIN;
      }
    }

    // Effective paid window
    const effIn = addMinutes(baseIn, latePen);
    const effOut = addMinutes(baseOut, -earlyPen);

    let paid = 0;
    if (isAfter(effOut, effIn)) {
      paid = applyFixedLunch(effIn, effOut);
    }

    // EXTRAOK before/after schedule (+5min rounding, 30-min blocks)
    let extraAM = 0, extraPM = 0;
    if (extraOK) {
      extraAM = extraBefore(baseIn, actIn);
      extraPM = extraAfter(baseOut, actOut);
    }

    gross = roundToStepHours(paid + extraAM + extraPM + 1e-6);
    if (gross > BASE_DAY_HOURS) {
      regular = BASE_DAY_HOURS;
      ot = +(gross - BASE_DAY_HOURS).toFixed(1);
    } else {
      regular = gross;
      ot = 0;
    }

    return finalize();

    function finalize(): CalcRow {
      return {
        ...row,
        dateADISO: format(ad, 'yyyy-MM-dd'),
        dateBS,
        weekdayAD: weekday,
        normalizedStatus: status,
        grossHours: +gross.toFixed(1),
        regularHours: +regular.toFixed(1),
        overtimeHours: +ot.toFixed(1),
        calcRemarks: remarks,
      };
    }
  });
}

export function reprocessSingleRecord(raw: RawAttendanceRow): Partial<AttendanceRecord> {
  const result = calculateAttendanceRows([raw])[0];
  return {
    date: result.dateADISO,
    bsDate: result.dateBS,
    status: result.normalizedStatus as AttendanceStatus,
    grossHours: result.grossHours,
    regularHours: result.regularHours,
    overtimeHours: result.overtimeHours,
    remarks: result.calcRemarks,
  };
}


/* ===== helpers for holiday/saturday ===== */
function workedIfBoth(actIn: Date | null, actOut: Date | null): number {
  if (!actIn || !actOut) return 0;
  let out = actOut;
  if (!isAfter(out, actIn)) out = addMinutes(out, 24 * 60);
  return applyFixedLunch(actIn, out);
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
        
        const absentDays = employeeAttendance.filter(r => ['ABSENT', 'C/I MISS', 'C/O MISS', 'TRUE'].includes(r.status.toUpperCase())).length;
        
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
