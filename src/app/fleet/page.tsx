
'use client';

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Truck, Users, ShieldCheck, Star } from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '@/hooks/use-auth';

const fleetModules = [
    {
        name: 'Vehicles',
        description: 'Manage all vehicles in your fleet.',
        href: '/fleet/vehicles',
        icon: Truck,
        permission: 'fleet',
        action: 'view'
    },
    {
        name: 'Drivers',
        description: 'Manage driver records and assignments.',
        href: '/fleet/drivers',
        icon: Users,
        permission: 'fleet',
        action: 'view'
    },
    {
        name: 'Insurance',
        description: 'Track and manage vehicle insurance policies.',
        href: '/fleet/insurance',
        icon: ShieldCheck,
        permission: 'fleet',
        action: 'view'
    },
    {
        name: 'Memberships',
        description: 'Manage memberships and associations.',
        href: '/fleet/memberships',
        icon: Star,
        permission: 'fleet',
        action: 'view'
    },
];

export default function FleetDashboardPage() {
   const { hasPermission } = useAuth();

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Fleet Management</h1>
        <p className="text-muted-foreground">Oversee your vehicles, drivers, and logistical operations.</p>
      </header>
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {fleetModules.filter(module => hasPermission(module.permission as any, module.action as any)).map((module) => (
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
