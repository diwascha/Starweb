import { getFirebase } from '@/lib/firebase';
import { collection, doc, writeBatch, getDocs, query, where } from 'firebase/firestore';
import { Employee, AttendanceRecord, BehaviorLedgerEntry, BehaviorAnalyticsEntry } from '@/lib/types';
import { NEPALI_MONTHS } from '@/lib/constants';
import { createTimestamp } from '@/lib/service-utils';
import { format } from 'date-fns';
import { isPeriodLocked } from '../attendance/data';

export const isAnalyticsRow = (name: string): boolean => {
    const n = String(name || '').trim().toLowerCase();
    return ['employee', 'total', 'pattern insights', 'day of week patterns', 'month-to-month'].some(p => n.includes(p));
};

export const extractSection = (jsonData: any[][], marker: string): any[] => {
    const m = marker.toLowerCase();
    let idx = jsonData.findIndex(row => row.join(' ').toLowerCase().includes(m));
    if (idx === -1) return [];
    const headers = jsonData[idx + 1].map(h => String(h || '').trim());
    const data: any[] = [];
    for (let i = idx + 2; i < jsonData.length; i++) {
        const row = jsonData[i];
        if (!row || row.every(c => !c) || isAnalyticsRow(String(row[0]))) break;
        const item: any = {};
        headers.forEach((h, j) => { if (h) item[h] = row[j]; });
        data.push(item);
    }
    return data;
};

export const extractPatternInsights = (jsonData: any[][]): string[] => {
    const idx = jsonData.findIndex(row => row.join(' ').toLowerCase().includes('pattern insights'));
    if (idx === -1) return [];
    return jsonData.slice(idx + 1).map(r => String(r[0] || '').trim()).filter(t => t && !isAnalyticsRow(t));
};

/**
 * Fills in the "Behavioral Scoreboard" (behavior_ledger) and "Intelligence
 * Insights" (behavior_analytics) collections directly from processed
 * attendance, for periods where the source Excel never produced these
 * VBA-computed sections (every legacy monthly sheet, and any month of the
 * new format that skipped the analytics macro). Purely additive: existing
 * per-employee entries are left untouched.
 */
