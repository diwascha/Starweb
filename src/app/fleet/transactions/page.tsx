'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { Transaction, Vehicle, Party, Account, CompanyProfile } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { 
  PlusCircle, 
  Search, 
  ArrowUpDown, 
  MoreHorizontal, 
  Eye, 
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
  X,
  ChevronsUpDown,
  Check,
  ChevronRight,
  ChevronDown,
  TrendingDown,
  Scale,
  RotateCcw,
  BookOpen,
  Filter
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
import { format, isWithinInterval, startOfDay, endOfDay, isBefore } from 'date-fns';
import { cn, toNepaliDate, generateId } from '@/lib/utils';
import { onTransactionsUpdate, deleteVoucher } from '@/services/transaction-service';
import { onVehiclesUpdate } from '@/services/vehicle-service';
import { onPartiesUpdate } from '@/services/party-service';
import { onSettingUpdate } from '@/services/settings-service';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import NepaliDate from 'nepali-date-converter';
import { NEPALI_MONTHS, DEFAULT_FLEET_PROFILE } from '@/lib/constants';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DualCalendar } from '@/components/ui/dual-calendar';

interface LedgerEntry extends Transaction {
    vehicleName: string;
    partyName: string;
    debit: number;
    credit: number;
    balance: number;
    refNo: string;
    categoryDisplay: string;
    status: 'PAID' | 'DUE' | 'PARTIAL';
}

const FilterSelect = ({ label, value, onSelect, items, placeholder }: any) => (
    <div className="space-y-1.5 flex-1 min-w-[150px]">
        <Label className="text-[11px] font-bold text-muted-foreground uppercase tracking-tight">{label}</Label>
        <Select value={value} onValueChange={onSelect}>
            <SelectTrigger className="h-10 bg-white shadow-none border-gray-200 text-sm">
                <SelectValue placeholder={placeholder} />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value="All">All {placeholder}s</SelectItem>
                {items.map((item: any) => (
                    <SelectItem key={item.id || item} value={item.id || item}>{item.name || item}</SelectItem>
                ))}
            </SelectContent>
        </Select>
    </div>
);

