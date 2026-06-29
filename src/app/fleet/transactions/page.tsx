
'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { Transaction, Vehicle, Party } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { 
  PlusCircle, 
  Search, 
  ArrowUpDown, 
  MoreHorizontal, 
  Eye, 
  Edit, 
  Trash2, 
  CalendarIcon, 
  FileSpreadsheet, 
  FileText, 
  Loader2, 
  TrendingUp, 
  FilterX, 
  Wallet, 
  ArrowUpRight,
  ArrowDownLeft,
  Truck,
  Users,
  Clock,
  ChevronRight,
  X,
  ChevronsUpDown,
  Check
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
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
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import NepaliDate from 'nepali-date-converter';
import { NEPALI_MONTHS } from '@/lib/constants';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Tooltip, TooltipProvider, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

type LedgerView = 'vehicle' | 'party';

interface ProcessedTransaction extends Transaction {
    vehicleName: string;
    partyName: string;
    direction: 'Income' | 'Expense';
    displayCategory: string;
    reference: string;
    paidAmount: number;
    dueAmount: number;
    status: 'Paid' | 'Partial' | 'Due';
}

export default function FleetTransactionsPage() {
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [parties, setParties] = useState<Party[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const router = useRouter();
    const { toast } = useToast();
    const { hasPermission } = useAuth();

    // UI States
    const [activeView, setActiveView] = useState<LedgerView>('vehicle');
    const [searchQuery, setSearchQuery] = useState('');
    
    // Period Filters
    const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
    const [selectedBsYear, setSelectedBsYear] = useState<string>(String(new NepaliDate().getYear()));
    const [selectedBsMonth, setSelectedBsMonth] = useState<string>(String(new NepaliDate().getMonth()));
    
    // Search Filters
    const [filterVehicleId, setFilterVehicleId] = useState<string>('All');
    const [filterPartyId, setFilterPartyId] = useState<string>('All');
    const [filterCategory, setFilterCategory] = useState<string>('All');
    const [filterStatus, setFilterStatus] = useState<string>('All');
    const [filterDirection, setFilterDirection] = useState<'All' | 'Income' | 'Expense'>('All');

    // Command/Search Controls
    const [isVehicleSearchOpen, setIsVehicleSearchOpen] = useState(false);
    
    useEffect(() => {
        setIsLoading(true);
        const unsubs = [
            onTransactionsUpdate(setTransactions),
            onVehiclesUpdate(setVehicles),
            onPartiesUpdate(setParties)
        ];
        setIsLoading(false);
        return () => unsubs.forEach(u => u());
    }, []);

    const vehiclesById = useMemo(() => new Map(vehicles.map(v => [v.id, v.name])), [vehicles]);
    const partiesById = useMemo(() => new Map(parties.map(p => [p.id, p.name])), [parties]);

    const availableYears = useMemo(() => {
        const years = new Set<number>();
        years.add(new NepaliDate().getYear());
        transactions.forEach(t => {
            try {
                years.add(new NepaliDate(new Date(t.date)).getYear());
            } catch {}
        });
        return Array.from(years).sort((a, b) => b - a);
    }, [transactions]);

    const allCategories = useMemo(() => {
        const cats = new Set<string>();
        transactions.forEach(t => { if (t.category) cats.add(t.category); });
        return Array.from(cats).sort();
    }, [transactions]);

    const processedData = useMemo(() => {
        const rawMapped = transactions.map(t => {
            const direction = (t.type === 'Sales' || t.type === 'Receipt') ? 'Income' : 'Expense';
            const vehicleName = vehiclesById.get(t.vehicleId) || 'N/A';
            const partyName = t.partyId ? partiesById.get(t.partyId) || 'Unassigned' : 'Unassigned';
            
            let reference = '';
            if (t.referenceType && t.referenceId) reference = `${t.referenceType}: ${t.referenceId}`;
            else if (t.purchaseNumber) reference = `PO: ${t.purchaseNumber}`;
            else if (t.tripId) reference = `Trip Sheet`;
            else reference = 'Direct Entry';

            return { ...t, direction, vehicleName, partyName, reference };
        });

        const processed: ProcessedTransaction[] = [];
        const handledIds = new Set<string>();

        rawMapped.forEach(t => {
            if (handledIds.has(t.id)) return;

            if (t.type === 'Sales' || t.type === 'Purchase') {
                const associatedPayments = rawMapped.filter(p => 
                    p.id !== t.id && 
                    (p.referenceId === t.referenceId || (t.type === 'Purchase' && p.purchaseNumber === t.purchaseNumber)) &&
                    (p.type === 'Receipt' || p.type === 'Payment')
                );

                const paidAmount = associatedPayments.reduce((sum, p) => sum + p.amount, 0);
                const dueAmount = Math.max(0, t.amount - paidAmount);
                
                let status: 'Paid' | 'Partial' | 'Due' = 'Due';
                if (dueAmount <= 0) status = 'Paid';
                else if (paidAmount > 0) status = 'Partial';

                processed.push({
                    ...t,
                    displayCategory: t.category || (t.type === 'Sales' ? 'Freight' : 'Procurement'),
                    paidAmount,
                    dueAmount,
                    status
                });

                associatedPayments.forEach(p => handledIds.add(p.id));
                handledIds.add(t.id);
            }
        });

        rawMapped.forEach(t => {
            if (!handledIds.has(t.id)) {
                processed.push({
                    ...t,
                    displayCategory: t.category || t.type,
                    paidAmount: t.amount,
                    dueAmount: 0,
                    status: 'Paid'
                });
            }
        });

        return processed.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [transactions, vehiclesById, partiesById]);

    const filteredTransactions = useMemo(() => {
        let filtered = [...processedData];

        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            filtered = filtered.filter(t => 
                t.vehicleName.toLowerCase().includes(q) || 
                t.partyName.toLowerCase().includes(q) || 
                t.displayCategory.toLowerCase().includes(q) ||
                t.reference.toLowerCase().includes(q)
            );
        }

        if (dateRange?.from) {
            const interval = { start: startOfDay(dateRange.from), end: endOfDay(dateRange.to || dateRange.from) };
            filtered = filtered.filter(t => isWithinInterval(new Date(t.date), interval));
        }

        if (selectedBsYear !== 'All') {
            filtered = filtered.filter(t => new NepaliDate(new Date(t.date)).getYear() === parseInt(selectedBsYear));
        }

        if (selectedBsMonth !== 'All') {
            filtered = filtered.filter(t => new NepaliDate(new Date(t.date)).getMonth() === parseInt(selectedBsMonth));
        }

        if (filterVehicleId !== 'All') filtered = filtered.filter(t => t.vehicleId === filterVehicleId);
        if (filterPartyId !== 'All') filtered = filtered.filter(t => t.partyId === filterPartyId);
        if (filterCategory !== 'All') filtered = filtered.filter(t => t.category === filterCategory);
        if (filterDirection !== 'All') filtered = filtered.filter(t => t.direction === filterDirection);
        
        if (filterStatus === 'Outstanding') filtered = filtered.filter(t => t.status !== 'Paid');
        else if (filterStatus !== 'All') filtered = filtered.filter(t => t.status === filterStatus);

        return filtered;
    }, [processedData, searchQuery, dateRange, selectedBsYear, selectedBsMonth, filterVehicleId, filterPartyId, filterCategory, filterDirection, filterStatus]);

    const stats = useMemo(() => {
        let income = 0;
        let expense = 0;
        let receivable = 0;
        let payable = 0;

        filteredTransactions.forEach(t => {
            if (t.direction === 'Income') income += t.amount;
            else expense += t.amount;
            
            if (t.type === 'Sales') receivable += t.dueAmount;
            if (t.type === 'Purchase') payable += t.dueAmount;
        });

        return {
            income,
            expense,
            profit: income - expense,
            receivable,
            payable
        };
    }, [filteredTransactions]);

    const vehicleSummaryRows = useMemo(() => {
        const summaryMap = new Map<string, { id: string, name: string, income: number, expense: number, profit: number, due: number }>();
        
        vehicles.forEach(v => {
            summaryMap.set(v.id, { id: v.id, name: v.name, income: 0, expense: 0, profit: 0, due: 0 });
        });

        // Use filteredTransactions but without the vehicle filter to get the table data for the current period/category
        const periodFiltered = processedData.filter(t => {
            if (dateRange?.from) {
                const interval = { start: startOfDay(dateRange.from), end: endOfDay(dateRange.to || dateRange.from) };
                if (!isWithinInterval(new Date(t.date), interval)) return false;
            }
            if (selectedBsYear !== 'All' && new NepaliDate(new Date(t.date)).getYear() !== parseInt(selectedBsYear)) return false;
            if (selectedBsMonth !== 'All' && new NepaliDate(new Date(t.date)).getMonth() !== parseInt(selectedBsMonth)) return false;
            if (filterCategory !== 'All' && t.category !== filterCategory) return false;
            return true;
        });

        periodFiltered.forEach(t => {
            const entry = summaryMap.get(t.vehicleId);
            if (entry) {
                if (t.direction === 'Income') entry.income += t.amount;
                else entry.expense += t.amount;
                entry.due += t.dueAmount;
                entry.profit = entry.income - entry.expense;
            }
        });

        return Array.from(summaryMap.values())
            .filter(v => v.income > 0 || v.expense > 0 || v.id === filterVehicleId)
            .sort((a, b) => b.income - a.income);
    }, [vehicles, processedData, dateRange, selectedBsYear, selectedBsMonth, filterCategory, filterVehicleId]);

    const partnerSummaryRows = useMemo(() => {
        const summaryMap = new Map<string, { id: string, name: string, billing: number, settled: number, balance: number }>();
        
        parties.filter(p => p.ownership === 'Sijan' || p.ownership === 'Both').forEach(p => {
            summaryMap.set(p.id, { id: p.id, name: p.name, billing: 0, settled: 0, balance: 0 });
        });

        const periodFiltered = processedData.filter(t => {
            if (dateRange?.from) {
                const interval = { start: startOfDay(dateRange.from), end: endOfDay(dateRange.to || dateRange.from) };
                if (!isWithinInterval(new Date(t.date), interval)) return false;
            }
            if (selectedBsYear !== 'All' && new NepaliDate(new Date(t.date)).getYear() !== parseInt(selectedBsYear)) return false;
            if (selectedBsMonth !== 'All' && new NepaliDate(new Date(t.date)).getMonth() !== parseInt(selectedBsMonth)) return false;
            if (filterCategory !== 'All' && t.category !== filterCategory) return false;
            return true;
        });

        periodFiltered.forEach(t => {
            if (t.partyId) {
                const entry = summaryMap.get(t.partyId);
                if (entry) {
                    if (t.type === 'Sales' || t.type === 'Purchase') entry.billing += t.amount;
                    entry.settled += t.paidAmount;
                    entry.balance += t.dueAmount;
                }
            }
        });

        return Array.from(summaryMap.values())
            .filter(p => p.billing > 0 || p.settled > 0 || p.id === filterPartyId)
            .sort((a, b) => b.billing - a.billing);
    }, [parties, processedData, dateRange, selectedBsYear, selectedBsMonth, filterCategory, filterPartyId]);

    const handleClearFilters = () => {
        setSearchQuery('');
        setDateRange(undefined);
        const nowBS = new NepaliDate();
        setSelectedBsYear(String(nowBS.getYear()));
        setSelectedBsMonth(String(nowBS.getMonth()));
        setFilterVehicleId('All');
        setFilterPartyId('All');
        setFilterCategory('All');
        setFilterStatus('All');
        setFilterDirection('All');
    };

    const handleDelete = async (voucherId?: string) => {
        if (!voucherId) return;
        try {
            await deleteVoucher(voucherId);
            toast({ title: 'Record Deleted' });
        } catch {
             toast({ title: 'Error', variant: 'destructive' });
        }
    };

    const VehicleSearchPopover = ({ className }: { className?: string }) => (
        <Popover open={isVehicleSearchOpen} onOpenChange={setIsVehicleSearchOpen}>
            <PopoverTrigger asChild>
                <Button variant="outline" role="combobox" className={cn("justify-between h-10 bg-white", className)}>
                    <div className="flex items-center gap-2">
                        <Truck className="h-4 w-4 text-muted-foreground" />
                        {filterVehicleId === 'All' ? "Search Vehicle..." : vehiclesById.get(filterVehicleId)}
                    </div>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="p-0 w-[--radix-popover-trigger-width]">
                <Command>
                    <CommandInput placeholder="Type number (e.g. 1175)..." />
                    <CommandList>
                        <CommandEmpty>No vehicle found.</CommandEmpty>
                        <CommandGroup>
                            <CommandItem value="All" onSelect={() => { setFilterVehicleId('All'); setIsVehicleSearchOpen(false); }}>
                                <Check className={cn("mr-2 h-4 w-4", filterVehicleId === 'All' ? "opacity-100" : "opacity-0")} />
                                All Vehicles
                            </CommandItem>
                            {vehicles.map(v => (
                                <CommandItem key={v.id} value={v.name} onSelect={() => { setFilterVehicleId(v.id); setIsVehicleSearchOpen(false); }}>
                                    <Check className={cn("mr-2 h-4 w-4", filterVehicleId === v.id ? "opacity-100" : "opacity-0")} />
                                    {v.name}
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );

    const CategorySelect = ({ className }: { className?: string }) => (
        <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className={cn("h-10 bg-white text-xs", className)}><SelectValue placeholder="All Categories" /></SelectTrigger>
            <SelectContent><SelectItem value="All">All Categories</SelectItem>{allCategories.map(cat => <SelectItem key={cat} value={cat}>{cat}</SelectItem>)}</SelectContent>
        </Select>
    );

    return (
        <div className="flex flex-col gap-6">
            <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Fleet Ledger</h1>
                    <p className="text-muted-foreground text-sm">Business-centric financial tracking for vehicles and partners.</p>
                </div>
                <div className="flex items-center gap-2">
                    <Button onClick={() => router.push('/fleet/transactions/payment-receipt/new')} size="sm">
                        <PlusCircle className="mr-2 h-4 w-4" /> Pmt. / Rcd. Voucher
                    </Button>
                    <Button onClick={() => router.push('/fleet/transactions/expenses/new')} size="sm" variant="secondary">
                        <Wallet className="mr-2 h-4 w-4" /> Daily Exp. Entry
                    </Button>
                </div>
            </header>

            <Card className="sticky top-0 z-20 shadow-md bg-background/95 backdrop-blur border-primary/20">
                <CardContent className="p-4 space-y-4">
                    <div className="flex flex-wrap gap-3 items-end">
                        <div className="space-y-1.5">
                            <Label className="text-[10px] uppercase font-bold text-muted-foreground">Year (BS)</Label>
                            <Select value={selectedBsYear} onValueChange={setSelectedBsYear}>
                                <SelectTrigger className="w-[100px] h-10 bg-white text-xs">
                                    <SelectValue placeholder="Year" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="All">All</SelectItem>
                                    {availableYears.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-[10px] uppercase font-bold text-muted-foreground">Month (BS)</Label>
                            <Select value={selectedBsMonth} onValueChange={setSelectedBsMonth}>
                                <SelectTrigger className="w-[120px] h-10 bg-white text-xs">
                                    <SelectValue placeholder="Month" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="All">All</SelectItem>
                                    {NEPALI_MONTHS.map(m => <SelectItem key={m.value} value={String(m.value)}>{m.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-[10px] uppercase font-bold text-muted-foreground">AD Range</Label>
                            <Popover><PopoverTrigger asChild><Button variant="outline" className={cn("h-10 justify-start text-left font-normal bg-white text-xs min-w-[220px]", !dateRange && "text-muted-foreground")}><CalendarIcon className="mr-2 h-4 w-4" />{dateRange?.from ? (dateRange.to ? (`${toNepaliDate(dateRange.from.toISOString())} - ${toNepaliDate(dateRange.to.toISOString())}`) : toNepaliDate(dateRange.from.toISOString())) : (<span>Pick AD Range</span>)}</Button></PopoverTrigger><PopoverContent className="w-auto p-0" align="start"><DualDateRangePicker selected={dateRange} onSelect={setDateRange} /></PopoverContent></Popover>
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-[10px] uppercase font-bold text-muted-foreground">Payment Status</Label>
                            <Select value={filterStatus} onValueChange={setFilterStatus}>
                                <SelectTrigger className="w-[130px] h-10 bg-white text-xs"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="All">All Status</SelectItem>
                                    <SelectItem value="Paid">Paid</SelectItem>
                                    <SelectItem value="Partial">Partial</SelectItem>
                                    <SelectItem value="Outstanding">Outstanding</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-[10px] uppercase font-bold text-muted-foreground">Flow</Label>
                            <Select value={filterDirection} onValueChange={(v: any) => setFilterDirection(v)}>
                                <SelectTrigger className="w-[110px] h-10 bg-white text-xs"><SelectValue /></SelectTrigger>
                                <SelectContent><SelectItem value="All">Both</SelectItem><SelectItem value="Income">Income</SelectItem><SelectItem value="Expense">Expense</SelectItem></SelectContent>
                            </Select>
                        </div>

                        <Button variant="ghost" size="icon" onClick={handleClearFilters} className="h-10 w-10 text-muted-foreground">
                            <FilterX className="h-5 w-5" />
                        </Button>
                    </div>
                </CardContent>
            </Card>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 animate-in fade-in slide-in-from-top-4 duration-300">
                <Card className="bg-emerald-50 border-emerald-200 border-l-4 border-l-emerald-600">
                    <CardHeader className="py-3 px-4 flex flex-row items-center justify-between space-y-0">
                        <CardTitle className="text-[10px] uppercase font-bold text-emerald-800 tracking-wider">Total Income</CardTitle>
                        <ArrowUpRight className="h-4 w-4 text-emerald-600" />
                    </CardHeader>
                    <CardContent className="px-4 pb-3">
                        <div className="text-xl font-black text-emerald-950">Rs. {stats.income.toLocaleString()}</div>
                    </CardContent>
                </Card>
                <Card className="bg-red-50 border-red-200 border-l-4 border-l-red-600">
                    <CardHeader className="py-3 px-4 flex flex-row items-center justify-between space-y-0">
                        <CardTitle className="text-[10px] uppercase font-bold text-red-800 tracking-wider">Total Expense</CardTitle>
                        <ArrowDownLeft className="h-4 w-4 text-red-600" />
                    </CardHeader>
                    <CardContent className="px-4 pb-3">
                        <div className="text-xl font-black text-red-950">Rs. {stats.expense.toLocaleString()}</div>
                    </CardContent>
                </Card>
                <Card className={cn("border-l-4 shadow-sm", stats.profit >= 0 ? "bg-blue-50 border-blue-200 border-l-blue-600" : "bg-orange-50 border-orange-200 border-l-orange-600")}>
                    <CardHeader className="py-3 px-4 flex flex-row items-center justify-between space-y-0">
                        <CardTitle className="text-[10px] uppercase font-bold tracking-wider">Net Profit</CardTitle>
                        <TrendingUp className="h-4 w-4 opacity-50" />
                    </CardHeader>
                    <CardContent className="px-4 pb-3">
                        <div className={cn("text-xl font-black", stats.profit >= 0 ? "text-blue-950" : "text-orange-950")}>
                            Rs. {stats.profit.toLocaleString()}
                        </div>
                    </CardContent>
                </Card>
                <Card className="bg-amber-50 border-amber-200 border-l-4 border-l-amber-600">
                    <CardHeader className="py-3 px-4 flex flex-row items-center justify-between space-y-0">
                        <CardTitle className="text-[10px] uppercase font-bold text-amber-800 tracking-wider">Receivable</CardTitle>
                        <ArrowUpRight className="h-4 w-4 text-amber-600" />
                    </CardHeader>
                    <CardContent className="px-4 pb-3">
                        <div className="text-xl font-black text-amber-950">Rs. {stats.receivable.toLocaleString()}</div>
                    </CardContent>
                </Card>
                <Card className="bg-orange-50 border-orange-200 border-l-4 border-l-orange-600">
                    <CardHeader className="py-3 px-4 flex flex-row items-center justify-between space-y-0">
                        <CardTitle className="text-[10px] uppercase font-bold text-orange-800 tracking-wider">Payable</CardTitle>
                        <ArrowDownLeft className="h-4 w-4 text-orange-600" />
                    </CardHeader>
                    <CardContent className="px-4 pb-3">
                        <div className="text-xl font-black text-orange-950">Rs. {stats.payable.toLocaleString()}</div>
                    </CardContent>
                </Card>
            </div>

            <Tabs value={activeView} onValueChange={(v: any) => setActiveView(v)}>
                <div className="flex items-center justify-between">
                    <TabsList className="grid grid-cols-2 w-[320px]">
                        <TabsTrigger value="vehicle">Vehicle Ledger</TabsTrigger>
                        <TabsTrigger value="party">Partner Ledger</TabsTrigger>
                    </TabsList>
                    <div className="flex gap-2">
                        <Button variant="outline" size="sm" className="h-8 text-xs">
                            <FileSpreadsheet className="mr-2 h-3.5 w-3.5 text-emerald-600" /> Export Excel
                        </Button>
                        <Button variant="outline" size="sm" className="h-8 text-xs">
                            <FileText className="mr-2 h-3.5 w-3.5 text-red-600" /> Export PDF
                        </Button>
                    </div>
                </div>

                <TabsContent value="vehicle" className="mt-6 space-y-6">
                    {filterVehicleId === 'All' ? (
                        <Card>
                            <CardHeader className="py-4 border-b flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                                <div className="space-y-1">
                                    <CardTitle className="text-lg">Fleet Summary Table</CardTitle>
                                    <CardDescription>Overview of all trucks. Use the search to jump to a truck's detail.</CardDescription>
                                </div>
                                <div className="flex items-center gap-2">
                                    <CategorySelect className="w-[180px]" />
                                    <VehicleSearchPopover className="w-full sm:w-[280px]" />
                                </div>
                            </CardHeader>
                            <CardContent className="p-0">
                                <Table>
                                    <TableHeader className="bg-muted/50">
                                        <TableRow>
                                            <TableHead>Vehicle Name / Number</TableHead>
                                            <TableHead className="text-right">Income</TableHead>
                                            <TableHead className="text-right">Expense</TableHead>
                                            <TableHead className="text-right">Net Profit</TableHead>
                                            <TableHead className="text-right">Outstanding Due</TableHead>
                                            <TableHead className="w-12"></TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {vehicleSummaryRows.map(v => (
                                            <TableRow 
                                                key={v.id} 
                                                className="cursor-pointer hover:bg-muted/50 transition-colors h-14"
                                                onClick={() => setFilterVehicleId(v.id)}
                                            >
                                                <TableCell className="font-bold flex items-center gap-2">
                                                    <div className="p-1.5 bg-blue-100 rounded text-blue-700"><Truck className="h-4 w-4" /></div>
                                                    {v.name}
                                                </TableCell>
                                                <TableCell className="text-right font-mono text-emerald-600">Rs. {v.income.toLocaleString()}</TableCell>
                                                <TableCell className="text-right font-mono text-red-600">Rs. {v.expense.toLocaleString()}</TableCell>
                                                <TableCell className={cn("text-right font-mono font-bold", v.profit >= 0 ? "text-blue-700" : "text-orange-700")}>
                                                    Rs. {v.profit.toLocaleString()}
                                                </TableCell>
                                                <TableCell className="text-right font-mono text-amber-600 font-bold">Rs. {v.due.toLocaleString()}</TableCell>
                                                <TableCell className="text-right text-muted-foreground"><ChevronRight className="h-4 w-4" /></TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                    ) : (
                        <Card>
                            <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b bg-muted/20 py-3 gap-4">
                                <div className="flex items-center gap-2">
                                    <Button variant="ghost" size="icon" onClick={() => setFilterVehicleId('All')} className="h-8 w-8">
                                        <X className="h-4 w-4" />
                                    </Button>
                                    <CardTitle className="text-lg">Ledger for {vehiclesById.get(filterVehicleId)}</CardTitle>
                                    <Badge variant="outline" className="font-mono ml-2">{filteredTransactions.length} Transactions</Badge>
                                </div>
                                <div className="flex items-center gap-2">
                                    <CategorySelect className="w-[160px] h-9" />
                                    <VehicleSearchPopover className="w-full sm:w-[220px] h-9 text-xs" />
                                </div>
                            </CardHeader>
                            <CardContent className="p-0">
                                <ScrollArea className="w-full">
                                    <Table className="text-xs min-w-[1000px]">
                                        <TableHeader className="bg-muted/40">
                                            <TableRow>
                                                <TableHead className="w-[100px]">Date (BS)</TableHead>
                                                <TableHead>Category</TableHead>
                                                <TableHead>Party / Partner</TableHead>
                                                <TableHead>Reference</TableHead>
                                                <TableHead className="text-right">Income</TableHead>
                                                <TableHead className="text-right">Expense</TableHead>
                                                <TableHead className="text-right">Paid</TableHead>
                                                <TableHead className="text-right">Due</TableHead>
                                                <TableHead className="text-center">Status</TableHead>
                                                <TableHead className="w-12 text-right">Actions</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {filteredTransactions.map(t => (
                                                <TableRow key={t.id} className="h-12 hover:bg-muted/30">
                                                    <TableCell className="whitespace-nowrap">{toNepaliDate(t.date)}</TableCell>
                                                    <TableCell>
                                                        <Badge variant="secondary" className="text-[9px] uppercase tracking-tighter">
                                                            {t.displayCategory}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="font-medium">{t.partyName}</TableCell>
                                                    <TableCell className="text-[10px] text-muted-foreground truncate max-w-[120px]">{t.reference}</TableCell>
                                                    <TableCell className="text-right font-mono font-bold text-emerald-600">
                                                        {t.direction === 'Income' ? t.amount.toLocaleString() : '-'}
                                                    </TableCell>
                                                    <TableCell className="text-right font-mono font-bold text-red-600">
                                                        {t.direction === 'Expense' ? t.amount.toLocaleString() : '-'}
                                                    </TableCell>
                                                    <TableCell className="text-right font-mono text-muted-foreground">
                                                        {t.paidAmount > 0 ? t.paidAmount.toLocaleString() : '-'}
                                                    </TableCell>
                                                    <TableCell className={cn("text-right font-mono font-black", t.dueAmount > 0 ? "text-orange-600" : "text-muted-foreground/30")}>
                                                        {t.dueAmount > 0 ? t.dueAmount.toLocaleString() : '-'}
                                                    </TableCell>
                                                    <TableCell className="text-center">
                                                        <Badge variant="outline" className={cn(
                                                            "text-[9px] uppercase font-black",
                                                            t.status === 'Paid' && "bg-blue-600 text-white border-blue-600",
                                                            t.status === 'Partial' && "bg-orange-50 text-white border-orange-500",
                                                            t.status === 'Due' && "bg-muted text-muted-foreground border-muted"
                                                        )}>
                                                            {t.status}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <DropdownMenu>
                                                            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7"><MoreHorizontal className="h-3 w-3" /></Button></DropdownMenuTrigger>
                                                            <DropdownMenuContent align="end">
                                                                <DropdownMenuItem onClick={() => router.push(t.voucherId ? `/fleet/transactions/payment-receipt?voucherId=${t.voucherId}` : `/fleet/transactions/purchase/view?id=${t.id}`)}>
                                                                    <Eye className="mr-2 h-4 w-4" /> View Source
                                                                </DropdownMenuItem>
                                                                <AlertDialog><AlertDialogTrigger asChild><DropdownMenuItem onSelect={e => e.preventDefault()} className="text-destructive"><Trash2 className="mr-2 h-4 w-4" /> Delete</DropdownMenuItem></AlertDialogTrigger>
                                                                <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete Record?</AlertDialogTitle><AlertDialogDescription>This will remove the entry and update associated balances. Permanent action.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => handleDelete(t.voucherId || t.id)}>Delete</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
                                                            </DropdownMenuContent>
                                                        </DropdownMenu>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                            {filteredTransactions.length === 0 && (
                                                <TableRow><TableCell colSpan={10} className="text-center py-20 text-muted-foreground">No records match your filters for this truck.</TableCell></TableRow>
                                            )}
                                        </TableBody>
                                    </Table>
                                    <ScrollBar orientation="horizontal" />
                                </ScrollArea>
                            </CardContent>
                        </Card>
                    )}
                </TabsContent>

                <TabsContent value="party" className="mt-6 space-y-6">
                    <Card>
                        <CardHeader className="py-4 border-b flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                            <div className="space-y-1">
                                <CardTitle className="text-lg">Partner Ledger Report</CardTitle>
                                <CardDescription>Breakdown of billing and settlements for each vendor or customer.</CardDescription>
                            </div>
                            <div className="flex items-center gap-2">
                                <CategorySelect className="w-[180px]" />
                                <Label className="text-[10px] uppercase font-bold text-muted-foreground hidden sm:block">Find Partner:</Label>
                                <Select value={filterPartyId} onValueChange={setFilterPartyId}>
                                    <SelectTrigger className="w-full sm:w-[220px] h-10 bg-white text-xs">
                                        <div className="flex items-center gap-2">
                                            <Users className="h-3.5 w-3.5 opacity-70" />
                                            <SelectValue placeholder="All Partners" />
                                        </div>
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="All">All Partners</SelectItem>
                                        {parties
                                            .filter(p => p.ownership === 'Sijan' || p.ownership === 'Both')
                                            .sort((a, b) => a.name.localeCompare(b.name))
                                            .map(p => (
                                                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                                            ))
                                        }
                                    </SelectContent>
                                </Select>
                            </div>
                        </CardHeader>
                        <CardContent className="p-0">
                             <Table className="text-xs">
                                <TableHeader className="bg-muted/50">
                                    <TableRow>
                                        <TableHead>Partner Name</TableHead>
                                        <TableHead className="text-right">Total Billing</TableHead>
                                        <TableHead className="text-right">Settled Amount</TableHead>
                                        <TableHead className="text-right">Outstanding Balance</TableHead>
                                        <TableHead className="w-12"></TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {partnerSummaryRows.map(p => (
                                        <TableRow key={p.id} className="h-14 hover:bg-muted/30">
                                            <TableCell className="font-bold flex items-center gap-2">
                                                <div className="p-1.5 bg-orange-100 rounded text-orange-700"><Users className="h-4 w-4" /></div>
                                                {p.name}
                                            </TableCell>
                                            <TableCell className="text-right font-mono">Rs. {p.billing.toLocaleString()}</TableCell>
                                            <TableCell className="text-right font-mono text-blue-600">Rs. {p.settled.toLocaleString()}</TableCell>
                                            <TableCell className={cn("text-right font-mono font-bold", p.balance > 0 ? "text-orange-700" : "text-muted-foreground/30")}>
                                                Rs. {p.balance.toLocaleString()}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <Button variant="ghost" size="sm" onClick={() => { setFilterPartyId(p.id); setFilterVehicleId('All'); setActiveView('vehicle'); }}>
                                                    <Eye className="h-4 w-4" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {partnerSummaryRows.length === 0 && (
                                        <TableRow><TableCell colSpan={5} className="text-center py-20 text-muted-foreground">No partner records found matching your filters.</TableCell></TableRow>
                                    )}
                                </TableBody>
                             </Table>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}
