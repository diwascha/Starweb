'use client';

import { useState, useEffect, useMemo } from 'react';
import type { Employee, AttendanceRecord, BehaviorLedgerEntry, BehaviorAnalyticsEntry } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { FileSpreadsheet, Cpu, Info } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { getFirebase } from '@/lib/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { computeMonthlyPerformanceMetrics, type MonthlyPerformanceMetrics } from '@/lib/performance-metrics';

interface AnalyticsViewProps {
    selectedBsYear: string;
    selectedBsMonth: string;
    employees: Employee[];
    attendance: AttendanceRecord[];
    refreshTrigger?: number;
}

interface RowData extends MonthlyPerformanceMetrics {
    source?: 'excel-import' | 'generated';
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
        return metrics.map(m => ({
            ...m,
            source: ledgerByEmployee.get(m.employeeId)?.source,
            performanceInsight: insightByEmployee.get(m.employeeId)?.performanceInsight,
        }));
    }, [employees, attendance, selectedBsYear, selectedBsMonth, behaviorLedger, behaviorAnalytics]);

    const totals = useMemo(() => {
        if (rows.length === 0) return null;
        const sum = rows.reduce((acc, r) => ({
            workdays: acc.workdays + r.workdays,
            absentDays: acc.absentDays + r.absentDays,
            lateArrivals: acc.lateArrivals + r.lateArrivals,
            earlyDepartures: acc.earlyDepartures + r.earlyDepartures,
            satPhWorked: acc.satPhWorked + r.satPhWorked,
            regularHours: acc.regularHours + r.regularHours,
            overtimeHours: acc.overtimeHours + r.overtimeHours,
            grossHours: acc.grossHours + r.grossHours,
        }), { workdays: 0, absentDays: 0, lateArrivals: 0, earlyDepartures: 0, satPhWorked: 0, regularHours: 0, overtimeHours: 0, grossHours: 0 });
        const attendanceRate = (sum.workdays + sum.absentDays) > 0 ? (sum.workdays / (sum.workdays + sum.absentDays)) * 100 : 0;
        const otLoadPct = sum.grossHours > 0 ? (sum.overtimeHours / sum.grossHours) * 100 : 0;
        return { ...sum, attendanceRate, otLoadPct };
    }, [rows]);

    const hasAnyBehaviorData = behaviorLedger.length > 0 || behaviorAnalytics.length > 0;

    return (
        <div className="space-y-6">
            <Card className="border-dashed border-gray-200 bg-muted/10 shadow-none">
                <CardContent className="py-3 flex items-start gap-2.5">
                    <Info className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                        Attendance-derived columns (Workdays through Gross Hrs) are always live, computed straight from calculated attendance.
                        {' '}
                        <span className="inline-flex items-center gap-1 font-black text-gray-700 uppercase text-[9px] mx-1"><FileSpreadsheet className="h-3 w-3" /> Excel</span>
                        means the Insight column came from the source workbook's own Behavior Ledger.
                        {' '}
                        <span className="inline-flex items-center gap-1 font-black text-indigo-600 uppercase text-[9px] mx-1"><Cpu className="h-3 w-3" /> Generated</span>
                        means it was computed here. Use <span className="font-black text-gray-700">Sync Metrics</span> above to populate the Insight column for this month if it's blank.
                    </p>
                </CardContent>
            </Card>

            <Card className="shadow-sm border-gray-100 bg-white overflow-hidden">
                <CardHeader className="bg-muted/10 border-b py-4 px-6">
                    <CardTitle className="text-sm font-black uppercase tracking-tight">Monthly Performance Scoreboard</CardTitle>
                    <CardDescription className="text-[10px] uppercase font-bold text-muted-foreground">Employees as rows, metrics as columns - derived from calculated attendance for this period.</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                    <ScrollArea className="w-full">
                        <Table className="text-[11px] border-collapse">
                            <TableHeader className="bg-muted/30">
                                <TableRow className="h-11">
                                    <TableHead className="sticky left-0 bg-background z-20 border-r pl-6 font-black uppercase text-gray-900">Employee</TableHead>
                                    <TableHead className="text-center font-bold uppercase px-3">Workdays</TableHead>
                                    <TableHead className="text-center font-bold uppercase px-3 text-blue-700">Attendance %</TableHead>
                                    <TableHead className="text-center font-bold uppercase px-3 text-red-600">Absent</TableHead>
                                    <TableHead className="text-center font-bold uppercase px-3 text-amber-600">Late</TableHead>
                                    <TableHead className="text-center font-bold uppercase px-3 text-amber-600">Early</TableHead>
                                    <TableHead className="text-center font-bold uppercase px-3">Sat/PH</TableHead>
                                    <TableHead className="text-right font-bold uppercase px-3">Regular Hrs</TableHead>
                                    <TableHead className="text-right font-bold uppercase px-3">OT Hrs</TableHead>
                                    <TableHead className="text-right font-black uppercase px-3 bg-muted/20">Gross Hrs</TableHead>
                                    <TableHead className="text-center font-bold uppercase px-3">OT Load %</TableHead>
                                    <TableHead className="text-center font-bold uppercase px-3">Source</TableHead>
                                    <TableHead className="min-w-[200px] font-bold uppercase px-3 pr-6">Insight</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {rows.length === 0 ? (
                                    <TableRow><TableCell colSpan={13} className="text-center py-20 text-muted-foreground italic">No calculated attendance found for this period.</TableCell></TableRow>
                                ) : rows.map(r => (
                                    <TableRow key={r.employeeId} className="hover:bg-muted/20 h-12 border-b">
                                        <TableCell className="sticky left-0 bg-background z-10 border-r pl-6 font-black text-gray-900 uppercase tracking-tighter">{r.employeeName}</TableCell>
                                        <TableCell className="text-center tabular-nums px-3">{r.workdays}</TableCell>
                                        <TableCell className="text-center tabular-nums px-3 font-bold text-blue-700">{r.attendanceRate.toFixed(1)}%</TableCell>
                                        <TableCell className="text-center tabular-nums px-3 font-bold text-red-700">{r.absentDays}</TableCell>
                                        <TableCell className="text-center tabular-nums px-3 font-bold text-amber-700">{r.lateArrivals}</TableCell>
                                        <TableCell className="text-center tabular-nums px-3 font-bold text-amber-700">{r.earlyDepartures}</TableCell>
                                        <TableCell className="text-center tabular-nums px-3">{r.satPhWorked}</TableCell>
                                        <TableCell className="text-right tabular-nums px-3">{r.regularHours.toFixed(1)}</TableCell>
                                        <TableCell className="text-right tabular-nums px-3 font-bold text-blue-700">+{r.overtimeHours.toFixed(1)}</TableCell>
                                        <TableCell className="text-right tabular-nums px-3 font-black bg-muted/10">{r.grossHours.toFixed(1)}</TableCell>
                                        <TableCell className="text-center tabular-nums px-3">{r.otLoadPct.toFixed(0)}%</TableCell>
                                        <TableCell className="text-center px-3"><SourceBadge source={r.source} /></TableCell>
                                        <TableCell className="px-3 pr-6 text-[10px] text-muted-foreground italic truncate max-w-[220px]" title={r.performanceInsight}>{r.performanceInsight || '—'}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                            {totals && (
                                <TableFooter className="bg-muted/50 font-black h-12 border-t-2">
                                    <TableRow>
                                        <TableCell className="sticky left-0 bg-background z-20 border-r pl-6 text-gray-900 uppercase tracking-tighter">Totals ({rows.length} employees)</TableCell>
                                        <TableCell className="text-center tabular-nums px-3">{totals.workdays}</TableCell>
                                        <TableCell className="text-center tabular-nums px-3">{totals.attendanceRate.toFixed(1)}%</TableCell>
                                        <TableCell className="text-center tabular-nums px-3">{totals.absentDays}</TableCell>
                                        <TableCell className="text-center tabular-nums px-3">{totals.lateArrivals}</TableCell>
                                        <TableCell className="text-center tabular-nums px-3">{totals.earlyDepartures}</TableCell>
                                        <TableCell className="text-center tabular-nums px-3">{totals.satPhWorked}</TableCell>
                                        <TableCell className="text-right tabular-nums px-3">{totals.regularHours.toFixed(1)}</TableCell>
                                        <TableCell className="text-right tabular-nums px-3">+{totals.overtimeHours.toFixed(1)}</TableCell>
                                        <TableCell className="text-right tabular-nums px-3">{totals.grossHours.toFixed(1)}</TableCell>
                                        <TableCell className="text-center tabular-nums px-3">{totals.otLoadPct.toFixed(0)}%</TableCell>
                                        <TableCell colSpan={2} className="pr-6"></TableCell>
                                    </TableRow>
                                </TableFooter>
                            )}
                        </Table>
                        <ScrollBar orientation="horizontal" />
                    </ScrollArea>
                </CardContent>
            </Card>

            {!hasAnyBehaviorData && rows.length > 0 && (
                <p className="text-[10px] text-muted-foreground italic px-1">No Insight data yet for this month - click <span className="font-bold">Sync Metrics</span> above to generate it.</p>
            )}
        </div>
    );
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
