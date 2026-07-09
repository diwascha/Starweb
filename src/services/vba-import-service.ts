/**
 * @fileOverview Consolidated Ledger Import Service.
 *
 * This service implements high-density horizontal parsing for the 5 key sections of the workforce ledger.
 * It uses Anchor-Based discovery to handle shifted columns or variable layouts.
 */

import { getFirebase } from '@/lib/firebase';
import { 
    collection, 
    doc, 
    writeBatch
} from 'firebase/firestore';
import type { 
    Employee, 
    Payroll, 
    AnnualBonusSummary,
    BonusLedgerEntry,
    BehaviorLedgerEntry,
    BehaviorAnalyticsEntry
} from '@/lib/types';
import { getEmployees } from './employee-service';
import { createTimestamp, coerceNumber } from '@/lib/service-utils';
import { COLLECTIONS } from '@/lib/constants';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

// --- Consolidated Ledger Structural Definition ---
const CL_HEADER_ROW = 1; // Row 2 (Labels)
const CL_DATA_START = 2; // Row 3 (First Data Row)

/**
 * Robustly extracts the BS period from strings or numeric columns.
 */
const resolvePeriod = (row: any[], sectionIdx: number): { year: number, month: number } | null => {
    // 1. Try Section 3 Logic (Numeric Year/Month columns at offset 3 and 4)
    // Section 3 (Behavior) has explicit columns for Year and Month
    const numericYear = coerceNumber(row[sectionIdx + 3], 0);
    const numericMonth = coerceNumber(row[sectionIdx + 4], 0);
    if (numericYear > 2000 && numericMonth >= 1 && numericMonth <= 12) {
        return { year: numericYear, month: numericMonth - 1 };
    }

    // 2. Try Regex parsing from common period columns (Offset 1 or 2)
    const candidates = [row[sectionIdx + 1], row[sectionIdx + 2]];
    for (const raw of candidates) {
        if (!raw) continue;
        const s = String(raw);
        // Matches YYYY-MM, YYYY/MM, or BS YYYY-MM
        const match = s.match(/(\d{4})[-/](\d{1,2})/);
        if (match) {
            return { 
                year: parseInt(match[1], 10), 
                month: parseInt(match[2], 10) - 1 
            };
        }
    }
    return null;
};

