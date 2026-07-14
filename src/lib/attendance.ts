import {
  format,
  isValid,
  parse,
} from 'date-fns';
import NepaliDate from 'nepali-date-converter';
import type { RawAttendanceRow } from './types';

/**
 * Shared constants to eliminate magic numbers and improve readability.
 */
const EXCEL_EPOCH_OFFSET = 25569;
const SECONDS_PER_DAY = 86400;
const MILLISECONDS_PER_SECOND = 1000;
const MIN_EXCEL_DATE_VALUE = 1;
const MAX_HEADER_SCAN_LIMIT = 25;

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
  importRowIndex: number; // Preserves Excel row sequence
};


/* =========================
   Helpers
   ========================= */

/**
 * Robust time parser for attendance machine data.
 * Handles: HH:mm:ss, HH:mm, 12h AM/PM, Excel Decimals, and full Timestamps.
 */
export function parseTimeToString(timeInput: any): string | null {
    if (timeInput === null || timeInput === undefined) return null;
    
    if (timeInput instanceof Date && isValid(timeInput)) {
        return format(timeInput, 'HH:mm:ss');
    }

    const t = String(timeInput).trim();
    if (t === '-' || t === '' || t.toLowerCase() === 'null' || t === '0' || t === '0.0' || t === '0:00' || t === '00:00:00') return null;
    
    const numericTime = parseFloat(t);
    // Excel represents time as a fraction of a day (0 to 1)
    if (!isNaN(numericTime) && numericTime < 1 && numericTime > 0.00001) {
        const totalSeconds = Math.round(numericTime * SECONDS_PER_DAY);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }

    const formats = ['h:mm:ss a', 'h:mm a', 'HH:mm:ss', 'HH:mm', 'yyyy-MM-dd HH:mm:ss', 'dd-MM-yyyy HH:mm:ss'];
    for (const f of formats) {
        try {
            const parsedTime = parse(t, f, new Date());
            if (isValid(parsedTime)) {
                return format(parsedTime, 'HH:mm:ss');
            }
        } catch {}
    }
    
    if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(t)) {
        const parts = t.split(':');
        return parts.map(p => p.padStart(2, '0')).join(':') + (parts.length === 2 ? ':00' : '');
    }
    
    return null; 
}


