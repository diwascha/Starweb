
'use client';

import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Users, Calendar, FileText, Award, Wallet } from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '@/hooks/use-auth';

export default function HRPage() {
    const { hasPermission } = useAuth();

    const modules = [
        {
            name: 'Employees',
            description: 'Manage employee records and wage information.',
            href: '/hr/employees',
            icon: <Users className="h-8 w-8 text-primary" />,
            permission: hasPermission('hr', 'view'),
        },
        {
            name: 'Attendance',
            description: 'Record and track daily employee attendance.',
            href: '/hr/attendance',
            icon: <Calendar className="h-8 w-8 text-primary" />,
            permission: hasPermission('hr', 'view'),
        },
        {
            name: 'Payroll',
            description: 'Generate and manage payroll reports.',
            href: '#',
            icon: <FileText className="h-8 w-8 text-muted-foreground" />,
            permission: hasPermission('hr', 'view'),
            comingSoon: true,
        },
        {
            name: 'Bonus',
            description: 'Calculate and distribute bonuses.',
            href: '#',
            icon: <Award className="h-8 w-8 text-muted-foreground" />,
            permission: hasPermission('hr', 'view'),
            comingSoon: true,
        },
        {
            name: 'Payslip',
            description: 'Generate and view employee payslips.',
            href: '#',
            icon: <Wallet className="h-8 w-8 text-muted-foreground" />,
            permission: hasPermission('hr', 'view'),
            comingSoon: true,
        },
    ];

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">HR Management</h1>
        <p className="text-muted-foreground">Manage employees, attendance, payroll, and more.</p>
      </header>
      
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {modules.filter(m => m.permission).map((module) => (
           <Card 
             key={module.name} 
             className={`hover:shadow-lg transition-shadow ${module.comingSoon ? 'cursor-not-allowed bg-muted/50' : 'cursor-pointer'}`}
           >
            <Link href={module.comingSoon ? '#' : module.href} className={module.comingSoon ? 'pointer-events-none' : ''}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-xl font-medium">{module.name}</CardTitle>
                {module.icon}
              </CardHeader>
              <CardDescription className="p-6 pt-0">
                {module.description}
                {module.comingSoon && <span className="text-xs font-semibold block mt-2 text-primary">(Coming Soon)</span>}
              </CardDescription>
            </Link>
          </Card>
        ))}
      </div>
    </div>
  );
}
