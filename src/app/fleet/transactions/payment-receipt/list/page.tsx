'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { 
  PlusCircle, 
  Search, 
  ArrowUpDown, 
  MoreHorizontal, 
  Trash2, 
  Edit, 
  FilterX, 
  CalendarIcon, 
  Loader2,
  Receipt,
  Eye,
  ChevronDown,
  Printer,
  Check,
  User,
  History,
  Truck,
  Users,
  Wallet
} from 'lucide-react';
import type { Transaction, Vehicle, Party, Account } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { cn, toNepaliDate } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import { onTransactionsUpdate, deleteVoucher } from '@/services/transaction-service';
import { onVehiclesUpdate } from '@/services/vehicle-service';
import { onPartiesUpdate } from '@/services/party-service';
import { onAccountsUpdate } from '@/services/account-service';
import { format, isWithinInterval, startOfDay, endOfDay } from 'date-fns';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { DualDateRangePicker } from '@/components/ui/dual-date-range-picker';
import type { DateRange } from 'react-day-picker';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import NepaliDate from 'nepali-date-converter';
import { NEPALI_MONTHS } from '@/lib/constants';

interface VoucherSummary {
    voucherId: string;
    voucherNo: string;
    date: string;
    type: 'Payment' | 'Receipt' | 'Mixed';
    billingType: string;
    accountId?: string;
    totalAmount: number;
    accountName?: string;
    entriesCount: number;
    remarks?: string;
    createdBy: string;
    vehicleIds: string[]; // List of unique vehicle IDs in this voucher
    partyIds: string[];   // List of unique party IDs in this voucher
}