const parseExcelDate = (dateInput: any): Date | null => {
    if (!dateInput) return null;
    if (dateInput instanceof Date && isValid(dateInput)) return dateInput;

    if (typeof dateInput === 'number') {
        if (dateInput > MIN_EXCEL_DATE_VALUE) {
            // Excel counts days from Dec 30, 1899. EXCEL_EPOCH_OFFSET is the offset to Unix epoch (Jan 1, 1970).
            const date = new Date((dateInput - EXCEL_EPOCH_OFFSET) * SECONDS_PER_DAY * MILLISECONDS_PER_SECOND);
            if (isValid(date)) return date;
        }
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
    jsonData: any[][]
): { processedData: CalcAttendanceRow[], skippedCount: number } => {
    if (!jsonData || jsonData.length < 2) return { processedData: [], skippedCount: 0 };

    let headerIndex = -1;
    for (let i = 0; i < Math.min(jsonData.length, MAX_HEADER_SCAN_LIMIT); i++) {
        const row = jsonData[i];
        if (row && row.some((cell: any) => {
            const s = String(cell || '').toLowerCase();
            return s.includes('name') || s.includes('ename') || s.includes('emp') || (s.includes('date') && !s.includes('print'));
        })) {
            headerIndex = i;
            break;
        }
    }

    if (headerIndex === -1) {
        throw new Error("Could not find a valid header row in the Excel sheet. Ensure columns like 'Name' and 'Date' are present.");
    }

    const headerRow = jsonData[headerIndex]; 
    const dataRows = jsonData.slice(headerIndex + 1);
    const normalizedHeaders = headerRow.map(h => String(h || '').trim().toLowerCase());
    
    const headerMapConfig: { [key in keyof RawAttendanceRow]: string[] } = {
        dateAD: ['date (ad dates)', 'date ad', 'date', 'attendance date', 'day', 'ad date', 'work date', 'att date'],
        employeeName: ['employee name', 'name', 'ename', 'full name', 'user name', 'employee', 'staff name'],
        onDuty: [
            'on duty (shift start time)', 'on duty', 'on-duty', 'shift start', 'timetable', 'start time', 
            'on duty time', 'std in', 'shift in', 'plan in', 'planned in', 'scheduled in', 'shift start time'
        ],
        offDuty: [
            'off duty (shift end time)', 'off duty', 'off-duty', 'shift end', 'end time', 
            'off duty time', 'std out', 'shift out', 'plan out', 'planned out', 'scheduled out', 'shift end time'
        ],
        clockIn: ['clock in (employee came)', 'clock in', 'in time', 'check-in', 'clockin', 'time in', 'actual in', 'punch in'],
        clockOut: ['clock out (employee left)', 'clock out', 'out time', 'check-out', 'clockout', 'time out', 'actual out', 'punch out'],
        status: ['absent', 'status', 'exception', 'attendance status', 'state', 'remarks status', 'att status'], 
        overtimeHours: ['overtime', 'ot hours', 'ot', 'work ot', 'over time', 'extra hours'],
        regularHours: ['regular hours', 'normal hrs', 'regular hours', 'work hours', 'duty hours', 'standard hours'],
        remarks: ['remarks', 'notes', 'memo', 'description', 'remark'],
    };

    const headerMap: { [key: string]: number } = {};
    for (const key in headerMapConfig) {
        const aliases = headerMapConfig[key as keyof RawAttendanceRow];
        let index = normalizedHeaders.findIndex(h => aliases.includes(h));
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

    const processedData = dataRows.map((rowArray, rowIndex): CalcAttendanceRow | null => {
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
        if (!employeeName || employeeName.toLowerCase() === 'null') return null;
        
        const adFromSheet = parseExcelDate(row.dateAD);
        if (!adFromSheet) {
            skippedCount++;
            return null;
        }
        
        const nepaliDate = new NepaliDate(adFromSheet);
        const year = nepaliDate.getYear();
        const month = nepaliDate.getMonth();

        const clockIn = parseTimeToString(row.clockIn);
        const clockOut = parseTimeToString(row.clockOut);
        const onDuty = parseTimeToString(row.onDuty);
        const offDuty = parseTimeToString(row.offDuty);
        
        let generatedRemark = String(row.remarks || '').trim();
        if (generatedRemark === '-' || generatedRemark === 'null' || generatedRemark === '0') generatedRemark = '';

        let statusStr = String(row.status || '').trim();
        const headerName = headerMap['status'] !== undefined ? String(headerRow[headerMap['status']] || '').toLowerCase() : '';
        
        if (headerName.includes('absent')) {
            const isTrue = statusStr.toUpperCase() === 'TRUE' || statusStr === '1' || statusStr.toLowerCase() === 'yes';
            const isFalse = statusStr.toUpperCase() === 'FALSE' || statusStr === '0' || statusStr.toLowerCase() === 'no' || statusStr === '' || statusStr === '-';
            
            if (isTrue) statusStr = 'Absent';
            else if (isFalse) statusStr = 'Present';
        }

        if (!clockIn && !clockOut) {
            statusStr = 'Absent';
        } else if (!clockIn) {
            statusStr = 'C/I Miss';
            const missingNote = 'Clock In Missing';
            generatedRemark = generatedRemark ? `${generatedRemark}; ${missingNote}` : missingNote;
        } else if (!clockOut) {
            statusStr = 'C/O Miss';
            const missingNote = 'Clock Out Missing';
            generatedRemark = generatedRemark ? `${generatedRemark}; ${missingNote}` : missingNote;
        } else if (!statusStr || statusStr === '-' || statusStr === 'null' || statusStr === '0' || statusStr.toLowerCase() === 'present') {
            statusStr = 'Present';
        }

        return {
          ...row,
          employeeName: employeeName,
          dateADISO: adFromSheet.toISOString(),
          dateBS: nepaliDate.format('YYYY/MM/DD'),
          bsYear: year,
          bsMonth: month,
          weekdayAD: adFromSheet.getDay(),
          onDuty: onDuty, 
          offDuty: offDuty,
          clockIn: clockIn, 
          clockOut: clockOut,
          status: statusStr,
          regularHours: parseFloat(String(row.regularHours || 0)) || 0,
          overtimeHours: parseFloat(String(row.overtimeHours || 0)) || 0,
          remarks: generatedRemark,
          rawImportData: rawImportData,
          importRowIndex: rowIndex, 
        };
    }).filter((item): item is CalcAttendanceRow => item !== null);
    
    return {
        processedData,
        skippedCount
    };
};