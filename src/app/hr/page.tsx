
import { Suspense } from 'react';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Users, Calendar, FileText, Award, Wallet, CheckCircle, XCircle, BarChart2 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { getEmployees } from '@/services/employee-service';
import { getAttendance } from '@/services/attendance-service';
import HrDashboardClient from './_components/hr-dashboard-client';


const hrModules = [
    {
        name: 'Employees',
        description: 'Manage employee records and wage information.',
        href: '/hr/employees',
        icon: Users,
        permission: 'hr' as const,
        action: 'view' as const
    },
    {
        name: 'Attendance',
        description: 'Record and track daily employee attendance.',
        href: '/hr/attendance',
        icon: Calendar,
        permission: 'hr' as const,
        action: 'view' as const
    },
     {
        name: 'Analytics',
        description: 'Generate attendance analytics for any period.',
        href: '/hr/analytics',
        icon: BarChart2,
        permission: 'hr' as const,
        action: 'view' as const,
    },
    {
        name: 'Payroll',
        description: 'View imported payroll reports.',
        href: '/hr/payroll',
        icon: FileText,
        permission: 'hr' as const,
        action: 'view' as const,
    },
    {
        name: 'Bonus',
        description: 'Calculate and track employee bonuses.',
        href: '/hr/bonus',
        icon: Award,
        permission: 'hr' as const,
        action: 'view' as const,
    },
    {
        name: 'Payslip',
        description: 'View and print imported employee payslips.',
        href: '/hr/payslip',
        icon: Wallet,
        permission: 'hr' as const,
        action: 'view' as const,
    },
];

function DashboardSkeleton() {
    return (
        <div className="grid gap-6">
            <div className="grid gap-6 md:grid-cols-3">
                 <Card><CardHeader><Skeleton className="h-4 w-3/4" /></CardHeader><CardContent><Skeleton className="h-8 w-1/2" /></CardContent></Card>
                 <Card><CardHeader><Skeleton className="h-4 w-3/4" /></CardHeader><CardContent><Skeleton className="h-8 w-1/2" /></CardContent></Card>
                 <Card><CardHeader><Skeleton className="h-4 w-3/4" /></CardHeader><CardContent><Skeleton className="h-8 w-1/2" /></CardContent></Card>
            </div>
             <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-5">
                <Card className="lg:col-span-3"><CardHeader><Skeleton className="h-6 w-3/4 mb-2" /><Skeleton className="h-4 w-1/2" /></CardHeader><CardContent><Skeleton className="h-[250px] w-full" /></CardContent></Card>
                <Card className="lg:col-span-2"><CardHeader><Skeleton className="h-6 w-3/4 mb-2" /><Skeleton className="h-4 w-1/2" /></CardHeader><CardContent><Skeleton className="h-[250px] w-full" /></CardContent></Card>
            </div>
             <Card><CardHeader><Skeleton className="h-6 w-3/4 mb-2" /><Skeleton className="h-4 w-1/2" /></CardHeader><CardContent><Skeleton className="h-[300px] w-full" /></CardContent></Card>
        </div>
    );
}

export default async function HRPage() {
    const employeesRaw = await getEmployees();
    const attendanceRaw = await getAttendance();

    // Helper to safely convert Firestore Timestamps or other date formats to ISO strings
    const toSafeISOString = (date: any) => {
      if (!date) return undefined;
      // Firestore Timestamp
      if (date && typeof date.toDate === 'function') {
        return date.toDate().toISOString();
      }
      // Already a Date object or a valid date string
      const d = new Date(date);
      if (!isNaN(d.getTime())) {
        return d.toISOString();
      }
      return undefined;
    };

    // Sanitize data before passing it to the client component
    const initialEmployees = employeesRaw.map(e => ({
        ...e,
        dateOfBirth: toSafeISOString(e.dateOfBirth),
        joiningDate: toSafeISOString(e.joiningDate),
        createdAt: toSafeISOString(e.createdAt),
        lastModifiedAt: toSafeISOString(e.lastModifiedAt),
    }));
    
    const initialAttendance = attendanceRaw.map(a => ({
        ...a,
        date: toSafeISOString(a.date),
    }));
  
  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">HR Dashboard</h1>
        <p className="text-muted-foreground">An overview of your employees and attendance records.</p>
      </header>

      <Suspense fallback={<DashboardSkeleton />}>
        <HrDashboardClient initialEmployees={initialEmployees} initialAttendance={initialAttendance} />
      </Suspense>

      <div>
        <h2 className="text-xl font-bold tracking-tight mb-4">Quick Access</h2>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {hrModules.map((module) => (
            <Link href={module.href} key={module.name}>
                <Card className="h-full transition-all hover:shadow-md">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-lg font-medium">{module.name}</CardTitle>
                    <module.icon className="h-6 w-6 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <p className="text-sm text-muted-foreground">{module.description}</p>
                </CardContent>
                </Card>
            </Link>
            ))}
        </div>
      </div>
    </div>
  );
}
