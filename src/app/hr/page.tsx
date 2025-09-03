
'use client';

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Users, Calendar, FileText, Award, Wallet } from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '@/hooks/use-auth';

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

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">HR Management</h1>
        <p className="text-muted-foreground">Manage employees, attendance, and payroll.</p>
      </header>
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
  );
}
