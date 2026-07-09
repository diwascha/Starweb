/**
 * @fileOverview Consolidated Ledger Import Service.
 *
 * Implements high-density horizontal parsing for the 5 key sections of the workforce ledger.
 * Strictly follows the column offsets: A=0, P=15, AB=27, AV=47, BL=63.
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

// --- Consolidated Ledger Fixed Anchors (0-indexed) ---
const CL_DATA_START = 2; // Row 3

const SEC1_START = 0;   // A
const SEC2_START = 15;  // P
const SEC3_START = 27;  // AB
const SEC4_START = 47;  // AV
const SEC5_START = 63;  // BL

/**
 * Extracts BS Year and Month from Section 3 (most reliable source).
 */
const resolvePeriodFromRow = (row: any[]): { year: number, month: number } | null => {
    // AE (30) is BS Year, AF (31) is BS Month # (1-12)
    const year = coerceNumber(row[30], 0);
    const month = coerceNumber(row[31], 0);
    
    if (year > 2000 && month >= 1 && month <= 12) {
        return { year, month: month - 1 }; // Store 0-indexed month
    }

    // Fallback: Try parsing string from Section 4 Period BS (AX - 49)
    const periodStr = String(row[49] || row[17] || row[64] || '');
    const match = periodStr.match(/(\d{4})[-/](\d{1,2})/);
    if (match) {
        return { 
            year: parseInt(match[1], 10), 
            month: parseInt(match[2], 10) - 1 
        };
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

    console.log(`[VBA Import] Starting scan of ${grid.length} rows...`);

    for (let r = CL_DATA_START; r < grid.length; r++) {
        const row = grid[r];
        if (!row || row.length < 10) continue;

        // Skip "TOTAL" rows
        const leadVal = String(row[0] || '').trim().toLowerCase();
        if (!leadVal || leadVal === 'employee' || leadVal.includes('total')) continue;

        // Identify basic context
        const period = resolvePeriodFromRow(row);
        if (!period) {
            console.warn(`[VBA Import] Row ${r+1}: Missing or invalid period. Skipping.`);
            continue;
        }

        // Section 1: Annual Bonus Summary (A-M)
        const s1Name = String(row[0] || '').trim();
        if (s1Name) {
            const emp = ensureEmployee(s1Name);
            const data: AnnualBonusSummary = {
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
            batch.set(doc(db, 'bonus_summaries', emp.id), data, { merge: true });
            results.bonusSummaries++;
            writeCount++;
        }

        // Section 2: Bonus Ledger (P-Y)
        const s2Name = String(row[18] || '').trim();
        if (s2Name) {
            const emp = ensureEmployee(s2Name);
            const id = `${emp.id}_${period.year}_${period.month}`;
            const data: BonusLedgerEntry = {
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
                isEligible: String(row[22] || '').toLowerCase() === 'true' || String(row[22] || '').toLowerCase() === 'yes',
                accrual: coerceNumber(row[23]),
                note: String(row[24] || '')
            };
            batch.set(doc(db, 'bonus_ledger', id), data, { merge: true });
            results.bonusLedger++;
            writeCount++;
        }

        // Section 3: Behavior Ledger (AB-AS)
        const s3Name = String(row[33] || '').trim();
        if (s3Name) {
            const emp = ensureEmployee(s3Name);
            const id = `${emp.id}_${period.year}_${period.month}`;
            const data: BehaviorLedgerEntry = {
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
            batch.set(doc(db, 'behavior_ledger', id), data, { merge: true });
            results.behaviorLedger++;
            writeCount++;
        }

        // Section 4: Payroll Ledger (AV-BJ)
        const s4Name = String(row[50] || '').trim();
        if (s4Name) {
            const emp = ensureEmployee(s4Name);
            const id = `${period.year}-${period.month}-${emp.id}`;
            const data: Omit<Payroll, 'id'> = {
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
            batch.set(doc(db, COLLECTIONS.PAYROLL, id), data, { merge: true });
            results.payroll++;
            writeCount++;
        }

        // Section 5: Behavior Analytics (BL-BW)
        const s5Name = String(row[66] || '').trim();
        if (s5Name) {
            const emp = ensureEmployee(s5Name);
            const id = `${emp.id}_${period.year}_${period.month}`;
            const data: BehaviorAnalyticsEntry = {
                id,
                runTime: String(row[63] || ''),
                periodBS: String(row[64] || ''),
                periodAD: String(row[65] || ''),
                bsYear: period.year,
                bsMonth: period.month,
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
            batch.set(doc(db, 'behavior_analytics', id), data, { merge: true });
            results.behaviorAnalytics++;
            writeCount++;
        }

        if (writeCount >= 400) {
            await commitBatch();
        }
        onProgress(r - CL_DATA_START + 1, grid.length - CL_DATA_START);
    }

    if (writeCount > 0) await commitBatch();
    console.log("[VBA Import] Final Results:", results);
    return results;
};
