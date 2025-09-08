
'use client';

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Users, CheckCircle, XCircle, Clock, Timer } from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';
import type { Employee, AttendanceRecord } from '@/lib/types';
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartConfig } from '@/components/ui/chart';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { startOfToday, startOfMonth, endOfMonth, isToday } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { getAttendanceBadgeVariant } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { onEmployeesUpdate } from '@/services/employee-service';
import { onAttendanceUpdate } from '@/services/attendance-service';

interface HrDashboardClientProps {
    initialEmployees: Employee[];
    initialAttendance: AttendanceRecord[];
}

export default function HrDashboardClient({ initialEmployees, initialAttendance }: HrDashboardClientProps) {
   const [employees, setEmployees] = useState<Employee[]>(initialEmployees);
   const [attendance, setAttendance] = useState<AttendanceRecord[]>(initialAttendance);
   
   useEffect(() => { 
       const unsubEmployees = onEmployeesUpdate(setEmployees);
       const unsubAttendance = onAttendanceUpdate(setAttendance);

       return () => {
           unsubEmployees();
           unsubAttendance();
       }
    }, []);
   
   const { 
       totalEmployees, presentToday, absentToday, monthlyAttendanceData, 
       wageBasisData, totalRegularHours, totalOvertimeHours 
    } = useMemo(() => {
        const today = startOfToday();
        const todaysAttendance = attendance.filter(r => isToday(new Date(r.date)));
        
        const present = todaysAttendance.filter(r => r.status === 'Present').length;
        const absent = todaysAttendance.filter(r => r.status === 'Absent' || r.status === 'C/I Miss' || r.status === 'C/O Miss').length;

        const start = startOfMonth(today);
        const end = endOfMonth(today);
        const monthlyRecords = attendance.filter(r => {
            const rDate = new Date(r.date);
            return rDate >= start && rDate <= end;
        });
        
        const totalRegular = monthlyRecords.reduce((sum, r) => sum + (r.regularHours || 0), 0);
        const totalOvertime = monthlyRecords.reduce((sum, r) => sum + (r.overtimeHours || 0), 0);

        const monthlyStatusCounts = monthlyRecords.reduce((acc, r) => {
            acc[r.status] = (acc[r.status] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);
        
        const monthlyData = Object.entries(monthlyStatusCounts).map(([name, value]) => ({ name, value }));
        
        const wageCounts = employees.reduce((acc, e) => {
            acc[e.wageBasis] = (acc[e.wageBasis] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);
        
        const wageData = Object.entries(wageCounts).map(([name, count]) => ({ name, count }));

        return {
            totalEmployees: employees.length,
            presentToday: present,
            absentToday: absent,
            monthlyAttendanceData: monthlyData,
            wageBasisData: wageData,
            totalRegularHours: totalRegular,
            totalOvertimeHours: totalOvertime
        };

   }, [employees, attendance]);
   
   const recentAttendance = useMemo(() => {
        return [...attendance]
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
            .slice(0, 10);
   }, [attendance]);

   const chartConfig: ChartConfig = {
        value: { label: 'Count' },
        count: { label: 'Count' },
    };
    
    const COLORS = ["hsl(var(--chart-1))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))", "hsl(var(--chart-5))"];


  return (
    <div className="grid gap-6">
       <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-5">
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total Employees</CardTitle>
                    <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{totalEmployees}</div>
                </CardContent>
            </Card>
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Present Today</CardTitle>
                    <CheckCircle className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold text-green-600">{presentToday}</div>
                </CardContent>
            </Card>
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Absent Today</CardTitle>
                    <XCircle className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold text-red-600">{absentToday}</div>
                </CardContent>
            </Card>
             <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total Regular Hours (This Month)</CardTitle>
                    <Clock className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{totalRegularHours.toFixed(1)}</div>
                </CardContent>
            </Card>
             <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total Overtime Hours (This Month)</CardTitle>
                    <Timer className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{totalOvertimeHours.toFixed(1)}</div>
                </CardContent>
            </Card>
       </div>
       
       <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-5">
            <Card className="lg:col-span-3">
                <CardHeader>
                    <CardTitle>Monthly Attendance Overview</CardTitle>
                    <CardDescription>A summary of attendance statuses for the current month.</CardDescription>
                </CardHeader>
                <CardContent className="flex items-center justify-center">
                    <ChartContainer config={chartConfig} className="h-[250px] w-full">
                        <ResponsiveContainer width="100%" height={250}>
                            <PieChart>
                                <Tooltip content={<ChartTooltipContent nameKey="name" />} />
                                <Pie data={monthlyAttendanceData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                                    {monthlyAttendanceData.map((entry, index) => (
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
                                <Bar dataKey="count" fill="var(--color-count)" radius={4} layout="vertical" />
                            </BarChart>
                        </ResponsiveContainer>
                    </ChartContainer>
                </CardContent>
            </Card>
       </div>
       
       <Card>
            <CardHeader>
                <CardTitle>Recent Attendance Records</CardTitle>
                <CardDescription>The 10 most recently added attendance records.</CardDescription>
            </CardHeader>
            <CardContent>
                <ScrollArea className="h-[300px]">
                    {recentAttendance.length > 0 ? (
                        <div className="space-y-4">
                            {recentAttendance.map(record => (
                                <div key={record.id} className="flex items-center justify-between">
                                    <div>
                                        <p className="font-medium">{record.employeeName}</p>
                                        <p className="text-sm text-muted-foreground">{new Date(record.date).toLocaleDateString()}</p>
                                    </div>
                                    <Badge variant={getAttendanceBadgeVariant(record.status)}>{record.status}</Badge>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="flex h-full items-center justify-center text-muted-foreground">
                            No attendance records found.
                        </div>
                    )}
                </ScrollArea>
            </CardContent>
       </Card>
    </div>
  );
}