const SearchableSelect = ({ label, value, onSelect, items, placeholder, icon: Icon }: any) => (
    <div className="space-y-1.5 flex-1 min-w-[200px]">
        <Label className="text-[11px] font-bold text-muted-foreground uppercase tracking-tight">{label}</Label>
        <Popover>
            <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-between h-10 bg-white border-gray-200 shadow-none font-normal text-sm px-3">
                    <div className="flex items-center gap-2 overflow-hidden">
                        <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="truncate">{value === 'All' ? `All ${placeholder}s` : (items.find((i: any) => i.id === value)?.name || `Select ${placeholder}`)}</span>
                    </div>
                    <ChevronDown className="h-4 w-4 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="p-0 w-[--radix-popover-trigger-width]">
                <Command>
                    <CommandInput placeholder={`Search ${placeholder.toLowerCase()}...`} />
                    <CommandList>
                        <CommandEmpty>No results found.</CommandEmpty>
                        <CommandGroup>
                            <CommandItem value="All" onSelect={() => onSelect('All')}>
                                <Check className={cn("mr-2 h-4 w-4", value === 'All' ? "opacity-100" : "opacity-0")} />
                                All {placeholder}s
                            </CommandItem>
                            {items.map((item: any) => (
                                <CommandItem key={item.id} value={item.name} onSelect={() => onSelect(item.id)}>
                                    <Check className={cn("mr-2 h-4 w-4", value === item.id ? "opacity-100" : "opacity-0")} />
                                    {item.name}
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    </div>
);

export default function FleetTransactionsPage() {
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [parties, setParties] = useState<Party[]>([]);
    const [fleetProfile, setFleetProfile] = useState<CompanyProfile>(DEFAULT_FLEET_PROFILE);
    const [isLoading, setIsLoading] = useState(true);
    const router = useRouter();
    const { toast } = useToast();
    const { user } = useAuth();

    // ERP Filter State
    const [filterParty, setFilterParty] = useState('All');
    const [filterVehicle, setFilterVehicle] = useState('All');
    const [filterFromDate, setFilterFromDate] = useState<Date | undefined>(undefined);
    const [filterToDate, setFilterToDate] = useState<Date | undefined>(undefined);
    const [filterCategory, setFilterCategory] = useState('All');
    const [filterStatus, setFilterStatus] = useState('All');
    
    // Derived UI State
    const [appliedFilters, setAppliedFilters] = useState({
        party: 'All', vehicle: 'All', from: undefined as Date | undefined, to: undefined as Date | undefined, category: 'All', status: 'All'
    });
    const [globalSearch, setUsageSearch] = useState('');

    useEffect(() => {
        setIsLoading(true);
        const unsubs = [
            onTransactionsUpdate(setTransactions),
            onVehiclesUpdate(setVehicles),
            onPartiesUpdate(setParties),
            onSettingUpdate('fleetCompanyProfile', (s) => { if (s?.value) setFleetProfile(s.value); })
        ];
        setIsLoading(false);
        return () => unsubs.forEach(u => u());
    }, []);

    const vehiclesById = useMemo(() => new Map(vehicles.map(v => [v.id, v.name])), [vehicles]);
    const partiesById = useMemo(() => new Map(parties.map(p => [p.id, p.name])), [parties]);
    const categories = useMemo(() => Array.from(new Set(transactions.map(t => t.category || (t.type === 'Sales' ? 'Freight' : t.type)))).filter(Boolean).sort(), [transactions]);

    const handleApplyFilters = () => {
        setAppliedFilters({
            party: filterParty,
            vehicle: filterVehicle,
            from: filterFromDate,
            to: filterToDate,
            category: filterCategory,
            status: filterStatus
        });
    };

    const handleResetFilters = () => {
        setFilterParty('All');
        setFilterVehicle('All');
        setFilterFromDate(undefined);
        setFilterToDate(undefined);
        setFilterCategory('All');
        setFilterStatus('All');
        setAppliedFilters({
            party: 'All', vehicle: 'All', from: undefined, to: undefined, category: 'All', status: 'All'
        });
    };

    const ledgerData = useMemo(() => {
        // 1. Raw mapping with Dr/Cr logic
        const rawMapped = transactions.map(t => {
            const isDebit = t.type === 'Purchase' || t.type === 'Payment'; // Outflows
            const amount = Number(t.amount) || 0;
            return {
                ...t,
                debit: isDebit ? amount : 0,
                credit: !isDebit ? amount : 0,
                vehicleName: vehiclesById.get(t.vehicleId) || 'N/A',
                partyName: t.partyId ? partiesById.get(t.partyId) || 'Unassigned' : 'Unassigned',
                refNo: t.purchaseNumber || t.referenceId || (t.tripId ? 'Trip' : 'JV'),
                categoryDisplay: (t.category || (t.type === 'Sales' ? 'Freight' : t.type)).toUpperCase()
            };
        });

        // 2. Sort by date for chronological balance calculation
        rawMapped.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        // 3. Calculate Opening Balance (Balance B/F)
        let openingBalance = 0;
        if (appliedFilters.from) {
            openingBalance = rawMapped
                .filter(t => isBefore(new Date(t.date), startOfDay(appliedFilters.from!)))
                .filter(t => appliedFilters.party === 'All' || t.partyId === appliedFilters.party)
                .filter(t => appliedFilters.vehicle === 'All' || t.vehicleId === appliedFilters.vehicle)
                .reduce((sum, t) => sum + (t.debit - t.credit), 0);
        }

        // 4. Filter current period entries
        let filtered = rawMapped.filter(t => {
            if (appliedFilters.from && isBefore(new Date(t.date), startOfDay(appliedFilters.from))) return false;
            if (appliedFilters.to && isBefore(endOfDay(appliedFilters.to), new Date(t.date))) return false;
            if (appliedFilters.party !== 'All' && t.partyId !== appliedFilters.party) return false;
            if (appliedFilters.vehicle !== 'All' && t.vehicleId !== appliedFilters.vehicle) return false;
            if (appliedFilters.category !== 'All' && t.categoryDisplay !== appliedFilters.category.toUpperCase()) return false;
            return true;
        });

        // 5. Global Search
        if (globalSearch) {
            const q = globalSearch.toLowerCase();
            filtered = filtered.filter(t => 
                t.vehicleName.toLowerCase().includes(q) || 
                t.partyName.toLowerCase().includes(q) || 
                t.refNo.toLowerCase().includes(q) || 
                (t.remarks || '').toLowerCase().includes(q)
            );
        }

        // 6. Calculate Running Balances
        let runningBalance = openingBalance;
        const processed = filtered.map(t => {
            runningBalance += (t.debit - t.credit);
            return { 
                ...t, 
                balance: runningBalance,
                status: (t.debit > 0 && t.credit > 0 ? 'PARTIAL' : (t.amount > 0 ? 'DUE' : 'PAID')) as any
            };
        });

        // 7. Summary Stats
        const totalDebit = processed.reduce((sum, t) => sum + t.debit, 0);
        const totalCredit = processed.reduce((sum, t) => sum + t.credit, 0);
        const netBalance = totalDebit - totalCredit;

        return {
            entries: processed,
            stats: {
                opening: openingBalance,
                debit: totalDebit,
                credit: totalCredit,
                net: netBalance,
                closing: openingBalance + netBalance,
                count: processed.length
            }
        };
    }, [transactions, appliedFilters, globalSearch, vehiclesById, partiesById]);

    const handleExport = async (type: 'excel' | 'pdf') => {
        const periodStr = appliedFilters.from ? `${toNepaliDate(appliedFilters.from.toISOString())} - ${appliedFilters.to ? toNepaliDate(appliedFilters.to.toISOString()) : 'Present'}` : 'All Time';
        
        if (type === 'excel') {
            const XLSX = await import('xlsx');
            const data = [
                [fleetProfile.nameEn.toUpperCase()],
                [fleetProfile.address],
                [`Period: ${periodStr}`],
                [],
                ['Date (BS)', 'Ref No.', 'Particulars', 'Vehicle', 'Category', 'Debit', 'Credit', 'Balance', 'Status'],
                ['', '', 'Balance B/F', '', '', '', '', ledgerData.stats.opening.toFixed(2), ''],
                ...ledgerData.entries.map(e => [
                    toNepaliDate(e.date), e.refNo, e.remarks || e.type, e.vehicleName, e.categoryDisplay, 
                    e.debit || '-', e.credit || '-', e.balance.toFixed(2), e.status
                ]),
                ['', '', 'Total', '', '', ledgerData.stats.debit.toFixed(2), ledgerData.stats.credit.toFixed(2), '', '']
            ];
            const ws = XLSX.utils.aoa_to_sheet(data);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Ledger");
            XLSX.writeFile(wb, `Ledger_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
        } else {
            const { jsPDF } = await import('jspdf');
            const { default: autoTable } = await import('jspdf-autotable');
            const doc = new jsPDF('l', 'mm', 'a4');
            doc.setFontSize(18); doc.text(fleetProfile.nameEn.toUpperCase(), 14, 15);
            doc.setFontSize(10); doc.text(fleetProfile.address, 14, 21);
            doc.text(`Ledger Period: ${periodStr}`, 14, 27);
            
            autoTable(doc, {
                startY: 35,
                head: [['Date (BS)', 'Ref No.', 'Particulars', 'Vehicle', 'Category', 'Debit', 'Credit', 'Balance', 'Status']],
                body: [
                    ['', '', 'Balance B/F', '-', '-', '-', '-', ledgerData.stats.opening.toLocaleString(), ''],
                    ...ledgerData.entries.map(e => [
                        toNepaliDate(e.date), e.refNo, e.remarks || e.type, e.vehicleName, e.categoryDisplay,
                        e.debit ? e.debit.toLocaleString() : '-', e.credit ? e.credit.toLocaleString() : '-',
                        e.balance.toLocaleString(), e.status
                    ])
                ],
                theme: 'striped',
                headStyles: { fillColor: [44, 62, 80] }
            });
            doc.save(`Ledger_Report_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
        }
    };

    return (
        <div className="flex flex-col gap-6 max-w-[1600px] mx-auto">
            {/* Header Section */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="space-y-1">
                    <div className="flex items-center gap-2 text-xl font-bold tracking-tight">
                        <BookOpen className="h-6 w-6 text-primary" />
                        <h1>Fleet Ledger</h1>
                    </div>
                    <nav className="flex items-center gap-1 text-[11px] text-muted-foreground font-medium uppercase tracking-widest">
                        <span>Fleet Management</span> <ChevronRight className="h-3 w-3" /> <span className="text-foreground">Ledger</span>
                    </nav>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" className="h-9 gap-2 shadow-sm border-gray-200" onClick={() => handleExport('excel')}>
                        <FileSpreadsheet className="h-4 w-4 text-emerald-600" /> Export Excel
                    </Button>
                    <Button variant="outline" size="sm" className="h-9 gap-2 shadow-sm border-gray-200" onClick={() => handleExport('pdf')}>
                        <FileText className="h-4 w-4 text-red-600" /> Export PDF
                    </Button>
                </div>
            </div>

            {/* Filter Card */}
            <Card className="shadow-sm border-gray-100 bg-white overflow-visible">
                <CardContent className="p-5 flex flex-wrap items-end gap-4">
                    <SearchableSelect 
                        label="Party" 
                        value={filterParty} 
                        onSelect={setFilterParty} 
                        items={parties.filter(p => p.ownership === 'Sijan' || p.ownership === 'Both')} 
                        placeholder="Party" 
                        icon={Users} 
                    />
                    <SearchableSelect 
                        label="Vehicle" 
                        value={filterVehicle} 
                        onSelect={setFilterVehicle} 
                        items={vehicles} 
                        placeholder="Vehicle" 
                        icon={Truck} 
                    />
                    
                    <div className="space-y-1.5 flex-1 min-w-[150px]">
                        <Label className="text-[11px] font-bold text-muted-foreground uppercase tracking-tight">From Date</Label>
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button variant="outline" className="w-full justify-between h-10 bg-white border-gray-200 shadow-none font-normal">
                                    <span className="text-sm">{filterFromDate ? toNepaliDate(filterFromDate.toISOString()) : 'YYYY/MM/DD'}</span>
                                    <CalendarIcon className="h-4 w-4 opacity-50" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                                <DualCalendar selected={filterFromDate} onSelect={setFilterFromDate} />
                            </PopoverContent>
                        </Popover>
                    </div>

                    <div className="space-y-1.5 flex-1 min-w-[150px]">
                        <Label className="text-[11px] font-bold text-muted-foreground uppercase tracking-tight">To Date</Label>
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button variant="outline" className="w-full justify-between h-10 bg-white border-gray-200 shadow-none font-normal">
                                    <span className="text-sm">{filterToDate ? toNepaliDate(filterToDate.toISOString()) : 'YYYY/MM/DD'}</span>
                                    <CalendarIcon className="h-4 w-4 opacity-50" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                                <DualCalendar selected={filterToDate} onSelect={setFilterToDate} />
                            </PopoverContent>
                        </Popover>
                    </div>

                    <FilterSelect label="Category" value={filterCategory} onSelect={setFilterCategory} items={categories} placeholder="Category" />
                    <FilterSelect label="Status" value={filterStatus} onSelect={setFilterStatus} items={['Paid', 'Due', 'Partial']} placeholder="Status" />

                    <div className="flex gap-2 shrink-0">
                        <Button className="h-10 px-6 font-bold shadow-md shadow-primary/20" onClick={handleApplyFilters}>Apply Filter</Button>
                        <Button variant="ghost" className="h-10 px-4 text-muted-foreground hover:bg-gray-50" onClick={handleResetFilters}>Reset</Button>
                    </div>
                </CardContent>
            </Card>

            {/* Summary Row */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                {[
                    { label: 'Opening Balance', value: ledgerData.stats.opening, color: 'text-gray-600' },
                    { label: 'Total Debit', value: ledgerData.stats.debit, color: 'text-red-600' },
                    { label: 'Total Credit', value: ledgerData.stats.credit, color: 'text-emerald-600' },
                    { label: 'Net Balance', value: ledgerData.stats.net, color: 'text-red-600' },
                    { label: 'Total Transactions', value: ledgerData.stats.count, color: 'text-gray-900', suffix: '' },
                ].map((stat, i) => (
                    <Card key={i} className="shadow-none border-gray-100 py-3 text-center bg-gray-50/30">
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">{stat.label}</p>
                        <p className={cn("text-sm font-black tabular-nums", stat.color)}>
                            {stat.suffix !== '' ? 'NPR ' : ''}{Number(stat.value).toLocaleString(undefined, { minimumFractionDigits: stat.suffix === '' ? 0 : 2 })}
                        </p>
                    </Card>
                ))}
                <Card className="shadow-none border-red-100 py-3 text-center bg-red-50/40 border-l-4 border-l-red-500">
                    <p className="text-[10px] font-bold text-red-600/70 uppercase tracking-wider mb-1">Balance As On {appliedFilters.to ? toNepaliDate(appliedFilters.to.toISOString()) : toNepaliDate(new Date().toISOString())}</p>
                    <p className="text-sm font-black text-red-600 tabular-nums">
                        NPR {Math.abs(ledgerData.stats.closing).toLocaleString(undefined, { minimumFractionDigits: 2 })} {ledgerData.stats.closing >= 0 ? 'Dr' : 'Cr'}
                    </p>
                </Card>
            </div>

            {/* Ledger Table Section */}
            <Card className="shadow-sm border-gray-100 bg-white">
                <Tabs defaultValue="ledger" className="w-full">
                    <div className="flex flex-col sm:flex-row items-center justify-between border-b px-5 py-2 gap-4">
                        <TabsList className="bg-transparent border-none p-0 h-auto gap-6">
                            <TabsTrigger value="ledger" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none h-10 px-0 font-bold text-sm">Ledger View</TabsTrigger>
                            <TabsTrigger value="summary" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none h-10 px-0 font-bold text-sm">Summary View</TabsTrigger>
                        </TabsList>
                        <div className="relative w-full sm:w-[350px]">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input 
                                placeholder="Search narration, ref no..." 
                                className="pl-9 h-10 bg-gray-50 border-gray-200 shadow-none focus-visible:bg-white text-sm"
                                value={globalSearch}
                                onChange={(e) => setUsageSearch(e.target.value)}
                            />
                            <Button variant="ghost" size="icon" className="absolute right-1 top-1 h-8 w-8"><Filter className="h-4 w-4 text-muted-foreground"/></Button>
                        </div>
                    </div>

                    <TabsContent value="ledger" className="p-0 m-0">
                        <ScrollArea className="w-full">
                            <Table className="text-[12px]">
                                <TableHeader className="bg-blue-50/30">
                                    <TableRow className="hover:bg-transparent">
                                        <TableHead className="w-[120px] font-bold text-blue-900 h-12">Date (BS)</TableHead>
                                        <TableHead className="w-[120px] font-bold text-blue-900">Ref. No.</TableHead>
                                        <TableHead className="min-w-[300px] font-bold text-blue-900">Particulars</TableHead>
                                        <TableHead className="w-[150px] font-bold text-blue-900">Vehicle</TableHead>
                                        <TableHead className="w-[140px] font-bold text-blue-900">Category</TableHead>
                                        <TableHead className="text-right w-[140px] font-bold text-blue-900">Debit (NPR)</TableHead>
                                        <TableHead className="text-right w-[140px] font-bold text-blue-900">Credit (NPR)</TableHead>
                                        <TableHead className="text-right w-[160px] font-bold text-blue-900">Balance (NPR)</TableHead>
                                        <TableHead className="text-center w-[100px] font-bold text-blue-900">Status</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody className="bg-white">
                                    {/* Brought Forward Row */}
                                    <TableRow className="bg-gray-50/30 font-medium">
                                        <TableCell colSpan={2}></TableCell>
                                        <TableCell className="font-bold">Balance B/F</TableCell>
                                        <TableCell className="text-center">-</TableCell>
                                        <TableCell className="text-center">-</TableCell>
                                        <TableCell className="text-right">-</TableCell>
                                        <TableCell className="text-right">-</TableCell>
                                        <TableCell className="text-right font-black">{ledgerData.stats.opening.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                        <TableCell></TableCell>
                                    </TableRow>

                                    {ledgerData.entries.map((entry) => (
                                        <TableRow key={entry.id} className="h-12 border-b border-gray-100 hover:bg-gray-50/50 transition-colors">
                                            <TableCell className="text-gray-600">{toNepaliDate(entry.date)}</TableCell>
                                            <TableCell>
                                                <Button variant="link" className="p-0 h-auto font-bold text-blue-600" onClick={() => router.push(entry.voucherId ? `/fleet/transactions/payment-receipt?voucherId=${entry.voucherId}` : `/fleet/transactions/purchase/view?id=${entry.id}`)}>
                                                    {entry.refNo}
                                                </Button>
                                            </TableCell>
                                            <TableCell className="font-medium text-gray-800">{entry.remarks || entry.type}</TableCell>
                                            <TableCell>{entry.vehicleName}</TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className={cn(
                                                    "text-[10px] font-black border-none px-2 py-0.5",
                                                    entry.debit > 0 ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"
                                                )}>
                                                    {entry.categoryDisplay}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-right font-bold text-red-500">{entry.debit > 0 ? entry.debit.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '-'}</TableCell>
                                            <TableCell className="text-right font-bold text-emerald-600">{entry.credit > 0 ? entry.credit.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '-'}</TableCell>
                                            <TableCell className="text-right font-black tabular-nums">
                                                {Math.abs(entry.balance).toLocaleString(undefined, { minimumFractionDigits: 2 })} {entry.balance >= 0 ? 'Dr' : 'Cr'}
                                            </TableCell>
                                            <TableCell className="text-center">
                                                <Badge className={cn(
                                                    "text-[9px] font-bold px-2",
                                                    entry.status === 'PAID' ? "bg-green-100 text-green-700 hover:bg-green-100" : (entry.status === 'PARTIAL' ? "bg-blue-100 text-blue-700 hover:bg-blue-100" : "bg-orange-100 text-orange-700 hover:bg-orange-100")
                                                )}>
                                                    {entry.status}
                                                </Badge>
                                            </TableCell>
                                        </TableRow>
                                    ))}

                                    {!isLoading && ledgerData.entries.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={9} className="text-center py-24 text-muted-foreground italic">
                                                No transactions found matching your criteria.
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                                <TableFooter className="bg-gray-50/50">
                                    <TableRow className="h-12 border-t-2 border-gray-200 hover:bg-transparent">
                                        <TableCell colSpan={5} className="text-right font-bold text-gray-900 text-sm">Total</TableCell>
                                        <TableCell className="text-right font-black text-red-600 text-sm">{ledgerData.stats.debit.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                        <TableCell className="text-right font-black text-emerald-700 text-sm">{ledgerData.stats.credit.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                        <TableCell colSpan={2}></TableCell>
                                    </TableRow>
                                </TableFooter>
                            </Table>
                            <ScrollBar orientation="horizontal" />
                        </ScrollArea>
                        
                        <div className="flex items-center justify-between px-5 py-4 border-t text-xs text-muted-foreground">
                            <span>Showing 1 to {ledgerData.entries.length} of {ledgerData.entries.length} entries</span>
                            <div className="flex gap-1">
                                <Button variant="outline" size="icon" className="h-8 w-8 disabled:opacity-30" disabled><ChevronRight className="h-4 w-4 rotate-180" /></Button>
                                <Button size="icon" className="h-8 w-8 bg-blue-900 hover:bg-blue-800">1</Button>
                                <Button variant="outline" size="icon" className="h-8 w-8 disabled:opacity-30" disabled><ChevronRight className="h-4 w-4" /></Button>
                            </div>
                        </div>
                    </TabsContent>

                    <TabsContent value="summary" className="p-10 text-center text-muted-foreground italic">
                        Summary consolidation view is being generated...
                    </TabsContent>
                </Tabs>
            </Card>
        </div>
    );
}
