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
import { format } from 'date-fns';
import type { AttendanceRecord, Employee } from './types';
import { getFiscalYearMonths } from './fiscal-year';

export interface MonthlyPerformanceMetrics {
    employeeId: string;
    employeeName: string;
    bsYear: number;
    bsMonth: number;
    workdays: number; // Present days
    onTimeDays: number;
    onTimePct: number; // 0-100: onTimeDays / workdays
    absentDays: number;
    lateArrivals: number;
    earlyDepartures: number;
    missingPunches: number;
    satWorked: number; // Saturdays actually worked
    phWorked: number; // Public Holidays actually worked
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
        const onTimeDays = workdays - lateArrivals;
        const earlyDepartures = workRecords.filter(r => r.offDuty && r.clockOut && r.clockOut < r.offDuty).length;
        const missingPunches = records.filter(r => (r.status || '').includes('Miss')).length;
        const satWorked = records.filter(r => r.status === 'Saturday' && ((r.regularHours || 0) + (r.overtimeHours || 0)) > 0).length;
        const phWorked = records.filter(r => r.status === 'Public Holiday' && ((r.regularHours || 0) + (r.overtimeHours || 0)) > 0).length;

        const regularHours = records.reduce((s, r) => s + (r.regularHours || 0), 0);
        const overtimeHours = records.reduce((s, r) => s + (r.overtimeHours || 0), 0);
        const grossHours = records.reduce((s, r) => s + (r.grossHours || (r.regularHours || 0) + (r.overtimeHours || 0)), 0);

        const attendanceRate = (workdays + absentDays) > 0 ? (workdays / (workdays + absentDays)) * 100 : 0;
        const otLoadPct = grossHours > 0 ? (overtimeHours / grossHours) * 100 : 0;
        const onTimePct = workdays > 0 ? (onTimeDays / workdays) * 100 : 0;

        results.push({
            employeeId, employeeName, bsYear, bsMonth,
            workdays, onTimeDays, onTimePct, absentDays, lateArrivals, earlyDepartures, missingPunches,
            satWorked, phWorked, regularHours, overtimeHours, grossHours, attendanceRate, otLoadPct,
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
            existing.onTimeDays += m.onTimeDays;
            existing.absentDays += m.absentDays;
            existing.lateArrivals += m.lateArrivals;
            existing.earlyDepartures += m.earlyDepartures;
            existing.missingPunches += m.missingPunches;
            existing.satWorked += m.satWorked;
            existing.phWorked += m.phWorked;
            existing.regularHours += m.regularHours;
            existing.overtimeHours += m.overtimeHours;
            existing.grossHours += m.grossHours;
        }
    }

