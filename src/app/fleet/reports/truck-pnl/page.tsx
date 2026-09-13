'use client';

import { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TableEmptyState } from '@/components/ui/table-empty-state';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Truck, TrendingUp, TrendingDown, Search } from 'lucide-react';
import { onTransactionsUpdate } from '@/services/transaction-service';
import { onVehiclesUpdate } from '@/services/vehicle-service';
import type { Transaction, Vehicle } from '@/lib/types';
import { DualDateRangePicker } from '@/components/ui/dual-date-range-picker';
import type { DateRange } from 'react-day-picker';
import { isWithinInterval, startOfDay, endOfDay } from 'date-fns';
import { useAuth } from '@/hooks/use-auth';

interface TruckPnl {
    vehicle: Vehicle;
    income: number;
    expense: number;
    net: number;
    tripCount: number;
    categoryBreakdown: Record<string, number>;
}

export default function TruckPnlPage() {
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [dateRange, setDateRange] = useState<DateRange | undefined>();
    const { getAllowedOwnerships } = useAuth();
    const allowedOwnerships = useMemo(() => getAllowedOwnerships('fleet'), [getAllowedOwnerships]);

    useEffect(() => {
        let loaded = 0;
        const check = () => { loaded++; if (loaded >= 2) setIsLoading(false); };
        const inScope = (ownership: string) => ownership === 'Both' || allowedOwnerships.includes(ownership);
        const unsubTx = onTransactionsUpdate(data => { setTransactions(data.filter(x => inScope(x.ownership))); check(); });
        const unsubVeh = onVehiclesUpdate(data => { setVehicles(data.filter(x => inScope(x.ownership))); check(); });
        return () => { unsubTx(); unsubVeh(); };
    }, [allowedOwnerships]);

    const filteredTransactions = useMemo(() => {
        if (!dateRange?.from) return transactions;
        const from = startOfDay(dateRange.from);
        const to = endOfDay(dateRange.to || dateRange.from);
        return transactions.filter(t => isWithinInterval(new Date(t.date), { start: from, end: to }));
    }, [transactions, dateRange]);

    const truckPnls = useMemo<TruckPnl[]>(() => {
        return vehicles.map(vehicle => {
            const vehicleTxns = filteredTransactions.filter(t => t.vehicleId === vehicle.id);
            const income = vehicleTxns.filter(t => t.type === 'Sales').reduce((sum, t) => sum + t.amount, 0);
            // Expense = cash/credit cost incurred by this truck: mirrored Expense-ledger
            // Payment entries (maintenance/fuel/insurance/tax/loan/advance) plus any
            // Purchase entries booked directly against the vehicle (e.g. parts on credit).
            // Payment vouchers from the party-statement flow don't carry a vehicleId, so
            // there's no double-count risk with those.
            const expenseTxns = vehicleTxns.filter(t => t.type === 'Payment' || t.type === 'Purchase');
            const expense = expenseTxns.reduce((sum, t) => sum + t.amount, 0);
            const tripCount = vehicleTxns.filter(t => t.type === 'Sales').length;
            const categoryBreakdown: Record<string, number> = {};
            for (const t of expenseTxns) {
                const cat = t.category || 'Uncategorized';
                categoryBreakdown[cat] = (categoryBreakdown[cat] || 0) + t.amount;
            }
            return { vehicle, income, expense, net: income - expense, tripCount, categoryBreakdown };
        }).filter(p => p.vehicle.name.toLowerCase().includes(search.toLowerCase()))
          .sort((a, b) => b.net - a.net);
    }, [vehicles, filteredTransactions, search]);

    const totals = useMemo(() => truckPnls.reduce((acc, p) => ({
        income: acc.income + p.income,
        expense: acc.expense + p.expense,
        net: acc.net + p.net,
    }), { income: 0, expense: 0, net: 0 }), [truckPnls]);

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-black tracking-tight flex items-center gap-2"><Truck className="h-6 w-6 text-primary" /> Truck-wise Profit &amp; Loss</h1>
                <p className="text-sm text-muted-foreground">Income (freight) vs. all recorded expenses (maintenance, fuel, insurance, tax/renewal, loan, advance) per truck.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card><CardHeader className="pb-2"><CardDescription>Total Income</CardDescription><CardTitle className="text-2xl text-emerald-600">Rs. {totals.income.toLocaleString()}</CardTitle></CardHeader></Card>
                <Card><CardHeader className="pb-2"><CardDescription>Total Expense</CardDescription><CardTitle className="text-2xl text-destructive">Rs. {totals.expense.toLocaleString()}</CardTitle></CardHeader></Card>
                <Card><CardHeader className="pb-2"><CardDescription>Net Profit / Loss</CardDescription><CardTitle className={totals.net >= 0 ? 'text-2xl text-emerald-600' : 'text-2xl text-destructive'}>Rs. {totals.net.toLocaleString()}</CardTitle></CardHeader></Card>
            </div>

            <Card>
                <CardContent className="pt-6 space-y-4">
                    <div className="flex flex-col sm:flex-row gap-3">
                        <div className="relative flex-1 max-w-sm">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input placeholder="Search truck..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9" />
                        </div>
                        <DualDateRangePicker selected={dateRange} onSelect={setDateRange} />
                    </div>

                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Truck</TableHead>
                                <TableHead className="text-right">Trips</TableHead>
                                <TableHead className="text-right">Income</TableHead>
                                <TableHead className="text-right">Expense</TableHead>
                                <TableHead className="text-right">Net</TableHead>
                                <TableHead>Cost Breakdown</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {!isLoading && truckPnls.length === 0 && <TableEmptyState colSpan={6} message="No trucks match this filter." icon={Truck} />}
                            {truckPnls.map(p => (
                                <TableRow key={p.vehicle.id}>
                                    <TableCell className="font-semibold">{p.vehicle.name}</TableCell>
                                    <TableCell className="text-right tabular-nums">{p.tripCount}</TableCell>
                                    <TableCell className="text-right tabular-nums text-emerald-700">Rs. {p.income.toLocaleString()}</TableCell>
                                    <TableCell className="text-right tabular-nums text-destructive">Rs. {p.expense.toLocaleString()}</TableCell>
                                    <TableCell className="text-right tabular-nums font-bold">
                                        <span className={p.net >= 0 ? 'text-emerald-700 flex items-center justify-end gap-1' : 'text-destructive flex items-center justify-end gap-1'}>
                                            {p.net >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                                            Rs. {p.net.toLocaleString()}
                                        </span>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex flex-wrap gap-1">
                                            {Object.entries(p.categoryBreakdown).map(([cat, amt]) => (
                                                <Badge key={cat} variant="outline" className="text-[9px] font-normal">{cat}: Rs. {amt.toLocaleString()}</Badge>
                                            ))}
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}