// Helper component for multi-select with "All" support
const MultiSelect = ({ label, values, onSelect, items, placeholder, icon: Icon }: any) => {
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
            ? items.find((i: any) => String(i.id) === String(values[0]))?.name || values[0]
            : `${values.length} ${placeholder}s Selected`;

    return (
        <div className="space-y-1.5 flex-1 min-w-[160px]">
            <Label className="text-[10px] uppercase font-bold text-muted-foreground">{label}</Label>
            <Popover>
                <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-between h-9 bg-white border-gray-200 shadow-none font-normal text-xs px-3 text-left">
                        <div className="flex items-center gap-2 overflow-hidden text-left">
                            {Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                            <span className="truncate">{displayText}</span>
                        </div>
                        <ChevronDown className="h-3 w-3 opacity-50 shrink-0" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="p-0 w-[200px]" align="start">
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
                                <CommandItem value="All" onSelect={() => toggleItem('All')} className="text-xs">
                                    <Check className={cn("mr-2 h-3.5 w-3.5", isAll ? "opacity-100" : "opacity-0")} />
                                    All {placeholder}s
                                </CommandItem>
                                {items.map((item: any) => (
                                    <CommandItem key={item.id} value={item.name} onSelect={() => toggleItem(String(item.id))} className="text-xs">
                                        <Check className={cn("mr-2 h-3.5 w-3.5", values.includes(String(item.id)) ? "opacity-100" : "opacity-0")} />
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

export default function VoucherLogsPage() {
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [parties, setParties] = useState<Party[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    
    const [searchQuery, setSearchQuery] = useState('');
    const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
    const [filterBsYears, setFilterBsYears] = useState<string[]>([]);
    const [filterBsMonths, setFilterBsMonths] = useState<string[]>([]);
    const [filterTypes, setFilterTypes] = useState<string[]>([]);
    const [filterVehicleIds, setFilterVehicleIds] = useState<string[]>([]);
    const [filterPartyIds, setFilterPartyIds] = useState<string[]>([]);
    const [filterBillingTypes, setFilterBillingTypes] = useState<string[]>([]);

    const { toast } = useToast();
    const { hasPermission } = useAuth();
    const router = useRouter();

    useEffect(() => {
        setIsLoading(true);
        const unsubs = [
            onTransactionsUpdate(setTransactions),
            onAccountsUpdate(setAccounts),
            onVehiclesUpdate(setVehicles),
            onPartiesUpdate(setParties)
        ];
        setIsLoading(false);
        return () => unsubs.forEach(u => u());
    }, []);

    const accountsById = useMemo(() => new Map(accounts.map(a => [a.id, a.bankName || a.name])), [accounts]);
    const vehiclesById = useMemo(() => new Map(vehicles.map(v => [v.id, v.name])), [vehicles]);
    const partiesById = useMemo(() => new Map(parties.map(p => [p.id, p.name])), [parties]);
    const sijanBankAccounts = useMemo(() => accounts.filter(a => a.type === 'Bank' && (a.ownership === 'Sijan' || a.ownership === 'Both')), [accounts]);

    const availableYears = useMemo(() => {
        const years = new Set<number>();
        transactions.forEach(t => {
            try {
                if (t.voucherId) {
                    years.add(new NepaliDate(new Date(t.date)).getYear());
                }
            } catch {}
        });
        return Array.from(years).sort((a, b) => b - a);
    }, [transactions]);

    const vouchers = useMemo(() => {
        const filteredTxns = transactions.filter(t => t.voucherId && (t.type === 'Payment' || t.type === 'Receipt'));
        const groups = new Map<string, Transaction[]>();
        
        filteredTxns.forEach(t => {
            const list = groups.get(t.voucherId!) || [];
            list.push(t);
            groups.set(t.voucherId!, list);
        });

        const summaries: VoucherSummary[] = Array.from(groups.entries()).map(([vId, txns]) => {
            const first = txns[0];
            const hasPayment = txns.some(t => t.type === 'Payment');
            const hasReceipt = txns.some(t => t.type === 'Receipt');
            
            const vehicleIds = Array.from(new Set(txns.map(t => t.vehicleId).filter(Boolean)));
            const partyIds = Array.from(new Set(txns.map(t => t.partyId).filter(Boolean)));

            return {
                voucherId: vId,
                voucherNo: first.referenceId || 'N/A',
                date: first.date,
                type: (hasPayment && hasReceipt) ? 'Mixed' : hasPayment ? 'Payment' : 'Receipt',
                billingType: first.billingType,
                accountId: first.accountId || undefined,
                accountName: first.accountId ? accountsById.get(first.accountId) : undefined,
                totalAmount: txns.reduce((sum, t) => sum + t.amount, 0),
                entriesCount: txns.length,
                remarks: first.remarks || undefined,
                createdBy: first.createdBy,
                vehicleIds,
                partyIds
            };
        });

        return summaries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [transactions, accountsById]);

    const filteredVouchers = useMemo(() => {
        let filtered = [...vouchers];

        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            filtered = filtered.filter(v => 
                v.voucherNo.toLowerCase().includes(query) ||
                (v.remarks || '').toLowerCase().includes(query) ||
                (v.accountName || '').toLowerCase().includes(query)
            );
        }

        if (filterTypes.length > 0) {
            filtered = filtered.filter(v => filterTypes.includes(v.type));
        }

        if (filterBillingTypes.length > 0) {
            filtered = filtered.filter(v => {
                if (filterBillingTypes.includes('Cash') && v.billingType === 'Cash') return true;
                if (v.billingType === 'Bank' && v.accountId && filterBillingTypes.includes(v.accountId)) return true;
                return false;
            });
        }

        if (filterVehicleIds.length > 0) {
            filtered = filtered.filter(v => 
                v.vehicleIds.some(id => filterVehicleIds.includes(id))
            );
        }

        if (filterPartyIds.length > 0) {
            filtered = filtered.filter(v => 
                v.partyIds.some(id => filterPartyIds.includes(id))
            );
        }
        
        if (dateRange?.from) {
            const interval = { start: startOfDay(dateRange.from), end: endOfDay(dateRange.to || dateRange.from) };
            filtered = filtered.filter(v => isWithinInterval(new Date(v.date), interval));
        }

        if (filterBsYears.length > 0) {
            filtered = filtered.filter(v => {
                try {
                    const year = new NepaliDate(new Date(v.date)).getYear();
                    return filterBsYears.includes(String(year));
                } catch { return false; }
            });
        }

        if (filterBsMonths.length > 0) {
            filtered = filtered.filter(v => {
                try {
                    const month = new NepaliDate(new Date(v.date)).getMonth();
                    return filterBsMonths.includes(String(month));
                } catch { return false; }
            });
        }

        return filtered;
    }, [vouchers, searchQuery, filterTypes, filterBillingTypes, filterVehicleIds, filterPartyIds, dateRange, filterBsYears, filterBsMonths]);

    const handleDelete = async (voucherId: string) => {
        try {
            await deleteVoucher(voucherId);
            toast({ title: 'Success', description: 'Voucher and all linked entries deleted.' });
        } catch (error) {
             toast({ title: 'Error', description: 'Failed to delete voucher.', variant: 'destructive' });
        }
    };

    const handleClearFilters = () => {
        setSearchQuery('');
        setDateRange(undefined);
        setFilterBsYears([]);
        setFilterBsMonths([]);
        setFilterTypes([]);
        setFilterVehicleIds([]);
        setFilterPartyIds([]);
        setFilterBillingTypes([]);
    };

    const isFiltered = useMemo(() => {
        return searchQuery !== '' || 
               !!dateRange || 
               filterBsYears.length > 0 || 
               filterBsMonths.length > 0 || 
               filterTypes.length > 0 ||
               filterVehicleIds.length > 0 ||
               filterPartyIds.length > 0 ||
               filterBillingTypes.length > 0;
    }, [searchQuery, dateRange, filterBsYears, filterBsMonths, filterTypes, filterVehicleIds, filterPartyIds, filterBillingTypes]);

    const sourceFilterItems = useMemo(() => {
        return [
            { id: 'Cash', name: 'Cash' },
            ...sijanBankAccounts.map(a => ({ id: a.id, name: a.bankName || a.name }))
        ];
    }, [sijanBankAccounts]);

    return (
        <div className="flex flex-col gap-8">
            <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Payment / Receipt Logs</h1>
                    <p className="text-muted-foreground">Management of multi-entry vouchers and settlements.</p>
                </div>
                <div className="flex items-center gap-2">
                    <div className="relative">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input type="search" placeholder="Search logs..." className="pl-8 sm:w-[250px]" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                    </div>
                    {hasPermission('fleet', 'create') && (
                        <Button onClick={() => router.push('/fleet/transactions/payment-receipt/new')}>
                            <PlusCircle className="mr-2 h-4 w-4" /> New Voucher
                        </Button>
                    )}
                </div>
            </header>

            <div className="bg-muted/20 p-4 rounded-lg border border-dashed flex flex-wrap gap-4 items-end">
                <MultiSelect 
                    label="Year (BS)" 
                    values={filterBsYears} 
                    onSelect={setFilterBsYears} 
                    items={availableYears.map(y => ({ id: String(y), name: String(y) }))} 
                    placeholder="Year" 
                />
                <MultiSelect 
                    label="Month (BS)" 
                    values={filterBsMonths} 
                    onSelect={setFilterBsMonths} 
                    items={NEPALI_MONTHS.map(m => ({ id: String(m.value), name: m.name }))} 
                    placeholder="Month" 
                />
                <MultiSelect 
                    label="Voucher Type" 
                    values={filterTypes} 
                    onSelect={setFilterTypes} 
                    items={[
                        { id: 'Payment', name: 'Payment Only' },
                        { id: 'Receipt', name: 'Receipt Only' },
                        { id: 'Mixed', name: 'Mixed' }
                    ]} 
                    placeholder="Type" 
                    icon={Receipt}
                />
                <MultiSelect 
                    label="Vehicle" 
                    values={filterVehicleIds} 
                    onSelect={setFilterVehicleIds} 
                    items={vehicles} 
                    placeholder="Vehicle" 
                    icon={Truck}
                />
                <MultiSelect 
                    label="Party / Ledger" 
                    values={filterPartyIds} 
                    onSelect={setFilterPartyIds} 
                    items={parties.filter(p => p.ownership === 'Sijan' || p.ownership === 'Both')} 
                    placeholder="Party" 
                    icon={Users}
                />
                <MultiSelect 
                    label="Source" 
                    values={filterBillingTypes} 
                    onSelect={setFilterBillingTypes} 
                    items={sourceFilterItems} 
                    placeholder="Source" 
                    icon={Wallet}
                />
                <div className="space-y-1.5 w-full md:w-[180px]">
                    <Label className="text-[10px] uppercase font-bold text-muted-foreground">AD Range</Label>
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button variant="outline" className={cn("w-full h-9 justify-start text-left font-normal bg-white text-xs px-3", !dateRange && "text-muted-foreground")}>
                                <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                                <span className="truncate">
                                    {dateRange?.from ? (
                                        dateRange.to ? `${format(dateRange.from, "MMM d")} - ${format(dateRange.to, "MMM d")}` : format(dateRange.from, "MMM d")
                                    ) : 'Pick AD Range'}
                                </span>
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                            <DualDateRangePicker selected={dateRange} onSelect={setDateRange} />
                        </PopoverContent>
                    </Popover>
                </div>
                {isFiltered && (
                    <Button variant="ghost" size="sm" onClick={handleClearFilters} className="text-muted-foreground h-9 px-2 text-xs">
                        <FilterX className="mr-2 h-3.5 w-3.5" /> Reset
                    </Button>
                )}
            </div>

            <Card>
                <Table>
                    <TableHeader className="bg-muted/50">
                        <TableRow>
                            <TableHead className="text-xs">Date (BS)</TableHead>
                            <TableHead className="text-xs">Voucher #</TableHead>
                            <TableHead className="text-xs">Type</TableHead>
                            <TableHead className="text-xs">Vehicles</TableHead>
                            <TableHead className="text-xs">Ledgers</TableHead>
                            <TableHead className="text-xs">Mode / Account</TableHead>
                            <TableHead className="text-xs text-center">Entries</TableHead>
                            <TableHead className="text-right text-xs">Total Amount</TableHead>
                            <TableHead className="text-right text-xs">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            <TableRow><TableCell colSpan={9} className="text-center py-12"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></TableCell></TableRow>
                        ) : filteredVouchers.map(v => (
                            <TableRow key={v.voucherId} className="hover:bg-muted/30">
                                <TableCell className="font-medium text-[11px] whitespace-nowrap">{toNepaliDate(v.date)}</TableCell>
                                <TableCell>
                                    <div className="flex items-center gap-2">
                                        <span className="font-mono text-[11px] font-bold text-blue-600">{v.voucherNo}</span>
                                        <Button 
                                            variant="ghost" 
                                            size="icon" 
                                            className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity" 
                                            onClick={() => router.push(`/fleet/transactions/payment-receipt/edit?voucherId=${v.voucherId}`)}
                                        >
                                            <Edit className="h-3 w-3" />
                                        </Button>
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <Badge variant="outline" className={cn(
                                        "text-[9px] uppercase font-bold",
                                        v.type === 'Payment' ? "bg-red-50 text-red-700 border-red-200" : 
                                        v.type === 'Receipt' ? "bg-emerald-50 text-emerald-700 border-emerald-200" : 
                                        "bg-amber-50 text-amber-700 border-amber-200"
                                    )}>
                                        {v.type}
                                    </Badge>
                                </TableCell>
                                <TableCell className="text-[11px]">
                                    <div className="flex flex-wrap gap-1">
                                        {v.vehicleIds.map(id => (
                                            <Badge key={id} variant="secondary" className="text-[9px] px-1 h-4 font-normal">
                                                {vehiclesById.get(id) || id}
                                            </Badge>
                                        ))}
                                    </div>
                                </TableCell>
                                <TableCell className="text-[11px]">
                                    <div className="flex flex-wrap gap-1">
                                        {v.partyIds.map(id => (
                                            <Badge key={id} variant="outline" className="text-[9px] px-1 h-4 font-normal">
                                                {partiesById.get(id) || id}
                                            </Badge>
                                        ))}
                                    </div>
                                </TableCell>
                                <TableCell className="text-[11px]">
                                    <div className="flex flex-col">
                                        <span className="font-medium">{v.billingType}</span>
                                        {v.accountName && <span className="text-[9px] text-muted-foreground">{v.accountName}</span>}
                                    </div>
                                </TableCell>
                                <TableCell className="text-center font-bold text-[11px] text-muted-foreground">{v.entriesCount}</TableCell>
                                <TableCell className="text-right font-black text-[11px] tabular-nums">
                                    Rs. {v.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </TableCell>
                                <TableCell className="text-right">
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            <DropdownMenuItem onSelect={() => router.push(`/fleet/transactions/payment-receipt?voucherId=${v.voucherId}`)}><Eye className="mr-2 h-4 w-4" /> View Voucher</DropdownMenuItem>
                                            <DropdownMenuItem onSelect={() => router.push(`/fleet/transactions/payment-receipt/edit?voucherId=${v.voucherId}`)}><Edit className="mr-2 h-4 w-4" /> Edit Details</DropdownMenuItem>
                                            <DropdownMenuItem onSelect={() => window.open(`/fleet/transactions/payment-receipt?voucherId=${v.voucherId}`, '_blank')}><Printer className="mr-2 h-4 w-4" /> Print</DropdownMenuItem>
                                            <DropdownMenuSeparator />
                                            <AlertDialog><AlertDialogTrigger asChild><DropdownMenuItem onSelect={e => e.preventDefault()} className="text-destructive"><Trash2 className="mr-2 h-4 w-4" /> Delete Voucher</DropdownMenuItem></AlertDialogTrigger>
                                            <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete Entire Voucher?</AlertDialogTitle><AlertDialogDescription>This will delete all {v.entriesCount} linked transactions. This action cannot be reversed.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => handleDelete(v.voucherId)}>Confirm Delete</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </TableCell>
                            </TableRow>
                        ))}
                        {!isLoading && filteredVouchers.length === 0 && <TableRow><TableCell colSpan={9} className="text-center py-12 text-muted-foreground italic">No vouchers found.</TableCell></TableRow>}
                    </TableBody>
                </Table>
            </Card>
        </div>
    );
}
