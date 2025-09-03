
'use client';

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { ShoppingCart, Wrench } from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '@/hooks/use-auth';

const poModules = [
    {
        name: 'Purchase Orders',
        description: 'Create, view, and manage all purchase orders.',
        href: '/purchase-orders/list',
        icon: ShoppingCart,
        permission: 'purchaseOrders',
        action: 'view'
    },
    {
        name: 'Raw Materials',
        description: 'Manage the raw materials used in purchase orders.',
        href: '/raw-materials',
        icon: Wrench,
        permission: 'rawMaterials',
        action: 'view'
    },
];

export default function PurchaseOrderDashboardPage() {
   const { hasPermission } = useAuth();

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Purchase Order Management</h1>
        <p className="text-muted-foreground">Manage purchase orders and their raw materials.</p>
      </header>
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {poModules.filter(module => hasPermission(module.permission as any, module.action as any)).map((module) => (
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
