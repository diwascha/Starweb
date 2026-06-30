'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
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
  TrendingDown,
  Scale
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
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
import { onAccountsUpdate } from '@/services/account-service';
import { onSettingUpdate } from '@/services/settings-service';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import NepaliDate from 'nepali-date-converter';
import { NEPALI_MONTHS, DEFAULT_FLEET_PROFILE } from '@/lib/constants';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Tooltip, TooltipProvider, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

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

const SearchPopover = ({ 
    className, 
    isOpen, 
    onOpenChange, 
    value, 
    onSelect, 
    items, 
    itemsMap,
    placeholder,
    icon: Icon
}: { 
    className?: string; 
    isOpen: boolean; 
    onOpenChange: (open: boolean) => void; 
    value: string; 
    onSelect: (id: string) => void;
    items: { id: string, name: string }[];
    itemsMap: Map<string, string>;
    placeholder: string;
    icon: any;
}) => (
    <Popover open={isOpen} onOpenChange={onOpenChange}>
        <PopoverTrigger asChild>
            <Button variant="outline" role="combobox" className={cn("justify-between h-10 bg-white text-xs", className)}>
                <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    <span className="truncate">
                        {value === 'All' ? `All ${placeholder}s` : (itemsMap.get(value) || `Select ${placeholder}`)}
                    </span>
                </div>
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
        </PopoverTrigger>
        <PopoverContent className="p-0 w-[--radix-popover-trigger-width]">
            <Command>
                <CommandInput placeholder={`Search ${placeholder}...`} />
                <CommandList>
                    <CommandEmpty>No {placeholder.toLowerCase()} found.</CommandEmpty>
                    <CommandGroup>
                        <CommandItem value="All" onSelect={() => { onSelect('All'); onOpenChange(false); }}>
                            <Check className={cn("mr-2 h-4 w-4", value === 'All' ? "opacity-100" : "opacity-0")} />
                            All {placeholder}s
                        </CommandItem>
                        {items.map(item => (
                            <CommandItem key={item.id} value={item.name} onSelect={() => { onSelect(item.id); onOpenChange(false); }}>
                                <Check className={cn("mr-2 h-4 w-4", value === item.id ? "opacity-100" : "opacity-0")} />
                                {item.name}
                            </CommandItem>
                        ))}
                    </CommandGroup>
                </CommandList>
            </Command>
        </PopoverContent>
    </Popover>
);

