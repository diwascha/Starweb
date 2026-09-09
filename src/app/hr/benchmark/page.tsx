'use client';

import { useState, useEffect, useMemo, Fragment } from 'react';
import { TrendingUp, TrendingDown, Minus, ArrowUpDown, ChevronUp, ChevronDown, AlertTriangle, Users, X } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import type { Employee, AttendanceRecord, Payroll } from '@/lib/types';
import { onEmployeesUpdate } from '@/services/employee-service';
import { onAttendanceUpdate } from '@/services/attendance-service';
import { onPayrollUpdate } from '@/services/payroll-service';
import NepaliDate from 'nepali-date-converter';
import {
    getFiscalYearStart,
    getAvailableFiscalYears,
    formatFiscalYear,
} from '@/lib/fiscal-year';
import {
    aggregatePerformanceMetricsWithTrend,
    getBenchmarkPeriodGroups,
    type BenchmarkPeriodType,
    type PeriodPerformanceMetrics,
} from '@/lib/performance-metrics';

type SortKey = 'employeeName' | 'attendanceRate' | 'absentDays' | 'lateArrivals' | 'overtimeHours' | 'totalNet' | 'bonusAccrued';

const PERIOD_TYPES: { value: BenchmarkPeriodType; label: string }[] = [
    { value: 'monthly', label: 'Monthly' },
    { value: 'quarterly', label: 'Quarterly' },
    { value: 'sixmonth', label: 'Six-Month' },
    { value: 'yearly', label: 'Yearly' },
];

const ATTENDANCE_FLAG_THRESHOLD = 15; // percentage points below the group average

interface ComparisonRow extends PeriodPerformanceMetrics {
    monthsWithData: number;
    totalNet: number;
    bonusAccrued: number;
    flags: string[];
}

