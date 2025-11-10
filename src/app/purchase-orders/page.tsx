import { Suspense } from 'react';
import Link from 'next/link';
import { ShoppingCart, Wrench } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import PurchaseOrderDashboardClient from './_components/purchase-order-dashboard-client';


const poModules = [
    {
        name: 'Purchase Orders',
        description: 'Create, view, and manage all purchase orders.',
        href: '/purchase-orders/list',
        icon: ShoppingCart,
        permission: 'purchaseOrders' as const,
        action: 'view' as const,
    },
    {
        name: 'Raw Materials',
        description: 'Manage the raw materials used in purchase orders.',
        href: '/raw-materials',
        icon: Wrench,
        permission: 'rawMaterials' as const,
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
             <div className="grid gap-6 md:grid-cols-2">
                <Card><CardHeader><Skeleton className="h-6 w-3/4 mb-2" /><Skeleton className="h-4 w-1/2" /></CardHeader><CardContent><Skeleton className="h-[300px] w-full" /></CardContent></Card>
                <Card><CardHeader><Skeleton className="h-6 w-3/a mb-2" /><Skeleton className="h-4 w-1/2" /></CardHeader><CardContent><Skeleton className="h-[300px] w-full" /></CardContent></Card>
            </div>
             <Card><CardHeader><Skeleton className="h-6 w-3/4 mb-2" /><Skeleton className="h-4 w-1/2" /></CardHeader><CardContent><Skeleton className="h-[300px] w-full" /></CardContent></Card>
        </div>
    );
}


export default function PurchaseOrderDashboardPage() {
  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Purchase Order Management</h1>
        <p className="text-muted-foreground">An overview of your procurement activities and raw materials.</p>
      </header>

      <Suspense fallback={<DashboardSkeleton />}>
        <PurchaseOrderDashboardClient initialPurchaseOrders={[]} initialRawMaterials={[]} />
      </Suspense>

      <div>
        <h2 className="text-xl font-bold tracking-tight mb-4">Quick Access</h2>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {poModules.map((module) => (
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
