/**
 * @fileOverview Consolidated Ledger Import Service.
 *
 * This service implements high-density horizontal parsing for the 5 key sections of the workforce ledger:
 * 1. Annual Bonus Summary (A-M)
 * 2. Bonus Ledger (P-Y)
 * 3. Behavior Ledger (AB-AS)
 * 4. Payroll Ledger (AV-BJ)
 * 5. Behavior Analytics (BL-BW)
 */

import { getFirebase } from '@/lib/firebase';
import { 
    collection, 
    doc, 
    writeBatch, 
    setDoc
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

// --- Consolidated Ledger Fixed Offsets (0-based) ---
const CL_DATA_ROW = 2; // Data starts at Row 3

const SEC_BONUS_SUMMARY = { start: 0, empIdx: 0 };    // A-M
const SEC_BONUS_LEDGER = { start: 15, empIdx: 18 };   // P-Y (P=15, S=18)
const SEC_BEHAVIOR_LEDGER = { start: 27, empIdx: 33 }; // AB-AS (AB=27, AH=33)
const SEC_PAYROLL_LEDGER = { start: 47, empIdx: 50 }; // AV-BJ (AV=47, AY=50)
const SEC_BEHAVIOR_ANALYTICS = { start: 63, empIdx: 66 }; // BL-BW (BL=63, BO=66)

/**
 * Robustly extracts the BS period from strings.
 * Handles formats like: "Jestha 2083 (BS 2083-02)", "BS 2083-02", "2083-02", "2083/02"
 */
const parsePeriodString = (str: string): { year: number, month: number } | null => {
    if (!str) return null;
    const s = String(str);
    // Look for YYYY-MM or YYYY/MM with optional BS prefix
    const match = s.match(/(?:BS\s*)?(\d{4})[-/](\d{1,2})/i);
    if (match) {
        return { year: parseInt(match[1]), month: parseInt(match[2]) - 1 };
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

    const commitIfNeeded = async () => {
        if (writeCount >= 450) {
            await batch.commit();
            batch = writeBatch(db);
            writeCount = 0;
        }
    };

    const ensureEmployee = async (name: string) => {
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
        await commitIfNeeded();
        return employee;
    };

    // Process row by row starting from Row 3 (index 2)
    for (let r = CL_DATA_ROW; r < grid.length; r++) {
        const row = grid[r];
        // Ensure row exists and has at least one non-null/non-empty cell
        if (!row || !row.some(c => c !== null && c !== undefined && String(c).trim() !== '')) continue;

        // --- SECTION 1: ANNUAL BONUS SUMMARY (A-M) ---
        const s1_name = String(row[SEC_BONUS_SUMMARY.empIdx] || '').trim();
        if (s1_name && s1_name.toLowerCase() !== 'employee' && !s1_name.toLowerCase().includes('total')) {
            const employee = await ensureEmployee(s1_name);
            const summaryData: AnnualBonusSummary = {
                id: employee.id,
                employeeName: employee.name,
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
            batch.set(doc(db, 'bonus_summaries', employee.id), summaryData, { merge: true });
            results.bonusSummaries++;
            writeCount++;
        }

        // --- SECTION 2: BONUS LEDGER (P-Y) ---
        const s2_name = String(row[SEC_BONUS_LEDGER.empIdx] || '').trim();
        if (s2_name && s2_name.toLowerCase() !== 'employee' && !s2_name.toLowerCase().includes('total')) {
            const employee = await ensureEmployee(s2_name);
            const periodStr = String(row[17] || '');
            const period = parsePeriodString(periodStr);
            if (period) {
                const ledgerId = `${employee.id}_${period.year}_${period.month}`;
                const ledgerData: BonusLedgerEntry = {
                    id: ledgerId,
                    runTime: String(row[15] || ''),
                    periodAD: String(row[16] || ''),
                    periodBS: periodStr,
                    bsYear: period.year,
                    bsMonth: period.month,
                    employeeId: employee.id,
                    employeeName: employee.name,
                    basis: String(row[19] || ''),
                    baseAmount: coerceNumber(row[20]),
                    attendancePct: coerceNumber(row[21]),
                    isEligible: !!row[22],
                    accrual: coerceNumber(row[23]),
                    note: String(row[24] || '')
                };
                batch.set(doc(db, 'bonus_ledger', ledgerId), ledgerData, { merge: true });
                results.bonusLedger++;
                writeCount++;
            }
        }

        // --- SECTION 3: BEHAVIOR LEDGER (AB-AS) ---
        const s3_name = String(row[SEC_BEHAVIOR_LEDGER.empIdx] || '').trim();
        if (s3_name && s3_name.toLowerCase() !== 'employee' && !s3_name.toLowerCase().includes('total')) {
            const employee = await ensureEmployee(s3_name);
            const year = coerceNumber(row[30]);
            const month = coerceNumber(row[31]) - 1; // Correct 0-based month
            if (year > 0) {
                const ledgerId = `${employee.id}_${year}_${month}`;
                const behaviorData: BehaviorLedgerEntry = {
                    id: ledgerId,
                    runTime: String(row[27] || ''),
                    periodBS: String(row[28] || ''),
                    periodAD: String(row[29] || ''),
                    bsYear: year,
                    bsMonth: month,
                    bsMonthName: String(row[32] || ''),
                    employeeId: employee.id,
                    employeeName: employee.name,
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
                batch.set(doc(db, 'behavior_ledger', ledgerId), behaviorData, { merge: true });
                results.behaviorLedger++;
                writeCount++;
            }
        }

        // --- SECTION 4: PAYROLL LEDGER (AV-BJ) ---
        const s4_name = String(row[SEC_PAYROLL_LEDGER.empIdx] || '').trim();
        if (s4_name && s4_name.toLowerCase() !== 'employee' && !s4_name.toLowerCase().includes('total')) {
            const employee = await ensureEmployee(s4_name);
            const periodStr = String(row[49] || '');
            const period = parsePeriodString(periodStr);
            if (period) {
                const payrollId = `${period.year}-${period.month}-${employee.id}`;
                const payrollData: Omit<Payroll, 'id'> = {
                    bsYear: period.year,
                    bsMonth: period.month,
                    runTime: String(row[47] || ''),
                    periodAD: String(row[48] || ''),
                    periodBS: periodStr,
                    employeeId: employee.id,
                    employeeName: employee.name,
                    base: String(row[51] || ''),
                    presentDays: coerceNumber(row[52]),
                    extraDays: coerceNumber(row[53]),
                    leaveDays: coerceNumber(row[54]),
                    regularPay: coerceNumber(row[55]),
                    otPay: coerceNumber(row[56]),
                    allowance: coerceNumber(row[57]),
                    totalPay: coerceNumber(row[58]),
                    tds: coerceNumber(row[59]),
                    advance: coerceNumber(row[60]),
                    netPayment: coerceNumber(row[61]),
                    createdBy: importedBy,
                    createdAt: now
                };
                batch.set(doc(db, COLLECTIONS.PAYROLL, payrollId), payrollData, { merge: true });
                results.payroll++;
                writeCount++;
            }
        }

        // --- SECTION 5: BEHAVIOR ANALYTICS (BL-BW) ---
        const s5_name = String(row[SEC_BEHAVIOR_ANALYTICS.empIdx] || '').trim();
        if (s5_name && s5_name.toLowerCase() !== 'employee' && !s5_name.toLowerCase().includes('total')) {
            const employee = await ensureEmployee(s5_name);
            const periodStr = String(row[64] || '');
            const period = parsePeriodString(periodStr);
            if (period) {
                const analyticsId = `${employee.id}_${period.year}_${period.month}`;
                const analyticsData: BehaviorAnalyticsEntry = {
                    id: analyticsId,
                    runTime: String(row[63] || ''),
                    periodBS: periodStr,
                    periodAD: String(row[65] || ''),
                    employeeId: employee.id,
                    employeeName: employee.name,
                    behaviorInsight: String(row[67] || ''),
                    punctualityTrend: String(row[68] || ''),
                    absencePattern: String(row[69] || ''),
                    otImpact: String(row[70] || ''),
                    shiftEndBehavior: String(row[71] || ''),
                    performanceInsight: String(row[72] || ''),
                    bestDayOfWeek: String(row[73] || ''),
                    worstDayOfWeek: String(row[74] || '')
                };
                batch.set(doc(db, 'behavior_analytics', analyticsId), analyticsData, { merge: true });
                results.behaviorAnalytics++;
                writeCount++;
            }
        }

        await commitIfNeeded();
        onProgress(r - CL_DATA_ROW + 1, grid.length - CL_DATA_ROW);
    }

    if (writeCount > 0) await batch.commit();
    return results;
};
