'use client';

import { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TableEmptyState } from '@/components/ui/table-empty-state';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Users, Search, ArrowDownCircle, ArrowUpCircle } from 'lucide-react';
import { onTransactionsUpdate } from '@/services/transaction-service';
import { onPartiesUpdate } from '@/services/party-service';
import type { Transaction, Party } from '@/lib/types';
import { useOwnershipScope } from '@/hooks/use-ownership-scope';
import { NEPALI_MONTHS } from '@/lib/constants';
import NepaliDate from 'nepali-date-converter';
import { LedgerToolbar, type LedgerColumn } from '../_components/ledger-toolbar';
import { SortableHead } from '../_components/sortable-head';
import { LedgerFilterBar } from '../_components/ledger-filter-bar';

interface PartyDue {
    party: Party;
    debit: number;
    credit: number;
    balance: number; // > 0 = they owe us (receivable), < 0 = we owe them (payable)
}

type SortKey = 'name' | 'type' | 'debit' | 'credit' | 'balance';
type SortDirection = 'asc' | 'desc';

export function PartyDuesView() {
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [parties, setParties] = useState<Party[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [showZero, setShowZero] = useState(false);
    const [filterYear, setFilterYear] = useState('All');
    const [filterMonth, setFilterMonth] = useState('All');
    const [filterPartyId, setFilterPartyId] = useState('All');
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection }>({ key: 'balance', direction: 'desc' });
    const { inScope } = useOwnershipScope('fleet');

    useEffect(() => {
        let loaded = 0;
        const check = () => { loaded++; if (loaded >= 2) setIsLoading(false); };
        const unsubTx = onTransactionsUpdate(data => { setTransactions(data.filter(x => inScope(x.ownership))); check(); });
        const unsubParty = onPartiesUpdate(data => { setParties(data.filter(x => inScope(x.ownership))); check(); });
        return () => { unsubTx(); unsubParty(); };
    }, [inScope]);

    const availableYears = useMemo(() => {
        const years = new Set<number>();
        transactions.forEach(t => { try { years.add(new NepaliDate(new Date(t.date)).getYear()); } catch {} });
        return Array.from(years).sort((a, b) => b - a);
    }, [transactions]);

    const filteredTransactions = useMemo(() => {
        if (filterYear === 'All' && filterMonth === 'All') return transactions;
        return transactions.filter(t => {
            try {
                const bs = new NepaliDate(new Date(t.date));
                if (filterYear !== 'All' && bs.getYear() !== Number(filterYear)) return false;
                if (filterMonth !== 'All' && bs.getMonth() !== Number(filterMonth)) return false;
                return true;
            } catch {
                return false;
            }
        });
    }, [transactions, filterYear, filterMonth]);

    const partyDues = useMemo<PartyDue[]>(() => {
        return parties
            .filter(party => filterPartyId === 'All' || party.id === filterPartyId)
            .map(party => {
                const partyTxns = filteredTransactions.filter(t => t.partyId === party.id);
                const debit = partyTxns.filter(t => t.type === 'Payment' || t.type === 'Sales').reduce((s, t) => s + t.amount, 0);
                const credit = partyTxns.filter(t => t.type === 'Purchase' || t.type === 'Receipt').reduce((s, t) => s + t.amount, 0);
                return { party, debit, credit, balance: debit - credit };
            })
            .filter(p => showZero || Math.abs(p.balance) > 0.5)
            .filter(p => p.party.name.toLowerCase().includes(search.toLowerCase()))
            .sort((a, b) => {
                const getSortValue = (p: PartyDue) => sortConfig.key === 'name' ? p.party.name : sortConfig.key === 'type' ? p.party.type : p[sortConfig.key];
                const aVal = getSortValue(a);
                const bVal = getSortValue(b);
                if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
                if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
    }, [parties, filteredTransactions, search, showZero, filterPartyId, sortConfig]);

    const requestSort = (key: SortKey) => {
        setSortConfig(prev => ({ key, direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc' }));
    };

    const totals = useMemo(() => partyDues.reduce((acc, p) => ({
        receivable: acc.receivable + (p.balance > 0 ? p.balance : 0),
        payable: acc.payable + (p.balance < 0 ? -p.balance : 0),
    }), { receivable: 0, payable: 0 }), [partyDues]);

    const exportColumns: LedgerColumn<PartyDue>[] = [
        { header: 'Party', value: p => p.party.name },
        { header: 'Type', value: p => p.party.type },
        { header: 'Debit', align: 'right', value: p => p.debit.toLocaleString() },
        { header: 'Credit', align: 'right', value: p => p.credit.toLocaleString() },
        { header: 'Balance', align: 'right', value: p => Math.abs(p.balance).toLocaleString() },
        { header: 'Status', value: p => p.balance > 0.5 ? 'Receivable' : p.balance < -0.5 ? 'Payable' : 'Settled' },
    ];

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-black tracking-tight flex items-center gap-2"><Users className="h-6 w-6 text-primary" /> Party-wise Payment Due</h1>
                    <p className="text-sm text-muted-foreground">Outstanding balance per customer/vendor across all fleet transactions and vouchers.</p>
                </div>
                <LedgerToolbar
                    title="Party-wise Payment Due"
                    subtitle={`Party: ${filterPartyId === 'All' ? 'All' : parties.find(p => p.id === filterPartyId)?.name} | Year: ${filterYear} | Month: ${filterMonth}`}
                    columns={exportColumns}
                    rows={partyDues}
                    filenamePrefix="Party_Dues"
                />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Card><CardHeader className="pb-2"><CardDescription className="flex items-center gap-1"><ArrowDownCircle className="h-3.5 w-3.5 text-emerald-600" /> Total Receivable (owed to us)</CardDescription><CardTitle className="text-2xl text-emerald-600">Rs. {totals.receivable.toLocaleString()}</CardTitle></CardHeader></Card>
                <Card><CardHeader className="pb-2"><CardDescription className="flex items-center gap-1"><ArrowUpCircle className="h-3.5 w-3.5 text-destructive" /> Total Payable (we owe)</CardDescription><CardTitle className="text-2xl text-destructive">Rs. {totals.payable.toLocaleString()}</CardTitle></CardHeader></Card>
            </div>

            <Card>
                <CardContent className="pt-6 space-y-4">
                    <LedgerFilterBar className="rounded-lg p-3 items-center">
                        <div className="relative flex-1 min-w-[180px] max-w-sm">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input placeholder="Search party..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9" />
                        </div>
                        <Select value={filterPartyId} onValueChange={setFilterPartyId}>
                            <SelectTrigger className="h-9 w-44"><SelectValue placeholder="All Parties" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="All">All Parties</SelectItem>
                                {parties.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
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
                        <Button variant="outline" size="sm" className="h-9 text-xs sm:ml-auto" onClick={() => setShowZero(v => !v)}>
                            {showZero ? 'Hide settled parties' : 'Show all parties'}
                        </Button>
                    </LedgerFilterBar>

                    <Table>
                        <TableHeader>
                            <TableRow>
                                <SortableHead label="Party" active={sortConfig.key === 'name'} onClick={() => requestSort('name')} />
                                <SortableHead label="Type" active={sortConfig.key === 'type'} onClick={() => requestSort('type')} />
                                <SortableHead label="Debit" align="right" active={sortConfig.key === 'debit'} onClick={() => requestSort('debit')} />
                                <SortableHead label="Credit" align="right" active={sortConfig.key === 'credit'} onClick={() => requestSort('credit')} />
                                <SortableHead label="Balance" align="right" active={sortConfig.key === 'balance'} onClick={() => requestSort('balance')} />
                                <TableHead>Status</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {!isLoading && partyDues.length === 0 && <TableEmptyState colSpan={6} message="No outstanding balances." icon={Users} />}
                            {partyDues.map(p => (
                                <TableRow key={p.party.id}>
                                    <TableCell className="font-semibold">{p.party.name}</TableCell>
                                    <TableCell><Badge variant="outline" className="text-[9px]">{p.party.type}</Badge></TableCell>
                                    <TableCell className="text-right tabular-nums">Rs. {p.debit.toLocaleString()}</TableCell>
                                    <TableCell className="text-right tabular-nums">Rs. {p.credit.toLocaleString()}</TableCell>
                                    <TableCell className="text-right tabular-nums font-bold">Rs. {Math.abs(p.balance).toLocaleString()}</TableCell>
                                    <TableCell>
                                        {p.balance > 0.5 ? (
                                            <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[9px]">Receivable</Badge>
                                        ) : p.balance < -0.5 ? (
                                            <Badge className="bg-destructive/10 text-destructive border-destructive/20 text-[9px]">Payable</Badge>
                                        ) : (
                                            <Badge variant="outline" className="text-[9px]">Settled</Badge>
                                        )}
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
