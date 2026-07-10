/**
 * @fileOverview Consolidated Ledger Import Service.
 *
 * Implements high-density horizontal parsing for the 5 key sections of the workforce ledger.
 * Strictly follows the column offsets: A=0, P=15, AB=27, AV=47, BL=63.
 * 
 * Optimized for:
 * 1. Horizontal Identity Scan (Finds employee name in any of the 5 section anchors)
 * 2. Multi-Section Period Extraction (Cross-references all date sources for accurate BS filing)
 * 3. Strict Numeric Typing (Ensures Year/Month/Financials are stored as Numbers for UI filtering)
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

const CL_DATA_START = 2; // Row 3

/**
 * Extracts BS Year and Month by scanning multiple potential source columns across the horizontal row.
 * AE (30) / AF (31) are preferred direct numeric columns.
 */
const resolvePeriodFromRow = (row: any[]): { year: number, month: number } | null => {
    const yearNum = coerceNumber(row[30], 0);
    const monthNum = coerceNumber(row[31], 0);
    
    if (yearNum > 2000 && monthNum >= 1 && monthNum <= 12) {
        return { year: yearNum, month: monthNum - 1 };
    }

    const periodStrings = [row[49], row[17], row[64]].map(v => String(v || '').trim());
    const dateRegex = /(\d{4})[-/](\d{1,2})/;

    for (const str of periodStrings) {
        const match = str.match(dateRegex);
        if (match) {
            const y = parseInt(match[1], 10);
            const m = parseInt(match[2], 10);
            if (y > 2000 && m >= 1 && m <= 12) {
                return { year: y, month: m - 1 };
            }
        }
    }
    
    return null;
};

/**
 * Robust check to see if a cell contains a valid employee name or just spreadsheet noise.
 */
const isValidEmployeeName = (name: string): boolean => {
    if (!name) return false;
    const n = name.trim();
    if (n.length < 2) return false;
    
    const lower = n.toLowerCase();
    
    // Pattern insights noise from the spreadsheet
    if (lower.includes('trend:') || lower.includes('absenteeism:') || lower.includes('arrivals:') || lower.includes('utilization:')) return false;
    if (lower.includes('absences (')) return false;
    if (lower.includes('hotspots:')) return false;

    return !(
        lower === 'employee' || 
        lower === 'total' ||
        lower === 'behavioral patterns (from attendance data)' ||
        lower === 'enhanced employee insights' ||
        lower === 'pattern insights' ||
        lower === 'day of week patterns' ||
        lower === 'month-to-month behavioral comparison'
    );
};

