'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import type { Transaction, Vehicle, Party } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { PlusCircle, Search, ArrowUpDown, MoreHorizontal, Eye, Edit, Trash2, CalendarIcon, Download, X, FileSpreadsheet, FileText, Loader2, TrendingUp, TrendingDown, Info, Link as LinkIcon, FilterX } from 'lucide-react';
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import NepaliDate from 'nepali-date-converter';
import { NEPALI_MONTHS } from '@/lib/constants';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';

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
    const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
    const [selectedBsYear, setSelectedBsYear] = useState<string>('All');
    const [selectedBsMonth, setSelectedBsMonth] = useState<string>('All');
    const [activeTab, setActiveTab] = useState<TransactionFilterType>('All');
    const [filterPartyId, setFilterPartyId] = useState<string>('All');
    const [filterVehicleId, setFilterVehicleId] = useState<string>('All');
    const [sortConfig, setSortConfig] = useState<{ key: TransactionSortKey; direction: SortDirection }>({ key: 'date', direction: 'desc' });
    
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

    const { availableYears } = useMemo(() => {
        const years = new Set<number>();
        transactions.forEach(t => {
            try {
                years.add(new NepaliDate(new Date(t.date)).getYear());
            } catch {}
        });
        return {
            availableYears: Array.from(years).sort((a, b) => b - a),
        };
    }, [transactions]);

    useEffect(() => {
        if (availableYears.length > 0 && selectedBsYear === 'All' && selectedBsMonth === 'All') {
            const currentNepaliDate = new NepaliDate();
            const currentYear = currentNepaliDate.getYear();
            const currentMonth = currentNepaliDate.getMonth();

            if (availableYears.includes(currentYear)) {
                setSelectedBsYear(String(currentYear));
            } else {
                setSelectedBsYear(String(availableYears[0]));
            }
            setSelectedBsMonth(String(currentMonth));
        }
    }, [availableYears, selectedBsYear, selectedBsMonth]);

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

    const baseFilteredTransactions = useMemo(() => {
        let filtered = transactions.map(t => {
            let sourceRef = '';
            if (t.purchaseNumber) sourceRef = t.purchaseNumber;
            else if (t.type === 'Sales') sourceRef = 'Trip Sheet';
            else if (t.voucherId && t.items?.[0]?.particular) {
                 sourceRef = t.items[0].particular.split(' ')[0];
            }

            return {
                ...t,
                vehicleName: vehiclesById.get(t.vehicleId) || 'N/A',
                partyName: t.partyId ? partiesById.get(t.partyId) || 'N/A' : 'N/A',
                sourceRef
            };
        });

        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            filtered = filtered.filter(t =>
                t.vehicleName.toLowerCase().includes(query) ||
                t.partyName.toLowerCase().includes(query) ||
                (t.remarks || '').toLowerCase().includes(query) ||
                (t.category || '').toLowerCase().includes(query) ||
                (t.sourceRef || '').toLowerCase().includes(query)
            );
        }

        if (dateRange?.from) {
            const interval = { start: startOfDay(dateRange.from), end: endOfDay(dateRange.to || dateRange.from) };
            filtered = filtered.filter(t => isWithinInterval(new Date(t.date), interval));
        }

        if (selectedBsYear !== 'All') {
            filtered = filtered.filter(t => {
                try {
                    return new NepaliDate(new Date(t.date)).getYear() === parseInt(selectedBsYear);
                } catch { return false; }
            });
        }

        if (selectedBsMonth !== 'All') {
            filtered = filtered.filter(t => {
                try {
                    return new NepaliDate(new Date(t.date)).getMonth() === parseInt(selectedBsMonth);
                } catch { return false; }
            });
        }
        
        if (filterPartyId !== 'All') filtered = filtered.filter(t => t.partyId === filterPartyId);
        if (filterVehicleId !== 'All') filtered = filtered.filter(t => t.vehicleId === filterVehicleId);
        
        return filtered;
    }, [transactions, searchQuery, vehiclesById, partiesById, dateRange, filterPartyId, filterVehicleId, selectedBsYear, selectedBsMonth]);

    const tabCounts = useMemo(() => {
        const counts = { All: 0, Payment: 0, Receipt: 0, Sales: 0, Purchase: 0 };
        baseFilteredTransactions.forEach(t => {
            counts.All++;
            if (t.type in counts) {
                counts[t.type as keyof typeof counts]++;
            }
        });
        return counts;
    }, [baseFilteredTransactions]);

    const sortedAndFilteredTransactions = useMemo(() => {
        let filtered = [...baseFilteredTransactions];

        if (activeTab !== 'All') {
            filtered = filtered.filter(t => t.type === activeTab);
        }
        
        filtered.sort((a, b) => {
            const aVal = (a[sortConfig.key] || '').toString();
            const bVal = (b[sortConfig.key] || '').toString();
            if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
        
        return filtered;
    }, [baseFilteredTransactions, activeTab, sortConfig]);
    
    const financialSummary = useMemo(() => {
        return sortedAndFilteredTransactions.reduce((acc, t) => {
            const isInflow = ['Receipt', 'Sales'].includes(t.type);
            if (isInflow) acc.totalInflow += t.amount;
            else acc.totalOutflow += t.amount;
            return acc;
        }, { totalInflow: 0, totalOutflow: 0 });
    }, [sortedAndFilteredTransactions]);

    const isFiltered = useMemo(() => {
        const currentNepaliDate = new NepaliDate();
        const currentYear = currentNepaliDate.getYear();
        const currentMonth = currentNepaliDate.getMonth();

        return searchQuery !== '' || 
               !!dateRange || 
               (selectedBsYear !== String(currentYear) && selectedBsYear !== 'All') || 
               (selectedBsMonth !== String(currentMonth) && selectedBsMonth !== 'All') || 
               filterVehicleId !== 'All' || 
               filterPartyId !== 'All';
    }, [searchQuery, dateRange, selectedBsYear, selectedBsMonth, filterVehicleId, filterPartyId]);

    const handleClearFilters = () => {
        setSearchQuery('');
        setDateRange(undefined);
        const currentNepaliDate = new NepaliDate();
        setSelectedBsYear(String(currentNepaliDate.getYear()));
        setSelectedBsMonth(String(currentNepaliDate.getMonth()));
        setFilterVehicleId('All');
        setFilterPartyId('All');
    };

    const handleExport = async (formatType: 'excel' | 'pdf') => {
        if (formatType === 'excel') {
            const XLSX = (await import('xlsx'));
            const dataToExport = sortedAndFilteredTransactions.map(t => ({
                'Date (BS)': toNepaliDate(t.date),
                'Vehicle': t.vehicleName,
                'Type': t.type,
                'Reference': t.sourceRef || 'N/A',
                'Category': t.category || 'N/A',
                'Ledger': t.partyName,
                'Mode': t.billingType,
                'Amount (NPR)': ['Purchase', 'Payment'].includes(t.type) ? -t.amount : t.amount,
                'Remarks': t.remarks,
            }));
            const worksheet = XLSX.utils.json_to_sheet(dataToExport);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "Financial Logs");
            XLSX.writeFile(workbook, `Fleet_Accounting_Logs_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
        } else {
            const { jsPDF } = await import('jspdf');
            const { default: autoTable } = await import('jspdf-autotable');
            const doc = new jsPDF();
            doc.text("Account Logs Report", 14, 15);
            doc.setFontSize(10);
            doc.text(`Generated on: ${format(new Date(), 'PPP')}`, 14, 22);

            const tableData = sortedAndFilteredTransactions.map(t => [
                toNepaliDate(t.date),
                t.vehicleName,
                t.type,
                `${t.category || ''} (${t.sourceRef || 'N/A'})`,
                t.partyName,
                (['Purchase', 'Payment'].includes(t.type) ? -t.amount : t.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })
            ]);

            autoTable(doc, {
                startY: 30,
                head: [['Date (BS)', 'Vehicle', 'Type', 'Category/Ref', 'Ledger', 'Amount (NPR)']],
                body: tableData,
                theme: 'grid',
                headStyles: { fillColor: [71, 85, 105] }
            });

            doc.save(`Account_Logs_Report_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
        }
    };

    return (
        <div className="flex flex-col gap-6">
            <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Account Logs</h1>
                    <p className="text-xs md:text-sm text-muted-foreground">Consolidated financial ledger for Sales, Purchases, and Settlements.</p>
                </div>
                <div className="flex items-center gap-2">
                    <Button size="sm" onClick={() => router.push('/fleet/transactions/payment-receipt/new')}>
                        <PlusCircle className="mr-2 h-4 w-4" /> <span className="hidden sm:inline">New Voucher</span><span className="sm:hidden">New</span>
                    </Button>
                </div>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="bg-emerald-50 border-emerald-200">
                    <CardHeader className="py-2 px-3 flex flex-row items-center justify-between space-y-0">
                        <CardTitle className="text-[10px] uppercase font-bold text-emerald-800 tracking-wider">Inflow</CardTitle>
                        <TrendingUp className="h-3 w-3 text-emerald-600" />
                    </CardHeader>
                    <CardContent className="px-3 pb-2">
                        <div className="text-base md:text-lg font-bold text-emerald-900">Rs. {financialSummary.totalInflow.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                    </CardContent>
                </Card>
                <Card className="bg-red-50 border-red-200">
                    <CardHeader className="py-2 px-3 flex flex-row items-center justify-between space-y-0">
                        <CardTitle className="text-[10px] uppercase font-bold text-red-800 tracking-wider">Outflow</CardTitle>
                        <TrendingDown className="h-3 w-3 text-red-600" />
                    </CardHeader>
                    <CardContent className="px-3 pb-2">
                        <div className="text-base md:text-lg font-bold text-red-900">Rs. {financialSummary.totalOutflow.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                    </CardContent>
                </Card>
                <Card className={cn(
                    "border-2 border-dashed",
                    (financialSummary.totalInflow - financialSummary.totalOutflow) >= 0 ? "bg-blue-50 border-blue-200" : "bg-orange-50 border-orange-200"
                )}>
                    <CardHeader className="py-2 px-3 flex flex-row items-center justify-between space-y-0">
                        <CardTitle className="text-[10px] uppercase font-bold tracking-wider">Net Balance</CardTitle>
                        <Info className="h-3 w-3 opacity-50" />
                    </CardHeader>
                    <CardContent className="px-3 pb-2">
                        <div className={cn(
                            "text-base md:text-lg font-black",
                            (financialSummary.totalInflow - financialSummary.totalOutflow) >= 0 ? "text-blue-900" : "text-orange-900"
                        )}>
                            Rs. {(financialSummary.totalInflow - financialSummary.totalOutflow).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Card className="bg-muted/10 border-dashed">
                <CardContent className="p-4 space-y-4">
                    <div className="flex flex-wrap gap-2 md:gap-4 items-end">
                        <div className="relative flex-1 min-w-[200px]">
                            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                            <Input placeholder="Search records..." className="pl-8 h-9 text-sm" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                        </div>
                        <div className="flex gap-2">
                            <Select value={selectedBsYear} onValueChange={setSelectedBsYear} disabled={isLoading || availableYears.length === 0}>
                                <SelectTrigger className="w-[100px] h-9 bg-white text-xs"><SelectValue placeholder="Year" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="All">All Years</SelectItem>
                                    {availableYears.map(year => <SelectItem key={year} value={String(year)}>{year}</SelectItem>)}
                                </SelectContent>
                            </Select>
                            <Select value={selectedBsMonth} onValueChange={setSelectedBsMonth} disabled={isLoading || availableYears.length === 0}>
                                <SelectTrigger className="w-[120px] h-9 bg-white text-xs"><SelectValue placeholder="Month" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="All">All Months</SelectItem>
                                    {NEPALI_MONTHS.map(month => <SelectItem key={month.value} value={String(month.value)}>{month.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="hidden lg:block">
                            <Popover><PopoverTrigger asChild><Button variant="outline" className={cn("h-9 justify-start text-left font-normal bg-white text-xs min-w-[200px]", !dateRange && "text-muted-foreground")}><CalendarIcon className="mr-2 h-4 w-4" />{dateRange?.from ? (dateRange.to ? (`${format(dateRange.from, "LLL dd")} - ${format(dateRange.to, "LLL dd")}`) : format(dateRange.from, "LLL dd")) : (<span>Pick dates</span>)}</Button></PopoverTrigger><PopoverContent className="w-auto p-0" align="start"><DualDateRangePicker selected={dateRange} onSelect={setDateRange} /></PopoverContent></Popover>
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-2 md:gap-4 items-center">
                        <Select value={filterVehicleId} onValueChange={setFilterVehicleId}>
                            <SelectTrigger className="w-[140px] h-8 bg-white text-[11px]"><SelectValue placeholder="All Vehicles" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="All">All Vehicles</SelectItem>
                                {vehicles.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
                            </SelectContent>
                        </Select>
                        <Select value={filterPartyId} onValueChange={setFilterPartyId}>
                            <SelectTrigger className="w-[180px] h-8 bg-white text-[11px]"><SelectValue placeholder="All Ledgers" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="All">All Ledgers</SelectItem>
                                {parties.filter(p => p.ownership === 'Sijan' || p.ownership === 'Both').map(p => (
                                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {isFiltered && (
                            <Button variant="ghost" size="sm" onClick={handleClearFilters} className="h-8 text-[11px] text-muted-foreground px-2">
                                <FilterX className="mr-1 h-3 w-3" /> Clear
                            </Button>
                        )}
                        <div className="ml-auto flex gap-1">
                            <Button variant="outline" size="sm" onClick={() => handleExport('excel')} className="h-8 px-2"><FileSpreadsheet className="h-3.5 w-3.5 sm:mr-1 text-emerald-600" /> <span className="hidden sm:inline">Excel</span></Button>
                            <Button variant="outline" size="sm" onClick={() => handleExport('pdf')} className="h-8 px-2"><FileText className="h-3.5 w-3.5 sm:mr-1 text-red-600" /> <span className="hidden sm:inline">PDF</span></Button>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
                <TabsList className="w-full justify-start overflow-x-auto h-auto p-1 bg-muted/50 no-scrollbar">
                    <TabsTrigger value="All" className="text-xs py-1.5 px-3">All ({tabCounts.All})</TabsTrigger>
                    <TabsTrigger value="Payment" className="text-xs py-1.5 px-3">Payments ({tabCounts.Payment})</TabsTrigger>
                    <TabsTrigger value="Receipt" className="text-xs py-1.5 px-3">Receipts ({tabCounts.Receipt})</TabsTrigger>
                    <TabsTrigger value="Sales" className="text-xs py-1.5 px-3">Sales ({tabCounts.Sales})</TabsTrigger>
                    <TabsTrigger value="Purchase" className="text-xs py-1.5 px-3">Purchases ({tabCounts.Purchase})</TabsTrigger>
                </TabsList>
                <TabsContent value={activeTab} className="mt-4">
                    <div className="border rounded-lg overflow-hidden bg-card">
                        <ScrollArea className="w-full">
                            <Table className="text-xs md:text-sm">
                                <TableHeader className="bg-muted/40">
                                    <TableRow>
                                        <TableHead className="w-[100px]"><Button variant="ghost" onClick={() => requestSort('date')} className="h-8 px-1">Date <ArrowUpDown className="ml-1 h-3 w-3" /></Button></TableHead>
                                        <TableHead><Button variant="ghost" onClick={() => requestSort('vehicleName')} className="h-8 px-1">Vehicle <ArrowUpDown className="ml-1 h-3 w-3" /></Button></TableHead>
                                        <TableHead className="hidden sm:table-cell"><Button variant="ghost" onClick={() => requestSort('type')} className="h-8 px-1">Type <ArrowUpDown className="ml-1 h-3 w-3" /></Button></TableHead>
                                        <TableHead><Button variant="ghost" onClick={() => requestSort('category')} className="h-8 px-1 font-bold text-primary">Category/Ref <ArrowUpDown className="ml-1 h-3 w-3" /></Button></TableHead>
                                        <TableHead><Button variant="ghost" onClick={() => requestSort('partyName')} className="h-8 px-1">Ledger <ArrowUpDown className="ml-1 h-3 w-3" /></Button></TableHead>
                                        <TableHead className="text-right"><Button variant="ghost" onClick={() => requestSort('amount')} className="h-8 px-1 w-full text-right">Amount <ArrowUpDown className="ml-1 h-3 w-3" /></Button></TableHead>
                                        <TableHead className="text-right px-4">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {isLoading ? (
                                        <TableRow><TableCell colSpan={7} className="text-center py-12"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></TableCell></TableRow>
                                    ) : sortedAndFilteredTransactions.map(txn => (
                                        <TableRow key={txn.id} className="hover:bg-muted/30">
                                            <TableCell className="font-medium text-[11px] md:text-xs whitespace-nowrap">{toNepaliDate(txn.date)}</TableCell>
                                            <TableCell className="font-semibold text-[11px] md:text-xs">{txn.vehicleName}</TableCell>
                                            <TableCell className="hidden sm:table-cell">
                                                <Badge variant="outline" className={cn(
                                                    "text-[9px] uppercase",
                                                    ['Receipt', 'Sales'].includes(txn.type) ? 'text-green-600 border-green-200 bg-green-50' : 'text-red-600 border-red-200 bg-red-50'
                                                )}>{txn.type}</Badge>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex flex-col gap-1">
                                                    <Badge variant="outline" className={cn(
                                                        "text-[9px] uppercase font-bold w-fit",
                                                        txn.category === 'Fuel' && "border-blue-200 bg-blue-50 text-blue-700",
                                                        txn.category === 'Maintenance' && "border-amber-200 bg-amber-50 text-amber-700",
                                                        txn.category === 'Advance' && "border-emerald-200 bg-emerald-50 text-emerald-700",
                                                        txn.category === 'Loan Repayment' && "border-orange-200 bg-orange-50 text-orange-700",
                                                        txn.category === 'Membership Renewal' && "border-purple-200 bg-purple-50 text-purple-700",
                                                        !txn.category && "border-slate-200 bg-slate-50 text-slate-700"
                                                    )}>
                                                        {txn.category || 'Other'}
                                                    </Badge>
                                                    {txn.sourceRef && (
                                                        <span className="text-[9px] text-blue-600 hidden sm:flex items-center gap-1">
                                                            <LinkIcon className="h-2 w-2" />
                                                            {txn.sourceRef}
                                                        </span>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-[11px] md:text-xs truncate max-w-[120px]">{txn.partyName}</TableCell>
                                            <TableCell className={cn("text-right font-mono font-bold text-[11px] md:text-xs", ['Purchase', 'Payment'].includes(txn.type) ? 'text-red-600' : 'text-green-600')}>
                                                {['Purchase', 'Payment'].includes(txn.type) && '-'}{txn.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                            </TableCell>
                                            <TableCell className="text-right px-4">
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7"><MoreHorizontal className="h-3 w-3" /></Button></DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end">
                                                        <DropdownMenuItem onSelect={() => router.push(txn.voucherId ? `/fleet/transactions/payment-receipt?voucherId=${txn.voucherId}` : `/fleet/transactions/view?id=${txn.id}`)}><Eye className="mr-2 h-4 w-4" /> View</DropdownMenuItem>
                                                        {hasPermission('fleet', 'edit') && (
                                                            <DropdownMenuItem onSelect={() => router.push(txn.voucherId ? `/fleet/transactions/payment-receipt/edit?voucherId=${txn.voucherId}` : `/fleet/transactions/edit?id=${txn.id}`)}><Edit className="mr-2 h-4 w-4" /> Edit</DropdownMenuItem>
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
                                    {!isLoading && sortedAndFilteredTransactions.length === 0 && <TableRow><TableCell colSpan={7} className="text-center py-12 text-muted-foreground">No records found for this tab.</TableCell></TableRow>}
                                </TableBody>
                                {!isLoading && sortedAndFilteredTransactions.length > 0 && (
                                    <TableFooter>
                                        <TableRow className="bg-muted/50 font-bold">
                                            <TableCell colSpan={5} className="text-right text-[11px] md:text-xs">Tab Net Result</TableCell>
                                            <TableCell className={cn(
                                                "text-right font-mono text-[11px] md:text-xs",
                                                (financialSummary.totalInflow - financialSummary.totalOutflow) >= 0 ? 'text-green-600' : 'text-red-600'
                                            )}>
                                                Rs. {(financialSummary.totalInflow - financialSummary.totalOutflow).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                            </TableCell>
                                            <TableCell></TableCell>
                                        </TableRow>
                                    </TableFooter>
                                )}
                            </Table>
                            <ScrollBar orientation="horizontal" />
                        </ScrollArea>
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    );
}
