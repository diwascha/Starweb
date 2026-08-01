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
  MousePointerClick,
  Clock,
  Calendar as CalendarIcon,
  ChevronRight,
  ChevronDown,
  FileText,
  Layers,
  LineChart as LineChartIcon,
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
import type {
  PolicyOrMembership,
  PurchaseOrder,
  EstimatedInvoice,
  PageVisit,
  CompanyProfile,
  Cheque,
  Trip,
  RentalBill,
} from '@/lib/types';
import {
  differenceInDays,
  startOfToday,
  startOfMonth,
  format,
  subDays,
  eachDayOfInterval,
  isValid,
} from 'date-fns';
import { cn, toNepaliDate } from '@/lib/utils';
import { DEFAULT_COMPANY_PROFILE } from '@/lib/constants';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
} from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const NUM = new Intl.NumberFormat('en-IN');
const nf = (n: number) => NUM.format(Math.round(n));

/** Safe date parse: returns null instead of an Invalid Date. */
function parseDate(value: unknown): Date | null {
  if (!value) return null;
  // Firestore Timestamp support
  const anyVal = value as any;
  if (typeof anyVal?.toDate === 'function') {
    const d = anyVal.toDate();
    return isValid(d) ? d : null;
  }
  const d = new Date(anyVal);
  return isValid(d) ? d : null;
}

const dayKey = (d: Date) => format(d, 'yyyy-MM-dd');

/** First day of the current Bikram Sambat month, as a JS Date. */
function startOfBsMonth(ref: Date): Date {
  try {
    const nd = new NepaliDate(ref);
    const first = new NepaliDate(nd.getYear(), nd.getMonth(), 1);
    const js = first.toJsDate();
    return isValid(js) ? js : startOfMonth(ref);
  } catch {
    // Fallback keeps the dashboard alive if the converter throws on an edge year.
    return startOfMonth(ref);
  }
}

/** Tiny matchMedia hook — avoids depending on a specific shadcn use-mobile path. */
function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const onChange = () => setIsMobile(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [breakpoint]);
  return isMobile;
}

type PeriodKey = '7d' | '30d' | 'bsMonth' | '90d';

const PERIODS: { key: PeriodKey; label: string; short: string }[] = [
  { key: '7d', label: '7 Days', short: '7D' },
  { key: '30d', label: '30 Days', short: '30D' },
  { key: 'bsMonth', label: 'This BS Month', short: 'BS' },
  { key: '90d', label: '90 Days', short: '90D' },
];

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

function StatCardSkeleton({ wide = false }: { wide?: boolean }) {
  return (
    <Card className={cn('h-full shadow-sm', wide && 'col-span-2 sm:col-span-1')}>
      <CardContent className="p-3 space-y-2">
        <Skeleton className="h-2.5 w-20" />
        <Skeleton className="h-6 w-28" />
        <Skeleton className="h-2.5 w-16" />
      </CardContent>
    </Card>
  );
}

/** Compact shell shared by every stat tile. */
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

/** Single headline number. */
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
        <div className="min-w-0 space-y-1">
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

