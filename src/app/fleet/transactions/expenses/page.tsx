'use client';

import { useState, useEffect, useMemo } from 'react';
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
  Check,
  ChevronDown,
  Users,
  Truck
} from 'lucide-react';
import type { Vehicle, Party } from '@/lib/types';
import type { Expense } from '@/lib/expense-types';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { cn, toNepaliDate } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import { onExpensesUpdate, deleteExpense } from '@/services/expense-service';
import { onVehiclesUpdate } from '@/services/vehicle-service';
import { onPartiesUpdate } from '@/services/party-service';
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
import { Tooltip, TooltipProvider, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

type SortKey = 'date' | 'voucherNo' | 'amount' | 'expenseType';
type SortDirection = 'asc' | 'desc';

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

export default function ExpenseLogsPage() {
    const [expenses, setExpenses] = useState<Expense[]>([]);
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [parties, setParties] = useState<Party[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    
    const [searchQuery, setSearchQuery] = useState('');
    const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
    const [filterBsYears, setFilterBsYears] = useState<string[]>([]);
    const [filterBsMonths, setFilterBsMonths] = useState<string[]>([]);
    const [filterVehicleIds, setFilterVehicleIds] = useState<string[]>([]);
    const [filterPartyIds, setFilterPartyIds] = useState<string[]>([]);
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection }>({ key: 'date', direction: 'desc' });

    const { toast } = useToast();
    const { hasPermission } = useAuth();
    const router = useRouter();

    useEffect(() => {
        setIsLoading(true);
        const unsubs = [
            onExpensesUpdate(setExpenses),
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
        expenses.forEach(e => {
            try {
                years.add(new NepaliDate(new Date(e.date)).getYear());
            } catch {}
        });
        return Array.from(years).sort((a, b) => b - a);
    }, [expenses]);

    const filteredAndSortedExpenses = useMemo(() => {
        let filtered = [...expenses];

        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            filtered = filtered.filter(e => 
                e.voucherNo.toLowerCase().includes(query) ||
                (vehiclesById.get(e.vehicleId) || '').toLowerCase().includes(query) ||
                (e.expenseType || '').toLowerCase().includes(query) ||
                (e.destination || '').toLowerCase().includes(query) ||
                (e.remarks || '').toLowerCase().includes(query)
            );
        }
        
        if (dateRange?.from) {
            const interval = { start: startOfDay(dateRange.from), end: endOfDay(dateRange.to || dateRange.from) };
            filtered = filtered.filter(e => isWithinInterval(new Date(e.date), interval));
        }

        if (filterBsYears.length > 0) {
            filtered = filtered.filter(e => {
                try {
                    const year = new NepaliDate(new Date(e.date)).getYear();
                    return filterBsYears.includes(String(year));
                } catch { return false; }
            });
        }

        if (filterBsMonths.length > 0) {
            filtered = filtered.filter(e => {
                try {
                    const month = new NepaliDate(new Date(e.date)).getMonth();
                    return filterBsMonths.includes(String(month));
                } catch { return false; }
            });
        }
        
        if (filterVehicleIds.length > 0) {
            filtered = filtered.filter(e => filterVehicleIds.includes(e.vehicleId));
        }

        if (filterPartyIds.length > 0) {
            filtered = filtered.filter(e => e.partyId && filterPartyIds.includes(e.partyId));
        }
        
        filtered.sort((a, b) => {
            const aVal = a[sortConfig.key] || '';
            const bVal = b[sortConfig.key] || '';
            if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });

        return filtered;
    }, [expenses, searchQuery, dateRange, filterBsYears, filterBsMonths, filterVehicleIds, filterPartyIds, sortConfig, vehiclesById]);

    const handleDelete = async (id: string) => {
        try {
            await deleteExpense(id);
            toast({ title: 'Success', description: 'Expense record deleted.' });
        } catch (error) {
             toast({ title: 'Error', description: 'Failed to delete record.', variant: 'destructive' });
        }
    };

    const requestSort = (key: SortKey) => {
        setSortConfig(prev => ({
            key,
            direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
        }));
    };

    const handleClearFilters = () => {
        setSearchQuery('');
        setDateRange(undefined);
        setFilterBsYears([]);
        setFilterBsMonths([]);
        setFilterVehicleIds([]);
        setFilterPartyIds([]);
    };

    const isFiltered = useMemo(() => {
        return searchQuery !== '' || 
               !!dateRange || 
               filterBsYears.length > 0 || 
               filterBsMonths.length > 0 || 
               filterVehicleIds.length > 0 ||
               filterPartyIds.length > 0;
    }, [searchQuery, dateRange, filterBsYears, filterBsMonths, filterVehicleIds, filterPartyIds]);

    return (
        <div className="flex flex-col gap-8">
            <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Daily Expense Logs</h1>
                    <p className="text-muted-foreground">Historical records of truck advances, maintenance, and petty cash purchases.</p>
                </div>
                <div className="flex items-center gap-2">
                    <div className="relative">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input type="search" placeholder="Search logs..." className="pl-8 sm:w-[250px]" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                    </div>
                    {hasPermission('fleet', 'create') && (
                        <Button onClick={() => router.push('/fleet/transactions/expenses/new')}>
                            <PlusCircle className="mr-2 h-4 w-4" /> New Expense
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
                    label="Vehicle" 
                    values={filterVehicleIds} 
                    onSelect={setFilterVehicleIds} 
                    items={vehicles} 
                    placeholder="Vehicle" 
                    icon={Truck}
                />
                <MultiSelect 
                    label="Party / Supplier" 
                    values={filterPartyIds} 
                    onSelect={setFilterPartyIds} 
                    items={parties.filter(p => p.ownership === 'Sijan' || p.ownership === 'Both')} 
                    placeholder="Party" 
                    icon={Users}
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
                            <TableHead><Button variant="ghost" onClick={() => requestSort('date')} className="-ml-4 h-8 px-2 text-xs">Date <ArrowUpDown className="ml-2 h-3 w-3" /></Button></TableHead>
                            <TableHead><Button variant="ghost" onClick={() => requestSort('voucherNo')} className="-ml-4 h-8 px-2 text-xs">Voucher # <ArrowUpDown className="ml-2 h-3 w-3" /></Button></TableHead>
                            <TableHead className="text-xs">Vehicle</TableHead>
                            <TableHead><Button variant="ghost" onClick={() => requestSort('expenseType')} className="-ml-4 h-8 px-2 text-xs">Type <ArrowUpDown className="ml-2 h-3 w-3" /></Button></TableHead>
                            <TableHead className="text-xs">Payee / Detail</TableHead>
                            <TableHead><Button variant="ghost" onClick={() => requestSort('amount')} className="-ml-4 h-8 px-2 text-xs text-right w-full">Total Amount <ArrowUpDown className="ml-2 h-3 w-3" /></Button></TableHead>
                            <TableHead className="text-right text-xs">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            <TableRow><TableCell colSpan={7} className="text-center py-12"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></TableCell></TableRow>
                        ) : filteredAndSortedExpenses.map(e => (
                            <TableRow key={e.id} className="hover:bg-muted/30 h-14">
                                <TableCell className="font-medium text-[11px] whitespace-nowrap">{toNepaliDate(e.date)}</TableCell>
                                <TableCell className="font-mono text-[11px]">{e.voucherNo}</TableCell>
                                <TableCell>
                                    <span className="text-[11px] font-bold text-blue-900 uppercase tracking-tight">
                                        {vehiclesById.get(e.vehicleId) || 'N/A'}
                                    </span>
                                </TableCell>
                                <TableCell>
                                    <Badge variant="outline" className={cn(
                                        "text-[9px] uppercase font-bold shadow-none",
                                        e.expenseType === 'Maintenance' && "border-amber-200 bg-amber-50 text-amber-700",
                                        e.expenseType === 'Advance' && "border-emerald-200 bg-emerald-50 text-emerald-700",
                                        e.expenseType === 'Loan Repayment' && "border-orange-200 bg-orange-50 text-orange-700",
                                        e.expenseType === 'Membership Renewal' && "border-purple-200 bg-purple-50 text-purple-700",
                                    )}>
                                        {e.expenseType}
                                    </Badge>
                                </TableCell>
                                <TableCell className="py-3">
                                    <div className="flex flex-col">
                                        <span className="text-[11px] font-semibold text-gray-900">
                                            {e.partyId ? partiesById.get(e.partyId) : e.destination ? `To ${e.destination}` : 'Direct Cash'}
                                        </span>
                                        {e.remarks && <span className="text-[9px] text-muted-foreground italic line-clamp-1">{e.remarks}</span>}
                                    </div>
                                </TableCell>
                                <TableCell className="text-right font-bold text-red-600 text-[11px] tabular-nums">
                                    Rs. {(e.amount + (e.extraAmount || 0)).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </TableCell>
                                <TableCell className="text-right">
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            <DropdownMenuItem onSelect={() => router.push(`/fleet/transactions/expenses/edit?id=${e.id}`)}><Edit className="mr-2 h-4 w-4" /> Edit Record</DropdownMenuItem>
                                            <DropdownMenuItem onSelect={() => router.push(`/fleet/transactions/expenses/new`)}><PlusCircle className="mr-2 h-4 w-4" /> New Entry</DropdownMenuItem>
                                            <DropdownMenuSeparator />
                                            <AlertDialog><AlertDialogTrigger asChild><DropdownMenuItem onSelect={e => e.preventDefault()} className="text-destructive"><Trash2 className="mr-2 h-4 w-4" /> Delete</DropdownMenuItem></AlertDialogTrigger>
                                            <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete Record?</AlertDialogTitle><AlertDialogDescription>This action cannot be undone.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => handleDelete(e.id)}>Confirm Delete</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </TableCell>
                            </TableRow>
                        ))}
                        {!isLoading && filteredAndSortedExpenses.length === 0 && <TableRow><TableCell colSpan={7} className="text-center py-12 text-muted-foreground italic">No expense records found.</TableCell></TableRow>}
                    </TableBody>
                </Table>
            </Card>
        </div>
    );
}