export default function EmployeePerformanceBenchmarkPage() {
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
    const [payroll, setPayroll] = useState<Payroll[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const [selectedFiscalYear, setSelectedFiscalYear] = useState<string>(
        String(getFiscalYearStart(new NepaliDate().getYear(), new NepaliDate().getMonth()))
    );
    const [periodType, setPeriodType] = useState<BenchmarkPeriodType>('quarterly');
    const [periodIndex, setPeriodIndex] = useState<string>('0');
    const [compareIds, setCompareIds] = useState<string[]>([]);
    const [comparePickerOpen, setComparePickerOpen] = useState(false);
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({ key: 'attendanceRate', direction: 'desc' });

    useEffect(() => {
        setIsLoading(true);
        const unsubEmp = onEmployeesUpdate(setEmployees);
        const unsubAtt = onAttendanceUpdate((data) => {
            setAttendance(data);
            setIsLoading(false);
        });
        const unsubPay = onPayrollUpdate(setPayroll);
        return () => {
            unsubEmp();
            unsubAtt();
            unsubPay();
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

    const payrollTotals = useMemo(() => {
        if (!selectedGroup) return new Map<string, { net: number; bonus: number }>();
        const monthKeys = new Set(selectedGroup.months.map(m => `${m.bsYear}-${m.bsMonth}`));
        const map = new Map<string, { net: number; bonus: number }>();
        for (const p of payroll) {
            if (!monthKeys.has(`${p.bsYear}-${p.bsMonth}`)) continue;
            const existing = map.get(p.employeeId) || { net: 0, bonus: 0 };
            existing.net += p.roundedNet ?? p.netPayment ?? 0;
            existing.bonus += p.bonus ?? 0;
            map.set(p.employeeId, existing);
        }
        return map;
    }, [payroll, selectedGroup]);

    const comparisonRows: ComparisonRow[] = useMemo(() => {
        if (!selectedGroup) return [];
        const rows = aggregatePerformanceMetricsWithTrend(employees, attendance, selectedGroup.months);
        const groupMean = rows.length > 0 ? rows.reduce((s, r) => s + r.attendanceRate, 0) / rows.length : 0;

        const withFinancials: ComparisonRow[] = rows.map(r => {
            const pay = payrollTotals.get(r.employeeId) || { net: 0, bonus: 0 };
            const flags: string[] = [];
            if (r.workdays + r.absentDays > 0 && groupMean - r.attendanceRate > ATTENDANCE_FLAG_THRESHOLD) {
                flags.push('Attendance well below peers');
            }
            if (r.trend === 'Declining') flags.push('Declining trend');
            return {
                ...r,
                monthsWithData: r.monthlyAttendanceRates.filter(m => m.hasData).length,
                totalNet: pay.net,
                bonusAccrued: pay.bonus,
                flags,
            };
        });

        return [...withFinancials].sort((a, b) => {
            const aVal = sortConfig.key === 'employeeName' ? a.employeeName : a[sortConfig.key];
            const bVal = sortConfig.key === 'employeeName' ? b.employeeName : b[sortConfig.key];
            if (aVal === bVal) return 0;
            const cmp = aVal < bVal ? -1 : 1;
            return sortConfig.direction === 'asc' ? cmp : -cmp;
        });
    }, [employees, attendance, selectedGroup, payrollTotals, sortConfig]);

    const totals = useMemo(() => {
        if (comparisonRows.length === 0) return null;
        const sum = comparisonRows.reduce((acc, r) => ({
            absentDays: acc.absentDays + r.absentDays,
            lateArrivals: acc.lateArrivals + r.lateArrivals,
            overtimeHours: acc.overtimeHours + r.overtimeHours,
            totalNet: acc.totalNet + r.totalNet,
            bonusAccrued: acc.bonusAccrued + r.bonusAccrued,
        }), { absentDays: 0, lateArrivals: 0, overtimeHours: 0, totalNet: 0, bonusAccrued: 0 });
        const avgAttendance = comparisonRows.reduce((s, r) => s + r.attendanceRate, 0) / comparisonRows.length;
        return { ...sum, avgAttendance };
    }, [comparisonRows]);

    // Every period-of-this-type across the fiscal year, used by the
    // multi-employee comparison table below to show trends over time.
    const allPeriodsThisType = useMemo(() => {
        const groups = periodType === 'monthly' ? getBenchmarkPeriodGroups(fyStart, 'monthly', 0) : periodGroups;
        return groups.map((g, i) => ({
            label: g.label || monthLabel(g.months[0]?.bsMonth ?? 0),
            months: g.months,
            rows: aggregatePerformanceMetricsWithTrend(employees, attendance, g.months),
        }));
    }, [fyStart, periodType, periodGroups, employees, attendance]);

    const compareEmployees = employees.filter(e => compareIds.includes(e.id)).sort((a, b) => a.name.localeCompare(b.name));

    const toggleCompare = (id: string) => {
        setCompareIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    };

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
                    <div className="space-y-1.5">
                        <Label className="text-[10px] uppercase font-bold text-muted-foreground">Compare Employees</Label>
                        <Popover open={comparePickerOpen} onOpenChange={setComparePickerOpen}>
                            <PopoverTrigger asChild>
                                <Button variant="outline" className="h-9 bg-white font-bold text-xs justify-start min-w-[200px]">
                                    <Users className="mr-2 h-3.5 w-3.5" />
                                    {compareIds.length === 0 ? 'Select 2+ employees...' : `${compareIds.length} employee(s) selected`}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[260px] p-0" align="start">
                                <ScrollArea className="h-[280px] p-2">
                                    {[...employees].sort((a, b) => a.name.localeCompare(b.name)).map(e => (
                                        <label key={e.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/50 cursor-pointer text-xs">
                                            <Checkbox checked={compareIds.includes(e.id)} onCheckedChange={() => toggleCompare(e.id)} />
                                            {e.name}
                                        </label>
                                    ))}
                                </ScrollArea>
                            </PopoverContent>
                        </Popover>
                    </div>
                </CardContent>
            </Card>

            <Card className="shadow-sm border-gray-100 bg-white overflow-hidden">
                <CardHeader className="bg-muted/10 border-b py-4 px-6">
                    <CardTitle className="text-sm font-black uppercase tracking-tight">
                        Comparison{selectedGroup ? ` - ${selectedGroup.label || monthLabel(selectedGroup.months[0]?.bsMonth ?? 0)}, FY ${formatFiscalYear(fyStart)}` : ''}
                    </CardTitle>
                    <CardDescription className="text-[10px] uppercase font-bold text-muted-foreground">
                        Click a column header to sort. Trend and Volatility need 2+ months in the selected period.
                    </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                    <ScrollArea className="w-full">
                        <Table className="text-[11px] border-collapse">
                            <TableHeader className="bg-muted/30">
                                <TableRow className="h-11">
                                    <SortableHead label="Employee" sortKey="employeeName" sortConfig={sortConfig} onSort={requestSort} className="sticky left-0 bg-background z-20 border-r pl-6" />
                                    <TableHead className="text-center font-bold uppercase px-3">Months</TableHead>
                                    <SortableHead label="Avg Attend %" sortKey="attendanceRate" sortConfig={sortConfig} onSort={requestSort} align="center" className="text-blue-700" />
                                    <TableHead className="text-center font-bold uppercase px-3">Trend</TableHead>
                                    <TableHead className="text-center font-bold uppercase px-3">Volatility</TableHead>
                                    <SortableHead label="Absent" sortKey="absentDays" sortConfig={sortConfig} onSort={requestSort} align="center" className="text-red-600" />
                                    <SortableHead label="Late" sortKey="lateArrivals" sortConfig={sortConfig} onSort={requestSort} align="center" className="text-amber-600" />
                                    <SortableHead label="OT Hrs" sortKey="overtimeHours" sortConfig={sortConfig} onSort={requestSort} align="right" />
                                    <SortableHead label="Total Net" sortKey="totalNet" sortConfig={sortConfig} onSort={requestSort} align="right" />
                                    <SortableHead label="Bonus Accrued" sortKey="bonusAccrued" sortConfig={sortConfig} onSort={requestSort} align="right" />
                                    <TableHead className="font-bold uppercase px-3 pr-6">Flags</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {comparisonRows.length === 0 ? (
                                    <TableRow><TableCell colSpan={11} className="text-center py-20 text-muted-foreground italic">No calculated attendance found for this period.</TableCell></TableRow>
                                ) : comparisonRows.map(r => (
                                    <TableRow key={r.employeeId} className={cn("hover:bg-muted/20 h-12 border-b", compareIds.includes(r.employeeId) && "bg-primary/5")}>
                                        <TableCell className="sticky left-0 bg-background z-10 border-r pl-6 font-black text-gray-900 uppercase tracking-tighter">{r.employeeName}</TableCell>
                                        <TableCell className="text-center tabular-nums px-3">{r.monthsWithData}</TableCell>
                                        <TableCell className={cn("text-center tabular-nums px-3 font-bold", r.flags.includes('Attendance well below peers') ? 'text-red-600' : 'text-blue-700')}>{r.attendanceRate.toFixed(1)}%</TableCell>
                                        <TableCell className="text-center px-3"><TrendBadge trend={r.trend} /></TableCell>
                                        <TableCell className="text-center tabular-nums px-3 text-muted-foreground">{r.trend !== 'N/A' ? `±${r.volatility.toFixed(1)}%` : '—'}</TableCell>
                                        <TableCell className="text-center tabular-nums px-3 font-bold text-red-700">{r.absentDays}</TableCell>
                                        <TableCell className="text-center tabular-nums px-3 font-bold text-amber-700">{r.lateArrivals}</TableCell>
                                        <TableCell className="text-right tabular-nums px-3 font-bold text-blue-700">+{r.overtimeHours.toFixed(1)}</TableCell>
                                        <TableCell className="text-right tabular-nums px-3 font-bold">{r.totalNet.toLocaleString(undefined, { maximumFractionDigits: 0 })}</TableCell>
                                        <TableCell className="text-right tabular-nums px-3">{r.bonusAccrued > 0 ? r.bonusAccrued.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '—'}</TableCell>
                                        <TableCell className="px-3 pr-6">
                                            {r.flags.length > 0 ? (
                                                <div className="flex items-center gap-1 text-red-600">
                                                    <AlertTriangle className="h-3 w-3 shrink-0" />
                                                    <span className="text-[10px] font-bold">{r.flags.join('; ')}</span>
                                                </div>
                                            ) : <span className="text-muted-foreground">—</span>}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                            {totals && (
                                <TableFooter className="bg-muted/50 font-black h-12 border-t-2">
                                    <TableRow>
                                        <TableCell className="sticky left-0 bg-background z-20 border-r pl-6 text-gray-900 uppercase tracking-tighter">Total / Avg ({comparisonRows.length})</TableCell>
                                        <TableCell></TableCell>
                                        <TableCell className="text-center tabular-nums px-3">{totals.avgAttendance.toFixed(1)}%</TableCell>
                                        <TableCell colSpan={2}></TableCell>
                                        <TableCell className="text-center tabular-nums px-3">{totals.absentDays}</TableCell>
                                        <TableCell className="text-center tabular-nums px-3">{totals.lateArrivals}</TableCell>
                                        <TableCell className="text-right tabular-nums px-3">+{totals.overtimeHours.toFixed(1)}</TableCell>
                                        <TableCell className="text-right tabular-nums px-3">{totals.totalNet.toLocaleString(undefined, { maximumFractionDigits: 0 })}</TableCell>
                                        <TableCell className="text-right tabular-nums px-3">{totals.bonusAccrued.toLocaleString(undefined, { maximumFractionDigits: 0 })}</TableCell>
                                        <TableCell className="pr-6"></TableCell>
                                    </TableRow>
                                </TableFooter>
                            )}
                        </Table>
                        <ScrollBar orientation="horizontal" />
                    </ScrollArea>
                </CardContent>
            </Card>

            {compareEmployees.length >= 2 && (
                <Card className="shadow-sm border-gray-100 bg-white overflow-hidden">
                    <CardHeader className="bg-muted/10 border-b py-4 px-6 flex flex-row items-center justify-between">
                        <div>
                            <CardTitle className="text-sm font-black uppercase tracking-tight">Head-to-Head: {compareEmployees.map(e => e.name).join(' vs ')}</CardTitle>
                            <CardDescription className="text-[10px] uppercase font-bold text-muted-foreground">
                                Every {PERIOD_TYPES.find(p => p.value === periodType)?.label.toLowerCase()} period in FY {formatFiscalYear(fyStart)}, oldest first.
                            </CardDescription>
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => setCompareIds([])} className="h-8 text-[10px] font-bold uppercase text-muted-foreground">
                            <X className="mr-1.5 h-3.5 w-3.5" /> Clear
                        </Button>
                    </CardHeader>
                    <CardContent className="p-0">
                        <ScrollArea className="w-full">
                            <Table className="text-[11px] border-collapse">
                                <TableHeader className="bg-muted/30">
                                    <TableRow className="h-9">
                                        <TableHead rowSpan={2} className="align-bottom pl-6 font-black uppercase text-gray-900 border-r">Period</TableHead>
                                        {compareEmployees.map(e => (
                                            <TableHead key={e.id} colSpan={3} className="text-center font-black uppercase text-gray-900 border-r border-l">{e.name}</TableHead>
                                        ))}
                                    </TableRow>
                                    <TableRow className="h-9">
                                        {compareEmployees.map(e => (
                                            <Fragment key={e.id}>
                                                <TableHead className="text-center font-bold uppercase text-blue-700 px-2 border-l">Attend %</TableHead>
                                                <TableHead className="text-center font-bold uppercase text-amber-700 px-2">Late</TableHead>
                                                <TableHead className="text-center font-bold uppercase px-2 border-r">OT Hrs</TableHead>
                                            </Fragment>
                                        ))}
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {allPeriodsThisType.map((period, i) => (
                                        <TableRow key={`hth-${i}`} className="h-11 border-b hover:bg-muted/20">
                                            <TableCell className="pl-6 font-bold text-gray-900 border-r">{period.label}</TableCell>
                                            {compareEmployees.map(e => {
                                                const row = period.rows.find(r => r.employeeId === e.id);
                                                const hasData = (row?.workdays || 0) + (row?.absentDays || 0) > 0;
                                                return (
                                                    <Fragment key={e.id}>
                                                        <TableCell className="text-center tabular-nums px-2 border-l font-bold text-blue-700">{hasData ? `${row!.attendanceRate.toFixed(0)}%` : '—'}</TableCell>
                                                        <TableCell className="text-center tabular-nums px-2 font-bold text-amber-700">{hasData ? row!.lateArrivals : '—'}</TableCell>
                                                        <TableCell className="text-center tabular-nums px-2 border-r">{hasData ? `+${row!.overtimeHours.toFixed(1)}` : '—'}</TableCell>
                                                    </Fragment>
                                                );
                                            })}
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                            <ScrollBar orientation="horizontal" />
                        </ScrollArea>
                    </CardContent>
                </Card>
            )}

            {compareEmployees.length === 1 && (
                <p className="text-[10px] text-muted-foreground italic px-1">Select at least one more employee above to see a head-to-head comparison over time.</p>
            )}
        </div>
    );
}

function monthLabel(bsMonth: number): string {
    const names = ['Baishakh', 'Jestha', 'Ashadh', 'Shrawan', 'Bhadra', 'Ashwin', 'Kartik', 'Mangsir', 'Poush', 'Magh', 'Falgun', 'Chaitra'];
    return names[bsMonth] || '';
}

function TrendBadge({ trend }: { trend: PeriodPerformanceMetrics['trend'] }) {
    if (trend === 'N/A') return <span className="text-muted-foreground text-[10px]">—</span>;
    const config = {
        Improving: { icon: TrendingUp, cls: 'border-emerald-200 text-emerald-700' },
        Declining: { icon: TrendingDown, cls: 'border-red-200 text-red-700' },
        Stable: { icon: Minus, cls: 'border-gray-200 text-muted-foreground' },
    }[trend];
    const Icon = config.icon;
    return (
        <Badge variant="outline" className={cn("text-[9px] font-black uppercase h-5 px-1.5 gap-1", config.cls)}>
            <Icon className="h-2.5 w-2.5" /> {trend}
        </Badge>
    );
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
