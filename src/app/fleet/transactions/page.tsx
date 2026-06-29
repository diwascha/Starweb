
'use client';

import { useState, useEffect, useMemo } from 'react';
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
  TrendingDown, 
  FilterX, 
  Wallet, 
  ArrowRightLeft,
  ArrowUpRight,
  ArrowDownLeft,
  Truck,
  Users,
  AlertCircle,
  CheckCircle2,
  Clock
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
import { Checkbox } from '@/components/ui/checkbox';

type LedgerView = 'history' | 'vehicle' | 'party';

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
    const [activeView, setActiveView] = useState<LedgerView>('history');
    const [searchQuery, setSearchQuery] = useState('');
    const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
    const [selectedBsYear, setSelectedBsYear] = useState<string>('All');
    const [selectedBsMonth, setSelectedBsMonth] = useState<string>('All');
    const [filterVehicleId, setFilterVehicleId] = useState<string>('All');
    const [filterPartyId, setFilterPartyId] = useState<string>('All');
    const [filterDirection, setFilterDirection] = useState<'All' | 'Income' | 'Expense'>('All');
    const [filterOutstandingOnly, setFilterOutstandingOnly] = useState(false);
    
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
        transactions.forEach(t => {
            try {
                years.add(new NepaliDate(new Date(t.date)).getYear());
            } catch {}
        });
        return Array.from(years).sort((a, b) => b - a);
    }, [transactions]);

    // Internal mapping logic: Pair Bills with Payments
    const processedData = useMemo(() => {
        // Map types to directions
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

        // Grouping to calculate paid/due
        // Strategy: Match by referenceId (PO or Trip) or voucherId
        const processed: ProcessedTransaction[] = [];
        const handledIds = new Set<string>();

        rawMapped.forEach(t => {
            if (handledIds.has(t.id)) return;

            // If it's a Bill (Sales or Purchase), look for associated payments
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

        // Add remaining standalone payments/receipts (like Advances or orphaned vouchers)
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
        if (filterDirection !== 'All') filtered = filtered.filter(t => t.direction === filterDirection);
        if (filterOutstandingOnly) filtered = filtered.filter(t => t.status !== 'Paid');

        return filtered;
    }, [processedData, searchQuery, dateRange, selectedBsYear, selectedBsMonth, filterVehicleId, filterPartyId, filterDirection, filterOutstandingOnly]);

    const summary = useMemo(() => {
        return filteredTransactions.reduce((acc, t) => {
            if (t.direction === 'Income') {
                acc.totalIncome += t.amount;
                acc.totalReceivable += t.dueAmount;
            } else {
                acc.totalExpense += t.amount;
                acc.totalPayable += t.dueAmount;
            }
            return acc;
        }, { totalIncome: 0, totalExpense: 0, totalReceivable: 0, totalPayable: 0 });
    }, [filteredTransactions]);

    const handleClearFilters = () => {
        setSearchQuery('');
        setDateRange(undefined);
        setSelectedBsYear('All');
        setSelectedBsMonth('All');
        setFilterVehicleId('All');
        setFilterPartyId('All');
        setFilterDirection('All');
        setFilterOutstandingOnly(false);
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

    // Ledger View Logic
    const vehicleGroups = useMemo(() => {
        const groups = new Map<string, ProcessedTransaction[]>();
        filteredTransactions.forEach(t => {
            const list = groups.get(t.vehicleName) || [];
            list.push(t);
            groups.set(t.vehicleName, list);
        });
        return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    }, [filteredTransactions]);

    const partyGroups = useMemo(() => {
        const groups = new Map<string, ProcessedTransaction[]>();
        filteredTransactions.forEach(t => {
            const list = groups.get(t.partyName) || [];
            list.push(t);
            groups.set(t.partyName, list);
        });
        return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    }, [filteredTransactions]);

    return (
        <div className="flex flex-col gap-6">
            <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Fleet Ledger</h1>
                    <p className="text-muted-foreground text-sm">Unified income and expense tracking for vehicles and parties.</p>
                </div>
                <div className="flex items-center gap-2">
                    <Button onClick={() => router.push('/fleet/transactions/payment-receipt/new')} size="sm">
                        <PlusCircle className="mr-2 h-4 w-4" /> New Voucher
                    </Button>
                    <Button onClick={() => router.push('/fleet/transactions/expenses/new')} size="sm" variant="secondary">
                        <Wallet className="mr-2 h-4 w-4" /> Daily Expense
                    </Button>
                </div>
            </header>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                <Card className="bg-emerald-50 border-emerald-200">
                    <CardHeader className="py-3 px-4 flex flex-row items-center justify-between space-y-0">
                        <CardTitle className="text-[10px] uppercase font-bold text-emerald-800 tracking-wider">Total Income</CardTitle>
                        <TrendingUp className="h-3 w-3 text-emerald-600" />
                    </CardHeader>
                    <CardContent className="px-4 pb-3">
                        <div className="text-lg font-black text-emerald-900">Rs. {summary.totalIncome.toLocaleString()}</div>
                    </CardContent>
                </Card>
                <Card className="bg-red-50 border-red-200">
                    <CardHeader className="py-3 px-4 flex flex-row items-center justify-between space-y-0">
                        <CardTitle className="text-[10px] uppercase font-bold text-red-800 tracking-wider">Total Expense</CardTitle>
                        <TrendingDown className="h-3 w-3 text-red-600" />
                    </CardHeader>
                    <CardContent className="px-4 pb-3">
                        <div className="text-lg font-black text-red-900">Rs. {summary.totalExpense.toLocaleString()}</div>
                    </CardContent>
                </Card>
                <Card className={cn("border-2 border-dashed", (summary.totalIncome - summary.totalExpense) >= 0 ? "bg-blue-50 border-blue-200" : "bg-orange-50 border-orange-200")}>
                    <CardHeader className="py-3 px-4 flex flex-row items-center justify-between space-y-0">
                        <CardTitle className="text-[10px] uppercase font-bold tracking-wider">Net Profit/Loss</CardTitle>
                        <ArrowRightLeft className="h-3 w-3 opacity-50" />
                    </CardHeader>
                    <CardContent className="px-4 pb-3">
                        <div className={cn("text-lg font-black", (summary.totalIncome - summary.totalExpense) >= 0 ? "text-blue-900" : "text-orange-900")}>
                            Rs. {(summary.totalIncome - summary.totalExpense).toLocaleString()}
                        </div>
                    </CardContent>
                </Card>
                <Card className="bg-orange-50 border-orange-200">
                    <CardHeader className="py-3 px-4 flex flex-row items-center justify-between space-y-0">
                        <CardTitle className="text-[10px] uppercase font-bold text-orange-800 tracking-wider">Receivables</CardTitle>
                        <ArrowUpRight className="h-3 w-3 text-orange-600" />
                    </CardHeader>
                    <CardContent className="px-4 pb-3">
                        <div className="text-lg font-black text-orange-900">Rs. {summary.totalReceivable.toLocaleString()}</div>
                    </CardContent>
                </Card>
                <Card className="bg-orange-50 border-orange-200">
                    <CardHeader className="py-3 px-4 flex flex-row items-center justify-between space-y-0">
                        <CardTitle className="text-[10px] uppercase font-bold text-orange-800 tracking-wider">Payables</CardTitle>
                        <ArrowDownLeft className="h-3 w-3 text-orange-600" />
                    </CardHeader>
                    <CardContent className="px-4 pb-3">
                        <div className="text-lg font-black text-orange-900">Rs. {summary.totalPayable.toLocaleString()}</div>
                    </CardContent>
                </Card>
            </div>

            {/* Filter Bar */}
            <Card className="bg-muted/10 border-dashed">
                <CardContent className="p-4 space-y-4">
                    <div className="flex flex-wrap gap-3 items-end">
                        <div className="relative flex-1 min-w-[200px]">
                            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                            <Input placeholder="Search trucks, parties, categories..." className="pl-8 h-9 text-xs" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
                        </div>
                        <div className="flex gap-2">
                             <Select value={selectedBsYear} onValueChange={setSelectedBsYear}>
                                <SelectTrigger className="w-[100px] h-9 bg-white text-xs"><SelectValue placeholder="Year" /></SelectTrigger>
                                <SelectContent><SelectItem value="All">All Years</SelectItem>{availableYears.map(year => <SelectItem key={year} value={String(year)}>{year}</SelectItem>)}</SelectContent>
                            </Select>
                            <Select value={selectedBsMonth} onValueChange={setSelectedBsMonth}>
                                <SelectTrigger className="w-[120px] h-9 bg-white text-xs"><SelectValue placeholder="Month" /></SelectTrigger>
                                <SelectContent><SelectItem value="All">All Months</SelectItem>{NEPALI_MONTHS.map(month => <SelectItem key={month.value} value={String(month.value)}>{month.name}</SelectItem>)}</SelectContent>
                            </Select>
                        </div>
                        <div className="hidden lg:block">
                            <Popover><PopoverTrigger asChild><Button variant="outline" className={cn("h-9 justify-start text-left font-normal bg-white text-xs min-w-[200px]", !dateRange && "text-muted-foreground")}><CalendarIcon className="mr-2 h-4 w-4" />{dateRange?.from ? (dateRange.to ? (`${format(dateRange.from, "LLL dd")} - ${format(dateRange.to, "LLL dd")}`) : format(dateRange.from, "LLL dd")) : (<span>Pick AD Range</span>)}</Button></PopoverTrigger><PopoverContent className="w-auto p-0" align="start"><DualDateRangePicker selected={dateRange} onSelect={setDateRange} /></PopoverContent></Popover>
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-4 items-center">
                        <div className="flex items-center gap-2">
                            <Select value={filterVehicleId} onValueChange={setFilterVehicleId}>
                                <SelectTrigger className="w-[140px] h-8 bg-white text-[11px]"><SelectValue placeholder="All Vehicles" /></SelectTrigger>
                                <SelectContent><SelectItem value="All">All Vehicles</SelectItem>{vehicles.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}</SelectContent>
                            </Select>
                            <Select value={filterPartyId} onValueChange={setFilterPartyId}>
                                <SelectTrigger className="w-[180px] h-8 bg-white text-[11px]"><SelectValue placeholder="All Parties" /></SelectTrigger>
                                <SelectContent><SelectItem value="All">All Parties</SelectItem>{parties.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                            </Select>
                            <Select value={filterDirection} onValueChange={(v: any) => setFilterDirection(v)}>
                                <SelectTrigger className="w-[110px] h-8 bg-white text-[11px]"><SelectValue placeholder="Direction" /></SelectTrigger>
                                <SelectContent><SelectItem value="All">Both Types</SelectItem><SelectItem value="Income">Income Only</SelectItem><SelectItem value="Expense">Expense Only</SelectItem></SelectContent>
                            </Select>
                        </div>
                        <div className="flex items-center space-x-2 border-l pl-4">
                            <Checkbox id="filter-outstanding" checked={filterOutstandingOnly} onCheckedChange={(v: any) => setFilterOutstandingOnly(!!v)} />
                            <Label htmlFor="filter-outstanding" className="text-[11px] cursor-pointer font-bold text-orange-600">Outstanding Only</Label>
                        </div>
                        <Button variant="ghost" size="sm" onClick={handleClearFilters} className="h-8 text-[11px] text-muted-foreground ml-auto">
                            <FilterX className="mr-1 h-3 w-3" /> Reset
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* Main Ledger Content */}
            <Tabs value={activeView} onValueChange={(v: any) => setActiveView(v)}>
                <TabsList className="grid grid-cols-3 w-[450px]">
                    <TabsTrigger value="history">General History</TabsTrigger>
                    <TabsTrigger value="vehicle">Vehicle Ledger</TabsTrigger>
                    <TabsTrigger value="party">Party Ledger</TabsTrigger>
                </TabsList>

                <TabsContent value="history" className="mt-6">
                    <Card>
                        <ScrollArea className="w-full">
                            <Table className="text-xs min-w-[1200px]">
                                <TableHeader className="bg-muted/40 sticky top-0 z-10">
                                    <TableRow>
                                        <TableHead className="w-[100px]">Date (BS)</TableHead>
                                        <TableHead className="w-[120px]">Vehicle</TableHead>
                                        <TableHead className="w-[80px]">Type</TableHead>
                                        <TableHead className="w-[150px]">Category</TableHead>
                                        <TableHead>Party / Ledger</TableHead>
                                        <TableHead className="w-[150px]">Reference</TableHead>
                                        <TableHead className="text-right">Bill Amt</TableHead>
                                        <TableHead className="text-right">Paid</TableHead>
                                        <TableHead className="text-right">Due</TableHead>
                                        <TableHead className="text-center">Status</TableHead>
                                        <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredTransactions.map(t => (
                                        <TableRow key={t.id} className="h-12 hover:bg-muted/30">
                                            <TableCell className="font-medium whitespace-nowrap">{toNepaliDate(t.date)}</TableCell>
                                            <TableCell className="font-bold">{t.vehicleName}</TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className={cn("text-[9px] uppercase", t.direction === 'Income' ? "text-green-600 border-green-200 bg-green-50" : "text-red-600 border-red-200 bg-red-50")}>
                                                    {t.direction}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="secondary" className="text-[10px] uppercase tracking-tight">{t.displayCategory}</Badge>
                                            </TableCell>
                                            <TableCell className="font-medium">{t.partyName}</TableCell>
                                            <TableCell className="text-muted-foreground text-[10px] truncate max-w-[120px]">{t.reference}</TableCell>
                                            <TableCell className="text-right font-mono font-bold">Rs. {t.amount.toLocaleString()}</TableCell>
                                            <TableCell className="text-right font-mono text-muted-foreground">{t.paidAmount.toLocaleString()}</TableCell>
                                            <TableCell className={cn("text-right font-mono font-black", t.dueAmount > 0 ? "text-orange-600" : "text-muted-foreground/30")}>
                                                {t.dueAmount > 0 ? `Rs. ${t.dueAmount.toLocaleString()}` : '-'}
                                            </TableCell>
                                            <TableCell className="text-center">
                                                <Badge variant="outline" className={cn(
                                                    "text-[9px] uppercase",
                                                    t.status === 'Paid' && "bg-blue-600 text-white border-blue-600",
                                                    t.status === 'Partial' && "bg-orange-500 text-white border-orange-500",
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
                                                        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete Record?</AlertDialogTitle><AlertDialogDescription>This will remove the entry and update associated ledger balances. Permanent action.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => handleDelete(t.voucherId || t.id)}>Delete</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {filteredTransactions.length === 0 && (
                                        <TableRow><TableCell colSpan={11} className="text-center py-20 text-muted-foreground">No records match your filters.</TableCell></TableRow>
                                    )}
                                </TableBody>
                            </Table>
                            <ScrollBar orientation="horizontal" />
                        </ScrollArea>
                    </Card>
                </TabsContent>

                <TabsContent value="vehicle" className="mt-6 space-y-6">
                    {vehicleGroups.map(([vName, items]) => {
                        const vIncome = items.filter(i => i.direction === 'Income').reduce((sum, i) => sum + i.amount, 0);
                        const vExpense = items.filter(i => i.direction === 'Expense').reduce((sum, i) => sum + i.amount, 0);
                        const vDue = items.reduce((sum, i) => sum + i.dueAmount, 0);
                        
                        return (
                            <Card key={vName} className="overflow-hidden border-l-4 border-l-blue-600">
                                <CardHeader className="bg-muted/20 py-3 px-6 flex flex-row items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-blue-100 rounded-lg text-blue-700"><Truck className="h-5 w-5" /></div>
                                        <div>
                                            <CardTitle className="text-lg">{vName}</CardTitle>
                                            <CardDescription className="text-xs uppercase font-bold tracking-tight">Financial Performance</CardDescription>
                                        </div>
                                    </div>
                                    <div className="flex gap-4">
                                        <div className="text-right">
                                            <p className="text-[10px] uppercase font-bold text-muted-foreground">Net Profit</p>
                                            <p className={cn("text-base font-black", (vIncome - vExpense) >= 0 ? "text-emerald-600" : "text-red-600")}>Rs. {(vIncome - vExpense).toLocaleString()}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-[10px] uppercase font-bold text-muted-foreground">Outstanding</p>
                                            <p className="text-base font-black text-orange-600">Rs. {vDue.toLocaleString()}</p>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent className="p-0">
                                    <Table className="text-xs">
                                        <TableHeader className="bg-muted/10">
                                            <TableRow>
                                                <TableHead className="w-[100px]">Date (BS)</TableHead>
                                                <TableHead>Category</TableHead>
                                                <TableHead>Party / Ledger</TableHead>
                                                <TableHead>Reference</TableHead>
                                                <TableHead className="text-right">Income</TableHead>
                                                <TableHead className="text-right">Expense</TableHead>
                                                <TableHead className="text-right">Due</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {items.map(t => (
                                                <TableRow key={t.id}>
                                                    <TableCell>{toNepaliDate(t.date)}</TableCell>
                                                    <TableCell><Badge variant="secondary">{t.displayCategory}</Badge></TableCell>
                                                    <TableCell>{t.partyName}</TableCell>
                                                    <TableCell className="text-muted-foreground">{t.reference}</TableCell>
                                                    <TableCell className="text-right font-bold text-emerald-600">{t.direction === 'Income' ? t.amount.toLocaleString() : '-'}</TableCell>
                                                    <TableCell className="text-right font-bold text-red-600">{t.direction === 'Expense' ? t.amount.toLocaleString() : '-'}</TableCell>
                                                    <TableCell className="text-right font-mono font-black text-orange-600">{t.dueAmount > 0 ? t.dueAmount.toLocaleString() : '-'}</TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </CardContent>
                            </Card>
                        );
                    })}
                </TabsContent>

                <TabsContent value="party" className="mt-6 space-y-6">
                    {partyGroups.map(([pName, items]) => {
                        const pBill = items.reduce((sum, i) => sum + i.amount, 0);
                        const pPaid = items.reduce((sum, i) => sum + i.paidAmount, 0);
                        const pDue = items.reduce((sum, i) => sum + i.dueAmount, 0);
                        
                        return (
                            <Card key={pName} className="overflow-hidden border-l-4 border-l-orange-500">
                                <CardHeader className="bg-muted/20 py-3 px-6 flex flex-row items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-orange-100 rounded-lg text-orange-700"><Users className="h-5 w-5" /></div>
                                        <div>
                                            <CardTitle className="text-lg">{pName}</CardTitle>
                                            <CardDescription className="text-xs uppercase font-bold tracking-tight">Ledger Summary</CardDescription>
                                        </div>
                                    </div>
                                    <div className="flex gap-8">
                                        <div className="text-center">
                                            <p className="text-[10px] uppercase font-bold text-muted-foreground">Total Bill</p>
                                            <p className="text-base font-black">Rs. {pBill.toLocaleString()}</p>
                                        </div>
                                        <div className="text-center">
                                            <p className="text-[10px] uppercase font-bold text-muted-foreground">Total Paid</p>
                                            <p className="text-base font-black text-blue-600">Rs. {pPaid.toLocaleString()}</p>
                                        </div>
                                        <div className="text-center">
                                            <p className="text-[10px] uppercase font-bold text-muted-foreground">Balance Due</p>
                                            <p className="text-lg font-black text-orange-600">Rs. {pDue.toLocaleString()}</p>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent className="p-0">
                                    <Table className="text-xs">
                                        <TableHeader className="bg-muted/10">
                                            <TableRow>
                                                <TableHead className="w-[100px]">Date (BS)</TableHead>
                                                <TableHead>Vehicle</TableHead>
                                                <TableHead>Category</TableHead>
                                                <TableHead>Reference</TableHead>
                                                <TableHead className="text-right">Bill Amount</TableHead>
                                                <TableHead className="text-right">Paid</TableHead>
                                                <TableHead className="text-right">Due</TableHead>
                                                <TableHead className="text-center">Status</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {items.map(t => (
                                                <TableRow key={t.id}>
                                                    <TableCell>{toNepaliDate(t.date)}</TableCell>
                                                    <TableCell className="font-bold">{t.vehicleName}</TableCell>
                                                    <TableCell><Badge variant="outline" className="uppercase text-[9px]">{t.displayCategory}</Badge></TableCell>
                                                    <TableCell className="text-muted-foreground">{t.reference}</TableCell>
                                                    <TableCell className="text-right font-bold">Rs. {t.amount.toLocaleString()}</TableCell>
                                                    <TableCell className="text-right text-blue-600 font-medium">{t.paidAmount.toLocaleString()}</TableCell>
                                                    <TableCell className="text-right font-black text-orange-600">{t.dueAmount > 0 ? `Rs. ${t.dueAmount.toLocaleString()}` : '-'}</TableCell>
                                                    <TableCell className="text-center">
                                                        <Badge variant={t.status === 'Paid' ? 'default' : 'secondary'} className="text-[9px]">
                                                            {t.status}
                                                        </Badge>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </CardContent>
                            </Card>
                        );
                    })}
                </TabsContent>
            </Tabs>
        </div>
    );
}
