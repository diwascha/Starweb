'use client';

import { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TableEmptyState } from '@/components/ui/table-empty-state';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Users, Search, ArrowDownCircle, ArrowUpCircle } from 'lucide-react';
import { onTransactionsUpdate } from '@/services/transaction-service';
import { onPartiesUpdate } from '@/services/party-service';
import type { Transaction, Party } from '@/lib/types';
import { useOwnershipScope } from '@/hooks/use-ownership-scope';

interface PartyDue {
    party: Party;
    debit: number;
    credit: number;
    balance: number; // > 0 = they owe us (receivable), < 0 = we owe them (payable)
}

export default function PartyDuesPage() {
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [parties, setParties] = useState<Party[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [showZero, setShowZero] = useState(false);
    const { inScope } = useOwnershipScope('fleet');

    useEffect(() => {
        let loaded = 0;
        const check = () => { loaded++; if (loaded >= 2) setIsLoading(false); };
        const unsubTx = onTransactionsUpdate(data => { setTransactions(data.filter(x => inScope(x.ownership))); check(); });
        const unsubParty = onPartiesUpdate(data => { setParties(data.filter(x => inScope(x.ownership))); check(); });
        return () => { unsubTx(); unsubParty(); };
    }, [inScope]);

    const partyDues = useMemo<PartyDue[]>(() => {
        return parties.map(party => {
            const partyTxns = transactions.filter(t => t.partyId === party.id);
            const debit = partyTxns.filter(t => t.type === 'Payment' || t.type === 'Sales').reduce((s, t) => s + t.amount, 0);
            const credit = partyTxns.filter(t => t.type === 'Purchase' || t.type === 'Receipt').reduce((s, t) => s + t.amount, 0);
            return { party, debit, credit, balance: debit - credit };
        })
        .filter(p => showZero || Math.abs(p.balance) > 0.5)
        .filter(p => p.party.name.toLowerCase().includes(search.toLowerCase()))
        .sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));
    }, [parties, transactions, search, showZero]);

    const totals = useMemo(() => partyDues.reduce((acc, p) => ({
        receivable: acc.receivable + (p.balance > 0 ? p.balance : 0),
        payable: acc.payable + (p.balance < 0 ? -p.balance : 0),
    }), { receivable: 0, payable: 0 }), [partyDues]);

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-black tracking-tight flex items-center gap-2"><Users className="h-6 w-6 text-primary" /> Party-wise Payment Due</h1>
                <p className="text-sm text-muted-foreground">Outstanding balance per customer/vendor across all fleet transactions and vouchers.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Card><CardHeader className="pb-2"><CardDescription className="flex items-center gap-1"><ArrowDownCircle className="h-3.5 w-3.5 text-emerald-600" /> Total Receivable (owed to us)</CardDescription><CardTitle className="text-2xl text-emerald-600">Rs. {totals.receivable.toLocaleString()}</CardTitle></CardHeader></Card>
                <Card><CardHeader className="pb-2"><CardDescription className="flex items-center gap-1"><ArrowUpCircle className="h-3.5 w-3.5 text-destructive" /> Total Payable (we owe)</CardDescription><CardTitle className="text-2xl text-destructive">Rs. {totals.payable.toLocaleString()}</CardTitle></CardHeader></Card>
            </div>

            <Card>
                <CardContent className="pt-6 space-y-4">
                    <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
                        <div className="relative flex-1 max-w-sm">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input placeholder="Search party..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9" />
                        </div>
                        <Button variant="outline" size="sm" className="h-9 text-xs" onClick={() => setShowZero(v => !v)}>
                            {showZero ? 'Hide settled parties' : 'Show all parties'}
                        </Button>
                    </div>

                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Party</TableHead>
                                <TableHead>Type</TableHead>
                                <TableHead className="text-right">Debit</TableHead>
                                <TableHead className="text-right">Credit</TableHead>
                                <TableHead className="text-right">Balance</TableHead>
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