export const importConsolidatedLedger = async (
    grid: any[][],
    importedBy: string,
    onProgress: (p: number, t: number) => void
) => {
    const { db } = getFirebase();
    const employees = await getEmployees();
    const employeeMap = new Map(employees.map(e => [e.name.toLowerCase().trim(), e]));
    
    // 1. Radar Scan for Section Anchors
    // We look for the "Employee" column in the header row to establish base indices.
    const headerRow = grid[CL_HEADER_ROW] || [];
    const findAnchor = (startSearch: number) => {
        for (let i = startSearch; i < headerRow.length; i++) {
            const val = String(headerRow[i] || '').toLowerCase();
            if (val === 'employee') return i;
        }
        return -1;
    };

    const anchors = {
        sec1: findAnchor(0),     // Bonus Summary
        sec2: findAnchor(13),    // Bonus Ledger
        sec3: findAnchor(25),    // Behavior Ledger
        sec4: findAnchor(45),    // Payroll Ledger
        sec5: findAnchor(61)     // Behavior Analytics
    };

    console.log("[VBA Import] Anchor Discovery Results:", anchors);

    const results = {
        bonusSummaries: 0,
        bonusLedger: 0,
        behaviorLedger: 0,
        payroll: 0,
        behaviorAnalytics: 0,
        newEmployees: 0
    };

    let batch = writeBatch(db);
    let writeCount = 0;
    const now = createTimestamp();

    const commitBatch = async () => {
        try {
            await batch.commit();
            batch = writeBatch(db);
            writeCount = 0;
        } catch (err: any) {
            console.error("[VBA Import] Commit Error:", err);
            errorEmitter.emit('permission-error', new FirestorePermissionError({ path: 'consolidated_ledger', operation: 'write' }));
            throw err;
        }
    };

    const ensureEmployee = (name: string) => {
        const lowerName = name.toLowerCase().trim();
        if (employeeMap.has(lowerName)) return employeeMap.get(lowerName)!;

        const empRef = doc(collection(db, COLLECTIONS.EMPLOYEES));
        const newEmp: Omit<Employee, 'id'> = {
            name,
            status: 'Working',
            wageBasis: 'Monthly',
            wageAmount: 0,
            mobileNumber: 'Not Provided',
            createdBy: importedBy,
            createdAt: now
        };
        batch.set(empRef, newEmp);
        const employee = { id: empRef.id, ...newEmp } as Employee;
        employeeMap.set(lowerName, employee);
        results.newEmployees++;
        writeCount++;
        return employee;
    };

    // 2. Main High-Density Scan
    for (let r = CL_DATA_START; r < grid.length; r++) {
        const row = grid[r];
        if (!row || row.every(c => c === null || c === '')) continue;

        // SECTION 1: ANNUAL BONUS SUMMARY (Col A anchor)
        if (anchors.sec1 !== -1) {
            const name = String(row[anchors.sec1] || '').trim();
            if (name && name.toLowerCase() !== 'employee' && !name.toLowerCase().includes('total')) {
                const employee = ensureEmployee(name);
                const data: AnnualBonusSummary = {
                    id: employee.id,
                    employeeName: employee.name,
                    basis: String(row[anchors.sec1 + 1] || ''),
                    monthsWorked: coerceNumber(row[anchors.sec1 + 2]),
                    eligibleMonths: coerceNumber(row[anchors.sec1 + 3]),
                    avgAttendancePct: coerceNumber(row[anchors.sec1 + 4]),
                    avgMonthlySalary: coerceNumber(row[anchors.sec1 + 5]),
                    accruedYTD: coerceNumber(row[anchors.sec1 + 6]),
                    recommendedBonus: coerceNumber(row[anchors.sec1 + 7]),
                    thisPayout: coerceNumber(row[anchors.sec1 + 8]),
                    balanceAfter: coerceNumber(row[anchors.sec1 + 9]),
                    firstPeriod: String(row[anchors.sec1 + 10] || ''),
                    lastPeriod: String(row[anchors.sec1 + 11] || ''),
                    remarks: String(row[anchors.sec1 + 12] || '')
                };
                batch.set(doc(db, 'bonus_summaries', employee.id), data, { merge: true });
                results.bonusSummaries++;
                writeCount++;
            }
        }

        // SECTION 2: BONUS LEDGER (Col S anchor, Section starts at P)
        if (anchors.sec2 !== -1) {
            const name = String(row[anchors.sec2] || '').trim();
            const period = resolvePeriod(row, anchors.sec2 - 3); // Section starts 3 cols before Employee
            if (name && period && name.toLowerCase() !== 'employee' && !name.toLowerCase().includes('total')) {
                const employee = ensureEmployee(name);
                const ledgerId = `${employee.id}_${period.year}_${period.month}`;
                const data: BonusLedgerEntry = {
                    id: ledgerId,
                    runTime: String(row[anchors.sec2 - 3] || ''),
                    periodAD: String(row[anchors.sec2 - 2] || ''),
                    periodBS: String(row[anchors.sec2 - 1] || ''),
                    bsYear: period.year,
                    bsMonth: period.month,
                    employeeId: employee.id,
                    employeeName: employee.name,
                    basis: String(row[anchors.sec2 + 1] || ''),
                    baseAmount: coerceNumber(row[anchors.sec2 + 2]),
                    attendancePct: coerceNumber(row[anchors.sec2 + 3]),
                    isEligible: String(row[anchors.sec2 + 4] || '').toLowerCase() === 'yes',
                    accrual: coerceNumber(row[anchors.sec2 + 5]),
                    note: String(row[anchors.sec2 + 6] || '')
                };
                batch.set(doc(db, 'bonus_ledger', ledgerId), data, { merge: true });
                results.bonusLedger++;
                writeCount++;
            }
        }

        // SECTION 3: BEHAVIOR LEDGER (Col AH anchor, Section starts at AB)
        if (anchors.sec3 !== -1) {
            const name = String(row[anchors.sec3] || '').trim();
            const period = resolvePeriod(row, anchors.sec3 - 6); // Section starts 6 cols before Employee
            if (name && period && name.toLowerCase() !== 'employee' && !name.toLowerCase().includes('total')) {
                const employee = ensureEmployee(name);
                const ledgerId = `${employee.id}_${period.year}_${period.month}`;
                const data: BehaviorLedgerEntry = {
                    id: ledgerId,
                    runTime: String(row[anchors.sec3 - 6] || ''),
                    periodBS: String(row[anchors.sec3 - 5] || ''),
                    periodAD: String(row[anchors.sec3 - 4] || ''),
                    bsYear: period.year,
                    bsMonth: period.month,
                    bsMonthName: String(row[anchors.sec3 - 1] || ''),
                    employeeId: employee.id,
                    employeeName: employee.name,
                    workdays: coerceNumber(row[anchors.sec3 + 1]),
                    onTimeDays: coerceNumber(row[anchors.sec3 + 2]),
                    onTimePct: coerceNumber(row[anchors.sec3 + 3]),
                    lateDays: coerceNumber(row[anchors.sec3 + 4]),
                    earlyDays: coerceNumber(row[anchors.sec3 + 5]),
                    missingPunches: coerceNumber(row[anchors.sec3 + 6]),
                    absentDays: coerceNumber(row[anchors.sec3 + 7]),
                    satWorked: coerceNumber(row[anchors.sec3 + 8]),
                    phWorked: coerceNumber(row[anchors.sec3 + 9]),
                    extraOkHours: coerceNumber(row[anchors.sec3 + 10]),
                    otHours: coerceNumber(row[anchors.sec3 + 11])
                };
                batch.set(doc(db, 'behavior_ledger', ledgerId), data, { merge: true });
                results.behaviorLedger++;
                writeCount++;
            }
        }

        // SECTION 4: PAYROLL LEDGER (Col AY anchor, Section starts at AV)
        if (anchors.sec4 !== -1) {
            const name = String(row[anchors.sec4] || '').trim();
            const period = resolvePeriod(row, anchors.sec4 - 3); // Section starts 3 cols before Employee
            if (name && period && name.toLowerCase() !== 'employee' && !name.toLowerCase().includes('total')) {
                const employee = ensureEmployee(name);
                const payrollId = `${period.year}-${period.month}-${employee.id}`;
                const data: Omit<Payroll, 'id'> = {
                    runTime: String(row[anchors.sec4 - 3] || ''),
                    periodAD: String(row[anchors.sec4 - 2] || ''),
                    periodBS: String(row[anchors.sec4 - 1] || ''),
                    bsYear: period.year,
                    bsMonth: period.month,
                    employeeId: employee.id,
                    employeeName: employee.name,
                    base: String(row[anchors.sec4 + 1] || ''),
                    presentDays: coerceNumber(row[anchors.sec4 + 2]),
                    extraDays: coerceNumber(row[anchors.sec4 + 3]),
                    leaveDays: coerceNumber(row[anchors.sec4 + 4]),
                    regularPay: coerceNumber(row[anchors.sec4 + 5]),
                    otPay: coerceNumber(row[anchors.sec4 + 6]),
                    allowance: coerceNumber(row[anchors.sec4 + 7]),
                    totalPay: coerceNumber(row[anchors.sec4 + 8]),
                    tds: coerceNumber(row[anchors.sec4 + 9]),
                    salaryTotal: coerceNumber(row[anchors.sec4 + 8]) - coerceNumber(row[anchors.sec4 + 9]),
                    advance: coerceNumber(row[anchors.sec4 + 10]),
                    netPayment: coerceNumber(row[anchors.sec4 + 11]),
                    createdBy: importedBy,
                    createdAt: now
                };
                batch.set(doc(db, COLLECTIONS.PAYROLL, payrollId), data, { merge: true });
                results.payroll++;
                writeCount++;
            }
        }

        // SECTION 5: BEHAVIOR ANALYTICS (Col BO anchor, Section starts at BL)
        if (anchors.sec5 !== -1) {
            const name = String(row[anchors.sec5] || '').trim();
            const period = resolvePeriod(row, anchors.sec5 - 3); // Section starts 3 cols before Employee
            if (name && period && name.toLowerCase() !== 'employee' && !name.toLowerCase().includes('total')) {
                const employee = ensureEmployee(name);
                const analyticsId = `${employee.id}_${period.year}_${period.month}`;
                const data: BehaviorAnalyticsEntry = {
                    id: analyticsId,
                    runTime: String(row[anchors.sec5 - 3] || ''),
                    periodBS: String(row[anchors.sec5 - 2] || ''),
                    periodAD: String(row[anchors.sec5 - 1] || ''),
                    bsYear: period.year,
                    bsMonth: period.month,
                    employeeId: employee.id,
                    employeeName: employee.name,
                    behaviorInsight: String(row[anchors.sec5 + 1] || ''),
                    punctualityTrend: String(row[anchors.sec5 + 2] || ''),
                    absencePattern: String(row[anchors.sec5 + 3] || ''),
                    otImpact: String(row[anchors.sec5 + 4] || ''),
                    shiftEndBehavior: String(row[anchors.sec5 + 5] || ''),
                    performanceInsight: String(row[anchors.sec5 + 6] || ''),
                    bestDayOfWeek: String(row[anchors.sec5 + 7] || ''),
                    worstDayOfWeek: String(row[anchors.sec5 + 8] || '')
                };
                batch.set(doc(db, 'behavior_analytics', analyticsId), data, { merge: true });
                results.behaviorAnalytics++;
                writeCount++;
            }
        }

        if (writeCount >= 450) await commitBatch();
        onProgress(r - CL_DATA_START + 1, grid.length - CL_DATA_START);
    }

    if (writeCount > 0) await commitBatch();
    return results;
};