export const importConsolidatedLedger = async (
    grid: any[][],
    importedBy: string,
    onProgress: (p: number, t: number) => void
) => {
    const { db } = getFirebase();
    const employees = await getEmployees();
    const employeeMap = new Map(employees.map(e => [e.name.toLowerCase().trim(), e]));
    
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
            errorEmitter.emit('permission-error', new FirestorePermissionError({ path: 'consolidated_ledger', operation: 'write' }));
            throw err;
        }
    };

    const ensureEmployee = (name: string) => {
        const lowerName = name.toLowerCase().trim();
        if (employeeMap.has(lowerName)) return employeeMap.get(lowerName)!;

        const empRef = doc(collection(db, COLLECTIONS.EMPLOYEES));
        const newEmp: Omit<Employee, 'id'> = {
            name: name.trim(),
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

    for (let r = CL_DATA_START; r < grid.length; r++) {
        const row = grid[r];
        if (!row || row.length < 5) continue;

        // Horizontal Identity Check
        const identityAnchors = [row[0], row[18], row[33], row[50], row[66]]
            .map(v => String(v || '').trim())
            .filter(v => isValidEmployeeName(v));

        if (identityAnchors.length === 0) continue;
        
        const employeeName = identityAnchors[0];
        const emp = ensureEmployee(employeeName);
        const period = resolvePeriodFromRow(row);

        // Section 1: Annual Bonus Summary (A-M)
        if (isValidEmployeeName(String(row[0]))) {
            const bonusData: AnnualBonusSummary = {
                id: emp.id,
                employeeName: emp.name,
                basis: String(row[1] || ''),
                monthsWorked: coerceNumber(row[2]),
                eligibleMonths: coerceNumber(row[3]),
                avgAttendancePct: coerceNumber(row[4]),
                avgMonthlySalary: coerceNumber(row[5]),
                accruedYTD: coerceNumber(row[6]),
                recommendedBonus: coerceNumber(row[7]),
                thisPayout: coerceNumber(row[8]),
                balanceAfter: coerceNumber(row[9]),
                firstPeriod: String(row[10] || ''),
                lastPeriod: String(row[11] || ''),
                remarks: String(row[12] || '')
            };
            batch.set(doc(db, 'bonus_summaries', emp.id), bonusData, { merge: true });
            results.bonusSummaries++;
            writeCount++;
        }

        if (period) {
            const periodId = `${period.year}_${period.month}`;

            // Section 2: Bonus Ledger (P-Y)
            if (isValidEmployeeName(String(row[18]))) {
                const id = `${emp.id}_${periodId}`;
                const entry: BonusLedgerEntry = {
                    id,
                    runTime: String(row[15] || ''),
                    periodAD: String(row[16] || ''),
                    periodBS: String(row[17] || ''),
                    bsYear: period.year,
                    bsMonth: period.month,
                    employeeId: emp.id,
                    employeeName: emp.name,
                    basis: String(row[19] || ''),
                    baseAmount: coerceNumber(row[20]),
                    attendancePct: coerceNumber(row[21]),
                    isEligible: String(row[22] || '').toLowerCase().includes('yes'),
                    accrual: coerceNumber(row[23]),
                    note: String(row[24] || '')
                };
                batch.set(doc(db, 'bonus_ledger', id), entry, { merge: true });
                results.bonusLedger++;
                writeCount++;
            }

            // Section 3: Behavior Ledger (AB-AS)
            if (isValidEmployeeName(String(row[33]))) {
                const id = `${emp.id}_${periodId}`;
                const entry: BehaviorLedgerEntry = {
                    id,
                    runTime: String(row[27] || ''),
                    periodBS: String(row[28] || ''),
                    periodAD: String(row[29] || ''),
                    bsYear: period.year,
                    bsMonth: period.month,
                    bsMonthName: String(row[32] || ''),
                    employeeId: emp.id,
                    employeeName: emp.name,
                    workdays: coerceNumber(row[34]),
                    onTimeDays: coerceNumber(row[35]),
                    onTimePct: coerceNumber(row[36]),
                    lateDays: coerceNumber(row[37]),
                    earlyDays: coerceNumber(row[38]),
                    missingPunches: coerceNumber(row[39]),
                    absentDays: coerceNumber(row[40]),
                    satWorked: coerceNumber(row[41]),
                    phWorked: coerceNumber(row[42]),
                    extraOkHours: coerceNumber(row[43]),
                    otHours: coerceNumber(row[44])
                };
                batch.set(doc(db, 'behavior_ledger', id), entry, { merge: true });
                results.behaviorLedger++;
                writeCount++;
            }

            // Section 4: Payroll Ledger (AV-BJ)
            if (isValidEmployeeName(String(row[50]))) {
                const payrollId = `${period.year}-${period.month}-${emp.id}`;
                const entry: Omit<Payroll, 'id'> = {
                    bsYear: period.year,
                    bsMonth: period.month,
                    runTime: String(row[47] || ''),
                    periodAD: String(row[48] || ''),
                    periodBS: String(row[49] || ''),
                    employeeId: emp.id,
                    employeeName: emp.name,
                    base: String(row[51] || ''),
                    presentDays: coerceNumber(row[52]),
                    extraDays: coerceNumber(row[53]),
                    leaveDays: coerceNumber(row[54]),
                    regularPay: coerceNumber(row[55]),
                    otPay: coerceNumber(row[56]),
                    allowance: coerceNumber(row[57]),
                    totalPay: coerceNumber(row[58]),
                    tds: coerceNumber(row[59]),
                    salaryTotal: coerceNumber(row[58]) - coerceNumber(row[59]),
                    advance: coerceNumber(row[60]),
                    netPayment: coerceNumber(row[61]),
                    createdBy: importedBy,
                    createdAt: now
                };
                batch.set(doc(collection(db, COLLECTIONS.PAYROLL), payrollId), entry, { merge: true });
                results.payroll++;
                writeCount++;
            }

            // Section 5: Behavior Analytics (BL-BW)
            if (isValidEmployeeName(String(row[66]))) {
                const id = `${emp.id}_${periodId}`;
                const entry: BehaviorAnalyticsEntry = {
                    id,
                    runTime: String(row[63] || ''),
                    periodBS: String(row[64] || ''),
                    periodAD: String(row[65] || ''),
                    employeeId: emp.id,
                    employeeName: emp.name,
                    behaviorInsight: String(row[67] || ''),
                    punctualityTrend: String(row[68] || ''),
                    absencePattern: String(row[69] || ''),
                    otImpact: String(row[70] || ''),
                    shiftEndBehavior: String(row[71] || ''),
                    performanceInsight: String(row[72] || ''),
                    bestDayOfWeek: String(row[73] || ''),
                    worstDayOfWeek: String(row[74] || '')
                };
                batch.set(doc(db, 'behavior_analytics', id), entry, { merge: true });
                results.behaviorAnalytics++;
                writeCount++;
            }
        }

        if (writeCount >= 450) {
            await commitBatch();
        }
        onProgress(r - CL_DATA_START + 1, grid.length - CL_DATA_START);
    }

    if (writeCount > 0) await commitBatch();
    return results;
};

