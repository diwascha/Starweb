
'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { 
  PlusCircle, 
  ShoppingCart, 
  Calculator, 
  FileText, 
  Receipt, 
  Truck, 
  TrendingUp, 
  Package, 
  ClipboardList,
  MousePointerClick,
  Clock
} from 'lucide-react';

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/use-auth';
import { onPoliciesUpdate } from '@/services/policy-service';
import { onPurchaseOrdersUpdate } from '@/services/purchase-order-service';
import { onEstimatedInvoicesUpdate } from '@/services/estimate-invoice-service';
import { onPageVisitsUpdate } from '@/services/usage-service';
import { onSettingUpdate } from '@/services/settings-service';
import { onChequesUpdate } from '@/services/cheque-service';
import type { PolicyOrMembership, PurchaseOrder, EstimatedInvoice, PageVisit, CompanyProfile, Cheque } from '@/lib/types';
import { differenceInDays, startOfToday, startOfMonth } from 'date-fns';
import { cn } from '@/lib/utils';

const defaultCompanyProfile: CompanyProfile = {
  nameEn: "SHIVAM PACKAGING INDUSTRIES PVT LTD.",
  nameNp: "शिवम प्याकेजिङ्ग इन्डस्ट्रिज प्रा.लि.",
  address: "Hetauda 08, Nepal",
  phone: "N/A",
  email: "N/A",
  pan: "N/A"
};

