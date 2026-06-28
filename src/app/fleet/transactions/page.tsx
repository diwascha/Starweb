'use client';

import { useState, useEffect, useMemo } from 'react';
import type { Transaction, Vehicle, Party } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { PlusCircle, Search, ArrowUpDown, MoreHorizontal, View, Trash2, CalendarIcon, Download } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { useAuth } from '@/hooks/use-auth';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { format, isWithinInterval, startOfDay, endOfDay } from 'date-fns';
import { cn, toNepaliDate } from '@/lib/utils';
import type { DateRange } from 'react-day-picker';
import { DualDateRangePicker } from '@/components/ui/dual-date-range-picker';
import { onTransactionsUpdate, deleteVoucher } from '@/services/transaction-service';
import { onVehiclesUpdate } from '@/services/vehicle-service';
import { onPartiesUpdate } from '@/services/party-service';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipProvider, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

type TransactionSortKey = 'date' | 'vehicleName' | 'type' | 'partyName' | 'amount' | 'category';
type SortDirection = 'asc' | 'desc';
type TransactionFilterType = 'All' | 'Payment' | 'Receipt' | 'Sales' | 'Purchase';

export default function FinancialHistoryPage() {
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [parties, setParties] = useState<Party[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const router = useRouter();
    
    // Search & Filter
    const [searchQuery, setSearchQuery] = useState('');
    const [sortConfig, setSortConfig] = useState<{ key: TransactionSortKey; direction: SortDirection }>({ key: 'date', direction: 'desc' });
    const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
    const [activeTab, setActiveTab] = useState<TransactionFilterType>('All');
    const [filterPartyId, setFilterPartyId] = useState<string>('All');
    
    const { toast } = useToast();
    const { hasPermission, user } = useAuth();
    
    // Memos for performance
    const vehiclesById = useMemo(() => new Map(vehicles.map(v => [v.id, v.name])), [vehicles]);
    const partiesById = useMemo(() => new Map(parties.map(p => [p.id, p.name])), [parties]);

    // Data fetching
    useEffect(() => {
        setIsLoading(true);
        const unsubTxns = onTransactionsUpdate(setTransactions);
        const unsubVehicles = onVehiclesUpdate(setVehicles);
        const unsubParties = onPartiesUpdate(setParties);
        setIsLoading(false);

        return () => {
            unsubTxns();
            unsubVehicles();
            unsubParties();
        }
    }, []);

    const handleDeleteVoucher = async (voucherId?: string) => {
        if (!voucherId) return;
        try {
            await deleteVoucher(voucherId);
            toast({ title: 'Voucher Deleted', description: 'All associated entries have been removed.' });
        } catch (error) {
             toast({ title: 'Error', description: 'Failed to delete entries.', variant: 'destructive' });
        }
    };
    
    const requestSort = (key: TransactionSortKey) => {
        setSortConfig(prev => ({
            key,
            direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
        }));
    };

    const sortedAndFilteredTransactions = useMemo(() => {
        let augmented = transactions.map(t => ({
            ...t,
            vehicleName: vehiclesById.get(t.vehicleId) || 'N/A',
            partyName: t.partyId ? partiesById.get(t.partyId) || 'N/A' : 'N/A',
        }));

        if (activeTab !== 'All') {
            augmented = augmented.filter(t => t.type === activeTab);
        }
        
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            augmented = augmented.filter(t =>
                t.vehicleName.toLowerCase().includes(query) ||
                t.partyName.toLowerCase().includes(query) ||
                (t.remarks || '').toLowerCase().includes(query) ||
                (t.category || '').toLowerCase().includes(query)
            );
        }

        if (dateRange?.from) {
            const interval = { start: startOfDay(dateRange.from), end: endOfDay(dateRange.to || dateRange.from) };
            augmented = augmented.filter(t => isWithinInterval(new Date(t.date), interval));
        }
        
        if (filterPartyId !== 'All') augmented = augmented.filter(t => t.partyId === filterPartyId);
        
        augmented.sort((a, b) => {
            const aVal = (a[sortConfig.key] || '').toString();
            const bVal = (b[sortConfig.key] || '').toString();
            if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
        
        return augmented;
    }, [transactions, searchQuery, sortConfig, vehiclesById, partiesById, dateRange, activeTab, filterPartyId]);
    
     const handleExport = async () => {
        const XLSX = (await import('xlsx'));
        const dataToExport = sortedAndFilteredTransactions.map(t => ({
            'Date': toNepaliDate(t.date),
            'Vehicle': t.vehicleName,
            'Type': t.type,
            'Category': t.category || 'N/A',
            'Ledger': t.partyName,
            'Mode': t.billingType,
            'Amount': ['Purchase', 'Payment'].includes(t.type) ? -t.amount : t.amount,
            'Remarks': t.remarks,
        }));
        const worksheet = XLSX.utils.json_to_sheet(dataToExport);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Financial Logs");
        XLSX.writeFile(workbook, `Fleet_Accounting_Logs_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
    };

    return (
        <div className="flex flex-col gap-8">
            <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Account Logs</h1>
                    <p className="text-muted-foreground">Comprehensive financial history for Sijan Dhuwani Sewa.</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={handleExport}><Download className="mr-2 h-4 w-4" /> Export All</Button>
                    <Button onClick={() => router.push('/fleet/transactions/payment-receipt/new')}>
                        <PlusCircle className="mr-2 h-4 w-4" /> New Voucher
                    </Button>
                </div>
            </header>

            <div className="flex flex-col gap-4">
                <div className="flex flex-col md:flex-row gap-2">
                    <div className="relative flex-1">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input placeholder="Search logs..." className="pl-8" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                    </div>
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button variant="outline" className={cn("w-full md:w-[300px] justify-start text-left font-normal", !dateRange && "text-muted-foreground")}>
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {dateRange?.from ? (dateRange.to ? (`${format(dateRange.from, "LLL dd, y")} - ${format(dateRange.to, "LLL dd, y")}`) : format(dateRange.from, "LLL dd, y")) : (<span>Pick a date range</span>)}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="end">
                            <DualDateRangePicker selected={dateRange} onSelect={setDateRange} />
                        </PopoverContent>
                    </Popover>
                    <Select value={filterPartyId} onValueChange={setFilterPartyId}>
                        <SelectTrigger className="w-full md:w-[180px]">
                            <SelectValue placeholder="All Ledgers" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="All">All Ledgers</SelectItem>
                            {parties.filter(p => p.ownership !== 'Shivam').map(p => (
                                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
                    <TabsList>
                        <TabsTrigger value="All">All Entries</TabsTrigger>
                        <TabsTrigger value="Payment">Payments</TabsTrigger>
                        <TabsTrigger value="Receipt">Receipts</TabsTrigger>
                        <TabsTrigger value="Purchase">Purchases</TabsTrigger>
                        <TabsTrigger value="Sales">Sales</TabsTrigger>
                    </TabsList>
                    <TabsContent value={activeTab} className="mt-4">
                        <Card>
                            <Table>
                                <TableHeader className="bg-muted/50">
                                    <TableRow>
                                        <TableHead><Button variant="ghost" onClick={() => requestSort('date')} className="-ml-4">Date <ArrowUpDown className="ml-2 h-3 w-3" /></Button></TableHead>
                                        <TableHead><Button variant="ghost" onClick={() => requestSort('vehicleName')} className="-ml-4">Vehicle <ArrowUpDown className="ml-2 h-3 w-3" /></Button></TableHead>
                                        <TableHead><Button variant="ghost" onClick={() => requestSort('type')} className="-ml-4">Type <ArrowUpDown className="ml-2 h-3 w-3" /></Button></TableHead>
                                        <TableHead><Button variant="ghost" onClick={() => requestSort('category')} className="-ml-4">Category <ArrowUpDown className="ml-2 h-3 w-3" /></Button></TableHead>
                                        <TableHead><Button variant="ghost" onClick={() => requestSort('partyName')} className="-ml-4">Ledger (A/C) <ArrowUpDown className="ml-2 h-3 w-3" /></Button></TableHead>
                                        <TableHead className="text-right"><Button variant="ghost" onClick={() => requestSort('amount')} className="-ml-4 w-full text-right">Amount <ArrowUpDown className="ml-2 h-3 w-3" /></Button></TableHead>
                                        <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {sortedAndFilteredTransactions.map(txn => (
                                        <TableRow key={txn.id} className="hover:bg-muted/30">
                                            <TableCell className="font-medium text-xs whitespace-nowrap">{toNepaliDate(txn.date)}</TableCell>
                                            <TableCell className="font-semibold text-xs">{txn.vehicleName}</TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className={cn(
                                                    "text-[10px] uppercase",
                                                    ['Receipt', 'Sales'].includes(txn.type) ? 'text-green-600 border-green-200 bg-green-50' : 'text-red-600 border-red-200 bg-red-50'
                                                )}>{txn.type}</Badge>
                                            </TableCell>
                                            <TableCell><span className="text-[10px] text-muted-foreground uppercase font-bold">{txn.category || 'N/A'}</span></TableCell>
                                            <TableCell className="text-xs">{txn.partyName}</TableCell>
                                            <TableCell className={cn("text-right font-mono font-bold", ['Purchase', 'Payment'].includes(txn.type) ? 'text-red-600' : 'text-green-600')}>
                                                {['Purchase', 'Payment'].includes(txn.type) && '-'}{txn.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end">
                                                        <DropdownMenuItem onSelect={() => router.push(txn.voucherId ? `/fleet/transactions/payment-receipt?voucherId=${txn.voucherId}` : `/fleet/transactions/view?id=${txn.id}`)}><View className="mr-2 h-4 w-4" /> View Voucher</DropdownMenuItem>
                                                        {hasPermission('fleet', 'edit') && (
                                                            <DropdownMenuItem onSelect={() => router.push(txn.voucherId ? `/fleet/transactions/payment-receipt/edit?voucherId=${txn.voucherId}` : `/fleet/transactions/edit?id=${txn.id}`)}><Edit className="mr-2 h-4 w-4" /> Edit Entry</DropdownMenuItem>
                                                        )}
                                                        <DropdownMenuSeparator />
                                                        {hasPermission('fleet', 'delete') && (
                                                            <AlertDialog><AlertDialogTrigger asChild><DropdownMenuItem onSelect={e => e.preventDefault()} className="text-destructive"><Trash2 className="mr-2 h-4 w-4" /> Delete</DropdownMenuItem></AlertDialogTrigger>
                                                            <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete Financial Entry?</AlertDialogTitle><AlertDialogDescription>This will permanently remove the transaction record. If this was part of a group voucher, all associated entries will be deleted.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => handleDeleteVoucher(txn.voucherId || txn.id)}>Delete Everything</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
                                                        )}
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {sortedAndFilteredTransactions.length === 0 && <TableRow><TableCell colSpan={7} className="text-center py-12 text-muted-foreground">No financial logs found.</TableCell></TableRow>}
                                </TableBody>
                            </Table>
                        </Card>
                    </TabsContent>
                </Tabs>
            </div>
        </div>
    );
}