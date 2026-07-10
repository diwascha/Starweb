'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { 
    Users, 
    Calendar, 
    FileText, 
    Award, 
    Wallet, 
    BarChart2, 
    CalendarCheck,
    Settings2,
    HardDrive,
    Calculator
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import HrDashboardClient from './_components/hr-dashboard-client';
import { Separator } from '@/components/ui/separator';

const hrModules = [
    { name: 'Employees', description: 'Manage employee records and wage information.', href: '/hr/employees', icon: Users },
    { name: 'Machine Logs', description: 'Direct raw data dump from attendance machines.', href: '/hr/attendance/raw', icon: HardDrive },
    { name: 'Attendance Registry', description: 'Validated work-hour records and metrics.', href: '/hr/attendance', icon: Calendar },
    { name: 'Operations & Logic', description: 'Configure rules, shifts, holidays, and leaves.', href: '/hr/office', icon: Settings2 },
    { name: 'Workforce Ledger', description: 'Consolidated Payroll, Bonus, and Analytics.', href: '/hr/payroll', icon: FileText },
];

function DashboardSkeleton() {
    return (
        <div className="grid gap-6">
            <div className="grid gap-6 md:grid-cols-3">
                 <Card><CardHeader><Skeleton className="h-4 w-3/4" /></CardHeader><CardContent><Skeleton className="h-8 w-1/2" /></CardContent></Card>
                 <Card><CardHeader><Skeleton className="h-4 w-3/4" /></CardHeader><CardContent><Skeleton className="h-8 w-1/2" /></CardContent></Card>
                 <Card><CardHeader><Skeleton className="h-4 w-3/4" /></CardHeader><CardContent><Skeleton className="h-8 w-1/2" /></CardContent></Card>
            </div>
             <Card><CardHeader><Skeleton className="h-6 w-3/4 mb-2" /><Skeleton className="h-4 w-1/2" /></CardHeader><CardContent><Skeleton className="h-[300px] w-full" /></CardContent></Card>
        </div>
    );
}

export default function HRPage() {
    return (
        <div className="flex flex-col gap-8">
            <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black tracking-tighter text-gray-900 uppercase">HR Intelligence</h1>
                    <p className="text-muted-foreground text-sm font-medium">Workforce management and operational overview.</p>
                </div>
            </header>

            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2">
                <Suspense fallback={<DashboardSkeleton />}>
                    <HrDashboardClient initialEmployees={[]} initialAttendance={[]} />
                </Suspense>

                <Separator className="border-dashed" />

                <div>
                    <h2 className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground mb-4 px-1">Operational Modules</h2>
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                        {hrModules.map((module) => (
                            <Link href={module.href} key={module.name}>
                                <Card className="h-full transition-all hover:shadow-lg border-none ring-1 ring-black/5 bg-white group">
                                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                        <CardTitle className="text-sm font-black uppercase tracking-wider text-gray-900 group-hover:text-primary transition-colors">{module.name}</CardTitle>
                                        <module.icon className="h-5 w-5 text-muted-foreground group-hover:scale-110 transition-transform" />
                                    </CardHeader>
                                    <CardContent>
                                        <p className="text-[10px] text-muted-foreground font-medium leading-relaxed uppercase">{module.description}</p>
                                    </CardContent>
                                </Card>
                            </Link>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