export const generateBehaviorAnalyticsForMonth = async (
    bsYear: number,
    bsMonth: number,
    allEmployees: Employee[],
    allAttendance: AttendanceRecord[],
    generatedBy: string
): Promise<{ generated: number }> => {
    const { db } = getFirebase();

    // A locked period - including every imported ledger month, which is
    // locked by default - must never have metrics generated or rebuilt from
    // it, even to "just" fill in a gap.
    if (await isPeriodLocked(bsYear, bsMonth)) {
        throw new Error("This period is locked and cannot be synced. Unlock it first.");
    }

    const monthly = allAttendance.filter(r => r.bsYear === bsYear && r.bsMonth === bsMonth);
    if (monthly.length === 0) return { generated: 0 };

    const monthName = NEPALI_MONTHS.find(m => m.value === bsMonth)?.name || '';
    const periodBS = `${monthName} ${bsYear}`;
    const now = createTimestamp();
    const batch = writeBatch(db);
    let generated = 0;

    const employeeIds = new Set(monthly.map(r => r.employeeId));
    for (const employeeId of employeeIds) {
        const emp = allEmployees.find(e => e.id === employeeId);
        if (!emp) continue;
        const empRecords = monthly.filter(r => r.employeeId === employeeId);
        const workRecords = empRecords.filter(r => r.status === 'Present');
        const workdays = workRecords.length;
        const lateDays = workRecords.filter(r => r.onDuty && r.clockIn && r.clockIn > r.onDuty).length;
        const earlyDays = workRecords.filter(r => r.offDuty && r.clockOut && r.clockOut < r.offDuty).length;
        const onTimeDays = workdays - lateDays;
        const onTimePct = workdays > 0 ? (onTimeDays / workdays) * 100 : 0;
        const missingPunches = empRecords.filter(r => (r.status || '').includes('Miss')).length;
        const absentDays = empRecords.filter(r => r.status === 'Absent').length;
        const satWorked = empRecords.filter(r => r.status === 'Saturday' && ((r.regularHours || 0) + (r.overtimeHours || 0)) > 0).length;
        const phWorked = empRecords.filter(r => r.status === 'Public Holiday' && ((r.regularHours || 0) + (r.overtimeHours || 0)) > 0).length;
        const otHours = empRecords.reduce((s, r) => s + (r.overtimeHours || 0), 0);

        const id = `${employeeId}_${bsYear}_${bsMonth}`;
        const ledgerEntry: BehaviorLedgerEntry = {
            id, runTime: now, periodBS, periodAD: '', bsYear, bsMonth, bsMonthName: monthName,
            employeeId, employeeName: emp.name, workdays, onTimeDays, onTimePct, lateDays, earlyDays,
            missingPunches, absentDays, satWorked, phWorked, extraOkHours: 0, otHours,
            source: 'generated',
        };
        batch.set(doc(db, 'behavior_ledger', id), ledgerEntry, { merge: true });

        const dayCounts: Record<string, { late: number; total: number }> = {};
        empRecords.forEach(r => {
            const day = format(new Date(r.date), 'EEEE');
            if (!dayCounts[day]) dayCounts[day] = { late: 0, total: 0 };
            dayCounts[day].total++;
            if (r.onDuty && r.clockIn && r.clockIn > r.onDuty) dayCounts[day].late++;
        });
        let bestDay = 'N/A'; let worstDay = 'N/A'; let bestRate = -1; let worstRate = -1;
        for (const day in dayCounts) {
            const { late, total } = dayCounts[day];
            const lateRate = total > 0 ? late / total : 0;
            if (bestRate === -1 || lateRate < bestRate) { bestRate = lateRate; bestDay = day; }
            if (worstRate === -1 || lateRate > worstRate) { worstRate = lateRate; worstDay = day; }
        }

        const punctualityTrend = onTimePct >= 90 ? 'Consistently punctual' : onTimePct >= 70 ? 'Occasionally late' : 'Often late';
        const absencePattern = absentDays === 0 ? 'Perfect attendance' : absentDays <= 2 ? 'Minor absences' : 'Frequent absences';
        const otImpact = otHours === 0 ? 'No overtime' : otHours < 10 ? 'Balanced workload' : 'Heavy overtime load';
        const shiftEndBehavior = earlyDays === 0 ? 'Stays till shift end' : earlyDays <= 2 ? 'Occasionally leaves early' : 'Frequently leaves early';
        const performanceInsight = onTimePct >= 90 && absentDays === 0 ? 'Strong performer' : onTimePct >= 70 && absentDays <= 2 ? 'Meets expectations' : 'Needs improvement';
        const behaviorInsight = `${lateDays} late day(s) and ${absentDays} absence(s) out of ${workdays} worked day(s) this period.`;

        const analyticsEntry: BehaviorAnalyticsEntry = {
            id, runTime: now, periodBS, periodAD: '', bsYear, bsMonth, employeeId, employeeName: emp.name,
            behaviorInsight, punctualityTrend, absencePattern, otImpact, shiftEndBehavior, performanceInsight,
            bestDayOfWeek: bestDay, worstDayOfWeek: worstDay,
            source: 'generated',
        };
        batch.set(doc(db, 'behavior_analytics', id), analyticsEntry, { merge: true });
        generated++;
    }

    if (generated > 0) await batch.commit();
    return { generated };
};

/**
 * True if the selected month already has any behavior_ledger data - whether
 * pulled straight from the source workbook at import time or computed here
 * previously. Sync Metrics uses this to decide, for the one selected month
 * only, whether to show what's already there or generate it fresh; it never
 * looks at (or touches) any other month.
 */
export const hasBehaviorAnalyticsForMonth = async (bsYear: number, bsMonth: number): Promise<boolean> => {
    const { db } = getFirebase();
    const snap = await getDocs(query(collection(db, 'behavior_ledger'), where('bsYear', '==', bsYear), where('bsMonth', '==', bsMonth)));
    return !snap.empty;
};
