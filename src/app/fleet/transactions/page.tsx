
'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import type { Transaction, Vehicle, Party, Account, TransactionType, PartyType, AccountType } from '@/lib/types';
import { transactionTypes } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Plus, Edit, Trash2, MoreHorizontal, ArrowUpDown, Search, CalendarIcon, ArrowRightLeft, Landmark, Wrench, User, ChevronLeft, ChevronRight, ChevronsUpDown, Check, ShoppingCart, TrendingUp } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
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
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/use-auth';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { format, isWithinInterval, startOfDay, endOfDay } from 'date-fns';
import { cn, toNepaliDate } from '@/lib/utils';
import { DualCalendar } from '@/components/ui/dual-calendar';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import type { DateRange } from 'react-day-picker';
import { DualDateRangePicker } from '@/components/ui/dual-date-range-picker';
import { ScrollArea } from '@/components/ui/scroll-area';
import { onTransactionsUpdate, addTransaction, updateTransaction, deleteTransaction } from '@/services/transaction-service';
import { onVehiclesUpdate } from '@/services/vehicle-service';
import { onPartiesUpdate, addParty } from '@/services/party-service';
import { onAccountsUpdate, addAccount } from '@/services/account-service';
import { Tooltip, TooltipProvider, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';


type TransactionSortKey = 'date' | 'vehicleName' | 'type' | 'partyName' | 'accountName' | 'amount' | 'authorship';
type SortDirection = 'asc' | 'desc';

export default function TransactionsPage() {
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [parties, setParties] = useState<Party[]>([]);
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    
    // Dialogs
    const [isTransactionDialogOpen, setIsTransactionDialogOpen] = useState(false);
    const [isPartyDialogOpen, setIsPartyDialogOpen] = useState(false);
    const [isAccountDialogOpen, setIsAccountDialogOpen] = useState(false);

    // Form states
    const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
    const [transactionForm, setTransactionForm] = useState<Omit<Transaction, 'id' | 'createdBy' | 'lastModifiedBy' | 'createdAt' | 'lastModifiedAt'>>({
        vehicleId: '',
        date: new Date().toISOString(),
        type: 'Purchase',
        amount: 0,
        description: '',
        partyId: undefined,
        accountId: undefined,
    });
    const [partyForm, setPartyForm] = useState<{name: string, type: PartyType}>({name: '', type: 'Vendor'});
    const [accountForm, setAccountForm] = useState<{name: string, type: AccountType}>({name: '', type: 'Cash'});
    
    // Search & Filter
    const [searchQuery, setSearchQuery] = useState('');
    const [sortConfig, setSortConfig] = useState<{ key: TransactionSortKey; direction: SortDirection }>({ key: 'date', direction: 'desc' });
    const [filterVehicleId, setFilterVehicleId] = useState<string>('All');
    const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
    
    const { toast } = useToast();
    const { hasPermission, user } = useAuth();
    
    // Memos for performance
    const vehiclesById = useMemo(() => new Map(vehicles.map(v => [v.id, v.name])), [vehicles]);
    const partiesById = useMemo(() => new Map(parties.map(p => [p.id, p.name])), [parties]);
    const accountsById = useMemo(() => new Map(accounts.map(a => [a.id, a.name])), [accounts]);

    // Data fetching
    useEffect(() => {
        setIsLoading(true);
        const unsubTxns = onTransactionsUpdate(setTransactions);
        const unsubVehicles = onVehiclesUpdate(setVehicles);
        const unsubParties = onPartiesUpdate(setParties);
        const unsubAccounts = onAccountsUpdate(setAccounts);
        setIsLoading(false);

        return () => {
            unsubTxns();
            unsubVehicles();
            unsubParties();
            unsubAccounts();
        }
    }, []);

    const resetTransactionForm = () => {
        setEditingTransaction(null);
        setTransactionForm({
            vehicleId: '', date: new Date().toISOString(), type: 'Purchase', amount: 0,
            description: '', partyId: undefined, accountId: undefined,
        });
    };

    const handleOpenTransactionDialog = (transaction: Transaction | null = null, type?: TransactionType) => {
        if (transaction) {
            setEditingTransaction(transaction);
            setTransactionForm(transaction);
        } else {
            resetTransactionForm();
            if (type) {
                setTransactionForm(prev => ({ ...prev, type }));
            }
        }
        setIsTransactionDialogOpen(true);
    };
    
    const handleSubmitTransaction = async () => {
        if (!user) return;
        if (!transactionForm.vehicleId || !transactionForm.type || transactionForm.amount <= 0) {
            toast({ title: 'Error', description: 'Vehicle, Type, and a valid Amount are required.', variant: 'destructive' });
            return;
        }

        try {
            if (editingTransaction) {
                const updatedData: Partial<Omit<Transaction, 'id'>> = { ...transactionForm, lastModifiedBy: user.username };
                await updateTransaction(editingTransaction.id, updatedData);
                toast({ title: 'Success', description: 'Transaction updated.' });
            } else {
                const newData: Omit<Transaction, 'id' | 'createdAt' | 'lastModifiedAt'> = { ...transactionForm, createdBy: user.username };
                await addTransaction(newData);
                toast({ title: 'Success', description: 'New transaction recorded.' });
            }
            setIsTransactionDialogOpen(false);
            resetTransactionForm();
        } catch (error) {
             toast({ title: 'Error', description: 'Failed to save transaction.', variant: 'destructive' });
        }
    };
    
    const handleSubmitParty = async () => {
        if(!user) return;
        if(!partyForm.name || !partyForm.type) {
            toast({title: 'Error', description: 'Party name and type are required.', variant: 'destructive'});
            return;
        }
        try {
            const newPartyId = await addParty({...partyForm, createdBy: user.username});
            setTransactionForm(prev => ({...prev, partyId: newPartyId}));
            toast({title: 'Success', description: 'New party added.'});
            setIsPartyDialogOpen(false);
            setPartyForm({name: '', type: 'Vendor'});
        } catch {
             toast({title: 'Error', description: 'Failed to add party.', variant: 'destructive'});
        }
    };

    const handleSubmitAccount = async () => {
        if(!user) return;
        if(!accountForm.name || !accountForm.type) {
            toast({title: 'Error', description: 'Account name and type are required.', variant: 'destructive'});
            return;
        }
        try {
            const newAccountId = await addAccount({...accountForm, createdBy: user.username});
            setTransactionForm(prev => ({...prev, accountId: newAccountId}));
            toast({title: 'Success', description: 'New account added.'});
            setIsAccountDialogOpen(false);
            setAccountForm({name: '', type: 'Cash'});
        } catch {
             toast({title: 'Error', description: 'Failed to add account.', variant: 'destructive'});
        }
    };

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

    const { sortedAndFilteredTransactions, fleetSummaries, globalSummary } = useMemo(() => {
        let augmented = transactions.map(t => ({
            ...t,
            vehicleName: vehiclesById.get(t.vehicleId) || 'N/A',
            partyName: t.partyId ? partiesById.get(t.partyId) || 'N/A' : 'N/A',
            accountName: t.accountId ? accountsById.get(t.accountId) || 'N/A' : 'N/A',
        }));

        if (searchQuery) {
            const lowercasedQuery = searchQuery.toLowerCase();
            augmented = augmented.filter(t =>
                t.vehicleName.toLowerCase().includes(lowercasedQuery) ||
                t.partyName.toLowerCase().includes(lowercasedQuery) ||
                t.description.toLowerCase().includes(lowercasedQuery)
            );
        }
        
        if (filterVehicleId !== 'All') {
            augmented = augmented.filter(t => t.vehicleId === filterVehicleId);
        }

        if (dateRange?.from) {
            const interval = {
                start: startOfDay(dateRange.from),
                end: endOfDay(dateRange.to || dateRange.from),
            };
            augmented = augmented.filter(t => isWithinInterval(new Date(t.date), interval));
        }
        
        augmented.sort((a, b) => {
            const aVal = a[sortConfig.key];
            const bVal = b[sortConfig.key];
            if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
        
        const summaries = vehicles.map(v => {
            const vehicleTxns = augmented.filter(t => t.vehicleId === v.id);
            const income = vehicleTxns.filter(t => t.type === 'Sales' || t.type === 'Receipt').reduce((sum, t) => sum + t.amount, 0);
            const expense = vehicleTxns.filter(t => t.type === 'Purchase' || t.type === 'Payment').reduce((sum, t) => sum + t.amount, 0);
            return { id: v.id, name: v.name, income, expense, net: income - expense };
        });

        const global = augmented.reduce((acc, txn) => {
            if (txn.type === 'Sales') acc.receivables += txn.amount;
            else if (txn.type === 'Receipt') acc.receivables -= txn.amount;
            else if (txn.type === 'Purchase') acc.payables += txn.amount;
            else if (txn.type === 'Payment') acc.payables -= txn.amount;
            return acc;
        }, { receivables: 0, payables: 0 });
        
        return { sortedAndFilteredTransactions: augmented, fleetSummaries: summaries, globalSummary: global };
    }, [transactions, searchQuery, sortConfig, vehiclesById, partiesById, accountsById, filterVehicleId, dateRange, vehicles]);

    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const scroll = (direction: 'left' | 'right') => {
        if (scrollContainerRef.current) {
            scrollContainerRef.current.scrollBy({ left: direction === 'left' ? -300 : 300, behavior: 'smooth' });
        }
    };
    
    if (isLoading) {
        return (
            <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm py-24">
              <h3 className="text-2xl font-bold tracking-tight">Loading...</h3>
            </div>
        );
    }
    
    return (
        <Dialog open={isTransactionDialogOpen} onOpenChange={setIsTransactionDialogOpen}>
            <div className="flex flex-col gap-8">
                <header>
                    <h1 className="text-3xl font-bold tracking-tight">Fleet Accounting</h1>
                    <p className="text-muted-foreground">Manage your fleet's financial transactions and view summaries.</p>
                </header>

                <section className="grid md:grid-cols-2 gap-6">
                    <div>
                         <div className="flex justify-between items-center mb-4">
                            <h2 className="text-xl font-semibold">Fleet Summary</h2>
                            <div className="flex gap-2">
                                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => scroll('left')}><ChevronLeft className="h-4 w-4" /></Button>
                                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => scroll('right')}><ChevronRight className="h-4 w-4" /></Button>
                            </div>
                        </div>
                        <div className="relative">
                            <ScrollArea className="w-full whitespace-nowrap" ref={scrollContainerRef}>
                                <div className="flex gap-4 pb-4">
                                    {fleetSummaries.map(summary => (
                                        <Card key={summary.id} className="w-64 flex-shrink-0">
                                            <CardHeader>
                                                <CardTitle className="truncate">{summary.name}</CardTitle>
                                            </CardHeader>
                                            <CardContent className="space-y-2">
                                                <p className="text-sm">Income: <span className="font-medium text-green-600">{summary.income.toLocaleString()}</span></p>
                                                <p className="text-sm">Expense: <span className="font-medium text-red-600">{summary.expense.toLocaleString()}</span></p>
                                                <p className="text-sm font-semibold">Net: <span className={cn(summary.net >= 0 ? 'text-green-600' : 'text-red-600')}>{summary.net.toLocaleString()}</span></p>
                                            </CardContent>
                                        </Card>
                                    ))}
                                </div>
                            </ScrollArea>
                        </div>
                    </div>
                     <Card>
                        <CardHeader>
                            <CardTitle>Financial Overview</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="p-4 rounded-lg bg-muted/50">
                                <p className="text-sm text-muted-foreground">Total Receivables</p>
                                <p className="text-2xl font-bold">{globalSummary.receivables.toLocaleString()}</p>
                            </div>
                            <div className="p-4 rounded-lg bg-muted/50">
                                <p className="text-sm text-muted-foreground">Total Payables</p>
                                <p className="text-2xl font-bold">{globalSummary.payables.toLocaleString()}</p>
                            </div>
                        </CardContent>
                    </Card>
                </section>

                <section>
                    <div className="flex flex-col md:flex-row gap-4 items-center justify-between mb-4">
                        <div className="flex-1 w-full">
                            <h2 className="text-xl font-semibold">Transactions</h2>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                            {hasPermission('fleet', 'create') && (
                                <>
                                <DialogTrigger asChild>
                                    <Button onClick={() => handleOpenTransactionDialog(null, 'Sales')} className="w-full">
                                        <TrendingUp className="mr-2 h-4 w-4" /> New Sales
                                    </Button>
                                </DialogTrigger>
                                <DialogTrigger asChild>
                                    <Button onClick={() => handleOpenTransactionDialog(null, 'Purchase')} className="w-full">
                                        <ShoppingCart className="mr-2 h-4 w-4" /> New Purchase
                                    </Button>
                                </DialogTrigger>
                                <DialogTrigger asChild>
                                    <Button onClick={() => handleOpenTransactionDialog(null, 'Payment')} className="w-full">
                                        <ArrowRightLeft className="mr-2 h-4 w-4" /> New Payment / Receipt
                                    </Button>
                                </DialogTrigger>
                                </>
                            )}
                        </div>
                    </div>

                     <div className="flex flex-col md:flex-row gap-2 mb-4">
                        <div className="relative flex-1">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input type="search" placeholder="Search..." className="pl-8 w-full" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                        </div>
                        <div className="flex gap-2">
                            <Popover><PopoverTrigger asChild>
                                <Button id="date" variant={"outline"} className={cn("w-full md:w-[300px] justify-start text-left font-normal", !dateRange && "text-muted-foreground")}>
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {dateRange?.from ? (dateRange.to ? (`${format(dateRange.from, "LLL dd, y")} - ${format(dateRange.to, "LLL dd, y")}`) : format(dateRange.from, "LLL dd, y")) : (<span>Pick a date range</span>)}
                                </Button>
                            </PopoverTrigger><PopoverContent className="w-auto p-0" align="end"><DualDateRangePicker selected={dateRange} onSelect={setDateRange} /></PopoverContent></Popover>
                            <Select value={filterVehicleId} onValueChange={setFilterVehicleId}>
                                <SelectTrigger className="w-full md:w-[180px]"><SelectValue placeholder="All Vehicles" /></SelectTrigger>
                                <SelectContent><SelectItem value="All">All Vehicles</SelectItem>{vehicles.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}</SelectContent>
                            </Select>
                        </div>
                    </div>
                    <Card>
                        <Table><TableHeader><TableRow>
                            <TableHead><Button variant="ghost" onClick={() => requestSort('date')}>Date</Button></TableHead>
                            <TableHead><Button variant="ghost" onClick={() => requestSort('vehicleName')}>Vehicle</Button></TableHead>
                            <TableHead><Button variant="ghost" onClick={() => requestSort('type')}>Type</Button></TableHead>
                            <TableHead><Button variant="ghost" onClick={() => requestSort('partyName')}>Party</Button></TableHead>
                            <TableHead><Button variant="ghost" onClick={() => requestSort('amount')}>Amount</Button></TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow></TableHeader>
                        <TableBody>
                            {sortedAndFilteredTransactions.map(txn => (
                                <TableRow key={txn.id}>
                                    <TableCell>{toNepaliDate(txn.date)}</TableCell>
                                    <TableCell>{txn.vehicleName}</TableCell>
                                    <TableCell><Badge variant="outline">{txn.type}</Badge></TableCell>
                                    <TableCell>{txn.partyName}</TableCell>
                                    <TableCell className={cn(['Purchase', 'Payment'].includes(txn.type) ? 'text-red-600' : 'text-green-600')}>{txn.amount.toLocaleString()}</TableCell>
                                    <TableCell className="text-right"><DropdownMenu>
                                        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            {hasPermission('fleet', 'edit') && <DropdownMenuItem onSelect={() => handleOpenTransactionDialog(txn)}><Edit className="mr-2 h-4 w-4" /> Edit</DropdownMenuItem>}
                                            {hasPermission('fleet', 'delete') && <DropdownMenuSeparator />}
                                            {hasPermission('fleet', 'delete') && (
                                                <AlertDialog><AlertDialogTrigger asChild><DropdownMenuItem onSelect={e => e.preventDefault()}><Trash2 className="mr-2 h-4 w-4 text-destructive" /> <span className="text-destructive">Delete</span></DropdownMenuItem></AlertDialogTrigger>
                                                <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Are you sure?</AlertDialogTitle><AlertDialogDescription>This will permanently delete the transaction.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => handleDelete(txn.id)}>Delete</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
                                            )}
                                        </DropdownMenuContent>
                                    </DropdownMenu></TableCell>
                                </TableRow>
                            ))}
                        </TableBody></Table>
                    </Card>
                </section>
            </div>
            
            <DialogContent className="sm:max-w-md">
                <DialogHeader><DialogTitle>{editingTransaction ? 'Edit Transaction' : 'Add New Transaction'}</DialogTitle></DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                        <Label htmlFor="date">Date</Label>
                         <Popover><PopoverTrigger asChild>
                            <Button variant={"outline"} className={cn("w-full justify-start text-left font-normal", !transactionForm.date && "text-muted-foreground")}>
                                <CalendarIcon className="mr-2 h-4 w-4" />{transactionForm.date ? `${toNepaliDate(transactionForm.date)} BS (${format(new Date(transactionForm.date), "PPP")})` : <span>Pick a date</span>}
                            </Button>
                         </PopoverTrigger><PopoverContent className="w-auto p-0"><DualCalendar selected={new Date(transactionForm.date)} onSelect={(d) => d && setTransactionForm(p => ({...p, date: d.toISOString()}))} /></PopoverContent></Popover>
                        </div>
                         <div className="space-y-2">
                        <Label htmlFor="vehicleId">Vehicle</Label>
                        <Select value={transactionForm.vehicleId} onValueChange={(v) => setTransactionForm(p => ({...p, vehicleId: v}))}><SelectTrigger id="vehicleId"><SelectValue placeholder="Select vehicle" /></SelectTrigger>
                            <SelectContent>{vehicles.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}</SelectContent>
                        </Select>
                        </div>
                    </div>
                     <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                        <Label htmlFor="type">Type</Label>
                        <Select value={transactionForm.type} onValueChange={(v: TransactionType) => setTransactionForm(p => ({...p, type: v}))}><SelectTrigger id="type"><SelectValue placeholder="Select type" /></SelectTrigger>
                            <SelectContent>{transactionTypes.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                        </Select>
                        </div>
                        <div className="space-y-2">
                        <Label htmlFor="amount">Amount</Label>
                        <Input id="amount" type="number" value={transactionForm.amount} onChange={e => setTransactionForm(p => ({...p, amount: parseFloat(e.target.value) || 0}))}/>
                        </div>
                    </div>
                     <div className="grid grid-cols-2 gap-4">
                         <div className="space-y-2">
                            <Label htmlFor="partyId">Party (Vendor/Client)</Label>
                             <div className="flex gap-2">
                                <Popover><PopoverTrigger asChild>
                                    <Button variant="outline" role="combobox" className="w-full justify-between">
                                        {transactionForm.partyId ? partiesById.get(transactionForm.partyId) : "Select party..."}<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                    </Button>
                                </PopoverTrigger><PopoverContent className="p-0"><Command>
                                    <CommandInput placeholder="Search party..." />
                                    <CommandList><CommandEmpty>No party found.</CommandEmpty><CommandGroup>
                                        {parties.map(party => <CommandItem key={party.id} value={party.name} onSelect={() => setTransactionForm(p => ({...p, partyId: party.id}))}>
                                            <Check className={cn("mr-2 h-4 w-4", transactionForm.partyId === party.id ? "opacity-100" : "opacity-0")} />{party.name}
                                        </CommandItem>)}
                                    </CommandGroup></CommandList>
                                </Command></PopoverContent></Popover>
                                <Button type="button" size="icon" variant="outline" onClick={() => setIsPartyDialogOpen(true)}><Plus className="h-4 w-4"/></Button>
                             </div>
                         </div>
                         <div className="space-y-2">
                             <Label htmlFor="accountId">Account (Cash/Bank)</Label>
                            <div className="flex gap-2">
                            <Popover><PopoverTrigger asChild>
                                <Button variant="outline" role="combobox" className="w-full justify-between">
                                    {transactionForm.accountId ? accountsById.get(transactionForm.accountId) : "Select account..."}<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                </Button>
                            </PopoverTrigger><PopoverContent className="p-0"><Command>
                                <CommandInput placeholder="Search account..." />
                                <CommandList><CommandEmpty>No account found.</CommandEmpty><CommandGroup>
                                    {accounts.map(acc => <CommandItem key={acc.id} value={acc.name} onSelect={() => setTransactionForm(p => ({...p, accountId: acc.id}))}>
                                        <Check className={cn("mr-2 h-4 w-4", transactionForm.accountId === acc.id ? "opacity-100" : "opacity-0")} />{acc.name}
                                    </CommandItem>)}
                                </CommandGroup></CommandList>
                            </Command></PopoverContent></Popover>
                            <Button type="button" size="icon" variant="outline" onClick={() => setIsAccountDialogOpen(true)}><Plus className="h-4 w-4"/></Button>
                            </div>
                         </div>
                     </div>
                     <div className="space-y-2">
                        <Label htmlFor="description">Description</Label>
                        <Textarea id="description" value={transactionForm.description} onChange={e => setTransactionForm(p => ({...p, description: e.target.value}))} placeholder="Optional details..." />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => setIsTransactionDialogOpen(false)}>Cancel</Button>
                    <Button onClick={handleSubmitTransaction}>{editingTransaction ? 'Save Changes' : 'Add Transaction'}</Button>
                </DialogFooter>
            </DialogContent>
            
            {/* Dialog for adding new Party */}
            <Dialog open={isPartyDialogOpen} onOpenChange={setIsPartyDialogOpen}>
                <DialogContent className="sm:max-w-sm">
                    <DialogHeader><DialogTitle>Add New Party</DialogTitle></DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="party-name">Party Name</Label>
                            <Input id="party-name" value={partyForm.name} onChange={e => setPartyForm(p => ({...p, name: e.target.value}))} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="party-type">Party Type</Label>
                            <Select value={partyForm.type} onValueChange={(v: PartyType) => setPartyForm(p => ({...p, type: v}))}>
                                <SelectTrigger id="party-type"><SelectValue/></SelectTrigger>
                                <SelectContent><SelectItem value="Vendor">Vendor</SelectItem><SelectItem value="Client">Client</SelectItem></SelectContent>
                            </Select>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsPartyDialogOpen(false)}>Cancel</Button>
                        <Button onClick={handleSubmitParty}>Add Party</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

             {/* Dialog for adding new Account */}
            <Dialog open={isAccountDialogOpen} onOpenChange={setIsAccountDialogOpen}>
                <DialogContent className="sm:max-w-sm">
                    <DialogHeader><DialogTitle>Add New Account</DialogTitle></DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="account-name">Account Name</Label>
                            <Input id="account-name" value={accountForm.name} onChange={e => setAccountForm(p => ({...p, name: e.target.value}))} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="account-type">Account Type</Label>
                            <Select value={accountForm.type} onValueChange={(v: AccountType) => setAccountForm(p => ({...p, type: v}))}>
                                <SelectTrigger id="account-type"><SelectValue/></SelectTrigger>
                                <SelectContent><SelectItem value="Cash">Cash</SelectItem><SelectItem value="Bank">Bank</SelectItem></SelectContent>
                            </Select>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsAccountDialogOpen(false)}>Cancel</Button>
                        <Button onClick={handleSubmitAccount}>Add Account</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </Dialog>
    );
}

    

    