    return Array.from(byEmployee.values()).map(e => ({
        ...e,
        attendanceRate: (e.workdays + e.absentDays) > 0 ? (e.workdays / (e.workdays + e.absentDays)) * 100 : 0,
        otLoadPct: e.grossHours > 0 ? (e.overtimeHours / e.grossHours) * 100 : 0,
        onTimePct: e.workdays > 0 ? (e.onTimeDays / e.workdays) * 100 : 0,
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

/* =========================
   Company-wide pattern insights (one month)
   ========================= */

const WEEKDAY_ORDER = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export interface DayOfWeekPattern {
    day: string;
    total: number;
    punctualityPct: number; // on-time present / total records that day
    lateArrivalsPct: number; // late present / total
    absenteeismPct: number; // absent / total
}

export interface MonthlyPatternInsights {
    highestAbsenteeism: { day: string; count: number };
    highestLateArrivals: { day: string; count: number };
    mostPunctualWeekday: { day: string; rate: number };
    saturdayUtilization: number; // 0-100
    worstShiftStart: { time: string; rate: number }; // onDuty time with the highest late rate
    publicHolidayOtHours: number;
    endOfMonthTrendPct: number; // % change in late rate, first half of month vs second half
    lateHotspots: { date: string; count: number }[]; // top dates (AD) with the most late arrivals company-wide
    dayOfWeekPatterns: DayOfWeekPattern[]; // Sunday..Saturday
}

/**
 * Company-wide behavioral pattern insights for one BS month, computed live
 * from calculated attendance - mirrors the "Pattern Insights" and "Day of
 * Week Patterns" sections the source Excel workbook produced, so nothing
 * here is fabricated: every figure traces back to an actual attendance row.
 */
export const computeMonthlyPatternInsights = (
    attendance: AttendanceRecord[],
    bsYear: number,
    bsMonth: number
): MonthlyPatternInsights => {
    const monthly = attendance.filter(r => r.bsYear === bsYear && r.bsMonth === bsMonth);

    const dayStats: Record<string, { total: number; late: number; onTime: number; absent: number }> = {};
    const shiftStartStats: Record<string, { total: number; late: number }> = {};
    const dateLateCounts: Record<string, number> = {};
    let saturdayWorked = 0; let saturdayTotal = 0;
    let publicHolidayOtHours = 0;

    // First-half vs second-half of the month, by AD calendar day-of-month,
    // for a simple trend read (not a full time series - just directional).
    let firstHalfLate = 0, firstHalfTotal = 0, secondHalfLate = 0, secondHalfTotal = 0;

    monthly.forEach(r => {
        const dateObj = new Date(r.date);
        const day = format(dateObj, 'EEEE');
        const dayOfMonth = dateObj.getDate();

        if (!dayStats[day]) dayStats[day] = { total: 0, late: 0, onTime: 0, absent: 0 };
        dayStats[day].total++;

        const isLate = Boolean(r.status === 'Present' && r.onDuty && r.clockIn && r.clockIn > r.onDuty);
        if (r.status === 'Absent') dayStats[day].absent++;
        if (r.status === 'Present') {
            if (isLate) dayStats[day].late++; else dayStats[day].onTime++;
        }

        if (r.onDuty) {
            if (!shiftStartStats[r.onDuty]) shiftStartStats[r.onDuty] = { total: 0, late: 0 };
            shiftStartStats[r.onDuty].total++;
            if (isLate) shiftStartStats[r.onDuty].late++;
        }

        if (isLate) {
            const dateKey = format(dateObj, 'yyyy-MM-dd');
            dateLateCounts[dateKey] = (dateLateCounts[dateKey] || 0) + 1;
            if (dayOfMonth <= 15) firstHalfLate++; else secondHalfLate++;
        }
        if (r.status === 'Present') {
            if (dayOfMonth <= 15) firstHalfTotal++; else secondHalfTotal++;
        }

        if (day === 'Saturday') {
            saturdayTotal++;
            if (r.status === 'Saturday' && ((r.regularHours || 0) + (r.overtimeHours || 0)) > 0) saturdayWorked++;
        }

        if (r.status === 'Public Holiday') {
            publicHolidayOtHours += r.overtimeHours || 0;
        }
    });

    let highestAbsenteeism = { day: 'N/A', count: 0 };
    let highestLateArrivals = { day: 'N/A', count: 0 };
    let mostPunctualWeekday = { day: 'N/A', rate: 0 };

    for (const day in dayStats) {
        const s = dayStats[day];
        if (s.absent > highestAbsenteeism.count) highestAbsenteeism = { day, count: s.absent };
        if (s.late > highestLateArrivals.count) highestLateArrivals = { day, count: s.late };
        const punctual = s.onTime + s.late;
        const rate = punctual > 0 ? (s.onTime / punctual) * 100 : 0;
        if (punctual > 0 && rate > mostPunctualWeekday.rate) mostPunctualWeekday = { day, rate };
    }

    const saturdayUtilization = saturdayTotal > 0 ? (saturdayWorked / saturdayTotal) * 100 : 0;

    let worstShiftStart = { time: 'N/A', rate: 0 };
    for (const time in shiftStartStats) {
        const s = shiftStartStats[time];
        const rate = s.total > 0 ? (s.late / s.total) * 100 : 0;
        if (s.total >= 3 && rate > worstShiftStart.rate) worstShiftStart = { time, rate };
    }

    const firstHalfRate = firstHalfTotal > 0 ? (firstHalfLate / firstHalfTotal) * 100 : 0;
    const secondHalfRate = secondHalfTotal > 0 ? (secondHalfLate / secondHalfTotal) * 100 : 0;
    const endOfMonthTrendPct = firstHalfRate > 0 ? ((secondHalfRate - firstHalfRate) / firstHalfRate) * 100 : (secondHalfRate > 0 ? 100 : 0);

    const lateHotspots = Object.entries(dateLateCounts)
        .filter(([, count]) => count > 1)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([date, count]) => ({ date, count }));

    const dayOfWeekPatterns: DayOfWeekPattern[] = WEEKDAY_ORDER.map(day => {
        const s = dayStats[day] || { total: 0, late: 0, onTime: 0, absent: 0 };
        return {
            day,
            total: s.total,
            punctualityPct: s.total > 0 ? (s.onTime / s.total) * 100 : 0,
            lateArrivalsPct: s.total > 0 ? (s.late / s.total) * 100 : 0,
            absenteeismPct: s.total > 0 ? (s.absent / s.total) * 100 : 0,
        };
    });

    return {
        highestAbsenteeism, highestLateArrivals, mostPunctualWeekday, saturdayUtilization,
        worstShiftStart, publicHolidayOtHours, endOfMonthTrendPct, lateHotspots, dayOfWeekPatterns,
    };
};
