/**
 * @fileOverview Monthly-sheet payroll block importer.
 *
 * Both the older standalone salary workbooks (FY 2077/78 through 2082/83)
 * and the monthly detail sheets inside the newer "Consolidated Ledger"
 * workbook (Shrawan 2083 onward) share the same two-block layout per sheet:
 * an attendance log starting at column A, and a payroll summary block (one
 * row per employee) starting at whichever column is literally headed
 * "Employee". `processAttendanceImport` (lib/attendance.ts) reads the first
 * block; this module reads the second one. The `source` parameter records
 * which workbook family a row came from so the two can be told apart later.
 *
 * This data is historical: it is stored as-is and never recomputed.
 */
import { getFirebase } from '@/lib/firebase';
import { collection, doc, writeBatch } from 'firebase/firestore';
import type { Employee, Payroll } from '@/lib/types';
import { COLLECTIONS } from '@/lib/constants';
import { createTimestamp, coerceNumber } from '@/lib/service-utils';
import { getEmployees, isValidEmployeeName } from '../employee-service';
import { getHeaderMap } from './generator';

export interface LegacyPayrollImportResult {
    payrollRecords: number;
    newEmployees: number;
}

/**
 * Locates the payroll summary block in a legacy sheet's header row.
 * Returns the column where the block's own "Employee" header sits, or null
 * if the sheet has no such block (e.g. it's a pure attendance sheet).
 */
export const findPayrollBlockStart = (headerRow: any[]): number | null => {
    let lastIdx = -1;
    headerRow.forEach((h, i) => {
        if (String(h || '').trim().toLowerCase() === 'employee') lastIdx = i;
    });
    return lastIdx === -1 ? null : lastIdx;
};

/**
 * Extracts the payroll summary block from one legacy monthly sheet and
 * persists it to the Payroll collection, tagged as a historical import.
 *
 * @param grid - Full sheet grid (header: 1 style, from XLSX.utils.sheet_to_json).
 * @param headerRow - The header row already located by processAttendanceImport.
 * @param headerIndex - Row index of headerRow within grid.
 * @param bsYear - Resolved BS year for this sheet (from its attendance rows).
 * @param bsMonth - Resolved BS month (0-11) for this sheet.
 * @param sourceSheet - Sheet name, kept for audit/debug.
 * @param importedBy - Operator username.
 */
export const importLegacyPayrollSheet = async (
    grid: any[][],
    headerRow: any[],
    headerIndex: number,
    bsYear: number,
    bsMonth: number,
    sourceSheet: string,
    importedBy: string,
    source: Payroll['source'] = 'legacy-import'
): Promise<LegacyPayrollImportResult> => {
    const result: LegacyPayrollImportResult = { payrollRecords: 0, newEmployees: 0 };
    const startCol = findPayrollBlockStart(headerRow);
    if (startCol === null) return result;

    const subHeader = headerRow.slice(startCol);
    const map = getHeaderMap(subHeader);
    if (map.name === undefined) return result;

    const { db } = getFirebase();
    const employees = await getEmployees();
    const employeeMap = new Map(employees.map(e => [e.name.toLowerCase().trim(), e]));
    const now = createTimestamp();
    let batch = writeBatch(db);
    let writeCount = 0;

    const commit = async () => {
        if (writeCount === 0) return;
        await batch.commit();
        batch = writeBatch(db);
        writeCount = 0;
    };

    const ensureEmployee = (name: string, rate: number): Employee => {
        const lowerName = name.toLowerCase().trim();
        const existing = employeeMap.get(lowerName);
        if (existing) return existing;

        const empRef = doc(collection(db, COLLECTIONS.EMPLOYEES));
        const newEmp: Omit<Employee, 'id'> = {
            name: name.trim(),
            status: 'Working',
            wageBasis: 'Monthly',
            wageAmount: rate || 0,
            mobileNumber: 'Not Provided',
            createdBy: importedBy,
            createdAt: now,
            ownership: 'Both',
        };
        batch.set(empRef, newEmp);
        writeCount++;
        const employee = { id: empRef.id, ...newEmp } as Employee;
        employeeMap.set(lowerName, employee);
        result.newEmployees++;
        return employee;
    };

    for (let r = headerIndex + 1; r < grid.length; r++) {
        const row = grid[r];
        if (!row || row.length <= startCol) continue;

        const rawName = String(row[startCol + map.name] || '').trim();
        if (!rawName || !isValidEmployeeName(rawName)) continue;

        const get = (key: string) => map[key] !== undefined ? row[startCol + map[key]] : undefined;
        const rate = coerceNumber(get('rate'));
        const employee = ensureEmployee(rawName, rate);

        // A "Rounded Net" column, when present, is the actual rupee-rounded
        // payout amount - more authoritative than the unrounded "Net" figure.
        const roundedNetRaw = get('roundedNet');
        const netPayment = roundedNetRaw !== undefined ? coerceNumber(roundedNetRaw) : coerceNumber(get('netPayment'));

        const payrollId = `${bsYear}-${bsMonth}-${employee.id}`;
        const entry: Omit<Payroll, 'id'> = {
            bsYear,
            bsMonth,
            periodAD: '',
            periodBS: '',
            employeeId: employee.id,
            employeeName: employee.name,
            base: String(get('rate') ?? ''),
            presentDays: 0,
            extraDays: 0,
            leaveDays: 0,
            regularHours: coerceNumber(get('regularHours')),
            otHours: coerceNumber(get('otHours')),
            totalHours: coerceNumber(get('totalHours')),
            rate,
            regularPay: coerceNumber(get('regularPay')),
            otPay: coerceNumber(get('otPay')),
            allowance: coerceNumber(get('allowance')),
            totalPay: coerceNumber(get('totalPay')),
            absentDays: coerceNumber(get('absentDays')),
            deduction: coerceNumber(get('deduction')),
            tds: coerceNumber(get('tds')),
            salaryTotal: coerceNumber(get('salaryTotal')),
            advance: coerceNumber(get('advance')),
            bonus: coerceNumber(get('bonus')),
            netPayment,
            roundedNet: roundedNetRaw !== undefined ? coerceNumber(roundedNetRaw) : undefined,
            remark: String(get('remark') || ''),
            createdBy: importedBy,
            createdAt: now,
            ownership: employee.ownership || 'Both',
            source,
            sourceSheet,
        };
        batch.set(doc(collection(db, COLLECTIONS.PAYROLL), payrollId), entry, { merge: true });
        writeCount++;
        result.payrollRecords++;

        if (writeCount >= 400) await commit();
    }

    await commit();
    return result;
};
