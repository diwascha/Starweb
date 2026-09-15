'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  PlusCircle,
  MoreHorizontal,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Eye,
} from 'lucide-react';
import type { Vehicle, Party, Transaction } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toNepaliDate } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import { useOwnershipScope } from '@/hooks/use-ownership-scope';
import { onTransactionsUpdate, deleteTransaction } from '@/services/transaction-service';
import { onVehiclesUpdate } from '@/services/vehicle-service';
import { onPartiesUpdate } from '@/services/party-service';
import { isWithinInterval, startOfDay, endOfDay } from 'date-fns';
import type { DateRange } from 'react-day-picker';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import NepaliDate from 'nepali-date-converter';
import { LedgerToolbar, type LedgerColumn } from '../_components/ledger-toolbar';
import { SortableHead } from '../_components/sortable-head';
import { LedgerFilterBar, LedgerFilterField } from '../_components/ledger-filter-bar';

type SortKey = 'date' | 'purchaseNumber' | 'vehicle' | 'party' | 'billingType' | 'amount';
type SortDirection = 'asc' | 'desc';

export function PurchaseView() {
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [parties, setParties] = useState<Party[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(10);
    
    const [searchQuery, setSearchQuery] = useState('');
    const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
    const [filterVehicleId, setFilterVehicleId] = useState('All');
    const [filterPartyId, setFilterPartyId] = useState('All');
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection }>({ key: 'date', direction: 'desc' });

    const { hasPermission } = useAuth();
    const { inScope } = useOwnershipScope('fleet');
    const router = useRouter();

    useEffect(() => {
        setIsLoading(true);
        const unsubs = [
            onTransactionsUpdate((data) => setTransactions(data.filter(t => inScope(t.ownership)))),
            onVehiclesUpdate((data) => setVehicles(data.filter(v => inScope(v.ownership)))),
            onPartiesUpdate((data) => setParties(data.filter(p => inScope(p.ownership)))),
        ];
        setIsLoading(false);
        return () => unsubs.forEach(u => u());
    }, [inScope]);

    const vehiclesById = useMemo(() => new Map(vehicles.map(v => [v.id, v.name])), [vehicles]);
    const partiesById = useMemo(() => new Map(parties.map(p => [p.id, p.name])), [parties]);

    const filteredAndSorted = useMemo(() => {
        let filtered = transactions.filter(t => t.referenceType === 'Purchase Entry' || !!t.purchaseNumber);

        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            filtered = filtered.filter(t => 
                (t.purchaseNumber || '').toLowerCase().includes(query) ||
                (t.invoiceNumber || '').toLowerCase().includes(query) ||
                (vehiclesById.get(t.vehicleId || '') || '').toLowerCase().includes(query) ||
                (partiesById.get(t.partyId || '') || '').toLowerCase().includes(query)
            );
        }

        if (filterVehicleId !== 'All') {
            filtered = filtered.filter(t => t.vehicleId === filterVehicleId);
        }

        if (filterPartyId !== 'All') {
            filtered = filtered.filter(t => t.partyId === filterPartyId);
        }
        
        if (dateRange?.from) {
            const interval = { start: startOfDay(dateRange.from), end: endOfDay(dateRange.to || dateRange.from) };
            filtered = filtered.filter(t => isWithinInterval(new Date(t.date), interval));
        }

        const getSortValue = (t: Transaction) => {
            switch (sortConfig.key) {
                case 'vehicle': return vehiclesById.get(t.vehicleId || '') || '';
                case 'party': return partiesById.get(t.partyId || '') || '';
                case 'billingType': return t.billingType || '';
                default: return (t as any)[sortConfig.key] || '';
            }
        };

        filtered.sort((a, b) => {
            const aVal = getSortValue(a);
            const bVal = getSortValue(b);
            if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });

        return filtered;
    }, [transactions, searchQuery, dateRange, filterVehicleId, filterPartyId, sortConfig, vehiclesById, partiesById]);

    const requestSort = (key: SortKey) => {
        setSortConfig(prev => ({ key, direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc' }));
    };

    const paginated = filteredAndSorted.slice((currentPage - 1) * itemsPerPage, itemsPerPage === -1 ? undefined : currentPage * itemsPerPage);
    const totalPages = itemsPerPage === -1 ? 1 : Math.ceil(filteredAndSorted.length / itemsPerPage);

    const exportColumns: LedgerColumn<Transaction>[] = [
        { header: 'Date (BS)', value: t => toNepaliDate(t.date) },
        { header: 'Purchase #', value: t => t.purchaseNumber || `INV-${t.id.substring(0, 4)}` },
        { header: 'Supplier', value: t => partiesById.get(t.partyId || '') || 'N/A' },
        { header: 'Truck', value: t => vehiclesById.get(t.vehicleId || '') || 'N/A' },
        { header: 'Mode', value: t => t.billingType },
        { header: 'Amount', align: 'right', value: t => t.amount.toLocaleString(undefined, { minimumFractionDigits: 2 }) },
    ];

    return (
        <div className="flex flex-col gap-8">
            <header className="flex flex-col md:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-gray-900">Purchase History</h1>
                    <p className="text-muted-foreground text-sm">Procurement logs for parts, fuel, and fleet assets.</p>
                </div>
                <div className="flex items-center gap-2">
                    <LedgerToolbar
                        title="Purchase History"
                        subtitle={`Supplier: ${filterPartyId === 'All' ? 'All' : partiesById.get(filterPartyId)} | Truck: ${filterVehicleId === 'All' ? 'All' : vehiclesById.get(filterVehicleId)}`}
                        columns={exportColumns}
                        rows={filteredAndSorted}
                        filenamePrefix="Purchase_History"
                    />
                    {hasPermission('fleet', 'create') && (
                        <Button onClick={() => router.push('/fleet/transactions/purchase/new')}>
                            <PlusCircle className="mr-2 h-4 w-4" /> New Purchase
                        </Button>
                    )}
                </div>
            </header>

            <LedgerFilterBar>
                <LedgerFilterField label="Search" className="min-w-[200px]">
                    <Input placeholder="Search POs or Vendors..." className="h-9 text-xs bg-white" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
                </LedgerFilterField>
                <LedgerFilterField label="Supplier" className="w-[180px]">
                    <Select value={filterPartyId} onValueChange={setFilterPartyId}>
                        <SelectTrigger className="h-9 bg-white"><SelectValue placeholder="All Vendors" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="All">All Vendors</SelectItem>
                            {parties.filter(p => p.ownership === 'Sijan' || p.ownership === 'Both').map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </LedgerFilterField>
                <LedgerFilterField label="Truck" className="w-[150px]">
                    <Select value={filterVehicleId} onValueChange={setFilterVehicleId}>
                        <SelectTrigger className="h-9 bg-white"><SelectValue placeholder="All Trucks" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="All">All Trucks</SelectItem>
                            {vehicles.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </LedgerFilterField>
            </LedgerFilterBar>

            <Card className="shadow-sm border-gray-100 overflow-hidden">
                <Table>
                    <TableHeader className="bg-muted/50">
                        <TableRow>
                            <SortableHead label="Date (BS)" className="pl-6" active={sortConfig.key === 'date'} onClick={() => requestSort('date')} />
                            <SortableHead label="Purchase #" active={sortConfig.key === 'purchaseNumber'} onClick={() => requestSort('purchaseNumber')} />
                            <SortableHead label="Supplier" active={sortConfig.key === 'party'} onClick={() => requestSort('party')} />
                            <SortableHead label="Truck" active={sortConfig.key === 'vehicle'} onClick={() => requestSort('vehicle')} />
                            <SortableHead label="Mode" active={sortConfig.key === 'billingType'} onClick={() => requestSort('billingType')} />
                            <SortableHead label="Amount" align="right" className="text-right pr-6" active={sortConfig.key === 'amount'} onClick={() => requestSort('amount')} />
                            <TableHead className="w-10 pr-6"></TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {paginated.map(t => (
                            <TableRow key={t.id} className="h-14 hover:bg-muted/10 transition-colors">
                                <TableCell className="pl-6 font-medium text-xs whitespace-nowrap">{toNepaliDate(t.date)}</TableCell>
                                <TableCell className="font-mono text-xs font-bold text-blue-600">{t.purchaseNumber || 'INV-' + t.id.substring(0,4)}</TableCell>
                                <TableCell className="text-sm font-semibold">{partiesById.get(t.partyId || '') || 'N/A'}</TableCell>
                                <TableCell className="text-xs uppercase font-bold text-muted-foreground">{vehiclesById.get(t.vehicleId || '') || 'N/A'}</TableCell>
                                <TableCell>
                                    <Badge variant={t.billingType === 'Credit' ? 'destructive' : 'outline'} className="text-[9px] uppercase font-black">
                                        {t.billingType}
                                    </Badge>
                                </TableCell>
                                <TableCell className="text-right font-black tabular-nums">Rs. {t.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                <TableCell className="text-right pr-6">
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4"/></Button></DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            <DropdownMenuItem onSelect={() => router.push(`/fleet/transactions/purchase/view?id=${t.id}`)}><Eye className="mr-2 h-4 w-4" /> View Voucher</DropdownMenuItem>
                                            <DropdownMenuItem onSelect={() => deleteTransaction(t.id)} className="text-destructive"><Trash2 className="mr-2 h-4 w-4" /> Delete</DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </TableCell>
                            </TableRow>
                        ))}
                        {filteredAndSorted.length === 0 && <TableRow><TableCell colSpan={7} className="h-32 text-center text-muted-foreground italic">No purchase records found.</TableCell></TableRow>}
                    </TableBody>
                </Table>
                {totalPages > 1 && (
                    <CardFooter className="py-4 border-t flex justify-between bg-muted/5">
                        <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => p - 1)} disabled={currentPage === 1}><ChevronLeft className="h-4 w-4"/></Button>
                        <span className="text-xs font-bold">Page {currentPage} of {totalPages}</span>
                        <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => p + 1)} disabled={currentPage === totalPages}><ChevronRight className="h-4 w-4"/></Button>
                    </CardFooter>
                )}
            </Card>
        </div>
    );
}
