'use client';

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Truck, Users, ShieldCheck, CreditCard, ArrowRight, TrendingUp, TrendingDown, AlertTriangle, Wallet, Receipt } from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '@/hooks/use-auth';
import { useState, useEffect, useMemo } from 'react';
import type { Vehicle, Driver, PolicyOrMembership, Transaction, CompanyProfile } from '@/lib/types';
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartConfig } from '@/components/ui/chart';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn, toNepaliDate } from '@/lib/utils';
import { differenceInDays, startOfToday, startOfMonth, endOfMonth, subMonths, format } from 'date-fns';
import { onVehiclesUpdate } from '@/services/vehicle-service';
import { onDriversUpdate } from '@/services/driver-service';
import { onPoliciesUpdate } from '@/services/policy-service';
import { onTransactionsUpdate } from '@/services/transaction-service';
import { onSettingUpdate } from '@/services/settings-service';
import { useToast } from '@/hooks/use-toast';

const defaultFleetProfile: CompanyProfile = {
  nameEn: "SIJAN DHUWANI SEWA",
  nameNp: "सिजन ढुवानी सेवा",
  address: "HETAUDA 16, BAGMATI PROVIENCE, NEPAL",
  phone: "N/A",
  email: "N/A",
  pan: "304603712"
};

export default function FleetDashboardPage() {
    const { user, hasPermission } = useAuth();
    const [isLoading, setIsLoading] = useState(true);
    
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [drivers, setDrivers] = useState<Driver[]>([]);
    const [policies, setPolicies] = useState<PolicyOrMembership[]>([]);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [companyProfile, setCompanyProfile] = useState<CompanyProfile>(defaultFleetProfile);
    
    useEffect(() => {
        setIsLoading(true);
        const unsubs = [
            onVehiclesUpdate(setVehicles),
            onDriversUpdate(setDrivers),
            onPoliciesUpdate(setPolicies),
            onTransactionsUpdate(setTransactions),
            onSettingUpdate('fleetCompanyProfile', (s) => {
                if (s?.value) setCompanyProfile(s.value);
            })
        ];
        setIsLoading(false);
        return () => unsubs.forEach(u => u());
    }, []);
    
    const stats = useMemo(() => {
        if (isLoading) return { totalVehicles: 0, totalDrivers: 0, netThisMonth: 0, vehicleStatusData: [] };
        
        const now = new Date();
        const start = startOfMonth(now);
        const end = endOfMonth(now);

        const monthlyTxns = transactions.filter(t => {
            const tDate = new Date(t.date);
            return tDate >= start && tDate <= end;
        });

        // Use any cast for literals that may have been normalized
        const income = monthlyTxns.filter(t => ['Income', 'Sales', 'Receipt'].includes(t.type as any)).reduce((sum, t) => sum + (t.amount || 0), 0);
        const expense = monthlyTxns.filter(t => ['Expense', 'Purchase', 'Payment'].includes(t.type as any)).reduce((sum, t) => sum + (t.amount || 0), 0);
        
        const statusCounts = vehicles.reduce((acc, v) => {
            acc[v.status] = (acc[v.status] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);
        
        const vehicleStatusData = Object.entries(statusCounts).map(([name, value]) => ({ name, value }));

        return {
            totalVehicles: vehicles.length,
            totalDrivers: drivers.length,
            netThisMonth: income - expense,
            vehicleStatusData
        };
    }, [isLoading, vehicles, drivers, transactions]);
    
    const monthlyChartData = useMemo(() => {
        if (isLoading) return [];
        const data = [];
        for (let i = 5; i >= 0; i--) {
            const date = subMonths(new Date(), i);
            const start = startOfMonth(date);
            const end = endOfMonth(date);
            
            const monthTxns = transactions.filter(t => {
                const tDate = new Date(t.date);
                return tDate >= start && tDate <= end;
            });

            const income = monthTxns.filter(t => ['Income', 'Sales', 'Receipt'].includes(t.type as any)).reduce((sum, t) => sum + (t.amount || 0), 0);
            const expense = monthTxns.filter(t => ['Expense', 'Purchase', 'Payment'].includes(t.type as any)).reduce((sum, t) => sum + (t.amount || 0), 0);
            
            data.push({
                month: format(date, 'MMM'),
                income,
                expense,
            });
        }
        return data;
    }, [isLoading, transactions]);
    
    const upcomingRenewals = useMemo(() => {
        const today = startOfToday();
        return policies
            .map(p => ({ ...p, daysRemaining: differenceInDays(new Date(p.endDate), today) }))
            .filter(p => p.daysRemaining >= 0 && p.daysRemaining <= 30)
            .sort((a, b) => a.daysRemaining - b.daysRemaining)
            .slice(0, 5);
    }, [policies]);
    
    const recentTransactions = useMemo(() => {
        return [...transactions]
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
            .slice(0, 5);
    }, [transactions]);
    
    const chartConfig: ChartConfig = {
        income: { label: 'Income', color: 'hsl(var(--chart-2))' },
        expense: { label: 'Expense', color: 'hsl(var(--chart-1))' },
    };
    
    const COLORS = ["hsl(var(--chart-1))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))", "hsl(var(--chart-5))"];

    if (isLoading) {
      return (
          <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm py-24">
              <h3 className="text-2xl font-bold tracking-tight">Loading Fleet Dashboard...</h3>
          </div>
      );
    }

    return (
        <div className="flex flex-col gap-8">
            <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="flex items-center gap-4">
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight uppercase">{companyProfile.nameEn}</h1>
                        <h2 className="text-lg font-semibold text-muted-foreground">{companyProfile.nameNp}</h2>
                        <p className="text-sm text-muted-foreground uppercase">{companyProfile.address}</p>
                    </div>
                </div>
            </header>
            
            <div className="grid gap-6 md:grid-cols-3">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Vehicles</CardTitle>
                        <Truck className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.totalVehicles}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Drivers</CardTitle>
                        <Users className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.totalDrivers}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Net Income (Month)</CardTitle>
                        {stats.netThisMonth >= 0 ? <TrendingUp className="h-4 w-4 text-emerald-600"/> : <TrendingDown className="h-4 w-4 text-red-600"/>}
                    </CardHeader>
                    <CardContent>
                        <div className={cn("text-2xl font-bold", stats.netThisMonth >= 0 ? 'text-emerald-600' : 'text-red-600')}>
                            Rs. {stats.netThisMonth.toLocaleString()}
                        </div>
                    </CardContent>
                </Card>
            </div>
            
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-5">
                <Card className="lg:col-span-3">
                    <CardHeader><CardTitle>Financial Movement (Last 6 Months)</CardTitle></CardHeader>
                    <CardContent>
                        <ChartContainer config={chartConfig} className="h-[250px] w-full">
                            <BarChart data={monthlyChartData}>
                                <CartesianGrid vertical={false} />
                                <XAxis dataKey="month" tickLine={false} tickMargin={10} axisLine={false} />
                                <YAxis />
                                <Tooltip content={<ChartTooltipContent />} />
                                <Bar dataKey="income" fill="var(--color-income)" radius={4} />
                                <Bar dataKey="expense" fill="var(--color-expense)" radius={4} />
                            </BarChart>
                        </ChartContainer>
                    </CardContent>
                </Card>
                 <Card className="lg:col-span-2">
                    <CardHeader><CardTitle>Fleet Composition</CardTitle></CardHeader>
                    <CardContent className="flex items-center justify-center">
                        <ChartContainer config={chartConfig} className="h-[250px] w-full">
                            <ResponsiveContainer width="100%" height={250}>
                                <PieChart>
                                    <Tooltip content={<ChartTooltipContent nameKey="name" />} />
                                    <Pie data={stats.vehicleStatusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                                        {stats.vehicleStatusData.map((_, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Pie>
                                </PieChart>
                            </ResponsiveContainer>
                        </ChartContainer>
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-2">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between">
                        <div><CardTitle>Upcoming Renewals</CardTitle></div>
                         <Button asChild size="sm" variant="outline">
                            <Link href="/fleet/policies">View All <ArrowRight className="ml-2 h-4 w-4" /></Link>
                        </Button>
                    </CardHeader>
                    <CardContent>
                        <ScrollArea className="h-[250px]">
                        {upcomingRenewals.length > 0 ? (
                            <div className="space-y-4">
                                {upcomingRenewals.map(p => (
                                    <div key={p.id} className="flex justify-between items-center">
                                        <div>
                                            <p className="font-medium">{p.type} <span className="text-sm text-muted-foreground">for {p.memberType === 'Vehicle' ? vehicles.find(v => v.id === p.memberId)?.name : drivers.find(d => d.id === p.memberId)?.name}</span></p>
                                            <p className="text-sm text-muted-foreground">{p.provider}</p>
                                        </div>
                                        <div className="text-right">
                                             <Badge variant={p.daysRemaining <= 7 ? "destructive" : "secondary"}>
                                                <AlertTriangle className="mr-1 h-3 w-3" />
                                                {p.daysRemaining} days left
                                             </Badge>
                                             <p className="text-xs text-muted-foreground mt-1">Due: {toNepaliDate(p.endDate)}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                             <div className="flex h-full items-center justify-center text-muted-foreground">No upcoming renewals.</div>
                        )}
                        </ScrollArea>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between">
                        <div><CardTitle>Recent Transactions</CardTitle></div>
                        <Button asChild size="sm" variant="outline">
                            <Link href="/fleet/transactions">View All <ArrowRight className="ml-2 h-4 w-4" /></Link>
                        </Button>
                    </CardHeader>
                    <CardContent>
                        <ScrollArea className="h-[250px]">
                         {recentTransactions.length > 0 ? (
                            <div className="space-y-4">
                                {recentTransactions.map(t => (
                                    <div key={t.id} className="flex justify-between items-center">
                                        <div>
                                            <p className="font-medium">{t.category || t.type} <span className="text-sm text-muted-foreground">for {vehicles.find(v => v.id === t.vehicleId)?.name}</span></p>
                                            <p className="text-sm text-muted-foreground">{new Date(t.date).toLocaleDateString()}</p>
                                        </div>
                                        <p className={cn("font-medium", ['Income', 'Sales', 'Receipt'].includes(t.type as any) ? 'text-emerald-600' : 'text-red-600')}>
                                            {['Expense', 'Purchase', 'Payment'].includes(t.type as any) && '-'}{t.amount.toLocaleString()}
                                        </p>
                                    </div>
                                ))}
                            </div>
                         ) : (
                             <div className="flex h-full items-center justify-center text-muted-foreground">No transactions recorded yet.</div>
                         )}
                        </ScrollArea>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
