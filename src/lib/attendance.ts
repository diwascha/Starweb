
import {
  format,
  isValid,
  parse
} from 'date-fns';
import NepaliDate from 'nepali-date-converter';
import type { AttendanceStatus, RawAttendanceRow, Employee } from './types';
import { addEmployee } from '@/services/employee-service';

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
  rawImportData: Record<string, any>; // To store the original row
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

// Robust function to parse dates from Excel which can be strings, numbers, or Date objects
const parseExcelDate = (dateInput: any): Date | null => {
    if (!dateInput) return null;
    
    // It's already a valid date object
    if (dateInput instanceof Date && isValid(dateInput)) {
        return dateInput;
    }

    // It's a number (Excel serial date)
    if (typeof dateInput === 'number') {
        const date = new Date((dateInput - 25569) * 86400 * 1000);
        if (isValid(date)) return date;
    }

    // It's a string
    if (typeof dateInput === 'string') {
        const trimmedDate = dateInput.trim();
        // Handle formats like 'dd/MM/yy', 'MM/dd/yy', 'yyyy-MM-dd', 'dd-MM-yyyy' etc.
        const formatsToTry = [
            'yyyy/MM/dd', 'dd/MM/yyyy', 'yyyy-MM-dd', 
            'dd/MM/yy', 'MM/dd/yy', 'dd-MM-yyyy', 'M/d/yy', 'd/M/yy'
        ];
        for (const fmt of formatsToTry) {
            try {
                const parsed = parse(trimmedDate, fmt, new Date());
                if (isValid(parsed)) return parsed;
            } catch {}
        }
        // Fallback for ISO-like strings
        const nativeParsed = new Date(trimmedDate);
        if (isValid(nativeParsed)) return nativeParsed;
    }

    return null; // Return null if all parsing fails
};


/* =========================
   Core calculator
   ========================= */
export const processAttendanceImport = (
    headerRow: string[], 
    dataRows: any[][], 
    bsYear: number, 
    bsMonth: number
): { processedData: CalcAttendanceRow[], skippedCount: number } => {
    
    const normalizedHeaders = headerRow.map(h => String(h || '').trim().toLowerCase());
    const originalHeaders = headerRow.map(h => String(h || '').trim());
    
    const headerMapConfig: { [key in keyof RawAttendanceRow]: string[] } = {
        dateAD: ['date'],
        mitiBS: ['bs date', 'miti'],
        employeeName: ['name'],
        onDuty: ['on duty'],
        offDuty: ['off duty'],
        clockIn: ['clock in'],
        clockOut: ['clock out'],
        status: ['status', 'absent'], // 'status' can be used for explicit statuses like 'Absent'
        remarks: ['remarks'],
        
        // Payroll columns from the 'Timesheet' example, mapping to generic names
        totalHours: ['total hour', 'total hours'],
        otHours: ['ot hour', 'ot hours'],
        regularHours: ['normal hrs', 'regular hours', 'norman'],
        rate: ['rate'],
        regularPay: ['regular pay'],
        otPay: ['ot', 'ot pay'],
        totalPay: ['total', 'total pay'],
        absentDays: ['absent days', 'absent'],
        deduction: ['deduction', 'absent amt.'],
        allowance: ['extra', 'allowance'],
        bonus: ['bonus'],
        salaryTotal: ['salary total'],
        tds: ['tds', 'tds (1%)'],
        gross: ['gross'],
        advance: ['advance'],
        netPayment: ['net payment'],
        payrollRemark: ['remark'],
        day: ['day'],
    };


    const headerMap: { [key: string]: number } = {};
    for (const key in headerMapConfig) {
        const headerNames = headerMapConfig[key as keyof RawAttendanceRow];
        for (const headerName of headerNames) {
            const index = normalizedHeaders.indexOf(headerName);
            if (index !== -1) {
                headerMap[key] = index;
                break;
            }
        }
    }

    const requiredHeaders = ['employeeName'];
    const missingHeaders = requiredHeaders.filter(h => headerMap[h] === undefined);
    if (missingHeaders.length > 0) {
        const userFriendlyNames = missingHeaders.map(h => {
            if (h === 'employeeName') return 'name';
            if (h === 'dateAD') return 'date';
            return h;
        });
        throw new Error(`Import failed: Missing required column(s): ${userFriendlyNames.join(', ')}.`);
    }

    let skippedCount = 0;

    const processedData = dataRows.map((rowArray): CalcAttendanceRow | null => {
        const row: RawAttendanceRow = {};
        const rawImportData: Record<string, any> = {};
        
        rowArray.forEach((cell, index) => {
            if (originalHeaders[index]) {
                rawImportData[originalHeaders[index]] = cell;
            }
        });
        
        for (const key in headerMap) {
            const index = headerMap[key as keyof RawAttendanceRow]!;
            row[key as keyof RawAttendanceRow] = rowArray[index];
        }

        const employeeName = String(row.employeeName || '').trim();
        if (!employeeName) return null;

        let ad: Date | null = parseExcelDate(row.dateAD);
        const bsDateStr: string | null = row.mitiBS ? String(row.mitiBS).trim() : null;

        if (!ad && bsDateStr) {
            const dayMatch = bsDateStr.match(/\d+/);
            if (dayMatch) {
                const day = parseInt(dayMatch[0], 10);
                if (day >= 1 && day <= 32) {
                    try {
                        const candidateDate = new NepaliDate(bsYear, bsMonth, day);
                        ad = candidateDate.toJsDate();
                    } catch { /* Invalid day for month, will be skipped below */ }
                }
            }
        }

        if (!ad) {
            skippedCount++;
            return null;
        }
        
        const finalADDate = ad;
        const dateBS = toBSString(finalADDate);

        const statusInput = String(row.status || '').trim().toUpperCase();
        let normalizedStatus: AttendanceStatus;
        if (statusInput === 'A' || statusInput === 'ABSENT') {
            normalizedStatus = 'Absent';
        } else if (statusInput.includes('C/I MISS')) {
            normalizedStatus = 'C/I Miss';
        } else if (statusInput.includes('C/O MISS')) {
            normalizedStatus = 'C/O Miss';
        } else if (statusInput.includes('EXTRAOK')) {
            normalizedStatus = 'EXTRAOK';
        } else {
             const dayOfWeek = finalADDate.getDay();
             if (dayOfWeek === 6) { // Saturday
                normalizedStatus = 'Saturday';
             } else {
                normalizedStatus = 'Present';
             }
        }

        const regularHours = Number(row.regularHours) || 0;
        const overtimeHours = Number(row.otHours) || 0;
        const grossHours = regularHours + overtimeHours;
        
        return {
          ...row,
          employeeName: employeeName,
          onDuty: parseTimeToString(row.onDuty), 
          offDuty: parseTimeToString(row.offDuty),
          clockIn: parseTimeToString(row.clockIn), 
          clockOut: parseTimeToString(row.clockOut),
          dateADISO: format(finalADDate, 'yyyy-MM-dd'),
          dateBS,
          weekdayAD: finalADDate.getDay(),
          normalizedStatus: normalizedStatus,
          grossHours,
          regularHours,
          overtimeHours,
          calcRemarks: row.remarks || '',
          sourceSheet: row.sourceSheet || null,
          rawImportData: rawImportData,
        };
    }).filter(item => item !== null) as CalcAttendanceRow[];
    
    return {
        processedData,
        skippedCount
    };
};
