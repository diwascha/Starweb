
'use client';

import { useState, useEffect, useMemo } from 'react';
import type { Transaction, Vehicle, Party } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Plus, Edit, Trash2, MoreHorizontal, ArrowUpDown, Search, CalendarIcon, ArrowRightLeft, Landmark, Wrench, User, ChevronLeft, ChevronRight, ChevronsUpDown, Check, ShoppingCart, TrendingUp, X, Download } from 'lucide-react';
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
import { format, isWithinInterval, startOfDay, endOfDay, differenceInDays } from 'date-fns';
import { cn, toNepaliDate } from '@/lib/utils';
import type { DateRange } from 'react-day-picker';
import { DualDateRangePicker } from '@/components/ui/dual-date-range-picker';
import { onTransactionsUpdate, deleteTransaction } from '@/services/transaction-service';
import { onVehiclesUpdate } from '@/services/vehicle-service';
import { onPartiesUpdate } from '@/services/party-service';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

type TransactionSortKey = 'date' | 'vehicleName' | 'type' | 'partyName' | 'amount' | 'authorship' | 'dueDate';
type SortDirection = 'asc' | 'desc';
type TransactionFilterType = 'All' | 'Sales' | 'Purchase' | 'Payment' | 'Receipt';

export default function TransactionsPage() {
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
    const [filterVehicleId, setFilterVehicleId] = useState<string>('All');
    
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

    const handleDelete = async (id: string) => {
        try {
            await deleteTransaction(id);
            toast({ title: 'Success', description: 'Transaction deleted.' });
        } catch (error) {
             toast({ title: 'Error', description: 'Failed to delete transaction.', variant: 'destructive' });
        }
    };
    
    const requestSort = (key: TransactionSortKey) => {
        let direction: SortDirection = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
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
            const lowercasedQuery = searchQuery.toLowerCase();
            augmented = augmented.filter(t =>
                t.vehicleName.toLowerCase().includes(lowercasedQuery) ||
                t.partyName.toLowerCase().includes(lowercasedQuery) ||
                (t.remarks || '').toLowerCase().includes(lowercasedQuery) ||
                t.type.toLowerCase().includes(lowercasedQuery)
            );
        }

        if (dateRange?.from) {
            const interval = {
                start: startOfDay(dateRange.from),
                end: endOfDay(dateRange.to || dateRange.from),
            };
            augmented = augmented.filter(t => isWithinInterval(new Date(t.date), interval));
        }
        
        if (filterPartyId !== 'All') {
            augmented = augmented.filter(t => t.partyId === filterPartyId);
        }
        
        if (filterVehicleId !== 'All') {
            augmented = augmented.filter(t => t.vehicleId === filterVehicleId);
        }
        
        augmented.sort((a, b) => {
            const aVal = a[sortConfig.key];
            const bVal = b[sortConfig.key];
            if (aVal === null || aVal === undefined) return 1;
            if (bVal === null || bVal === undefined) return -1;
            if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
        
        return augmented;
    }, [transactions, searchQuery, sortConfig, vehiclesById, partiesById, dateRange, activeTab, filterPartyId, filterVehicleId]);
    
     const handleExport = async () => {
        const XLSX = (await import('xlsx'));
        const dataToExport = sortedAndFilteredTransactions.map(t => ({
            'Date (BS)': toNepaliDate(t.date),
            'Date (AD)': format(new Date(t.date), 'yyyy-MM-dd'),
            'Vehicle': t.vehicleName,
            'Type': t.type,
            'Party': t.partyName,
            'Amount': ['Purchase', 'Payment'].includes(t.type) ? -t.amount : t.amount,
            'Billing Type': t.billingType,
            'Due Date': t.dueDate ? toNepaliDate(t.dueDate) : '',
            'Remarks': t.remarks,
        }));
        
        const worksheet = XLSX.utils.json_to_sheet(dataToExport);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Transactions");
        XLSX.writeFile(workbook, `Transactions-${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    if (isLoading) {
        return (
            <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm py-24">
              <h3 className="text-2xl font-bold tracking-tight">Loading...</h3>
            </div>
        );
    }
    
    const renderContent = () => {
        if (transactions.length === 0) {
            return (
                <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm py-24">
                  <div className="flex flex-col items-center gap-1 text-center">
                    <h3 className="text-2xl font-bold tracking-tight">No transactions found</h3>
                    <p className="text-sm text-muted-foreground">Get started by creating a new transaction.</p>
                  </div>
                </div>
            );
        }

        return (
            <Card>
                <Table><TableHeader><TableRow>
                    <TableHead><Button variant="ghost" onClick={() => requestSort('date')}>Date</Button></TableHead>
                    <TableHead><Button variant="ghost" onClick={() => requestSort('vehicleName')}>Vehicle</Button></TableHead>
                    <TableHead><Button variant="ghost" onClick={() => requestSort('type')}>Type</Button></TableHead>
                    <TableHead><Button variant="ghost" onClick={() => requestSort('partyName')}>Party</Button></TableHead>
                    <TableHead><Button variant="ghost" onClick={() => requestSort('amount')}>Amount</Button></TableHead>
                     <TableHead><Button variant="ghost" onClick={() => requestSort('dueDate')}>Due In</Button></TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                    {sortedAndFilteredTransactions.map(txn => {
                        const dueDate = txn.dueDate ? new Date(txn.dueDate) : null;
                        const daysDue = dueDate ? differenceInDays(dueDate, new Date()) : null;
                        return (
                        <TableRow key={txn.id}>
                            <TableCell>{toNepaliDate(txn.date)}</TableCell>
                            <TableCell>{txn.vehicleName}</TableCell>
                            <TableCell><Badge variant="outline">{txn.type}</Badge></TableCell>
                            <TableCell>{txn.partyName}</TableCell>
                            <TableCell className={cn(['Purchase', 'Payment'].includes(txn.type) ? 'text-red-600' : 'text-green-600')}>{txn.amount.toLocaleString()}</TableCell>
                            <TableCell>
                                {daysDue !== null && (
                                    <Badge variant={daysDue < 0 ? 'destructive' : 'secondary'}>
                                        {daysDue < 0 ? `Overdue ${-daysDue}d` : `${daysDue}d`}
                                    </Badge>
                                )}
                            </TableCell>
                            <TableCell className="text-right"><DropdownMenu>
                                <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    {hasPermission('fleet', 'delete') && (
                                        <AlertDialog><AlertDialogTrigger asChild><DropdownMenuItem onSelect={e => e.preventDefault()}><Trash2 className="mr-2 h-4 w-4 text-destructive" /> <span className="text-destructive">Delete</span></DropdownMenuItem></AlertDialogTrigger>
                                        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Are you sure?</AlertDialogTitle><AlertDialogDescription>This will permanently delete the transaction.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => handleDelete(txn.id)}>Delete</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
                                    )}
                                </DropdownMenuContent>
                            </DropdownMenu></TableCell>
                        </TableRow>
                    )})}
                </TableBody></Table>
            </Card>
        );
    }
    
    return (
        <div className="flex flex-col gap-8">
            <header>
                <h1 className="text-3xl font-bold tracking-tight">Fleet Accounting</h1>
                <p className="text-muted-foreground">Manage your fleet's financial transactions and view summaries.</p>
            </header>
            <section>
                <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as TransactionFilterType)}>
                    <div className="flex flex-col gap-4 mb-4">
                         <div className="flex flex-col md:flex-row gap-2">
                             <div className="relative flex-1">
                                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input type="search" placeholder="Search..." className="pl-8 w-full" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                            </div>
                            <Popover><PopoverTrigger asChild>
                                <Button id="date" variant={"outline"} className={cn("w-full md:w-[300px] justify-start text-left font-normal", !dateRange && "text-muted-foreground")}>
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {dateRange?.from ? (dateRange.to ? (`${format(dateRange.from, "LLL dd, y")} - ${format(dateRange.to, "LLL dd, y")}`) : format(dateRange.from, "LLL dd, y")) : (<span>Pick a date range</span>)}
                                </Button>
                            </PopoverTrigger><PopoverContent className="w-auto p-0" align="end"><DualDateRangePicker selected={dateRange} onSelect={setDateRange} /></PopoverContent></Popover>
                             <Select value={filterPartyId} onValueChange={setFilterPartyId}>
                                <SelectTrigger className="w-full md:w-[180px]">
                                    <SelectValue placeholder="All Parties" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="All">All Parties</SelectItem>
                                    {parties.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                            <Select value={filterVehicleId} onValueChange={setFilterVehicleId}>
                                <SelectTrigger className="w-full md:w-[180px]">
                                    <SelectValue placeholder="All Vehicles" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="All">All Vehicles</SelectItem>
                                    {vehicles.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                            <Button variant="outline" onClick={handleExport}>
                                <Download className="mr-2 h-4 w-4" /> Export
                            </Button>
                        </div>
                        <div>
                           <TabsList className="grid w-full grid-cols-3 md:w-auto md:grid-cols-5">
                                <TabsTrigger value="All">All</TabsTrigger>
                                <TabsTrigger value="Sales">Sales</TabsTrigger>
                                <TabsTrigger value="Purchase">Purchase</TabsTrigger>
                                <TabsTrigger value="Payment">Payments</TabsTrigger>
                                <TabsTrigger value="Receipt">Receipts</TabsTrigger>
                            </TabsList>
                        </div>
                    </div>
                     <TabsContent value={activeTab} className="mt-4">
                        {renderContent()}
                     </TabsContent>
                </Tabs>
            </section>
        </div>
    );
}
