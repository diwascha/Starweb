
'use client';

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Users, Calendar, FileText, Award, Wallet, CheckCircle, XCircle } from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '@/hooks/use-auth';
import { useState, useEffect, useMemo } from 'react';
import type { Employee, AttendanceRecord } from '@/lib/types';
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartConfig } from '@/components/ui/chart';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { startOfToday, startOfMonth, endOfMonth, isToday } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { getAttendanceBadgeVariant } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { getEmployees } from '@/services/employee-service';
import { getAttendanceRecords } from '@/services/attendance-service';
import { useToast } from '@/hooks/use-toast';


const hrModules = [
    {
        name: 'Employees',
        description: 'Manage employee records and wage information.',
        href: '/hr/employees',
        icon: Users,
        permission: 'hr',
        action: 'view'
    },
    {
        name: 'Attendance',
        description: 'Record and track daily employee attendance.',
        href: '/hr/attendance',
        icon: Calendar,
        permission: 'hr',
        action: 'view'
    },
    {
        name: 'Payroll',
        description: 'Generate and manage payroll reports.',
        href: '#',
        icon: FileText,
        permission: 'hr',
        action: 'view',
        comingSoon: true
    },
    {
        name: 'Bonus',
        description: 'Calculate and track employee bonuses.',
        href: '#',
        icon: Award,
        permission: 'hr',
        action: 'view',
        comingSoon: true
    },
    {
        name: 'Payslip',
        description: 'Generate and distribute employee payslips.',
        href: '#',
        icon: Wallet,
        permission: 'hr',
        action: 'view',
        comingSoon: true
    },
];

export default function HRPage() {
   const { hasPermission } = useAuth();
   const [isClient, setIsClient] = useState(false);
   const { toast } = useToast();
   
   const [employees, setEmployees] = useState<Employee[]>([]);
   const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
   
   useEffect(() => { 
       setIsClient(true);
       async function fetchData() {
           try {
               const [employeesData, attendanceData] = await Promise.all([
                   getEmployees(),
                   getAttendanceRecords()
               ]);
               setEmployees(employeesData);
               setAttendance(attendanceData);
           } catch (error) {
               toast({ title: 'Error', description: 'Failed to load dashboard data.', variant: 'destructive' });
           }
       }
       fetchData();
    }, [toast]);
   
   const { totalEmployees, presentToday, absentToday, monthlyAttendanceData, wageBasisData } = useMemo(() => {
        if (!isClient) return { totalEmployees: 0, presentToday: 0, absentToday: 0, monthlyAttendanceData: [], wageBasisData: [] };

        const today = startOfToday();
        const todaysAttendance = attendance.filter(r => isToday(new Date(r.date)));
        
        const present = todaysAttendance.filter(r => r.status === 'Present').length;
        const absent = todaysAttendance.filter(r => r.status === 'Absent').length;

        const start = startOfMonth(today);
        const end = endOfMonth(today);
        const monthlyRecords = attendance.filter(r => {
            const rDate = new Date(r.date);
            return rDate >= start && rDate <= end;
        });

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
        };

   }, [isClient, employees, attendance]);
   
   const recentAttendance = useMemo(() => {
        if (!isClient) return [];
        return [...attendance]
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
            .slice(0, 10);
   }, [isClient, attendance]);

   const chartConfig: ChartConfig = {
        value: { label: 'Count' },
        count: { label: 'Count' },
    };
    
    const COLORS = ["hsl(var(--chart-1))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))", "hsl(var(--chart-5))"];


  if (!isClient) {
      return (
          <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm py-24">
              <h3 className="text-2xl font-bold tracking-tight">Loading HR Dashboard...</h3>
          </div>
      );
  }

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">HR Dashboard</h1>
        <p className="text-muted-foreground">An overview of your employees and attendance records.</p>
      </header>

       <div className="grid gap-6 md:grid-cols-3">
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

      <div>
        <h2 className="text-xl font-bold tracking-tight mb-4">Quick Access</h2>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {hrModules.filter(module => hasPermission(module.permission as any, module.action as any)).map((module) => (
            <Link href={module.href} key={module.name} className={module.comingSoon ? 'pointer-events-none' : ''}>
                <Card className={`h-full transition-all hover:shadow-md ${module.comingSoon ? 'opacity-50' : ''}`}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-lg font-medium">{module.name}</CardTitle>
                    <module.icon className="h-6 w-6 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <p className="text-sm text-muted-foreground">{module.description}</p>
                    {module.comingSoon && (
                        <p className="text-xs font-semibold text-primary mt-2">Coming Soon</p>
                    )}
                </CardContent>
                </Card>
            </Link>
            ))}
        </div>
      </div>
    </div>
  );
}
