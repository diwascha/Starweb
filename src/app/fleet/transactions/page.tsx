'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import type { Transaction, Vehicle, Party, Account, CompanyProfile } from '@/lib/types';
import { Button } from '@/components/ui/button';
import {
  Search,
  FileSpreadsheet,
  FileText,
  CalendarIcon,
  FilterX,
  Truck,
  Users,
  Check,
  ChevronDown,
  Eye,
  Download,
  Wallet,
  ChevronLeft,
  ChevronRight,
  Trash2,
  MoreHorizontal,
  SlidersHorizontal,
  Pencil,
} from 'lucide-react';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
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
} from '@/components/ui/alert-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { isBefore, startOfDay, endOfDay, format, subDays } from 'date-fns';
import { cn, toNepaliDate } from '@/lib/utils';
import { onTransactionsUpdate, deleteVoucher, deleteTransaction } from '@/services/transaction-service';
import { onVehiclesUpdate } from '@/services/vehicle-service';
import { onPartiesUpdate } from '@/services/party-service';
import { onSettingUpdate } from '@/services/settings-service';
import { onAccountsUpdate } from '@/services/account-service';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { NEPALI_MONTHS, DEFAULT_FLEET_PROFILE } from '@/lib/constants';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { DualDateRangePicker } from '@/components/ui/dual-date-range-picker';
import type { DateRange } from 'react-day-picker';
import NepaliDate from 'nepali-date-converter';
import { LedgerReportPreview } from './_components/ledger-report-preview';

