'use client';

import { useState, useEffect, useMemo } from 'react';
import { TrendingUp, ArrowUpDown, ChevronUp, ChevronDown } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { Employee, AttendanceRecord } from '@/lib/types';
import { onEmployeesUpdate } from '@/services/employee-service';
import { onAttendanceUpdate } from '@/services/attendance-service';
import NepaliDate from 'nepali-date-converter';
import {
    getFiscalYearStart,
    getAvailableFiscalYears,
    formatFiscalYear,
} from '@/lib/fiscal-year';
import {
    aggregatePerformanceMetrics,
    getBenchmarkPeriodGroups,
    type BenchmarkPeriodType,
} from '@/lib/performance-metrics';

type SortKey = 'employeeName' | 'attendanceRate' | 'workdays' | 'absentDays' | 'lateArrivals' | 'earlyDepartures' | 'regularHours' | 'overtimeHours' | 'grossHours' | 'otLoadPct';

const PERIOD_TYPES: { value: BenchmarkPeriodType; label: string }[] = [
    { value: 'monthly', label: 'Monthly' },
    { value: 'quarterly', label: 'Quarterly' },
    { value: 'sixmonth', label: 'Six-Month' },
    { value: 'yearly', label: 'Yearly' },
];

// Metrics where a HIGHER value is the better outcome, for best/worst highlighting.
const HIGHER_IS_BETTER: SortKey[] = ['attendanceRate', 'workdays', 'regularHours', 'grossHours'];
// Metrics where a LOWER value is the better outcome.
const LOWER_IS_BETTER: SortKey[] = ['absentDays', 'lateArrivals', 'earlyDepartures'];

