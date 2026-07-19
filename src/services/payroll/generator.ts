import { getFirebase } from '@/lib/firebase';
import { collection, doc, writeBatch } from 'firebase/firestore';
import type { Payroll, Employee, AttendanceRecord, AnalyticsReport } from '@/lib/types';
import NepaliDate from 'nepali-date-converter';
import { getSetting } from '../settings-service';
import { COLLECTIONS } from '@/lib/constants';
import { createTimestamp, logServiceError, coerceNumber } from '@/lib/service-utils';
import { getPayrollCollection } from './data';
import { extractSection, extractPatternInsights, isAnalyticsRow } from './analytics';

/**
 * Calculates and persists monthly payroll records based on validated attendance.
 * This function applies base salary formulas, OT multipliers, and standard 1% TDS.
 * 
 * @param bsYear - Target Nepali Year.
 * @param bsMonth - Target Nepali Month (0-11).
 * @param allEmployees - Array of employee master records.
 * @param allAttendance - Collection of work-hour records for the period.
 * @param calculatedBy - Username for audit trail.
 * @returns Object with the headcount of processed payroll entries.
 */
export const calculateAndSavePayrollForMonth = async (bsYear: number, bsMonth: number, allEmployees: Employee[], allAttendance: AttendanceRecord[], calculatedBy: string): Promise<{ employeeCount: number }> => {
    const { db } = getFirebase();
    const workingEmployees = allEmployees.filter(e => e.status === 'Working');
    const monthlyAttendance = allAttendance.filter(r => r.bsYear === bsYear && r.bsMonth === bsMonth);
    const batch = writeBatch(db);
    const now = createTimestamp();

    for (const employee of workingEmployees) {
        const empAtt = monthlyAttendance.filter(r => r.employeeId === employee.id);
        const regHrs = empAtt.reduce((sum, r) => sum + (r.regularHours || 0), 0);
        const otHrs = empAtt.reduce((sum, r) => sum + (r.overtimeHours || 0), 0);
        const absent = empAtt.filter(r => r.status === 'Absent').length;
        const rate = employee.wageBasis === 'Monthly' ? (employee.wageAmount / 30 / 8) : employee.wageAmount;
        const basic = employee.wageBasis === 'Monthly' ? (employee.wageAmount - (absent * (employee.wageAmount / 30))) : (regHrs * rate);
        const otPay = otHrs * rate;
        const gross = basic + otPay + (employee.allowance || 0);
        const net = gross - (gross * 0.01);
        const payrollId = `${bsYear}-${bsMonth}-${employee.id}`;
        batch.set(doc(getPayrollCollection(), payrollId), { 
            bsYear, 
            bsMonth, 
            employeeId: employee.id, 
            employeeName: employee.name, 
            regularHours: regHrs, 
            overtimeHours: otHrs, 
            rate, 
            regularPay: basic, 
            otPay, 
            totalPay: gross, 
            netPayment: net, 
            createdBy: calculatedBy, 
            createdAt: now,
            ownership: employee.ownership || 'Both'
        }, { merge: true });
    }
    await batch.commit();
    return { employeeCount: workingEmployees.length };
};

/**
 * Maps spreadsheet header names to internal database keys for the bulk import process.
 * Supports fuzzy matching for common variants (e.g., "Basic Pay" vs "Regular Salary").
 * 
 * @param headerRow - Array of column labels from Excel.
 * @returns A mapping object [key: string]: columnIndex.
 */
export const getHeaderMap = (headerRow: any[]) => {
    const map: Record<string, number> = {};
    const payrollHeaders: Record<string, string[]> = {
        name: ['employee', 'staff name', 'name'], otHours: ['ot hrs'], regularHours: ['regular hrs'],
        rate: ['base'], regularPay: ['basic pay'], otPay: ['ot pay'], totalPay: ['gross'],
        absentDays: ['absent days'], deduction: ['absent amt.'], allowance: ['allowance'],
        bonus: ['bonus'], salaryTotal: ['gross salary'], tds: ['tds'], advance: ['advance'],
        netPayment: ['final net'], remark: ['remark']
    };
    headerRow.forEach((h, i) => {
        const cell = String(h || '').trim().toLowerCase();
        for (const key in payrollHeaders) {
            if (payrollHeaders[key].some(alias => cell === alias || cell.includes(alias))) map[key] = i;
        }
    });
    return map;
};
