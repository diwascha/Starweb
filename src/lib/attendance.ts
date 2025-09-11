

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

function parseTimeToString(timeInput: any): string | null {
    if (!timeInput) return null;
    
    if (timeInput instanceof Date && isValid(timeInput)) {
        return format(timeInput, 'HH:mm');
    }

    const t = String(timeInput).trim();
    if (t === '-' || t === '') return null;
    
    const numericTime = parseFloat(t);
    if (!isNaN(numericTime) && numericTime < 1 && numericTime > 0) {
        const totalSeconds = Math.round(numericTime * 86400);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    }

    if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(t)) {
        const parts = t.split(':');
        return `${parts[0].padStart(2, '0')}:${parts[1]}`;
    }

    const formats = ['h:mm:ss a', 'h:mm a', 'HH:mm:ss', 'HH:mm', 'h:mm'];
    for (const f of formats) {
        try {
            const parsedTime = parse(t, f, new Date());
            if (isValid(parsedTime)) {
                return format(parsedTime, 'HH:mm');
            }
        } catch {}
    }
    
    return null;
}


/* =========================
   Core calculator
   ========================= */
export function processAttendanceImport(rows: RawAttendanceRow[], bsYear: number, bsMonth: number, isLegacyFormat: boolean): CalcAttendanceRow[] {

  return rows.map((row): CalcAttendanceRow => {
    
    let ad: Date | null = null;
    let dateBS = '';
    
    const rawRowArray = Array.isArray(row) ? row : Object.values(row);

    // If it's legacy format, we use fixed column indices from Q (index 16) onwards.
    const getVal = (legacyIndex: number, modernKeys: (keyof RawAttendanceRow)[]) => {
        if (isLegacyFormat) {
            // Q is column 16. In a 0-indexed array, this corresponds to index 16.
            // But excel-to-json might not include empty leading columns.
            // Let's assume the provided `row` is an array starting from the first column with data.
            // The user's image implies a fixed structure. The `rawRows` will be arrays of values.
            // The first payroll column is `Q`. Let's assume the `name` is always the first payroll data point.
            // The json converter might give us an array.
            // A more robust way would be to find the "Name" column index first.
            // For now, let's stick to the user's "starts at Q" rule.
            // Assuming the array given to us `row` *is* the full row from Excel.
            // Column Q is the 17th column, so index 16.
            return rawRowArray[16 + legacyIndex];
        } else {
            // Find value by key in modern format
            const key = modernKeys.find(k => row[k] !== undefined && row[k] !== null);
            return key ? row[key] : undefined;
        }
    };

    const day = parseInt(String(row.day), 10);
    if (!isNaN(day) && day >= 1 && day <= 32) {
        try {
            const nepaliDate = new NepaliDate(bsYear, bsMonth, day);
            ad = nepaliDate.toJsDate();
            dateBS = nepaliDate.format('YYYY-MM-DD');
        } catch (e) {
            console.error(`Invalid Nepali date for day ${day}:`, e);
        }
    }
    
    const weekday = ad ? ad.getDay() : -1;
    const isSaturdayAD = weekday === 6;

    const statusInput = (row.status || '').trim().toUpperCase();
    
    const regular = Number(row.normalHours || row.regularHours) || 0;
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

    const processedRow: CalcAttendanceRow = {
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
    
    // For legacy format, overwrite payroll fields from fixed positions
    if (isLegacyFormat) {
        processedRow.employeeName = rawRowArray[16]; // Q
        processedRow.totalHours = rawRowArray[17];   // R
        processedRow.otHours = rawRowArray[18];      // S
        processedRow.regularHours = rawRowArray[19]; // T
        // U is empty
        processedRow.regularPay = rawRowArray[21];   // V
        processedRow.otPay = rawRowArray[22];        // W
        processedRow.totalPay = rawRowArray[23];     // X
        processedRow.absentDays = rawRowArray[24];   // Y
        processedRow.deduction = rawRowArray[25];    // Z
        processedRow.allowance = rawRowArray[26];    // AA (Assuming Extra is Allowance)
        processedRow.salaryTotal = rawRowArray[27];  // AB
        processedRow.tds = rawRowArray[28];          // AC
        processedRow.gross = rawRowArray[29];        // AD
        processedRow.advance = rawRowArray[30];      // AE
        processedRow.netPayment = rawRowArray[31];   // AF
    }


    return processedRow;
  });
}
