
'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { 
  ShoppingCart, 
  Truck, 
  TrendingUp, 
  MousePointerClick,
  Clock,
  ArrowRightLeft,
  Wallet,
  Calendar as CalendarIcon,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  ArrowUpRight,
  FileText,
  Receipt
} from 'lucide-react';

import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/hooks/use-auth';
import { onPoliciesUpdate } from '@/services/policy-service';
import { onPurchaseOrdersUpdate } from '@/services/purchase-order-service';
import { onEstimatedInvoicesUpdate } from '@/services/estimate-invoice-service';
import { onPageVisitsUpdate } from '@/services/usage-service';
import { onSettingUpdate } from '@/services/settings-service';
import { onChequesUpdate } from '@/services/cheque-service';
import { onTripsUpdate } from '@/services/trip-service';
import { onRentalBillsUpdate } from '@/services/rental-billing-service';
import type { 
    PolicyOrMembership, 
    PurchaseOrder, 
    EstimatedInvoice, 
    PageVisit, 
    CompanyProfile, 
    Cheque, 
    Trip, 
    RentalBill 
} from '@/lib/types';
import { 
    differenceInDays, 
    startOfToday, 
    startOfMonth, 
    format, 
    subDays, 
    isWithinInterval, 
    eachDayOfInterval 
} from 'date-fns';
import { cn, toNepaliDate } from '@/lib/utils';
import { DEFAULT_COMPANY_PROFILE } from '@/lib/constants';
import { 
    AreaChart, 
    Area, 
    XAxis, 
    YAxis, 
    CartesianGrid, 
    Tooltip, 
    ResponsiveContainer 
} from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';

function LiveDateTime() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  if (!now) return null;

  return (
    <div className="flex flex-col items-start bg-muted/30 border border-dashed rounded-lg px-3 py-1.5 shadow-sm w-full">
        <div className="text-lg font-black tabular-nums tracking-tighter text-black leading-none">
            {format(now, 'HH:mm:ss')}
        </div>
        <div className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mt-1 flex items-center gap-1">
            <CalendarIcon className="h-2.5 w-2.5" />
            {toNepaliDate(now.toISOString())} BS
        </div>
    </div>
  );
}

