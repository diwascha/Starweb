'use client';

import { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TableEmptyState } from '@/components/ui/table-empty-state';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Truck, TrendingUp, TrendingDown, Search } from 'lucide-react';
import { onTransactionsUpdate } from '@/services/transaction-service';
import { onVehiclesUpdate } from '@/services/vehicle-service';
import type { Transaction, Vehicle } from '@/lib/types';
import { useOwnershipScope } from '@/hooks/use-ownership-scope';
import { NEPALI_MONTHS } from '@/lib/constants';
import NepaliDate from 'nepali-date-converter';
import { LedgerToolbar, type LedgerColumn } from '../_components/ledger-toolbar';
import { SortableHead } from '../_components/sortable-head';
import { LedgerFilterBar } from '../_components/ledger-filter-bar';

interface TruckPnl {
    vehicle: Vehicle;
    income: number;
    expense: number;
    net: number;
    tripCount: number;
    categoryBreakdown: Record<string, number>;
}

type SortKey = 'name' | 'tripCount' | 'income' | 'expense' | 'net';
type SortDirection = 'asc' | 'desc';

export function TruckPnlView() {
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [filterYear, setFilterYear] = useState('All');
    const [filterMonth, setFilterMonth] = useState('All');
    const [filterVehicleId, setFilterVehicleId] = useState('All');
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection }>({ key: 'net', direction: 'desc' });
    const { inScope } = useOwnershipScope('fleet');

    useEffect(() => {
        let loaded = 0;
        const check = () => { loaded++; if (loaded >= 2) setIsLoading(false); };
        const unsubTx = onTransactionsUpdate(data => { setTransactions(data.filter(x => inScope(x.ownership))); check(); });
        const unsubVeh = onVehiclesUpdate(data => { setVehicles(data.filter(x => inScope(x.ownership))); check(); });
        return () => { unsubTx(); unsubVeh(); };
    }, [inScope]);

    const availableYears = useMemo(() => {
        const years = new Set<number>();
        transactions.forEach(t => { try { years.add(new NepaliDate(new Date(t.date)).getYear()); } catch {} });
        return Array.from(years).sort((a, b) => b - a);
    }, [transactions]);

    const filteredTransactions = useMemo(() => {
        return transactions.filter(t => {
            if (filterVehicleId !== 'All' && t.vehicleId !== filterVehicleId) return false;
            if (filterYear === 'All' && filterMonth === 'All') return true;
            try {
                const bs = new NepaliDate(new Date(t.date));
                if (filterYear !== 'All' && bs.getYear() !== Number(filterYear)) return false;
                if (filterMonth !== 'All' && bs.getMonth() !== Number(filterMonth)) return false;
                return true;
            } catch {
                return false;
            }
        });
    }, [transactions, filterYear, filterMonth, filterVehicleId]);

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
          .sort((a, b) => {
              const getSortValue = (p: TruckPnl) => sortConfig.key === 'name' ? p.vehicle.name : p[sortConfig.key];
              const aVal = getSortValue(a);
              const bVal = getSortValue(b);
              if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
              if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
              return 0;
          });
    }, [vehicles, filteredTransactions, search, sortConfig]);

    const requestSort = (key: SortKey) => {
        setSortConfig(prev => ({ key, direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc' }));
    };

    const totals = useMemo(() => truckPnls.reduce((acc, p) => ({
        income: acc.income + p.income,
        expense: acc.expense + p.expense,
        net: acc.net + p.net,
    }), { income: 0, expense: 0, net: 0 }), [truckPnls]);

    const exportColumns: LedgerColumn<TruckPnl>[] = [
        { header: 'Truck', value: p => p.vehicle.name },
        { header: 'Trips', align: 'right', value: p => p.tripCount },
        { header: 'Income', align: 'right', value: p => p.income.toLocaleString('en-IN') },
        { header: 'Expense', align: 'right', value: p => p.expense.toLocaleString('en-IN') },
        { header: 'Net', align: 'right', value: p => p.net.toLocaleString('en-IN') },
        { header: 'Cost Breakdown', value: p => Object.entries(p.categoryBreakdown).map(([cat, amt]) => `${cat}: ${amt.toLocaleString('en-IN')}`).join('; ') },
    ];

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-black tracking-tight flex items-center gap-2"><Truck className="h-6 w-6 text-primary" /> Truck-wise Profit &amp; Loss</h1>
                    <p className="text-sm text-muted-foreground">Income (freight) vs. all recorded expenses (maintenance, fuel, insurance, tax/renewal, loan, advance) per truck.</p>
                </div>
                <LedgerToolbar
                    title="Truck-wise Profit & Loss"
                    subtitle={`Truck: ${filterVehicleId === 'All' ? 'All' : vehicles.find(v => v.id === filterVehicleId)?.name} | Year: ${filterYear} | Month: ${filterMonth}`}
                    columns={exportColumns}
                    rows={truckPnls}
                    filenamePrefix="Truck_PnL"
                />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card><CardHeader className="pb-2"><CardDescription>Total Income</CardDescription><CardTitle className="text-2xl text-emerald-600">Rs. {totals.income.toLocaleString('en-IN')}</CardTitle></CardHeader></Card>
                <Card><CardHeader className="pb-2"><CardDescription>Total Expense</CardDescription><CardTitle className="text-2xl text-destructive">Rs. {totals.expense.toLocaleString('en-IN')}</CardTitle></CardHeader></Card>
                <Card><CardHeader className="pb-2"><CardDescription>Net Profit / Loss</CardDescription><CardTitle className={totals.net >= 0 ? 'text-2xl text-emerald-600' : 'text-2xl text-destructive'}>Rs. {totals.net.toLocaleString('en-IN')}</CardTitle></CardHeader></Card>
            </div>

            <Card>
                <CardContent className="pt-6 space-y-4">
                    <LedgerFilterBar className="rounded-lg p-3">
                        <div className="relative flex-1 min-w-[180px] max-w-sm">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input placeholder="Search truck..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9" />
                        </div>
                        <Select value={filterVehicleId} onValueChange={setFilterVehicleId}>
                            <SelectTrigger className="h-9 w-40"><SelectValue placeholder="All Trucks" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="All">All Trucks</SelectItem>
                                {vehicles.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
                            </SelectContent>
                        </Select>
                        <Select value={filterMonth} onValueChange={setFilterMonth}>
                            <SelectTrigger className="h-9 w-36"><SelectValue placeholder="All Months" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="All">All Months</SelectItem>
                                {NEPALI_MONTHS.map(m => <SelectItem key={m.value} value={String(m.value)}>{m.name}</SelectItem>)}
                            </SelectContent>
                        </Select>
                        <Select value={filterYear} onValueChange={setFilterYear}>
                            <SelectTrigger className="h-9 w-28"><SelectValue placeholder="All Years" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="All">All Years</SelectItem>
                                {availableYears.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </LedgerFilterBar>

                    <Table>
                        <TableHeader>
                            <TableRow>
                                <SortableHead label="Truck" active={sortConfig.key === 'name'} onClick={() => requestSort('name')} />
                                <SortableHead label="Trips" align="right" active={sortConfig.key === 'tripCount'} onClick={() => requestSort('tripCount')} />
                                <SortableHead label="Income" align="right" active={sortConfig.key === 'income'} onClick={() => requestSort('income')} />
                                <SortableHead label="Expense" align="right" active={sortConfig.key === 'expense'} onClick={() => requestSort('expense')} />
                                <SortableHead label="Net" align="right" active={sortConfig.key === 'net'} onClick={() => requestSort('net')} />
                                <TableHead>Cost Breakdown</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {!isLoading && truckPnls.length === 0 && <TableEmptyState colSpan={6} message="No trucks match this filter." icon={Truck} />}
                            {truckPnls.map(p => (
                                <TableRow key={p.vehicle.id}>
                                    <TableCell className="font-semibold">{p.vehicle.name}</TableCell>
                                    <TableCell className="text-right tabular-nums">{p.tripCount}</TableCell>
                                    <TableCell className="text-right tabular-nums text-emerald-700">Rs. {p.income.toLocaleString('en-IN')}</TableCell>
                                    <TableCell className="text-right tabular-nums text-destructive">Rs. {p.expense.toLocaleString('en-IN')}</TableCell>
                                    <TableCell className="text-right tabular-nums font-bold">
                                        <span className={p.net >= 0 ? 'text-emerald-700 flex items-center justify-end gap-1' : 'text-destructive flex items-center justify-end gap-1'}>
                                            {p.net >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                                            Rs. {p.net.toLocaleString('en-IN')}
                                        </span>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex flex-wrap gap-1">
                                            {Object.entries(p.categoryBreakdown).map(([cat, amt]) => (
                                                <Badge key={cat} variant="outline" className="text-[9px] font-normal">{cat}: Rs. {amt.toLocaleString('en-IN')}</Badge>
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
