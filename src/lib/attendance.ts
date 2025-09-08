
import {
  addMinutes,
  differenceInMinutes,
  isAfter,
  startOfDay,
  startOfWeek,
  parse,
  setHours,
  setMinutes,
  setSeconds,
  format,
  max as dfMax,
  min as dfMin,
} from 'date-fns';
import NepaliDate from 'nepali-date-converter';
import type { AttendanceRecord, AttendanceStatus, RawAttendanceRow } from './types';


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

export type CalcAttendanceRow = RawAttendanceRow & {
  dateADISO: string;
  dateBS: string;
  weekdayAD: number;              // 0=Sun..6=Sat
  normalizedStatus: string;
  grossHours: number;
  regularHours: number;
  overtimeHours: number;
  calcRemarks: string;
};

/* =========================
   Helpers
   ========================= */
function toBSString(dateAD: Date): string {
  try {
    const nd = new NepaliDate(dateAD);
    return nd.format('YYYY-MM-DD');
  } catch {
    return '';
  }
}

function parseADDateLoose(input: string | Date): Date | null {
  if (input instanceof Date && !isNaN(input.getTime())) {
    return startOfDay(input);
  }
  if (typeof input !== 'string') return null;
  const candidates = ['yyyy-MM-dd', 'M/d/yyyy', 'd/M/yyyy', "yyyy-MM-dd'T'HH:mm:ssXXX"];
  for (const f of candidates) {
    try {
      const d = parse(input.trim(), f, new Date());
      if (!isNaN(d.getTime())) return startOfDay(d);
    } catch {}
  }
  return null;
}

type HMS = { hours: number; minutes: number; seconds: number };

function parseTimeLoose(s?: string | null): HMS | null {
  if (!s) return null;
  const t = s.trim();
  if (t === '-' || t === '') return null;

  const fmts = ['HH:mm:ss', 'H:mm:ss', 'h:mm:ss a', 'HH:mm', 'H:mm', 'h:mm a'];
  for (const f of fmts) {
    try {
      const d = parse(t, f, new Date());
      if (!isNaN(d.getTime())) return { hours: d.getHours(), minutes: d.getMinutes(), seconds: d.getSeconds() };
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
  const s = dfMax([aStart, bStart]);
  const e = dfMin([aEnd, bEnd]);
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
export function calculateAttendance(rows: RawAttendanceRow[]): CalcAttendanceRow[] {
  const freeLateUsed = new Map<string, true>();
  const freeEarlyUsed = new Map<string, true>();

  return rows.map((r0): CalcAttendanceRow => {
    const row = adaptWebRow(r0);

    const ad = parseADDateLoose(row.dateAD);
    const dateBS = ad ? toBSString(ad) : '';
    const weekday = ad ? ad.getDay() : -1;
    const isSaturdayAD = weekday === 6;

    const status = (row.status || '').trim().toUpperCase();
    const isAbsent = status === 'ABSENT' || status === 'TRUE';   // VBA legacy used TRUE for absence
    const isPublic = status.startsWith('PUBLIC');
    const extraOK = status.includes('EXTRAOK');

    // Use default shift if not provided in data
    const sIn = parseTimeLoose(row.onDuty || "08:00");
    const sOut = parseTimeLoose(row.offDuty || "17:00");
    const cIn = parseTimeLoose(row.clockIn);
    const cOut = parseTimeLoose(row.clockOut);

    const baseIn = ad ? combine(ad, sIn) : null;
    const baseOut = ad ? combine(ad, sOut) : null;
    let actIn = ad ? combine(ad, cIn) : null;
    let actOut = ad ? combine(ad, cOut) : null;

    let gross = 0, regular = 0, ot = 0;
    let remarks = '';

    // quick exits
    if (!ad || isNaN(ad.getTime())) {
      remarks = 'Missing or invalid date';
      return finalize();
    }

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
    if (isAfter(actIn, actOut)) actOut = addMinutes(actOut, 24 * 60);

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

    function finalize(): CalcAttendanceRow {
      const isAdValid = ad && !isNaN(ad.getTime());
      return {
        ...row,
        dateADISO: isAdValid ? format(ad, 'yyyy-MM-dd') : '',
        dateBS,
        weekdayAD: isAdValid ? weekday : -1,
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
  const result = calculateAttendance([raw])[0];
  return {
    date: result.dateADISO,
    bsDate: result.dateBS,
    status: result.normalizedStatus as AttendanceStatus,
    grossHours: result.grossHours,
    regularHours: result.regularHours,
    overtimeHours: result.overtimeHours,
    remarks: result.calcRemarks,
    onDuty: raw.onDuty,
    offDuty: raw.offDuty,
    clockIn: raw.clockIn,
    clockOut: raw.clockOut,
  };
}


/* ===== helpers for holiday/saturday ===== */
function workedIfBoth(actIn: Date | null, actOut: Date | null): number {
  if (!actIn || !actOut) return 0;
  let out = actOut;
  if (isAfter(actIn, out)) out = addMinutes(out, 24 * 60);
  return applyFixedLunch(actIn, out);
}
