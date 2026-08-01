'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import NepaliDate from 'nepali-date-converter';
import {
  ShoppingCart,
  Truck,
  TrendingUp,
  TrendingDown,
  Minus,
  Clock,
  Calendar as CalendarIcon,
  ChevronRight,
  ChevronDown,
  FileText,
  Briefcase,
  Scale,
  Package,
  MousePointer2,
  AlertCircle
} from 'lucide-react';

import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/use-auth';
import { onPoliciesUpdate } from '@/services/policy-service';
import { onPurchaseOrdersUpdate } from '@/services/purchase-order-service';
import { onEstimatedInvoicesUpdate } from '@/services/estimate-invoice-service';
import { onPageVisitsUpdate } from '@/services/usage-service';
import { onSettingUpdate } from '@/services/settings-service';
import { onChequesUpdate } from '@/services/cheque-service';
import { onTripsUpdate } from '@/services/trip-service';
import { onRentalBillsUpdate } from '@/services/rental-billing-service';
import { onProductsUpdate } from '@/services/product-service';
import { onCostReportsUpdate } from '@/services/cost-report-service';
import { onGsmReportsUpdate } from '@/services/gsm-service';
import { onVehiclesUpdate } from '@/services/vehicle-service';
import { onDriversUpdate } from '@/services/driver-service';
import type {
  PolicyOrMembership,
  PurchaseOrder,
  EstimatedInvoice,
  PageVisit,
  CompanyProfile,
  Cheque,
  Trip,
  RentalBill,
  Product,
  CostReport,
  GsmReport,
  Vehicle,
  Driver
} from '@/lib/types';
import {
  differenceInDays,
  startOfToday,
  format,
  subDays,
  isValid,
} from 'date-fns';
import { cn, toNepaliDate } from '@/lib/utils';
import { DEFAULT_COMPANY_PROFILE } from '@/lib/constants';

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const NUM = new Intl.NumberFormat('en-IN');
const nf = (n: number) => NUM.format(Math.round(n));

function parseDate(value: unknown): Date | null {
  if (!value) return null;
  const anyVal = value as any;
  if (typeof anyVal?.toDate === 'function') {
    const d = anyVal.toDate();
    return isValid(d) ? d : null;
  }
  const d = new Date(anyVal);
  return isValid(d) ? d : null;
}

/* ------------------------------------------------------------------ */
/* Small presentational pieces                                         */
/* ------------------------------------------------------------------ */

function LiveDateTime() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  if (!now) {
    return <Skeleton className="h-[52px] w-full rounded-lg" />;
  }

  return (
    <div className="flex flex-col items-start bg-muted/30 border border-dashed rounded-lg px-3 py-2 shadow-sm w-full">
      <div className="text-xl font-black tabular-nums tracking-tighter leading-none">
        {format(now, 'HH:mm:ss')}
      </div>
      <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-1.5 flex items-center gap-1">
        <CalendarIcon className="h-3 w-3" />
        {toNepaliDate(now.toISOString())} BS
      </div>
    </div>
  );
}

function DeltaBadge({ current, previous }: { current: number; previous: number }) {
  if (previous <= 0) {
    return (
      <span className="text-[10px] font-bold text-muted-foreground uppercase">
        No prior data
      </span>
    );
  }
  const pct = ((current - previous) / previous) * 100;
  const flat = Math.abs(pct) < 0.5;
  const up = pct > 0;
  const Icon = flat ? Minus : up ? TrendingUp : TrendingDown;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-[10px] font-bold tabular-nums',
        flat ? 'text-muted-foreground' : up ? 'text-emerald-600' : 'text-destructive'
      )}
    >
      <Icon className="h-3 w-3" />
      {flat ? '0%' : `${up ? '+' : ''}${pct.toFixed(1)}%`}
      <span className="text-muted-foreground font-medium">vs prev</span>
    </span>
  );
}

