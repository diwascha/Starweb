'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { Transaction, Vehicle, Party, Account, CompanyProfile } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { 
  Search, 
  ArrowUpDown, 
  MoreHorizontal, 
  FileSpreadsheet, 
  FileText, 
  Loader2, 
  CalendarIcon, 
  FilterX, 
  Truck,
  Users,
  Check,
  ChevronDown,
  Printer,
  Eye,
  Download,
  Edit,
  Wallet,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { format, isWithinInterval, startOfDay, endOfDay, isBefore } from 'date-fns';
import { cn, toNepaliDate, generateId } from '@/lib/utils';
import { onTransactionsUpdate, deleteVoucher } from '@/services/transaction-service';
import { onVehiclesUpdate } from '@/services/vehicle-service';
import { onPartiesUpdate } from '@/services/party-service';
import { onSettingUpdate } from '@/services/settings-service';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { NEPALI_MONTHS, DEFAULT_FLEET_PROFILE } from '@/lib/constants';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { DualDateRangePicker } from '@/components/ui/dual-date-range-picker';
import type { DateRange } from 'react-day-picker';
import NepaliDate from 'nepali-date-converter';
import { LedgerReportPreview } from './_components/ledger-report-preview';

interface LedgerEntry extends Transaction {
    vehicleName: string;
    partyName: string;
    debit: number;
    credit: number;
    balance: number;
    refNo: string;
    categoryDisplay: string;
    lineItemsSummary: string;
}

