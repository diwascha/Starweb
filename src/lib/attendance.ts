

import {
  format,
  isValid,
  parse,
  startOfDay
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
export async function processAttendanceImport(
    headerRow: string[], 
    dataRows: any[][], 
    bsYear: number, 
    bsMonth: number,
    existingEmployees: Employee[],
    importedBy: string
): Promise<{ processedData: CalcAttendanceRow[], newEmployees: string[] }> {
    
    const normalizedHeaders = headerRow.map(h => String(h || '').trim().toLowerCase());
    
    const headerVariations: { [key in keyof RawAttendanceRow]?: string[] } = {
        employeeName: ['name'],
        day: ['day'],
        mitiBS: ['bs date', 'miti'],
        dateAD: ['date'],
        onDuty: ['on duty'],
        offDuty: ['off duty'],
        clockIn: ['clock in'],
        clockOut: ['clock out'],
        status: ['status'],
        normalHours: ['normal', 'regular hours', 'normal hours'],
        otHours: ['ot', 'ot hours'],
        totalHours: ['total hour', 'total hours'],
        remarks: ['remarks'],
        rate: ['rate'],
        regularPay: ['norman', 'regular pay'],
        otPay: ['ot pay'],
        totalPay: ['total pay'],
        absentDays: ['absent days', 'absent'],
        deduction: ['deduction'],
        allowance: ['extra', 'allowance'],
        bonus: ['bonus'],
        salaryTotal: ['salary total'],
        tds: ['tds'],
        gross: ['gross'],
        advance: ['advance'],
        netPayment: ['net payment'],
        payrollRemark: ['remark'],
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
    
    const requiredHeaders: (keyof RawAttendanceRow)[] = ['employeeName'];
    const missingHeaders = requiredHeaders.filter(h => headerMap[h] === undefined);
    
    if (missingHeaders.length > 0) {
        throw new Error(`Import failed: Missing required columns: ${missingHeaders.join(', ')}. Please check your Excel file.`);
    }

    const existingEmployeeNames = new Set(existingEmployees.map(emp => emp.name.toLowerCase()));
    const newEmployees = new Set<string>();

    const processedData = await Promise.all(dataRows.map(async (rowArray): Promise<CalcAttendanceRow | null> => {
        const row: RawAttendanceRow = {};
        for (const key in headerMap) {
            const index = headerMap[key as keyof RawAttendanceRow]!;
            row[key as keyof RawAttendanceRow] = rowArray[index];
        }

        const employeeName = String(row.employeeName || '').trim();
        if (!employeeName) return null;

        // Check and add new employee if not exists
        if (!existingEmployeeNames.has(employeeName.toLowerCase()) && !newEmployees.has(employeeName)) {
            const newEmployee: Omit<Employee, 'id'> = { name: employeeName, wageBasis: 'Monthly', wageAmount: 0, createdBy: importedBy, createdAt: new Date().toISOString(), status: 'Working' };
            try {
                await addEmployee(newEmployee);
                existingEmployeeNames.add(employeeName.toLowerCase());
                newEmployees.add(employeeName);
            } catch (e) {
                console.error(`Failed to add new employee "${employeeName}":`, e);
                return null;
            }
        }

        let ad: Date | null = null;
        let dateBS = '';
        
        if (row.mitiBS) {
            try {
                const nepaliDate = new NepaliDate(String(row.mitiBS));
                ad = nepaliDate.toJsDate();
                dateBS = nepaliDate.format('YYYY-MM-DD');
            } catch (e) {}
        }
        
        if (!ad && row.dateAD && isValid(new Date(row.dateAD))) {
            ad = new Date(row.dateAD);
            try { dateBS = new NepaliDate(ad).format('YYYY-MM-DD'); } catch {}
        }

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

        const statusInput = String(row.status || '').trim().toUpperCase();
        
        const regular = Number(row.normalHours) || 0;
        const ot = Number(row.otHours) || 0;
        let gross = Number(row.totalHours) || 0;

        if (gross === 0 && (regular > 0 || ot > 0)) {
            gross = regular + ot;
        }
        
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
          employeeName: employeeName,
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
          sourceSheet: row.sourceSheet || null,
        };
    }));
    
    return {
        processedData: processedData.filter(item => item !== null) as CalcAttendanceRow[],
        newEmployees: Array.from(newEmployees)
    };
}
