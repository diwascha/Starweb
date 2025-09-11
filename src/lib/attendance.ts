
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
) {
    
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
        status: ['absent'], // This is the primary status column
        remarks: ['remarks'], // Attendance remarks column I
        overtimeHours: ['overtime'], // Timesheet overtime column J
        regularHours: ['regular hours'], // Timesheet regular hours column K
        totalHours: ['total hour'], // Payroll total hour Q
        otHours: ['ot hour'], // Payroll OT hour R
        normalHours: ['normal hrs'], // Payroll Normal Hrs S
        rate: ['rate'], // Payroll Rate T
        regularPay: ['norman'], // Payroll Norman U
        otPay: ['ot'], // Payroll OT V
        totalPay: ['total'], // Payroll Total W
        absentDays: ['absent days'], // Payroll Absent Days X
        deduction: ['deduction'], // Payroll Deduction Y
        allowance: ['extra'], // Payroll Extra Z
        bonus: ['bonus'], // Payroll Bonus AA
        salaryTotal: ['salary total'], // Payroll Salary Total AB
        tds: ['tds'], // Payroll TDS AC
        gross: ['gross'], // Payroll Gross AD
        advance: ['advance'], // Payroll Advance AE
        netPayment: ['net payment'], // Payroll Net Payment AF
        payrollRemark: ['remark'], // Payroll Remark AG
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

    const requiredHeaders = ['employeeName', 'dateAD'];
    const missingHeaders = requiredHeaders.filter(h => headerMap[h] === undefined);
    if (missingHeaders.length > 0) {
        const userFriendlyNames = missingHeaders.map(h => {
            if (h === 'employeeName') return 'name';
            if (h === 'dateAD') return 'date';
            return h;
        });
        throw new Error(`Import failed: Missing required column(s): ${userFriendlyNames.join(', ')}.`);
    }

    const existingEmployeeNames = new Set(existingEmployees.map(emp => emp.name.toLowerCase()));
    const newEmployees = new Set<string>();
    let skippedCount = 0;

    const processedData = await Promise.all(dataRows.map(async (rowArray, rowIndex): Promise<CalcAttendanceRow | null> => {
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
        
        const dateInput = row.dateAD;
        if (dateInput) {
            let parsedDate: Date | null = null;
            if (dateInput instanceof Date) {
                parsedDate = dateInput;
            } else if (typeof dateInput === 'string') {
                const trimmedDate = dateInput.trim();
                // Try parsing DD/MM/YY or DD-MM-YY first
                if (/^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(trimmedDate)) {
                    parsedDate = parse(trimmedDate.replace(/-/g, '/'), 'dd/MM/yy', new Date());
                } else {
                    // Fallback to default parsing for ISO strings etc.
                    parsedDate = new Date(trimmedDate);
                }
            }

            if (parsedDate && isValid(parsedDate)) {
                ad = parsedDate;
                 const nepaliDate = new NepaliDate(ad);
                if (nepaliDate.getYear() !== bsYear || nepaliDate.getMonth() !== bsMonth) {
                    try {
                        const correctedNepaliDate = new NepaliDate(bsYear, bsMonth, nepaliDate.getDate());
                        ad = correctedNepaliDate.toJsDate();
                    } catch {
                        skippedCount++;
                        return null;
                    }
                }
                dateBS = toBSString(ad);
            }
        }
        
        if (!ad) {
          skippedCount++;
          return null;
        }
        
        // Status determination logic
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
             const dayOfWeek = ad.getDay();
             if (dayOfWeek === 6) { // Saturday
                normalizedStatus = 'Saturday';
             } else {
                normalizedStatus = 'Present';
             }
        }

        const regularHours = Number(row.regularHours) || 0;
        const overtimeHours = Number(row.overtimeHours) || 0;
        const grossHours = regularHours + overtimeHours;
        
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
          normalizedStatus: normalizedStatus,
          grossHours,
          regularHours,
          overtimeHours,
          calcRemarks: row.remarks || '',
          sourceSheet: row.sourceSheet || null,
          rawImportData: rawImportData,
        };
    }));
    
    return {
        processedData: processedData.filter(item => item !== null) as CalcAttendanceRow[],
        newEmployees: Array.from(newEmployees),
        skippedCount
    };
}
