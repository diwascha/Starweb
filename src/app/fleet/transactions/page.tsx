'use client';

import { useState, useEffect, useMemo } from 'react';
import type { Transaction, Vehicle, Party } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { PlusCircle, Search, ArrowUpDown, MoreHorizontal, View, Trash2, CalendarIcon, Download, X, FileSpreadsheet, FileText, Loader2 } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
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
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipProvider, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import NepaliDate from 'nepali-date-converter';
import { NEPALI_MONTHS } from '@/lib/constants';

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

    const sortedAndFilteredTransactions = useMemo(() => {
        let augmented = transactions.map(t => ({
            ...t,
            vehicleName: vehiclesById.get(t.vehicleId) || 'N/A',
            partyName: t.partyId ? partiesById.get(t.partyId) || 'N/A' : 'N/A',
        }));

        if (activeTab !== 'All') {
            augmented = augmented.filter(t => t.type === activeTab);
        }
        
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            augmented = augmented.filter(t =>
                t.vehicleName.toLowerCase().includes(query) ||
                t.partyName.toLowerCase().includes(query) ||
                (t.remarks || '').toLowerCase().includes(query) ||
                (t.category || '').toLowerCase().includes(query)
            );
        }

        if (dateRange?.from) {
            const interval = { start: startOfDay(dateRange.from), end: endOfDay(dateRange.to || dateRange.from) };
            augmented = augmented.filter(t => isWithinInterval(new Date(t.date), interval));
        }

        if (selectedBsYear !== 'All') {
            augmented = augmented.filter(t => {
                try {
                    return new NepaliDate(new Date(t.date)).getYear() === parseInt(selectedBsYear);
                } catch { return false; }
            });
        }

        if (selectedBsMonth !== 'All') {
            augmented = augmented.filter(t => {
                try {
                    return new NepaliDate(new Date(t.date)).getMonth() === parseInt(selectedBsMonth);
                } catch { return false; }
            });
        }
        
        if (filterPartyId !== 'All') augmented = augmented.filter(t => t.partyId === filterPartyId);
        if (filterVehicleId !== 'All') augmented = augmented.filter(t => t.vehicleId === filterVehicleId);
        
        augmented.sort((a, b) => {
            const aVal = (a[sortConfig.key] || '').toString();
            const bVal = (b[sortConfig.key] || '').toString();
            if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
        
        return augmented;
    }, [transactions, searchQuery, sortConfig, vehiclesById, partiesById, dateRange, activeTab, filterPartyId, filterVehicleId, selectedBsYear, selectedBsMonth]);
    
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
                t.category || 'N/A',
                t.partyName,
                (['Purchase', 'Payment'].includes(t.type) ? -t.amount : t.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })
            ]);

            autoTable(doc, {
                startY: 30,
                head: [['Date (BS)', 'Vehicle', 'Type', 'Category', 'Ledger', 'Amount (NPR)']],
                body: tableData,
                theme: 'grid',
                headStyles: { fillColor: [71, 85, 105] }
            });

            doc.save(`Account_Logs_Report_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
        }
    };

    return (
        <div className="flex flex-col gap-8">
            <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Account Logs</h1>
                    <p className="text-muted-foreground">Comprehensive financial history for Sijan Dhuwani Sewa.</p>
                </div>
                <div className="flex items-center gap-2">
                    <div className="relative">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input placeholder="Search logs..." className="pl-8 sm:w-[250px]" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                    </div>
                    <Button onClick={() => router.push('/fleet/transactions/payment-receipt/new')}>
                        <PlusCircle className="mr-2 h-4 w-4" /> New Voucher
                    </Button>
                </div>
            </header>

            <div className="flex flex-col gap-4 bg-muted/20 p-4 rounded-lg border border-dashed">
                <div className="flex flex-wrap gap-4 items-end">
                    <div className="space-y-1.5">
                        <Label className="text-[10px] uppercase font-bold text-muted-foreground">Year (BS)</Label>
                        <Select value={selectedBsYear} onValueChange={setSelectedBsYear} disabled={isLoading || availableYears.length === 0}>
                            <SelectTrigger className="w-[120px] bg-white">
                                <SelectValue placeholder="All Years" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="All">All Years</SelectItem>
                                {availableYears.map(year => <SelectItem key={year} value={String(year)}>{year}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-[10px] uppercase font-bold text-muted-foreground">Month (BS)</Label>
                        <Select value={selectedBsMonth} onValueChange={setSelectedBsMonth} disabled={isLoading || availableYears.length === 0}>
                            <SelectTrigger className="w-[150px] bg-white">
                                <SelectValue placeholder="All Months" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="All">All Months</SelectItem>
                                {NEPALI_MONTHS.map(month => <SelectItem key={month.value} value={String(month.value)}>{month.name}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-1.5 w-full md:w-[250px]">
                        <Label className="text-[10px] uppercase font-bold text-muted-foreground">Custom AD Range</Label>
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button variant="outline" className={cn("w-full justify-start text-left font-normal bg-white", !dateRange && "text-muted-foreground")}>
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {dateRange?.from ? (dateRange.to ? (`${format(dateRange.from, "LLL dd, y")} - ${format(dateRange.to, "LLL dd, y")}`) : format(dateRange.from, "LLL dd, y")) : (<span>Pick a range</span>)}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                                <DualDateRangePicker selected={dateRange} onSelect={setDateRange} />
                            </PopoverContent>
                        </Popover>
                    </div>
                    <div className="space-y-1.5 w-full md:w-[150px]">
                        <Label className="text-[10px] uppercase font-bold text-muted-foreground">Vehicle</Label>
                        <Select value={filterVehicleId} onValueChange={setFilterVehicleId}>
                            <SelectTrigger className="bg-white"><SelectValue placeholder="All" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="All">All Vehicles</SelectItem>
                                {vehicles.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-1.5 w-full md:w-[220px]">
                        <Label className="text-[10px] uppercase font-bold text-muted-foreground">Party / Service Provider</Label>
                        <Select value={filterPartyId} onValueChange={setFilterPartyId}>
                            <SelectTrigger className="bg-white"><SelectValue placeholder="All" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="All">All Parties</SelectItem>
                                {parties.filter(p => p.ownership === 'Sijan' || p.ownership === 'Both').map(p => (
                                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                <div className="flex gap-2 w-full md:w-auto items-center pt-2 border-t border-dashed">
                    {isFiltered && (
                        <Button variant="ghost" size="sm" onClick={handleClearFilters} className="text-muted-foreground hover:text-foreground">
                            <X className="mr-2 h-4 w-4" /> Clear All Filters
                        </Button>
                    )}
                    <div className="ml-auto flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => handleExport('excel')}>
                            <FileSpreadsheet className="mr-2 h-4 w-4 text-emerald-600" /> Export Excel
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => handleExport('pdf')}>
                            <FileText className="mr-2 h-4 w-4 text-red-600" /> Export PDF
                        </Button>
                    </div>
                </div>
            </div>

            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
                <TabsList>
                    <TabsTrigger value="All">All Entries</TabsTrigger>
                    <TabsTrigger value="Payment">Payments</TabsTrigger>
                    <TabsTrigger value="Receipt">Receipts</TabsTrigger>
                    <TabsTrigger value="Purchase">Purchases</TabsTrigger>
                    <TabsTrigger value="Sales">Sales</TabsTrigger>
                </TabsList>
                <TabsContent value={activeTab} className="mt-4">
                    <Card>
                        <Table>
                            <TableHeader className="bg-muted/50">
                                <TableRow>
                                    <TableHead><Button variant="ghost" onClick={() => requestSort('date')} className="-ml-4">Date <ArrowUpDown className="ml-2 h-3 w-3" /></Button></TableHead>
                                    <TableHead><Button variant="ghost" onClick={() => requestSort('vehicleName')} className="-ml-4">Vehicle <ArrowUpDown className="ml-2 h-3 w-3" /></Button></TableHead>
                                    <TableHead><Button variant="ghost" onClick={() => requestSort('type')} className="-ml-4">Type <ArrowUpDown className="ml-2 h-3 w-3" /></Button></TableHead>
                                    <TableHead><Button variant="ghost" onClick={() => requestSort('category')} className="-ml-4">Category <ArrowUpDown className="ml-2 h-3 w-3" /></Button></TableHead>
                                    <TableHead><Button variant="ghost" onClick={() => requestSort('partyName')} className="-ml-4">Ledger (A/C) <ArrowUpDown className="ml-2 h-3 w-3" /></Button></TableHead>
                                    <TableHead className="text-right"><Button variant="ghost" onClick={() => requestSort('amount')} className="-ml-4 w-full text-right">Amount <ArrowUpDown className="ml-2 h-3 w-3" /></Button></TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLoading ? (
                                    <TableRow><TableCell colSpan={7} className="text-center py-12"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></TableCell></TableRow>
                                ) : sortedAndFilteredTransactions.map(txn => (
                                    <TableRow key={txn.id} className="hover:bg-muted/30">
                                        <TableCell className="font-medium text-xs whitespace-nowrap">{toNepaliDate(txn.date)}</TableCell>
                                        <TableCell className="font-semibold text-xs">{txn.vehicleName}</TableCell>
                                        <TableCell>
                                            <Badge variant="outline" className={cn(
                                                "text-[10px] uppercase",
                                                ['Receipt', 'Sales'].includes(txn.type) ? 'text-green-600 border-green-200 bg-green-50' : 'text-red-600 border-red-200 bg-red-50'
                                            )}>{txn.type}</Badge>
                                        </TableCell>
                                        <TableCell><span className="text-[10px] text-muted-foreground uppercase font-bold">{txn.category || 'N/A'}</span></TableCell>
                                        <TableCell className="text-xs">{txn.partyName}</TableCell>
                                        <TableCell className={cn("text-right font-mono font-bold text-xs", ['Purchase', 'Payment'].includes(txn.type) ? 'text-red-600' : 'text-green-600')}>
                                            {['Purchase', 'Payment'].includes(txn.type) && '-'}{txn.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    <DropdownMenuItem onSelect={() => router.push(txn.voucherId ? `/fleet/transactions/payment-receipt?voucherId=${txn.voucherId}` : `/fleet/transactions/view?id=${txn.id}`)}><View className="mr-2 h-4 w-4" /> View Voucher</DropdownMenuItem>
                                                    {hasPermission('fleet', 'edit') && (
                                                        <DropdownMenuItem onSelect={() => router.push(txn.voucherId ? `/fleet/transactions/payment-receipt/edit?voucherId=${txn.voucherId}` : `/fleet/transactions/edit?id=${txn.id}`)}><Edit className="mr-2 h-4 w-4" /> Edit Entry</DropdownMenuItem>
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
                                {!isLoading && sortedAndFilteredTransactions.length === 0 && <TableRow><TableCell colSpan={7} className="text-center py-12 text-muted-foreground">No financial logs found matching your filters.</TableCell></TableRow>}
                            </TableBody>
                            {!isLoading && sortedAndFilteredTransactions.length > 0 && (
                                <TableFooter>
                                    <TableRow className="bg-muted/50 font-bold">
                                        <TableCell colSpan={5} className="text-right text-xs">Net Balance for Filtered Period</TableCell>
                                        <TableCell className={cn(
                                            "text-right font-mono text-xs",
                                            sortedAndFilteredTransactions.reduce((sum, t) => sum + (['Purchase', 'Payment'].includes(t.type) ? -t.amount : t.amount), 0) >= 0 ? 'text-green-600' : 'text-red-600'
                                        )}>
                                            Rs. {sortedAndFilteredTransactions.reduce((sum, t) => sum + (['Purchase', 'Payment'].includes(t.type) ? -t.amount : t.amount), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        </TableCell>
                                        <TableCell></TableCell>
                                    </TableRow>
                                </TableFooter>
                            )}
                        </Table>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}
