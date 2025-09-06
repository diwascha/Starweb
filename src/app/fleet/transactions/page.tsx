

'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import type { Transaction, Vehicle, Party, Account, TransactionType, PartyType, AccountType, BillingType, InvoiceType, TransactionItem } from '@/lib/types';
import { transactionTypes } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Plus, Edit, Trash2, MoreHorizontal, ArrowUpDown, Search, CalendarIcon, ArrowRightLeft, Landmark, Wrench, User, ChevronLeft, ChevronRight, ChevronsUpDown, Check, ShoppingCart, TrendingUp, X } from 'lucide-react';
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
import { format, isWithinInterval, startOfDay, endOfDay, differenceInDays } from 'date-fns';
import { cn, toNepaliDate } from '@/lib/utils';
import { DualCalendar } from '@/components/ui/dual-calendar';
import { Calendar } from '@/components/ui/calendar';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import type { DateRange } from 'react-day-picker';
import { DualDateRangePicker } from '@/components/ui/dual-date-range-picker';
import { ScrollArea } from '@/components/ui/scroll-area';
import { onTransactionsUpdate, addTransaction, updateTransaction, deleteTransaction } from '@/services/transaction-service';
import { onVehiclesUpdate } from '@/services/vehicle-service';
import { onPartiesUpdate, addParty } from '@/services/party-service';
import { onAccountsUpdate, addAccount, updateAccount } from '@/services/account-service';
import { Tooltip, TooltipProvider, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useRouter } from 'next/navigation';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';


const transactionItemSchema = z.object({
    particular: z.string().min(1, 'Particular is required.'),
    quantity: z.number().min(0.01, 'Quantity must be positive.'),
    uom: z.string().min(1, 'UOM is required.'),
    rate: z.number().min(0.01, 'Rate must be positive.'),
});

const transactionSchema = z.object({
    vehicleId: z.string().min(1, 'Vehicle is required.'),
    date: z.date({ required_error: 'Posting date is required.' }),
    invoiceNumber: z.string().optional(),
    invoiceDate: z.date().optional(),
    invoiceType: z.enum(['Taxable', 'Normal']),
    billingType: z.enum(['Cash', 'Bank', 'Credit']),
    chequeNumber: z.string().optional(),
    chequeDate: z.date().optional(),
    dueDate: z.date().optional(),
    partyId: z.string().optional(),
    accountId: z.string().optional(),
    items: z.array(transactionItemSchema).min(1, 'At least one item is required.'),
    remarks: z.string().optional(),
    type: z.enum(['Purchase', 'Sales', 'Payment', 'Receipt']),
});

type TransactionFormValues = z.infer<typeof transactionSchema>;


type TransactionSortKey = 'date' | 'vehicleName' | 'type' | 'partyName' | 'amount' | 'authorship' | 'dueDate';
type SortDirection = 'asc' | 'desc';

const initialAccountFormState = {
    name: '',
    type: 'Cash' as AccountType,
    accountNumber: '',
    bankName: '',
    branch: '',
};