function StatCardSkeleton() {
  return (
    <Card className="h-full shadow-sm">
      <CardContent className="p-3 space-y-2">
        <Skeleton className="h-2.5 w-20" />
        <Skeleton className="h-6 w-28" />
        <Skeleton className="h-2.5 w-16" />
      </CardContent>
    </Card>
  );
}

function TileShell({
  href,
  accent,
  wide,
  children,
}: {
  href: string;
  accent: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} className={cn('block h-full', wide && 'col-span-2 sm:col-span-1')}>
      <Card
        className={cn(
          'border-l-[3px] h-full shadow-sm hover:bg-accent transition-colors',
          accent
        )}
      >
        <CardContent className="p-3">{children}</CardContent>
      </Card>
    </Link>
  );
}

function ValueTile({
  href,
  accent,
  label,
  value,
  sub,
  footer,
  icon: Icon,
  iconClass,
}: {
  href: string;
  accent: string;
  label: string;
  value: string;
  sub?: string;
  footer?: React.ReactNode;
  icon: React.ElementType;
  iconClass?: string;
}) {
  return (
    <TileShell href={href} accent={accent}>
      <div className="flex items-start justify-between gap-2">
        <div className="w-full min-w-0 space-y-1">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider truncate">
            {label}
          </p>
          <div className="flex items-baseline gap-1.5 flex-wrap">
            <span className="text-lg font-black tabular-nums leading-none">{value}</span>
            {sub && (
              <span className="text-[10px] text-muted-foreground uppercase font-semibold">
                {sub}
              </span>
            )}
          </div>
          {footer}
        </div>
        <Icon className={cn('h-5 w-5 opacity-20 shrink-0', iconClass)} />
      </div>
    </TileShell>
  );
}