const SearchableMultiSelect = ({ label, values, onSelect, items, placeholder, icon: Icon }: any) => {
    const isAll = values.length === 0;

    const toggleItem = (id: string) => {
        if (id === 'All') {
            onSelect([]);
            return;
        }
        const next = values.includes(id)
            ? values.filter((v: string) => v !== id)
            : [...values, id];
        onSelect(next);
    };

    const displayText = isAll
        ? `All ${placeholder}s`
        : values.length === 1
            ? items.find((i: any) => i.id === values[0])?.name || values[0]
            : `${values.length} ${placeholder}s Selected`;

    return (
        <div className="space-y-1.5 flex-1 min-w-[200px]">
            <Label className="text-[11px] font-bold text-muted-foreground uppercase tracking-tight">{label}</Label>
            <Popover>
                <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-between h-9 bg-white border-gray-200 shadow-none font-normal text-xs px-3">
                        <div className="flex items-center gap-2 overflow-hidden">
                            <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <span className="truncate">{displayText}</span>
                        </div>
                        <ChevronDown className="h-3 w-3 opacity-50 shrink-0" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="p-0 w-[--radix-popover-trigger-width]">
                    <Command>
                        <div className="flex items-center border-b px-3" cmdk-input-wrapper="">
                            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                            <input 
                                placeholder={`Search ${placeholder.toLowerCase()}...`} 
                                className="flex h-9 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
                            />
                        </div>
                        <CommandList>
                            <CommandEmpty>No results found.</CommandEmpty>
                            <CommandGroup>
                                <CommandItem value="All" onSelect={() => toggleItem('All')}>
                                    <Check className={cn("mr-2 h-4 w-4", isAll ? "opacity-100" : "opacity-0")} />
                                    All {placeholder}s
                                </CommandItem>
                                {items.map((item: any) => (
                                    <CommandItem key={item.id} value={item.name} onSelect={() => toggleItem(item.id)}>
                                        <Check className={cn("mr-2 h-4 w-4", values.includes(item.id) ? "opacity-100" : "opacity-0")} />
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
};

export default function FleetTransactionsPage() {
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [parties, setParties] = useState<Party[]>([]);
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [fleetProfile, setFleetProfile] = useState<CompanyProfile>(DEFAULT_FLEET_PROFILE);
    const [isLoading, setIsLoading] = useState(true);
    const router = useRouter();
    const { toast } = useToast();
    const { user } = useAuth();

    // ERP Filter State
    const [filterParties, setFilterParties] = useState<string[]>([]);
    const [filterVehicles, setFilterVehicles] = useState<string[]>([]);
    const [filterBillingTypes, setFilterBillingTypes] = useState<string[]>([]);
    const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
    const [selectedBsYear, setSelectedBsYear] = useState<string>('All');
    const [selectedBsMonth, setSelectedBsMonth] = useState<string>('All');
    const [filterCategory, setFilterCategory] = useState('All');
    const [globalSearch, setUsageSearch] = useState('');
    
    // Reporting UI State
    const [isPreviewOpen, setIsPreviewOpen] = useState(false);

    useEffect(() => {
        setIsLoading(true);
        const unsubs = [
            onTransactionsUpdate(setTransactions),
            onVehiclesUpdate(setVehicles),
            onPartiesUpdate(setParties),
            onSettingUpdate('fleetCompanyProfile', (s) => { if (s?.value) setFleetProfile(s.value); }),
            onSettingUpdate('accounts', (s) => { if (s?.value) setAccounts(s.value); })
        ];
        
        // Use service layer getters for initial load
        import('@/services/account-service').then(m => m.getAccounts(true).then(setAccounts));

        setIsLoading(false);
        return () => unsubs.forEach(u => u());
    }, []);

    const vehiclesById = useMemo(() => new Map(vehicles.map(v => [v.id, v.name])), [vehicles]);
    const partiesById = useMemo(() => new Map(parties.map(p => [p.id, p.name])), [parties]);
    const categories = useMemo(() => Array.from(new Set(transactions.map(t => t.category || (t.type === 'Sales' ? 'Freight' : t.type)))).filter(Boolean).sort(), [transactions]);

    const availableYears = useMemo(() => {
        const years = new Set<number>();
        transactions.forEach(t => {
            try {
                years.add(new NepaliDate(new Date(t.date)).getYear());
            } catch {}
        });
        return Array.from(years).sort((a, b) => b - a);
    }, [transactions]);

    const sijanBankAccounts = useMemo(() => accounts.filter(a => a.type === 'Bank' && (a.ownership === 'Sijan' || a.ownership === 'Both')), [accounts]);

    const handleResetFilters = () => {
        setFilterParties([]);
        setFilterVehicles([]);
        setFilterBillingTypes([]);
        setDateRange(undefined);
        setSelectedBsYear('All');
        setSelectedBsMonth('All');
        setFilterCategory('All');
        setUsageSearch('');
    };

    const ledgerData = useMemo(() => {
        const rawMapped = transactions.map(t => {
            const isDebit = t.type === 'Payment' || t.type === 'Sales';
            const isCredit = t.type === 'Purchase' || t.type === 'Receipt';
            
            const amount = Number(t.amount) || 0;
            return {
                ...t,
                debit: isDebit ? amount : 0,
                credit: isCredit ? amount : 0,
                vehicleName: vehiclesById.get(t.vehicleId) || 'N/A',
                partyName: t.partyId ? partiesById.get(t.partyId) || 'Unassigned' : 'Unassigned',
                refNo: t.purchaseNumber || t.referenceId || (t.tripId ? 'Trip' : 'JV'),
                categoryDisplay: (t.category || (t.type === 'Sales' ? 'Freight' : t.type)).toUpperCase(),
                lineItemsSummary: (t.items || []).map(i => i.particular).join(', ')
            };
        });

        rawMapped.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        const matchesNonDateFilters = (t: any) => {
            if (filterParties.length > 0 && (!t.partyId || !filterParties.includes(t.partyId))) return false;
            if (filterVehicles.length > 0 && !filterVehicles.includes(t.vehicleId)) return false;
            
            if (filterBillingTypes.length > 0) {
                const isMatched = filterBillingTypes.some(val => {
                    if (val === 'Cash') return t.billingType === 'Cash';
                    if (val === 'Credit') return t.billingType === 'Credit';
                    return t.accountId === val;
                });
                if (!isMatched) return false;
            }

            if (filterCategory !== 'All' && t.categoryDisplay !== filterCategory.toUpperCase()) return false;
            if (globalSearch) {
                const q = globalSearch.toLowerCase();
                if (!(t.vehicleName.toLowerCase().includes(q) || 
                    t.partyName.toLowerCase().includes(q) || 
                    t.refNo.toLowerCase().includes(q) || 
                    (t.remarks || '').toLowerCase().includes(q) ||
                    t.lineItemsSummary.toLowerCase().includes(q))) return false;
            }
            return true;
        };

        let filtered = rawMapped.filter(t => {
            if (!matchesNonDateFilters(t)) return false;
            
            const tDate = new Date(t.date);
            
            if (selectedBsYear !== 'All') {
                try {
                    const nd = new NepaliDate(tDate);
                    if (nd.getYear() !== parseInt(selectedBsYear)) return false;
                    if (selectedBsMonth !== 'All' && nd.getMonth() !== parseInt(selectedBsMonth)) return false;
                } catch { return false; }
            }
            
            if (dateRange?.from) {
                if (isBefore(tDate, startOfDay(dateRange.from))) return false;
            }
            if (dateRange?.to) {
                if (isBefore(endOfDay(dateRange.to), tDate)) return false;
            }
            
            return true;
        });

        let openingBalance = 0;
        let earliestDateRequested: Date | null = null;

        if (dateRange?.from) {
            earliestDateRequested = startOfDay(dateRange.from);
        }
        if (selectedBsYear !== 'All') {
            const m = selectedBsMonth !== 'All' ? parseInt(selectedBsMonth) : 0;
            const ndStart = new NepaliDate(parseInt(selectedBsYear), m, 1).toJsDate();
            if (!earliestDateRequested || isBefore(ndStart, earliestDateRequested)) {
                earliestDateRequested = ndStart;
            }
        }

        if (earliestDateRequested) {
            openingBalance = rawMapped
                .filter(matchesNonDateFilters)
                .filter(t => isBefore(new Date(t.date), earliestDateRequested!))
                .reduce((sum, t) => sum + (t.debit - t.credit), 0);
        }

        let runningBalance = openingBalance;
        const processed = filtered.map(t => {
            runningBalance += (t.debit - t.credit);
            return { 
                ...t, 
                balance: runningBalance
            };
        });

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
                closing: runningBalance,
                count: processed.length
            }
        };
    }, [transactions, filterParties, filterVehicles, filterBillingTypes, selectedBsYear, selectedBsMonth, dateRange, filterCategory, globalSearch, vehiclesById, partiesById]);

    const handleExport = async (type: 'excel' | 'pdf') => {
        const periodStr = dateRange?.from ? `${toNepaliDate(dateRange.from.toISOString())} - ${dateRange.to ? toNepaliDate(dateRange.to.toISOString()) : 'Present'}` : 'All Time';
        const partyStr = filterParties.length === 0 ? 'All Parties' : filterParties.length === 1 ? partiesById.get(filterParties[0]) : `${filterParties.length} Parties`;
        const vehicleStr = filterVehicles.length === 0 ? 'All Vehicles' : filterVehicles.length === 1 ? vehiclesById.get(filterVehicles[0]) : `${filterVehicles.length} Vehicles`;
        const nowStr = format(new Date(), 'PPP p');

        if (type === 'excel') {
            const XLSX = await import('xlsx');
            const data = [
                [fleetProfile.nameEn.toUpperCase()],
                [fleetProfile.address],
                [`PAN: ${fleetProfile.pan}`],
                [`Report Generated: ${nowStr}`],
                [],
                ['REPORT:', 'FLEET TRANSACTION LEDGER'],
                ['PERIOD:', periodStr],
                ['ENTITIES:', `${partyStr} | ${vehicleStr}`],
                [],
                ['Date (BS)', 'Ref No.', 'Particulars', 'Vehicle', 'Category', 'Debit (Dr)', 'Credit (Cr)', 'Balance'],
                ['', '', 'Balance B/F', '', '', '', '', `${Math.abs(ledgerData.stats.opening).toFixed(2)} ${ledgerData.stats.opening >= 0 ? 'Dr' : 'Cr'}`],
                ...ledgerData.entries.map(e => [
                    toNepaliDate(e.date), e.refNo, `${e.remarks || e.type} (${e.lineItemsSummary})`, e.vehicleName, e.categoryDisplay, 
                    e.debit || 0, e.credit || 0, `${Math.abs(e.balance).toFixed(2)} ${e.balance >= 0 ? 'Dr' : 'Cr'}`
                ]),
                ['', '', 'Total Period', '', '', ledgerData.stats.debit.toFixed(2), ledgerData.stats.credit.toFixed(2), ''],
                ['', '', 'Closing Balance', '', '', '', '', `${Math.abs(ledgerData.stats.closing).toFixed(2)} ${ledgerData.stats.closing >= 0 ? 'Dr' : 'Cr'}`]
            ];
            const ws = XLSX.utils.aoa_to_sheet(data);
            
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Ledger");
            XLSX.writeFile(wb, `Ledger_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
        } else {
            const { jsPDF } = await import('jspdf');
            const { default: autoTable } = await import('jspdf-autotable');
            const doc = new jsPDF('l', 'mm', 'a4');
            
            doc.setFontSize(18); doc.setTextColor(0, 0, 0);
            doc.text(fleetProfile.nameEn.toUpperCase(), 14, 15);
            doc.setFontSize(9); doc.setTextColor(100);
            doc.text(`${fleetProfile.address} | PAN: ${fleetProfile.pan}`, 14, 21);
            
            doc.setFontSize(12); doc.setTextColor(0);
            doc.text('FLEET TRANSACTION LEDGER', 14, 30);
            
            doc.setFontSize(9); doc.setTextColor(100);
            doc.text(`Period: ${periodStr}`, 14, 36);
            doc.text(`Filters: ${partyStr} | ${vehicleStr} | Category: ${filterCategory}`, 14, 41);
            doc.text(`Report Generated: ${nowStr}`, 14, 46);
            
            autoTable(doc, {
                startY: 53,
                head: [['Date (BS)', 'Ref No.', 'Particulars / Description', 'Vehicle', 'Category', 'Debit (Dr)', 'Credit (Cr)', 'Balance']],
                body: [
                    ['', '', 'Balance B/F (Opening)', '-', '-', '-', '-', `${Math.abs(ledgerData.stats.opening).toLocaleString(undefined, {minimumFractionDigits: 2})} ${ledgerData.stats.opening >= 0 ? 'Dr' : 'Cr'}`],
                    ...ledgerData.entries.map(e => [
                        toNepaliDate(e.date), e.refNo, `${e.remarks || e.type}\n${e.lineItemsSummary}`, e.vehicleName, e.categoryDisplay,
                        e.debit ? e.debit.toLocaleString(undefined, {minimumFractionDigits: 2}) : '-', e.credit ? e.credit.toLocaleString(undefined, {minimumFractionDigits: 2}) : '-',
                        `${Math.abs(e.balance).toLocaleString(undefined, {minimumFractionDigits: 2})} ${e.balance >= 0 ? 'Dr' : 'Cr'}`
                    ])
                ],
                theme: 'grid',
                headStyles: { fillColor: [40, 40, 40], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
                bodyStyles: { fontSize: 7, textColor: [0, 0, 0] },
                alternateRowStyles: { fillColor: [245, 245, 245] },
                columnStyles: {
                    2: { cellWidth: 70 },
                    5: { halign: 'right' },
                    6: { halign: 'right' },
                    7: { halign: 'right', fontStyle: 'bold' }
                },
                didDrawPage: (data) => {
                    doc.setFontSize(7);
                    doc.text(`Page ${doc.internal.getNumberOfPages()}`, doc.internal.pageSize.width - 20, doc.internal.pageSize.height - 10);
                }
            });
            doc.save(`Ledger_Report_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
        }
    };

    const isFiltered = useMemo(() => {
        return filterParties.length > 0 || 
               filterVehicles.length > 0 || 
               filterBillingTypes.length > 0 ||
               !!dateRange || 
               selectedBsYear !== 'All' || 
               selectedBsMonth !== 'All' ||
               filterCategory !== 'All' || 
               globalSearch !== '';
    }, [filterParties, filterVehicles, filterBillingTypes, dateRange, selectedBsYear, selectedBsMonth, filterCategory, globalSearch]);

    const sourceFilterItems = useMemo(() => {
        return [
            { id: 'Cash', name: 'Cash' },
            { id: 'Credit', name: 'Credit' },
            ...sijanBankAccounts.map(a => ({ 
                id: a.id, 
                name: `${a.bankName || a.name}${a.accountNumber ? ` (${a.accountNumber})` : ''}` 
            }))
        ];
    }, [sijanBankAccounts]);

    return (
        <div className="flex flex-col gap-6 max-w-[1600px] mx-auto">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <h1 className="text-2xl font-bold tracking-tight">Sijan Reports</h1>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" className="h-9 gap-2 shadow-sm border-gray-200" onClick={() => setIsPreviewOpen(true)}>
                        <Eye className="h-4 w-4 text-blue-600" /> Preview & Print
                    </Button>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="sm" className="h-9 gap-2 shadow-sm border-gray-200">
                                <Download className="h-4 w-4" /> Export Report <ChevronDown className="h-3 w-3 opacity-50" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => handleExport('excel')}>
                                <FileSpreadsheet className="h-4 w-4 mr-2 text-emerald-600" /> Excel (.xlsx)
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => handleExport('pdf')}>
                                <FileText className="h-4 w-4 mr-2 text-red-600" /> PDF (.pdf)
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>

            <Card className="shadow-sm border-gray-100 bg-white overflow-visible">
                <CardContent className="p-5 flex flex-wrap items-end gap-4">
                    <SearchableMultiSelect 
                        label="Parties" 
                        values={filterParties} 
                        onSelect={setFilterParties} 
                        items={parties.filter(p => p.ownership === 'Sijan' || p.ownership === 'Both')} 
                        placeholder="Party" 
                        icon={Users} 
                    />
                    <SearchableMultiSelect 
                        label="Vehicles" 
                        values={filterVehicles} 
                        onSelect={setFilterVehicles} 
                        items={vehicles} 
                        placeholder="Vehicle" 
                        icon={Truck} 
                    />
                    
                    <SearchableMultiSelect 
                        label="Modes of Payment" 
                        values={filterBillingTypes} 
                        onSelect={setFilterBillingTypes} 
                        items={sourceFilterItems} 
                        placeholder="Payment Mode" 
                        icon={Wallet} 
                    />
                    
                    <div className="space-y-1.5 flex-1 min-w-[120px]">
                        <Label className="text-[11px] font-bold text-muted-foreground uppercase tracking-tight">Year (BS)</Label>
                        <Select value={selectedBsYear} onValueChange={setSelectedBsYear}>
                            <SelectTrigger className="h-9 bg-white border-gray-200 shadow-none">
                                <SelectValue placeholder="Year" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="All">All Years</SelectItem>
                                {availableYears.map(year => (
                                    <SelectItem key={year} value={String(year)}>{year}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-1.5 flex-1 min-w-[140px]">
                        <Label className="text-[11px] font-bold text-muted-foreground uppercase tracking-tight">Month (BS)</Label>
                        <Select value={selectedBsMonth} onValueChange={setSelectedBsMonth}>
                            <SelectTrigger className="h-9 bg-white border-gray-200 shadow-none">
                                <SelectValue placeholder="Month" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="All">All Months</SelectItem>
                                {NEPALI_MONTHS.map(month => (
                                    <SelectItem key={month.value} value={String(month.value)}>{month.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-1.5 min-w-[160px]">
                        <Label className="text-[11px] font-bold text-muted-foreground uppercase tracking-tight">AD Range</Label>
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button variant="outline" className="w-full justify-between h-9 bg-white border-gray-200 shadow-none font-normal text-xs px-3">
                                    <div className="flex items-center gap-2 overflow-hidden">
                                        <CalendarIcon className="h-3.5 w-3.5 opacity-50 shrink-0" />
                                        <span className="truncate">
                                            {dateRange?.from ? (
                                                dateRange.to ? `${format(dateRange.from, "MMM d")} - ${format(dateRange.to, "MMM d")}` : format(dateRange.from, "MMM d")
                                            ) : 'Pick AD Range'}
                                        </span>
                                    </div>
                                    <ChevronDown className="h-3 w-3 opacity-50 shrink-0" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                                <DualDateRangePicker selected={dateRange} onSelect={setDateRange} />
                            </PopoverContent>
                        </Popover>
                    </div>

                    <div className="flex gap-2 shrink-0">
                        {isFiltered && (
                            <Button variant="ghost" className="h-9 px-4 text-muted-foreground hover:bg-gray-50 border-dashed" onClick={handleResetFilters}>
                                <FilterX className="mr-2 h-4 w-4" /> Reset
                            </Button>
                        )}
                    </div>
                </CardContent>
            </Card>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                {[
                    { label: 'Opening Balance', value: ledgerData.stats.opening, color: ledgerData.stats.opening >= 0 ? 'text-blue-600' : 'text-red-600' },
                    { label: 'Total Debit', value: ledgerData.stats.debit, color: 'text-gray-900' },
                    { label: 'Total Credit', value: ledgerData.stats.credit, color: 'text-gray-900' },
                    { label: 'Net Period', value: ledgerData.stats.net, color: ledgerData.stats.net >= 0 ? 'text-blue-600' : 'text-red-600' },
                    { label: 'Total Transactions', value: ledgerData.stats.count, color: 'text-gray-900', suffix: '' },
                ].map((stat, i) => (
                    <Card key={i} className="shadow-none border-gray-100 py-3 text-center bg-gray-50/30">
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">{stat.label}</p>
                        <p className={cn("text-sm font-black tabular-nums", stat.color)}>
                            {stat.suffix !== '' ? 'NPR ' : ''}{Math.abs(Number(stat.value)).toLocaleString(undefined, { minimumFractionDigits: stat.suffix === '' ? 0 : 2 })}
                            {stat.suffix !== '' && (Number(stat.value) >= 0 ? ' Dr' : ' Cr')}
                        </p>
                    </Card>
                ))}
                <Card className="shadow-none border-red-100 py-3 text-center bg-red-50/40 border-l-4 border-l-red-500">
                    <p className="text-[10px] font-bold text-red-600/70 uppercase tracking-wider mb-1">Closing Balance</p>
                    <p className="text-sm font-black text-red-600 tabular-nums">
                        NPR {Math.abs(ledgerData.stats.closing).toLocaleString(undefined, { minimumFractionDigits: 2 })} {ledgerData.stats.closing >= 0 ? 'Dr' : 'Cr'}
                    </p>
                </Card>
            </div>

            <Card className="shadow-sm border-gray-100 bg-white">
                <div className="flex flex-col sm:flex-row items-center justify-between border-b px-5 py-2 gap-4">
                    <div className="h-10 flex items-center gap-4 flex-1">
                        <h3 className="font-bold text-sm text-gray-900 uppercase tracking-tight whitespace-nowrap">Detailed Ledger Log</h3>
                        <div className="w-[180px]">
                            <Select value={filterCategory} onValueChange={setFilterCategory}>
                                <SelectTrigger className="h-9 bg-gray-50 border-gray-200 shadow-none text-xs">
                                    <SelectValue placeholder="Category" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="All">All Categories</SelectItem>
                                    {categories.map((cat: any) => (
                                        <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <div className="relative w-full sm:w-[350px]">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input 
                            placeholder="Search narration, ref no..." 
                            className="pl-9 h-9 bg-gray-50 border-gray-200 shadow-none focus-visible:bg-white text-sm"
                            value={globalSearch}
                            onChange={(e) => setUsageSearch(e.target.value)}
                        />
                    </div>
                </div>

                <div className="p-0 m-0">
                    <ScrollArea className="w-full">
                        <Table className="text-[12px]">
                            <TableHeader className="bg-blue-50/30">
                                <TableRow className="hover:bg-transparent h-12">
                                    <TableHead className="w-[120px] font-bold text-blue-900">Date (BS)</TableHead>
                                    <TableHead className="w-[120px] font-bold text-blue-900">Ref. No.</TableHead>
                                    <TableHead className="min-w-[300px] font-bold text-blue-900">Particulars / Description</TableHead>
                                    <TableHead className="w-[150px] font-bold text-blue-900">
                                        <div className="flex items-center gap-1">
                                            <Truck className="h-3.5 w-3.5" />
                                            <span>Vehicle</span>
                                        </div>
                                    </TableHead>
                                    <TableHead className="w-[140px] font-bold text-blue-900">Category</TableHead>
                                    <TableHead className="text-right w-[140px] font-bold text-blue-900">Debit (Dr)</TableHead>
                                    <TableHead className="text-right w-[140px] font-bold text-blue-900">Credit (Cr)</TableHead>
                                    <TableHead className="text-right w-[160px] font-bold text-blue-900">Balance</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody className="bg-white">
                                <TableRow className="bg-gray-50/30 font-medium h-12">
                                    <TableCell colSpan={2}></TableCell>
                                    <TableCell className="font-bold text-blue-700 italic">Balance B/F (Opening)</TableCell>
                                    <TableCell className="text-center">-</TableCell>
                                    <TableCell className="text-center">-</TableCell>
                                    <TableCell className="text-right">-</TableCell>
                                    <TableCell className="text-right">-</TableCell>
                                    <TableCell className="text-right font-black">
                                        {Math.abs(ledgerData.stats.opening).toLocaleString(undefined, { minimumFractionDigits: 2 })} {ledgerData.stats.opening >= 0 ? 'Dr' : 'Cr'}
                                    </TableCell>
                                </TableRow>

                                {ledgerData.entries.map((entry) => (
                                    <TableRow key={entry.id} className="h-14 border-b border-gray-100 hover:bg-gray-50/50 transition-colors">
                                        <TableCell className="text-gray-600">{toNepaliDate(entry.date)}</TableCell>
                                        <TableCell>
                                            <Button variant="link" className="p-0 h-auto font-bold text-blue-600" onClick={() => router.push(entry.voucherId ? `/fleet/transactions/payment-receipt?voucherId=${entry.voucherId}` : `/fleet/transactions/purchase/view?id=${entry.id}`)}>
                                                {entry.refNo}
                                            </Button>
                                        </TableCell>
                                        <TableCell className="py-3">
                                            <div className="flex flex-col gap-1">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-semibold text-gray-900 leading-tight">
                                                        {entry.partyName}
                                                    </span>
                                                    <span className="text-[10px] text-muted-foreground uppercase font-medium">
                                                        {entry.remarks || entry.type}
                                                    </span>
                                                </div>
                                                <div className="text-[10px] text-muted-foreground italic leading-relaxed line-clamp-2 max-w-[400px]">
                                                    {entry.lineItemsSummary}
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <span className="text-[11px] font-bold text-blue-900 uppercase tracking-tight">
                                                {entry.vehicleName}
                                            </span>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant="outline" className={cn(
                                                "text-[10px] font-black border-none px-2 py-0.5 shadow-none",
                                                entry.debit > 0 ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"
                                            )}>
                                                {entry.categoryDisplay}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-right font-bold text-red-500 tabular-nums">{entry.debit > 0 ? entry.debit.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '-'}</TableCell>
                                        <TableCell className="text-right font-bold text-emerald-600 tabular-nums">{entry.credit > 0 ? entry.credit.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '-'}</TableCell>
                                        <TableCell className="text-right font-black tabular-nums">
                                            <div className="flex items-center justify-end gap-2 group/balance">
                                                <span>
                                                    {Math.abs(entry.balance).toLocaleString(undefined, { minimumFractionDigits: 2 })} {entry.balance >= 0 ? 'Dr' : 'Cr'}
                                                </span>
                                                <Button 
                                                    variant="ghost" 
                                                    size="icon" 
                                                    className="h-3 w-3 opacity-0 group-hover/balance:opacity-100 transition-opacity"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        router.push(entry.voucherId ? `/fleet/transactions/payment-receipt/edit?voucherId=${entry.voucherId}` : `/fleet/transactions/purchase/edit?id=${entry.id}`);
                                                    }}
                                                >
                                                    <Edit className="h-3 w-3" />
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}

                                {!isLoading && ledgerData.entries.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={8} className="text-center py-24 text-muted-foreground italic">
                                            No transactions found matching your criteria.
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                            <TableFooter className="bg-gray-50/50">
                                <TableRow className="h-12 border-t-2 border-gray-200 hover:bg-transparent">
                                    <TableCell colSpan={5} className="text-right font-bold text-gray-900 text-sm">Total Period Movement</TableCell>
                                    <TableCell className="text-right font-black text-red-600 text-sm">{ledgerData.stats.debit.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                    <TableCell className="text-right font-black text-emerald-700 text-sm">{ledgerData.stats.credit.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                    <TableCell colSpan={1} className="text-right pr-10 font-bold">
                                        Net: {Math.abs(ledgerData.stats.net).toLocaleString(undefined, { minimumFractionDigits: 2 })} {ledgerData.stats.net >= 0 ? 'Dr' : 'Cr'}
                                    </TableCell>
                                </TableRow>
                            </TableFooter>
                        </Table>
                        <ScrollBar orientation="horizontal" />
                    </ScrollArea>
                </div>
            </Card>

            <LedgerReportPreview 
                isOpen={isPreviewOpen}
                onOpenChange={setIsPreviewOpen}
                ledgerData={ledgerData}
                fleetProfile={fleetProfile}
                filters={{
                    period: dateRange?.from ? `${toNepaliDate(dateRange.from.toISOString())} - ${dateRange.to ? toNepaliDate(dateRange.to.toISOString()) : 'Present'}` : 'All Time',
                    parties: filterParties.length === 0 ? 'All' : filterParties.map(id => partiesById.get(id)).join(', '),
                    vehicles: filterVehicles.length === 0 ? 'All' : filterVehicles.map(id => vehiclesById.get(id)).join(', '),
                }}
            />
        </div>
    );
}
