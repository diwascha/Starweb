'use client';

import { useState, useEffect, useMemo } from 'react';
import type { Employee, AttendanceRecord, BehaviorLedgerEntry, BehaviorAnalyticsEntry } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { FileSpreadsheet, Cpu, Info, CalendarClock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { getFirebase } from '@/lib/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { computeMonthlyPerformanceMetrics, computeMonthlyPatternInsights, type MonthlyPerformanceMetrics } from '@/lib/performance-metrics';
import { formatTimeForDisplay } from '@/lib/utils';

interface AnalyticsViewProps {
    selectedBsYear: string;
    selectedBsMonth: string;
    employees: Employee[];
    attendance: AttendanceRecord[];
    refreshTrigger?: number;
}

interface RowData extends MonthlyPerformanceMetrics {
    source?: 'excel-import' | 'generated';
    extraOkHours?: number;
    behaviorInsight?: string;
    punctualityTrend?: string;
    absencePattern?: string;
    otImpact?: string;
    shiftEndBehavior?: string;
    performanceInsight?: string;
}

export default function AnalyticsView({ selectedBsYear, selectedBsMonth, employees, attendance, refreshTrigger }: AnalyticsViewProps) {
    const [behaviorLedger, setBehaviorLedger] = useState<BehaviorLedgerEntry[]>([]);
    const [behaviorAnalytics, setBehaviorAnalytics] = useState<BehaviorAnalyticsEntry[]>([]);

    // This view only ever READS behavior_ledger/behavior_analytics - it never
    // generates or overwrites them. That happens exclusively through the
    // Payroll page's "Sync Metrics" action (per the selected month), which
    // bumps refreshTrigger when it's done so this re-fetches.
    useEffect(() => {
        if (!selectedBsYear || selectedBsMonth === '') return;
        const year = parseInt(selectedBsYear, 10);
        const month = parseInt(selectedBsMonth, 10);
        const { db } = getFirebase();
        Promise.all([
            getDocs(query(collection(db, 'behavior_ledger'), where('bsYear', '==', year), where('bsMonth', '==', month))),
            getDocs(query(collection(db, 'behavior_analytics'), where('bsYear', '==', year), where('bsMonth', '==', month))),
        ]).then(([blSnap, baSnap]) => {
            setBehaviorLedger(blSnap.docs.map(d => ({ id: d.id, ...d.data() } as BehaviorLedgerEntry)));
            setBehaviorAnalytics(baSnap.docs.map(d => ({ id: d.id, ...d.data() } as BehaviorAnalyticsEntry)));
        }).catch(() => {
            setBehaviorLedger([]);
            setBehaviorAnalytics([]);
        });
    }, [selectedBsYear, selectedBsMonth, refreshTrigger]);

    const rows: RowData[] = useMemo(() => {
        if (!selectedBsYear || selectedBsMonth === '') return [];
        const year = parseInt(selectedBsYear, 10);
        const month = parseInt(selectedBsMonth, 10);
        const metrics = computeMonthlyPerformanceMetrics(employees, attendance, year, month);
        const ledgerByEmployee = new Map(behaviorLedger.map(l => [l.employeeId, l]));
        const insightByEmployee = new Map(behaviorAnalytics.map(a => [a.employeeId, a]));
        return metrics.map(m => {
            const ledger = ledgerByEmployee.get(m.employeeId);
            const insight = insightByEmployee.get(m.employeeId);
            return {
                ...m,
                source: ledger?.source,
                extraOkHours: ledger?.extraOkHours,
                behaviorInsight: insight?.behaviorInsight,
                punctualityTrend: insight?.punctualityTrend,
                absencePattern: insight?.absencePattern,
                otImpact: insight?.otImpact,
                shiftEndBehavior: insight?.shiftEndBehavior,
                performanceInsight: insight?.performanceInsight,
            };
        });
    }, [employees, attendance, selectedBsYear, selectedBsMonth, behaviorLedger, behaviorAnalytics]);

    const patternInsights = useMemo(() => {
        if (!selectedBsYear || selectedBsMonth === '') return null;
        return computeMonthlyPatternInsights(attendance, parseInt(selectedBsYear, 10), parseInt(selectedBsMonth, 10));
    }, [attendance, selectedBsYear, selectedBsMonth]);

    const totals = useMemo(() => {
        if (rows.length === 0) return null;
        const sum = rows.reduce((acc, r) => ({
            workdays: acc.workdays + r.workdays,
            onTimeDays: acc.onTimeDays + r.onTimeDays,
            absentDays: acc.absentDays + r.absentDays,
            lateArrivals: acc.lateArrivals + r.lateArrivals,
            earlyDepartures: acc.earlyDepartures + r.earlyDepartures,
            missingPunches: acc.missingPunches + r.missingPunches,
            satWorked: acc.satWorked + r.satWorked,
            phWorked: acc.phWorked + r.phWorked,
            regularHours: acc.regularHours + r.regularHours,
            overtimeHours: acc.overtimeHours + r.overtimeHours,
            grossHours: acc.grossHours + r.grossHours,
        }), { workdays: 0, onTimeDays: 0, absentDays: 0, lateArrivals: 0, earlyDepartures: 0, missingPunches: 0, satWorked: 0, phWorked: 0, regularHours: 0, overtimeHours: 0, grossHours: 0 });
        const attendanceRate = (sum.workdays + sum.absentDays) > 0 ? (sum.workdays / (sum.workdays + sum.absentDays)) * 100 : 0;
        const onTimePct = sum.workdays > 0 ? (sum.onTimeDays / sum.workdays) * 100 : 0;
        return { ...sum, attendanceRate, onTimePct };
    }, [rows]);

    const hasAnyInsightData = behaviorAnalytics.length > 0;

    return (
        <div className="space-y-6">
            <Card className="border-dashed border-gray-200 bg-muted/10 shadow-none">
                <CardContent className="py-3 flex items-start gap-2.5">
                    <Info className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                        Attendance/pattern columns are always live, computed straight from calculated attendance.
                        {' '}
                        <span className="inline-flex items-center gap-1 font-black text-gray-700 uppercase text-[9px] mx-1"><FileSpreadsheet className="h-3 w-3" /> Excel</span>
                        means the Insight row came from the source workbook's own Behavior Ledger.
                        {' '}
                        <span className="inline-flex items-center gap-1 font-black text-indigo-600 uppercase text-[9px] mx-1"><Cpu className="h-3 w-3" /> Generated</span>
                        means it was computed here. Use <span className="font-black text-gray-700">Sync Metrics</span> above to populate the Insight tables for this month if blank.
                    </p>
                </CardContent>
            </Card>

            <Card className="shadow-sm border-gray-100 bg-white overflow-hidden">
                <CardHeader className="bg-muted/10 border-b py-4 px-6">
                    <CardTitle className="text-sm font-black uppercase tracking-tight">Behavioral Patterns (from attendance data)</CardTitle>
                    <CardDescription className="text-[10px] uppercase font-bold text-muted-foreground">Employees as rows, metrics as columns - derived from calculated attendance for this period.</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                    <ScrollArea className="w-full">
                        <Table className="text-[11px] border-collapse">
                            <TableHeader className="bg-muted/30">
                                <TableRow className="h-11">
                                    <TableHead className="sticky left-0 bg-background z-20 border-r pl-6 font-black uppercase text-gray-900">Employee</TableHead>
                                    <TableHead className="text-center font-bold uppercase px-3">Workdays</TableHead>
                                    <TableHead className="text-center font-bold uppercase px-3">OnTime Days</TableHead>
                                    <TableHead className="text-center font-bold uppercase px-3 text-blue-700">OnTime %</TableHead>
                                    <TableHead className="text-center font-bold uppercase px-3 text-amber-600">Late Days</TableHead>
                                    <TableHead className="text-center font-bold uppercase px-3 text-amber-600">Early Days</TableHead>
                                    <TableHead className="text-center font-bold uppercase px-3">Missing Punch</TableHead>
                                    <TableHead className="text-center font-bold uppercase px-3 text-red-600">Absent Days</TableHead>
                                    <TableHead className="text-center font-bold uppercase px-3">Sat Worked</TableHead>
                                    <TableHead className="text-center font-bold uppercase px-3">PH Worked</TableHead>
                                    <TableHead className="text-center font-bold uppercase px-3">ExtraOK Hrs</TableHead>
                                    <TableHead className="text-center font-bold uppercase px-3">Source</TableHead>
                                    <TableHead className="min-w-[220px] font-bold uppercase px-3 pr-6">Insight</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {rows.length === 0 ? (
                                    <TableRow><TableCell colSpan={13} className="text-center py-20 text-muted-foreground italic">No calculated attendance found for this period.</TableCell></TableRow>
                                ) : rows.map(r => (
                                    <TableRow key={r.employeeId} className="hover:bg-muted/20 h-12 border-b">
                                        <TableCell className="sticky left-0 bg-background z-10 border-r pl-6 font-black text-gray-900 uppercase tracking-tighter">{r.employeeName}</TableCell>
                                        <TableCell className="text-center tabular-nums px-3">{r.workdays}</TableCell>
                                        <TableCell className="text-center tabular-nums px-3">{r.onTimeDays}</TableCell>
                                        <TableCell className="text-center tabular-nums px-3 font-bold text-blue-700">{r.onTimePct.toFixed(1)}%</TableCell>
                                        <TableCell className="text-center tabular-nums px-3 font-bold text-amber-700">{r.lateArrivals}</TableCell>
                                        <TableCell className="text-center tabular-nums px-3 font-bold text-amber-700">{r.earlyDepartures}</TableCell>
                                        <TableCell className="text-center tabular-nums px-3">{r.missingPunches}</TableCell>
                                        <TableCell className="text-center tabular-nums px-3 font-bold text-red-700">{r.absentDays}</TableCell>
                                        <TableCell className="text-center tabular-nums px-3">{r.satWorked}</TableCell>
                                        <TableCell className="text-center tabular-nums px-3">{r.phWorked}</TableCell>
                                        <TableCell className="text-center tabular-nums px-3">{r.extraOkHours != null ? r.extraOkHours.toFixed(1) : '—'}</TableCell>
                                        <TableCell className="text-center px-3"><SourceBadge source={r.source} /></TableCell>
                                        <TableCell className="px-3 pr-6 text-[10px] text-muted-foreground italic truncate max-w-[240px]" title={r.behaviorInsight}>{r.behaviorInsight || '—'}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                            {totals && (
                                <TableFooter className="bg-muted/50 font-black h-12 border-t-2">
                                    <TableRow>
                                        <TableCell className="sticky left-0 bg-background z-20 border-r pl-6 text-gray-900 uppercase tracking-tighter">Totals ({rows.length})</TableCell>
                                        <TableCell className="text-center tabular-nums px-3">{totals.workdays}</TableCell>
                                        <TableCell className="text-center tabular-nums px-3">{totals.onTimeDays}</TableCell>
                                        <TableCell className="text-center tabular-nums px-3">{totals.onTimePct.toFixed(1)}%</TableCell>
                                        <TableCell className="text-center tabular-nums px-3">{totals.lateArrivals}</TableCell>
                                        <TableCell className="text-center tabular-nums px-3">{totals.earlyDepartures}</TableCell>
                                        <TableCell className="text-center tabular-nums px-3">{totals.missingPunches}</TableCell>
                                        <TableCell className="text-center tabular-nums px-3">{totals.absentDays}</TableCell>
                                        <TableCell className="text-center tabular-nums px-3">{totals.satWorked}</TableCell>
                                        <TableCell className="text-center tabular-nums px-3">{totals.phWorked}</TableCell>
                                        <TableCell colSpan={3} className="pr-6"></TableCell>
                                    </TableRow>
                                </TableFooter>
                            )}
                        </Table>
                        <ScrollBar orientation="horizontal" />
                    </ScrollArea>
                </CardContent>
            </Card>

            {!hasAnyInsightData && rows.length > 0 && (
                <p className="text-[10px] text-muted-foreground italic px-1">No Enhanced Insight data yet for this month - click <span className="font-bold">Sync Metrics</span> above to generate it.</p>
            )}

            {hasAnyInsightData && (
                <Card className="shadow-sm border-gray-100 bg-white overflow-hidden">
                    <CardHeader className="bg-muted/10 border-b py-4 px-6">
                        <CardTitle className="text-sm font-black uppercase tracking-tight">Enhanced Employee Insights</CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        <ScrollArea className="w-full">
                            <Table className="text-[11px] border-collapse">
                                <TableHeader className="bg-muted/30">
                                    <TableRow className="h-11">
                                        <TableHead className="sticky left-0 bg-background z-20 border-r pl-6 font-black uppercase text-gray-900">Employee</TableHead>
                                        <TableHead className="font-bold uppercase px-3">Punctuality Trend</TableHead>
                                        <TableHead className="font-bold uppercase px-3">Absence Pattern</TableHead>
                                        <TableHead className="font-bold uppercase px-3">OT Impact</TableHead>
                                        <TableHead className="font-bold uppercase px-3">Shift-End Behavior</TableHead>
                                        <TableHead className="font-bold uppercase px-3 pr-6">Performance Insight</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {rows.filter(r => r.performanceInsight).map(r => (
                                        <TableRow key={`insight-${r.employeeId}`} className="hover:bg-muted/20 h-12 border-b">
                                            <TableCell className="sticky left-0 bg-background z-10 border-r pl-6 font-black text-gray-900 uppercase tracking-tighter">{r.employeeName}</TableCell>
                                            <TableCell className="px-3 text-[10px]">{r.punctualityTrend}</TableCell>
                                            <TableCell className="px-3 text-[10px]">{r.absencePattern}</TableCell>
                                            <TableCell className="px-3 text-[10px]">{r.otImpact}</TableCell>
                                            <TableCell className="px-3 text-[10px]">{r.shiftEndBehavior}</TableCell>
                                            <TableCell className="px-3 pr-6">
                                                <Badge variant="outline" className={insightBadgeClass(r.performanceInsight)}>{r.performanceInsight}</Badge>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                            <ScrollBar orientation="horizontal" />
                        </ScrollArea>
                    </CardContent>
                </Card>
            )}

            {patternInsights && rows.length > 0 && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <Card className="shadow-sm border-gray-100 bg-white overflow-hidden">
                        <CardHeader className="bg-muted/10 border-b py-4 px-6">
                            <CardTitle className="text-sm font-black uppercase tracking-tight flex items-center gap-2"><CalendarClock className="h-4 w-4" /> Pattern Insights</CardTitle>
                        </CardHeader>
                        <CardContent className="p-4 space-y-2 text-[11px]">
                            <PatternLine label="Highest late arrivals" value={`${patternInsights.highestLateArrivals.day} (${patternInsights.highestLateArrivals.count} days)`} />
                            <PatternLine label="Highest absenteeism" value={`${patternInsights.highestAbsenteeism.day} (${patternInsights.highestAbsenteeism.count} days)`} />
                            <PatternLine label="Most punctual weekday" value={`${patternInsights.mostPunctualWeekday.day} (${patternInsights.mostPunctualWeekday.rate.toFixed(1)}% on-time)`} />
                            <PatternLine label="End-of-month trend" value={`${patternInsights.endOfMonthTrendPct >= 0 ? '+' : ''}${patternInsights.endOfMonthTrendPct.toFixed(0)}% late rate, 2nd half vs 1st`} />
                            <PatternLine label="Saturday utilization" value={`${patternInsights.saturdayUtilization.toFixed(0)}% of Saturdays had work`} />
                            <PatternLine label="Worst shift-start for lateness" value={patternInsights.worstShiftStart.time !== 'N/A' ? `${formatTimeForDisplay(patternInsights.worstShiftStart.time)} (${patternInsights.worstShiftStart.rate.toFixed(1)}% late)` : 'N/A'} />
                            <PatternLine label="Public Holiday OT total" value={`${patternInsights.publicHolidayOtHours.toFixed(1)} hours`} />
                            {patternInsights.lateHotspots.length > 0 && (
                                <PatternLine label="Late hotspots" value={patternInsights.lateHotspots.map(h => `${h.date} (${h.count})`).join(', ')} />
                            )}
                        </CardContent>
                    </Card>

                    <Card className="shadow-sm border-gray-100 bg-white overflow-hidden">
                        <CardHeader className="bg-muted/10 border-b py-4 px-6">
                            <CardTitle className="text-sm font-black uppercase tracking-tight">Day of Week Patterns</CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            <Table className="text-[11px]">
                                <TableHeader className="bg-muted/30">
                                    <TableRow className="h-10">
                                        <TableHead className="pl-6 font-black uppercase text-gray-900">Day</TableHead>
                                        <TableHead className="text-right font-bold uppercase px-3 text-blue-700">Punctuality %</TableHead>
                                        <TableHead className="text-right font-bold uppercase px-3 text-amber-600">Late Arrivals %</TableHead>
                                        <TableHead className="text-right font-bold uppercase px-3 pr-6 text-red-600">Absenteeism %</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {patternInsights.dayOfWeekPatterns.map(d => (
                                        <TableRow key={d.day} className="h-10 border-b">
                                            <TableCell className="pl-6 font-bold text-gray-900">{d.day}</TableCell>
                                            <TableCell className="text-right tabular-nums px-3 text-blue-700 font-bold">{d.total > 0 ? d.punctualityPct.toFixed(1) : '—'}</TableCell>
                                            <TableCell className="text-right tabular-nums px-3 text-amber-700 font-bold">{d.total > 0 ? d.lateArrivalsPct.toFixed(1) : '—'}</TableCell>
                                            <TableCell className="text-right tabular-nums px-3 pr-6 text-red-700 font-bold">{d.total > 0 ? d.absenteeismPct.toFixed(1) : '—'}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </div>
            )}
        </div>
    );
}

function PatternLine({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-start justify-between gap-3 py-1 border-b border-dashed border-gray-100 last:border-0">
            <span className="text-muted-foreground font-medium">{label}</span>
            <span className="font-bold text-gray-900 text-right">{value}</span>
        </div>
    );
}

function insightBadgeClass(insight?: string): string {
    const base = 'text-[9px] font-black uppercase h-5 px-2';
    if (!insight) return base;
    if (insight.includes('Strong') || insight.includes('Solid') || insight.includes('Dedicated')) return `${base} border-emerald-200 text-emerald-700`;
    if (insight.includes('Improving') || insight.includes('Meets')) return `${base} border-amber-200 text-amber-700`;
    if (insight.includes('Needs')) return `${base} border-red-200 text-red-700`;
    return base;
}

function SourceBadge({ source }: { source?: 'excel-import' | 'generated' }) {
    if (source === 'excel-import') {
        return (
            <Badge variant="outline" className="text-[7px] font-black uppercase h-4 px-1 gap-0.5 border-gray-300 text-gray-600">
                <FileSpreadsheet className="h-2.5 w-2.5" /> Excel
            </Badge>
        );
    }
    if (source === 'generated') {
        return (
            <Badge variant="outline" className="text-[7px] font-black uppercase h-4 px-1 gap-0.5 border-indigo-200 text-indigo-600">
                <Cpu className="h-2.5 w-2.5" /> Generated
            </Badge>
        );
    }
    return <Badge variant="outline" className="text-[7px] font-black uppercase h-4 px-1 border-gray-200 text-muted-foreground">Not Synced</Badge>;
}
