
import {
  differenceInMinutes,
  isAfter,
  startOfDay,
  parse,
  setHours,
  setMinutes,
  setSeconds,
  format,
} from 'date-fns';
import NepaliDate from 'nepali-date-converter';
import type { AttendanceRecord, AttendanceStatus, RawAttendanceRow } from './types';

/* =========================
   Config / policy constants
   ========================= */
const BASE_DAY_HOURS = 8;
const LUNCH_DURATION_MINUTES = 60;
const MIN_HOURS_FOR_LUNCH_DEDUCTION = 5;


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

function splitPair(s?: string | null): [string | null, string | null] {
  if (!s) return [null, null];
  const raw = s.replace(/\s+/g, ' ').trim();
  if (raw === '-' || raw === '- / -') return [null, null];
  const m = raw.split('/').map(x => x.trim());
  if (m.length === 2) return [m[0] || null, m[1] || null];
  return [null, null];
}

function adaptWebRow(row: RawAttendanceRow) {
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

  return rows.map((r0): CalcAttendanceRow => {
    const row = adaptWebRow(r0);

    const ad = parseADDateLoose(row.dateAD);
    const dateBS = ad ? toBSString(ad) : '';
    const weekday = ad ? ad.getDay() : -1;
    const isSaturdayAD = weekday === 6;

    const status = (row.status || '').trim().toUpperCase();
    const isAbsent = status === 'ABSENT' || status === 'TRUE';
    const isPublic = status.startsWith('PUBLIC');
    const extraOK = status.includes('EXTRAOK'); // Retained for Saturday/Holiday OT

    const cIn = parseTimeLoose(row.clockIn);
    const cOut = parseTimeLoose(row.clockOut);

    const actIn = ad ? combine(ad, cIn) : null;
    let actOut = ad ? combine(ad, cOut) : null;

    let gross = 0, regular = 0, ot = 0;
    let remarks = '';
    
    // Finalize with default values
    const finalize = (): CalcAttendanceRow => {
      const isAdValid = ad && !isNaN(ad.getTime());
      return {
        ...row,
        dateADISO: isAdValid ? format(ad, 'yyyy-MM-dd') : '',
        dateBS,
        weekdayAD: isAdValid ? weekday : -1,
        normalizedStatus: status,
        grossHours: +gross.toFixed(2),
        regularHours: +regular.toFixed(2),
        overtimeHours: +ot.toFixed(2),
        calcRemarks: remarks,
      };
    };

    if (!ad || isNaN(ad.getTime())) {
      remarks = 'Missing or invalid date';
      return finalize();
    }

    if (isAbsent) {
      return finalize();
    }

    if (isPublic) {
      regular = BASE_DAY_HOURS;
      if (actIn && actOut) {
        if (isAfter(actIn, actOut)) actOut = new Date(actOut.getTime() + 24 * 60 * 60 * 1000);
        const workedMinutes = differenceInMinutes(actOut, actIn);
        ot = Math.max(0, workedMinutes / 60);
      }
      gross = regular + ot;
      remarks = row.remarks ? `Public Holiday - ${row.remarks}` : 'Public Holiday';
      return finalize();
    }

    if (isSaturdayAD) {
       if (actIn && actOut) {
        if (isAfter(actIn, actOut)) actOut = new Date(actOut.getTime() + 24 * 60 * 60 * 1000);
        const workedMinutes = differenceInMinutes(actOut, actIn);
        ot = Math.max(0, workedMinutes / 60);
      }
      gross = ot;
      return finalize();
    }

    // Normal Workday
    if (!actIn || !actOut) {
      remarks = !actIn && !actOut ? 'Missing punches' : (!actIn ? 'C/I Miss' : 'C/O Miss');
      return finalize();
    }

    if (isAfter(actIn, actOut)) actOut = new Date(actOut.getTime() + 24 * 60 * 60 * 1000);

    const grossMinutes = differenceInMinutes(actOut, actIn);
    
    let paidMinutes = grossMinutes;
    if (grossMinutes / 60 > MIN_HOURS_FOR_LUNCH_DEDUCTION) {
      paidMinutes -= LUNCH_DURATION_MINUTES;
    }
    
    paidMinutes = Math.max(0, paidMinutes);
    gross = paidMinutes / 60;
    
    if (gross > BASE_DAY_HOURS) {
        regular = BASE_DAY_HOURS;
        ot = gross - BASE_DAY_HOURS;
    } else {
        regular = gross;
        ot = 0;
    }

    return finalize();
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
    sourceSheet: raw.sourceSheet,
  };
}
