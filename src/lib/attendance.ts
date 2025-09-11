
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
export function processAttendanceImport(headerRow: string[], dataRows: any[][], bsYear: number, bsMonth: number): CalcAttendanceRow[] {
    
    const normalizedHeaders = headerRow.map(h => String(h || '').trim().toLowerCase());
    
    // Header variations mapping based on user's specification
    const headerVariations: { [key in keyof RawAttendanceRow]?: string[] } = {
        employeeName: ['name'],
        day: ['day'],
        mitiBS: ['bs date'],
        onDuty: ['on duty'],
        offDuty: ['off duty'],
        clockIn: ['clock in'],
        clockOut: ['clock out'],
        status: ['absent', 'status'], // "Absent" column is used for status
        normalHours: ['regular hours', 'normal'],
        otHours: ['overtime', 'ot'],
        totalHours: ['total hour'],
        rate: ['rate'],
        regularPay: ['normal pay', 'regular pay'],
        otPay: ['ot pay'],
        totalPay: ['total pay'],
        absentDays: ['absent day'],
        deduction: ['deduction'],
        allowance: ['allowance'],
        bonus: ['bonus'],
        salaryTotal: ['salary total'],
        tds: ['tds'],
        gross: ['gross'],
        advance: ['advance'],
        netPayment: ['net payment'],
        payrollRemark: ['remark'],
        dateAD: ['date'],
        remarks: ['remarks'],
    };
    
    const headerMap: { [key: string]: number } = {};
    for (const key in headerVariations) {
        const variations = headerVariations[key as keyof RawAttendanceRow]!;
        for (const variation of variations) {
            const index = normalizedHeaders.indexOf(variation);
            if (index !== -1) {
                headerMap[key] = index;
                break; 
            }
        }
    }
    
    if (headerMap.employeeName === undefined) {
      throw new Error("Import failed: Missing required 'Name' column.");
    }

    return dataRows.map((rowArray): CalcAttendanceRow => {
        const row: RawAttendanceRow = {};
        for (const key in headerMap) {
            const index = headerMap[key as keyof RawAttendanceRow]!;
            row[key as keyof RawAttendanceRow] = rowArray[index];
        }

        let ad: Date | null = null;
        let dateBS = '';
        
        // Priority 1: Full BS Date column
        if (row.mitiBS) {
            try {
                const nepaliDate = new NepaliDate(String(row.mitiBS));
                ad = nepaliDate.toJsDate();
                dateBS = nepaliDate.format('YYYY-MM-DD');
            } catch (e) {
                // Could not parse BS date, will fall back
            }
        }
        
        // Priority 2: Full AD Date column
        if (!ad && row.dateAD && isValid(new Date(row.dateAD))) {
            ad = new Date(row.dateAD);
            try {
                const nepaliDate = new NepaliDate(ad);
                dateBS = nepaliDate.format('YYYY-MM-DD');
            } catch {}
        }

        // Priority 3: Day column with selected Year/Month
        if (!ad) {
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
        }
        
        const weekday = ad ? ad.getDay() : -1;
        const isSaturdayAD = weekday === 6;

        const statusInput = (row.status || '').trim().toUpperCase();
        
        const regular = Number(row.normalHours) || 0;
        const ot = Number(row.otHours) || 0;
        const gross = regular + ot;
        
        let finalStatus: AttendanceStatus = 'Present';

        if (statusInput === 'ABSENT' || statusInput === 'TRUE' || statusInput === 'A') {
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

        return {
          ...row,
          employeeName: String(row.employeeName || '').trim(),
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
