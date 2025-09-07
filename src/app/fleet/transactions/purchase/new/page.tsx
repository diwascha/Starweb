
'use client';

import { useState, useEffect, useMemo, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import type { Transaction, Vehicle, Party, Account } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { onVehiclesUpdate } from '@/services/vehicle-service';
import { onPartiesUpdate } from '@/services/party-service';
import { onAccountsUpdate } from '@/services/account-service';
import { onTransactionsUpdate, addTransaction, deleteTransaction } from '@/services/transaction-service';
import { Dialog, DialogContent, DialogTrigger, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { PlusCircle, Download, CalendarIcon, ArrowUpDown, MoreHorizontal, View, Edit, Printer, Trash2, User, Search } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { cn, generateNextPurchaseNumber, toNepaliDate } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DualDateRangePicker } from '@/components/ui/dual-date-range-picker';
import type { DateRange } from 'react-day-picker';
import { format, isWithinInterval, startOfDay, endOfDay } from 'date-fns';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Tooltip, TooltipProvider, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Input } from '@/components/ui/input';

const PurchaseForm = dynamic(() => import('../../_components/purchase-form').then(mod => mod.PurchaseForm), {
  ssr: false,
  loading: () => <p>Loading form...</p>
});

type SortKey = 'date' | 'vehicleName' | 'partyName' | 'amount' | 'authorship';
type SortDirection = 'asc' | 'desc';

