'use client';

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Users, CheckCircle, Wallet, Clock, Timer } from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';
import type { Employee, AttendanceRecord, AttendanceStatus, Payroll } from '@/lib/types';
import { ChartContainer, ChartTooltipContent, ChartConfig } from '@/components/ui/chart';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { Badge } from '@/components/ui/badge';
import { getAttendanceBadgeVariant } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { onEmployeesUpdate } from '@/services/employee-service';
import { onAttendanceUpdate } from '@/services/attendance-service';
import { onPayrollUpdate } from '@/services/payroll-service';
import NepaliDate from 'nepali-date-converter';
import {
    getFiscalYearStart,
    getFiscalYearMonths,
    getAvailableFiscalYears,
    formatFiscalYear,
    fiscalMonthName,
} from '@/lib/fiscal-year';

interface HrDashboardClientProps {
    initialEmployees: Employee[];
    initialAttendance: AttendanceRecord[];
}

export default function HrDashboardClient({ initialEmployees, initialAttendance }: HrDashboardClientProps) {
   const [employees, setEmployees] = useState<Employee[]>(initialEmployees);
   const [attendance, setAttendance] = useState<AttendanceRecord[]>(initialAttendance);
   const [payroll, setPayroll] = useState<Payroll[]>([]);
   const [selectedFiscalYear, setSelectedFiscalYear] = useState<string>(
       String(getFiscalYearStart(new NepaliDate().getYear(), new NepaliDate().getMonth()))
   );

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

   const {
       totalEmployees, workingEmployees, totalRegularHours, totalOvertimeHours,
       totalNetPayroll, statusData, wageBasisData, monthlyTrend,
   } = useMemo(() => {
        const totalRegular = fyAttendance.reduce((sum, r) => sum + (r.regularHours || 0), 0);
        const totalOvertime = fyAttendance.reduce((sum, r) => sum + (r.overtimeHours || 0), 0);
        const totalNet = fyPayroll.reduce((sum, p) => sum + (p.roundedNet ?? p.netPayment ?? 0), 0);

        const statusCounts = fyAttendance.reduce((acc, r) => {
            const status = r.status || 'Unknown';
            acc[status] = (acc[status] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);
        const statusData = Object.entries(statusCounts).map(([name, value]) => ({ name, value }));

        const wageCounts = employees.reduce((acc, e) => {
            acc[e.wageBasis] = (acc[e.wageBasis] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);
        const wageBasisData = Object.entries(wageCounts).map(([name, count]) => ({ name, count }));

        const monthlyTrend = fyMonths.map((m, i) => {
            const monthAttendance = fyAttendance.filter(r => r.bsYear === m.bsYear && r.bsMonth === m.bsMonth);
            const monthPayroll = fyPayroll.filter(p => p.bsYear === m.bsYear && p.bsMonth === m.bsMonth);
            return {
                month: fiscalMonthName(i),
                regularHours: monthAttendance.reduce((sum, r) => sum + (r.regularHours || 0), 0),
                overtimeHours: monthAttendance.reduce((sum, r) => sum + (r.overtimeHours || 0), 0),
                netPayroll: monthPayroll.reduce((sum, p) => sum + (p.roundedNet ?? p.netPayment ?? 0), 0),
            };
        });

        return {
            totalEmployees: employees.length,
            workingEmployees: employees.filter(e => e.status === 'Working').length,
            totalRegularHours: totalRegular,
            totalOvertimeHours: totalOvertime,
            totalNetPayroll: totalNet,
            statusData,
            wageBasisData,
            monthlyTrend,
        };
   }, [employees, fyAttendance, fyPayroll, fyMonths]);

   const recentAttendance = useMemo(() => {
        return [...fyAttendance]
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
            .slice(0, 10);
   }, [fyAttendance]);

   const chartConfig: ChartConfig = {
        value: { label: 'Count' },
        count: { label: 'Count' },
        regularHours: { label: 'Regular Hrs', color: 'hsl(var(--chart-1))' },
        overtimeHours: { label: 'OT Hrs', color: 'hsl(var(--chart-2))' },
        netPayroll: { label: 'Net Payroll', color: 'hsl(var(--chart-3))' },
    };

    const COLORS = ["hsl(var(--chart-1))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))", "hsl(var(--chart-5))"];

  return (
    <div className="grid gap-6">
       <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
                <h2 className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground px-1">Fiscal Year Summary</h2>
            </div>
            <div className="flex items-center gap-2">
                <Label className="text-[10px] uppercase font-bold text-muted-foreground">Fiscal Year</Label>
                <Select value={selectedFiscalYear} onValueChange={setSelectedFiscalYear}>
                    <SelectTrigger className="h-9 w-[120px] bg-white"><SelectValue /></SelectTrigger>
                    <SelectContent>{availableFiscalYears.map(y => <SelectItem key={`dash-fy-${y}`} value={String(y)}>{formatFiscalYear(y)}</SelectItem>)}</SelectContent>
                </Select>
            </div>
       </div>

       <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-5">
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total Employees</CardTitle>
                    <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{totalEmployees}</div>
                    <p className="text-xs text-muted-foreground">{workingEmployees} currently working</p>
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
                    <div className="text-2xl font-bold">{totalRegularHours.toFixed(1)}</div>
                </CardContent>
            </Card>
             <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total Overtime Hours</CardTitle>
                    <Timer className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{totalOvertimeHours.toFixed(1)}</div>
                </CardContent>
            </Card>
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total Net Payroll</CardTitle>
                    <Wallet className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{totalNetPayroll.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                </CardContent>
            </Card>
       </div>

       <Card>
            <CardHeader>
                <CardTitle>Monthly Trend</CardTitle>
                <CardDescription>Regular vs. overtime hours and net payroll across FY {formatFiscalYear(fyStart)}, Shrawan through Ashadh.</CardDescription>
            </CardHeader>
            <CardContent>
                <ChartContainer config={chartConfig} className="h-[280px] w-full">
                    <ResponsiveContainer>
                        <BarChart data={monthlyTrend} margin={{ top: 10, right: 10, left: -10, bottom: 5 }}>
                            <CartesianGrid vertical={false} />
                            <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={11} />
                            <YAxis tickLine={false} axisLine={false} fontSize={11} />
                            <Tooltip content={<ChartTooltipContent />} />
                            <Legend wrapperStyle={{ fontSize: 11 }} />
                            <Bar dataKey="regularHours" fill="var(--color-regularHours)" radius={3} />
                            <Bar dataKey="overtimeHours" fill="var(--color-overtimeHours)" radius={3} />
                        </BarChart>
                    </ResponsiveContainer>
                </ChartContainer>
            </CardContent>
       </Card>

       <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-5">
            <Card className="lg:col-span-3">
                <CardHeader>
                    <CardTitle>Attendance Status Breakdown</CardTitle>
                    <CardDescription>A summary of attendance statuses for FY {formatFiscalYear(fyStart)}.</CardDescription>
                </CardHeader>
                <CardContent className="flex items-center justify-center">
                    <ChartContainer config={chartConfig} className="h-[250px] w-full">
                        <ResponsiveContainer width="100%" height={250}>
                            <PieChart>
                                <Tooltip content={<ChartTooltipContent />} />
                                <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                                    {statusData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                            </PieChart>
                        </ResponsiveContainer>
                    </ChartContainer>
                </CardContent>
            </Card>
            <Card className="lg:col-span-2">
                <CardHeader>
                    <CardTitle>Employees by Wage Basis</CardTitle>
                    <CardDescription>Total headcount by their wage structure.</CardDescription>
                </CardHeader>
                <CardContent>
                    <ChartContainer config={chartConfig} className="h-[250px] w-full">
                        <ResponsiveContainer>
                            <BarChart data={wageBasisData} layout="vertical" margin={{ top: 20, right: 20, left: -10, bottom: 5 }}>
                                <CartesianGrid horizontal={false} />
                                <YAxis dataKey="name" type="category" tickLine={false} axisLine={false} width={80}/>
                                <XAxis type="number" />
                                <Tooltip cursor={{fill: 'hsl(var(--muted))'}} content={<ChartTooltipContent />} />
                                <Bar dataKey="count" fill="hsl(var(--primary))" radius={4} />
                            </BarChart>
                        </ResponsiveContainer>
                    </ChartContainer>
                </CardContent>
            </Card>
       </div>

       <Card>
            <CardHeader>
                <CardTitle>Recent Attendance Records</CardTitle>
                <CardDescription>The 10 most recent attendance records in FY {formatFiscalYear(fyStart)}.</CardDescription>
            </CardHeader>
            <CardContent>
                <ScrollArea className="h-[300px]">
                    {recentAttendance.length > 0 ? (
                        <div className="space-y-4">
                            {recentAttendance.map(record => (
                                <div key={record.id} className="flex items-center justify-between">
                                    <div>
                                        <p className="font-medium">{record.employeeName}</p>
                                        <p className="text-sm text-muted-foreground">{record.dateBS}</p>
                                    </div>
                                    <Badge variant={getAttendanceBadgeVariant(record.status as AttendanceStatus)}>{record.status}</Badge>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="flex h-full items-center justify-center text-muted-foreground">
                            No attendance records found for this fiscal year.
                        </div>
                    )}
                </ScrollArea>
            </CardContent>
       </Card>
    </div>
  );
}
