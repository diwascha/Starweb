import { getFirebase } from '@/lib/firebase';
import { collection, doc, writeBatch } from 'firebase/firestore';
import type { Payroll, Employee, AttendanceRecord, AnalyticsReport, HrConfig, BonusLedgerEntry } from '@/lib/types';
import NepaliDate from 'nepali-date-converter';
import { getSetting } from '../settings-service';
import { COLLECTIONS, DEFAULT_HR_CONFIG } from '@/lib/constants';
import { createTimestamp, logServiceError, coerceNumber } from '@/lib/service-utils';
import { getPayrollCollection } from './data';
import { extractSection, extractPatternInsights, isAnalyticsRow } from './analytics';

/**
 * Calculates and persists monthly payroll records based on validated attendance.
 * Rates, TDS, workday assumptions, and bonus eligibility all come from the
 * hr_config setting (HR Setting > Payroll & Bonus Rules) - falling back to
 * DEFAULT_HR_CONFIG only when nothing has been saved yet.
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
    const configSetting = await getSetting('hr_config');
    const config = (configSetting?.value as HrConfig) || DEFAULT_HR_CONFIG;
    const { defaultHourly, fallbackHourly, tdsRate, monthDays, stdWorkdays } = config.payroll;
    const { baseDayHours } = config.hours;
    const { bonusEligReq } = config.bonus;

    const workingEmployees = allEmployees.filter(e => e.status === 'Working');
    const monthlyAttendance = allAttendance.filter(r => r.bsYear === bsYear && r.bsMonth === bsMonth);
    const batch = writeBatch(db);
    const now = createTimestamp();
    let processedCount = 0;

    for (const employee of workingEmployees) {
        const empAtt = monthlyAttendance.filter(r => r.employeeId === employee.id);
        // No attendance rows at all for this month means the employee didn't
        // work this period (new hire, resigned mid-period before this month,
        // or simply never had this month's logs imported) - don't manufacture
        // a zero-hours payroll row for them.
        if (empAtt.length === 0) continue;
        processedCount++;
        const regHrs = empAtt.reduce((sum, r) => sum + (r.regularHours || 0), 0);
        const otHrs = empAtt.reduce((sum, r) => sum + (r.overtimeHours || 0), 0);
        const presentDays = empAtt.filter(r => r.status !== 'Absent').length;
        const absent = empAtt.filter(r => r.status === 'Absent').length;

        // An employee with no rate saved on their record falls back to the
        // configured default; a rate of exactly 0 (data-entry gap) falls
        // back further to the emergency fallback rate rather than paying
        // nothing.
        const configuredWage = employee.wageAmount || (employee.wageBasis === 'Monthly' ? defaultHourly * baseDayHours * monthDays : defaultHourly);
        const wageAmount = configuredWage || fallbackHourly;
        const rate = employee.wageBasis === 'Monthly' ? (wageAmount / monthDays / baseDayHours) : wageAmount;
        const basic = employee.wageBasis === 'Monthly' ? (wageAmount - (absent * (wageAmount / monthDays))) : (regHrs * rate);
        const otPay = otHrs * rate;

        // Matches the VBA workbook's PR_OFF_BASE text exactly: a monthly
        // employee shows their configured monthly salary, an hourly employee
        // shows the day-equivalent of their hourly rate (rate * Base_Day_Hours)
        // rather than the tiny internal per-hour calculation figure.
        const baseText = employee.wageBasis === 'Monthly'
            ? `Monthly ${wageAmount.toFixed(2)}`
            : `${(rate * baseDayHours).toFixed(2)}/day`;

        // Monthly bonus accrual only - full at bonusEligReq+ attendance, pro-rata
        // below it. This mirrors the "monthly accrual" tier of the VBA bonus
        // engine; Attend_Req_Pct governs a separate annual payout-eligibility
        // gate (which months count toward the year-end payout) that isn't
        // reproduced here - the source workbook's annual bonus ledger is
        // still the authority for that and is brought in via Import Ledger.
        const attendancePct = stdWorkdays > 0 ? Math.min(100, (presentDays / stdWorkdays) * 100) : 0;
        const monthlyBonusBase = wageAmount / 12;
        const bonus = attendancePct >= bonusEligReq ? monthlyBonusBase : monthlyBonusBase * (attendancePct / 100);

        const gross = basic + otPay + (employee.allowance || 0);
        const tds = gross * tdsRate;
        const net = gross + bonus - tds;
        const payrollId = `${bsYear}-${bsMonth}-${employee.id}`;
        batch.set(doc(getPayrollCollection(), payrollId), {
            bsYear,
            bsMonth,
            employeeId: employee.id,
            employeeName: employee.name,
            base: baseText,
            presentDays,
            absentDays: absent,
            regularHours: regHrs,
            overtimeHours: otHrs,
            rate,
            regularPay: basic,
            otPay,
            allowance: employee.allowance || 0,
            bonus,
            tds,
            totalPay: gross,
            netPayment: net,
            createdBy: calculatedBy,
            createdAt: now,
            ownership: employee.ownership || 'Both',
            source: 'recalculated',
        }, { merge: true });

        // Recalculate previously only folded the bonus amount into net pay -
        // the Bonus Evaluation tab reads exclusively from bonus_ledger, which
        // was only ever populated by importing the legacy Excel ledger, so a
        // month processed live here never showed up there. Write the same
        // per-employee accrual record recalculation already computed above.
        // isEligible marks full-rate accrual (attendancePct >= bonusEligReq);
        // below that, bonus is still paid pro-rata (see comment above), so
        // accrual always reflects what was actually folded into net pay -
        // isEligible is informational, not a gate on whether anything accrued.
        const isEligible = attendancePct >= bonusEligReq;
        const bonusEntry: BonusLedgerEntry = {
            id: `${employee.id}_${bsYear}_${bsMonth}`,
            runTime: now,
            periodAD: now,
            periodBS: `${bsYear}-${bsMonth}`,
            bsYear,
            bsMonth,
            employeeId: employee.id,
            employeeName: employee.name,
            basis: baseText,
            baseAmount: wageAmount,
            attendancePct,
            isEligible,
            accrual: bonus,
            note: isEligible ? '' : `Pro-rated: below ${bonusEligReq}% attendance requirement`,
        };
        batch.set(doc(collection(db, 'bonus_ledger'), bonusEntry.id), bonusEntry, { merge: true });
    }
    await batch.commit();
    return { employeeCount: processedCount };
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
        totalHours: ['total hour', 'total hrs'],
        rate: ['base'], regularPay: ['basic pay'], otPay: ['ot pay'], totalPay: ['gross'],
        absentDays: ['absent days'], deduction: ['absent amt.', 'deduction'], allowance: ['allowance'],
        bonus: ['bonus'], salaryTotal: ['gross salary'], tds: ['tds'], advance: ['advance'],
        netPayment: ['final net', 'net'], roundedNet: ['rounded net'], remark: ['remark']
    };
    const cells = headerRow.map(h => String(h || '').trim().toLowerCase());

    // Pass 1: exact matches only. Runs first so a column like "Gross" isn't
    // later overwritten by "Gross Salary" just because it contains "gross".
    cells.forEach((cell, i) => {
        for (const key in payrollHeaders) {
            if (map[key] === undefined && payrollHeaders[key].includes(cell)) map[key] = i;
        }
    });

    // Pass 2: substring fallback for anything an exact match didn't resolve.
    cells.forEach((cell, i) => {
        for (const key in payrollHeaders) {
            if (map[key] === undefined && payrollHeaders[key].some(alias => cell.includes(alias))) map[key] = i;
        }
    });

    return map;
};
