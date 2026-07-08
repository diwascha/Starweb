import {
  format,
  isValid,
  parse
} from 'date-fns';
import NepaliDate from 'nepali-date-converter';
import type { RawAttendanceRow } from './types';

/* =========================
   Types
   ========================= */

export interface ImportPeriod {
  year: number;
  month: number;
}

export type CalcAttendanceRow = RawAttendanceRow & {
  dateADISO: string;
  dateBS: string;
  bsYear: number;
  bsMonth: number;
  weekdayAD: number;              // 0=Sun..6=Sat
  status: string; // Keep status as a string from the sheet
  regularHours: number;
  overtimeHours: number;
  rawImportData: Record<string, any>; // To store the original row
};


/* =========================
   Helpers
   ========================= */

function parseTimeToString(timeInput: any): string | null {
    if (!timeInput) return null;
    
    if (timeInput instanceof Date && isValid(timeInput)) {
        return format(timeInput, 'HH:mm:ss');
    }

    const t = String(timeInput).trim();
    if (t === '-' || t === '') return null;
    
    // Handle Excel's time format (decimal number)
    const numericTime = parseFloat(t);
    if (!isNaN(numericTime) && numericTime < 1 && numericTime > 0) {
        const totalSeconds = Math.round(numericTime * 86400);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }

    // Handle string formats
    const formats = ['h:mm:ss a', 'h:mm a', 'HH:mm:ss', 'HH:mm'];
    for (const f of formats) {
        try {
            const parsedTime = parse(t, f, new Date());
            if (isValid(parsedTime)) {
                return format(parsedTime, 'HH:mm:ss');
            }
        } catch {}
    }
    
    return t; // Return original string if parsing fails
}


const parseExcelDate = (dateInput: any): Date | null => {
    if (!dateInput) return null;
    if (dateInput instanceof Date && isValid(dateInput)) return dateInput;

    // Prioritize Excel's numeric date format (most reliable)
    if (typeof dateInput === 'number') {
        // Excel date (serial number) to JS Date. 25569 is the offset between Excel's epoch and Unix's.
        const date = new Date((dateInput - 25569) * 86400 * 1000);
        if (isValid(date)) return date;
    }

    if (typeof dateInput === 'string') {
        const trimmedDate = dateInput.trim();
        const formatsToTry = [
            'yyyy-MM-dd', 
            'yyyy/MM/dd',
            'dd-MMM-yyyy',
            'MMMM d, yyyy',
            'MM/dd/yyyy',
            'dd/MM/yyyy',
            'dd-MM-yyyy',
            'M/d/yy',
            'dd/MM/yy', 
            'MM/dd/yy'
        ];
        for (const fmt of formatsToTry) {
            try {
                const parsed = parse(trimmedDate, fmt, new Date());
                if (isValid(parsed)) return parsed;
            } catch {}
        }
        const nativeParsed = new Date(trimmedDate);
        if (isValid(nativeParsed)) return nativeParsed;
    }
    return null;
};


/* =========================
   Core calculator
   ========================= */
export const processAttendanceImport = (
    jsonData: any[][], 
    allowedPeriods: ImportPeriod[]
): { processedData: CalcAttendanceRow[], skippedCount: number } => {
    
    const headerRow = jsonData[0].slice(0, 16); 
    const dataRows = jsonData.slice(1);
    
    const normalizedHeaders = headerRow.map(h => String(h || '').trim().toLowerCase());
    const originalHeaders = headerRow.map(h => String(h || '').trim());
    
    const headerMapConfig: { [key in keyof RawAttendanceRow]: string[] } = {
        dateAD: ['date'],
        bsDate: ['bs date'],
        employeeName: ['name'],
        weekday: ['weekday'],
        onDuty: ['on duty'],
        offDuty: ['off duty'],
        clockIn: ['clock in'],
        clockOut: ['clock out'],
        status: ['absent'], 
        overtimeHours: ['overtime', 'ot'],
        regularHours: ['regular hours', 'normal hrs'],
        remarks: ['remarks'],
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

    let skippedCount = 0;

    const processedData = dataRows.map((rowArray): CalcAttendanceRow | null => {
        const rowSlice = rowArray.slice(0, 16);
        const rawImportData: Record<string, any> = {};
        
        rowSlice.forEach((cell, index) => {
            if (originalHeaders[index]) {
                rawImportData[originalHeaders[index]] = cell;
            }
        });
        
        const row: RawAttendanceRow = {};
        for (const key in headerMap) {
            row[key as keyof RawAttendanceRow] = rowSlice[headerMap[key as keyof RawAttendanceRow]!];
        }

        const employeeName = String(row.employeeName || '').trim();
        if (!employeeName) return null;
        
        const adFromSheet = parseExcelDate(row.dateAD);
        if (!adFromSheet) {
            skippedCount++;
            return null;
        }
        
        const nepaliDate = new NepaliDate(adFromSheet);
        const year = nepaliDate.getYear();
        const month = nepaliDate.getMonth();

        const isAllowed = allowedPeriods.some(p => p.year === year && p.month === month);
        if (!isAllowed) {
            return null; 
        }

        const dateBS = nepaliDate.format('YYYY-MM-DD');
        const regularHours: number = parseFloat(String(row.regularHours)) || 0;
        const overtimeHours: number = parseFloat(String(row.overtimeHours)) || 0;

        return {
          ...row,
          employeeName: employeeName,
          dateADISO: format(adFromSheet, 'yyyy-MM-dd'),
          dateBS: dateBS,
          bsYear: year,
          bsMonth: month,
          weekdayAD: adFromSheet.getDay(),
          onDuty: parseTimeToString(row.onDuty), 
          offDuty: parseTimeToString(row.offDuty),
          clockIn: parseTimeToString(row.clockIn), 
          clockOut: parseTimeToString(row.clockOut),
          status: String(row.status || '').trim(),
          regularHours: regularHours,
          overtimeHours: overtimeHours,
          remarks: String(row.remarks || '').trim(),
          rawImportData: rawImportData,
        };
    }).filter(item => item !== null) as CalcAttendanceRow[];
    
    return {
        processedData,
        skippedCount
    };
};