export default function DashboardPage() {
  const { user, hasPermission } = useAuth();
  const [policies, setPolicies] = useState<PolicyOrMembership[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [invoices, setInvoices] = useState<EstimatedInvoice[]>([]);
  const [pageVisits, setPageVisits] = useState<PageVisit[]>([]);
  const [cheques, setCheques] = useState<Cheque[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [rentalBills, setRentalBills] = useState<RentalBill[]>([]);
  const [companyProfile, setCompanyProfile] = useState<CompanyProfile>(DEFAULT_COMPANY_PROFILE);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);
    const unsubs = [
      onPoliciesUpdate(setPolicies),
      onPurchaseOrdersUpdate(setPurchaseOrders),
      onEstimatedInvoicesUpdate(setInvoices),
      onPageVisitsUpdate(setPageVisits),
      onChequesUpdate(setCheques),
      onTripsUpdate(setTrips),
      onRentalBillsUpdate(setRentalBills),
      onSettingUpdate('companyProfile', (s) => {
          if (s?.value) setCompanyProfile(s.value);
      })
    ];

    setIsLoading(false);
    return () => unsubs.forEach(unsub => unsub());
  }, []);

  const { stats, chartData, urgentActions } = useMemo(() => {
    const today = startOfToday();
    
    // --- 1. Stats Calculation ---
    const fleetStats = policies.reduce((acc, p) => {
      if (p.status === 'Renewed' || p.status === 'Archived') return acc;
      const daysLeft = differenceInDays(new Date(p.endDate), today);
      if (daysLeft < 0) acc.expired++;
      else if (daysLeft <= 7) acc.comingSoon++;
      else acc.ok++;
      return acc;
    }, { expired: 0, comingSoon: 0, ok: 0 });

    const chequeStats = cheques.reduce((acc, c) => {
      (c.splits || []).forEach(s => {
        if (s.status === 'Paid' || s.status === 'Canceled') return;
        const daysLeft = differenceInDays(new Date(s.chequeDate), today);
        if (daysLeft < 0) acc.overdue++;
        else if (daysLeft <= 7) acc.soon++;
        else acc.notDue++;
      });
      return acc;
    }, { overdue: 0, soon: 0, notDue: 0 });

    const openPOs = purchaseOrders.filter(po => po.status === 'Ordered' || po.status === 'Amended').length;

    const monthStart = startOfMonth(new Date());
    const mtdRevenue = invoices
      .filter(inv => new Date(inv.date) >= monthStart)
      .reduce((sum, inv) => sum + (Number(inv.netTotal) || 0), 0);

    const totalVisits = pageVisits.reduce((sum, v) => sum + (Number(v.count) || 0), 0);

    // --- 2. Chart Data Generation (Last 30 Days) ---
    const last30Days = eachDayOfInterval({ start: subDays(today, 29), end: today });
    const trendData = last30Days.map(date => {
        const dateStr = format(date, 'yyyy-MM-dd');
        
        // Sum from Manufacturing
        const mfgRev = invoices
            .filter(inv => format(new Date(inv.date), 'yyyy-MM-dd') === dateStr)
            .reduce((sum, inv) => sum + (Number(inv.netTotal) || 0), 0);
            
        // Sum from Fleet (Trips)
        const fleetRev = trips
            .filter(t => format(new Date(t.date), 'yyyy-MM-dd') === dateStr)
            .reduce((sum, t) => sum + (Number(t.transport) || 0), 0);
            
        // Sum from Rental (Bills - status Unpaid or Paid)
        const rentalRev = rentalBills
            .filter(b => format(new Date(b.createdAt), 'yyyy-MM-dd') === dateStr)
            .reduce((sum, b) => sum + (Number(b.amount) || 0), 0);

        return {
            name: format(date, 'MMM dd'),
            dateBS: toNepaliDate(date.toISOString()),
            revenue: mfgRev + fleetRev + rentalRev,
            Manufacturing: mfgRev,
            Fleet: fleetRev,
            Rental: rentalRev
        };
    });

    // --- 3. Urgent Actions ---
    const actions = [];
    if (fleetStats.expired > 0) actions.push({ label: 'Renew Expired Fleet Policies', type: 'fleet', count: fleetStats.expired, href: '/fleet/policies' });
    if (chequeStats.overdue > 0) actions.push({ label: 'Settle Overdue Cheques', type: 'finance', count: chequeStats.overdue, href: '/finance/cheque-generator' });
    
    const unpaidRentCount = rentalBills.filter(b => b.status === 'Unpaid').length;
    if (unpaidRentCount > 0) actions.push({ label: 'Collect Unpaid Rent', type: 'rental', count: unpaidRentCount, href: '/rental/billing' });

    return { 
        stats: { fleetStats, chequeStats, openPOs, mtdRevenue, totalVisits }, 
        chartData: trendData,
        urgentActions: actions
    };
  }, [policies, purchaseOrders, invoices, pageVisits, cheques, trips, rentalBills]);

  const chartConfig = {
    revenue: { label: 'Total Revenue', color: 'hsl(var(--primary))' },
    Manufacturing: { label: 'Manufacturing', color: 'hsl(var(--chart-1))' },
    Fleet: { label: 'Fleet', color: 'hsl(var(--chart-2))' },
    Rental: { label: 'Rental', color: 'hsl(var(--chart-3))' }
  };

  return (
    <div className="flex flex-col gap-8">
      {/* Top Section: Company Branding & Quick Actions */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 border-b pb-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-black tracking-tighter uppercase text-gray-900 leading-tight">
            {companyProfile.nameEn}
          </h1>
          <h2 className="text-lg font-bold text-muted-foreground">{companyProfile.nameNp}</h2>
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em]">{companyProfile.address}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {hasPermission('fleet', 'create') && (
            <Button asChild size="sm" variant="secondary" className="h-9 text-[10px] font-black uppercase tracking-widest px-4 border shadow-sm">
              <Link href="/fleet/trip-sheets/new">
                <Truck className="mr-2 h-3.5 w-3.5" /> Sales Entry
              </Link>
            </Button>
          )}
          {hasPermission('finance', 'create') && (
            <Button asChild size="sm" variant="secondary" className="h-9 text-[10px] font-black uppercase tracking-widest px-4 border shadow-sm">
              <Link href="/finance/estimate-invoice">
                <FileText className="mr-2 h-3.5 w-3.5" /> New Estimate
              </Link>
            </Button>
          )}
          {hasPermission('purchaseOrders', 'create') && (
            <Button asChild size="sm" variant="secondary" className="h-9 text-[10px] font-black uppercase tracking-widest px-4 border shadow-sm">
              <Link href="/purchase-orders/new">
                <ShoppingCart className="mr-2 h-3.5 w-3.5" /> New PO
              </Link>
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-8 items-start">
        {/* Left Column: Clock & Calendar */}
        <div className="space-y-6">
          <div className="space-y-2">
            <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest px-1">Control Tower</p>
            <div className="p-4 rounded-xl border bg-white shadow-sm">
                <LiveDateTime />
            </div>
          </div>

          {urgentActions.length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] font-black uppercase text-destructive tracking-widest px-1">Attention Required</p>
                <div className="space-y-2">
                    {urgentActions.map((action, i) => (
                        <Link href={action.href} key={i}>
                            <Card className="border-l-4 border-l-destructive hover:bg-destructive/5 transition-colors cursor-pointer shadow-sm">
                                <CardContent className="p-3 flex items-center justify-between">
                                    <div className="space-y-0.5">
                                        <p className="text-[10px] font-black text-destructive uppercase">{action.count} Items</p>
                                        <p className="text-xs font-bold text-gray-900">{action.label}</p>
                                    </div>
                                    <ChevronRight className="h-4 w-4 text-destructive/50" />
                                </CardContent>
                            </Card>
                        </Link>
                    ))}
                </div>
              </div>
          )}

          <div className="space-y-2">
            <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest px-1">Nepali Calendar</p>
            <Card className="overflow-hidden shadow-sm border-none ring-1 ring-black/5 bg-white">
              <CardContent className="p-0 flex justify-center">
                <iframe 
                  src="https://www.hamropatro.com/widgets/calender-small.php" 
                  style={{ border: 'none', overflow: 'hidden', width: '100%', height: 290 }}
                  scrolling="no" 
                  title="Nepali Calendar">
                </iframe>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Right Column: Statistics Grid & Chart */}
        <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            <Link href="/fleet/policies" className="block">
                <Card className={cn(
                "border-l-4 hover:bg-accent transition-colors cursor-pointer h-full shadow-sm", 
                stats.fleetStats.expired > 0 ? "border-l-destructive bg-destructive/5" : (stats.fleetStats.comingSoon > 0 ? "border-l-amber-500 bg-amber-50/50" : "border-l-green-500")
                )}>
                <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                    <div className="space-y-1 w-full text-left">
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Fleet Alerts</p>
                        <div className="grid grid-cols-3 gap-1 mt-2">
                        <div className="flex flex-col text-center">
                            <span className={cn("text-lg font-bold", stats.fleetStats.expired > 0 ? "text-destructive" : "text-muted-foreground")}>{stats.fleetStats.expired}</span>
                            <span className="text-[8px] text-muted-foreground uppercase leading-none">Expired</span>
                        </div>
                        <div className="flex flex-col text-center border-x px-1">
                            <span className={cn("text-lg font-bold", stats.fleetStats.comingSoon > 0 ? "text-amber-600" : "text-muted-foreground")}>{stats.fleetStats.comingSoon}</span>
                            <span className="text-[8px] text-muted-foreground uppercase leading-none">Soon</span>
                        </div>
                        <div className="flex flex-col text-center pl-1">
                            <span className="text-lg font-bold text-green-600">{stats.fleetStats.ok}</span>
                            <span className="text-[8px] text-muted-foreground uppercase leading-none">OK</span>
                        </div>
                        </div>
                    </div>
                    <Truck className="h-6 w-6 text-muted-foreground opacity-20" />
                    </div>
                </CardContent>
                </Card>
            </Link>

            <Link href="/finance/cheque-generator" className="block">
                <Card className={cn(
                "border-l-4 hover:bg-accent transition-colors cursor-pointer h-full shadow-sm", 
                stats.chequeStats.overdue > 0 ? "border-l-destructive bg-destructive/5" : (stats.chequeStats.soon > 0 ? "border-l-amber-500 bg-amber-50/50" : "border-l-blue-500")
                )}>
                <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                    <div className="space-y-1 w-full text-left">
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Cheque Alerts</p>
                        <div className="grid grid-cols-3 gap-1 mt-2">
                        <div className="flex flex-col text-center">
                            <span className={cn("text-lg font-bold", stats.chequeStats.overdue > 0 ? "text-destructive" : "text-muted-foreground")}>{stats.chequeStats.overdue}</span>
                            <span className="text-[8px] text-muted-foreground uppercase leading-none">Overdue</span>
                        </div>
                        <div className="flex flex-col text-center border-x px-1">
                            <span className={cn("text-lg font-bold", stats.chequeStats.soon > 0 ? "text-amber-600" : "text-muted-foreground")}>{stats.chequeStats.soon}</span>
                            <span className="text-[8px] text-muted-foreground uppercase leading-none">Soon</span>
                        </div>
                        <div className="flex flex-col text-center pl-1">
                            <span className="text-lg font-bold text-blue-600">{stats.chequeStats.notDue}</span>
                            <span className="text-[8px] text-muted-foreground uppercase leading-none">Not Due</span>
                        </div>
                        </div>
                    </div>
                    <Clock className="h-6 w-6 text-muted-foreground opacity-20" />
                    </div>
                </CardContent>
                </Card>
            </Link>

            <Link href="/finance/estimate-invoice" className="block">
                <Card className="border-l-4 border-l-emerald-600 hover:bg-accent transition-colors cursor-pointer h-full shadow-sm">
                <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                    <div className="space-y-1 text-left">
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">MTD Revenue Pulse</p>
                        <div className="flex items-baseline gap-2">
                        <span className="text-xl font-black">Rs.{stats.mtdRevenue.toLocaleString()}</span>
                        <ArrowUpRight className="h-3 w-3 text-emerald-600" />
                        </div>
                    </div>
                    <TrendingUp className="h-6 w-6 text-emerald-600 opacity-20" />
                    </div>
                </CardContent>
                </Card>
            </Link>
            </div>

            <Card className="shadow-lg border-gray-100 bg-white overflow-hidden">
                <CardHeader className="bg-primary/5 border-b py-4 px-6 flex flex-row items-center justify-between">
                    <div>
                        <CardTitle className="text-sm font-black uppercase tracking-tight">Revenue Pulse (Last 30 Days)</CardTitle>
                        <CardDescription className="text-[10px] uppercase font-bold text-muted-foreground">Aggregated daily income across all functional units.</CardDescription>
                    </div>
                    <div className="flex gap-4">
                        {['Manufacturing', 'Fleet', 'Rental'].map(source => (
                            <div key={source} className="flex items-center gap-1.5">
                                <div className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: (chartConfig as any)[source].color }} />
                                <span className="text-[9px] font-black uppercase text-muted-foreground tracking-tighter">{source}</span>
                            </div>
                        ))}
                    </div>
                </CardHeader>
                <CardContent className="p-6">
                    <div className="h-[350px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.1}/>
                                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                                    </linearGradient>
                                </defs>
                                <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--muted))" />
                                <XAxis 
                                    dataKey="name" 
                                    axisLine={false} 
                                    tickLine={false} 
                                    tick={{ fontSize: 9, fontWeight: 700 }} 
                                    dy={10}
                                />
                                <YAxis 
                                    axisLine={false} 
                                    tickLine={false} 
                                    tick={{ fontSize: 9, fontWeight: 700 }} 
                                    tickFormatter={(v) => `Rs.${v / 1000}k`}
                                />
                                <Tooltip 
                                    content={<ChartTooltipContent className="bg-white/95 backdrop-blur shadow-xl border-none ring-1 ring-black/5" />} 
                                />
                                <Area 
                                    type="monotone" 
                                    dataKey="revenue" 
                                    stroke="hsl(var(--primary))" 
                                    strokeWidth={3}
                                    fillOpacity={1} 
                                    fill="url(#colorRevenue)" 
                                />
                                <Area type="monotone" dataKey="Manufacturing" stackId="1" stroke={chartConfig.Manufacturing.color} fill={chartConfig.Manufacturing.color} fillOpacity={0.4} />
                                <Area type="monotone" dataKey="Fleet" stackId="1" stroke={chartConfig.Fleet.color} fill={chartConfig.Fleet.color} fillOpacity={0.4} />
                                <Area type="monotone" dataKey="Rental" stackId="1" stroke={chartConfig.Rental.color} fill={chartConfig.Rental.color} fillOpacity={0.4} />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 <Link href="/purchase-orders/list" className="block">
                    <Card className="border-l-4 border-l-amber-500 hover:bg-accent transition-colors cursor-pointer h-full shadow-sm">
                        <CardContent className="pt-6">
                            <div className="flex items-center justify-between">
                            <div className="space-y-1 text-left">
                                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Open Procurement</p>
                                <div className="flex items-baseline gap-2">
                                <span className="text-2xl font-bold">{stats.openPOs}</span>
                                <span className="text-[10px] text-muted-foreground uppercase font-semibold">Active Orders</span>
                                </div>
                            </div>
                            <ShoppingCart className="h-6 w-6 text-amber-500 opacity-20" />
                            </div>
                        </CardContent>
                    </Card>
                </Link>

                <Link href="/settings/system" className="block">
                    <Card className="border-l-4 border-l-purple-500 hover:bg-accent transition-colors cursor-pointer h-full shadow-sm">
                        <CardContent className="pt-6">
                            <div className="flex items-center justify-between">
                            <div className="space-y-1 text-left">
                                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">System Visibility</p>
                                <div className="flex items-baseline gap-2">
                                <span className="text-2xl font-bold">{stats.totalVisits.toLocaleString()}</span>
                                <span className="text-[10px] text-muted-foreground uppercase font-semibold">Total Views</span>
                                </div>
                            </div>
                            <MousePointerClick className="h-6 w-6 text-purple-500 opacity-20" />
                            </div>
                        </CardContent>
                    </Card>
                </Link>
            </div>
        </div>
      </div>
    </div>
  );
}
