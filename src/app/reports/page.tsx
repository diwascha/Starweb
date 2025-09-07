
import { Suspense } from 'react';
import Link from 'next/link';
import { FileText, FileSpreadsheet, Package, PlusCircle } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { getReports } from '@/services/report-service';
import { getProducts } from '@/services/product-service';
import ReportDashboardClient from './_components/report-dashboard-client';
import { hasPermission } from '@/services/user-service'; // We need a server-side way to check permissions

const reportModules = [
    {
        name: 'New QT Reports',
        description: 'Generate a new quality test report for a product.',
        href: '/report/new',
        icon: PlusCircle,
        permission: 'reports' as const,
        action: 'create' as const,
    },
    {
        name: 'QT Reports Database',
        description: 'View, manage, and print all existing test reports.',
        href: '/reports/list',
        icon: FileSpreadsheet,
        permission: 'reports' as const,
        action: 'view' as const,
    },
    {
        name: 'QT Products',
        description: 'Manage the products and their specifications for testing.',
        href: '/products',
        icon: Package,
        permission: 'products' as const,
        action: 'view' as const,
    },
];

function DashboardSkeleton() {
    return (
        <div className="grid gap-6">
            <div className="grid gap-6 md:grid-cols-2">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Reports Generated</CardTitle>
                        <FileText className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent><Skeleton className="h-8 w-16" /></CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Products Managed</CardTitle>
                        <Package className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent><Skeleton className="h-8 w-16" /></CardContent>
                </Card>
            </div>
            <div className="grid gap-6 md:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle>Test Frequency by Product</CardTitle>
                        <CardDescription>Number of test reports generated per product.</CardDescription>
                    </CardHeader>
                    <CardContent><Skeleton className="h-[300px] w-full" /></CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle>Recent Reports</CardTitle>
                        <CardDescription>The 5 most recently created test reports.</CardDescription>
                    </CardHeader>
                    <CardContent><Skeleton className="h-[300px] w-full" /></CardContent>
                </Card>
            </div>
        </div>
    );
}


export default async function ReportDashboardPage() {
   // Note: Server-side permission check would be ideal here if we had access to the user session.
   // For now, we'll let the client-side auth handling in the sidebar manage visibility.
   const initialReports = await getReports();
   const initialProducts = await getProducts();
  
  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Test Report Management</h1>
        <p className="text-muted-foreground">Create reports, manage products, and view the report database.</p>
      </header>

      <Suspense fallback={<DashboardSkeleton />}>
        <ReportDashboardClient initialReports={initialReports} initialProducts={initialProducts} />
      </Suspense>

      <div>
        <h2 className="text-xl font-bold tracking-tight mb-4">Quick Access</h2>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {/* Filtering modules based on permission should ideally happen where auth state is available.
                The sidebar already does this, so we'll render them all here and rely on the sidebar's auth guard.
                A more robust solution would involve a server-side session check.
            */}
            {reportModules.map((module) => (
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
