'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import type { Transaction, Vehicle, Party } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { PlusCircle, Search, ArrowUpDown, MoreHorizontal, View, Edit, Trash2, User, Download, CalendarIcon } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn, toNepaliDate } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import { onTransactionsUpdate, deleteTransaction } from '@/services/transaction-service';
import { onVehiclesUpdate } from '@/services/vehicle-service';
import { onPartiesUpdate } from '@/services/party-service';
import { Tooltip, TooltipProvider, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { format, isWithinInterval, startOfDay, endOfDay } from 'date-fns';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DualDateRangePicker } from '@/components/ui/dual-date-range-picker';
import type { DateRange } from 'react-day-picker';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';

type SortKey = 'date' | 'vehicleName' | 'partyName' | 'amount' | 'authorship' | 'category';
type SortDirection = 'asc' | 'desc';

export default function PurchaseLogsPage() {
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [parties, setParties] = useState<Party[]>([]);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    
    const [searchQuery, setSearchQuery] = useState('');
    const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection }>({ key: 'date', direction: 'desc' });
    const [filterVehicleId, setFilterVehicleId] = useState<string>('All');
    const [filterPartyId, setFilterPartyId] = useState<string>('All');

    const { toast } = useToast();
    const { user, hasPermission } = useAuth();
    const router = useRouter();

    useEffect(() => {
        setIsLoading(true);
        const unsubs = [
            onVehiclesUpdate(setVehicles),
            onPartiesUpdate(setParties),
            onTransactionsUpdate(setTransactions)
        ];
        setIsLoading(false);
        return () => unsubs.forEach(u => u());
    }, []);

    const handleDelete = async (id: string) => {
        try {
            await deleteTransaction(id);
            toast({ title: 'Success', description: 'Purchase deleted.' });
        } catch (error) {
             toast({ title: 'Error', description: 'Failed to delete purchase.', variant: 'destructive' });
        }
    };

    const requestSort = (key: SortKey) => {
        setSortConfig(prev => ({
            key,
            direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
        }));
    };

    const vehiclesById = useMemo(() => new Map(vehicles.map(v => [v.id, v.name])), [vehicles]);
    const partiesById = useMemo(() => new Map(parties.map(p => [p.id, p.name])), [parties]);
    const suppliers = useMemo(() => parties.filter(p => p.type === 'Vendor' || p.type === 'Both'), [parties]);

    const filteredAndSortedPurchases = useMemo(() => {
        let filtered = transactions.filter(t => t.type === 'Purchase');

        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            filtered = filtered.filter(t => 
                (vehiclesById.get(t.vehicleId) || '').toLowerCase().includes(query) ||
                (partiesById.get(t.partyId!) || '').toLowerCase().includes(query) ||
                (t.invoiceNumber || '').toLowerCase().includes(query) ||
                (t.category || '').toLowerCase().includes(query)
            );
        }
        
        if (dateRange?.from) {
            const interval = { start: startOfDay(dateRange.from), end: endOfDay(dateRange.to || dateRange.from) };
            filtered = filtered.filter(t => isWithinInterval(new Date(t.date), interval));
        }
        
        if (filterVehicleId !== 'All') filtered = filtered.filter(v => v.vehicleId === filterVehicleId);
        if (filterPartyId !== 'All') filtered = filtered.filter(v => v.partyId === filterPartyId);
        
        filtered.sort((a, b) => {
            if (sortConfig.key === 'authorship') {
                const aDate = a.lastModifiedAt || a.createdAt;
                const bDate = b.lastModifiedAt || b.createdAt;
                if (!aDate || !bDate) return 0;
                const res = aDate < bDate ? -1 : 1;
                return sortConfig.direction === 'asc' ? res : -res;
            }
            
            let aVal, bVal;
            if (sortConfig.key === 'vehicleName') {
                aVal = vehiclesById.get(a.vehicleId) || '';
                bVal = vehiclesById.get(b.vehicleId) || '';
            } else if (sortConfig.key === 'partyName') {
                 aVal = partiesById.get(a.partyId!) || '';
                 bVal = partiesById.get(b.partyId!) || '';
            } else {
                aVal = a[sortConfig.key as keyof Transaction] || '';
                bVal = b[sortConfig.key as keyof Transaction] || '';
            }

            if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });

        return filtered;
    }, [transactions, searchQuery, dateRange, sortConfig, filterVehicleId, filterPartyId, vehiclesById, partiesById]);

    const handleExport = async () => {
        const XLSX = (await import('xlsx'));
        const dataToExport = filteredAndSortedPurchases.map(p => ({
            'Date': toNepaliDate(p.date),
            'Vehicle': vehiclesById.get(p.vehicleId),
            'Category': p.category || 'N/A',
            'Supplier': partiesById.get(p.partyId!),
            'Invoice #': p.invoiceNumber,
            'Amount': p.amount,
            'Posted By': p.createdBy,
        }));
        const worksheet = XLSX.utils.json_to_sheet(dataToExport);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Purchases");
        XLSX.writeFile(workbook, `Purchase_Logs_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
    };

    return (
        <div className="flex flex-col gap-8">
            <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Purchase Logs</h1>
                    <p className="text-muted-foreground">Historical records of all fleet procurement and maintenance expenses.</p>
                </div>
                <Button onClick={() => router.push('/fleet/transactions/purchase/new')}>
                    <PlusCircle className="mr-2 h-4 w-4" /> New Purchase Entry
                </Button>
            </header>

            <div className="flex flex-col md:flex-row gap-4 items-end">
                <div className="flex-1 space-y-1.5 w-full">
                    <Label className="text-xs uppercase text-muted-foreground font-bold">Search</Label>
                    <div className="relative">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input type="search" placeholder="Search supplier, invoice, vehicle..." className="pl-8" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                    </div>
                </div>
                <div className="space-y-1.5 w-full md:w-[250px]">
                    <Label className="text-xs uppercase text-muted-foreground font-bold">Date Range</Label>
                    <Popover><PopoverTrigger asChild><Button variant="outline" className={cn("w-full justify-start text-left font-normal", !dateRange && "text-muted-foreground")}><CalendarIcon className="mr-2 h-4 w-4" />{dateRange?.from ? (dateRange.to ? (`${format(dateRange.from, "LLL dd, y")} - ${format(dateRange.to, "LLL dd, y")}`) : format(dateRange.from, "LLL dd, y")) : (<span>Pick dates</span>)}</Button></PopoverTrigger><PopoverContent className="w-auto p-0" align="end"><DualDateRangePicker selected={dateRange} onSelect={setDateRange} /></PopoverContent></Popover>
                </div>
                <div className="space-y-1.5 w-full md:w-[180px]">
                    <Label className="text-xs uppercase text-muted-foreground font-bold">Vehicle</Label>
                    <Select value={filterVehicleId} onValueChange={setFilterVehicleId}><SelectTrigger><SelectValue placeholder="All" /></SelectTrigger><SelectContent><SelectItem value="All">All Vehicles</SelectItem>{vehicles.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}</SelectContent></Select>
                </div>
                <Button variant="outline" onClick={handleExport} className="w-full md:w-auto"><Download className="mr-2 h-4 w-4" /> Export</Button>
            </div>

            <Card>
                <Table>
                    <TableHeader className="bg-muted/50">
                        <TableRow>
                            <TableHead><Button variant="ghost" onClick={() => requestSort('date')} className="-ml-4">Date <ArrowUpDown className="ml-2 h-3 w-3" /></Button></TableHead>
                            <TableHead><Button variant="ghost" onClick={() => requestSort('vehicleName')} className="-ml-4">Vehicle <ArrowUpDown className="ml-2 h-3 w-3" /></Button></TableHead>
                            <TableHead><Button variant="ghost" onClick={() => requestSort('category')} className="-ml-4">Category <ArrowUpDown className="ml-2 h-3 w-3" /></Button></TableHead>
                            <TableHead><Button variant="ghost" onClick={() => requestSort('partyName')} className="-ml-4">Supplier <ArrowUpDown className="ml-2 h-3 w-3" /></Button></TableHead>
                            <TableHead><Button variant="ghost" onClick={() => requestSort('amount')} className="-ml-4">Amount <ArrowUpDown className="ml-2 h-3 w-3" /></Button></TableHead>
                            <TableHead>Author</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredAndSortedPurchases.map(txn => (
                            <TableRow key={txn.id} className="hover:bg-muted/30">
                                <TableCell className="font-medium">{toNepaliDate(txn.date)}</TableCell>
                                <TableCell>{vehiclesById.get(txn.vehicleId) || 'N/A'}</TableCell>
                                <TableCell><Badge variant="secondary" className="text-[10px]">{txn.category || 'N/A'}</Badge></TableCell>
                                <TableCell>{partiesById.get(txn.partyId!) || 'N/A'}</TableCell>
                                <TableCell className="text-red-600 font-semibold">{txn.amount.toLocaleString()}</TableCell>
                                <TableCell>
                                    <TooltipProvider><Tooltip><TooltipTrigger className="text-xs text-muted-foreground">{txn.lastModifiedBy || txn.createdBy}</TooltipTrigger><TooltipContent><p>Posted: {format(new Date(txn.createdAt), "PPpp")}</p>{txn.lastModifiedAt && <p>Updated: {format(new Date(txn.lastModifiedAt), "PPpp")}</p>}</TooltipContent></Tooltip></TooltipProvider>
                                </TableCell>
                                <TableCell className="text-right">
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            <DropdownMenuItem onSelect={() => router.push(`/fleet/transactions/purchase/view?id=${txn.id}`)}><View className="mr-2 h-4 w-4" /> View Details</DropdownMenuItem>
                                            <DropdownMenuItem onSelect={() => router.push(`/fleet/transactions/purchase/edit?id=${txn.id}`)}><Edit className="mr-2 h-4 w-4" /> Edit Record</DropdownMenuItem>
                                            <DropdownMenuSeparator />
                                            <AlertDialog><AlertDialogTrigger asChild><DropdownMenuItem onSelect={e => e.preventDefault()} className="text-destructive"><Trash2 className="mr-2 h-4 w-4" /> Delete</DropdownMenuItem></AlertDialogTrigger>
                                            <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete Purchase Record?</AlertDialogTitle><AlertDialogDescription>This will permanently remove the record and its financial impact. This action cannot be undone.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => handleDelete(txn.id)}>Confirm Delete</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </TableCell>
                            </TableRow>
                        ))}
                        {filteredAndSortedPurchases.length === 0 && <TableRow><TableCell colSpan={7} className="text-center py-12 text-muted-foreground">No purchase records found matching your filters.</TableCell></TableRow>}
                    </TableBody>
                </Table>
            </Card>
        </div>
    );
}

function useToast() {
  const { toast } = useToastHook();
  return { toast };
}
import { useToast as useToastHook } from '@/hooks/use-toast';