function TripleTile({
  href,
  accent,
  label,
  items,
  icon: Icon,
}: {
  href: string;
  accent: string;
  label: string;
  items: { v: number; l: string; c: string }[];
  icon: React.ElementType;
}) {
  return (
    <TileShell href={href} accent={accent} wide>
      <div className="flex items-start justify-between gap-2">
        <div className="w-full min-w-0 space-y-1">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
            {label}
          </p>
          <div className="grid grid-cols-3 gap-1">
            {items.map((s, i) => (
              <div
                key={s.l}
                className={cn('flex flex-col text-center', i === 1 && 'border-x px-1')}
              >
                <span className={cn('text-base font-bold tabular-nums leading-none', s.c)}>
                  {s.v}
                </span>
                <span className="text-[9px] text-muted-foreground uppercase leading-tight mt-1">
                  {s.l}
                </span>
              </div>
            ))}
          </div>
        </div>
        <Icon className="h-5 w-5 text-muted-foreground opacity-20 shrink-0" />
      </div>
    </TileShell>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function DashboardPage() {
  const { hasPermission } = useAuth();

  const [policies, setPolicies] = useState<PolicyOrMembership[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [invoices, setInvoices] = useState<EstimatedInvoice[]>([]);
  const [pageVisits, setPageVisits] = useState<PageVisit[]>([]);
  const [cheques, setCheques] = useState<Cheque[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [rentalBills, setRentalBills] = useState<RentalBill[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [costReports, setCostReports] = useState<CostReport[]>([]);
  const [gsmReports, setGsmReports] = useState<GsmReport[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [companyProfile, setCompanyProfile] = useState<CompanyProfile>(DEFAULT_COMPANY_PROFILE);

  const [ready, setReady] = useState<Record<string, boolean>>({});
  const markReady = useCallback(
    (key: string) => setReady((r) => (r[key] ? r : { ...r, [key]: true })),
    []
  );

  const revenueLoading = !ready['invoices'] || !ready['trips'] || !ready['rental'];
  const alertsLoading = !ready['policies'] || !ready['cheques'] || !ready['pos'];

  useEffect(() => {
    const wrap =
      <T,>(key: string, setter: (v: T) => void) =>
      (v: T) => {
        setter(v);
        markReady(key);
      };

    const unsubs = [
      onPoliciesUpdate(wrap('policies', setPolicies)),
      onPurchaseOrdersUpdate(wrap('pos', setPurchaseOrders)),
      onEstimatedInvoicesUpdate(wrap('invoices', setInvoices)),
      onPageVisitsUpdate(wrap('visits', setPageVisits)),
      onChequesUpdate(wrap('cheques', setCheques)),
      onTripsUpdate(wrap('trips', setTrips)),
      onRentalBillsUpdate(wrap('rental', setRentalBills)),
      onProductsUpdate(wrap('products', setProducts)),
      onCostReportsUpdate(wrap('costReports', setCostReports)),
      onGsmReportsUpdate(wrap('gsmReports', setGsmReports)),
      onVehiclesUpdate(wrap('vehicles', setVehicles)),
      onDriversUpdate(wrap('drivers', setDrivers)),
      onSettingUpdate('companyProfile', (s: any) => {
        if (s?.value) setCompanyProfile(s.value);
      }),
    ];

    return () => unsubs.forEach((unsub) => unsub?.());
  }, [markReady]);

  const { rangeStart, rangeEnd, prevStart, prevEnd } = useMemo(() => {
    const end = startOfToday();
    const days = 30;
    const start = subDays(end, days - 1);
    const span = days;
    return {
      rangeStart: start,
      rangeEnd: end,
      prevStart: subDays(start, span),
      prevEnd: subDays(start, 1),
    };
  }, []);

  const { stats, urgentActions } = useMemo(() => {
    const today = startOfToday();
    const membersById = new Map();
    vehicles.forEach(v => membersById.set(v.id, { name: v.name, type: 'Vehicle' }));
    drivers.forEach(d => membersById.set(d.id, { name: d.name, type: 'Driver' }));

    const sumRange = (from: Date, to: Date) => {
      let mfg = 0;
      let fleet = 0;
      let rental = 0;
      
      invoices.forEach(inv => {
          const d = parseDate((inv as any).date);
          if (d && d >= from && d <= to) mfg += Number((inv as any).netTotal) || 0;
      });
      trips.forEach(t => {
          const d = parseDate((t as any).date);
          if (d && d >= from && d <= to) fleet += Number((t as any).transport) || 0;
      });
      rentalBills.forEach(b => {
          const d = parseDate((b as any).billDate) ?? parseDate((b as any).date) ?? parseDate((b as any).createdAt);
          if (d && d >= from && d <= to) rental += Number((b as any).amount) || 0;
      });

      return { mfg, fleet, rental, total: mfg + fleet + rental };
    };

    const currentRev = sumRange(rangeStart, rangeEnd);
    const previousRev = sumRange(prevStart, prevEnd);

    const fleetStats = policies.reduce(
      (acc, p) => {
        if (p.status === 'Renewed' || p.status === 'Archived') return acc;
        const end = parseDate((p as any).endDate);
        if (!end) return acc;
        const daysLeft = differenceInDays(end, today);
        if (daysLeft < 0) acc.expired++;
        else if (daysLeft <= 7) acc.comingSoon++;
        else acc.ok++;
        return acc;
      },
      { expired: 0, comingSoon: 0, ok: 0 }
    );

    const chequeStats = cheques.reduce(
      (acc, c) => {
        for (const s of (c as any).splits || []) {
          if (s.status === 'Paid' || s.status === 'Canceled') continue;
          const cd = parseDate(s.chequeDate);
          if (!cd) continue;
          const daysLeft = differenceInDays(cd, today);
          if (daysLeft < 0) acc.overdue++;
          else if (daysLeft <= 7) acc.soon++;
          else acc.notDue++;
        }
        return acc;
      },
      { overdue: 0, soon: 0, notDue: 0 }
    );

    const pendingPOs = purchaseOrders.filter(
      (po) => po.status === 'Ordered' || po.status === 'Amended'
    );

    const totalVisits = pageVisits.reduce((sum, v) => sum + (Number(v.count) || 0), 0);

    const actions: { label: string; count: number; href: string; items?: string[] }[] = [];
    
    if (fleetStats.expired > 0 && hasPermission('fleet', 'read')) {
        const expiredCases = policies
            .filter(p => {
                if (p.status === 'Renewed' || p.status === 'Archived') return false;
                const end = parseDate((p as any).endDate);
                return end && differenceInDays(end, today) < 0;
            })
            .map(p => `${p.type} for ${membersById.get(p.memberId)?.name || 'Member'}`)
            .slice(0, 3);

        actions.push({
            label: 'Renew Expired Fleet Policies',
            count: fleetStats.expired,
            href: '/fleet/policies',
            items: expiredCases
        });
    }

    if (chequeStats.overdue > 0 && hasPermission('finance', 'read')) {
        const overdueCases = cheques.flatMap(c => 
            (c.splits || []).filter(s => {
                if (s.status === 'Paid' || s.status === 'Canceled') return false;
                const cd = parseDate(s.chequeDate);
                return cd && differenceInDays(cd, today) < 0;
            }).map(s => `${c.payeeName} - Due: ${toNepaliDate(s.chequeDate)}`)
        ).slice(0, 3);

        actions.push({
            label: 'Settle Overdue Cheques',
            count: chequeStats.overdue,
            href: '/finance/cheque-generator',
            items: overdueCases
        });
    }

    if (pendingPOs.length > 0 && hasPermission('purchaseOrders', 'read')) {
        const poCases = pendingPOs
            .map(po => {
                const poDate = parseDate(po.poDate);
                const leadTime = poDate ? differenceInDays(today, poDate) : 0;
                return `PO #${po.poNumber} (${po.companyName}) - ${leadTime}d lead`;
            })
            .sort((a, b) => {
                const leadA = parseInt(a.split(' - ')[1]);
                const leadB = parseInt(b.split(' - ')[1]);
                return leadB - leadA;
            })
            .slice(0, 3);

        actions.push({
            label: 'Track Pending Procurement',
            count: pendingPOs.length,
            href: '/purchase-orders/list',
            items: poCases
        });
    }

    const unpaidRentBills = rentalBills.filter((b) => b.status === 'Unpaid');
    if (unpaidRentBills.length > 0 && hasPermission('rental', 'read')) {
        const unpaidCases = unpaidRentBills
            .map(b => `${b.tenantName} - Unit ${b.unitNumber}`)
            .slice(0, 3);

        actions.push({
            label: 'Collect Unpaid Rent',
            count: unpaidRentBills.length,
            href: '/rental/billing',
            items: unpaidCases
        });
    }

    return {
      stats: {
        fleetStats,
        chequeStats,
        openPOs: pendingPOs.length,
        totalVisits,
        revenue: currentRev,
        prevRevenue: previousRev,
        productCount: products.length,
        costReportCount: costReports.length,
        gsmReportCount: gsmReports.length
      },
      urgentActions: actions,
    };
  }, [
    policies,
    purchaseOrders,
    invoices,
    pageVisits,
    cheques,
    trips,
    rentalBills,
    products,
    costReports,
    gsmReports,
    vehicles,
    drivers,
    rangeStart,
    rangeEnd,
    prevStart,
    prevEnd,
    hasPermission,
  ]);

  const canFleet = hasPermission('fleet', 'read');
  const canFinance = hasPermission('finance', 'read');
  const canPO = hasPermission('purchaseOrders', 'read');
  const canCRM = hasPermission('crm', 'read');

  return (
    <div className="flex flex-col gap-6 md:gap-8">
      {/* ---------------- Header ---------------- */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 md:gap-6 border-b pb-4 md:pb-6">
        <div className="space-y-1 min-w-0">
          <h1 className="text-xl md:text-2xl font-black tracking-tighter uppercase leading-tight truncate">
            {companyProfile.nameEn}
          </h1>
          <h2 className="text-base md:text-lg font-bold text-muted-foreground truncate">
            {companyProfile.nameNp}
          </h2>
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.15em] truncate">
            {companyProfile.address}
          </p>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1 w-full md:w-auto md:overflow-visible text-right">
           {hasPermission('fleet', 'create') && (
            <Button
              asChild
              size="sm"
              variant="secondary"
              className="h-10 shrink-0 text-[11px] font-black uppercase tracking-wider px-4 border shadow-sm"
            >
              <Link href="/fleet/trip-sheets/new">
                <Truck className="mr-2 h-4 w-4" /> Sales Entry
              </Link>
            </Button>
          )}
          {hasPermission('finance', 'create') && (
            <Button
              asChild
              size="sm"
              variant="secondary"
              className="h-10 shrink-0 text-[11px] font-black uppercase tracking-wider px-4 border shadow-sm"
            >
              <Link href="/finance/estimate-invoice">
                <FileText className="mr-2 h-4 w-4" /> New Estimate
              </Link>
            </Button>
          )}
          {hasPermission('purchaseOrders', 'create') && (
            <Button
              asChild
              size="sm"
              variant="secondary"
              className="h-10 shrink-0 text-[11px] font-black uppercase tracking-wider px-4 border shadow-sm"
            >
              <Link href="/purchase-orders/new">
                <ShoppingCart className="mr-2 h-4 w-4" /> New PO
              </Link>
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 lg:gap-8 items-start">
        {/* ---------------- Main column ---------------- */}
        <div className="space-y-6 md:space-y-8 min-w-0">
          
          {/* Stat cards grid */}
          <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
            {canFinance &&
              (revenueLoading ? (
                <StatCardSkeleton />
              ) : (
                <ValueTile
                  href="/finance/estimate-invoice"
                  accent="border-l-emerald-600"
                  label={`Revenue · Last 30 Days`}
                  value={`Rs.${nf(stats.revenue.total)}`}
                  icon={TrendingUp}
                  iconClass="text-emerald-600"
                  footer={
                    <DeltaBadge current={stats.revenue.total} previous={stats.prevRevenue.total} />
                  }
                />
              ))}

            {canFleet &&
              (alertsLoading ? (
                <StatCardSkeleton wide />
              ) : (
                <TripleTile
                  href="/fleet/policies"
                  label="Fleet Alerts"
                  icon={Truck}
                  accent={
                    stats.fleetStats.expired > 0
                      ? 'border-l-destructive bg-destructive/5'
                      : stats.fleetStats.comingSoon > 0
                      ? 'border-l-amber-500 bg-amber-50/50'
                      : 'border-l-green-500'
                  }
                  items={[
                    {
                      v: stats.fleetStats.expired,
                      l: 'Expired',
                      c: stats.fleetStats.expired > 0 ? 'text-destructive' : 'text-muted-foreground',
                    },
                    {
                      v: stats.fleetStats.comingSoon,
                      l: 'Soon',
                      c: stats.fleetStats.comingSoon > 0 ? 'text-amber-600' : 'text-muted-foreground',
                    },
                    { v: stats.fleetStats.ok, l: 'OK', c: 'text-green-600' },
                  ]}
                />
              ))}

            {canFinance &&
              (alertsLoading ? (
                <StatCardSkeleton wide />
              ) : (
                <TripleTile
                  href="/finance/cheque-generator"
                  label="Cheque Alerts"
                  icon={Clock}
                  accent={
                    stats.chequeStats.overdue > 0
                      ? 'border-l-destructive bg-destructive/5'
                      : stats.chequeStats.soon > 0
                      ? 'border-l-amber-500 bg-amber-50/50'
                      : 'border-l-blue-500'
                  }
                  items={[
                    {
                      v: stats.chequeStats.overdue,
                      l: 'Overdue',
                      c: stats.chequeStats.overdue > 0 ? 'text-destructive' : 'text-muted-foreground',
                    },
                    {
                      v: stats.chequeStats.soon,
                      l: 'Soon',
                      c: stats.chequeStats.soon > 0 ? 'text-amber-600' : 'text-muted-foreground',
                    },
                    { v: stats.chequeStats.notDue, l: 'Not Due', c: 'text-blue-600' },
                  ]}
                />
              ))}

            {canCRM && (
               <ValueTile
                href="/crm/pack-spec"
                accent="border-l-blue-400"
                label="CRM Catalog"
                value={String(stats.productCount)}
                sub="Products"
                icon={Package}
                iconClass="text-blue-400"
                footer={
                  <p className="text-[10px] font-bold text-muted-foreground uppercase">{stats.costReportCount} Cost Reports</p>
                }
              />
            )}

            {canPO && (
              <ValueTile
                href="/purchase-orders/list"
                accent="border-l-amber-50"
                label="Open Procurement"
                value={String(stats.openPOs)}
                sub="Active Orders"
                icon={ShoppingCart}
                iconClass="text-amber-500"
              />
            )}

            <ValueTile
              href="/settings/system?tab=usage"
              accent="border-l-indigo-400"
              label="System Engagement"
              value={stats.totalVisits.toLocaleString()}
              sub="Views"
              icon={MousePointer2}
              iconClass="text-indigo-400"
            />
          </div>

          {/* Attention Required now spans full width below stats */}
          {alertsLoading ? (
            <Skeleton className="h-16 w-full rounded-xl" />
          ) : (
            urgentActions.length > 0 && (
              <div className="space-y-3">
                <p className="text-[10px] font-black uppercase text-destructive tracking-widest px-1">
                  Attention Required
                </p>
                <div className="flex flex-col gap-3">
                  {urgentActions.map((action) => (
                    <Link href={action.href} key={action.href} className="block">
                      <Card className="border-l-4 border-l-destructive hover:bg-destructive/5 transition-colors shadow-sm h-full">
                        <CardContent className="p-4 flex flex-col justify-between h-full">
                          <div className="space-y-1">
                            <div className="flex items-center justify-between">
                                <p className="text-[10px] font-black text-destructive uppercase">
                                {action.count} Items pending
                                </p>
                                <ChevronRight className="h-4 w-4 text-destructive/50 shrink-0" />
                            </div>
                            <p className="text-sm font-black">{action.label}</p>
                          </div>
                          
                          {action.items && action.items.length > 0 && (
                              <div className="mt-3 pt-3 border-t border-destructive/10 space-y-1.5">
                                  <p className="text-[9px] font-bold text-muted-foreground uppercase">Top cases:</p>
                                  {action.items.map((item, idx) => (
                                      <div key={idx} className="flex items-center gap-2 text-[10px] font-medium text-gray-700">
                                          <div className="w-1 h-1 rounded-full bg-destructive/40" />
                                          <span className="truncate">{item}</span>
                                      </div>
                                  ))}
                                  {action.count > action.items.length && (
                                      <p className="text-[9px] italic text-muted-foreground mt-1">
                                          + {action.count - action.items.length} more cases...
                                      </p>
                                  )}
                              </div>
                          )}
                        </CardContent>
                      </Card>
                    </Link>
                  ))}
                </div>
              </div>
            )
          )}
        </div>

        {/* ---------------- Right rail ---------------- */}
        <div className="space-y-5 w-full">
          <div className="space-y-2">
            <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest px-1">
              Control Tower
            </p>
            <div className="p-4 rounded-xl border bg-card shadow-sm">
              <LiveDateTime />
            </div>
          </div>

          {/* Calendar */}
          <div className="space-y-2">
            <span className="text-[10px] font-black uppercase text-muted-foreground tracking-widest px-1">
                Nepali Calendar
            </span>
            <Card className="overflow-hidden shadow-sm border-none ring-1 ring-black/5 bg-card">
            <CardContent className="p-0 pb-20 flex justify-center">
                <iframe
                src="https://www.hamropatro.com/widgets/calender-small.php"
                width={240}
                height={520}
                style={{ border: 'none', maxWidth: '100%', height: '520px' }}
                scrolling="no"
                loading="lazy"
                title="Nepali Calendar"
                />
            </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
