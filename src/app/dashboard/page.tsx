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
  Calendar as CalendarIcon
} from 'lucide-react';

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/use-auth';
import { onPoliciesUpdate } from '@/services/policy-service';
import { onPurchaseOrdersUpdate } from '@/services/purchase-order-service';
import { onEstimatedInvoicesUpdate } from '@/services/estimate-invoice-service';
import { onPageVisitsUpdate } from '@/services/usage-service';
import { onSettingUpdate } from '@/services/settings-service';
import { onChequesUpdate } from '@/services/cheque-service';
import type { PolicyOrMembership, PurchaseOrder, EstimatedInvoice, PageVisit, CompanyProfile, Cheque, AppBranding } from '@/lib/types';
import { differenceInDays, startOfToday, startOfMonth, format } from 'date-fns';
import { cn, toNepaliDate } from '@/lib/utils';
import { DEFAULT_COMPANY_PROFILE } from '@/lib/constants';

function LiveDateTime() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  if (!now) return null;

  return (
    <div className="flex flex-col items-start bg-muted/30 border border-dashed rounded-lg px-3 py-1.5 shadow-sm w-fit mt-2">
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
  const [companyProfile, setCompanyProfile] = useState<CompanyProfile>(DEFAULT_COMPANY_PROFILE);
  const [appBranding, setAppBranding] = useState<AppBranding>({ appName: 'StarSutra', appMotto: '' });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);
    const unsubs = [
      onPoliciesUpdate(setPolicies),
      onPurchaseOrdersUpdate(setPurchaseOrders),
      onEstimatedInvoicesUpdate(setInvoices),
      onPageVisitsUpdate(setPageVisits),
      onChequesUpdate(setCheques),
      onSettingUpdate('companyProfile', (s) => {
          if (s?.value) setCompanyProfile(s.value);
      }),
      onSettingUpdate('appBranding', (s) => {
        if (s?.value) setAppBranding(s.value);
      })
    ];

    setIsLoading(false);
    return () => unsubs.forEach(unsub => unsub());
  }, []);

  const stats = useMemo(() => {
    const today = startOfToday();
    
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

    return { fleetStats, chequeStats, openPOs, mtdRevenue, totalVisits };
  }, [policies, purchaseOrders, invoices, pageVisits, cheques]);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-6 overflow-hidden text-left">
            <div className="flex flex-col min-w-0 max-w-full">
              <h1 className="text-lg sm:text-xl font-black tracking-tighter uppercase whitespace-nowrap overflow-hidden text-ellipsis">
                {companyProfile.nameEn}
              </h1>
              <h2 className="text-base font-bold text-muted-foreground truncate">{companyProfile.nameNp}</h2>
              <div className="mt-1">
                <p className="text-[10px] font-bold text-muted-foreground uppercase truncate">{companyProfile.address}</p>
                <p className="text-[11px] text-muted-foreground">Welcome back, {user?.username}</p>
                <LiveDateTime />
              </div>
            </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1.5 pb-2 md:pb-0">
          {hasPermission('fleet', 'create') && (
            <Button asChild size="sm" variant="secondary" className="h-7 text-[10px] px-3 font-bold uppercase tracking-wider">
              <Link href="/fleet/transactions/expenses/new">
                <Wallet className="mr-1.5 h-3 w-3" /> Sijan-Exp. Entry
              </Link>
            </Button>
          )}
          {hasPermission('fleet', 'create') && (
            <Button asChild size="sm" variant="secondary" className="h-7 text-[10px] px-3 font-bold uppercase tracking-wider">
              <Link href="/fleet/transactions/payment-receipt/new">
                <ArrowRightLeft className="mr-1.5 h-3 w-3" /> Sijan- Pmt / Rcd. Entry
              </Link>
            </Button>
          )}
          {hasPermission('purchaseOrders', 'create') && (
            <Button asChild size="sm" variant="secondary" className="h-7 text-[10px] px-3 font-bold uppercase tracking-wider">
              <Link href="/purchase-orders/new">
                <ShoppingCart className="mr-1.5 h-3 w-3" /> New Purchase Order
              </Link>
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 items-start">
        <div className="xl:col-span-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 h-fit">
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

          <Link href="/purchase-orders/list" className="block">
            <Card className="border-l-4 border-l-amber-500 hover:bg-accent transition-colors cursor-pointer h-full shadow-sm">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-1 text-left">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Open Orders</p>
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-bold">{stats.openPOs}</span>
                      <span className="text-[10px] text-muted-foreground uppercase font-semibold">Pending POs</span>
                    </div>
                  </div>
                  <ShoppingCart className="h-6 w-6 text-amber-500 opacity-20" />
                </div>
              </CardContent>
            </Card>
          </Link>

          <Link href="/finance/estimate-invoice" className="block">
            <Card className="border-l-4 border-l-green-600 hover:bg-accent transition-colors cursor-pointer h-full shadow-sm">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-1 text-left">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">MTD Revenue Est.</p>
                    <div className="flex items-baseline gap-2">
                      <span className="text-xl font-bold">Rs.{stats.mtdRevenue.toLocaleString()}</span>
                    </div>
                  </div>
                  <TrendingUp className="h-6 w-6 text-green-600 opacity-20" />
                </div>
              </CardContent>
            </Card>
          </Link>

          <Link href="/settings" className="block">
            <Card className="border-l-4 border-l-purple-500 hover:bg-accent transition-colors cursor-pointer h-full shadow-sm">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-1 text-left">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">System Traffic</p>
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-bold">{stats.totalVisits.toLocaleString()}</span>
                      <span className="text-[10px] text-muted-foreground uppercase font-semibold">Visits</span>
                    </div>
                  </div>
                  <MousePointerClick className="h-6 w-6 text-purple-500 opacity-20" />
                </div>
              </CardContent>
            </Card>
          </Link>
        </div>

        <div className="xl:col-span-1">
          <Card className="overflow-hidden shadow-md">
            <CardHeader className="p-4 bg-muted/50 border-b">
              <CardTitle className="text-sm font-bold uppercase tracking-wider flex items-center justify-between">
                Nepali Calendar
                <Badge variant="outline" className="bg-background">Today</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 flex justify-center bg-white">
              <iframe 
                src="https://www.hamropatro.com/widgets/calender-medium.php" 
                style={{ border: 'none', overflow: 'hidden', width: 295, height: 385 }}
                scrolling="no" 
                title="Nepali Calendar">
              </iframe>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
