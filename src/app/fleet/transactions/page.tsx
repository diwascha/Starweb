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
  ChevronRight
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import NepaliDate from 'nepali-date-converter';
import { NEPALI_MONTHS, DEFAULT_FLEET_PROFILE } from '@/lib/constants';
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

const VehicleSearchPopover = ({ 
    className, 
    isOpen, 
    onOpenChange, 
    value, 
    onSelect, 
    vehicles, 
    vehiclesById 
}: { 
    className?: string; 
    isOpen: boolean; 
    onOpenChange: (open: boolean) => void; 
    value: string; 
    onSelect: (id: string) => void;
    vehicles: Vehicle[];
    vehiclesById: Map<string, string>;
}) => (
    <Popover open={isOpen} onOpenChange={onOpenChange}>
        <PopoverTrigger asChild>
            <Button variant="outline" role="combobox" className={cn("justify-between h-10 bg-white", className)}>
                <div className="flex items-center gap-2">
                    <Truck className="h-4 w-4 text-muted-foreground" />
                    {value === 'All' ? "All Vehicles" : (vehiclesById.get(value) || 'Select Vehicle')}
                </div>
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
        </PopoverTrigger>
        <PopoverContent className="p-0 w-[--radix-popover-trigger-width]">
            <Command>
                <CommandInput placeholder="Type number..." />
                <CommandList>
                    <CommandEmpty>No vehicle found.</CommandEmpty>
                    <CommandGroup>
                        <CommandItem value="All" onSelect={() => { onSelect('All'); onOpenChange(false); }}>
                            <Check className={cn("mr-2 h-4 w-4", value === 'All' ? "opacity-100" : "opacity-0")} />
                            All Vehicles
                        </CommandItem>
                        {vehicles.map(v => (
                            <CommandItem key={v.id} value={v.name} onSelect={() => { onSelect(v.id); onOpenChange(false); }}>
                                <Check className={cn("mr-2 h-4 w-4", value === v.id ? "opacity-100" : "opacity-0")} />
                                {v.name}
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

    const [activeView, setActiveView] = useState<LedgerView>('vehicle');
    const [searchQuery, setSearchQuery] = useState('');
    const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
    const [selectedBsYear, setSelectedBsYear] = useState<string>('All');
    const [selectedBsMonth, setSelectedBsMonth] = useState<string>('All');
    const [filterVehicleId, setFilterVehicleId] = useState<string>('All');
    const [filterPartyId, setFilterPartyId] = useState<string>('All');
    const [filterAccountId, setFilterAccountId] = useState<string>('All');
    const [filterCategory, setFilterCategory] = useState<string>('All');
    const [filterStatus, setFilterStatus] = useState<string>('All');
    const [filterDirection, setFilterDirection] = useState<'All' | 'Income' | 'Expense'>('All');
    const [isVehicleSearchOpen, setIsVehicleSearchOpen] = useState(false);
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
    const accountsById = useMemo(() => new Map(accounts.map(a => [a.id, a.bankName ? `${a.bankName} - ${a.accountNumber}` : a.name])), [accounts]);

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
        if (filterCategory !== 'All') filtered = filtered.filter(t => t.category === filterCategory);
        if (filterDirection !== 'All') filtered = filtered.filter(t => t.direction === filterDirection);
        if (filterStatus === 'Outstanding') filtered = filtered.filter(t => t.status !== 'Paid');
        else if (filterStatus !== 'All') filtered = filtered.filter(t => t.status === filterStatus);
        if (filterAccountId !== 'All') {
            if (filterAccountId === 'CashOnly') filtered = filtered.filter(t => t.billingType === 'Cash');
            else filtered = filtered.filter(t => t.accountId === filterAccountId);
        }
        return filtered;
    }, [processedData, searchQuery, dateRange, selectedBsYear, selectedBsMonth, filterVehicleId, filterPartyId, filterCategory, filterDirection, filterStatus, filterAccountId]);

    const vehicleSummaryRows = useMemo(() => {
        const summaryMap = new Map<string, { id: string, name: string, income: number, expense: number, profit: number, billing: number, settled: number }>();
        vehicles.forEach(v => { summaryMap.set(v.id, { id: v.id, name: v.name, income: 0, expense: 0, profit: 0, billing: 0, settled: 0 }); });
        filteredTransactions.forEach(t => {
            const entry = summaryMap.get(t.vehicleId);
            if (entry) {
                if (t.direction === 'Income') {
                    entry.income += t.amount;
                    if (t.type === 'Sales') entry.billing += t.amount;
                    entry.settled += t.paidAmount;
                } else { entry.expense += t.amount; }
                entry.profit = entry.income - entry.expense;
            }
        });
        return Array.from(summaryMap.values()).map(v => ({ ...v, due: v.billing - v.settled })).filter(v => v.income > 0 || v.expense > 0 || v.id === filterVehicleId).sort((a, b) => b.income - a.income);
    }, [vehicles, filteredTransactions, filterVehicleId]);

    const partnerSummaryRows = useMemo(() => {
        const summaryMap = new Map<string, { id: string, name: string, billing: number, settled: number }>();
        parties.filter(p => p.ownership === 'Sijan' || p.ownership === 'Both').forEach(p => { summaryMap.set(p.id, { id: p.id, name: p.name, billing: 0, settled: 0 }); });
        filteredTransactions.forEach(t => {
            if (t.partyId) {
                const entry = summaryMap.get(t.partyId);
                if (entry) {
                    if (t.type === 'Sales' || t.type === 'Purchase') entry.billing += t.amount;
                    entry.settled += t.paidAmount;
                }
            }
        });
        return Array.from(summaryMap.values()).map(p => ({ ...p, balance: p.billing - p.settled })).filter(p => p.billing !== 0 || p.settled !== 0 || p.id === filterPartyId).sort((a, b) => b.billing - a.billing);
    }, [parties, filteredTransactions, filterPartyId]);

    const handleClearFilters = () => {
        setSearchQuery('');
        setDateRange(undefined);
        const nowBS = new NepaliDate();
        setSelectedBsYear(String(nowBS.getYear()));
        setSelectedBsMonth(String(nowBS.getMonth()));
        setFilterVehicleId('All');
        setFilterPartyId('All');
        setFilterAccountId('All');
        setFilterCategory('All');
        setFilterStatus('All');
        setFilterDirection('All');
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
                <div><h1 className="text-3xl font-bold tracking-tight">Fleet Ledger</h1><p className="text-muted-foreground text-sm">Financial tracking for vehicles and partners.</p></div>
                <div className="flex items-center gap-2">
                    <Button onClick={() => router.push('/fleet/transactions/payment-receipt/new')} size="sm"><PlusCircle className="mr-2 h-4 w-4" /> Pmt. / Rcd. Voucher</Button>
                    <Button onClick={() => router.push('/fleet/transactions/expenses/new')} size="sm" variant="secondary"><Wallet className="mr-2 h-4 w-4" /> Daily Exp. Entry</Button>
                </div>
            </header>

            <Card className="sticky top-0 z-20 shadow-md bg-background/95 backdrop-blur border-primary/20">
                <CardContent className="p-4 space-y-4">
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
                        <div className="space-y-1.5 w-full md:w-[180px]"><Label className="text-[10px] uppercase font-bold text-muted-foreground">Vehicle</Label>
                            <VehicleSearchPopover isOpen={isVehicleSearchOpen} onOpenChange={setIsVehicleSearchOpen} value={filterVehicleId} onSelect={setFilterVehicleId} vehicles={vehicles} vehiclesById={vehiclesById} />
                        </div>
                        <div className="space-y-1.5 w-full md:w-[200px]"><Label className="text-[10px] uppercase font-bold text-muted-foreground">AD Range</Label>
                            <Popover><PopoverTrigger asChild><Button variant="outline" className={cn("h-10 justify-start text-left font-normal bg-white text-xs", !dateRange && "text-muted-foreground")}><CalendarIcon className="mr-2 h-4 w-4" />{dateRange?.from ? (dateRange.to ? (`${format(dateRange.from, 'PP')} - ${format(dateRange.to, 'PP')}`) : format(dateRange.from, 'PP')) : (<span>Pick AD Range</span>)}</Button></PopoverTrigger><PopoverContent className="w-auto p-0" align="start"><DualDateRangePicker selected={dateRange} onSelect={setDateRange} /></PopoverContent></Popover>
                        </div>
                        <div className="space-y-1.5"><Label className="text-[10px] uppercase font-bold text-muted-foreground">Flow</Label>
                            <Select value={filterDirection} onValueChange={(v: any) => setFilterDirection(v)}>
                                <SelectTrigger className="w-[110px] h-10 bg-white text-xs"><SelectValue /></SelectTrigger>
                                <SelectContent><SelectItem value="All">Both</SelectItem><SelectItem value="Income">Income</SelectItem><SelectItem value="Expense">Expense</SelectItem></SelectContent>
                            </Select>
                        </div>
                        <Button variant="ghost" size="icon" onClick={handleClearFilters} className="h-10 w-10 text-muted-foreground"><FilterX className="h-5 w-5" /></Button>
                    </div>
                </CardContent>
            </Card>

            <Tabs value={activeView} onValueChange={(v: any) => setActiveView(v)}>
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                    <TabsList className="grid grid-cols-2 w-full sm:w-[320px]"><TabsTrigger value="vehicle">Vehicle Ledger</TabsTrigger><TabsTrigger value="party">Partner Ledger</TabsTrigger></TabsList>
                    <div className="flex gap-2 w-full sm:w-auto">
                        <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => handleExport('excel')}><FileSpreadsheet className="mr-2 h-3.5 w-3.5 text-emerald-600" /> Export Excel</Button>
                        <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => handleExport('pdf')}><FileText className="mr-2 h-3.5 w-3.5 text-red-600" /> Export PDF</Button>
                    </div>
                </div>

                <TabsContent value="vehicle" className="mt-6 space-y-6">
                    <Card>
                        <CardHeader className="py-4 border-b flex justify-between items-center"><CardTitle>Detailed Log</CardTitle></CardHeader>
                        <CardContent className="p-0">
                            <Table className="text-xs">
                                <TableHeader className="bg-muted/50"><TableRow><TableHead>Date (BS)</TableHead><TableHead>Vehicle</TableHead><TableHead>Category</TableHead><TableHead>Partner</TableHead><TableHead className="text-right">Amount</TableHead><TableHead className="text-right">Settled</TableHead><TableHead className="text-right">Outstanding</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
                                <TableBody>
                                    {filteredTransactions.map(t => (
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
                                            <TableCell className="text-right"><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => router.push(t.voucherId ? `/fleet/transactions/payment-receipt?voucherId=${t.voucherId}` : `/fleet/transactions/purchase/view?id=${t.id}`)}><Eye className="h-4 w-4" /></Button></TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>
                <TabsContent value="party" className="mt-6 space-y-6">
                    <Card>
                        <CardHeader><CardTitle>Partner Summary</CardTitle></CardHeader>
                        <CardContent className="p-0">
                            <Table className="text-xs">
                                <TableHeader className="bg-muted/50"><TableRow><TableHead>Partner Name</TableHead><TableHead className="text-right">Total Billing</TableHead><TableHead className="text-right">Settled</TableHead><TableHead className="text-right">Net Balance</TableHead><TableHead></TableHead></TableRow></TableHeader>
                                <TableBody>
                                    {partnerSummaryRows.map(p => (
                                        <TableRow key={p.id} className="h-14">
                                            <TableCell className="font-bold">{p.name}</TableCell>
                                            <TableCell className="text-right font-mono">Rs. {p.billing.toLocaleString()}</TableCell>
                                            <TableCell className="text-right font-mono text-blue-600">Rs. {p.settled.toLocaleString()}</TableCell>
                                            <TableCell className={cn("text-right font-mono font-bold", p.balance > 0 ? "text-orange-700" : (p.balance < 0 ? "text-blue-700" : "text-muted-foreground/30"))}>
                                                {p.balance < 0 ? <span className="flex items-center justify-end gap-1"><Badge variant="outline" className="text-[9px] h-4 px-1">ADV</Badge>Rs. {Math.abs(p.balance).toLocaleString()}</span> : `Rs. ${p.balance.toLocaleString()}`}
                                            </TableCell>
                                            <TableCell className="text-right"><Button variant="ghost" size="sm" onClick={() => { setFilterPartyId(p.id); setFilterVehicleId('All'); setActiveView('vehicle'); }}><ChevronRight className="h-4 w-4" /></Button></TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}