
'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import type { Transaction, Vehicle, Party, Account } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { onVehiclesUpdate } from '@/services/vehicle-service';
import { onPartiesUpdate } from '@/services/party-service';
import { onAccountsUpdate } from '@/services/account-service';
import { onTransactionsUpdate, saveVoucher, deleteVoucher } from '@/services/transaction-service';
import { PaymentReceiptForm } from '../../_components/payment-receipt-form';
import { Dialog, DialogContent, DialogTrigger, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { PlusCircle, Download, CalendarIcon, ArrowUpDown, MoreHorizontal, View, Edit, Printer, Trash2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { toNepaliDate, cn } from '@/lib/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DualDateRangePicker } from '@/components/ui/dual-date-range-picker';
import type { DateRange } from 'react-day-picker';
import { format, isWithinInterval, startOfDay, endOfDay } from 'date-fns';
import * as XLSX from 'xlsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';


type SortKey = 'date' | 'totalAmount' | 'voucherNo';
type SortDirection = 'asc' | 'desc';

interface GroupedVoucher {
    voucherId: string;
    voucherNo: string;
    date: string;
    type: 'Payment' | 'Receipt';
    totalAmount: number;
    parties: string[];
    vehicles: string[];
    transactions: Transaction[];
}


export default function NewPaymentReceiptPage() {
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [parties, setParties] = useState<Party[]>([]);
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    
    // Filtering and Sorting state
    const [filterType, setFilterType] = useState<'All' | 'Payment' | 'Receipt'>('All');
    const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection }>({ key: 'date', direction: 'desc' });
    const [filterVehicleId, setFilterVehicleId] = useState<string>('All');
    const [filterPartyId, setFilterPartyId] = useState<string>('All');


    const { toast } = useToast();
    const { user } = useAuth();
    const router = useRouter();

    useEffect(() => {
        setIsLoading(true);
        const unsubVehicles = onVehiclesUpdate(setVehicles);
        const unsubParties = onPartiesUpdate(setParties);
        const unsubAccounts = onAccountsUpdate(setAccounts);
        const unsubTransactions = onTransactionsUpdate(setTransactions);
        setIsLoading(false);

        return () => {
            unsubVehicles();
            unsubParties();
            unsubAccounts();
            unsubTransactions();
        }
    }, []);

    const handleFormSubmit = async (values: any) => {
        if (!user) {
            toast({ title: "Error", description: "You must be logged in to save.", variant: "destructive" });
            return;
        }
        try {
            await saveVoucher(values, user.username);
            toast({ title: "Voucher Saved", description: "The voucher has been successfully recorded." });
            setIsDialogOpen(false);
        } catch (error) {
            console.error("Failed to save voucher:", error);
            toast({ title: "Error", description: "Failed to save voucher.", variant: "destructive" });
        }
    };
    
     const handleDeleteVoucher = async (voucherId: string) => {
        try {
            await deleteVoucher(voucherId);
            toast({ title: 'Voucher Deleted', description: 'The voucher and its transactions have been deleted.' });
        } catch (error) {
            toast({ title: 'Error', description: 'Failed to delete voucher.', variant: 'destructive' });
        }
    };
    
    const requestSort = (key: SortKey) => {
        let direction: SortDirection = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const filteredAndSortedVouchers = useMemo(() => {
        const paymentReceipts = transactions.filter(t => (t.type === 'Payment' || t.type === 'Receipt') && t.voucherId);

        const grouped = paymentReceipts.reduce((acc, t) => {
            if (!t.voucherId) return acc;
            
            if (!acc[t.voucherId]) {
                 const firstTransaction = t;
                 acc[t.voucherId] = {
                    voucherId: t.voucherId,
                    voucherNo: firstTransaction.items[0]?.particular.replace(/ .*/,'') || 'N/A', // hacky way to get voucherNo
                    date: t.date,
                    type: t.type as 'Payment' | 'Receipt',
                    totalAmount: 0,
                    parties: [],
                    vehicles: [],
                    transactions: [],
                };
            }
            const group = acc[t.voucherId];
            group.totalAmount += t.amount;
            if (t.partyId) group.parties.push(t.partyId);
            group.vehicles.push(t.vehicleId);
            group.transactions.push(t);

            return acc;

        }, {} as Record<string, GroupedVoucher>);
        
        let filtered = Object.values(grouped);

        if (filterType !== 'All') {
            filtered = filtered.filter(t => t.type === filterType);
        }

        if (dateRange?.from) {
            const interval = {
                start: startOfDay(dateRange.from),
                end: endOfDay(dateRange.to || dateRange.from),
            };
            filtered = filtered.filter(t => isWithinInterval(new Date(t.date), interval));
        }
        
        if (filterVehicleId !== 'All') {
            filtered = filtered.filter(v => v.vehicles.includes(filterVehicleId));
        }

        if (filterPartyId !== 'All') {
            filtered = filtered.filter(v => v.parties.includes(filterPartyId));
        }

        filtered.sort((a, b) => {
            const aVal = a[sortConfig.key];
            const bVal = b[sortConfig.key];
            if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });

        return filtered;
    }, [transactions, filterType, dateRange, sortConfig, filterVehicleId, filterPartyId]);
    
    const handleExport = () => {
        const vehiclesById = new Map(vehicles.map(v => [v.id, v.name]));
        const partiesById = new Map(parties.map(p => [p.id, p.name]));

        const dataToExport = filteredAndSortedVouchers.map(v => ({
            'Voucher #': v.voucherNo,
            Date: toNepaliDate(v.date),
            Type: v.type,
            Vehicles: [...new Set(v.vehicles.map(id => vehiclesById.get(id) || id))].join(', '),
            Parties: [...new Set(v.parties.map(id => partiesById.get(id) || id))].join(', '),
            Amount: v.totalAmount,
        }));
        
        const worksheet = XLSX.utils.json_to_sheet(dataToExport);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Vouchers");
        XLSX.writeFile(workbook, `Vouchers-${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    if (isLoading) {
        return (
            <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm py-24">
                <h3 className="text-2xl font-bold tracking-tight">Loading...</h3>
            </div>
        );
    }

    return (
         <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <div className="flex flex-col gap-8">
                 <header className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">New Payment / Receipt</h1>
                        <p className="text-muted-foreground">Record a new payment or receipt voucher.</p>
                    </div>
                    <DialogTrigger asChild>
                        <Button>
                            <PlusCircle className="mr-2 h-4 w-4" /> Create New Voucher
                        </Button>
                    </DialogTrigger>
                </header>
                 
                {transactions.filter(t => t.type === 'Payment' || t.type === 'Receipt').length === 0 ? (
                    <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm py-24">
                        <div className="flex flex-col items-center gap-1 text-center">
                            <h3 className="text-2xl font-bold tracking-tight">No Vouchers Recorded Yet</h3>
                            <p className="text-sm text-muted-foreground">Click the button above to get started.</p>
                        </div>
                    </div>
                ) : (
                    <Tabs value={filterType} onValueChange={(value) => setFilterType(value as any)}>
                        <div className="flex justify-between items-center flex-wrap gap-2">
                            <TabsList>
                                <TabsTrigger value="All">All</TabsTrigger>
                                <TabsTrigger value="Payment">Payments</TabsTrigger>
                                <TabsTrigger value="Receipt">Receipts</TabsTrigger>
                            </TabsList>
                             <div className="flex items-center gap-2 flex-wrap">
                                <Popover><PopoverTrigger asChild>
                                    <Button id="date" variant={"outline"} className={cn("w-full md:w-[250px] justify-start text-left font-normal", !dateRange && "text-muted-foreground")}>
                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                        {dateRange?.from ? (dateRange.to ? (`${format(dateRange.from, "LLL dd, y")} - ${format(dateRange.to, "LLL dd, y")}`) : format(dateRange.from, "LLL dd, y")) : (<span>Pick a date range</span>)}
                                    </Button>
                                </PopoverTrigger><PopoverContent className="w-auto p-0" align="end"><DualDateRangePicker selected={dateRange} onSelect={setDateRange} /></PopoverContent></Popover>
                                <Select value={filterVehicleId} onValueChange={setFilterVehicleId}>
                                    <SelectTrigger className="w-full md:w-[150px]"><SelectValue placeholder="All Vehicles" /></SelectTrigger>
                                    <SelectContent><SelectItem value="All">All Vehicles</SelectItem>{vehicles.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}</SelectContent>
                                </Select>
                                <Select value={filterPartyId} onValueChange={setFilterPartyId}>
                                    <SelectTrigger className="w-full md:w-[150px]"><SelectValue placeholder="All Parties" /></SelectTrigger>
                                    <SelectContent><SelectItem value="All">All Parties</SelectItem>{parties.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                                </Select>
                                <Button variant="outline" onClick={handleExport}>
                                    <Download className="mr-2 h-4 w-4" /> Export
                                </Button>
                            </div>
                        </div>
                        <TabsContent value={filterType}>
                            <Card className="mt-4">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead><Button variant="ghost" onClick={() => requestSort('voucherNo')}>Voucher # <ArrowUpDown className="ml-2 h-4 w-4" /></Button></TableHead>
                                            <TableHead><Button variant="ghost" onClick={() => requestSort('date')}>Date <ArrowUpDown className="ml-2 h-4 w-4" /></Button></TableHead>
                                            <TableHead>Type</TableHead>
                                            <TableHead><Button variant="ghost" onClick={() => requestSort('totalAmount')}>Amount <ArrowUpDown className="ml-2 h-4 w-4" /></Button></TableHead>
                                            <TableHead className="text-right">Actions</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {filteredAndSortedVouchers.map(voucher => (
                                            <TableRow key={voucher.voucherId}>
                                                <TableCell>{voucher.voucherNo}</TableCell>
                                                <TableCell>{toNepaliDate(voucher.date)}</TableCell>
                                                <TableCell><Badge variant="outline">{voucher.type}</Badge></TableCell>
                                                <TableCell className={cn(voucher.type === 'Payment' ? 'text-red-600' : 'text-green-600')}>{voucher.totalAmount.toLocaleString()}</TableCell>
                                                <TableCell className="text-right">
                                                   <DropdownMenu>
                                                        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end">
                                                            <DropdownMenuItem disabled><View className="mr-2 h-4 w-4" /> View</DropdownMenuItem>
                                                            <DropdownMenuItem disabled><Edit className="mr-2 h-4 w-4" /> Edit</DropdownMenuItem>
                                                            <DropdownMenuItem disabled><Printer className="mr-2 h-4 w-4" /> Print</DropdownMenuItem>
                                                            <DropdownMenuSeparator />
                                                            <AlertDialog>
                                                                <AlertDialogTrigger asChild><DropdownMenuItem onSelect={e => e.preventDefault()}><Trash2 className="mr-2 h-4 w-4 text-destructive" /> <span className="text-destructive">Delete</span></DropdownMenuItem></AlertDialogTrigger>
                                                                <AlertDialogContent>
                                                                    <AlertDialogHeader><AlertDialogTitle>Are you sure?</AlertDialogTitle><AlertDialogDescription>This will permanently delete the voucher and all its associated transactions.</AlertDialogDescription></AlertDialogHeader>
                                                                    <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => handleDeleteVoucher(voucher.voucherId)}>Delete</AlertDialogAction></AlertDialogFooter>
                                                                </AlertDialogContent>
                                                            </AlertDialog>
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </Card>
                        </TabsContent>
                    </Tabs>
                )}
            </div>
            <DialogContent className="max-w-4xl">
                 <DialogHeader>
                    <DialogTitle>New Payment / Receipt Voucher</DialogTitle>
                    <DialogDescription>
                        Fill in the details below to record a new voucher.
                    </DialogDescription>
                </DialogHeader>
                 <PaymentReceiptForm
                    accounts={accounts}
                    parties={parties}
                    vehicles={vehicles}
                    transactions={transactions}
                    onFormSubmit={handleFormSubmit}
                    onCancel={() => setIsDialogOpen(false)}
                />
            </DialogContent>
        </Dialog>
    );
}

