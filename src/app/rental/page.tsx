'use client';

import { useState, useEffect, useMemo } from 'react';
import { 
  Home, 
  Building2, 
  Users, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  DollarSign, 
  TrendingUp,
  ArrowRight,
  Plus,
  Loader2
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAuth } from '@/hooks/use-auth';
import { onPropertiesUpdate } from '@/services/property-service';
import { onUnitsUpdate } from '@/services/unit-service';
import { onRentalBillsUpdate } from '@/services/rental-billing-service';
import { onAgreementsUpdate } from '@/services/agreement-service';
import type { RentalProperty, RentalUnit, RentalBill, RentalAgreement } from '@/lib/types';
import { cn, toNepaliDate } from '@/lib/utils';
import Link from 'next/link';

export default function RentalDashboardPage() {
  const { user, hasPermission } = useAuth();
  const [properties, setProperties] = useState<RentalProperty[]>([]);
  const [units, setUnits] = useState<RentalUnit[]>([]);
  const [bills, setBills] = useState<RentalBill[]>([]);
  const [agreements, setAgreements] = useState<RentalAgreement[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);
    const unsubs = [
      onPropertiesUpdate(setProperties),
      onUnitsUpdate(setUnits),
      onRentalBillsUpdate(setBills),
      onAgreementsUpdate(setAgreements),
    ];
    setIsLoading(false);
    return () => unsubs.forEach(unsub => unsub());
  }, []);

  const stats = useMemo(() => {
    const occupied = units.filter(u => u.status === 'Occupied').length;
    const vacant = units.filter(u => u.status === 'Vacant').length;
    const unpaidBills = bills.filter(b => b.status === 'Unpaid');
    const totalOutstanding = unpaidBills.reduce((sum, b) => sum + b.amount, 0);
    
    return {
      totalProperties: properties.length,
      totalUnits: units.length,
      occupiedUnits: occupied,
      vacantUnits: vacant,
      monthlyExpected: agreements.reduce((sum, a) => sum + (a.status === 'Active' ? a.monthlyRent : 0), 0),
      collectedThisMonth: bills.filter(b => b.status === 'Paid' && b.billingMonth === new Date().getMonth()).reduce((sum, b) => sum + b.amount, 0),
      outstandingRent: totalOutstanding,
    };
  }, [properties, units, bills, agreements]);

  const upcomingDue = useMemo(() => {
    return bills
      .filter(b => b.status === 'Unpaid')
      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
      .slice(0, 5);
  }, [bills]);

  if (isLoading) return <div className="p-8 text-center"><Loader2 className="animate-spin h-8 w-8 mx-auto text-primary"/></div>;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Rental Dashboard</h1>
          <p className="text-muted-foreground">Operational overview of your rental portfolio.</p>
        </div>
        <div className="flex gap-2">
          {hasPermission('rental', 'create') && (
            <Button asChild size="sm">
              <Link href="/rental/agreements/new">
                <Plus className="mr-2 h-4 w-4" /> New Agreement
              </Link>
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard title="Total Properties" value={stats.totalProperties} icon={Building2} color="blue" />
        <SummaryCard title="Occupancy" value={`${stats.occupiedUnits}/${stats.totalUnits}`} subtitle={`${stats.vacantUnits} Vacant`} icon={Home} color="green" />
        <SummaryCard title="Expected Monthly" value={`Rs.${stats.monthlyExpected.toLocaleString()}`} icon={TrendingUp} color="emerald" />
        <SummaryCard title="Outstanding" value={`Rs.${stats.outstandingRent.toLocaleString()}`} icon={AlertCircle} color="red" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Upcoming & Overdue Rent</CardTitle>
            <CardDescription>Tenants with outstanding balances requiring attention.</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[400px]">
              {upcomingDue.length > 0 ? (
                <div className="space-y-4">
                  {upcomingDue.map(bill => (
                    <div key={bill.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors">
                      <div className="space-y-1">
                        <p className="font-bold">{bill.tenantName}</p>
                        <p className="text-xs text-muted-foreground">{bill.propertyName} • Unit {bill.unitNumber}</p>
                      </div>
                      <div className="text-right space-y-1">
                        <p className="font-bold text-red-600">Rs. {bill.amount.toLocaleString()}</p>
                        <Badge variant="outline" className="text-[10px] uppercase">{bill.type}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex h-full items-center justify-center text-muted-foreground py-20 italic">
                  All clear! No outstanding bills found.
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        <div className="space-y-8">
          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2">
              <Button variant="outline" className="justify-start" asChild>
                <Link href="/rental/properties?tab=units">
                    <Home className="mr-2 h-4 w-4"/> View Vacant Units
                </Link>
              </Button>
              <Button variant="outline" className="justify-start" asChild><Link href="/rental/billing"><DollarSign className="mr-2 h-4 w-4"/> Generate Monthly Rent</Link></Button>
              <Button variant="outline" className="justify-start" asChild><Link href="/rental/payments"><Clock className="mr-2 h-4 w-4"/> Record Tenant Payment</Link></Button>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[200px]">
                <div className="space-y-4">
                  {agreements.slice(0, 5).map(a => (
                    <div key={a.id} className="text-xs flex gap-3">
                      <div className="w-1 h-8 bg-blue-500 rounded-full" />
                      <div>
                        <p className="font-medium">New Agreement Activated</p>
                        <p className="text-muted-foreground">{a.tenantName} @ {a.propertyName}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ title, value, subtitle, icon: Icon, color }: any) {
  const colorMap: any = {
    blue: "border-l-blue-500 bg-blue-50/50",
    green: "border-l-green-500 bg-green-50/50",
    emerald: "border-l-emerald-500 bg-emerald-50/50",
    red: "border-l-red-500 bg-red-50/50"
  };

  return (
    <Card className={cn("border-l-4 shadow-sm", colorMap[color])}>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{title}</p>
            <p className="text-2xl font-black">{value}</p>
            {subtitle && <p className="text-[10px] text-muted-foreground font-medium">{subtitle}</p>}
          </div>
          <Icon className="h-8 w-8 text-muted-foreground opacity-20" />
        </div>
      </CardContent>
    </Card>
  );
}
