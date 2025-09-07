
import { Suspense } from 'react';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Users, Calendar, FileText, Award, Wallet, CheckCircle, XCircle } from 'lucide-react';
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
        name: 'Payroll',
        description: 'Generate and manage payroll reports.',
        href: '#',
        icon: FileText,
        permission: 'hr' as const,
        action: 'view' as const,
        comingSoon: true
    },
    {
        name: 'Bonus',
        description: 'Calculate and track employee bonuses.',
        href: '#',
        icon: Award,
        permission: 'hr' as const,
        action: 'view' as const,
        comingSoon: true
    },
    {
        name: 'Payslip',
        description: 'Generate and distribute employee payslips.',
        href: '#',
        icon: Wallet,
        permission: 'hr' as const,
        action: 'view' as const,
        comingSoon: true
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
   const initialEmployees = await getEmployees();
   const initialAttendance = await getAttendance();
  
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
