
'use client';

'use client';

import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import VehiclesClientPage from '../vehicles/_components/vehicles-client-page';
import DriversClientPage from '../drivers/_components/drivers-client-page';
import PoliciesClientPage from '../policies/_components/policies-client-page';

const TABS = ['vehicles', 'drivers', 'policies'] as const;
type TabKey = typeof TABS[number];

/**
 * @fileOverview Consolidated registry for Fleet Vehicles, Drivers, and
 * Policies & Memberships.
 */
function FleetRegistryPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab');
  const activeTab: TabKey = (TABS as readonly string[]).includes(tabParam || '') ? (tabParam as TabKey) : 'vehicles';

  const handleTabChange = (value: string) => {
    router.push(`/fleet/registry?tab=${value}`, { scroll: false });
  };

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Fleet Registry</h1>
        <p className="text-muted-foreground">Centralized management of vehicles, personnel, and compliance records for Sijan Dhuwani Sewa.</p>
      </header>
      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="grid w-full max-w-lg grid-cols-3">
          <TabsTrigger value="vehicles">Vehicles</TabsTrigger>
          <TabsTrigger value="drivers">Drivers</TabsTrigger>
          <TabsTrigger value="policies">Policies & Memberships</TabsTrigger>
        </TabsList>
        <TabsContent value="vehicles" className="mt-6 border-none p-0">
          <VehiclesClientPage
            title="Vehicle Database"
            subtitle="Manage truck registration, specifications, and status."
          />
        </TabsContent>
        <TabsContent value="drivers" className="mt-6 border-none p-0">
          <DriversClientPage
            title="Driver Directory"
            subtitle="Manage driver profiles, licenses, and documentation."
          />
        </TabsContent>
        <TabsContent value="policies" className="mt-6 border-none p-0">
          <PoliciesClientPage
            title="Policies & Memberships"
            subtitle="Tracking vehicle insurance, road tax, and fleet memberships."
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function FleetRegistryPage() {
  return (
    <Suspense fallback={null}>
      <FleetRegistryPageInner />
    </Suspense>
  );
}