/** Multi-select with a real (cmdk-wired) search box. */
const SearchableMultiSelect = ({ label, values, onSelect, items, placeholder, icon: Icon }: any) => {
    const isAll = values.length === 0;

    const toggleItem = (id: string) => {
        if (id === 'All') return onSelect([]);
        const next = values.includes(id) ? values.filter((v: string) => v !== id) : [...values, id];
        onSelect(next);
    };

    const displayText = isAll
        ? `All ${placeholder}s`
        : values.length === 1
            ? items.find((i: any) => String(i.id) === values[0])?.name || values[0]
            : `${values.length} selected`;

    return (
        <div className="space-y-1.5">
            <Label className="text-[11px] font-medium text-muted-foreground">{label}</Label>
            <Popover>
                <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-between h-9 font-normal text-xs px-3">
                        <span className="flex items-center gap-2 overflow-hidden text-left">
                            <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <span className="truncate">{displayText}</span>
                        </span>
                        <ChevronDown className="h-3 w-3 opacity-50 shrink-0" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="p-0 w-[--radix-popover-trigger-width]">
                    <Command>
                        <CommandInput placeholder={`Search ${placeholder.toLowerCase()}...`} />
                        <CommandList>
                            <CommandEmpty>No {placeholder.toLowerCase()}s found.</CommandEmpty>
                            <CommandGroup>
                                <CommandItem value="All Selection" onSelect={() => toggleItem('All')}>
                                    <Check className={cn('mr-2 h-4 w-4', isAll ? 'opacity-100' : 'opacity-0')} />
                                    All {placeholder}s
                                </CommandItem>
                                {items.map((item: any) => (
                                    <CommandItem key={item.id} value={item.name} onSelect={() => toggleItem(String(item.id))}>
                                        <Check className={cn('mr-2 h-4 w-4', values.includes(String(item.id)) ? 'opacity-100' : 'opacity-0')} />
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
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(10);
    const router = useRouter();
    const { toast } = useToast();

    const [filterParties, setFilterParties] = useState<string[]>([]);
    const [filterVehicles, setFilterVehicles] = useState<string[]>([]);
    const [filterBillingTypes, setFilterBillingTypes] = useState<string[]>([]);
    const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
    // BS period tokens: 'YYYY' = full year, 'YYYY-M' = specific month. Empty = all time.
    const [bsPeriods, setBsPeriods] = useState<string[]>([]);
    const [filterCategory, setFilterCategory] = useState('All');
    const [globalSearch, setGlobalSearch] = useState('');

    const [filtersOpen, setFiltersOpen] = useState(true);
    const [isPreviewOpen, setIsPreviewOpen] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<any | null>(null);

    useEffect(() => {
        setIsLoading(true);
        const unsubs = [
            onTransactionsUpdate((t) => { setTransactions(t); setIsLoading(false); }),
            onVehiclesUpdate(setVehicles),
            onPartiesUpdate(setParties),
            onAccountsUpdate(setAccounts),
            onSettingUpdate('fleetCompanyProfile', (s) => { if (s?.value) setFleetProfile(s.value); }),
        ];
        return () => unsubs.forEach(unsub => unsub());
    }, []);

    useEffect(() => {
        setCurrentPage(1);
    }, [filterParties, filterVehicles, filterBillingTypes, bsPeriods, dateRange, filterCategory, globalSearch, itemsPerPage]);

    const vehiclesById = useMemo(() => new Map(vehicles.map(v => [v.id, v.name])), [vehicles]);
    const partiesById = useMemo(() => new Map(parties.map(p => [p.id, p.name])), [parties]);
    const accountsById = useMemo(() => new Map(accounts.map(a => [a.id, a.bankName || a.name])), [accounts]);
    const categories = useMemo(() => Array.from(new Set(transactions.map(t => t.category || (t.type === 'Sales' ? 'Freight' : t.type)))).filter(Boolean).sort(), [transactions]);

    const availableYears = useMemo(() => {
        const years = new Set<number>();
        transactions.forEach(t => { try { years.add(new NepaliDate(new Date(t.date)).getYear()); } catch {} });
        return Array.from(years).sort((a, b) => b - a);
    }, [transactions]);

    const sijanBankAccounts = useMemo(() => accounts.filter(a => a.type === 'Bank' && (a.ownership === 'Sijan' || a.ownership === 'Both')), [accounts]);

    const handleResetFilters = () => {
        setFilterParties([]);
        setFilterVehicles([]);
        setFilterBillingTypes([]);
        setDateRange(undefined);
        setBsPeriods([]);
        setFilterCategory('All');
        setGlobalSearch('');
    };

    const ledgerData = useMemo(() => {
        // 1) Map each raw transaction leg.
        const rawMapped = transactions.map(t => {
            const isDebit = t.type === 'Payment' || t.type === 'Sales';
            const isCredit = t.type === 'Purchase' || t.type === 'Receipt';
            const amount = Number(t.amount) || 0;
            return {
                ...t,
                debit: isDebit ? amount : 0,
                credit: isCredit ? amount : 0,
                vehicleName: vehiclesById.get(t.vehicleId || '') || 'N/A',
                partyName: t.partyId ? partiesById.get(t.partyId) || 'Unassigned' : 'Unassigned',
                refNo: t.purchaseNumber || t.referenceId || (t.tripId ? 'Trip' : 'JV'),
                categoryDisplay: (t.category || (t.type === 'Sales' ? 'Freight' : t.type)).toUpperCase(),
                lineItemsSummary: (t.items || []).map(i => i.particular).join(', '),
            };
        });

        // 2) Group legs that belong to the same voucher into a single ledger row.
        //    A Mixed payment (cash + bank legs) collapses to one row whose
        //    debit/credit is the SUM of its legs — no more duplicate-looking rows.
        const groups = new Map<string, typeof rawMapped>();
        for (const t of rawMapped) {
            const key = t.voucherId || t.id;
            const arr = groups.get(key);
            if (arr) arr.push(t);
            else groups.set(key, [t]);
        }

        let vouchers = Array.from(groups.entries()).map(([key, legs]) => {
            const rep = legs[0];
            const debit = legs.reduce((s, l) => s + l.debit, 0);
            const credit = legs.reduce((s, l) => s + l.credit, 0);
            const modes = new Set(
                legs.map(l => (l.accountId ? (accountsById.get(l.accountId) || 'Bank') : (l.billingType || 'Cash')))
            );
            return { ...rep, id: key, rowKey: key, debit, credit, legs, modeSummary: Array.from(modes).join(' + ') };
        });

        // Ascending for correct running-balance math.
        vouchers.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        const matchesNonDate = (v: any) => {
            if (filterParties.length > 0 && (!v.partyId || !filterParties.includes(v.partyId))) return false;
            if (filterVehicles.length > 0 && !filterVehicles.includes(v.vehicleId)) return false;
            if (filterBillingTypes.length > 0) {
                const anyLeg = v.legs.some((l: any) => filterBillingTypes.some(val => {
                    if (val === 'Cash') return l.billingType === 'Cash';
                    if (val === 'Credit') return l.billingType === 'Credit';
                    return l.accountId === val;
                }));
                if (!anyLeg) return false;
            }
            if (filterCategory !== 'All' && v.categoryDisplay !== filterCategory.toUpperCase()) return false;
            if (globalSearch) {
                const q = globalSearch.toLowerCase();
                if (!(v.vehicleName.toLowerCase().includes(q) ||
                    v.partyName.toLowerCase().includes(q) ||
                    v.refNo.toLowerCase().includes(q) ||
                    (v.remarks || '').toLowerCase().includes(q) ||
                    v.lineItemsSummary.toLowerCase().includes(q))) return false;
            }
            return true;
        };

        const inDateWindow = (v: any) => {
            const d = new Date(v.date);
            // BS period tokens (multi-select). Empty = no BS restriction.
            if (bsPeriods.length > 0) {
                let nd: NepaliDate;
                try { nd = new NepaliDate(d); } catch { return false; }
                const y = nd.getYear();
                const m = nd.getMonth();
                const matches = bsPeriods.some(tok => {
                    if (tok.includes('-')) {
                        const [ty, tm] = tok.split('-').map(Number);
                        return y === ty && m === tm;
                    }
                    return y === Number(tok);
                });
                if (!matches) return false;
            }
            if (dateRange?.from && isBefore(d, startOfDay(dateRange.from))) return false;
            if (dateRange?.to && isBefore(endOfDay(dateRange.to), d)) return false;
            return true;
        };

        // Run the TRUE running balance across every non-date-filtered voucher
        // (chronological). Each row then keeps its real balance even when the
        // displayed periods have gaps (e.g. Shrawan + Mangsir but not Bhadra).
        const nonDateMatched = vouchers.filter(matchesNonDate);
        let cum = 0;
        const withBalance = nonDateMatched.map(v => {
            const before = cum;
            cum += (v.debit - v.credit);
            return { ...v, balance: cum, _before: before };
        });

        // Displayed = those inside the selected date window.
        const displayed = withBalance.filter(inDateWindow);

        // Opening = true balance immediately before the first displayed entry.
        // If nothing is displayed, fall back to the balance before the window start.
        let opening = 0;
        if (displayed.length > 0) {
            opening = displayed[0]._before;
        } else if (bsPeriods.length > 0 || dateRange?.from) {
            let earliest: Date | null = dateRange?.from ? startOfDay(dateRange.from) : null;
            for (const tok of bsPeriods) {
                const [ty, tm] = tok.includes('-') ? tok.split('-').map(Number) : [Number(tok), 0];
                const start = new NepaliDate(ty, tm, 1).toJsDate();
                if (!earliest || isBefore(start, earliest)) earliest = start;
            }
            const before = earliest ? withBalance.filter(v => isBefore(new Date(v.date), earliest!)) : [];
            opening = before.length ? before[before.length - 1].balance : 0;
        }

        const totalDebit = displayed.reduce((s, v) => s + v.debit, 0);
        const totalCredit = displayed.reduce((s, v) => s + v.credit, 0);
        const closing = displayed.length ? displayed[displayed.length - 1].balance : opening;

        return {
            entries: [...displayed].reverse(), // latest first for display
            stats: {
                opening,
                debit: totalDebit,
                credit: totalCredit,
                net: totalDebit - totalCredit,
                closing,
                count: displayed.length,
            },
        };
    }, [transactions, filterParties, filterVehicles, filterBillingTypes, bsPeriods, dateRange, filterCategory, globalSearch, vehiclesById, partiesById, accountsById]);

    const paginatedEntries = useMemo(() => {
        if (itemsPerPage === -1) return ledgerData.entries;
        const start = (currentPage - 1) * itemsPerPage;
        return ledgerData.entries.slice(start, start + itemsPerPage);
    }, [ledgerData.entries, currentPage, itemsPerPage]);

    const totalPages = useMemo(() => {
        if (itemsPerPage === -1) return 1;
        return Math.max(1, Math.ceil(ledgerData.entries.length / itemsPerPage));
    }, [ledgerData.entries, itemsPerPage]);

    const activeFilterCount = useMemo(() => {
        let n = 0;
        if (filterParties.length) n++;
        if (filterVehicles.length) n++;
        if (filterBillingTypes.length) n++;
        if (dateRange) n++;
        if (bsPeriods.length) n++;
        if (filterCategory !== 'All') n++;
        if (globalSearch) n++;
        return n;
    }, [filterParties, filterVehicles, filterBillingTypes, dateRange, bsPeriods, filterCategory, globalSearch]);

    const periodTokenLabel = (tok: string) => {
        if (!tok.includes('-')) return `${tok} BS`;
        const [y, m] = tok.split('-');
        const name = NEPALI_MONTHS.find(mo => String(mo.value) === m)?.name || '';
        return `${name} ${y}`;
    };

    const reportFilters = useMemo(() => ({
        period: dateRange?.from
            ? `${toNepaliDate(dateRange.from.toISOString())} - ${dateRange.to ? toNepaliDate(dateRange.to.toISOString()) : 'Present'}`
            : bsPeriods.length > 0
                ? bsPeriods.map(periodTokenLabel).join(', ')
                : 'All Time',
        parties: filterParties.length === 0 ? 'All' : filterParties.map(id => partiesById.get(id)).filter(Boolean).join(', '),
        vehicles: filterVehicles.length === 0 ? 'All' : filterVehicles.map(id => vehiclesById.get(id)).filter(Boolean).join(', '),
        paymentModes: filterBillingTypes.length === 0 ? 'All' : filterBillingTypes.map(id => id === 'Cash' ? 'Cash' : id === 'Credit' ? 'Credit' : accountsById.get(id) || 'Bank').join(', '),
    }), [dateRange, bsPeriods, filterParties, filterVehicles, filterBillingTypes, partiesById, vehiclesById, accountsById]);

    const bsPeriodLabel = useMemo(() => {
        if (bsPeriods.length === 0) return 'All time';
        if (bsPeriods.length === 1) return periodTokenLabel(bsPeriods[0]);
        return `${bsPeriods.length} periods`;
    }, [bsPeriods]);

    const togglePeriod = (tok: string) =>
        setBsPeriods(prev => prev.includes(tok) ? prev.filter(t => t !== tok) : [...prev, tok]);

    const sourceFilterItems = useMemo(() => [
        { id: 'Cash', name: 'Cash' },
        { id: 'Credit', name: 'Credit' },
        ...sijanBankAccounts.map(a => ({ id: a.id, name: `${a.bankName || a.name}${a.accountNumber ? ` (${a.accountNumber})` : ''}` })),
    ], [sijanBankAccounts]);

    const editEntry = (entry: any) => {
        if (entry.referenceType === 'Expense Entry') {
            router.push(`/fleet/transactions/expenses/edit?id=${entry.expenseId}`);
        } else if (entry.referenceType === 'Trip Sheet') {
            router.push(`/fleet/trip-sheets/edit?id=${entry.tripId}`);
        } else if (entry.voucherId) {
            router.push(`/fleet/transactions/payment-receipt/edit?voucherId=${entry.voucherId}`);
        } else {
            router.push(`/fleet/transactions/purchase/edit?id=${entry.id}`);
        }
    };

    const viewEntry = (entry: any) => {
        if (entry.referenceType === 'Expense Entry') {
            router.push(`/fleet/transactions/expenses/view?id=${entry.expenseId}`);
        } else if (entry.referenceType === 'Trip Sheet') {
            router.push(`/fleet/trip-sheets/${entry.tripId}`);
        } else if (entry.voucherId) {
            router.push(`/fleet/transactions/payment-receipt?voucherId=${entry.voucherId}`);
        } else {
            router.push(`/fleet/transactions/purchase/view?id=${entry.id}`);
        }
    };

    const confirmDelete = async () => {
        const entry = deleteTarget;
        if (!entry) return;
        try {
            if (entry.voucherId) await deleteVoucher(entry.voucherId);
            else await deleteTransaction(entry.id);
            toast({ title: 'Entry deleted' });
        } catch {
            toast({ title: 'Delete failed', description: 'Please try again.', variant: 'destructive' });
        } finally {
            setDeleteTarget(null);
        }
    };

    const money = (n: number) => Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2 });
    const drcr = (n: number) => (n >= 0 ? 'Dr' : 'Cr');

    // Excel / PDF export inlined here (single ledger source, no extra file).
    const handleExport = async (type: 'excel' | 'pdf') => {
        const { entries, stats } = ledgerData;
        const chronological = [...entries].reverse(); // oldest first for statements
        const nowStr = format(new Date(), 'PPP p');

        if (type === 'excel') {
            const XLSX = await import('xlsx');
            const sheet = [
                [fleetProfile.nameEn.toUpperCase()],
                [fleetProfile.address],
                [`PAN: ${fleetProfile.pan}`],
                [`Generated: ${nowStr}`],
                [],
                ['Report', 'Fleet Transaction Ledger'],
                ['Period', reportFilters.period],
                ['Entities', `${reportFilters.parties} | ${reportFilters.vehicles}`],
                ...(reportFilters.paymentModes ? [['Payment Modes', reportFilters.paymentModes]] : []),
                [],
                ['Date (BS)', 'Ref No.', 'Particulars', 'Vehicle', 'Category', 'Debit', 'Credit', 'Balance'],
                ['', '', 'Balance B/F (Opening)', '', '', '', '', `${money(stats.opening)} ${drcr(stats.opening)}`],
                ...chronological.map(e => [
                    toNepaliDate(e.date), e.refNo,
                    `${e.remarks || e.type}${e.lineItemsSummary ? ` — ${e.lineItemsSummary}` : ''}`,
                    e.vehicleName, e.categoryDisplay, e.debit || 0, e.credit || 0,
                    `${money(e.balance)} ${drcr(e.balance)}`,
                ]),
                ['', '', 'Total period movement', '', '', stats.debit, stats.credit, ''],
                ['', '', 'Closing balance', '', '', '', '', `${money(stats.closing)} ${drcr(stats.closing)}`],
            ];
            const ws = XLSX.utils.aoa_to_sheet(sheet);
            ws['!cols'] = [{ wch: 12 }, { wch: 14 }, { wch: 44 }, { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 18 }];
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Ledger');
            XLSX.writeFile(wb, `Fleet_Ledger_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
            return;
        }

        const { jsPDF } = await import('jspdf');
        const { default: autoTable } = await import('jspdf-autotable');
        const doc = new jsPDF('l', 'mm', 'a4');
        const width = doc.internal.pageSize.getWidth();

        doc.setFont('helvetica', 'bold'); doc.setFontSize(16);
        doc.text(fleetProfile.nameEn.toUpperCase(), width / 2, 14, { align: 'center' });
        doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(110);
        doc.text(`${fleetProfile.address}  |  PAN: ${fleetProfile.pan}`, width / 2, 20, { align: 'center' });
        doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(20);
        doc.text('FLEET TRANSACTION LEDGER', 14, 30);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(90);
        let y = 36;
        doc.text(`Period: ${reportFilters.period}`, 14, y); y += 4.5;
        doc.text(`Parties: ${reportFilters.parties}`, 14, y); y += 4.5;
        doc.text(`Vehicles: ${reportFilters.vehicles}`, 14, y); y += 4.5;
        if (reportFilters.paymentModes) { doc.text(`Modes: ${reportFilters.paymentModes}`, 14, y); y += 4.5; }
        doc.text(`Generated: ${nowStr}`, 14, y); y += 4;

        autoTable(doc, {
            startY: y + 2,
            head: [['Date (BS)', 'Ref No.', 'Particulars / Description', 'Vehicle', 'Category', 'Debit', 'Credit', 'Balance']],
            body: [
                ['', '', 'Balance B/F (Opening)', '-', '-', '-', '-', `${money(stats.opening)} ${drcr(stats.opening)}`],
                ...chronological.map(e => [
                    toNepaliDate(e.date), e.refNo,
                    `${e.remarks || e.type}${e.lineItemsSummary ? `\n${e.lineItemsSummary}` : ''}`,
                    e.vehicleName, e.categoryDisplay,
                    e.debit ? money(e.debit) : '-', e.credit ? money(e.credit) : '-',
                    `${money(e.balance)} ${drcr(e.balance)}`,
                ]),
            ],
            foot: [[
                { content: 'Total period movement', colSpan: 5, styles: { halign: 'right', fontStyle: 'bold' } },
                { content: money(stats.debit), styles: { halign: 'right', fontStyle: 'bold' } },
                { content: money(stats.credit), styles: { halign: 'right', fontStyle: 'bold' } },
                { content: `${money(stats.closing)} ${drcr(stats.closing)}`, styles: { halign: 'right', fontStyle: 'bold' } },
            ]],
            theme: 'grid',
            headStyles: { fillColor: [33, 37, 41], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
            bodyStyles: { fontSize: 7, textColor: [20, 20, 20] },
            footStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0] },
            alternateRowStyles: { fillColor: [248, 249, 250] },
            columnStyles: { 2: { cellWidth: 78 }, 5: { halign: 'right' }, 6: { halign: 'right' }, 7: { halign: 'right', fontStyle: 'bold' } },
            didDrawPage: () => {
                doc.setFontSize(7); doc.setTextColor(150);
                doc.text(`Page ${(doc.internal as any).getNumberOfPages()}`, width - 20, doc.internal.pageSize.height - 8);
            },
        });
        doc.save(`Fleet_Ledger_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
    };


    return (
        <div className="flex flex-col gap-5 max-w-[1600px] mx-auto">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Transaction Ledger</h1>
                    <p className="text-sm text-muted-foreground">Debit / credit statement across all fleet vouchers.</p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" className="h-9 gap-2" onClick={() => setIsPreviewOpen(true)}>
                        <Eye className="h-4 w-4" /> Preview
                    </Button>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button size="sm" className="h-9 gap-2">
                                <Download className="h-4 w-4" /> Export <ChevronDown className="h-3 w-3 opacity-70" />
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

            {/* Filters */}
            <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
                <Card className="border-border/60">
                    <div className="flex items-center justify-between px-4 py-3">
                        <CollapsibleTrigger asChild>
                            <button className="flex items-center gap-2 text-sm font-medium">
                                <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
                                Filters
                                {activeFilterCount > 0 && (
                                    <Badge variant="secondary" className="h-5 px-1.5 text-[10px] font-semibold">{activeFilterCount}</Badge>
                                )}
                                <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', filtersOpen && 'rotate-180')} />
                            </button>
                        </CollapsibleTrigger>
                        {activeFilterCount > 0 && (
                            <Button variant="ghost" size="sm" className="h-8 text-muted-foreground" onClick={handleResetFilters}>
                                <FilterX className="mr-1.5 h-3.5 w-3.5" /> Clear all
                            </Button>
                        )}
                    </div>
                    <CollapsibleContent>
                        <CardContent className="pt-0 pb-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
                            <SearchableMultiSelect label="Parties" values={filterParties} onSelect={setFilterParties}
                                items={parties.filter(p => p.ownership === 'Sijan' || p.ownership === 'Both')} placeholder="Party" icon={Users} />
                            <SearchableMultiSelect label="Vehicles" values={filterVehicles} onSelect={setFilterVehicles}
                                items={vehicles} placeholder="Vehicle" icon={Truck} />
                            <SearchableMultiSelect label="Payment mode" values={filterBillingTypes} onSelect={setFilterBillingTypes}
                                items={sourceFilterItems} placeholder="Payment mode" icon={Wallet} />

                            <div className="space-y-1.5">
                                <Label className="text-[11px] font-medium text-muted-foreground">Period (BS)</Label>
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <Button variant="outline" className="w-full justify-between h-9 font-normal text-xs px-3">
                                            <span className="flex items-center gap-2 overflow-hidden">
                                                <CalendarIcon className="h-3.5 w-3.5 opacity-50 shrink-0" />
                                                <span className="truncate">{bsPeriodLabel}</span>
                                            </span>
                                            <ChevronDown className="h-3 w-3 opacity-50 shrink-0" />
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="p-0 w-[--radix-popover-trigger-width]">
                                        <Command>
                                            <CommandInput placeholder="Search e.g. Shrawan 2082..." />
                                            <CommandList>
                                                <CommandEmpty>No period found.</CommandEmpty>
                                                <CommandGroup>
                                                    <CommandItem value="All time (clear)" onSelect={() => setBsPeriods([])}>
                                                        <Check className={cn('mr-2 h-4 w-4', bsPeriods.length === 0 ? 'opacity-100' : 'opacity-0')} />
                                                        All time
                                                    </CommandItem>
                                                    {availableYears.map(year => (
                                                        <CommandItem key={`y-${year}`} value={`Full year ${year}`} onSelect={() => togglePeriod(String(year))}>
                                                            <Check className={cn('mr-2 h-4 w-4', bsPeriods.includes(String(year)) ? 'opacity-100' : 'opacity-0')} />
                                                            Full year {year}
                                                        </CommandItem>
                                                    ))}
                                                    {availableYears.flatMap(year =>
                                                        NEPALI_MONTHS.map(month => {
                                                            const tok = `${year}-${month.value}`;
                                                            return (
                                                                <CommandItem key={`ym-${tok}`} value={`${month.name} ${year}`} onSelect={() => togglePeriod(tok)}>
                                                                    <Check className={cn('mr-2 h-4 w-4', bsPeriods.includes(tok) ? 'opacity-100' : 'opacity-0')} />
                                                                    {month.name} {year}
                                                                </CommandItem>
                                                            );
                                                        })
                                                    )}
                                                </CommandGroup>
                                            </CommandList>
                                        </Command>
                                    </PopoverContent>
                                </Popover>
                            </div>

                            <div className="space-y-1.5">
                                <Label className="text-[11px] font-medium text-muted-foreground">AD date range</Label>
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <Button variant="outline" className="w-full justify-between h-9 font-normal text-xs px-3">
                                            <span className="flex items-center gap-2 overflow-hidden">
                                                <CalendarIcon className="h-3.5 w-3.5 opacity-50 shrink-0" />
                                                <span className="truncate">
                                                    {dateRange?.from
                                                        ? (dateRange.to ? `${format(dateRange.from, 'MMM d')} - ${format(dateRange.to, 'MMM d')}` : format(dateRange.from, 'MMM d'))
                                                        : 'Any date'}
                                                </span>
                                            </span>
                                            <ChevronDown className="h-3 w-3 opacity-50 shrink-0" />
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0" align="start">
                                        <div className="flex flex-wrap gap-1 p-2 border-b">
                                            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setDateRange({ from: subDays(new Date(), 6), to: new Date() })}>Last 7 days</Button>
                                            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setDateRange({ from: subDays(new Date(), 29), to: new Date() })}>Last 30 days</Button>
                                            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setDateRange({ from: subDays(new Date(), 89), to: new Date() })}>Last 90 days</Button>
                                            <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={() => setDateRange(undefined)}>Clear</Button>
                                        </div>
                                        <DualDateRangePicker selected={dateRange} onSelect={setDateRange} />
                                    </PopoverContent>
                                </Popover>
                            </div>
                        </CardContent>
                    </CollapsibleContent>
                </Card>
            </Collapsible>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                {([
                    { label: 'Opening', value: ledgerData.stats.opening, dc: true },
                    { label: 'Total debit', value: ledgerData.stats.debit, dc: false },
                    { label: 'Total credit', value: ledgerData.stats.credit, dc: false },
                    { label: 'Net movement', value: ledgerData.stats.net, dc: true },
                    { label: 'Entries', value: ledgerData.stats.count, count: true },
                ] as any[]).map((s, i) => (
                    <Card key={i} className="border-border/60 py-3 px-3">
                        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">{s.label}</p>
                        <p className="text-sm font-bold tabular-nums">
                            {s.count ? s.value.toLocaleString() : money(s.value)}
                            {s.dc && <span className="ml-1 text-[10px] font-semibold text-muted-foreground">{s.value >= 0 ? 'Dr' : 'Cr'}</span>}
                        </p>
                    </Card>
                ))}
                <Card className="py-3 px-3 border-primary/30 bg-primary/5">
                    <p className="text-[10px] font-medium text-primary/70 uppercase tracking-wide mb-1">Closing</p>
                    <p className="text-sm font-bold tabular-nums text-primary">
                        {money(ledgerData.stats.closing)}
                        <span className="ml-1 text-[10px] font-semibold">{ledgerData.stats.closing >= 0 ? 'Dr' : 'Cr'}</span>
                    </p>
                </Card>
            </div>

            {/* Ledger table */}
            <Card className="border-border/60">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b px-4 py-3 gap-3">
                    <div className="flex items-center gap-3">
                        <h3 className="font-semibold text-sm whitespace-nowrap">Ledger entries</h3>
                        <Select value={filterCategory} onValueChange={setFilterCategory}>
                            <SelectTrigger className="h-8 w-[160px] text-xs"><SelectValue placeholder="Category" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="All">All categories</SelectItem>
                                {categories.map((cat: any) => <SelectItem key={cat} value={cat}>{cat}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="relative w-full sm:w-[320px]">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search party, ref no, narration..."
                            className="pl-9 h-9 text-sm"
                            value={globalSearch}
                            onChange={(e) => setGlobalSearch(e.target.value)}
                        />
                    </div>
                </div>

                <ScrollArea className="w-full">
                    <Table className="text-[13px]">
                        <TableHeader>
                            <TableRow className="hover:bg-transparent bg-muted/40">
                                <TableHead className="w-[110px] font-semibold">Date (BS)</TableHead>
                                <TableHead className="w-[110px] font-semibold">Ref no.</TableHead>
                                <TableHead className="min-w-[280px] font-semibold">Particulars</TableHead>
                                <TableHead className="w-[140px] font-semibold">Vehicle</TableHead>
                                <TableHead className="w-[130px] font-semibold">Category</TableHead>
                                <TableHead className="text-right w-[120px] font-semibold">Debit</TableHead>
                                <TableHead className="text-right w-[120px] font-semibold">Credit</TableHead>
                                <TableHead className="text-right w-[150px] font-semibold">Balance</TableHead>
                                <TableHead className="w-[48px]" />
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {currentPage === totalPages && itemsPerPage !== -1 && ledgerData.entries.length > 0 && (
                                <TableRow className="bg-muted/20 border-b">
                                    <TableCell colSpan={2} />
                                    <TableCell className="font-medium text-muted-foreground italic">Balance B/F (opening)</TableCell>
                                    <TableCell className="text-center text-muted-foreground">-</TableCell>
                                    <TableCell className="text-center text-muted-foreground">-</TableCell>
                                    <TableCell className="text-right text-muted-foreground">-</TableCell>
                                    <TableCell className="text-right text-muted-foreground">-</TableCell>
                                    <TableCell className="text-right font-semibold tabular-nums">
                                        {money(ledgerData.stats.opening)} <span className="text-[10px] text-muted-foreground">{ledgerData.stats.opening >= 0 ? 'Dr' : 'Cr'}</span>
                                    </TableCell>
                                    <TableCell />
                                </TableRow>
                            )}

                            {paginatedEntries.map((entry) => (
                                <TableRow key={entry.rowKey} className="border-b hover:bg-muted/30">
                                    <TableCell className="text-muted-foreground whitespace-nowrap">{toNepaliDate(entry.date)}</TableCell>
                                    <TableCell>
                                        <Button variant="link" className="p-0 h-auto font-medium" onClick={() => viewEntry(entry)}>
                                            {entry.refNo}
                                        </Button>
                                    </TableCell>
                                    <TableCell className="py-2.5">
                                        <div className="flex flex-col gap-0.5">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="font-medium">{entry.partyName}</span>
                                                <span className="text-[11px] text-muted-foreground">{entry.remarks || entry.type}</span>
                                                {entry.legs.length > 1 && (
                                                    <Badge variant="outline" className="h-4 px-1 text-[9px] font-medium">{entry.modeSummary}</Badge>
                                                )}
                                            </div>
                                            {entry.lineItemsSummary && (
                                                <div className="text-[11px] text-muted-foreground line-clamp-1 max-w-[380px]">{entry.lineItemsSummary}</div>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-[12px] font-medium">{entry.vehicleName}</TableCell>
                                    <TableCell>
                                        <Badge variant="secondary" className="text-[10px] font-medium px-2 py-0.5">{entry.categoryDisplay}</Badge>
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums">{entry.debit > 0 ? money(entry.debit) : <span className="text-muted-foreground">-</span>}</TableCell>
                                    <TableCell className="text-right tabular-nums">{entry.credit > 0 ? money(entry.credit) : <span className="text-muted-foreground">-</span>}</TableCell>
                                    <TableCell className="text-right font-semibold tabular-nums whitespace-nowrap">
                                        {money(entry.balance)} <span className="text-[10px] font-medium text-muted-foreground">{entry.balance >= 0 ? 'Dr' : 'Cr'}</span>
                                    </TableCell>
                                    <TableCell>
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" size="icon" className="h-7 w-7"><MoreHorizontal className="h-4 w-4" /></Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuItem onSelect={() => viewEntry(entry)}><Eye className="h-4 w-4 mr-2" /> View</DropdownMenuItem>
                                                <DropdownMenuItem onSelect={() => editEntry(entry)}><Pencil className="h-4 w-4 mr-2" /> Edit</DropdownMenuItem>
                                                <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setDeleteTarget(entry)}>
                                                    <Trash2 className="h-4 w-4 mr-2" /> Delete
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </TableCell>
                                </TableRow>
                            ))}

                            {!isLoading && ledgerData.entries.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={9} className="text-center py-20">
                                        <p className="text-sm font-medium text-muted-foreground">No entries match these filters.</p>
                                        {activeFilterCount > 0 && (
                                            <Button variant="link" size="sm" className="mt-1" onClick={handleResetFilters}>Clear filters</Button>
                                        )}
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                        <TableFooter>
                            <TableRow className="bg-muted/40 border-t-2 hover:bg-muted/40">
                                <TableCell colSpan={5} className="text-right font-semibold text-sm">Total period movement</TableCell>
                                <TableCell className="text-right font-bold tabular-nums text-sm">{money(ledgerData.stats.debit)}</TableCell>
                                <TableCell className="text-right font-bold tabular-nums text-sm">{money(ledgerData.stats.credit)}</TableCell>
                                <TableCell className="text-right font-semibold tabular-nums">
                                    Net {money(ledgerData.stats.net)} <span className="text-[10px] text-muted-foreground">{ledgerData.stats.net >= 0 ? 'Dr' : 'Cr'}</span>
                                </TableCell>
                                <TableCell />
                            </TableRow>
                        </TableFooter>
                    </Table>
                    <ScrollBar orientation="horizontal" />
                </ScrollArea>

                {ledgerData.entries.length > 0 && (
                    <CardFooter className="flex flex-col sm:flex-row items-center justify-between gap-3 py-3 border-t">
                        <p className="text-xs text-muted-foreground">
                            {itemsPerPage === -1
                                ? <>Showing all <span className="font-semibold text-foreground">{ledgerData.entries.length}</span> entries</>
                                : <>Showing <span className="font-semibold text-foreground">{(currentPage - 1) * itemsPerPage + 1}</span>–<span className="font-semibold text-foreground">{Math.min(currentPage * itemsPerPage, ledgerData.entries.length)}</span> of <span className="font-semibold text-foreground">{ledgerData.entries.length}</span></>}
                        </p>
                        <div className="flex items-center gap-5">
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-muted-foreground whitespace-nowrap">Rows</span>
                                <Select value={String(itemsPerPage)} onValueChange={(v) => { setItemsPerPage(parseInt(v)); setCurrentPage(1); }}>
                                    <SelectTrigger className="h-8 w-[70px]"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="10">10</SelectItem>
                                        <SelectItem value="25">25</SelectItem>
                                        <SelectItem value="50">50</SelectItem>
                                        <SelectItem value="-1">All</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            {itemsPerPage !== -1 && (
                                <div className="flex items-center gap-2">
                                    <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>
                                        <ChevronLeft className="h-4 w-4" />
                                    </Button>
                                    <span className="text-xs font-medium px-1 whitespace-nowrap">Page {currentPage} / {totalPages}</span>
                                    <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>
                                        <ChevronRight className="h-4 w-4" />
                                    </Button>
                                </div>
                            )}
                        </div>
                    </CardFooter>
                )}
            </Card>

            <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete this entry?</AlertDialogTitle>
                        <AlertDialogDescription>
                            {deleteTarget?.voucherId
                                ? 'This entry belongs to a voucher. Deleting it removes the whole voucher and every linked leg.'
                                : 'This permanently removes the purchase record from the ledger.'}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Keep</AlertDialogCancel>
                        <AlertDialogAction className="bg-destructive text-white hover:bg-destructive/90" onClick={confirmDelete}>Delete</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <LedgerReportPreview
                isOpen={isPreviewOpen}
                onOpenChange={setIsPreviewOpen}
                ledgerData={ledgerData}
                fleetProfile={fleetProfile}
                filters={reportFilters}
            />
        </div>
    );
}