export default function DashboardPage() {
  const { user, hasPermission } = useAuth();
  const [policies, setPolicies] = useState<PolicyOrMembership[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [invoices, setInvoices] = useState<EstimatedInvoice[]>([]);
  const [pageVisits, setPageVisits] = useState<PageVisit[]>([]);
  const [cheques, setCheques] = useState<Cheque[]>([]);
  const [companyProfile, setCompanyProfile] = useState<CompanyProfile>(defaultCompanyProfile);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);
    const unsubPolicies = onPoliciesUpdate(setPolicies);
    const unsubPOs = onPurchaseOrdersUpdate(setPurchaseOrders);
    const unsubInvoices = onEstimatedInvoicesUpdate(setInvoices);
    const unsubUsage = onPageVisitsUpdate(setPageVisits);
    const unsubCheques = onChequesUpdate(setCheques);
    const unsubProfile = onSettingUpdate('companyProfile', (s) => setCompanyProfile(s?.value || defaultCompanyProfile));

    setIsLoading(false);
    return () => {
      unsubPolicies();
      unsubPOs();
      unsubInvoices();
      unsubUsage();
      unsubCheques();
      unsubProfile();
    };
  }, []);

  const stats = useMemo(() => {
    const today = startOfToday();
    
    // Fleet Alerts Breakdown
    const fleetStats = policies.reduce((acc, p) => {
      if (p.status === 'Renewed' || p.status === 'Archived') return acc;
      
      const daysLeft = differenceInDays(new Date(p.endDate), today);
      
      if (daysLeft < 0) {
        acc.expired++;
      } else if (daysLeft <= 7) {
        acc.comingSoon++;
      } else {
        acc.ok++;
      }
      return acc;
    }, { expired: 0, comingSoon: 0, ok: 0 });

    // Cheque Alerts Breakdown
    const chequeStats = cheques.reduce((acc, c) => {
      c.splits.forEach(s => {
        if (s.status === 'Paid' || s.status === 'Canceled') return;
        const daysLeft = differenceInDays(new Date(s.chequeDate), today);
        if (daysLeft < 0) {
          acc.overdue++;
        } else if (daysLeft <= 7) {
          acc.soon++;
        } else {
          acc.notDue++;
        }
      });
      return acc;
    }, { overdue: 0, soon: 0, notDue: 0 });

    const openPOs = purchaseOrders.filter(po => po.status === 'Ordered' || po.status === 'Amended').length;

    const monthStart = startOfMonth(new Date());
    const mtdRevenue = invoices
      .filter(inv => new Date(inv.date) >= monthStart)
      .reduce((sum, inv) => sum + inv.netTotal, 0);

    const totalVisits = pageVisits.reduce((sum, v) => sum + v.count, 0);

    return { fleetStats, chequeStats, openPOs, mtdRevenue, totalVisits };
  }, [policies, purchaseOrders, invoices, pageVisits, cheques]);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight uppercase">{companyProfile.nameEn}</h1>
          <h2 className="text-lg font-semibold text-muted-foreground">{companyProfile.nameNp}</h2>
          <p className="text-sm text-muted-foreground mt-1">Welcome back, {user?.username} • {companyProfile.address}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {hasPermission('reports', 'create') && (
            <Button asChild size="sm">
              <Link href="/report/new">
                <PlusCircle className="mr-2 h-4 w-4" /> New QT Report
              </Link>
            </Button>
          )}
          {hasPermission('purchaseOrders', 'create') && (
            <Button asChild variant="outline" size="sm">
              <Link href="/purchase-orders/new">
                <ShoppingCart className="mr-2 h-4 w-4" /> New PO
              </Link>
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        <Link href="/fleet/policies" className="block">
          <Card className={cn(
            "border-l-4 hover:bg-accent transition-colors cursor-pointer h-full shadow-sm", 
            stats.fleetStats.expired > 0 ? "border-l-destructive bg-destructive/5" : (stats.fleetStats.comingSoon > 0 ? "border-l-amber-500 bg-amber-50/50" : "border-l-green-500")
          )}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div className="space-y-1 w-full">
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
                <div className="space-y-1 w-full">
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
                        <span className="text-[8px] text-muted-foreground uppercase leading-none">OK</span>
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
                <div className="space-y-1">
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
                <div className="space-y-1">
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
                <div className="space-y-1">
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <ClipboardList className="h-5 w-5" />
            Quick Access Modules
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Link href="/crm/cost-report">
              <Card className="hover:bg-accent transition-colors cursor-pointer h-full border-dashed">
                <CardHeader className="p-4">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Calculator className="h-4 w-4 text-blue-600" />
                    Cost Report Generator
                  </CardTitle>
                  <CardDescription className="text-xs">Advanced board & weight calculations</CardDescription>
                </CardHeader>
              </Card>
            </Link>
            <Link href="/finance/estimate-invoice">
              <Card className="hover:bg-accent transition-colors cursor-pointer h-full border-dashed">
                <CardHeader className="p-4">
                  <CardTitle className="text-base flex items-center gap-2">
                    <FileText className="h-4 w-4 text-purple-600" />
                    Estimate Invoice
                  </CardTitle>
                  <CardDescription className="text-xs">Generate pro-forma VAT documents</CardDescription>
                </CardHeader>
              </Card>
            </Link>
            <Link href="/finance/cheque-generator">
              <Card className="hover:bg-accent transition-colors cursor-pointer h-full border-dashed">
                <CardHeader className="p-4">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Receipt className="h-4 w-4 text-green-600" />
                    Cheque Generator
                  </CardTitle>
                  <CardDescription className="text-xs">Track PDCs and payments</CardDescription>
                </CardHeader>
              </Card>
            </Link>
            <Link href="/crm/pack-spec">
              <Card className="hover:bg-accent transition-colors cursor-pointer h-full border-dashed">
                <CardHeader className="p-4">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Package className="h-4 w-4 text-amber-600" />
                    PackSpec Technical
                  </CardTitle>
                  <CardDescription className="text-xs">Technical specification data sheets</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          </div>
        </div>

        <div className="space-y-4">
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
                frameBorder="0" 
                scrolling="no" 
                marginWidth="0" 
                marginHeight="0" 
                style={{ border: 'none', overflow: 'hidden', width: '295px', height: '385px' }}
                allowtransparency="true">
              </iframe>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
