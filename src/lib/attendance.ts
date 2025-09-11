
import {
  format,
  isValid,
  parse,
  differenceInMinutes
} from 'date-fns';
import NepaliDate from 'nepali-date-converter';
import type { AttendanceStatus, RawAttendanceRow, Employee } from './types';
import { addEmployee, getEmployees } from '@/services/employee-service';

/* =========================
   Types
   ========================= */

export type CalcAttendanceRow = RawAttendanceRow & {
  dateADISO: string;
  dateBS: string;
  weekdayAD: number;              // 0=Sun..6=Sat
  status: string; // Keep status as a string from the sheet
  regularHours: number;
  overtimeHours: number;
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
    if (typeof dateInput === 'number') {
        const date = new Date((dateInput - 25569) * 86400 * 1000);
        if (isValid(date)) return date;
    }
    if (typeof dateInput === 'string') {
        const trimmedDate = dateInput.trim();
        const formatsToTry = ['yyyy-MM-dd', 'dd/MM/yyyy', 'MM/dd/yyyy', 'dd/MM/yy', 'MM/dd/yy'];
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
    bsYear: number, 
    bsMonth: number
): { processedData: CalcAttendanceRow[], skippedCount: number } => {
    
    const headerRow = jsonData[0].slice(0, 16); // A-P is 16 columns
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
        overtimeHours: ['overtime'],
        regularHours: ['regular hours'],
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

        let ad: Date | null = parseExcelDate(row.dateAD);
        if (!ad) {
            skippedCount++;
            return null;
        }
        
        const dateBS = row.bsDate ? String(row.bsDate) : toBSString(ad);
        const status = String(row.status || '').trim();
        
        // Directly use hours from sheet if available, otherwise calculate
        let regularHours: number;
        let overtimeHours: number;

        if (row.regularHours !== null && !isNaN(parseFloat(String(row.regularHours)))) {
            regularHours = parseFloat(String(row.regularHours));
        } else {
            regularHours = 0; // Default if column is empty or invalid
        }
        
        if (row.overtimeHours !== null && !isNaN(parseFloat(String(row.overtimeHours)))) {
            overtimeHours = parseFloat(String(row.overtimeHours));
        } else {
            overtimeHours = 0; // Default if column is empty or invalid
        }
        
        // Fallback calculation ONLY if both hour columns are missing/zero
        if (regularHours === 0 && overtimeHours === 0) {
            const clockInTime = parseTimeToString(row.clockIn);
            const clockOutTime = parseTimeToString(row.clockOut);
            if(clockInTime && clockOutTime) {
                const clockInDate = parse(clockInTime, 'HH:mm:ss', ad);
                const clockOutDate = parse(clockOutTime, 'HH:mm:ss', ad);
                 if (isValid(clockInDate) && isValid(clockOutDate) && clockOutDate > clockInDate) {
                    const totalMinutes = differenceInMinutes(clockOutDate, clockInDate);
                    const totalHours = totalMinutes / 60;
                    if(totalHours > 8) {
                        regularHours = 8;
                        overtimeHours = totalHours - 8;
                    } else {
                        regularHours = totalHours;
                    }
                 }
            } else if (status.toLowerCase().includes('p') || status === ''){
                 regularHours = 8; // If present and no clock times, default to 8 hours
            }
        }

        return {
          ...row,
          employeeName: employeeName,
          dateADISO: format(ad, 'yyyy-MM-dd'),
          dateBS: dateBS,
          weekdayAD: ad.getDay(),
          onDuty: parseTimeToString(row.onDuty), 
          offDuty: parseTimeToString(row.offDuty),
          clockIn: parseTimeToString(row.clockIn), 
          clockOut: parseTimeToString(row.clockOut),
          status: status,
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
