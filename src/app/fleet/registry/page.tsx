
'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import VehiclesClientPage from '../vehicles/_components/vehicles-client-page';
import DriversClientPage from '../drivers/_components/drivers-client-page';

/**
 * @fileOverview Consolidated registry for Fleet Vehicles and Drivers.
 */
export default function FleetRegistryPage() {
  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Fleet Registry</h1>
        <p className="text-muted-foreground">Centralized management of vehicles and personnel for Sijan Dhuwani Sewa.</p>
      </header>
      <Tabs defaultValue="vehicles" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="vehicles">Vehicles</TabsTrigger>
          <TabsTrigger value="drivers">Drivers</TabsTrigger>
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
      </Tabs>
    </div>
  );
}