export default function FleetTransactionsPage() {
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [parties, setParties] = useState<Party[]>([]);
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [fleetProfile, setFleetProfile] = useState<CompanyProfile>(DEFAULT_FLEET_PROFILE);
    const [isLoading, setIsLoading] = useState(true);
    const router = useRouter();
    const { toast } = useToast();
    const { hasPermission, user } = useAuth();

    const [searchQuery, setSearchQuery] = useState('');
    const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
    const [selectedBsYear, setSelectedBsYear] = useState<string>('All');
    const [selectedBsMonth, setSelectedBsMonth] = useState<string>('All');
    const [filterVehicleId, setFilterVehicleId] = useState<string>('All');
    const [filterPartyId, setFilterPartyId] = useState<string>('All');
    const [filterDirection, setFilterDirection] = useState<'All' | 'Income' | 'Expense'>('All');
    const [filterStatus, setFilterStatus] = useState<string>('All');
    
    const [isVehicleSearchOpen, setIsVehicleSearchOpen] = useState(false);
    const [isPartnerSearchOpen, setIsPartnerSearchOpen] = useState(false);
    
    const hasSetInitialPeriod = useRef(false);

    useEffect(() => {
        setIsLoading(true);
        const unsubs = [
            onTransactionsUpdate(setTransactions),
            onVehiclesUpdate(setVehicles),
            onPartiesUpdate(setParties),
            onAccountsUpdate(setAccounts),
            onSettingUpdate('fleetCompanyProfile', (s) => { if (s?.value) setFleetProfile(s.value); })
        ];
        setIsLoading(false);
        return () => unsubs.forEach(u => u());
    }, []);

    const vehiclesById = useMemo(() => new Map(vehicles.map(v => [v.id, v.name])), [vehicles]);
    const partiesById = useMemo(() => new Map(parties.map(p => [p.id, p.name])), [parties]);

    // Filtered parties for fleet context: only 'Sijan' or 'Both'
    const fleetParties = useMemo(() => {
        return parties
            .filter(p => p.ownership === 'Sijan' || p.ownership === 'Both')
            .sort((a, b) => a.name.localeCompare(b.name));
    }, [parties]);

    const availableYears = useMemo(() => {
        const years = new Set<number>();
        years.add(new NepaliDate().getYear());
        transactions.forEach(t => {
            try { years.add(new NepaliDate(new Date(t.date)).getYear()); } catch {}
        });
        return Array.from(years).sort((a, b) => b - a);
    }, [transactions]);

    useEffect(() => {
        if (availableYears.length > 0 && !hasSetInitialPeriod.current) {
            const currentNepaliDate = new NepaliDate();
            const currentYear = currentNepaliDate.getYear();
            if (availableYears.includes(currentYear)) setSelectedBsYear(String(currentYear));
            else setSelectedBsYear(String(availableYears[0]));
            setSelectedBsMonth(String(currentNepaliDate.getMonth()));
            hasSetInitialPeriod.current = true;
        }
    }, [availableYears]);

    const processedData = useMemo(() => {
        const rawMapped = transactions.map(t => {
            const direction = (t.type === 'Sales' || t.type === 'Receipt') ? 'Income' : 'Expense';
            const vehicleName = vehiclesById.get(t.vehicleId) || 'N/A';
            const partyName = t.partyId ? partiesById.get(t.partyId) || 'Unassigned' : 'Unassigned';
            let reference = t.referenceId || t.purchaseNumber || (t.tripId ? 'Trip Sheet' : 'Direct Entry');
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
                const totalAmount = t.amount;
                const dueAmount = Math.max(0, totalAmount - paidAmount);
                let status: 'Paid' | 'Partial' | 'Due' = dueAmount <= 0 ? 'Paid' : (paidAmount > 0 ? 'Partial' : 'Due');

                processed.push({ ...t, displayCategory: t.category || (t.type === 'Sales' ? 'Freight' : 'Procurement'), paidAmount, dueAmount, status });
                associatedPayments.forEach(p => handledIds.add(p.id));
                handledIds.add(t.id);
            }
        });

        rawMapped.forEach(t => {
            if (!handledIds.has(t.id)) {
                processed.push({ ...t, displayCategory: t.category || t.type, paidAmount: t.amount, dueAmount: 0, status: 'Paid' });
            }
        });

        return processed.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [transactions, vehiclesById, partiesById]);

    const filteredTransactions = useMemo(() => {
        let filtered = [...processedData];
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            filtered = filtered.filter(t => t.vehicleName.toLowerCase().includes(q) || t.partyName.toLowerCase().includes(q) || t.displayCategory.toLowerCase().includes(q));
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
        if (filterStatus === 'Outstanding') filtered = filtered.filter(t => t.status !== 'Paid');
        else if (filterStatus !== 'All') filtered = filtered.filter(t => t.status === filterStatus);
        
        return filtered;
    }, [processedData, searchQuery, dateRange, selectedBsYear, selectedBsMonth, filterVehicleId, filterPartyId, filterDirection, filterStatus]);

    const summaryStats = useMemo(() => {
        const stats = filteredTransactions.reduce((acc, t) => {
            if (t.direction === 'Income') acc.income += t.amount;
            else acc.expense += t.amount;
            acc.due += t.dueAmount;
            return acc;
        }, { income: 0, expense: 0, due: 0 });
        return { ...stats, profit: stats.income - stats.expense };
    }, [filteredTransactions]);

    const handleClearFilters = () => {
        setSearchQuery('');
        setDateRange(undefined);
        const nowBS = new NepaliDate();
        setSelectedBsYear(String(nowBS.getYear()));
        setSelectedBsMonth(String(nowBS.getMonth()));
        setFilterVehicleId('All');
        setFilterPartyId('All');
        setFilterDirection('All');
        setFilterStatus('All');
    };

    const handleExport = async (formatType: 'excel' | 'pdf') => {
        const period = dateRange?.from ? `${format(dateRange.from, 'PP')} - ${format(dateRange.to || dateRange.from, 'PP')}` : `${NEPALI_MONTHS.find(m => m.value.toString() === selectedBsMonth)?.name || ''} ${selectedBsYear}`;
        if (formatType === 'excel') {
            const XLSX = await import('xlsx');
            const header = [[fleetProfile.nameEn], [fleetProfile.address], [`PAN: ${fleetProfile.pan}`], [], ['FLEET TRANSACTION LEDGER REPORT'], [`Period: ${period}`], [`Generated by: ${user?.username} on ${format(new Date(), 'PPpp')}`], [], ['DATE (BS)', 'VEHICLE', 'FLOW', 'CATEGORY', 'PARTNER', 'REFERENCE', 'AMOUNT (NPR)', 'SETTLED', 'OUTSTANDING', 'STATUS']];
            const tableData = filteredTransactions.map(t => [toNepaliDate(t.date), t.vehicleName, t.direction, t.displayCategory, t.partyName, t.reference, t.amount, t.paidAmount, t.dueAmount, t.status]);
            const worksheet = XLSX.utils.aoa_to_sheet([...header, ...tableData]);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "Ledger Report");
            XLSX.writeFile(workbook, `Fleet_Ledger_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
        } else {
            const { jsPDF } = await import('jspdf');
            const { default: autoTable } = await import('jspdf-autotable');
            const doc = new jsPDF('l', 'mm', 'a4');
            doc.setFont('Helvetica', 'bold'); doc.setFontSize(20); doc.text(fleetProfile.nameEn.toUpperCase(), doc.internal.pageSize.getWidth() / 2, 15, { align: 'center' });
            doc.setFont('Helvetica', 'normal'); doc.setFontSize(10); doc.text(fleetProfile.address, doc.internal.pageSize.getWidth() / 2, 21, { align: 'center' });
            doc.text(`PAN: ${fleetProfile.pan}`, doc.internal.pageSize.getWidth() / 2, 26, { align: 'center' });
            doc.setFont('Helvetica', 'bold'); doc.setFontSize(14); doc.text("FLEET TRANSACTION LEDGER", 14, 40);
            doc.setFont('Helvetica', 'normal'); doc.setFontSize(9); doc.text(`Period: ${period}`, 14, 46);
            const tableData = filteredTransactions.map(t => [toNepaliDate(t.date), t.vehicleName, t.direction, t.displayCategory, t.partyName, t.reference, t.amount.toLocaleString(), t.paidAmount.toLocaleString(), t.dueAmount.toLocaleString(), t.status]);
            autoTable(doc, { startY: 55, head: [['Date (BS)', 'Vehicle', 'Flow', 'Category', 'Partner', 'Reference', 'Amount', 'Paid', 'Due', 'Status']], body: tableData, theme: 'striped' });
            doc.save(`Fleet_Ledger_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
        }
    };

    return (
        <div className="flex flex-col gap-6">
            <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div><h1 className="text-3xl font-bold tracking-tight">Fleet Ledger</h1><p className="text-muted-foreground text-sm">Unified financial tracking for vehicles and partners.</p></div>
                <div className="flex items-center gap-2">
                    <Button onClick={() => router.push('/fleet/transactions/payment-receipt/new')} size="sm"><PlusCircle className="mr-2 h-4 w-4" /> Pmt. / Rcd. Voucher</Button>
                    <Button onClick={() => router.push('/fleet/transactions/expenses/new')} size="sm" variant="secondary"><Wallet className="mr-2 h-4 w-4" /> Daily Exp. Entry</Button>
                </div>
            </header>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="border-l-4 border-l-emerald-500 shadow-sm">
                    <CardHeader className="py-3"><CardTitle className="text-[10px] uppercase font-bold text-muted-foreground flex items-center gap-2"><ArrowUpRight className="h-3 w-3 text-emerald-600" /> Total Income</CardTitle></CardHeader>
                    <CardContent><div className="text-xl font-black tabular-nums">Rs. {summaryStats.income.toLocaleString()}</div></CardContent>
                </Card>
                <Card className="border-l-4 border-l-red-500 shadow-sm">
                    <CardHeader className="py-3"><CardTitle className="text-[10px] uppercase font-bold text-muted-foreground flex items-center gap-2"><ArrowDownLeft className="h-3 w-3 text-red-600" /> Total Expense</CardTitle></CardHeader>
                    <CardContent><div className="text-xl font-black tabular-nums text-red-600">Rs. {summaryStats.expense.toLocaleString()}</div></CardContent>
                </Card>
                <Card className={cn("border-l-4 shadow-sm", summaryStats.profit >= 0 ? "border-l-blue-500" : "border-l-orange-500")}>
                    <CardHeader className="py-3"><CardTitle className="text-[10px] uppercase font-bold text-muted-foreground flex items-center gap-2"><TrendingUp className="h-3 w-3" /> Net Margin</CardTitle></CardHeader>
                    <CardContent><div className={cn("text-xl font-black tabular-nums", summaryStats.profit >= 0 ? "text-blue-700" : "text-orange-700")}>Rs. {summaryStats.profit.toLocaleString()}</div></CardContent>
                </Card>
                <Card className="border-l-4 border-l-purple-500 shadow-sm">
                    <CardHeader className="py-3"><CardTitle className="text-[10px] uppercase font-bold text-muted-foreground flex items-center gap-2"><Scale className="h-3 w-3" /> Outstanding</CardTitle></CardHeader>
                    <CardContent><div className="text-xl font-black tabular-nums">Rs. {summaryStats.due.toLocaleString()}</div></CardContent>
                </Card>
            </div>

            <Card className="sticky top-0 z-20 shadow-md bg-background/95 backdrop-blur border-primary/20">
                <CardContent className="p-4">
                    <div className="flex flex-wrap gap-3 items-end">
                        <div className="space-y-1.5"><Label className="text-[10px] uppercase font-bold text-muted-foreground">Year (BS)</Label>
                            <Select value={selectedBsYear} onValueChange={setSelectedBsYear}>
                                <SelectTrigger className="w-[100px] h-10 bg-white text-xs"><SelectValue /></SelectTrigger>
                                <SelectContent><SelectItem value="All">All Time</SelectItem>{availableYears.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5"><Label className="text-[10px] uppercase font-bold text-muted-foreground">Month (BS)</Label>
                            <Select value={selectedBsMonth} onValueChange={setSelectedBsMonth}>
                                <SelectTrigger className="w-[120px] h-10 bg-white text-xs"><SelectValue /></SelectTrigger>
                                <SelectContent><SelectItem value="All">All Months</SelectItem>{NEPALI_MONTHS.map(m => <SelectItem key={m.value} value={String(m.value)}>{m.name}</SelectItem>)}</SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5 w-full md:w-[160px]"><Label className="text-[10px] uppercase font-bold text-muted-foreground">Vehicle</Label>
                            <SearchPopover 
                                isOpen={isVehicleSearchOpen} 
                                onOpenChange={setIsVehicleSearchOpen} 
                                value={filterVehicleId} 
                                onSelect={setFilterVehicleId} 
                                items={vehicles} 
                                itemsMap={vehiclesById} 
                                placeholder="Vehicle"
                                icon={Truck}
                            />
                        </div>
                        <div className="space-y-1.5 w-full md:w-[180px]"><Label className="text-[10px] uppercase font-bold text-muted-foreground">Partner</Label>
                            <SearchPopover 
                                isOpen={isPartnerSearchOpen} 
                                onOpenChange={setIsPartnerSearchOpen} 
                                value={filterPartyId} 
                                onSelect={setFilterPartyId} 
                                items={fleetParties} 
                                itemsMap={partiesById} 
                                placeholder="Partner"
                                icon={Users}
                            />
                        </div>
                        <div className="space-y-1.5 w-full md:w-[200px]"><Label className="text-[10px] uppercase font-bold text-muted-foreground">AD Range</Label>
                            <Popover><PopoverTrigger asChild><Button variant="outline" className={cn("h-10 justify-start text-left font-normal bg-white text-xs", !dateRange && "text-muted-foreground")}><CalendarIcon className="mr-2 h-4 w-4" />{dateRange?.from ? (dateRange.to ? (`${format(dateRange.from, 'PP')} - ${format(dateRange.to, 'PP')}`) : format(dateRange.from, 'PP')) : (<span>Pick AD Range</span>)}</Button></PopoverTrigger><PopoverContent className="w-auto p-0" align="start"><DualDateRangePicker selected={dateRange} onSelect={setDateRange} /></PopoverContent></Popover>
                        </div>
                        <div className="space-y-1.5"><Label className="text-[10px] uppercase font-bold text-muted-foreground">Flow</Label>
                            <Select value={filterDirection} onValueChange={(v: any) => setFilterDirection(v)}>
                                <SelectTrigger className="w-[90px] h-10 bg-white text-xs"><SelectValue /></SelectTrigger>
                                <SelectContent><SelectItem value="All">Both</SelectItem><SelectItem value="Income">Income</SelectItem><SelectItem value="Expense">Expense</SelectItem></SelectContent>
                            </Select>
                        </div>
                        <Button variant="ghost" size="icon" onClick={handleClearFilters} className="h-10 w-10 text-muted-foreground"><FilterX className="h-5 w-5" /></Button>
                    </div>
                </CardContent>
            </Card>

            <div className="flex flex-col gap-6">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                    <h2 className="text-xl font-bold flex items-center gap-2">Detailed Transaction Log <Badge variant="secondary" className="font-mono">{filteredTransactions.length}</Badge></h2>
                    <div className="flex gap-2 w-full sm:w-auto">
                        <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => handleExport('excel')}><FileSpreadsheet className="mr-2 h-3.5 w-3.5 text-emerald-600" /> Export Excel</Button>
                        <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => handleExport('pdf')}><FileText className="mr-2 h-3.5 w-3.5 text-red-600" /> Export PDF</Button>
                    </div>
                </div>

                <Card>
                    <CardContent className="p-0">
                        <ScrollArea className="w-full">
                            <Table className="text-xs">
                                <TableHeader className="bg-muted/50">
                                    <TableRow>
                                        <TableHead>Date (BS)</TableHead>
                                        <TableHead>Vehicle</TableHead>
                                        <TableHead>Category</TableHead>
                                        <TableHead>Partner</TableHead>
                                        <TableHead className="text-right">Amount</TableHead>
                                        <TableHead className="text-right">Settled</TableHead>
                                        <TableHead className="text-right">Outstanding</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {isLoading ? (
                                        <TableRow><TableCell colSpan={9} className="text-center py-12"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></TableCell></TableRow>
                                    ) : filteredTransactions.map(t => (
                                        <TableRow key={t.id} className="h-12 hover:bg-muted/30">
                                            <TableCell className="whitespace-nowrap">{toNepaliDate(t.date)}</TableCell>
                                            <TableCell className="font-bold">{t.vehicleName}</TableCell>
                                            <TableCell><Badge variant="secondary" className="text-[9px] uppercase">{t.displayCategory}</Badge></TableCell>
                                            <TableCell>{t.partyName}</TableCell>
                                            <TableCell className={cn("text-right font-mono font-bold", t.direction === 'Income' ? "text-emerald-600" : "text-red-600")}>{t.amount.toLocaleString()}</TableCell>
                                            <TableCell className="text-right font-mono text-muted-foreground">{t.paidAmount.toLocaleString()}</TableCell>
                                            <TableCell className={cn("text-right font-mono font-black", t.dueAmount > 0 ? "text-orange-600" : (t.dueAmount < 0 ? "text-blue-700" : "text-muted-foreground/30"))}>
                                                {t.dueAmount < 0 ? <span className="flex items-center justify-end gap-1"><Badge variant="outline" className="text-[9px] h-4 bg-blue-50 px-1">ADV</Badge>{Math.abs(t.dueAmount).toLocaleString()}</span> : t.dueAmount.toLocaleString()}
                                            </TableCell>
                                            <TableCell><Badge variant="outline" className="text-[9px] uppercase">{t.status}</Badge></TableCell>
                                            <TableCell className="text-right">
                                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => router.push(t.voucherId ? `/fleet/transactions/payment-receipt?voucherId=${t.voucherId}` : `/fleet/transactions/purchase/view?id=${t.id}`)}>
                                                    <Eye className="h-4 w-4" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {!isLoading && filteredTransactions.length === 0 && (
                                        <TableRow><TableCell colSpan={9} className="text-center py-24 text-muted-foreground">No transactions found for the selected filters.</TableCell></TableRow>
                                    )}
                                </TableBody>
                            </Table>
                            <ScrollBar orientation="horizontal" />
                        </ScrollArea>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
