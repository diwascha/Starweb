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
  status: string; 
  regularHours: number;
  overtimeHours: number;
  rawImportData: Record<string, any>; 
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
    if (t === '-' || t === '' || t.toLowerCase() === 'null') return null;
    
    const numericTime = parseFloat(t);
    if (!isNaN(numericTime) && numericTime < 1 && numericTime > 0) {
        const totalSeconds = Math.round(numericTime * 86400);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }

    const formats = ['h:mm:ss a', 'h:mm a', 'HH:mm:ss', 'HH:mm'];
    for (const f of formats) {
        try {
            const parsedTime = parse(t, f, new Date());
            if (isValid(parsedTime)) {
                return format(parsedTime, 'HH:mm:ss');
            }
        } catch {}
    }
    
    return t; 
}


const parseExcelDate = (dateInput: any): Date | null => {
    if (!dateInput) return null;
    if (dateInput instanceof Date && isValid(dateInput)) return dateInput;

    if (typeof dateInput === 'number') {
        const date = new Date((dateInput - 25569) * 86400 * 1000);
        if (isValid(date)) return date;
    }

    if (typeof dateInput === 'string') {
        const trimmedDate = dateInput.trim();
        const formatsToTry = [
            'yyyy-MM-dd', 
            'yyyy/MM/dd',
            'dd/MM/yyyy',
            'MM/dd/yyyy',
            'dd-MMM-yyyy',
            'dd-MM-yyyy',
            'MM-dd-yyyy'
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
   Core processor
   ========================= */
export const processAttendanceImport = (
    jsonData: any[][], 
    allowedPeriods: ImportPeriod[]
): { processedData: CalcAttendanceRow[], skippedCount: number } => {
    if (!jsonData || jsonData.length < 2) return { processedData: [], skippedCount: 0 };

    const headerRow = jsonData[0]; 
    const dataRows = jsonData.slice(1);
    
    const normalizedHeaders = headerRow.map(h => String(h || '').trim().toLowerCase());
    
    const headerMapConfig: { [key in keyof RawAttendanceRow]: string[] } = {
        dateAD: ['date (ad dates)', 'date ad', 'date'],
        employeeName: ['employee name', 'name'],
        onDuty: ['on duty (shift start time)', 'on duty', 'on-duty'],
        offDuty: ['off duty (shift end time)', 'off duty', 'off-duty'],
        clockIn: ['clock in (employee came)', 'clock in', 'in time', 'check-in'],
        clockOut: ['clock out (employee left)', 'clock out', 'out time', 'check-out'],
        status: ['absent', 'status'], 
        overtimeHours: ['overtime', 'ot hours', 'ot'],
        regularHours: ['regular hours', 'normal hrs', 'normal hours'],
        remarks: ['remarks', 'notes'],
    };

    const headerMap: { [key: string]: number } = {};
    for (const key in headerMapConfig) {
        const aliases = headerMapConfig[key as keyof RawAttendanceRow];
        // 1. Try Exact match
        let index = normalizedHeaders.findIndex(h => aliases.includes(h));
        
        // 2. Try Partial match if no exact match found
        if (index === -1) {
            index = normalizedHeaders.findIndex(h => 
                aliases.some(alias => h.includes(alias))
            );
        }

        if (index !== -1) {
            headerMap[key] = index;
        }
    }

    let skippedCount = 0;

    const processedData = dataRows.map((rowArray): CalcAttendanceRow | null => {
        if (!rowArray || rowArray.length === 0) return null;
        
        const rawImportData: Record<string, any> = {};
        headerRow.forEach((h, i) => {
            if (h) rawImportData[String(h)] = rowArray[i];
        });
        
        const row: RawAttendanceRow = {};
        for (const key in headerMap) {
            row[key as keyof RawAttendanceRow] = rowArray[headerMap[key]];
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

        // Single-pass filter: Only keep if it matches one of the requested target periods
        const isAllowed = allowedPeriods.some(p => p.year === year && p.month === month);
        if (!isAllowed) return null; 

        return {
          ...row,
          employeeName: employeeName,
          dateADISO: adFromSheet.toISOString(),
          dateBS: nepaliDate.format('YYYY/MM/DD'),
          bsYear: year,
          bsMonth: month,
          weekdayAD: adFromSheet.getDay(),
          onDuty: parseTimeToString(row.onDuty), 
          offDuty: parseTimeToString(row.offDuty),
          clockIn: parseTimeToString(row.clockIn), 
          clockOut: parseTimeToString(row.clockOut),
          status: String(row.status || '').trim(),
          regularHours: parseFloat(String(row.regularHours || 0)) || 0,
          overtimeHours: parseFloat(String(row.overtimeHours || 0)) || 0,
          remarks: String(row.remarks || '').trim(),
          rawImportData: rawImportData,
        };
    }).filter((item): item is CalcAttendanceRow => item !== null);
    
    return {
        processedData,
        skippedCount
    };
};