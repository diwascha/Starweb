'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { 
    Calculator, 
    Users, 
    Building2, 
    History, 
    TrendingUp, 
    Zap,
    ArrowRight,
    Loader2,
    ChevronRight,
    Bell,
    AlertCircle,
    CheckCircle2,
    XCircle,
    Calendar
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
    BarChart, 
    Bar, 
    XAxis, 
    YAxis, 
    CartesianGrid, 
    Tooltip, 
    ResponsiveContainer,
    Cell,
    Legend
} from 'recharts';
import { format, subDays, isPast, isToday, startOfDay } from 'date-fns';
import NepaliDate from 'nepali-date-converter';
import { useAuth } from '@/hooks/use-auth';
import type { Party, CRMContact, InteractionLog, Deal, FollowUp } from '@/lib/types';
import { onPartiesUpdate } from '@/services/party-service';
import { onContactsUpdate, onInteractionsUpdate, onFollowUpsUpdate } from '@/services/crm-service';
import { onDealsUpdate } from '@/services/deal-service';
import { cn } from '@/lib/utils';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';

export default function CrmDashboardPage() {
  const { user } = useAuth();
  
  const [companies, setCompanies] = useState<Party[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [interactions, setInteractions] = useState<InteractionLog[]>([]);
  const [followups, setFollowups] = useState<FollowUp[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);
    const unsubs = [
        onPartiesUpdate((data) => setCompanies(data.filter(p => p.type === 'Customer' || p.type === 'Both'))),
        onDealsUpdate(setDeals),
        onInteractionsUpdate(setInteractions),
        onFollowUpsUpdate(setFollowups)
    ];
    
    // Simple loader control - stop when first batches arrive
    const timer = setTimeout(() => setIsLoading(false), 800);
    return () => {
        unsubs.forEach(u => u());
        clearTimeout(timer);
    };
  }, []);

  const stats = useMemo(() => {
    const now = new Date();
    const ndNow = new NepaliDate(now);
    const curYear = ndNow.getYear();
    const curMonth = ndNow.getMonth();

    const openDeals = deals.filter(d => !['Won', 'Lost'].includes(d.stage));
    const openValue = openDeals.reduce((sum, d) => sum + (d.value || 0), 0);

    const wonThisMonth = deals.filter(d => {
        if (d.stage !== 'Won' || !d.closedAt) return false;
        const nd = new NepaliDate(new Date(d.closedAt));
        return nd.getYear() === curYear && nd.getMonth() === curMonth;
    }).length;

    const overdueFollowups = followups.filter(f => 
        f.status === 'Pending' && 
        isPast(new Date(f.dueDate)) && 
        !isToday(new Date(f.dueDate))
    ).length;

    const interactionsThisMonth = interactions.filter(i => {
        const nd = new NepaliDate(new Date(i.date));
        return nd.getYear() === curYear && nd.getMonth() === curMonth;
    }).length;

    return {
        openValue,
        wonThisMonth,
        overdueFollowups,
        interactionsThisMonth
    };
  }, [deals, followups, interactions]);

  const funnelData = useMemo(() => {
    const stages = ['Lead', 'Quoted', 'Negotiation'];
    return stages.map(stage => {
        const stageDeals = deals.filter(d => d.stage === stage);
        return {
            name: stage,
            count: stageDeals.length,
            value: stageDeals.reduce((sum, d) => sum + (d.value || 0), 0)
        };
    });
  }, [deals]);

  const winLossData = useMemo(() => {
    const ndNow = new NepaliDate();
    const curYear = ndNow.getYear();

    const yearDeals = deals.filter(d => {
        const date = d.closedAt || d.createdAt;
        const nd = new NepaliDate(new Date(date));
        return nd.getYear() === curYear;
    });

    return [
        { name: 'Won', count: yearDeals.filter(d => d.stage === 'Won').length, color: 'hsl(var(--chart-2))' },
        { name: 'Lost', count: yearDeals.filter(d => d.stage === 'Lost').length, color: 'hsl(var(--destructive))' }
    ];
  }, [deals]);

  const staleAccounts = useMemo(() => {
    const thirtyDaysAgo = subDays(new Date(), 30);
    
    const accountsWithLastActivity = companies.map(c => {
        const accountInteractions = interactions.filter(i => i.partyId === c.id);
        const lastInteraction = accountInteractions.length > 0 
            ? accountInteractions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0]
            : null;
        
        return {
            ...c,
            lastInteractionDate: lastInteraction ? new Date(lastInteraction.date) : null
        };
    });

    return accountsWithLastActivity
        .filter(a => !a.lastInteractionDate || a.lastInteractionDate < thirtyDaysAgo)
        .sort((a, b) => {
            if (!a.lastInteractionDate) return -1;
            if (!b.lastInteractionDate) return 1;
            return a.lastInteractionDate.getTime() - b.lastInteractionDate.getTime();
        })
        .slice(0, 10);
  }, [companies, interactions]);

  const upcomingFollowups = useMemo(() => {
    return followups
        .filter(f => f.status === 'Pending' && !isPast(new Date(f.dueDate)) || isToday(new Date(f.dueDate)))
        .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
        .slice(0, 5);
  }, [followups]);

  if (isLoading) return <div className="p-12 text-center h-[70vh] flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin mx-auto opacity-20"/></div>;

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
            <h1 className="text-3xl font-black text-gray-900 tracking-tighter uppercase leading-none">CRM Intelligence</h1>
            <p className="text-muted-foreground text-sm font-medium italic mt-1">Real-time sales funnel and relationship analytics.</p>
        </div>
        <div className="flex gap-2">
            <Button variant="outline" size="sm" className="h-9 font-bold text-[10px] uppercase tracking-widest" asChild>
                <Link href="/crm/deals">Pipeline Board</Link>
            </Button>
            <Button size="sm" className="h-9 font-black text-[10px] uppercase tracking-widest shadow-lg" asChild>
                <Link href="/crm/followups">Manage Tasks</Link>
            </Button>
        </div>
      </header>

       <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard 
                title="Open Pipeline" 
                value={`Rs. ${stats.openValue.toLocaleString('en-IN')}`} 
                icon={TrendingUp} 
                color="blue" 
                desc="Active leads & quotes"
            />
            <StatCard 
                title="Won This Month" 
                value={stats.wonThisMonth} 
                icon={CheckCircle2} 
                color="emerald" 
                desc={`In ${NEPALI_MONTHS[new NepaliDate().getMonth()].name}`}
            />
            <StatCard 
                title="Overdue Tasks" 
                value={stats.overdueFollowups} 
                icon={AlertCircle} 
                color="red" 
                desc="Reminders requiring action"
            />
            <StatCard 
                title="Activity Count" 
                value={stats.interactionsThisMonth} 
                icon={Zap} 
                color="purple" 
                desc="Interactions this month"
            />
       </div>

       <div className="grid gap-8 lg:grid-cols-2">
            {/* Pipeline Funnel */}
            <Card className="shadow-sm border-gray-100">
                <CardHeader className="py-4 border-b bg-muted/5">
                    <CardTitle className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground">Sales Funnel Analysis</CardTitle>
                    <CardDescription className="text-[10px] uppercase font-bold">Open opportunities by stage and aggregate value.</CardDescription>
                </CardHeader>
                <CardContent className="pt-6">
                    <div className="h-[300px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={funnelData} layout="vertical" margin={{ left: 30, right: 30 }}>
                                <CartesianGrid strokeDasharray="3 3" horizontal={false} opacity={0.3} />
                                <XAxis type="number" hide />
                                <YAxis 
                                    dataKey="name" 
                                    type="category" 
                                    tick={{ fontSize: 10, fontWeight: 900, fill: 'hsl(var(--foreground))' }}
                                    width={100}
                                />
                                <Tooltip 
                                    cursor={{ fill: 'hsl(var(--muted)/0.3)' }}
                                    content={({ active, payload }) => {
                                        if (active && payload && payload.length) {
                                            const data = payload[0].payload;
                                            return (
                                                <div className="bg-white p-3 border rounded-lg shadow-xl space-y-1">
                                                    <p className="text-[10px] font-black uppercase text-muted-foreground">{data.name}</p>
                                                    <p className="text-xs font-black">{data.count} Deals</p>
                                                    <p className="text-xs font-black text-primary">Rs. {data.value.toLocaleString('en-IN')}</p>
                                                </div>
                                            );
                                        }
                                        return null;
                                    }}
                                />
                                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                                    {funnelData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={`hsl(var(--chart-${(index % 5) + 1}))`} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </CardContent>
            </Card>

            {/* Performance & Follow-ups */}
            <div className="space-y-6">
                <Card className="shadow-sm border-gray-100">
                    <CardHeader className="py-4 border-b bg-muted/5">
                        <CardTitle className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground">Annual Conversion</CardTitle>
                        <CardDescription className="text-[10px] uppercase font-bold">Closed outcomes for BS {new NepaliDate().getYear()}.</CardDescription>
                    </CardHeader>
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-around">
                            {winLossData.map(item => (
                                <div key={item.name} className="text-center space-y-1">
                                    <p className="text-[9px] font-black uppercase text-muted-foreground">{item.name}</p>
                                    <p className={cn("text-4xl font-black tabular-nums", item.name === 'Won' ? "text-emerald-600" : "text-red-500")}>
                                        {item.count}
                                    </p>
                                </div>
                            ))}
                            <div className="h-16 w-px bg-muted" />
                            <div className="text-center space-y-1">
                                <p className="text-[9px] font-black uppercase text-muted-foreground">Win Rate</p>
                                <p className="text-4xl font-black tabular-nums text-primary">
                                    {winLossData[0].count + winLossData[1].count > 0 
                                        ? Math.round((winLossData[0].count / (winLossData[0].count + winLossData[1].count)) * 100) 
                                        : 0}%
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="shadow-sm border-gray-100">
                    <CardHeader className="py-4 border-b bg-muted/5">
                        <CardTitle className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground">Upcoming Agenda</CardTitle>
                        <CardDescription className="text-[10px] uppercase font-bold">Immediate priorities from follow-up registry.</CardDescription>
                    </CardHeader>
                    <CardContent className="p-0">
                        <div className="divide-y">
                            {upcomingFollowups.map(f => (
                                <div key={f.id} className="flex items-center justify-between p-4 hover:bg-muted/10 transition-colors">
                                    <div className="space-y-0.5">
                                        <p className="text-xs font-black text-gray-900 leading-tight">{f.action}</p>
                                        <p className="text-[10px] text-muted-foreground uppercase font-bold">{f.partyName}</p>
                                    </div>
                                    <Badge variant="outline" className="text-[9px] font-black tabular-nums h-5">
                                        {f.dueDateBS}
                                    </Badge>
                                </div>
                            ))}
                            {upcomingFollowups.length === 0 && (
                                <div className="py-12 text-center text-[10px] font-bold uppercase text-muted-foreground opacity-30 italic">No scheduled tasks.</div>
                            )}
                        </div>
                    </CardContent>
                    <CardFooter className="p-3 border-t bg-muted/5">
                        <Button variant="ghost" className="w-full text-[10px] font-black uppercase tracking-widest h-8" asChild>
                            <Link href="/crm/followups">Go to Calendar <ChevronRight className="ml-1 h-3 w-3"/></Link>
                        </Button>
                    </CardFooter>
                </Card>
            </div>
       </div>

       <div className="grid gap-8 lg:grid-cols-3">
            <div className="lg:col-span-2">
                <Card className="shadow-sm border-gray-100 h-full">
                    <CardHeader className="py-4 border-b bg-red-50/5">
                        <CardTitle className="text-xs font-black uppercase tracking-[0.2em] text-red-600 flex items-center gap-2">
                            <Clock className="h-3.5 w-3.5" /> Stale Accounts
                        </CardTitle>
                        <CardDescription className="text-[10px] uppercase font-bold">Clients with no interaction logged in over 30 days.</CardDescription>
                    </CardHeader>
                    <CardContent className="p-0">
                        <Table>
                            <TableHeader className="bg-muted/30">
                                <TableRow className="hover:bg-transparent">
                                    <TableHead className="text-[9px] font-black uppercase pl-6">Company</TableHead>
                                    <TableHead className="text-[9px] font-black uppercase">Last Interaction</TableHead>
                                    <TableHead className="text-right text-[9px] font-black uppercase pr-6">Action</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {staleAccounts.map(a => (
                                    <TableRow key={a.id} className="h-12 border-b">
                                        <TableCell className="pl-6 font-bold text-xs">{a.name}</TableCell>
                                        <TableCell>
                                            {a.lastInteractionDate ? (
                                                <div className="flex flex-col">
                                                    <span className="text-[10px] font-bold text-red-600">{format(a.lastInteractionDate, "PP")}</span>
                                                    <span className="text-[8px] text-muted-foreground uppercase">{formatDistanceToNow(a.lastInteractionDate, { addSuffix: true })}</span>
                                                </div>
                                            ) : (
                                                <span className="text-[10px] font-black uppercase text-muted-foreground opacity-40">No activity logged</span>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-right pr-6">
                                            <Button variant="ghost" size="icon" asChild className="h-8 w-8 text-primary">
                                                <Link href="/crm/companies"><ArrowRight className="h-4 w-4"/></Link>
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {staleAccounts.length === 0 && (
                                    <TableRow><TableCell colSpan={3} className="py-20 text-center text-[10px] font-bold uppercase text-muted-foreground opacity-30 italic">All client relationships are active.</TableCell></TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            </div>

            <div className="space-y-6">
                <h2 className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground px-1">Engagement Core</h2>
                <div className="grid gap-3">
                    <ModuleCard href="/crm/companies" title="Companies" desc="Hierarchical profiles & lifecycle." icon={Building2} />
                    <ModuleCard href="/crm/contacts" title="Contacts" desc="Centralized personnel registry." icon={Users} />
                    <ModuleCard href="/crm/deals" title="Deals" desc="Opportunity funnel & forecasting." icon={TrendingUp} />
                    <ModuleCard href="/crm/followups" title="Tasks" desc="Strategic relationship maintenance." icon={Bell} />
                </div>
            </div>
       </div>
    </div>
  );
}

function StatCard({ title, value, icon: Icon, color, desc }: any) {
    const colors: any = {
        blue: "bg-blue-50 text-blue-600 border-blue-100",
        emerald: "bg-emerald-50 text-emerald-600 border-emerald-100",
        red: "bg-red-50 text-red-600 border-red-100",
        purple: "bg-purple-50 text-purple-600 border-purple-100"
    };
    return (
        <Card className={cn("shadow-none border-none ring-1 ring-black/5 overflow-hidden", colors[color])}>
            <CardContent className="p-4 flex items-center justify-between">
                <div className="space-y-1">
                    <p className="text-[9px] font-black uppercase tracking-widest opacity-60">{title}</p>
                    <p className="text-xl font-black leading-none tracking-tight">{value}</p>
                    <p className="text-[8px] font-bold uppercase opacity-50">{desc}</p>
                </div>
                <div className="p-2 rounded-xl bg-white shadow-inner shrink-0">
                    <Icon className="h-4 w-4 opacity-80" />
                </div>
            </CardContent>
        </Card>
    );
}

function ModuleCard({ href, title, desc, icon: Icon }: any) {
    return (
        <Link href={href}>
            <Card className="hover:shadow-lg transition-all border-none ring-1 ring-black/5 bg-white group hover:-translate-y-0.5">
                <CardContent className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-muted/50 group-hover:bg-primary/10 transition-colors">
                            <Icon className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                        </div>
                        <div className="space-y-0.5">
                            <p className="text-[11px] font-black uppercase tracking-wider text-gray-900">{title}</p>
                            <p className="text-[9px] text-muted-foreground uppercase font-medium leading-tight line-clamp-1">{desc}</p>
                        </div>
                    </div>
                    <ChevronRight className="h-3 w-3 text-muted-foreground group-hover:text-primary transition-transform group-hover:translate-x-0.5" />
                </CardContent>
            </Card>
        </Link>
    );
}

function formatDistanceToNow(date: Date, options: { addSuffix?: boolean } = {}) {
    const now = new Date();
    const diffInDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 3600 * 24));
    if (diffInDays === 0) return "today";
    return `${diffInDays}d${options.addSuffix ? ' ago' : ''}`;
}

const NEPALI_MONTHS = [
  { value: 0, name: "Baishakh" }, { value: 1, name: "Jestha" }, { value: 2, name: "Ashadh" },
  { value: 3, name: "Shrawan" }, { value: 4, name: "Bhadra" }, { value: 5, name: "Ashwin" },
  { value: 6, name: "Kartik" }, { value: 7, name: "Mangsir" }, { value: 8, name: "Poush" },
  { value: 9, name: "Magh" }, { value: 10, name: "Falgun" }, { value: 11, name: "Chaitra" }
];
