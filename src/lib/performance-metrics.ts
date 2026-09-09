/**
 * @fileOverview Shared employee performance metrics, computed directly from
 * calculated AttendanceRecord data.
 *
 * This is the single source of truth for "how did this employee perform in
 * this BS month" - both the Payroll > Behavioral Intelligence tab and the
 * Employee Performance Benchmark page read through this module so the two
 * screens never disagree, and so multi-month aggregation (quarterly,
 * six-month, yearly) is built by summing/averaging real monthly figures
 * rather than recomputing anything from scratch.
 */
import type { AttendanceRecord, Employee } from './types';
import { getFiscalYearMonths } from './fiscal-year';

export interface MonthlyPerformanceMetrics {
    employeeId: string;
    employeeName: string;
    bsYear: number;
    bsMonth: number;
    workdays: number; // Present days
    absentDays: number;
    lateArrivals: number;
    earlyDepartures: number;
    missingPunches: number;
    satPhWorked: number; // Saturday/Public Holiday days actually worked
    regularHours: number;
    overtimeHours: number;
    grossHours: number;
    attendanceRate: number; // 0-100: workdays / (workdays + absentDays)
    otLoadPct: number; // 0-100: overtimeHours / grossHours
}

/**
 * Computes one metrics row per employee for a single BS year/month, derived
 * entirely from already-calculated attendance (never recomputed hours -
 * only counted/summed). Employees with zero records for the month are
 * omitted, matching "only calculate what the data supports."
 */
export const computeMonthlyPerformanceMetrics = (
    employees: Employee[],
    attendance: AttendanceRecord[],
    bsYear: number,
    bsMonth: number
): MonthlyPerformanceMetrics[] => {
    const monthRecords = attendance.filter(r => r.bsYear === bsYear && r.bsMonth === bsMonth);
    if (monthRecords.length === 0) return [];

    const byEmployee = new Map<string, AttendanceRecord[]>();
    monthRecords.forEach(r => {
        if (!r.employeeId) return;
        const list = byEmployee.get(r.employeeId) || [];
        list.push(r);
        byEmployee.set(r.employeeId, list);
    });

    const results: MonthlyPerformanceMetrics[] = [];
    for (const [employeeId, records] of byEmployee) {
        const employee = employees.find(e => e.id === employeeId);
        const employeeName = employee?.name || records[0].employeeName;

        const workRecords = records.filter(r => r.status === 'Present');
        const workdays = workRecords.length;
        const absentDays = records.filter(r => r.status === 'Absent').length;
        const lateArrivals = workRecords.filter(r => r.onDuty && r.clockIn && r.clockIn > r.onDuty).length;
        const earlyDepartures = workRecords.filter(r => r.offDuty && r.clockOut && r.clockOut < r.offDuty).length;
        const missingPunches = records.filter(r => (r.status || '').includes('Miss')).length;
        const satPhWorked = records.filter(r => (r.status === 'Saturday' || r.status === 'Public Holiday') && ((r.regularHours || 0) + (r.overtimeHours || 0)) > 0).length;

        const regularHours = records.reduce((s, r) => s + (r.regularHours || 0), 0);
        const overtimeHours = records.reduce((s, r) => s + (r.overtimeHours || 0), 0);
        const grossHours = records.reduce((s, r) => s + (r.grossHours || (r.regularHours || 0) + (r.overtimeHours || 0)), 0);

        const attendanceRate = (workdays + absentDays) > 0 ? (workdays / (workdays + absentDays)) * 100 : 0;
        const otLoadPct = grossHours > 0 ? (overtimeHours / grossHours) * 100 : 0;

        results.push({
            employeeId, employeeName, bsYear, bsMonth,
            workdays, absentDays, lateArrivals, earlyDepartures, missingPunches, satPhWorked,
            regularHours, overtimeHours, grossHours, attendanceRate, otLoadPct,
        });
    }

    return results.sort((a, b) => a.employeeName.localeCompare(b.employeeName));
};

/**
 * Aggregates monthly metrics across a set of BS year/month pairs (e.g. a
 * fiscal quarter, half-year, or full year) into one row per employee, by
 * summing counts/hours and re-deriving the rate fields from the summed
 * totals - never averaging pre-averaged percentages, which would skew
 * results toward months with fewer workdays.
 */
export const aggregatePerformanceMetrics = (
    employees: Employee[],
    attendance: AttendanceRecord[],
    periods: { bsYear: number; bsMonth: number }[]
): Omit<MonthlyPerformanceMetrics, 'bsYear' | 'bsMonth'>[] => {
    const perMonth = periods.flatMap(p => computeMonthlyPerformanceMetrics(employees, attendance, p.bsYear, p.bsMonth));

    const byEmployee = new Map<string, Omit<MonthlyPerformanceMetrics, 'bsYear' | 'bsMonth'>>();
    for (const m of perMonth) {
        const existing = byEmployee.get(m.employeeId);
        if (!existing) {
            const { bsYear, bsMonth, ...rest } = m;
            byEmployee.set(m.employeeId, { ...rest });
        } else {
            existing.workdays += m.workdays;
            existing.absentDays += m.absentDays;
            existing.lateArrivals += m.lateArrivals;
            existing.earlyDepartures += m.earlyDepartures;
            existing.missingPunches += m.missingPunches;
            existing.satPhWorked += m.satPhWorked;
            existing.regularHours += m.regularHours;
            existing.overtimeHours += m.overtimeHours;
            existing.grossHours += m.grossHours;
        }
    }

    return Array.from(byEmployee.values()).map(e => ({
        ...e,
        attendanceRate: (e.workdays + e.absentDays) > 0 ? (e.workdays / (e.workdays + e.absentDays)) * 100 : 0,
        otLoadPct: e.grossHours > 0 ? (e.overtimeHours / e.grossHours) * 100 : 0,
    })).sort((a, b) => a.employeeName.localeCompare(b.employeeName));
};

export type BenchmarkPeriodType = 'monthly' | 'quarterly' | 'sixmonth' | 'yearly';

/**
 * Splits a fiscal year's 12 months (Shrawan-first) into the BS year/month
 * groups a benchmark period type aggregates - one group for "monthly" (the
 * single selected month), 4 quarters, 2 halves, or the whole year.
 */
export const getBenchmarkPeriodGroups = (
    fyStartYear: number,
    periodType: BenchmarkPeriodType,
    selectedIndex: number
): { label: string; months: { bsYear: number; bsMonth: number }[] }[] => {
    const fyMonths = getFiscalYearMonths(fyStartYear);
    if (periodType === 'yearly') {
        return [{ label: `FY ${fyStartYear}/${String((fyStartYear + 1) % 100).padStart(2, '0')}`, months: fyMonths }];
    }
    if (periodType === 'sixmonth') {
        return [
            { label: 'H1 (Shrawan-Poush)', months: fyMonths.slice(0, 6) },
            { label: 'H2 (Magh-Ashadh)', months: fyMonths.slice(6, 12) },
        ];
    }
    if (periodType === 'quarterly') {
        return [
            { label: 'Q1 (Shrawan-Ashwin)', months: fyMonths.slice(0, 3) },
            { label: 'Q2 (Kartik-Poush)', months: fyMonths.slice(3, 6) },
            { label: 'Q3 (Magh-Chaitra)', months: fyMonths.slice(6, 9) },
            { label: 'Q4 (Baishakh-Ashadh)', months: fyMonths.slice(9, 12) },
        ];
    }
    // monthly: one group per fiscal month
    return fyMonths.map(m => ({ label: '', months: [m] }));
};