export default function NewPurchasePage() {
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [parties, setParties] = useState<Party[]>([]);
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    
    // Filtering and Sorting state
    const [searchQuery, setSearchQuery] = useState('');
    const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection }>({ key: 'date', direction: 'desc' });
    const [filterVehicleId, setFilterVehicleId] = useState<string>('All');
    const [filterPartyId, setFilterPartyId] = useState<string>('All');
    const [nextPurchaseNum, setNextPurchaseNum] = useState('');

    const { toast } = useToast();
    const { user } = useAuth();
    const router = useRouter();

    useEffect(() => {
        setIsLoading(true);
        const unsubVehicles = onVehiclesUpdate(setVehicles);
        const unsubParties = onPartiesUpdate(setParties);
        const unsubAccounts = onAccountsUpdate(setAccounts);
        const unsubTransactions = onTransactionsUpdate(setTransactions);
        setIsLoading(false);

        return () => {
            unsubVehicles();
            unsubParties();
            unsubAccounts();
            unsubTransactions();
        }
    }, []);

    useEffect(() => {
        const purchaseTxns = transactions.filter(t => t.type === 'Purchase');
        generateNextPurchaseNumber(purchaseTxns).then(setNextPurchaseNum);
    }, [transactions]);


    const handleFormSubmit = async (values: any) => {
        if (!user) return;
        
        const calculatedSubtotal = (values.items || []).reduce((sum: number, item: { quantity: number; rate: number; }) => sum + (Number(item.quantity) || 0) * (Number(item.rate) || 0), 0);
        const calculatedVat = values.invoiceType === 'Taxable' ? calculatedSubtotal * 0.13 : 0;
        const grandTotal = calculatedSubtotal + calculatedVat;
        
        const transactionData = {
            ...values,
            date: values.date.toISOString(),
            invoiceNumber: values.invoiceNumber || null,
            invoiceDate: values.invoiceDate?.toISOString() || null,
            chequeNumber: values.chequeNumber || null,
            chequeDate: values.chequeDate?.toISOString() || null,
            dueDate: values.dueDate?.toISOString() || null,
            items: values.items.map((item: { quantity: any; rate: any; }) => ({
                ...item,
                quantity: Number(item.quantity) || 0,
                rate: Number(item.rate) || 0,
            })),
            amount: grandTotal,
            remarks: values.remarks || null,
            accountId: values.accountId || null,
            partyId: values.partyId || null,
            createdBy: user.username,
        };

        try {
            await addTransaction(transactionData);
            toast({ title: 'Success', description: 'New transaction recorded.' });
            setIsDialogOpen(false);
        } catch (error) {
             console.error("Failed to save transaction:", error);
             toast({ title: 'Error', description: 'Failed to save transaction.', variant: 'destructive' });
        }
    };
    
    const handleDelete = async (id: string) => {
        try {
            await deleteTransaction(id);
            toast({ title: 'Success', description: 'Purchase deleted.' });
        } catch (error) {
             toast({ title: 'Error', description: 'Failed to delete purchase.', variant: 'destructive' });
        }
    };

    const requestSort = (key: SortKey) => {
        let direction: SortDirection = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };
    
    const vendors = useMemo(() => parties.filter(p => p.type === 'Vendor' || p.type === 'Both'), [parties]);

    const filteredAndSortedPurchases = useMemo(() => {
        let filtered = transactions.filter(t => t.type === 'Purchase');

        if (searchQuery) {
            const lowercasedQuery = searchQuery.toLowerCase();
            const vehiclesById = new Map(vehicles.map(v => [v.id, v.name]));
            const partiesById = new Map(parties.map(p => [p.id, p.name]));
            filtered = filtered.filter(t => 
                (vehiclesById.get(t.vehicleId) || '').toLowerCase().includes(lowercasedQuery) ||
                (partiesById.get(t.partyId!) || '').toLowerCase().includes(lowercasedQuery) ||
                (t.invoiceNumber || '').toLowerCase().includes(lowercasedQuery)
            );
        }
        
        if (dateRange?.from) {
            const interval = {
                start: startOfDay(dateRange.from),
                end: endOfDay(dateRange.to || dateRange.from),
            };
            filtered = filtered.filter(t => isWithinInterval(new Date(t.date), interval));
        }
        
        if (filterVehicleId !== 'All') {
            filtered = filtered.filter(v => v.vehicleId === filterVehicleId);
        }

        if (filterPartyId !== 'All') {
            filtered = filtered.filter(v => v.partyId === filterPartyId);
        }
        
        const vehiclesById = new Map(vehicles.map(v => [v.id, v.name]));
        const partiesById = new Map(parties.map(p => [p.id, p.name]));

        filtered.sort((a, b) => {
            if (sortConfig.key === 'authorship') {
                const aDate = a.lastModifiedAt || a.createdAt;
                const bDate = b.lastModifiedAt || b.createdAt;
                if (!aDate || !bDate) return 0;
                if (aDate < bDate) return sortConfig.direction === 'asc' ? -1 : 1;
                if (aDate > bDate) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            }
            
            let aVal, bVal;
            if (sortConfig.key === 'vehicleName') {
                aVal = vehiclesById.get(a.vehicleId) || '';
                bVal = vehiclesById.get(b.vehicleId) || '';
            } else if (sortConfig.key === 'partyName') {
                 aVal = partiesById.get(a.partyId!) || '';
                 bVal = partiesById.get(b.partyId!) || '';
            } else {
                aVal = a[sortConfig.key as keyof Transaction];
                bVal = b[sortConfig.key as keyof Transaction];
            }

            if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });

        return filtered;
    }, [transactions, searchQuery, dateRange, sortConfig, filterVehicleId, filterPartyId, vehicles, parties]);
    
    const handleExport = async () => {
        const XLSX = (await import('xlsx'));
        const vehiclesById = new Map(vehicles.map(v => [v.id, v.name]));
        const partiesById = new Map(parties.map(p => [p.id, p.name]));

        const dataToExport = filteredAndSortedPurchases.map(p => ({
            'Date': toNepaliDate(p.date),
            'Vehicle': vehiclesById.get(p.vehicleId),
            'Vendor': partiesById.get(p.partyId!),
            'Invoice #': p.invoiceNumber,
            'Amount': p.amount,
            'Created By': p.createdBy,
            'Last Modified By': p.lastModifiedBy,
        }));
        
        const worksheet = XLSX.utils.json_to_sheet(dataToExport);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Purchases");
        XLSX.writeFile(workbook, `Purchases-${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    if (isLoading) {
        return (
            <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm py-24">
                <h3 className="text-2xl font-bold tracking-tight">Loading...</h3>
            </div>
        );
    }
    
    const purchaseTransactions = transactions.filter(t => t.type === 'Purchase');
    const vehiclesById = new Map(vehicles.map(v => [v.id, v.name]));
    const partiesById = new Map(parties.map(p => [p.id, p.name]));


    return (
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <div className="flex flex-col gap-8">
                 <header className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">New Purchase</h1>
                        <p className="text-muted-foreground">Record a new purchase transaction for the fleet.</p>
                    </div>
                    <DialogTrigger asChild>
                        <Button>
                            <PlusCircle className="mr-2 h-4 w-4" /> Create New Purchase
                        </Button>
                    </DialogTrigger>
                </header>
                 
                {purchaseTransactions.length === 0 ? (
                    <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm py-24">
                        <div className="flex flex-col items-center gap-1 text-center">
                            <h3 className="text-2xl font-bold tracking-tight">No Purchases Recorded Yet</h3>
                            <p className="text-sm text-muted-foreground">Click the button above to get started.</p>
                        </div>
                    </div>
                ) : (
                    <>
                    <div className="flex justify-between items-center flex-wrap gap-2">
                        <div className="relative">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                type="search"
                                placeholder="Search..."
                                className="pl-8 w-full sm:w-[300px]"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                         <div className="flex items-center gap-2 flex-wrap">
                            <Popover><PopoverTrigger asChild>
                                <Button id="date" variant={"outline"} className={cn("w-full md:w-[250px] justify-start text-left font-normal", !dateRange && "text-muted-foreground")}>
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {dateRange?.from ? (dateRange.to ? (`${format(dateRange.from, "LLL dd, y")} - ${format(dateRange.to, "LLL dd, y")}`) : format(dateRange.from, "LLL dd, y")) : (<span>Pick a date range</span>)}
                                </Button>
                            </PopoverTrigger><PopoverContent className="w-auto p-0" align="end"><DualDateRangePicker selected={dateRange} onSelect={setDateRange} /></PopoverContent></Popover>
                            <Select value={filterVehicleId} onValueChange={setFilterVehicleId}>
                                <SelectTrigger className="w-full md:w-[150px]"><SelectValue placeholder="All Vehicles" /></SelectTrigger>
                                <SelectContent><SelectItem value="All">All Vehicles</SelectItem>{vehicles.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}</SelectContent>
                            </Select>
                            <Select value={filterPartyId} onValueChange={setFilterPartyId}>
                                <SelectTrigger className="w-full md:w-[150px]"><SelectValue placeholder="All Vendors" /></SelectTrigger>
                                <SelectContent><SelectItem value="All">All Vendors</SelectItem>{vendors.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                            </Select>
                            <Button variant="outline" onClick={handleExport}>
                                <Download className="mr-2 h-4 w-4" /> Export
                            </Button>
                        </div>
                    </div>
                    <Card>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead><Button variant="ghost" onClick={() => requestSort('date')}>Date <ArrowUpDown className="ml-2 h-4 w-4" /></Button></TableHead>
                                    <TableHead><Button variant="ghost" onClick={() => requestSort('vehicleName')}>Vehicle <ArrowUpDown className="ml-2 h-4 w-4" /></Button></TableHead>
                                    <TableHead><Button variant="ghost" onClick={() => requestSort('partyName')}>Vendor <ArrowUpDown className="ml-2 h-4 w-4" /></Button></TableHead>
                                    <TableHead><Button variant="ghost" onClick={() => requestSort('amount')}>Amount <ArrowUpDown className="ml-2 h-4 w-4" /></Button></TableHead>
                                    <TableHead><Button variant="ghost" onClick={() => requestSort('authorship')}>Authorship <ArrowUpDown className="ml-2 h-4 w-4" /></Button></TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredAndSortedPurchases.map(txn => (
                                    <TableRow key={txn.id}>
                                        <TableCell>{toNepaliDate(txn.date)}</TableCell>
                                        <TableCell>{vehiclesById.get(txn.vehicleId) || 'N/A'}</TableCell>
                                        <TableCell>{partiesById.get(txn.partyId!) || 'N/A'}</TableCell>
                                        <TableCell className="text-red-600">{txn.amount.toLocaleString()}</TableCell>
                                        <TableCell>
                                            <TooltipProvider>
                                                <Tooltip>
                                                    <TooltipTrigger className="flex items-center gap-1.5 text-sm text-muted-foreground cursor-default">
                                                        {txn.lastModifiedBy ? <Edit className="h-4 w-4" /> : <User className="h-4 w-4" />}
                                                        <span>{txn.lastModifiedBy || txn.createdBy}</span>
                                                    </TooltipTrigger>
                                                    <TooltipContent>
                                                        {txn.createdBy && (<p>Created by: {txn.createdBy}{txn.createdAt ? ` on ${format(new Date(txn.createdAt), "PP")}` : ''}</p>)}
                                                        {txn.lastModifiedBy && txn.lastModifiedAt && (<p>Modified by: {txn.lastModifiedBy}{txn.lastModifiedAt ? ` on ${format(new Date(txn.lastModifiedAt), "PP")}` : ''}</p>)}
                                                    </TooltipContent>
                                                </Tooltip>
                                            </TooltipProvider>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    <DropdownMenuItem onSelect={() => router.push(`/fleet/transactions/purchase/view/${txn.id}`)}><View className="mr-2 h-4 w-4" /> View</DropdownMenuItem>
                                                    <DropdownMenuItem onSelect={() => router.push(`/fleet/transactions/purchase/edit/${txn.id}`)}><Edit className="mr-2 h-4 w-4" /> Edit</DropdownMenuItem>
                                                    <DropdownMenuSeparator />
                                                    <AlertDialog>
                                                        <AlertDialogTrigger asChild><DropdownMenuItem onSelect={e => e.preventDefault()}><Trash2 className="mr-2 h-4 w-4 text-destructive" /> <span className="text-destructive">Delete</span></DropdownMenuItem></AlertDialogTrigger>
                                                        <AlertDialogContent>
                                                            <AlertDialogHeader><AlertDialogTitle>Are you sure?</AlertDialogTitle><AlertDialogDescription>This will permanently delete the purchase record.</AlertDialogDescription></AlertDialogHeader>
                                                            <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => handleDelete(txn.id)}>Delete</AlertDialogAction></AlertDialogFooter>
                                                        </AlertDialogContent>
                                                    </AlertDialog>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </Card>
                    </>
                )}
            </div>
            <DialogContent className="max-w-4xl">
                 <DialogHeader>
                    <DialogTitle>Create New Purchase</DialogTitle>
                    <DialogDescription>
                        Fill in the details below to record a new purchase transaction.
                    </DialogDescription>
                </DialogHeader>
                 <Suspense fallback={<div>Loading form...</div>}>
                    <PurchaseForm 
                        accounts={accounts}
                        parties={parties}
                        vehicles={vehicles}
                        onFormSubmit={handleFormSubmit}
                        onCancel={() => setIsDialogOpen(false)}
                        initialValues={{ purchaseNumber: nextPurchaseNum, type: 'Purchase' }}
                    />
                 </Suspense>
            </DialogContent>
        </Dialog>
    );
}