export default function TransactionsPage() {
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [parties, setParties] = useState<Party[]>([]);
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const router = useRouter();
    
    // Dialogs
    const [isTransactionDialogOpen, setIsTransactionDialogOpen] = useState(false);
    const [isPartyDialogOpen, setIsPartyDialogOpen] = useState(false);
    const [isAccountDialogOpen, setIsAccountDialogOpen] = useState(false);

    // Form states
    const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
    const [partyForm, setPartyForm] = useState<{name: string, type: PartyType}>({name: '', type: 'Vendor'});
    const [accountForm, setAccountForm] = useState(initialAccountFormState);
    const [editingAccount, setEditingAccount] = useState<Account | null>(null);
    
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
    const accountsById = useMemo(() => new Map(accounts.map(a => [a.id, a.bankName ? `${a.bankName} - ${a.accountNumber}` : a.name])), [accounts]);
    const bankAccounts = useMemo(() => accounts.filter(a => a.type === 'Bank'), [accounts]);

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

    // Form
    const form = useForm<TransactionFormValues>({
        resolver: zodResolver(transactionSchema),
    });
    
    const { fields, append, remove } = useFieldArray({
        control: form.control,
        name: "items"
    });
    
    const watchBillingType = form.watch("billingType");
    const watchItems = form.watch("items");
    const watchInvoiceType = form.watch("invoiceType");
    
    const subtotal = (watchItems || []).reduce((sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.rate) || 0), 0);
    const vatAmount = watchInvoiceType === 'Taxable' ? subtotal * 0.13 : 0;
    const totalAmount = subtotal + vatAmount;


    const handleOpenTransactionDialog = (transaction: Transaction | null = null, type?: TransactionType) => {
        if (transaction) {
            setEditingTransaction(transaction);
            form.reset({
                ...transaction,
                date: new Date(transaction.date),
                invoiceDate: transaction.invoiceDate ? new Date(transaction.invoiceDate) : undefined,
                chequeDate: transaction.chequeDate ? new Date(transaction.chequeDate) : undefined,
                dueDate: transaction.dueDate ? new Date(transaction.dueDate) : undefined,
            });
        } else {
            setEditingTransaction(null);
            form.reset({
                date: new Date(),
                invoiceType: 'Taxable',
                billingType: 'Cash',
                items: [{ particular: '', quantity: 1, uom: '', rate: 0 }],
                type: type || 'Purchase',
            });
        }
        setIsTransactionDialogOpen(true);
    };
    
    const handleSubmitTransaction = async (values: TransactionFormValues) => {
        if (!user) return;
        
        const subtotal = (values.items || []).reduce((sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.rate) || 0), 0);
        const vat = values.invoiceType === 'Taxable' ? subtotal * 0.13 : 0;
        const grandTotal = subtotal + vat;

        const transactionData: Omit<Transaction, 'id' | 'createdAt' | 'lastModifiedAt'> = {
            ...values,
            date: values.date.toISOString(),
            invoiceDate: values.invoiceDate?.toISOString(),
            chequeDate: values.chequeDate?.toISOString(),
            dueDate: values.dueDate?.toISOString(),
            amount: grandTotal,
            remarks: values.remarks || '',
            accountId: values.accountId || undefined,
        };

        try {
            if (editingTransaction) {
                await updateTransaction(editingTransaction.id, { ...transactionData, lastModifiedBy: user.username });
                toast({ title: 'Success', description: 'Transaction updated.' });
            } else {
                await addTransaction({ ...transactionData, createdBy: user.username });
                toast({ title: 'Success', description: 'New transaction recorded.' });
            }
            setIsTransactionDialogOpen(false);
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
            form.setValue('partyId', newPartyId);
            toast({title: 'Success', description: 'New party added.'});
            setIsPartyDialogOpen(false);
            setPartyForm({name: '', type: 'Vendor'});
        } catch {
             toast({title: 'Error', description: 'Failed to add party.', variant: 'destructive'});
        }
    };
    
    const handleOpenAccountDialog = (account: Account | null = null) => {
        if (account) {
            setEditingAccount(account);
            setAccountForm({
                name: account.name,
                type: account.type,
                accountNumber: account.accountNumber || '',
                bankName: account.bankName || '',
                branch: account.branch || '',
            });
        } else {
            setEditingAccount(null);
            setAccountForm(initialAccountFormState);
        }
        setIsAccountDialogOpen(true);
    };

    const handleSubmitAccount = async () => {
        if(!user) return;
        if(!accountForm.name || !accountForm.type) {
            toast({title: 'Error', description: 'Account name and type are required.', variant: 'destructive'});
            return;
        }
         if (accountForm.type === 'Bank' && (!accountForm.bankName || !accountForm.accountNumber)) {
            toast({ title: 'Error', description: 'Bank Name and Account Number are required for bank accounts.', variant: 'destructive' });
            return;
        }
        try {
            if (editingAccount) {
                const updatedAccountData: Partial<Omit<Account, 'id'>> = {
                    ...accountForm,
                    lastModifiedBy: user.username,
                };
                await updateAccount(editingAccount.id, updatedAccountData);
                toast({ title: 'Success', description: 'Account updated.' });
            } else {
                 const newAccountData: Omit<Account, 'id'> = {
                    ...accountForm,
                    createdBy: user.username,
                };
                const newAccountId = await addAccount(newAccountData);
                form.setValue('accountId', newAccountId);
                toast({title: 'Success', description: 'New account added.'});
            }
            
            setIsAccountDialogOpen(false);
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
        }));

        if (searchQuery) {
            const lowercasedQuery = searchQuery.toLowerCase();
            augmented = augmented.filter(t =>
                t.vehicleName.toLowerCase().includes(lowercasedQuery) ||
                t.partyName.toLowerCase().includes(lowercasedQuery) ||
                (t.remarks || '').toLowerCase().includes(lowercasedQuery)
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
            if (!aVal) return 1;
            if (!bVal) return -1;
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
    }, [transactions, searchQuery, sortConfig, vehiclesById, partiesById, filterVehicleId, dateRange, vehicles]);

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
        <>
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
                                <Button onClick={() => router.push('/fleet/trip-sheets/new')} className="w-full">
                                    <TrendingUp className="mr-2 h-4 w-4" /> New Sales
                                </Button>
                                <Button onClick={() => handleOpenTransactionDialog(null, 'Purchase')} className="w-full">
                                    <ShoppingCart className="mr-2 h-4 w-4" /> New Purchase
                                </Button>
                                <Button onClick={() => handleOpenTransactionDialog(null, 'Payment')} className="w-full">
                                    <ArrowRightLeft className="mr-2 h-4 w-4" /> New Payment / Receipt
                                </Button>
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
                                            {hasPermission('fleet', 'edit') && <DropdownMenuItem onSelect={() => handleOpenTransactionDialog(txn)}><Edit className="mr-2 h-4 w-4" /> Edit</DropdownMenuItem>}
                                            {hasPermission('fleet', 'delete') && <DropdownMenuSeparator />}
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
                </section>
            </div>
            
             <Dialog open={isTransactionDialogOpen} onOpenChange={setIsTransactionDialogOpen}>
                <DialogContent className="sm:max-w-4xl">
                    <DialogHeader><DialogTitle>{editingTransaction ? 'Edit Transaction' : 'Add New Transaction'}</DialogTitle></DialogHeader>
                    <Form {...form}>
                    <form onSubmit={form.handleSubmit(handleSubmitTransaction)}>
                    <ScrollArea className="max-h-[70vh] p-1">
                    <div className="grid gap-6 py-4 px-2">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            <FormField control={form.control} name="date" render={({ field }) => (
                                <FormItem><FormLabel>Posting Date</FormLabel>
                                <Popover><PopoverTrigger asChild><FormControl>
                                    <Button variant={"outline"} className={cn("w-full justify-start text-left font-normal", !field.value && "text-muted-foreground")}>
                                        <CalendarIcon className="mr-2 h-4 w-4" />{field.value ? `${toNepaliDate(field.value.toISOString())} BS (${format(field.value, "PPP")})` : <span>Pick a date</span>}
                                    </Button>
                                </FormControl></PopoverTrigger><PopoverContent className="w-auto p-0"><DualCalendar selected={field.value} onSelect={field.onChange} /></PopoverContent></Popover>
                                <FormMessage/>
                                </FormItem>
                            )}/>
                            <FormField control={form.control} name="vehicleId" render={({ field }) => (
                                <FormItem><FormLabel>Vehicle</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select vehicle" /></SelectTrigger></FormControl>
                                    <SelectContent>{vehicles.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}</SelectContent>
                                </Select><FormMessage/></FormItem>
                            )}/>
                            <FormField control={form.control} name="partyId" render={({ field }) => (
                                <FormItem><FormLabel>Vendor</FormLabel>
                                <div className="flex gap-2">
                                <Popover><PopoverTrigger asChild><FormControl>
                                    <Button variant="outline" role="combobox" className="w-full justify-between">
                                        {field.value ? partiesById.get(field.value) : "Select party..."}<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                    </Button>
                                </FormControl></PopoverTrigger><PopoverContent className="p-0"><Command>
                                    <CommandInput placeholder="Search party..." />
                                    <CommandList><CommandEmpty>No party found.</CommandEmpty><CommandGroup>
                                        {parties.map(party => <CommandItem key={party.id} value={party.name} onSelect={() => field.onChange(party.id)}>
                                            <Check className={cn("mr-2 h-4 w-4", field.value === party.id ? "opacity-100" : "opacity-0")} />{party.name}
                                        </CommandItem>)}
                                    </CommandGroup></CommandList>
                                </Command></PopoverContent></Popover>
                                <Button type="button" size="icon" variant="outline" onClick={() => setIsPartyDialogOpen(true)}><Plus className="h-4 w-4"/></Button>
                                </div><FormMessage/></FormItem>
                             )}/>
                        </div>
                         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            <FormField control={form.control} name="invoiceNumber" render={({ field }) => (
                                <FormItem><FormLabel>Invoice Number (Optional)</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage/></FormItem>
                            )}/>
                            <FormField control={form.control} name="invoiceDate" render={({ field }) => (
                                <FormItem><FormLabel>Invoice Date (Optional)</FormLabel>
                                 <Popover><PopoverTrigger asChild><FormControl>
                                    <Button variant={"outline"} className={cn("w-full justify-start text-left font-normal", !field.value && "text-muted-foreground")}>
                                        <CalendarIcon className="mr-2 h-4 w-4" />{field.value ? `${toNepaliDate(field.value.toISOString())} BS (${format(field.value, "PPP")})` : <span>Pick a date</span>}
                                    </Button>
                                 </FormControl></PopoverTrigger><PopoverContent className="w-auto p-0"><DualCalendar selected={field.value} onSelect={field.onChange} /></PopoverContent></Popover>
                                <FormMessage/></FormItem>
                            )}/>
                             <FormField control={form.control} name="invoiceType" render={({ field }) => (
                                <FormItem className="space-y-3"><FormLabel>Invoice Type</FormLabel><FormControl>
                                    <RadioGroup onValueChange={field.onChange} value={field.value} className="flex items-center space-x-4">
                                        <FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="Taxable" /></FormControl><FormLabel className="font-normal">Taxable</FormLabel></FormItem>
                                        <FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="Normal" /></FormControl><FormLabel className="font-normal">Normal</FormLabel></FormItem>
                                    </RadioGroup>
                                </FormControl><FormMessage/></FormItem>
                            )}/>
                         </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            <FormField control={form.control} name="billingType" render={({ field }) => (
                                <FormItem><FormLabel>Billing</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select billing type" /></SelectTrigger></FormControl>
                                    <SelectContent>
                                        <SelectItem value="Cash">Cash</SelectItem><SelectItem value="Bank">Bank</SelectItem>
                                        <SelectItem value="Credit">Credit</SelectItem>
                                    </SelectContent>
                                </Select><FormMessage/></FormItem>
                            )}/>
                            {watchBillingType === 'Bank' && (
                                <>
                                 <FormField control={form.control} name="accountId" render={({ field }) => (
                                     <FormItem><FormLabel>Bank Account</FormLabel>
                                        <div className="flex gap-2">
                                            <Popover><PopoverTrigger asChild><FormControl>
                                                <Button variant="outline" role="combobox" className="w-full justify-between">
                                                    {field.value ? accountsById.get(field.value) : "Select account..."}<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                                </Button>
                                            </FormControl></PopoverTrigger><PopoverContent className="p-0 w-[--radix-popover-trigger-width]"><Command>
                                                <CommandInput placeholder="Search accounts..." />
                                                <CommandList><CommandEmpty>No accounts found.</CommandEmpty><CommandGroup>
                                                    {bankAccounts.map(account => <CommandItem key={account.id} value={account.name} onSelect={() => field.onChange(account.id)} className="flex justify-between items-center">
                                                        <div><Check className={cn("mr-2 h-4 w-4", field.value === account.id ? "opacity-100" : "opacity-0")} />{accountsById.get(account.id)}</div>
                                                        <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => {e.stopPropagation(); handleOpenAccountDialog(account);}}><Edit className="h-4 w-4"/></Button>
                                                    </CommandItem>)}
                                                </CommandGroup></CommandList>
                                            </Command></PopoverContent></Popover>
                                            <Button type="button" size="icon" variant="outline" onClick={() => handleOpenAccountDialog(null)}><Plus className="h-4 w-4"/></Button>
                                        </div>
                                     <FormMessage/></FormItem>
                                 )}/>
                                 <FormField control={form.control} name="chequeNumber" render={({ field }) => (<FormItem><FormLabel>Cheque Number</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage/></FormItem>)}/>
                                </>
                            )}
                             {(watchBillingType === 'Credit' || watchBillingType === 'Bank') && (
                                <FormField control={form.control} name="dueDate" render={({ field }) => (<FormItem><FormLabel>{watchBillingType === 'Bank' ? 'Cheque Date' : 'Due Date'}</FormLabel><Popover><PopoverTrigger asChild><FormControl>
                                        <Button variant={"outline"} className={cn("w-full justify-start text-left font-normal", !field.value && "text-muted-foreground")}><CalendarIcon className="mr-2 h-4 w-4" />{field.value ? format(field.value, "PPP") : <span>Pick a date</span>}</Button>
                                </FormControl></PopoverTrigger><PopoverContent className="w-auto p-0"><Calendar mode="single" selected={field.value} onSelect={field.onChange} /></PopoverContent></Popover><FormMessage/></FormItem>)}/>
                             )}
                        </div>
                        <div>
                        <Label className="text-base font-medium">Particulars</Label>
                        <Table><TableHeader><TableRow>
                            <TableHead>Particular</TableHead><TableHead>Quantity</TableHead><TableHead>UOM</TableHead><TableHead>Rate</TableHead><TableHead>Amount</TableHead><TableHead/>
                        </TableRow></TableHeader>
                        <TableBody>
                        {fields.map((item, index) => (
                            <TableRow key={item.id}>
                                <TableCell><FormField control={form.control} name={`items.${index}.particular`} render={({ field }) => <Input {...field} />} /></TableCell>
                                <TableCell><FormField control={form.control} name={`items.${index}.quantity`} render={({ field }) => <Input type="number" {...field} onChange={e => field.onChange(parseFloat(e.target.value) || 0)} />} /></TableCell>
                                <TableCell><FormField control={form.control} name={`items.${index}.uom`} render={({ field }) => <Input {...field} />} /></TableCell>
                                <TableCell><FormField control={form.control} name={`items.${index}.rate`} render={({ field }) => <Input type="number" {...field} onChange={e => field.onChange(parseFloat(e.target.value) || 0)} />} /></TableCell>
                                <TableCell>{((watchItems[index]?.quantity || 0) * (watchItems[index]?.rate || 0)).toLocaleString()}</TableCell>
                                <TableCell><Button type="button" variant="ghost" size="icon" onClick={() => remove(index)}><X className="h-4 w-4 text-destructive"/></Button></TableCell>
                            </TableRow>
                        ))}
                        </TableBody></Table>
                        <Button type="button" size="sm" variant="outline" className="mt-2" onClick={() => append({ particular: '', quantity: 1, uom: '', rate: 0 })}>
                            <Plus className="mr-2 h-4 w-4"/> Add Row
                        </Button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Calculation</Label>
                                <div className="p-4 border rounded-md space-y-2">
                                    <div className="flex justify-between text-sm"><span>Subtotal</span><span>{subtotal.toLocaleString(undefined, {maximumFractionDigits: 2})}</span></div>
                                    {watchInvoiceType === 'Taxable' && <div className="flex justify-between text-sm"><span>VAT (13%)</span><span>{vatAmount.toLocaleString(undefined, {maximumFractionDigits: 2})}</span></div>}
                                    <div className="flex justify-between font-bold"><span>Grand Total</span><span>{totalAmount.toLocaleString(undefined, {maximumFractionDigits: 2})}</span></div>
                                </div>
                            </div>
                            <FormField control={form.control} name="remarks" render={({ field }) => (
                                <FormItem><FormLabel>Remarks</FormLabel><FormControl><Textarea className="min-h-[110px]" {...field} /></FormControl><FormMessage/></FormItem>
                            )}/>
                        </div>
                    </div>
                    </ScrollArea>
                    <DialogFooter>
                        <Button variant="outline" type="button" onClick={() => setIsTransactionDialogOpen(false)}>Cancel</Button>
                        <Button type="submit">{editingTransaction ? 'Save Changes' : 'Add Transaction'}</Button>
                    </DialogFooter>
                    </form>
                    </Form>
                </DialogContent>
            </Dialog>
            
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
                                <SelectContent>
                                    <SelectItem value="Vendor">Vendor</SelectItem>
                                    <SelectItem value="Client">Client</SelectItem>
                                    <SelectItem value="Both">Both</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsPartyDialogOpen(false)}>Cancel</Button>
                        <Button onClick={handleSubmitParty}>Add Party</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={isAccountDialogOpen} onOpenChange={setIsAccountDialogOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader><DialogTitle>{editingAccount ? 'Edit Account' : 'Add New Account'}</DialogTitle></DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="account-type">Account Type</Label>
                            <Select value={accountForm.type} onValueChange={(v: AccountType) => setAccountForm(p => ({...p, type: v}))}>
                                <SelectTrigger id="account-type"><SelectValue/></SelectTrigger>
                                <SelectContent><SelectItem value="Cash">Cash</SelectItem><SelectItem value="Bank">Bank</SelectItem></SelectContent>
                            </Select>
                        </div>
                         <div className="space-y-2">
                            <Label htmlFor="account-name">{accountForm.type === 'Bank' ? 'Account Holder Name' : 'Account Name'}</Label>
                            <Input id="account-name" value={accountForm.name} onChange={e => setAccountForm(p => ({...p, name: e.target.value}))} />
                        </div>
                        {accountForm.type === 'Bank' && (
                            <>
                                <div className="space-y-2">
                                    <Label htmlFor="bank-name">Bank Name</Label>
                                    <Input id="bank-name" value={accountForm.bankName} onChange={e => setAccountForm(p => ({...p, bankName: e.target.value}))} />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="account-number">Account Number</Label>
                                    <Input id="account-number" value={accountForm.accountNumber} onChange={e => setAccountForm(p => ({...p, accountNumber: e.target.value}))} />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="branch">Branch</Label>
                                    <Input id="branch" value={accountForm.branch} onChange={e => setAccountForm(p => ({...p, branch: e.target.value}))} />
                                </div>
                            </>
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => { setIsAccountDialogOpen(false); setAccountForm(initialAccountFormState);}}>Cancel</Button>
                        <Button onClick={handleSubmitAccount}>{editingAccount ? 'Save Changes' : 'Add Account'}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}

