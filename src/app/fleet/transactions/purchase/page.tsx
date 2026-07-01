
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
  View, 
  Edit, 
  Trash2, 
  User, 
  Download, 
  CalendarIcon, 
  X, 
  FileSpreadsheet, 
  FileText, 
  Loader2, 
  Eye,
  Check,
  ChevronDown,
  FilterX
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { cn, toNepaliDate } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import { onTransactionsUpdate, deleteTransaction } from '@/services/transaction-service';
import { onVehiclesUpdate } from '@/services/vehicle-service';
import { onPartiesUpdate } from '@/services/party-service';
import { Tooltip, TooltipProvider, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
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

type SortKey = 'date' | 'vehicleName' | 'partyName' | 'amount' | 'authorship' | 'category';
type SortDirection = 'asc' | 'desc';

// Helper component for multi-select
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
            : `${values.length} ${placeholder}s`;

    return (
        <div className="space-y-1.5 flex-1 min-w-[140px]">
            <Label className="text-[10px] uppercase font-bold text-muted-foreground">{label}</Label>
            <Popover>
                <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-between h-9 bg-white border-gray-200 shadow-none font-normal text-xs px-3 text-left">
                        <div className="flex items-center gap-2 overflow-hidden">
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

export default function PurchaseLogsPage() {
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [parties, setParties] = useState<Party[]>([]);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    
    const [searchQuery, setSearchQuery] = useState('');
    const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
    const [filterBsYears, setFilterBsYears] = useState<string[]>([]);
    const [filterBsMonths, setFilterBsMonths] = useState<string[]>([]);
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection }>({ key: 'date', direction: 'desc' });
    const [filterVehicleId, setFilterVehicleId] = useState<string>('All');
    const [filterPartyId, setFilterPartyId] = useState<string>('All');

    const { toast } = useToast();
    const { user, hasPermission } = useAuth();
    const router = useRouter();

    useEffect(() => {
        setIsLoading(true);
        const unsubs = [
            onVehiclesUpdate(setVehicles),
            onPartiesUpdate(setParties),
            onTransactionsUpdate(setTransactions)
        ];
        setIsLoading(false);
        return () => unsubs.forEach(u => u());
    }, []);

    const { availableYears } = useMemo(() => {
        const years = new Set<number>();
        transactions.filter(t => t.type === 'Purchase').forEach(p => {
            try {
                years.add(new NepaliDate(new Date(p.date)).getYear());
            } catch {}
        });
        return {
            availableYears: Array.from(years).sort((a, b) => b - a),
        };
    }, [transactions]);

    const vehiclesById = useMemo(() => new Map(vehicles.map(v => [v.id, v.name])), [vehicles]);
    const partiesById = useMemo(() => new Map(parties.map(p => [p.id, p.name])), [parties]);

    const filteredAndSortedPurchases = useMemo(() => {
        let filtered = transactions.filter(t => t.type === 'Purchase');

        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            filtered = filtered.filter(t => 
                (vehiclesById.get(t.vehicleId) || '').toLowerCase().includes(query) ||
                (partiesById.get(t.partyId!) || '').toLowerCase().includes(query) ||
                (t.invoiceNumber || '').toLowerCase().includes(query) ||
                (t.category || '').toLowerCase().includes(query)
            );
        }
        
        if (dateRange?.from) {
            const interval = { start: startOfDay(dateRange.from), end: endOfDay(dateRange.to || dateRange.from) };
            filtered = filtered.filter(t => isWithinInterval(new Date(t.date), interval));
        }

        if (filterBsYears.length > 0) {
            filtered = filtered.filter(p => {
                try {
                    const year = new NepaliDate(new Date(p.date)).getYear();
                    return filterBsYears.includes(String(year));
                } catch { return false; }
            });
        }

        if (filterBsMonths.length > 0) {
            filtered = filtered.filter(p => {
                try {
                    const month = new NepaliDate(new Date(p.date)).getMonth();
                    return filterBsMonths.includes(String(month));
                } catch { return false; }
            });
        }
        
        if (filterVehicleId !== 'All') filtered = filtered.filter(v => v.vehicleId === filterVehicleId);
        if (filterPartyId !== 'All') filtered = filtered.filter(v => v.partyId === filterPartyId);
        
        filtered.sort((a, b) => {
            if (sortConfig.key === 'authorship') {
                const aDate = a.lastModifiedAt || a.createdAt;
                const bDate = b.lastModifiedAt || b.createdAt;
                if (!aDate || !bDate) return 0;
                const res = aDate < bDate ? -1 : 1;
                return sortConfig.direction === 'asc' ? res : -res;
            }
            
            let aVal, bVal;
            if (sortConfig.key === 'vehicleName') {
                aVal = vehiclesById.get(a.vehicleId) || '';
                bVal = vehiclesById.get(b.vehicleId) || '';
            } else if (sortConfig.key === 'partyName') {
                 aVal = partiesById.get(a.partyId!) || '';
                 bVal = partiesById.get(b.partyId!) || '';
            } else {
                aVal = (a[sortConfig.key as keyof Transaction] || '').toString();
                bVal = (b[sortConfig.key as keyof Transaction] || '').toString();
            }

            if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });

        return filtered;
    }, [transactions, searchQuery, dateRange, filterBsYears, filterBsMonths, sortConfig, filterVehicleId, filterPartyId, vehiclesById, partiesById]);

    const isFiltered = useMemo(() => {
        return searchQuery !== '' || 
               !!dateRange || 
               filterBsYears.length > 0 || 
               filterBsMonths.length > 0 || 
               filterVehicleId !== 'All' || 
               filterPartyId !== 'All';
    }, [searchQuery, dateRange, filterBsYears, filterBsMonths, filterVehicleId, filterPartyId]);

    const handleClearFilters = () => {
        setSearchQuery('');
        setDateRange(undefined);
        setFilterBsYears([]);
        setFilterBsMonths([]);
        setFilterVehicleId('All');
        setFilterPartyId('All');
    };

    const handleDelete = async (id: string) => {
        try {
            await deleteTransaction(id);
            toast({ title: 'Success', description: 'Purchase deleted.' });
        } catch (error) {
             toast({ title: 'Error', description: 'Failed to delete purchase.', variant: 'destructive' });
        }
    };

    const requestSort = (key: SortKey) => {
        setSortConfig(prev => ({
            key,
            direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
        }));
    };

    const handleExport = async (formatType: 'excel' | 'pdf') => {
        if (formatType === 'excel') {
            const XLSX = (await import('xlsx'));
            const dataToExport = filteredAndSortedPurchases.map(p => ({
                'Date (BS)': toNepaliDate(p.date),
                'Vehicle': vehiclesById.get(p.vehicleId),
                'Category': p.category || 'N/A',
                'Supplier': partiesById.get(p.partyId!),
                'Amount (NPR)': p.amount,
                'Posted By': p.lastModifiedBy || p.createdBy,
            }));
            const worksheet = XLSX.utils.json_to_sheet(dataToExport);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "Purchases");
            XLSX.writeFile(workbook, `Purchase_Logs_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
        } else {
            const { jsPDF } = await import('jspdf');
            const { default: autoTable } = await import('jspdf-autotable');
            const doc = new jsPDF();
            doc.text("Purchase Logs Report", 14, 15);
            doc.setFontSize(10);
            doc.text(`Generated on: ${format(new Date(), 'PPP')}`, 14, 22);

            const tableData = filteredAndSortedPurchases.map(p => [
                toNepaliDate(p.date),
                vehiclesById.get(p.vehicleId) || 'N/A',
                p.category || 'N/A',
                partiesById.get(p.partyId!) || 'N/A',
                p.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })
            ]);

            autoTable(doc, {
                startY: 30,
                head: [['Date (BS)', 'Vehicle', 'Category', 'Supplier', 'Amount (NPR)']],
                body: tableData,
                theme: 'grid',
                headStyles: { fillColor: [71, 85, 105] }
            });

            doc.save(`Purchase_Logs_Report_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
        }
    };

    return (
        <div className="flex flex-col gap-8">
            <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Purchase Logs</h1>
                    <p className="text-muted-foreground">Historical records of all fleet procurement and maintenance expenses.</p>
                </div>
                <div className="flex items-center gap-2">
                    <div className="relative">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input type="search" placeholder="Search logs..." className="pl-8 sm:w-[250px]" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                    </div>
                    {hasPermission('fleet', 'create') && (
                        <Button onClick={() => router.push('/fleet/transactions/purchase/new')}>
                            <PlusCircle className="mr-2 h-4 w-4" /> New Purchase
                        </Button>
                    )}
                </div>
            </header>

            <div className="flex flex-col gap-4 bg-muted/20 p-4 rounded-lg border border-dashed">
                <div className="flex flex-wrap gap-4 items-end">
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
                    <div className="space-y-1.5 w-full md:w-[200px]">
                        <Label className="text-[10px] uppercase font-bold text-muted-foreground">Custom AD Range</Label>
                        <Popover><PopoverTrigger asChild><Button variant="outline" className={cn("w-full h-9 justify-start text-left font-normal bg-white text-xs", !dateRange && "text-muted-foreground")}><CalendarIcon className="mr-2 h-3.5 w-3.5" />{dateRange?.from ? (dateRange.to ? (`${format(dateRange.from, "MMM d")} - ${format(dateRange.to, "MMM d")}`) : format(dateRange.from, "MMM d")) : (<span>Pick dates</span>)}</Button></PopoverTrigger><PopoverContent className="w-auto p-0" align="start"><DualDateRangePicker selected={dateRange} onSelect={setDateRange} /></PopoverContent></Popover>
                    </div>
                    <div className="space-y-1.5 w-full md:w-[150px]">
                        <Label className="text-[10px] uppercase font-bold text-muted-foreground">Vehicle</Label>
                        <Select value={filterVehicleId} onValueChange={setFilterVehicleId}><SelectTrigger className="bg-white h-9 text-xs"><SelectValue placeholder="All" /></SelectTrigger><SelectContent><SelectItem value="All">All Vehicles</SelectItem>{vehicles.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}</SelectContent></Select>
                    </div>
                    <div className="space-y-1.5 w-full md:w-[200px]">
                        <Label className="text-[10px] uppercase font-bold text-muted-foreground">Party / Service Provider</Label>
                        <Select value={filterPartyId} onValueChange={setFilterPartyId}>
                            <SelectTrigger className="bg-white h-9 text-xs">
                                <SelectValue placeholder="All" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="All">All Parties</SelectItem>
                                {parties.filter(p => (p.type === 'Vendor' || p.type === 'Both') && (p.ownership === 'Sijan' || p.ownership === 'Both')).map(p => (
                                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
                
                <div className="flex gap-2 w-full md:w-auto items-center pt-2 border-t border-dashed">
                    {isFiltered && (
                        <Button variant="ghost" size="sm" onClick={handleClearFilters} className="text-muted-foreground hover:text-foreground h-8 px-2 text-xs">
                            <FilterX className="mr-2 h-3.5 w-3.5" /> Clear All Filters
                        </Button>
                    )}
                    <div className="ml-auto flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => handleExport('excel')} className="h-8 text-xs">
                            <FileSpreadsheet className="mr-2 h-3.5 w-3.5 text-emerald-600" /> Excel
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => handleExport('pdf')} className="h-8 text-xs">
                            <FileText className="mr-2 h-3.5 w-3.5 text-red-600" /> PDF
                        </Button>
                    </div>
                </div>
            </div>

            <Card>
                <Table>
                    <TableHeader className="bg-muted/50">
                        <TableRow>
                            <TableHead><Button variant="ghost" onClick={() => requestSort('date')} className="-ml-4 h-8 px-2 text-xs">Date <ArrowUpDown className="ml-2 h-3 w-3" /></Button></TableHead>
                            <TableHead><Button variant="ghost" onClick={() => requestSort('vehicleName')} className="-ml-4 h-8 px-2 text-xs">Vehicle <ArrowUpDown className="ml-2 h-3 w-3" /></Button></TableHead>
                            <TableHead><Button variant="ghost" onClick={() => requestSort('category')} className="-ml-4 h-8 px-2 text-xs font-bold text-primary">Category <ArrowUpDown className="ml-2 h-3 w-3" /></Button></TableHead>
                            <TableHead><Button variant="ghost" onClick={() => requestSort('partyName')} className="-ml-4 h-8 px-2 text-xs">Supplier <ArrowUpDown className="ml-2 h-3 w-3" /></Button></TableHead>
                            <TableHead><Button variant="ghost" onClick={() => requestSort('amount')} className="-ml-4 h-8 px-2 text-xs">Amount <ArrowUpDown className="ml-2 h-3 w-3" /></Button></TableHead>
                            <TableHead className="text-xs">Author</TableHead>
                            <TableHead className="text-right text-xs">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            <TableRow><TableCell colSpan={7} className="text-center py-12"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></TableCell></TableRow>
                        ) : filteredAndSortedPurchases.map(txn => (
                            <TableRow key={txn.id} className="hover:bg-muted/30">
                                <TableCell className="font-medium text-[11px] whitespace-nowrap">{toNepaliDate(txn.date)}</TableCell>
                                <TableCell className="font-semibold text-[11px]">{vehiclesById.get(txn.vehicleId) || 'N/A'}</TableCell>
                                <TableCell>
                                    <Badge variant="outline" className={cn(
                                        "text-[9px] uppercase font-bold",
                                        txn.category === 'Fuel' && "border-blue-200 bg-blue-50 text-blue-700",
                                        txn.category === 'Maintenance' && "border-amber-200 bg-amber-50 text-amber-700",
                                        txn.category === 'Advance' && "border-emerald-200 bg-emerald-50 text-emerald-700",
                                        txn.category === 'Loan Repayment' && "border-orange-200 bg-orange-50 text-orange-700",
                                        txn.category === 'Membership Renewal' && "border-purple-200 bg-purple-50 text-purple-700",
                                        !txn.category && "border-slate-200 bg-slate-50 text-slate-700"
                                    )}>
                                        {txn.category || 'Other'}
                                    </Badge>
                                </TableCell>
                                <TableCell className="text-[11px]">{partiesById.get(txn.partyId!) || 'N/A'}</TableCell>
                                <TableCell className="text-red-600 font-mono font-bold text-[11px]">-{txn.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                <TableCell>
                                    <TooltipProvider><Tooltip><TooltipTrigger className="text-[10px] text-muted-foreground uppercase font-bold">{txn.lastModifiedBy || txn.createdBy}</TooltipTrigger><TooltipContent><p className="text-xs">Posted: {format(new Date(txn.createdAt), "PPpp")}</p>{txn.lastModifiedAt && <p className="text-xs">Updated: {format(new Date(txn.lastModifiedAt), "PPpp")}</p>}</TooltipContent></Tooltip></TooltipProvider>
                                </TableCell>
                                <TableCell className="text-right">
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            <DropdownMenuItem onSelect={() => router.push(`/fleet/transactions/purchase/view?id=${txn.id}`)}><Eye className="mr-2 h-4 w-4" /> View Details</DropdownMenuItem>
                                            <DropdownMenuItem onSelect={() => router.push(`/fleet/transactions/purchase/edit?id=${txn.id}`)}><Edit className="mr-2 h-4 w-4" /> Edit Record</DropdownMenuItem>
                                            <DropdownMenuSeparator />
                                            <AlertDialog><AlertDialogTrigger asChild><DropdownMenuItem onSelect={e => e.preventDefault()} className="text-destructive"><Trash2 className="mr-2 h-4 w-4 text-destructive" /> Delete</DropdownMenuItem></AlertDialogTrigger>
                                            <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete Purchase Record?</AlertDialogTitle><AlertDialogDescription>This will permanently remove the record and its financial impact. This action cannot be undone.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => handleDelete(txn.id)}>Confirm Delete</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </TableCell>
                            </TableRow>
                        ))}
                        {!isLoading && filteredAndSortedPurchases.length === 0 && <TableRow><TableCell colSpan={7} className="text-center py-12 text-muted-foreground italic">No purchase records found matching your filters.</TableCell></TableRow>}
                    </TableBody>
                </Table>
            </Card>
        </div>
    );
}
