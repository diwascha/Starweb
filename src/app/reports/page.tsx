
'use client';

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { FileText, FileSpreadsheet, Package, PlusCircle } from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '@/hooks/use-auth';

const reportModules = [
    {
        name: 'New QT Reports',
        description: 'Generate a new quality test report for a product.',
        href: '/report/new',
        icon: PlusCircle,
        permission: 'reports',
        action: 'create'
    },
    {
        name: 'QT Reports Database',
        description: 'View, manage, and print all existing test reports.',
        href: '/reports/list',
        icon: FileSpreadsheet,
        permission: 'reports',
        action: 'view'
    },
    {
        name: 'QT Products',
        description: 'Manage the products and their specifications for testing.',
        href: '/products',
        icon: Package,
        permission: 'products',
        action: 'view'
    },
];

export default function ReportDashboardPage() {
   const { hasPermission } = useAuth();

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Test Report Management</h1>
        <p className="text-muted-foreground">Create reports, manage products, and view the report database.</p>
      </header>
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {reportModules.filter(module => hasPermission(module.permission as any, module.action as any)).map((module) => (
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
  );
}
