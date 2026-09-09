'use client';

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Users, CheckCircle, Wallet, Clock, Timer, RefreshCcw, TrendingUp, TrendingDown, Minus, AlertTriangle } from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';
import type { Employee, AttendanceRecord, Payroll } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { onEmployeesUpdate } from '@/services/employee-service';
import { onAttendanceUpdate } from '@/services/attendance-service';
import { onPayrollUpdate } from '@/services/payroll-service';
import NepaliDate from 'nepali-date-converter';
import {
    getFiscalYearStart,
    getFiscalYearMonths,
    getAvailableFiscalYears,
    formatFiscalYear,
} from '@/lib/fiscal-year';
import { aggregatePerformanceMetricsWithTrend, type PeriodPerformanceMetrics } from '@/lib/performance-metrics';

interface HrDashboardClientProps {
    initialEmployees: Employee[];
    initialAttendance: AttendanceRecord[];
}

const ATTENDANCE_FLAG_THRESHOLD = 15;

export default function HrDashboardClient({ initialEmployees, initialAttendance }: HrDashboardClientProps) {
   const [employees, setEmployees] = useState<Employee[]>(initialEmployees);
   const [attendance, setAttendance] = useState<AttendanceRecord[]>(initialAttendance);
   const [payroll, setPayroll] = useState<Payroll[]>([]);
   const [isRefreshing, setIsRefreshing] = useState(false);
   const [selectedFiscalYear, setSelectedFiscalYear] = useState<string>(
       String(getFiscalYearStart(new NepaliDate().getYear(), new NepaliDate().getMonth()))
   );
   const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('All');

   useEffect(() => {
       const unsubEmployees = onEmployeesUpdate(setEmployees);
       const unsubAttendance = onAttendanceUpdate(setAttendance);
       const unsubPayroll = onPayrollUpdate(setPayroll);

       return () => {
           unsubEmployees();
           unsubAttendance();
           unsubPayroll();
       }
    }, []);

   const availableFiscalYears = useMemo(() => {
       const years = getAvailableFiscalYears([
           ...attendance.map(r => ({ bsYear: r.bsYear, bsMonth: r.bsMonth })),
           ...payroll.map(p => ({ bsYear: p.bsYear, bsMonth: p.bsMonth })),
       ]);
       const current = getFiscalYearStart(new NepaliDate().getYear(), new NepaliDate().getMonth());
       return years.includes(current) ? years : [current, ...years].sort((a, b) => b - a);
   }, [attendance, payroll]);

   const fyStart = parseInt(selectedFiscalYear);
   const fyMonths = useMemo(() => getFiscalYearMonths(fyStart), [fyStart]);

   const fyAttendance = useMemo(
       () => attendance.filter(r => getFiscalYearStart(r.bsYear, r.bsMonth) === fyStart),
       [attendance, fyStart]
   );
   const fyPayroll = useMemo(
       () => payroll.filter(p => getFiscalYearStart(p.bsYear, p.bsMonth) === fyStart),
       [payroll, fyStart]
   );

   const summary = useMemo(() => {
        const totalRegular = fyAttendance.reduce((sum, r) => sum + (r.regularHours || 0), 0);
        const totalOvertime = fyAttendance.reduce((sum, r) => sum + (r.overtimeHours || 0), 0);
        const totalNet = fyPayroll.reduce((sum, p) => sum + (p.roundedNet ?? p.netPayment ?? 0), 0);
        return {
            totalEmployees: employees.length,
            workingEmployees: employees.filter(e => e.status === 'Working').length,
            totalRegularHours: totalRegular,
            totalOvertimeHours: totalOvertime,
            totalNetPayroll: totalNet,
        };
   }, [employees, fyAttendance, fyPayroll]);

   // Company Overview: same shape as the source Excel's HR & Payroll
   // Dashboard - one row per employee, aggregated across the whole fiscal
   // year, built on the same shared metrics module the Analytics tab and
   // Performance Benchmark page use, so all three stay in sync.
   const overviewRows = useMemo(() => {
        const rows = aggregatePerformanceMetricsWithTrend(employees, attendance, fyMonths);
        const payrollByEmployee = new Map<string, { net: number; bonus: number }>();
        for (const p of fyPayroll) {
            const existing = payrollByEmployee.get(p.employeeId) || { net: 0, bonus: 0 };
            existing.net += p.roundedNet ?? p.netPayment ?? 0;
            existing.bonus += p.bonus ?? 0;
            payrollByEmployee.set(p.employeeId, existing);
        }
        const groupMean = rows.length > 0 ? rows.reduce((s, r) => s + r.attendanceRate, 0) / rows.length : 0;

        const filtered = selectedEmployeeId === 'All' ? rows : rows.filter(r => r.employeeId === selectedEmployeeId);
        return filtered.map(r => {
            const pay = payrollByEmployee.get(r.employeeId) || { net: 0, bonus: 0 };
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
   }, [employees, attendance, fyMonths, fyPayroll, selectedEmployeeId]);

   const overviewTotals = useMemo(() => {
        if (overviewRows.length === 0) return null;
        const sum = overviewRows.reduce((acc, r) => ({
            lateArrivals: acc.lateArrivals + r.lateArrivals,
            overtimeHours: acc.overtimeHours + r.overtimeHours,
            totalNet: acc.totalNet + r.totalNet,
            bonusAccrued: acc.bonusAccrued + r.bonusAccrued,
        }), { lateArrivals: 0, overtimeHours: 0, totalNet: 0, bonusAccrued: 0 });
        const sorted = [...overviewRows].map(r => r.attendanceRate).sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        const median = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
        return { ...sum, median, headcount: overviewRows.length };
   }, [overviewRows]);

   const handleRefresh = () => {
        setIsRefreshing(true);
        setTimeout(() => setIsRefreshing(false), 500);
   };

  return (
    <div className="grid gap-6">
       <div className="rounded-xl overflow-hidden shadow-sm border border-gray-100">
            <div className="bg-[#1c355e] text-white text-center py-2.5 font-black uppercase tracking-widest text-sm">
                HR &amp; Payroll Dashboard
            </div>
            <div className="bg-white p-4 flex flex-col sm:flex-row flex-wrap items-end gap-4 border-b">
                <div className="space-y-1.5 w-[120px]">
                    <Label className="text-[10px] uppercase font-bold text-muted-foreground">Fiscal Year</Label>
                    <Select value={selectedFiscalYear} onValueChange={setSelectedFiscalYear}>
                        <SelectTrigger className="h-9 bg-white"><SelectValue /></SelectTrigger>
                        <SelectContent>{availableFiscalYears.map(y => <SelectItem key={`dash-fy-${y}`} value={String(y)}>{formatFiscalYear(y)}</SelectItem>)}</SelectContent>
                    </Select>
                </div>
                <div className="space-y-1.5 w-[200px]">
                    <Label className="text-[10px] uppercase font-bold text-muted-foreground">Employee</Label>
                    <Select value={selectedEmployeeId} onValueChange={setSelectedEmployeeId}>
                        <SelectTrigger className="h-9 bg-white"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="All">(All Employees)</SelectItem>
                            {[...employees].sort((a, b) => a.name.localeCompare(b.name)).map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>
                <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isRefreshing} className="h-9 font-bold text-[10px] uppercase tracking-widest">
                    <RefreshCcw className={cn("mr-2 h-3.5 w-3.5", isRefreshing && "animate-spin")} /> Refresh
                </Button>
                <p className="text-[10px] text-muted-foreground italic ml-auto">Fiscal year runs Shrawan to Ashadh. Data updates live as attendance/payroll change.</p>
            </div>
       </div>

       <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total Employees</CardTitle>
                    <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{summary.totalEmployees}</div>
                    <p className="text-xs text-muted-foreground">{summary.workingEmployees} currently working</p>
                </CardContent>
            </Card>
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Attendance Records</CardTitle>
                    <CheckCircle className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{fyAttendance.length}</div>
                    <p className="text-xs text-muted-foreground">for FY {formatFiscalYear(fyStart)}</p>
                </CardContent>
            </Card>
             <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total Regular Hours</CardTitle>
                    <Clock className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{summary.totalRegularHours.toFixed(1)}</div>
                </CardContent>
            </Card>
             <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total Overtime Hours</CardTitle>
                    <Timer className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{summary.totalOvertimeHours.toFixed(1)}</div>
                </CardContent>
            </Card>
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total Net Payroll</CardTitle>
                    <Wallet className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{summary.totalNetPayroll.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                </CardContent>
            </Card>
       </div>

       <Card className="shadow-sm border-gray-100 bg-white overflow-hidden">
            <CardHeader className="bg-[#1c355e]/5 border-b py-4 px-6">
                <CardTitle className="text-sm font-black uppercase tracking-tight">Company Overview - FY {formatFiscalYear(fyStart)}</CardTitle>
                <CardDescription className="text-[10px] uppercase font-bold text-muted-foreground">Every employee, aggregated across the full fiscal year - the same figures Analytics and Performance Benchmark use.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
                <ScrollArea className="w-full">
                    <Table className="text-[11px] border-collapse">
                        <TableHeader className="bg-muted/30">
                            <TableRow className="h-11">
                                <TableHead className="sticky left-0 bg-background z-20 border-r pl-6 font-black uppercase text-gray-900">Employee</TableHead>
                                <TableHead className="text-center font-bold uppercase px-3">Months</TableHead>
                                <TableHead className="text-center font-bold uppercase px-3 text-blue-700">Avg Attend %</TableHead>
                                <TableHead className="text-center font-bold uppercase px-3">Attend Trend</TableHead>
                                <TableHead className="text-center font-bold uppercase px-3">Volatility</TableHead>
                                <TableHead className="text-center font-bold uppercase px-3 text-amber-600">Late Days</TableHead>
                                <TableHead className="text-right font-bold uppercase px-3">OT Hours</TableHead>
                                <TableHead className="text-right font-bold uppercase px-3">Total Net</TableHead>
                                <TableHead className="text-right font-bold uppercase px-3">Bonus Accrued</TableHead>
                                <TableHead className="font-bold uppercase px-3 pr-6">Flags</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {overviewRows.length === 0 ? (
                                <TableRow><TableCell colSpan={10} className="text-center py-16 text-muted-foreground italic">No calculated attendance found for FY {formatFiscalYear(fyStart)}.</TableCell></TableRow>
                            ) : overviewRows.map(r => (
                                <TableRow key={r.employeeId} className={cn("hover:bg-muted/20 h-12 border-b", r.flags.length > 0 && "bg-amber-50/40")}>
                                    <TableCell className="sticky left-0 bg-background z-10 border-r pl-6 font-black text-gray-900 uppercase tracking-tighter">{r.employeeName}</TableCell>
                                    <TableCell className="text-center tabular-nums px-3">{r.monthsWithData}</TableCell>
                                    <TableCell className={cn("text-center tabular-nums px-3 font-bold", r.flags.includes('Attendance well below peers') ? 'text-red-600' : 'text-blue-700')}>{r.attendanceRate.toFixed(1)}</TableCell>
                                    <TableCell className="text-center px-3"><TrendBadge trend={r.trend} /></TableCell>
                                    <TableCell className="text-center tabular-nums px-3 text-muted-foreground">{r.trend !== 'N/A' ? `±${r.volatility.toFixed(1)}%` : '—'}</TableCell>
                                    <TableCell className="text-center tabular-nums px-3 font-bold text-amber-700">{r.lateArrivals}</TableCell>
                                    <TableCell className="text-right tabular-nums px-3 font-bold text-blue-700">+{r.overtimeHours.toFixed(1)}</TableCell>
                                    <TableCell className="text-right tabular-nums px-3 font-bold">{r.totalNet.toLocaleString(undefined, { maximumFractionDigits: 2 })}</TableCell>
                                    <TableCell className="text-right tabular-nums px-3">{r.bonusAccrued > 0 ? r.bonusAccrued.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '—'}</TableCell>
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
                        {overviewTotals && (
                            <TableFooter className="bg-muted/50 font-black h-12 border-t-2">
                                <TableRow>
                                    <TableCell className="sticky left-0 bg-background z-20 border-r pl-6 text-gray-900 uppercase tracking-tighter">Total / Median (Headcount: {overviewTotals.headcount})</TableCell>
                                    <TableCell></TableCell>
                                    <TableCell className="text-center tabular-nums px-3">{overviewTotals.median.toFixed(1)}</TableCell>
                                    <TableCell colSpan={2}></TableCell>
                                    <TableCell className="text-center tabular-nums px-3">{overviewTotals.lateArrivals}</TableCell>
                                    <TableCell className="text-right tabular-nums px-3">+{overviewTotals.overtimeHours.toFixed(1)}</TableCell>
                                    <TableCell className="text-right tabular-nums px-3">{overviewTotals.totalNet.toLocaleString(undefined, { maximumFractionDigits: 2 })}</TableCell>
                                    <TableCell className="text-right tabular-nums px-3">{overviewTotals.bonusAccrued.toLocaleString(undefined, { maximumFractionDigits: 2 })}</TableCell>
                                    <TableCell className="pr-6"></TableCell>
                                </TableRow>
                            </TableFooter>
                        )}
                    </Table>
                    <ScrollBar orientation="horizontal" />
                </ScrollArea>
            </CardContent>
       </Card>
    </div>
  );
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
