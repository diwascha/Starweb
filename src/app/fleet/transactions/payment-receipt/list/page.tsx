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
  Receipt,
  Eye,
  ChevronDown,
  Printer
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
    totalAmount: number;
    accountName?: string;
    entriesCount: number;
    remarks?: string;
    createdBy: string;
}

export default function VoucherLogsPage() {
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    
    const [searchQuery, setSearchQuery] = useState('');
    const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
    const [filterBsYear, setFilterBsYear] = useState<string>('All');
    const [filterBsMonth, setFilterBsMonth] = useState<string>('All');
    const [filterType, setFilterType] = useState<string>('All');

    const { toast } = useToast();
    const { hasPermission } = useAuth();
    const router = useRouter();

    useEffect(() => {
        setIsLoading(true);
        const unsubs = [
            onTransactionsUpdate(setTransactions),
            onAccountsUpdate(setAccounts),
            onVehiclesUpdate(() => {}), // Just triggering updates
            onPartiesUpdate(() => {})
        ];
        setIsLoading(false);
        return () => unsubs.forEach(u => u());
    }, []);

    const accountsById = useMemo(() => new Map(accounts.map(a => [a.id, a.bankName || a.name])), [accounts]);

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
            
            return {
                voucherId: vId,
                voucherNo: first.referenceId || 'N/A',
                date: first.date,
                type: (hasPayment && hasReceipt) ? 'Mixed' : hasPayment ? 'Payment' : 'Receipt',
                billingType: first.billingType,
                accountName: first.accountId ? accountsById.get(first.accountId) : undefined,
                totalAmount: txns.reduce((sum, t) => sum + t.amount, 0),
                entriesCount: txns.length,
                remarks: first.remarks || undefined,
                createdBy: first.createdBy
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

        if (filterType !== 'All') {
            filtered = filtered.filter(v => v.type === filterType);
        }
        
        if (dateRange?.from) {
            const interval = { start: startOfDay(dateRange.from), end: endOfDay(dateRange.to || dateRange.from) };
            filtered = filtered.filter(v => isWithinInterval(new Date(v.date), interval));
        }

        if (filterBsYear !== 'All') {
            filtered = filtered.filter(v => {
                try {
                    return new NepaliDate(new Date(v.date)).getYear() === parseInt(filterBsYear);
                } catch { return false; }
            });
        }

        if (filterBsMonth !== 'All') {
            filtered = filtered.filter(v => {
                try {
                    return new NepaliDate(new Date(v.date)).getMonth() === parseInt(filterBsMonth);
                } catch { return false; }
            });
        }

        return filtered;
    }, [vouchers, searchQuery, filterType, dateRange, filterBsYear, filterBsMonth]);

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
        setFilterBsYear('All');
        setFilterBsMonth('All');
        setFilterType('All');
    };

    return (
        <div className="flex flex-col gap-8">
            <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Payment / Receipt Logs</h1>
                    <p className="text-muted-foreground">Management of multi-entry vouchers and settlements.</p>
                </div>
                <div className="flex items-center gap-2">
                    {hasPermission('fleet', 'create') && (
                        <Button onClick={() => router.push('/fleet/transactions/payment-receipt/new')}>
                            <PlusCircle className="mr-2 h-4 w-4" /> New Voucher
                        </Button>
                    )}
                </div>
            </header>

            <div className="bg-muted/20 p-4 rounded-lg border border-dashed flex flex-wrap gap-4 items-end">
                <div className="relative flex-1 min-w-[250px]">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input type="search" placeholder="Search voucher #, remarks..." className="pl-8 h-9 bg-white" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                </div>
                <div className="w-[120px] space-y-1">
                    <Label className="text-[10px] uppercase font-bold text-muted-foreground">Type</Label>
                    <Select value={filterType} onValueChange={setFilterType}>
                        <SelectTrigger className="h-9 bg-white text-xs"><SelectValue/></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="All">All Types</SelectItem>
                            <SelectItem value="Payment">Payment Only</SelectItem>
                            <SelectItem value="Receipt">Receipt Only</SelectItem>
                            <SelectItem value="Mixed">Mixed</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <div className="w-[120px] space-y-1">
                    <Label className="text-[10px] uppercase font-bold text-muted-foreground">Month (BS)</Label>
                    <Select value={filterBsMonth} onValueChange={setFilterBsMonth}>
                        <SelectTrigger className="h-9 bg-white text-xs"><SelectValue/></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="All">All Months</SelectItem>
                            {NEPALI_MONTHS.map(m => <SelectItem key={m.value} value={String(m.value)}>{m.name}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>
                <Button variant="ghost" size="sm" onClick={handleClearFilters} className="text-muted-foreground h-9 px-2 text-xs">
                    <FilterX className="mr-2 h-3.5 w-3.5" /> Reset
                </Button>
            </div>

            <Card>
                <Table>
                    <TableHeader className="bg-muted/50">
                        <TableRow>
                            <TableHead className="text-xs">Date (BS)</TableHead>
                            <TableHead className="text-xs">Voucher #</TableHead>
                            <TableHead className="text-xs">Type</TableHead>
                            <TableHead className="text-xs">Mode / Account</TableHead>
                            <TableHead className="text-xs text-center">Entries</TableHead>
                            <TableHead className="text-right text-xs">Total Amount</TableHead>
                            <TableHead className="text-right text-xs">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            <TableRow><TableCell colSpan={7} className="text-center py-12"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></TableCell></TableRow>
                        ) : filteredVouchers.map(v => (
                            <TableRow key={v.voucherId} className="hover:bg-muted/30">
                                <TableCell className="font-medium text-[11px] whitespace-nowrap">{toNepaliDate(v.date)}</TableCell>
                                <TableCell className="font-mono text-[11px] font-bold text-blue-600">{v.voucherNo}</TableCell>
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
                        {!isLoading && filteredVouchers.length === 0 && <TableRow><TableCell colSpan={7} className="text-center py-12 text-muted-foreground italic">No vouchers found.</TableCell></TableRow>}
                    </TableBody>
                </Table>
            </Card>
        </div>
    );
}
