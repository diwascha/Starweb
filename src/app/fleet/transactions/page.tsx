
'use client';

import { useState, useEffect, useMemo } from 'react';
import useLocalStorage from '@/hooks/use-local-storage';
import type { Transaction, Vehicle, TransactionType, ExpenseCategory, IncomeSource } from '@/lib/types';
import { expenseCategories, incomeSources } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Plus, Edit, Trash2, MoreHorizontal, ArrowUpDown, Search, CalendarIcon, ArrowRightLeft, Landmark, Wrench } from 'lucide-react';
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
import { format, isWithinInterval, startOfDay, endOfDay } from 'date-fns';
import { cn, toNepaliDate } from '@/lib/utils';
import { DualCalendar } from '@/components/ui/dual-calendar';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import type { DateRange } from 'react-day-picker';
import { DualDateRangePicker } from '@/components/ui/dual-date-range-picker';


type TransactionSortKey = 'date' | 'vehicleName' | 'type' | 'category' | 'amount';
type SortDirection = 'asc' | 'desc';

export default function TransactionsPage() {
    const [transactions, setTransactions] = useLocalStorage<Transaction[]>('transactions', []);
    const [vehicles] = useLocalStorage<Vehicle[]>('vehicles', []);
    const [isClient, setIsClient] = useState(false);
    
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
    const [formState, setFormState] = useState<Omit<Transaction, 'id'>>({
        vehicleId: '',
        date: new Date().toISOString(),
        type: 'Expense',
        category: 'Fuel',
        amount: 0,
        description: '',
    });
    
    const [searchQuery, setSearchQuery] = useState('');
    const [sortConfig, setSortConfig] = useState<{ key: TransactionSortKey; direction: SortDirection }>({ key: 'date', direction: 'desc' });
    const [filterVehicleId, setFilterVehicleId] = useState<string>('All');
    const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
    
    const { toast } = useToast();
    const { hasPermission } = useAuth();
    
    const vehiclesById = useMemo(() => new Map(vehicles.map(v => [v.id, v.name])), [vehicles]);
    
    const categoryOptions = formState.type === 'Income' ? incomeSources : expenseCategories;

    useEffect(() => {
        setIsClient(true);
    }, []);

    const resetForm = () => {
        setEditingTransaction(null);
        setFormState({
            vehicleId: '',
            date: new Date().toISOString(),
            type: 'Expense',
            category: 'Fuel',
            amount: 0,
            description: '',
        });
    };

    const handleOpenDialog = (transaction: Transaction | null = null) => {
        if (transaction) {
            setEditingTransaction(transaction);
            setFormState(transaction);
        } else {
            resetForm();
        }
        setIsDialogOpen(true);
    };

    const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormState(prev => ({ ...prev, [name]: name === 'amount' ? parseFloat(value) || 0 : value }));
    };
    
    const handleSelectChange = (name: keyof Omit<Transaction, 'id'>, value: string) => {
        setFormState(prev => ({ ...prev, [name]: value }));
        if (name === 'type') {
            // Reset category when type changes
            const defaultCategory = value === 'Income' ? incomeSources[0] : expenseCategories[0];
            setFormState(prev => ({ ...prev, category: defaultCategory }));
        }
    };

     const handleDateChange = (date: Date | undefined) => {
        if (date) {
            setFormState(prev => ({ ...prev, date: date.toISOString() }));
        }
    };

    const handleSubmit = () => {
        if (!formState.vehicleId || !formState.category || formState.amount <= 0) {
            toast({ title: 'Error', description: 'Vehicle, Category, and a valid Amount are required.', variant: 'destructive' });
            return;
        }

        if (editingTransaction) {
            const updatedTxn = { ...editingTransaction, ...formState };
            setTransactions(transactions.map(t => t.id === editingTransaction.id ? updatedTxn : t));
            toast({ title: 'Success', description: 'Transaction updated.' });
        } else {
            const newTxn: Transaction = { id: crypto.randomUUID(), ...formState };
            setTransactions([...transactions, newTxn]);
            toast({ title: 'Success', description: 'New transaction recorded.' });
        }
        setIsDialogOpen(false);
        resetForm();
    };

    const handleDelete = (id: string) => {
        setTransactions(transactions.filter(t => t.id !== id));
        toast({ title: 'Success', description: 'Transaction deleted.' });
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
        }));

        if (searchQuery) {
            const lowercasedQuery = searchQuery.toLowerCase();
            augmented = augmented.filter(t =>
                t.vehicleName.toLowerCase().includes(lowercasedQuery) ||
                t.category.toLowerCase().includes(lowercasedQuery) ||
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
        return augmented;
    }, [transactions, searchQuery, sortConfig, vehiclesById, filterVehicleId, dateRange]);

    const { totalIncome, totalExpense } = useMemo(() => {
        return sortedAndFilteredTransactions.reduce((acc, txn) => {
            if (txn.type === 'Income') acc.totalIncome += txn.amount;
            else acc.totalExpense += txn.amount;
            return acc;
        }, { totalIncome: 0, totalExpense: 0 });
    }, [sortedAndFilteredTransactions]);
    
    const netTotal = totalIncome - totalExpense;


    const renderContent = () => {
        if (!isClient) {
            return (
                <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm py-24">
                  <h3 className="text-2xl font-bold tracking-tight">Loading...</h3>
                </div>
            );
        }

        if (transactions.length === 0) {
            return (
                <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm py-24">
                  <div className="flex flex-col items-center gap-1 text-center">
                    <h3 className="text-2xl font-bold tracking-tight">No transactions found</h3>
                    <p className="text-sm text-muted-foreground">Get started by adding a new income or expense record.</p>
                    {hasPermission('fleet', 'create') && (
                        <DialogTrigger asChild>
                            <Button className="mt-4" onClick={() => handleOpenDialog()}>
                                <Plus className="mr-2 h-4 w-4" /> Add Transaction
                            </Button>
                        </DialogTrigger>
                    )}
                  </div>
                </div>
            );
        }

        return (
            <Card>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead><Button variant="ghost" onClick={() => requestSort('date')}>Date <ArrowUpDown className="ml-2 h-4 w-4" /></Button></TableHead>
                            <TableHead><Button variant="ghost" onClick={() => requestSort('vehicleName')}>Vehicle <ArrowUpDown className="ml-2 h-4 w-4" /></Button></TableHead>
                            <TableHead><Button variant="ghost" onClick={() => requestSort('type')}>Type <ArrowUpDown className="ml-2 h-4 w-4" /></Button></TableHead>
                            <TableHead><Button variant="ghost" onClick={() => requestSort('category')}>Category <ArrowUpDown className="ml-2 h-4 w-4" /></Button></TableHead>
                            <TableHead><Button variant="ghost" onClick={() => requestSort('amount')}>Amount <ArrowUpDown className="ml-2 h-4 w-4" /></Button></TableHead>
                            <TableHead>Description</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {sortedAndFilteredTransactions.map(txn => (
                            <TableRow key={txn.id}>
                                <TableCell>{toNepaliDate(txn.date)}</TableCell>
                                <TableCell>{txn.vehicleName}</TableCell>
                                <TableCell>
                                    <Badge variant={txn.type === 'Income' ? 'outline' : 'secondary'}>{txn.type}</Badge>
                                </TableCell>
                                <TableCell>{txn.category}</TableCell>
                                <TableCell className={cn(txn.type === 'Income' ? 'text-green-600' : 'text-red-600')}>
                                    {txn.amount.toLocaleString()}
                                </TableCell>
                                <TableCell>{txn.description}</TableCell>
                                <TableCell className="text-right">
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            {hasPermission('fleet', 'edit') && <DropdownMenuItem onSelect={() => handleOpenDialog(txn)}><Edit className="mr-2 h-4 w-4" /> Edit</DropdownMenuItem>}
                                            {hasPermission('fleet', 'delete') && <DropdownMenuSeparator />}
                                            {hasPermission('fleet', 'delete') && (
                                                <AlertDialog>
                                                    <AlertDialogTrigger asChild><DropdownMenuItem onSelect={e => e.preventDefault()}><Trash2 className="mr-2 h-4 w-4 text-destructive" /> <span className="text-destructive">Delete</span></DropdownMenuItem></AlertDialogTrigger>
                                                    <AlertDialogContent>
                                                        <AlertDialogHeader><AlertDialogTitle>Are you sure?</AlertDialogTitle><AlertDialogDescription>This will permanently delete the transaction.</AlertDialogDescription></AlertDialogHeader>
                                                        <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => handleDelete(txn.id)}>Delete</AlertDialogAction></AlertDialogFooter>
                                                    </AlertDialogContent>
                                                </AlertDialog>
                                            )}
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </Card>
        );
    };

    return (
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <div className="flex flex-col gap-8">
                <header className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">Transactions</h1>
                        <p className="text-muted-foreground">Manage your vehicle income and expense records.</p>
                    </div>
                     <div className="flex items-center gap-2">
                        {hasPermission('fleet', 'create') && (
                            <DialogTrigger asChild>
                                <Button onClick={() => handleOpenDialog()}>
                                    <Plus className="mr-2 h-4 w-4" /> Add Transaction
                                </Button>
                            </DialogTrigger>
                        )}
                    </div>
                </header>
                 {isClient && transactions.length > 0 && (
                    <>
                        <div className="flex flex-col md:flex-row gap-2">
                            <div className="relative flex-1">
                                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    type="search"
                                    placeholder="Search transactions..."
                                    className="pl-8 w-full"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                />
                            </div>
                            <div className="flex gap-2">
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <Button
                                            id="date"
                                            variant={"outline"}
                                            className={cn(
                                            "w-full md:w-[300px] justify-start text-left font-normal",
                                            !dateRange && "text-muted-foreground"
                                            )}
                                        >
                                            <CalendarIcon className="mr-2 h-4 w-4" />
                                            {dateRange?.from ? (
                                            dateRange.to ? (
                                                <>
                                                {format(dateRange.from, "LLL dd, y")} -{" "}
                                                {format(dateRange.to, "LLL dd, y")}
                                                </>
                                            ) : (
                                                format(dateRange.from, "LLL dd, y")
                                            )
                                            ) : (
                                            <span>Pick a date range</span>
                                            )}
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0" align="end">
                                        <DualDateRangePicker
                                            selected={dateRange}
                                            onSelect={setDateRange}
                                        />
                                    </PopoverContent>
                                </Popover>
                                <Select value={filterVehicleId} onValueChange={setFilterVehicleId}>
                                    <SelectTrigger className="w-full md:w-[250px]">
                                        <SelectValue placeholder="Filter by vehicle..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="All">All Vehicles</SelectItem>
                                        {vehicles.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div className="grid gap-4 md:grid-cols-3">
                            <Card>
                                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                    <CardTitle className="text-sm font-medium">Total Income</CardTitle>
                                    <Landmark className="h-4 w-4 text-muted-foreground" />
                                </CardHeader>
                                <CardContent>
                                    <div className="text-2xl font-bold text-green-600">{totalIncome.toLocaleString()}</div>
                                </CardContent>
                            </Card>
                            <Card>
                                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                    <CardTitle className="text-sm font-medium">Total Expense</CardTitle>
                                    <Wrench className="h-4 w-4 text-muted-foreground" />
                                </CardHeader>
                                <CardContent>
                                    <div className="text-2xl font-bold text-red-600">{totalExpense.toLocaleString()}</div>
                                </CardContent>
                            </Card>
                            <Card>
                                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                    <CardTitle className="text-sm font-medium">Net Total</CardTitle>
                                    <ArrowRightLeft className="h-4 w-4 text-muted-foreground" />
                                </CardHeader>
                                <CardContent>
                                    <div className={cn("text-2xl font-bold", netTotal >= 0 ? 'text-green-600' : 'text-red-600' )}>{netTotal.toLocaleString()}</div>
                                </CardContent>
                            </Card>
                        </div>
                    </>
                )}
                {renderContent()}
            </div>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{editingTransaction ? 'Edit Transaction' : 'Add New Transaction'}</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="date">Date</Label>
                         <Popover>
                            <PopoverTrigger asChild>
                                <Button variant={"outline"} className={cn("w-full justify-start text-left font-normal", !formState.date && "text-muted-foreground")}>
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {formState.date ? `${toNepaliDate(formState.date)} BS (${format(new Date(formState.date), "PPP")})` : <span>Pick a date</span>}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0">
                                <DualCalendar selected={new Date(formState.date)} onSelect={handleDateChange} />
                            </PopoverContent>
                        </Popover>
                    </div>
                     <div className="space-y-2">
                        <Label htmlFor="vehicleId">Vehicle</Label>
                        <Select value={formState.vehicleId} onValueChange={(value) => handleSelectChange('vehicleId', value)}>
                            <SelectTrigger id="vehicleId"><SelectValue placeholder="Select a vehicle" /></SelectTrigger>
                            <SelectContent>
                                {vehicles.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                     <div className="grid grid-cols-2 gap-4">
                         <div className="space-y-2">
                            <Label htmlFor="type">Type</Label>
                            <Select value={formState.type} onValueChange={(value: TransactionType) => handleSelectChange('type', value)}>
                                <SelectTrigger id="type"><SelectValue placeholder="Select type" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Income">Income</SelectItem>
                                    <SelectItem value="Expense">Expense</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                         <div className="space-y-2">
                            <Label htmlFor="category">Category</Label>
                            <Select value={formState.category} onValueChange={(value) => handleSelectChange('category', value)}>
                                <SelectTrigger id="category"><SelectValue placeholder="Select category" /></SelectTrigger>
                                <SelectContent>
                                    {categoryOptions.map(opt => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                     <div className="space-y-2">
                        <Label htmlFor="amount">Amount</Label>
                        <Input id="amount" name="amount" type="number" value={formState.amount} onChange={handleFormChange} />
                    </div>
                     <div className="space-y-2">
                        <Label htmlFor="description">Description</Label>
                        <Textarea id="description" name="description" value={formState.description} onChange={handleFormChange} placeholder="Optional details..." />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                    <Button onClick={handleSubmit}>{editingTransaction ? 'Save Changes' : 'Add Transaction'}</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

    
