
import {
  format,
  isValid,
  parse,
  startOfDay
} from 'date-fns';
import NepaliDate from 'nepali-date-converter';
import type { AttendanceStatus, RawAttendanceRow } from './types';

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
        return format(timeInput, 'HH:mm');
    }

    const t = String(timeInput).trim();
    if (t === '-' || t === '') return null;
    
    // Handle Excel's numeric time format (fraction of a day)
    const numericTime = parseFloat(t);
    if (!isNaN(numericTime) && numericTime < 1 && numericTime > 0) {
        const totalSeconds = Math.round(numericTime * 86400);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    }

    // Check if it's already HH:mm or HH:mm:ss
    if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(t)) {
        const parts = t.split(':');
        return `${parts[0].padStart(2, '0')}:${parts[1]}`;
    }

    // Attempt to parse various string formats
    const formats = ['h:mm:ss a', 'h:mm a', 'HH:mm:ss', 'HH:mm', 'h:mm'];
    for (const f of formats) {
        try {
            const parsedTime = parse(t, f, new Date());
            if (isValid(parsedTime)) {
                return format(parsedTime, 'HH:mm');
            }
        } catch {}
    }
    
    // If all else fails, return null
    return null;
}


/* =========================
   Core calculator
   ========================= */
export function processAttendanceImport(rows: RawAttendanceRow[]): CalcAttendanceRow[] {

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
    
    // Directly use imported hours
    const regular = Number(row.normalHours) || 0;
    const ot = Number(row.otHours) || 0;
    const gross = regular + ot;
    
    let finalStatus: AttendanceStatus = 'Present';

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
        const clockInTimeStr = parseTimeToString(row.clockIn);
        const clockOutTimeStr = parseTimeToString(row.clockOut);
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
      onDuty: parseTimeToString(row.onDuty), 
      offDuty: parseTimeToString(row.offDuty),
      clockIn: parseTimeToString(row.clockIn), 
      clockOut: parseTimeToString(row.clockOut),
      dateADISO: ad && isValid(ad) ? format(ad, 'yyyy-MM-dd') : '',
      dateBS,
      weekdayAD: ad ? weekday : -1,
      normalizedStatus: finalStatus,
      grossHours: +gross.toFixed(2),
      regularHours: +regular.toFixed(2),
      overtimeHours: +ot.toFixed(2),
      calcRemarks: row.remarks || '',
    };
  });
}
