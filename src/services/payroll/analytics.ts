import type { Employee, AttendanceRecord, AnalyticsData, AnalyticsReport } from '@/lib/types';
import { format, startOfDay } from 'date-fns';

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

export const generateAnalyticsForMonth = (bsYear: number, bsMonth: number, allEmployees: Employee[], allAttendance: AttendanceRecord[], importedReport?: AnalyticsReport | null): AnalyticsData => {
    const monthly = allAttendance.filter(r => r.bsYear === bsYear && r.bsMonth === bsMonth);
    const dayStats: Record<string, any> = {};
    monthly.forEach(r => {
        const day = format(new Date(r.date), 'EEEE');
        if (!dayStats[day]) dayStats[day] = { count: 0, late: 0, absent: 0 };
        dayStats[day].count++;
        if (r.status === 'Absent') dayStats[day].absent++;
    });
    return {
        punctuality: [], behavior: [], workforce: [], patterns: [],
        highestAbsenteeism: { day: 'N/A', count: 0 },
        highestLateArrivals: { day: 'N/A', count: 0 },
        lateHotspots: [], saturdayUtilization: 0, mostPunctualWeekday: { day: 'N/A', rate: 0 },
        worstShiftStart: { time: 'N/A', rate: 0 }, importedReport
    };
};
