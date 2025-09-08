
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
} from 'date-fns';
import NepaliDate from 'nepali-date-converter';

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
  onOffDuty?: string | null;      // "08:00 / 17:00" or "-"
  clockInOut?: string | null;     // "07:58 / 17:00" or "- / -"
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

function splitPair(s?: string | null): [string | null, string | null] {
  if (!s) return [null, null];
  const raw = s.replace(/\s+/g, ' ').trim();     // normalize spaces
  if (raw === '-' || raw === '- / -') return [null, null];
  const m = raw.split('/').map(x => x.trim());
  if (m.length === 2) return [m[0] || null, m[1] || null];
  return [null, null];
}

function adaptWebRow(row: RawAttendanceRow) {
  let onDuty = row.onDuty, offDuty = row.offDuty, clockIn = row.clockIn, clockOut = row.clockOut;
  if (!onDuty && !offDuty && row.onOffDuty) {
    const [a, b] = splitPair(row.onOffDuty);
    onDuty = a;
    offDuty = b;
  }
  if (!clockIn && !clockOut && row.clockInOut) {
    const [a, b] = splitPair(row.clockInOut);
    clockIn = a;
    clockOut = b;
  }
  return { ...row, onDuty, offDuty, clockIn, clockOut };
}

/* =========================
   Core daily calculation
   ========================= */
export function calculateAttendance(rows: RawAttendanceRow[]): CalcAttendanceRow[] {
  const freeLateUsed = new Map<string, true>();
  const freeEarlyUsed = new Map<string, true>();

  return rows.map((raw): CalcAttendanceRow => {
    const row = adaptWebRow(raw);
    const name = (row.employeeName || '').trim();
    const ad = parseADDateLoose(row.dateAD) ?? new Date(NaN);
    const weekday = ad.getDay(); // 0=Sun ... 6=Sat
    const bs = Number.isNaN(ad.getTime()) ? '' : toBSString(ad);

    const normalizedStatus = (row.status || '').toUpperCase().trim();
    const isSaturday = weekday === 6;
    const isAbsent = normalizedStatus === 'TRUE' || normalizedStatus === 'ABSENT';
    const isPublic = normalizedStatus.startsWith('PUBLIC');

    const sIn = parseTimeLoose(row.onDuty);
    const sOut = parseTimeLoose(row.offDuty);
    const cIn = parseTimeLoose(row.clockIn);
    const cOut = parseTimeLoose(row.clockOut);

    const baseIn = combineDateAndTime(ad, sIn);
    const baseOut = combineDateAndTime(ad, sOut);
    let actIn = combineDateAndTime(ad, cIn);
    let actOut = combineDateAndTime(ad, cOut);

    let gross = 0, reg = 0, ot = 0;
    let calcRemarks: string | null = null;

    if (isAbsent) {
      return finalize();
    }

    if (isPublic) {
      const worked = workedIfBothValid(ad, actIn, actOut);
      const workedRounded = roundToStepHours(worked);
      gross = BASE_DAY_HOURS + workedRounded;
      ot = workedRounded;
      reg = BASE_DAY_HOURS;
      calcRemarks = `Public Holiday${row.remarks ? ` - ${row.remarks}` : ''}`;
      return finalize();
    }

    if (isSaturday) {
      const worked = workedIfBothValid(ad, actIn, actOut);
      const satWorked = roundToStepHours(worked);
      if (satWorked > 0) {
        gross = ot = satWorked;
      }
      return finalize();
    }

    if (!baseIn || !baseOut) {
      calcRemarks = 'Missing schedule';
      return finalize();
    }

    const hasIn = !!actIn, hasOut = !!actOut;
    const okIn = !!actIn, okOut = !!actOut;
    if (!(hasIn && hasOut && okIn && okOut)) {
      calcRemarks = missingMessage(hasIn, okIn, hasOut, okOut) || 'Missing punches';
      return finalize();
    }

    if (isAfter(actIn!, actOut!)) actOut = addMinutes(actOut!, 24 * 60);

    const sInOnly = baseIn!;
    const sOutOnly = baseOut!;
    const tInOnly = actIn!;
    const tOutOnly = actOut!;

    let lateMin0 = 0, earlyMin0 = 0;
    if (tInOnly >= sInOnly) lateMin0 = minutesOfDay(tInOnly) - minutesOfDay(sInOnly);
    if (tOutOnly <= sOutOnly) earlyMin0 = minutesOfDay(sOutOnly) - minutesOfDay(tOutOnly);

    const wkKey = weeklyKey(ad, name);
    let latePen = 0, earlyPen = 0;

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

    const effIn = addMinutes(baseIn!, latePen);
    const effOut = addMinutes(baseOut!, -earlyPen);

    let paid = 0;
    if (isAfter(effOut, effIn)) {
      paid = applyFixedLunchDeduction(effIn, effOut);
    }

    const extraOK = normalizedStatus.includes('EXTRAOK');
    let extraAM = 0, extraPM = 0;
    if (extraOK) {
      extraAM = extraCreditBefore(baseIn!, actIn!);
      extraPM = extraCreditAfter(baseOut!, actOut!);
    }

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

function workedIfBothValid(ad: Date, actIn: Date | null, actOut: Date | null): number {
  if (!actIn || !actOut) return 0;
  let aIn = actIn, aOut = actOut;
  if (!isAfter(aOut, aIn)) aOut = addMinutes(aOut, 24 * 60);
  return applyFixedLunchDeduction(aIn, aOut);
}