export default function EmployeePerformanceBenchmarkPage() {
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const [selectedFiscalYear, setSelectedFiscalYear] = useState<string>(
        String(getFiscalYearStart(new NepaliDate().getYear(), new NepaliDate().getMonth()))
    );
    const [periodType, setPeriodType] = useState<BenchmarkPeriodType>('quarterly');
    const [periodIndex, setPeriodIndex] = useState<string>('0');
    const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('All');
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({ key: 'attendanceRate', direction: 'desc' });

    useEffect(() => {
        setIsLoading(true);
        const unsubEmp = onEmployeesUpdate(setEmployees);
        const unsubAtt = onAttendanceUpdate((data) => {
            setAttendance(data);
            setIsLoading(false);
        });
        return () => {
            unsubEmp();
            unsubAtt();
        };
    }, []);

    const availableFiscalYears = useMemo(() => {
        const years = getAvailableFiscalYears(attendance.map(r => ({ bsYear: r.bsYear, bsMonth: r.bsMonth })));
        const current = getFiscalYearStart(new NepaliDate().getYear(), new NepaliDate().getMonth());
        return years.includes(current) ? years : [current, ...years].sort((a, b) => b - a);
    }, [attendance]);

    const fyStart = parseInt(selectedFiscalYear);

    const periodGroups = useMemo(() => getBenchmarkPeriodGroups(fyStart, periodType, 0), [fyStart, periodType]);

    // Reset to the first period whenever the period type or fiscal year changes,
    // since the number/labels of available periods differ between them.
    useEffect(() => {
        setPeriodIndex('0');
    }, [periodType, fyStart]);

    const selectedGroup = periodGroups[parseInt(periodIndex)] || periodGroups[0];

    const requestSort = (key: SortKey) => {
        setSortConfig(prev => ({ key, direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc' }));
    };

    const comparisonRows = useMemo(() => {
        if (!selectedGroup) return [];
        const rows = aggregatePerformanceMetrics(employees, attendance, selectedGroup.months);
        const sorted = [...rows].sort((a, b) => {
            const aVal = sortConfig.key === 'employeeName' ? a.employeeName : a[sortConfig.key];
            const bVal = sortConfig.key === 'employeeName' ? b.employeeName : b[sortConfig.key];
            if (aVal === bVal) return 0;
            const cmp = aVal < bVal ? -1 : 1;
            return sortConfig.direction === 'asc' ? cmp : -cmp;
        });
        return sorted;
    }, [employees, attendance, selectedGroup, sortConfig]);

    // Best/worst value per metric, for highlighting - computed once per render
    // of the comparison table, ignoring employees with zero workdays (nothing
    // to compare for a period they didn't work at all).
    const extremes = useMemo(() => {
        const active = comparisonRows.filter(r => r.workdays > 0 || r.absentDays > 0);
        const result: Partial<Record<SortKey, { best: number; worst: number }>> = {};
        for (const key of [...HIGHER_IS_BETTER, ...LOWER_IS_BETTER]) {
            const values = active.map(r => r[key as keyof typeof r] as number);
            if (values.length === 0) continue;
            const max = Math.max(...values);
            const min = Math.min(...values);
            const higherBetter = HIGHER_IS_BETTER.includes(key);
            result[key] = higherBetter ? { best: max, worst: min } : { best: min, worst: max };
        }
        return result;
    }, [comparisonRows]);

    const cellClass = (key: SortKey, value: number) => {
        const ex = extremes[key];
        if (!ex || ex.best === ex.worst) return '';
        if (value === ex.best) return 'text-emerald-700 font-black';
        if (value === ex.worst) return 'text-red-600 font-bold';
        return '';
    };

    const totals = useMemo(() => {
        if (comparisonRows.length === 0) return null;
        const sum = comparisonRows.reduce((acc, r) => ({
            workdays: acc.workdays + r.workdays,
            absentDays: acc.absentDays + r.absentDays,
            lateArrivals: acc.lateArrivals + r.lateArrivals,
            earlyDepartures: acc.earlyDepartures + r.earlyDepartures,
            regularHours: acc.regularHours + r.regularHours,
            overtimeHours: acc.overtimeHours + r.overtimeHours,
            grossHours: acc.grossHours + r.grossHours,
        }), { workdays: 0, absentDays: 0, lateArrivals: 0, earlyDepartures: 0, regularHours: 0, overtimeHours: 0, grossHours: 0 });
        const attendanceRate = (sum.workdays + sum.absentDays) > 0 ? (sum.workdays / (sum.workdays + sum.absentDays)) * 100 : 0;
        return { ...sum, attendanceRate };
    }, [comparisonRows]);

    // Per-employee history across every period-of-this-type in the fiscal
    // year, for trend tracking and a simple consistency read.
    const employeeHistory = useMemo(() => {
        if (selectedEmployeeId === 'All') return [];
        const allGroups = getBenchmarkPeriodGroups(fyStart, periodType === 'monthly' ? 'monthly' : periodType, 0);
        // For monthly, getBenchmarkPeriodGroups already returns 12 single-month groups.
        const groups = periodType === 'monthly' ? allGroups : getBenchmarkPeriodGroups(fyStart, periodType, 0);
        return groups.map((g, i) => {
            const rows = aggregatePerformanceMetrics(employees, attendance, g.months);
            const row = rows.find(r => r.employeeId === selectedEmployeeId);
            const label = g.label || (g.months.length === 1 ? monthLabel(g.months[0].bsMonth) : `Period ${i + 1}`);
            return { label, ...row };
        });
    }, [selectedEmployeeId, fyStart, periodType, employees, attendance]);

    const consistency = useMemo(() => {
        const withData = employeeHistory.filter((h): h is typeof h & { attendanceRate: number } => h.attendanceRate !== undefined && (h.workdays || 0) > 0);
        if (withData.length < 2) return null;
        const rates = withData.map(h => h.attendanceRate);
        const mean = rates.reduce((s, v) => s + v, 0) / rates.length;
        const variance = rates.reduce((s, v) => s + (v - mean) ** 2, 0) / rates.length;
        const stdDev = Math.sqrt(variance);
        return { mean, stdDev, isConsistent: stdDev < 10 };
    }, [employeeHistory]);

    const selectedEmployee = employees.find(e => e.id === selectedEmployeeId);

    return (
        <div className="flex flex-col gap-8">
            <header className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-xl"><TrendingUp className="h-6 w-6 text-primary" /></div>
                <div>
                    <h1 className="text-3xl font-black tracking-tight text-gray-900 uppercase">Employee Performance Benchmark</h1>
                    <p className="text-muted-foreground text-sm font-medium italic">Compare employees and track performance trends over monthly, quarterly, six-month, and yearly periods.</p>
                </div>
            </header>

            <Card className="shadow-sm border-gray-100 bg-white overflow-hidden">
                <CardContent className="p-4 flex flex-col sm:flex-row flex-wrap gap-4 items-end">
                    <div className="space-y-1.5 w-[110px]">
                        <Label className="text-[10px] uppercase font-bold text-muted-foreground">Fiscal Year</Label>
                        <Select value={selectedFiscalYear} onValueChange={setSelectedFiscalYear} disabled={isLoading}>
                            <SelectTrigger className="h-9 bg-white"><SelectValue /></SelectTrigger>
                            <SelectContent>{availableFiscalYears.map(y => <SelectItem key={`bench-fy-${y}`} value={String(y)}>{formatFiscalYear(y)}</SelectItem>)}</SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-1.5 w-[150px]">
                        <Label className="text-[10px] uppercase font-bold text-muted-foreground">Period Type</Label>
                        <Select value={periodType} onValueChange={(v) => setPeriodType(v as BenchmarkPeriodType)} disabled={isLoading}>
                            <SelectTrigger className="h-9 bg-white"><SelectValue /></SelectTrigger>
                            <SelectContent>{PERIOD_TYPES.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
                        </Select>
                    </div>
                    {periodType !== 'yearly' && (
                        <div className="space-y-1.5 w-[190px]">
                            <Label className="text-[10px] uppercase font-bold text-muted-foreground">Period</Label>
                            <Select value={periodIndex} onValueChange={setPeriodIndex} disabled={isLoading}>
                                <SelectTrigger className="h-9 bg-white"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {periodGroups.map((g, i) => (
                                        <SelectItem key={`period-${i}`} value={String(i)}>
                                            {g.label || monthLabel(g.months[0]?.bsMonth ?? 0)}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    )}
                    <div className="space-y-1.5 w-[200px]">
                        <Label className="text-[10px] uppercase font-bold text-muted-foreground">Employee History</Label>
                        <Select value={selectedEmployeeId} onValueChange={setSelectedEmployeeId} disabled={isLoading}>
                            <SelectTrigger className="h-9 bg-white"><SelectValue placeholder="All Employees" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="All">All Employees (Comparison Only)</SelectItem>
                                {[...employees].sort((a, b) => a.name.localeCompare(b.name)).map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                </CardContent>
            </Card>

            <Card className="shadow-sm border-gray-100 bg-white overflow-hidden">
                <CardHeader className="bg-muted/10 border-b py-4 px-6">
                    <CardTitle className="text-sm font-black uppercase tracking-tight">
                        Comparison{selectedGroup ? ` - ${selectedGroup.label || monthLabel(selectedGroup.months[0]?.bsMonth ?? 0)}, FY ${formatFiscalYear(fyStart)}` : ''}
                    </CardTitle>
                    <CardDescription className="text-[10px] uppercase font-bold text-muted-foreground">
                        Best value per column in <span className="text-emerald-700 font-black">green</span>, worst in <span className="text-red-600 font-bold">red</span>. Click a column header to sort.
                    </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                    <ScrollArea className="w-full">
                        <Table className="text-[11px] border-collapse">
                            <TableHeader className="bg-muted/30">
                                <TableRow className="h-11">
                                    <SortableHead label="Employee" sortKey="employeeName" sortConfig={sortConfig} onSort={requestSort} className="sticky left-0 bg-background z-20 border-r pl-6" />
                                    <SortableHead label="Workdays" sortKey="workdays" sortConfig={sortConfig} onSort={requestSort} align="center" />
                                    <SortableHead label="Attendance %" sortKey="attendanceRate" sortConfig={sortConfig} onSort={requestSort} align="center" className="text-blue-700" />
                                    <SortableHead label="Absent" sortKey="absentDays" sortConfig={sortConfig} onSort={requestSort} align="center" className="text-red-600" />
                                    <SortableHead label="Late" sortKey="lateArrivals" sortConfig={sortConfig} onSort={requestSort} align="center" className="text-amber-600" />
                                    <SortableHead label="Early" sortKey="earlyDepartures" sortConfig={sortConfig} onSort={requestSort} align="center" className="text-amber-600" />
                                    <SortableHead label="Regular Hrs" sortKey="regularHours" sortConfig={sortConfig} onSort={requestSort} align="right" />
                                    <SortableHead label="OT Hrs" sortKey="overtimeHours" sortConfig={sortConfig} onSort={requestSort} align="right" />
                                    <SortableHead label="Gross Hrs" sortKey="grossHours" sortConfig={sortConfig} onSort={requestSort} align="right" className="bg-muted/20" />
                                    <SortableHead label="OT Load %" sortKey="otLoadPct" sortConfig={sortConfig} onSort={requestSort} align="center" />
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {comparisonRows.length === 0 ? (
                                    <TableRow><TableCell colSpan={10} className="text-center py-20 text-muted-foreground italic">No calculated attendance found for this period.</TableCell></TableRow>
                                ) : comparisonRows.map(r => (
                                    <TableRow key={r.employeeId} className={cn("hover:bg-muted/20 h-12 border-b", r.employeeId === selectedEmployeeId && "bg-primary/5")}>
                                        <TableCell className="sticky left-0 bg-background z-10 border-r pl-6 font-black text-gray-900 uppercase tracking-tighter">{r.employeeName}</TableCell>
                                        <TableCell className={cn("text-center tabular-nums px-3", cellClass('workdays', r.workdays))}>{r.workdays}</TableCell>
                                        <TableCell className={cn("text-center tabular-nums px-3", cellClass('attendanceRate', r.attendanceRate) || 'text-blue-700 font-bold')}>{r.attendanceRate.toFixed(1)}%</TableCell>
                                        <TableCell className={cn("text-center tabular-nums px-3 font-bold", cellClass('absentDays', r.absentDays) || 'text-red-700')}>{r.absentDays}</TableCell>
                                        <TableCell className={cn("text-center tabular-nums px-3 font-bold", cellClass('lateArrivals', r.lateArrivals) || 'text-amber-700')}>{r.lateArrivals}</TableCell>
                                        <TableCell className={cn("text-center tabular-nums px-3 font-bold", cellClass('earlyDepartures', r.earlyDepartures) || 'text-amber-700')}>{r.earlyDepartures}</TableCell>
                                        <TableCell className={cn("text-right tabular-nums px-3", cellClass('regularHours', r.regularHours))}>{r.regularHours.toFixed(1)}</TableCell>
                                        <TableCell className={cn("text-right tabular-nums px-3 font-bold text-blue-700")}>+{r.overtimeHours.toFixed(1)}</TableCell>
                                        <TableCell className={cn("text-right tabular-nums px-3 font-black bg-muted/10", cellClass('grossHours', r.grossHours))}>{r.grossHours.toFixed(1)}</TableCell>
                                        <TableCell className="text-center tabular-nums px-3">{r.otLoadPct.toFixed(0)}%</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                            {totals && (
                                <TableFooter className="bg-muted/50 font-black h-12 border-t-2">
                                    <TableRow>
                                        <TableCell className="sticky left-0 bg-background z-20 border-r pl-6 text-gray-900 uppercase tracking-tighter">Totals ({comparisonRows.length})</TableCell>
                                        <TableCell className="text-center tabular-nums px-3">{totals.workdays}</TableCell>
                                        <TableCell className="text-center tabular-nums px-3">{totals.attendanceRate.toFixed(1)}%</TableCell>
                                        <TableCell className="text-center tabular-nums px-3">{totals.absentDays}</TableCell>
                                        <TableCell className="text-center tabular-nums px-3">{totals.lateArrivals}</TableCell>
                                        <TableCell className="text-center tabular-nums px-3">{totals.earlyDepartures}</TableCell>
                                        <TableCell className="text-right tabular-nums px-3">{totals.regularHours.toFixed(1)}</TableCell>
                                        <TableCell className="text-right tabular-nums px-3">+{totals.overtimeHours.toFixed(1)}</TableCell>
                                        <TableCell className="text-right tabular-nums px-3">{totals.grossHours.toFixed(1)}</TableCell>
                                        <TableCell className="text-center px-3"></TableCell>
                                    </TableRow>
                                </TableFooter>
                            )}
                        </Table>
                        <ScrollBar orientation="horizontal" />
                    </ScrollArea>
                </CardContent>
            </Card>

            {selectedEmployeeId !== 'All' && (
                <Card className="shadow-sm border-gray-100 bg-white overflow-hidden">
                    <CardHeader className="bg-muted/10 border-b py-4 px-6 flex flex-row items-center justify-between">
                        <div>
                            <CardTitle className="text-sm font-black uppercase tracking-tight">{selectedEmployee?.name || 'Employee'} - Performance History</CardTitle>
                            <CardDescription className="text-[10px] uppercase font-bold text-muted-foreground">
                                Every {PERIOD_TYPES.find(p => p.value === periodType)?.label.toLowerCase()} period in FY {formatFiscalYear(fyStart)}, oldest first.
                            </CardDescription>
                        </div>
                        {consistency && (
                            <Badge variant="outline" className={cn("text-[9px] font-black uppercase h-6 px-3", consistency.isConsistent ? "border-emerald-200 text-emerald-700" : "border-amber-200 text-amber-700")}>
                                {consistency.isConsistent ? 'Consistent Attendance' : 'Variable Attendance'} (±{consistency.stdDev.toFixed(1)}%)
                            </Badge>
                        )}
                    </CardHeader>
                    <CardContent className="p-0">
                        <ScrollArea className="w-full">
                            <Table className="text-[11px] border-collapse">
                                <TableHeader className="bg-muted/30">
                                    <TableRow className="h-10">
                                        <TableHead className="pl-6 font-black uppercase text-gray-900">Period</TableHead>
                                        <TableHead className="text-center font-bold uppercase px-3">Workdays</TableHead>
                                        <TableHead className="text-center font-bold uppercase px-3 text-blue-700">Attendance %</TableHead>
                                        <TableHead className="text-center font-bold uppercase px-3 text-red-600">Absent</TableHead>
                                        <TableHead className="text-center font-bold uppercase px-3 text-amber-600">Late</TableHead>
                                        <TableHead className="text-center font-bold uppercase px-3 text-amber-600">Early</TableHead>
                                        <TableHead className="text-right font-bold uppercase px-3">Regular Hrs</TableHead>
                                        <TableHead className="text-right font-bold uppercase px-3">OT Hrs</TableHead>
                                        <TableHead className="text-right font-black uppercase px-3 pr-6">Gross Hrs</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {employeeHistory.every(h => !h.workdays && !h.absentDays) ? (
                                        <TableRow><TableCell colSpan={9} className="text-center py-16 text-muted-foreground italic">No records found for this employee in FY {formatFiscalYear(fyStart)}.</TableCell></TableRow>
                                    ) : employeeHistory.map((h, i) => (
                                        <TableRow key={`hist-${i}`} className="h-11 border-b hover:bg-muted/20">
                                            <TableCell className="pl-6 font-bold text-gray-900">{h.label}</TableCell>
                                            <TableCell className="text-center tabular-nums px-3">{h.workdays ?? 0}</TableCell>
                                            <TableCell className="text-center tabular-nums px-3 font-bold text-blue-700">{(h.attendanceRate ?? 0).toFixed(1)}%</TableCell>
                                            <TableCell className="text-center tabular-nums px-3 font-bold text-red-700">{h.absentDays ?? 0}</TableCell>
                                            <TableCell className="text-center tabular-nums px-3 font-bold text-amber-700">{h.lateArrivals ?? 0}</TableCell>
                                            <TableCell className="text-center tabular-nums px-3 font-bold text-amber-700">{h.earlyDepartures ?? 0}</TableCell>
                                            <TableCell className="text-right tabular-nums px-3">{(h.regularHours ?? 0).toFixed(1)}</TableCell>
                                            <TableCell className="text-right tabular-nums px-3 font-bold text-blue-700">+{(h.overtimeHours ?? 0).toFixed(1)}</TableCell>
                                            <TableCell className="text-right tabular-nums px-3 pr-6 font-black">{(h.grossHours ?? 0).toFixed(1)}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                            <ScrollBar orientation="horizontal" />
                        </ScrollArea>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}

function monthLabel(bsMonth: number): string {
    const names = ['Baishakh', 'Jestha', 'Ashadh', 'Shrawan', 'Bhadra', 'Ashwin', 'Kartik', 'Mangsir', 'Poush', 'Magh', 'Falgun', 'Chaitra'];
    return names[bsMonth] || '';
}

function SortableHead({ label, sortKey, sortConfig, onSort, align = 'left', className }: {
    label: string;
    sortKey: SortKey;
    sortConfig: { key: SortKey; direction: 'asc' | 'desc' };
    onSort: (key: SortKey) => void;
    align?: 'left' | 'center' | 'right';
    className?: string;
}) {
    const isActive = sortConfig.key === sortKey;
    return (
        <TableHead className={cn('font-black uppercase px-3', align === 'center' && 'text-center', align === 'right' && 'text-right', className)}>
            <button onClick={() => onSort(sortKey)} className={cn("inline-flex items-center gap-1 hover:text-primary transition-colors", isActive && "text-primary")}>
                {label}
                {isActive ? (sortConfig.direction === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-30" />}
            </button>
        </TableHead>
    );
}
