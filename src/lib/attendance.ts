
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

function parseTimeAndCombine(baseDate: Date, timeStr: string | null | undefined): Date | null {
    if (!timeStr) return null;
    const t = String(timeStr).trim();
    if (t === '-' || t === '') return null;

    // Handle different time formats
    const formats = ['HH:mm:ss', 'HH:mm', 'h:mm:ss a', 'h:mm a', 'h:mm', 'H:mm'];
    for (const f of formats) {
        try {
            const parsedTime = parse(t, f, new Date());
            if (!isNaN(parsedTime.getTime())) {
                return setSeconds(setMinutes(setHours(baseDate, parsedTime.getHours()), parsedTime.getMinutes()), parsedTime.getSeconds());
            }
        } catch {}
    }
    return null;
}


/* =========================
   Core calculator
   ========================= */
export function calculateAttendance(rows: RawAttendanceRow[]): CalcAttendanceRow[] {

  return rows.map((row): CalcAttendanceRow => {
    const ad = parseADDateLoose(row.dateAD);
    const dateBS = ad ? toBSString(ad) : '';
    const weekday = ad ? ad.getDay() : -1;
    const isSaturdayAD = weekday === 6;

    const status = (row.status || '').trim().toUpperCase();
    const isAbsent = status === 'ABSENT' || status === 'TRUE';
    const isPublic = status.startsWith('PUBLIC');

    let gross = 0, regular = 0, ot = 0;
    let remarks = '';
    
    // Finalize with default values
    const finalize = (actIn: Date | null, actOut: Date | null): CalcAttendanceRow => {
      const isAdValid = ad && !isNaN(ad.getTime());
      
      let finalStatus: AttendanceStatus = 'Present';
      if (isAbsent) finalStatus = 'Absent';
      else if (isPublic) finalStatus = 'Public Holiday';
      else if (isSaturdayAD) finalStatus = 'Saturday';
      else if (!actIn && actOut) finalStatus = 'C/I Miss';
      else if (actIn && !actOut) finalStatus = 'C/O Miss';
      else if (!actIn && !actOut && !isSaturdayAD && !isPublic) finalStatus = 'Absent';
      
      return {
        ...row,
        dateADISO: isAdValid ? format(ad, 'yyyy-MM-dd') : '',
        dateBS,
        weekdayAD: isAdValid ? weekday : -1,
        normalizedStatus: finalStatus,
        grossHours: +gross.toFixed(2),
        regularHours: +regular.toFixed(2),
        overtimeHours: +ot.toFixed(2),
        calcRemarks: remarks,
      };
    };

    if (!ad || isNaN(ad.getTime())) {
      remarks = 'Missing or invalid date';
      return finalize(null, null);
    }
    
    if (isAbsent || isPublic || isSaturdayAD) {
        return finalize(null, null);
    }
    
    const actIn = parseTimeAndCombine(ad, row.clockIn);
    let actOut = parseTimeAndCombine(ad, row.clockOut);

    if (!actIn || !actOut) {
      remarks = !actIn && !actOut ? 'Missing punches' : (!actIn ? 'C/I Miss' : 'C/O Miss');
      return finalize(actIn, actOut);
    }

    if (isAfter(actIn, actOut)) {
      actOut = new Date(actOut.getTime() + 24 * 60 * 60 * 1000); // Handle overnight shifts
    }

    const grossMinutes = differenceInMinutes(actOut, actIn);
    gross = Math.max(0, grossMinutes / 60);
    
    regular = gross;
    ot = 0;

    return finalize(actIn, actOut);
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
    sourceSheet: raw.sourceSheet || null, // Ensure sourceSheet is null, not undefined
  };
}
