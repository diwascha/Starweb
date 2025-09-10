
import {
  differenceInMinutes,
  isAfter,
  startOfDay,
  parse,
  setHours,
  setMinutes,
  setSeconds,
  format,
  isValid,
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
  if (input instanceof Date && isValid(input)) {
    return startOfDay(input);
  }
  if (typeof input !== 'string' || !input.trim()) return null;
  // Prioritize yyyy-mm-dd format
  const candidates = ['yyyy-MM-dd', "yyyy-MM-dd'T'HH:mm:ssXXX", 'M/d/yyyy', 'd/M/yyyy', "M/d/yy"];
  for (const f of candidates) {
    try {
      const d = parse(input.trim(), f, new Date());
      if (isValid(d)) return startOfDay(d);
    } catch {}
  }
  return null;
}


function parseTimeToString(timeInput: any): string | null {
    if (!timeInput) return null;
    
    // Handle JS Date objects
    if (timeInput instanceof Date && isValid(timeInput)) {
        return format(timeInput, 'HH:mm:ss');
    }

    const t = String(timeInput).trim();
    if (t === '-' || t === '') return null;
    
    // Handle Excel's numeric time format (fraction of a day)
    const numericTime = parseFloat(t);
    if (!isNaN(numericTime) && numericTime < 1 && numericTime > 0) {
        const totalSeconds = Math.round(numericTime * 86400);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }

    // Check if it's already HH:mm or HH:mm:ss
    if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(t)) {
        const parts = t.split(':');
        const h = parts[0].padStart(2, '0');
        const m = parts[1];
        const s = parts.length > 2 ? parts[2] : '00';
        return `${h}:${m}:${s}`;
    }

    // Attempt to parse various string formats
    const formats = ['h:mm:ss a', 'h:mm a', 'HH:mm:ss', 'HH:mm', 'h:mm'];
    for (const f of formats) {
        try {
            const parsedTime = parse(t, f, new Date());
            if (isValid(parsedTime)) {
                return format(parsedTime, 'HH:mm:ss');
            }
        } catch {}
    }
    
    // If all else fails, return null
    return null;
}

function combineDateAndTime(baseDate: Date, timeStr: string): Date {
    const [hours, minutes, seconds] = timeStr.split(':').map(Number);
    if (isNaN(hours) || isNaN(minutes)) {
        return new Date(NaN);
    }
    return setSeconds(setMinutes(setHours(baseDate, hours), minutes), seconds || 0);
}


/* =========================
   Core calculator
   ========================= */
export function calculateAttendance(rows: RawAttendanceRow[]): CalcAttendanceRow[] {

  return rows.map((row): CalcAttendanceRow => {
    let ad = parseADDateLoose(row.dateAD);
    if (!ad && row.mitiBS) {
        try {
            ad = new NepaliDate(row.mitiBS).toJsDate();
        } catch (e) {
            console.error("Could not parse Nepali date:", row.mitiBS);
        }
    }
    
    const dateBS = ad ? toBSString(ad) : (row.mitiBS || '');
    const weekday = ad ? ad.getDay() : -1;
    const isSaturdayAD = weekday === 6;

    const statusInput = (row.status || '').trim().toUpperCase();
    
    let gross = 0, regular = 0, ot = 0;
    let remarks = row.remarks || '';
    
    const onDutyTimeStr = parseTimeToString(row.onDuty);
    const offDutyTimeStr = parseTimeToString(row.offDuty);
    const clockInTimeStr = parseTimeToString(row.clockIn);
    const clockOutTimeStr = parseTimeToString(row.clockOut);
    
    let finalStatus: AttendanceStatus = 'Present';

    if (row.normalHours !== undefined && row.normalHours !== null) {
        regular = Number(row.normalHours) || 0;
    }
    if (row.otHours !== undefined && row.otHours !== null) {
        ot = Number(row.otHours) || 0;
    }
    gross = regular + ot;

    if (statusInput === 'ABSENT' || statusInput === 'TRUE') {
        finalStatus = 'Absent';
    } else if (statusInput.startsWith('PUBLIC')) {
        finalStatus = 'Public Holiday';
    } else if (isSaturdayAD) {
        finalStatus = 'Saturday';
    } else if (statusInput === 'C/I MISS') {
        finalStatus = 'C/I Miss';
    } else if (statusInput === 'C/O MISS') {
        finalStatus = 'C/O Miss';
    } else if (statusInput === 'EXTRAOK') {
        finalStatus = 'EXTRAOK';
    } else if (gross > 0) {
        finalStatus = 'Present';
    } else {
        // Fallback status determination if not explicitly provided
        if (!clockInTimeStr && !clockOutTimeStr) {
            finalStatus = 'Absent';
        } else if (!clockInTimeStr) {
            finalStatus = 'C/I Miss';
        } else if (!clockOutTimeStr) {
            finalStatus = 'C/O Miss';
        }
    }

    return {
      ...row,
      onDuty: onDutyTimeStr, offDuty: offDutyTimeStr,
      clockIn: clockInTimeStr, clockOut: clockOutTimeStr,
      dateADISO: ad && isValid(ad) ? format(ad, 'yyyy-MM-dd') : '',
      dateBS,
      weekdayAD: ad ? weekday : -1,
      normalizedStatus: finalStatus,
      grossHours: +gross.toFixed(2),
      regularHours: +regular.toFixed(2),
      overtimeHours: +ot.toFixed(2),
      calcRemarks: remarks,
    };
  });
}

export function reprocessSingleRecord(raw: RawAttendanceRow): Partial<AttendanceRecord> {
  const result = calculateAttendance([raw])[0];
  return {
    date: result.dateADISO, bsDate: result.dateBS,
    status: result.normalizedStatus as AttendanceStatus,
    grossHours: result.grossHours, regularHours: result.regularHours,
    overtimeHours: result.overtimeHours, remarks: result.calcRemarks,
    onDuty: result.onDuty, offDuty: result.offDuty,
    clockIn: result.clockIn, clockOut: result.clockOut,
    sourceSheet: raw.sourceSheet || null,
  };
}
