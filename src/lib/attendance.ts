
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
): Promise<{ processedData: CalcAttendanceRow[], newEmployees: string[], skippedCount: number }> {
    
    const normalizedHeaders = headerRow.map(h => String(h || '').trim().toLowerCase());
    
    const headerMapConfig: { [key in keyof RawAttendanceRow]: string } = {
        employeeName: 'name',
        dateAD: 'date (ad)',
        mitiBS: 'bs date',
        onDuty: 'on duty',
        offDuty: 'off duty',
        clockIn: 'clock in',
        clockOut: 'clock out',
        status: 'status',
        normalHours: 'normal hours',
        otHours: 'ot hours',
        totalHours: 'total hours',
        remarks: 'remarks',
        regularPay: 'norman',
        otPay: 'ot pay',
        totalPay: 'total pay',
        absentDays: 'absent days',
        deduction: 'deduction',
        allowance: 'extra',
        bonus: 'bonus',
        salaryTotal: 'salary total',
        tds: 'tds',
        gross: 'gross',
        advance: 'advance',
        netPayment: 'net payment',
        payrollRemark: 'remark',
        day: 'day',
        rate: 'rate',
    };

    const headerMap: { [key: string]: number } = {};
    for (const key in headerMapConfig) {
        const headerName = headerMapConfig[key as keyof RawAttendanceRow];
        const index = normalizedHeaders.indexOf(headerName);
        if (index !== -1) {
            headerMap[key] = index;
        }
    }

    const requiredHeaders = ['name'];
    const missingHeaders = requiredHeaders.filter(h => headerMap[h] === undefined);
    if (missingHeaders.length > 0) {
        throw new Error(`Import failed: Missing required column(s): ${missingHeaders.join(', ')}.`);
    }

    const existingEmployeeNames = new Set(existingEmployees.map(emp => emp.name.toLowerCase()));
    const newEmployees = new Set<string>();
    let skippedCount = 0;

    const processedData = await Promise.all(dataRows.map(async (rowArray, rowIndex): Promise<CalcAttendanceRow | null> => {
        const row: RawAttendanceRow = {};
        for (const key in headerMap) {
            const index = headerMap[key as keyof RawAttendanceRow]!;
            row[key as keyof RawAttendanceRow] = rowArray[index];
        }

        const employeeName = String(row.employeeName || '').trim();
        if (!employeeName) return null;

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

        if (row.dateAD && (row.dateAD instanceof Date || typeof row.dateAD === 'string')) {
            const parsedDate = new Date(row.dateAD);
            if (isValid(parsedDate)) {
                ad = parsedDate;
                dateBS = toBSString(ad);
            }
        } else if (row.mitiBS && typeof row.mitiBS === 'string') {
            try {
                const nepaliDate = new NepaliDate(row.mitiBS);
                ad = nepaliDate.toJsDate();
                dateBS = nepaliDate.format('YYYY-MM-DD');
            } catch {
                 ad = null;
            }
        }
        
        if (!ad) {
          skippedCount++;
          return null;
        }
        
        const statusInput = String(row.status || '').trim();
        
        return {
          ...row,
          employeeName: employeeName,
          onDuty: parseTimeToString(row.onDuty), 
          offDuty: parseTimeToString(row.offDuty),
          clockIn: parseTimeToString(row.clockIn), 
          clockOut: parseTimeToString(row.clockOut),
          dateADISO: ad && isValid(ad) ? format(ad, 'yyyy-MM-dd') : '',
          dateBS,
          weekdayAD: ad ? ad.getDay() : -1,
          normalizedStatus: statusInput as AttendanceStatus,
          grossHours: Number(row.totalHours) || 0,
          regularHours: Number(row.normalHours) || 0,
          overtimeHours: Number(row.otHours) || 0,
          calcRemarks: row.remarks || '',
          sourceSheet: row.sourceSheet || null,
        };
    }));
    
    return {
        processedData: processedData.filter(item => item !== null) as CalcAttendanceRow[],
        newEmployees: Array.from(newEmployees),
        skippedCount
    };
}