/** Three sub-counts in one row (fleet / cheque alerts). */
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
  const isMobile = useIsMobile();

  const [policies, setPolicies] = useState<PolicyOrMembership[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [invoices, setInvoices] = useState<EstimatedInvoice[]>([]);
  const [pageVisits, setPageVisits] = useState<PageVisit[]>([]);
  const [cheques, setCheques] = useState<Cheque[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [rentalBills, setRentalBills] = useState<RentalBill[]>([]);
  const [companyProfile, setCompanyProfile] = useState<CompanyProfile>(DEFAULT_COMPANY_PROFILE);

  const [period, setPeriod] = useState<PeriodKey>('30d');
  const [chartMode, setChartMode] = useState<'stacked' | 'total'>('stacked');
  const [showCalendar, setShowCalendar] = useState(false);

  // Real loading state: a stream is "ready" only once its first snapshot lands.
  const [ready, setReady] = useState<Record<string, boolean>>({});
  const markReady = useCallback(
    (key: string) => setReady((r) => (r[key] ? r : { ...r, [key]: true })),
    []
  );

  const REVENUE_KEYS = ['invoices', 'trips', 'rental'];
  const revenueLoading = !REVENUE_KEYS.every((k) => ready[k]);
  const alertsLoading = !ready['policies'] || !ready['cheques'];

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
      onSettingUpdate('companyProfile', (s: any) => {
        if (s?.value) setCompanyProfile(s.value);
      }),
    ];

    return () => unsubs.forEach((unsub) => unsub?.());
  }, [markReady]);

  /* ---------------- Period window ---------------- */
  const { rangeStart, rangeEnd, prevStart, prevEnd, periodLabel } = useMemo(() => {
    const end = startOfToday();
    let start: Date;
    let label: string;

    if (period === 'bsMonth') {
      start = startOfBsMonth(end);
      label = `${toNepaliDate(start.toISOString())} → today`;
    } else {
      const days = period === '7d' ? 7 : period === '90d' ? 90 : 30;
      start = subDays(end, days - 1);
      label = `Last ${days} days`;
    }

    const span = Math.max(1, differenceInDays(end, start) + 1);
    return {
      rangeStart: start,
      rangeEnd: end,
      prevStart: subDays(start, span),
      prevEnd: subDays(start, 1),
      periodLabel: label,
    };
  }, [period]);

  /* ---------------- Single-pass aggregation ---------------- */
  const { stats, chartData, urgentActions } = useMemo(() => {
    const today = startOfToday();

    /* Bucket every revenue record ONCE by day key. */
    type Bucket = { Manufacturing: number; Fleet: number; Rental: number };
    const buckets = new Map<string, Bucket>();
    const bucketFor = (k: string): Bucket => {
      let b = buckets.get(k);
      if (!b) {
        b = { Manufacturing: 0, Fleet: 0, Rental: 0 };
        buckets.set(k, b);
      }
      return b;
    };

    for (const inv of invoices) {
      const d = parseDate((inv as any).date);
      if (!d) continue;
      bucketFor(dayKey(d)).Manufacturing += Number((inv as any).netTotal) || 0;
    }

    for (const t of trips) {
      const d = parseDate((t as any).date);
      if (!d) continue;
      // NOTE: `transport` is gross freight. If you want net (own-truck profit),
      // swap this for your net-amount field so it is comparable to invoice netTotal.
      bucketFor(dayKey(d)).Fleet += Number((t as any).transport) || 0;
    }

    for (const b of rentalBills) {
      // Prefer the business date; fall back to createdAt only if absent.
      const d =
        parseDate((b as any).billDate) ??
        parseDate((b as any).date) ??
        parseDate((b as any).createdAt);
      if (!d) continue;
      bucketFor(dayKey(d)).Rental += Number((b as any).amount) || 0;
    }

    const sumRange = (from: Date, to: Date) => {
      let mfg = 0;
      let fleet = 0;
      let rental = 0;
      for (const d of eachDayOfInterval({ start: from, end: to })) {
        const b = buckets.get(dayKey(d));
        if (!b) continue;
        mfg += b.Manufacturing;
        fleet += b.Fleet;
        rental += b.Rental;
      }
      return { mfg, fleet, rental, total: mfg + fleet + rental };
    };

    const currentRev = sumRange(rangeStart, rangeEnd);
    const previousRev = sumRange(prevStart, prevEnd);

    const trendData = eachDayOfInterval({ start: rangeStart, end: rangeEnd }).map((date) => {
      const b = buckets.get(dayKey(date)) ?? { Manufacturing: 0, Fleet: 0, Rental: 0 };
      return {
        name: format(date, 'MMM dd'),
        dateBS: toNepaliDate(date.toISOString()),
        revenue: b.Manufacturing + b.Fleet + b.Rental,
        Manufacturing: b.Manufacturing,
        Fleet: b.Fleet,
        Rental: b.Rental,
      };
    });

    /* ---- Alert counts ---- */
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

    const openPOs = purchaseOrders.filter(
      (po) => po.status === 'Ordered' || po.status === 'Amended'
    ).length;

    const totalVisits = pageVisits.reduce((sum, v) => sum + (Number(v.count) || 0), 0);

    /* ---- Urgent actions (permission-aware) ---- */
    const actions: { label: string; count: number; href: string }[] = [];
    if (fleetStats.expired > 0 && hasPermission('fleet', 'read'))
      actions.push({
        label: 'Renew Expired Fleet Policies',
        count: fleetStats.expired,
        href: '/fleet/policies',
      });
    if (chequeStats.overdue > 0 && hasPermission('finance', 'read'))
      actions.push({
        label: 'Settle Overdue Cheques',
        count: chequeStats.overdue,
        href: '/finance/cheque-generator',
      });
    const unpaidRentCount = rentalBills.filter((b) => b.status === 'Unpaid').length;
    if (unpaidRentCount > 0 && hasPermission('rental', 'read'))
      actions.push({
        label: 'Collect Unpaid Rent',
        count: unpaidRentCount,
        href: '/rental/billing',
      });

    return {
      stats: {
        fleetStats,
        chequeStats,
        openPOs,
        totalVisits,
        revenue: currentRev,
        prevRevenue: previousRev,
      },
      chartData: trendData,
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
    rangeStart,
    rangeEnd,
    prevStart,
    prevEnd,
    hasPermission,
  ]);

  const chartConfig = {
    revenue: { label: 'Total Revenue', color: 'hsl(var(--primary))' },
    Manufacturing: { label: 'Manufacturing', color: 'hsl(var(--chart-1))' },
    Fleet: { label: 'Fleet', color: 'hsl(var(--chart-2))' },
    Rental: { label: 'Rental', color: 'hsl(var(--chart-3))' },
  } as const;

  const hasRevenue = chartData.some((d) => d.revenue > 0);
  const tickInterval = isMobile
    ? Math.max(0, Math.ceil(chartData.length / 4) - 1)
    : Math.max(0, Math.ceil(chartData.length / 12) - 1);

  const yTick = (v: number) => {
    if (v >= 100000) return `${(v / 100000).toFixed(1)}L`;
    if (v >= 1000) return `${Math.round(v / 1000)}k`;
    return String(v);
  };

  const canFleet = hasPermission('fleet', 'read');
  const canFinance = hasPermission('finance', 'read');
  const canPO = hasPermission('purchaseOrders', 'read');

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

        {/* Quick actions — horizontally scrollable on mobile instead of wrapping into 3 rows */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1 w-full md:w-auto md:overflow-visible">
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

      {/* ---------------- Period switcher ---------------- */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg border bg-muted/40 p-1">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={cn(
                'px-3 py-1.5 rounded-md text-[11px] font-black uppercase tracking-wider transition-colors',
                period === p.key
                  ? 'bg-background shadow-sm text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <span className="md:hidden">{p.short}</span>
              <span className="hidden md:inline">{p.label}</span>
            </button>
          ))}
        </div>
        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          {periodLabel}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6 lg:gap-8 items-start">
        {/* ---------------- Left rail ---------------- */}
        <div className="space-y-5 w-full">
          <div className="space-y-2">
            <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest px-1">
              Control Tower
            </p>
            <div className="p-4 rounded-xl border bg-card shadow-sm">
              <LiveDateTime />
            </div>
          </div>

          {alertsLoading ? (
            <Skeleton className="h-16 w-full rounded-xl" />
          ) : (
            urgentActions.length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] font-black uppercase text-destructive tracking-widest px-1">
                  Attention Required
                </p>
                <div className="space-y-2">
                  {urgentActions.map((action) => (
                    <Link href={action.href} key={action.href} className="block">
                      <Card className="border-l-4 border-l-destructive hover:bg-destructive/5 transition-colors shadow-sm">
                        <CardContent className="p-3 flex items-center justify-between min-h-[48px]">
                          <div className="space-y-0.5">
                            <p className="text-[10px] font-black text-destructive uppercase">
                              {action.count} Items
                            </p>
                            <p className="text-xs font-bold">{action.label}</p>
                          </div>
                          <ChevronRight className="h-4 w-4 text-destructive/50 shrink-0" />
                        </CardContent>
                      </Card>
                    </Link>
                  ))}
                </div>
              </div>
            )
          )}

          {/* Calendar: collapsed by default on mobile so the iframe never blocks first paint */}
          <div className="space-y-2">
            <button
              onClick={() => setShowCalendar((s) => !s)}
              className="flex w-full items-center justify-between px-1 lg:pointer-events-none"
            >
              <span className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">
                Nepali Calendar
              </span>
              <ChevronDown
                className={cn(
                  'h-4 w-4 text-muted-foreground transition-transform lg:hidden',
                  showCalendar && 'rotate-180'
                )}
              />
            </button>
            <div className={cn(showCalendar ? 'block' : 'hidden', 'lg:block')}>
              <Card className="overflow-hidden shadow-sm border-none ring-1 ring-black/5 bg-card">
                <CardContent className="p-2 flex justify-center">
                  {/*
                    Hamropatro's "small" widget is a fixed 200x290 layout, and it
                    fills itself over AJAX after mount. Forcing width:100% while
                    holding height at 290 + scrolling="no" clipped the bottom.
                    Native width + headroom + scrolling="auto" = nothing is lost.
                  */}
                  <iframe
                    src="https://www.hamropatro.com/widgets/calender-small.php"
                    width={200}
                    height={340}
                    style={{ border: 'none', maxWidth: '100%' }}
                    scrolling="auto"
                    loading="lazy"
                    title="Nepali Calendar"
                  />
                </CardContent>
              </Card>
            </div>
          </div>
        </div>

        {/* ---------------- Main column ---------------- */}
        <div className="space-y-6 md:space-y-8 min-w-0">
          {/* Stat cards — one compact grid */}
          <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
            {canFinance &&
              (revenueLoading ? (
                <StatCardSkeleton />
              ) : (
                <ValueTile
                  href="/finance/estimate-invoice"
                  accent="border-l-emerald-600"
                  label={`Revenue · ${PERIODS.find((p) => p.key === period)?.short}`}
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

            {canPO && (
              <ValueTile
                href="/purchase-orders/list"
                accent="border-l-amber-500"
                label="Open Procurement"
                value={String(stats.openPOs)}
                sub="Active Orders"
                icon={ShoppingCart}
                iconClass="text-amber-500"
              />
            )}

            {hasPermission('settings', 'read') && (
              <ValueTile
                href="/settings/system"
                accent="border-l-purple-500"
                label="System Visibility"
                value={nf(stats.totalVisits)}
                sub="Total Views"
                icon={MousePointerClick}
                iconClass="text-purple-500"
              />
            )}
          </div>

          {/* ---------------- Revenue chart ---------------- */}
          <Card className="shadow-lg bg-card overflow-hidden">
            <CardHeader className="bg-primary/5 border-b py-4 px-4 md:px-6 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="min-w-0">
                  <CardTitle className="text-sm font-black uppercase tracking-tight">
                    Revenue Pulse
                  </CardTitle>
                  <CardDescription className="text-[10px] uppercase font-bold text-muted-foreground">
                    {periodLabel} · all units
                  </CardDescription>
                </div>
                <div className="inline-flex rounded-lg border bg-background p-0.5 self-start">
                  <button
                    onClick={() => setChartMode('stacked')}
                    className={cn(
                      'flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[10px] font-black uppercase',
                      chartMode === 'stacked' ? 'bg-muted' : 'text-muted-foreground'
                    )}
                  >
                    <Layers className="h-3 w-3" /> By unit
                  </button>
                  <button
                    onClick={() => setChartMode('total')}
                    className={cn(
                      'flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[10px] font-black uppercase',
                      chartMode === 'total' ? 'bg-muted' : 'text-muted-foreground'
                    )}
                  >
                    <LineChartIcon className="h-3 w-3" /> Total
                  </button>
                </div>
              </div>

              {/* Legend + per-unit subtotals */}
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {(['Manufacturing', 'Fleet', 'Rental'] as const).map((source) => {
                  const value =
                    source === 'Manufacturing'
                      ? stats.revenue.mfg
                      : source === 'Fleet'
                      ? stats.revenue.fleet
                      : stats.revenue.rental;
                  return (
                    <div key={source} className="flex items-center gap-1.5">
                      <span
                        className="h-2 w-2 rounded-full shrink-0"
                        style={{ backgroundColor: chartConfig[source].color }}
                      />
                      <span className="text-[10px] font-black uppercase text-muted-foreground tracking-tight">
                        {source}
                      </span>
                      <span className="text-[10px] font-bold tabular-nums">Rs.{nf(value)}</span>
                    </div>
                  );
                })}
              </div>
            </CardHeader>

            <CardContent className="p-2 md:p-6">
              {revenueLoading ? (
                <Skeleton className="h-[200px] md:h-[320px] w-full rounded-lg" />
              ) : !hasRevenue ? (
                <div className="h-[200px] md:h-[320px] flex flex-col items-center justify-center text-center gap-2">
                  <TrendingUp className="h-8 w-8 text-muted-foreground/30" />
                  <p className="text-sm font-bold">No revenue recorded in this period</p>
                  <p className="text-xs text-muted-foreground">
                    Try a wider range, or add a trip / estimate to get started.
                  </p>
                </div>
              ) : (
                <ChartContainer
                  config={chartConfig}
                  className="h-[200px] md:h-[320px] w-full"
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.25} />
                          <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--muted))" />
                      <XAxis
                        dataKey="name"
                        axisLine={false}
                        tickLine={false}
                        interval={tickInterval}
                        tick={{ fontSize: 10, fontWeight: 700 }}
                        dy={8}
                      />
                      <YAxis
                        axisLine={false}
                        tickLine={false}
                        width={isMobile ? 38 : 56}
                        tick={{ fontSize: 10, fontWeight: 700 }}
                        tickFormatter={yTick}
                      />
                      <ChartTooltip
                        content={
                          <ChartTooltipContent
                            className="bg-background/95 backdrop-blur shadow-xl border-none ring-1 ring-black/5"
                            labelFormatter={(label, payload) => {
                              const bs = (payload?.[0] as any)?.payload?.dateBS;
                              return bs ? `${label} · ${bs} BS` : String(label);
                            }}
                            formatter={(value: any, name: any) => [`Rs. ${nf(Number(value))}`, name]}
                          />
                        }
                      />
                      {chartMode === 'total' ? (
                        <Area
                          type="monotone"
                          dataKey="revenue"
                          stroke="hsl(var(--primary))"
                          strokeWidth={2.5}
                          fillOpacity={1}
                          fill="url(#colorRevenue)"
                        />
                      ) : (
                        <>
                          <Area
                            type="monotone"
                            dataKey="Manufacturing"
                            stackId="1"
                            stroke={chartConfig.Manufacturing.color}
                            fill={chartConfig.Manufacturing.color}
                            fillOpacity={0.45}
                          />
                          <Area
                            type="monotone"
                            dataKey="Fleet"
                            stackId="1"
                            stroke={chartConfig.Fleet.color}
                            fill={chartConfig.Fleet.color}
                            fillOpacity={0.45}
                          />
                          <Area
                            type="monotone"
                            dataKey="Rental"
                            stackId="1"
                            stroke={chartConfig.Rental.color}
                            fill={chartConfig.Rental.color}
                            fillOpacity={0.45}
                          />
                        </>
                      )}
                    </AreaChart>
                  </ResponsiveContainer>
                </ChartContainer>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}