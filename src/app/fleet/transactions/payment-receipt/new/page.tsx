
'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import type { Transaction, Vehicle, Party, Account } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { onVehiclesUpdate } from '@/services/vehicle-service';
import { onPartiesUpdate } from '@/services/party-service';
import { onAccountsUpdate } from '@/services/account-service';
import { onTransactionsUpdate, saveVoucher } from '@/services/transaction-service';
import { PaymentReceiptForm } from '../../_components/payment-receipt-form';
import { Dialog, DialogContent, DialogTrigger, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { PlusCircle, Download, CalendarIcon, ArrowUpDown } from 'lucide-react';
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

type SortKey = 'date' | 'vehicleName' | 'partyName' | 'amount';
type SortDirection = 'asc' | 'desc';


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

    const { toast } = useToast();
    const { user } = useAuth();
    const router = useRouter();

    const vehiclesById = useMemo(() => new Map(vehicles.map(v => [v.id, v.name])), [vehicles]);
    const partiesById = useMemo(() => new Map(parties.map(p => [p.id, p.name])), [parties]);

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
    
    const requestSort = (key: SortKey) => {
        let direction: SortDirection = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const filteredAndSortedVouchers = useMemo(() => {
        let filtered = transactions
            .filter(t => t.type === 'Payment' || t.type === 'Receipt')
            .map(t => ({
                ...t,
                vehicleName: vehiclesById.get(t.vehicleId) || 'N/A',
                partyName: t.partyId ? partiesById.get(t.partyId) || 'N/A' : 'N/A'
            }));

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

        filtered.sort((a, b) => {
            const aVal = a[sortConfig.key];
            const bVal = b[sortConfig.key];
            if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });

        return filtered;
    }, [transactions, filterType, dateRange, sortConfig, vehiclesById, partiesById]);
    
    const handleExport = () => {
        const dataToExport = filteredAndSortedVouchers.map(v => ({
            Date: toNepaliDate(v.date),
            Type: v.type,
            Vehicle: v.vehicleName,
            Party: v.partyName,
            Amount: v.amount,
            Remarks: v.remarks,
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
                        <div className="flex justify-between items-center">
                            <TabsList>
                                <TabsTrigger value="All">All</TabsTrigger>
                                <TabsTrigger value="Payment">Payments</TabsTrigger>
                                <TabsTrigger value="Receipt">Receipts</TabsTrigger>
                            </TabsList>
                             <div className="flex items-center gap-2">
                                <Popover><PopoverTrigger asChild>
                                    <Button id="date" variant={"outline"} className={cn("w-full md:w-[300px] justify-start text-left font-normal", !dateRange && "text-muted-foreground")}>
                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                        {dateRange?.from ? (dateRange.to ? (`${format(dateRange.from, "LLL dd, y")} - ${format(dateRange.to, "LLL dd, y")}`) : format(dateRange.from, "LLL dd, y")) : (<span>Pick a date range</span>)}
                                    </Button>
                                </PopoverTrigger><PopoverContent className="w-auto p-0" align="end"><DualDateRangePicker selected={dateRange} onSelect={setDateRange} /></PopoverContent></Popover>
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
                                            <TableHead><Button variant="ghost" onClick={() => requestSort('date')}>Date <ArrowUpDown className="ml-2 h-4 w-4" /></Button></TableHead>
                                            <TableHead>Type</TableHead>
                                            <TableHead><Button variant="ghost" onClick={() => requestSort('vehicleName')}>Vehicle <ArrowUpDown className="ml-2 h-4 w-4" /></Button></TableHead>
                                            <TableHead><Button variant="ghost" onClick={() => requestSort('partyName')}>Party <ArrowUpDown className="ml-2 h-4 w-4" /></Button></TableHead>
                                            <TableHead><Button variant="ghost" onClick={() => requestSort('amount')}>Amount <ArrowUpDown className="ml-2 h-4 w-4" /></Button></TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {filteredAndSortedVouchers.map(txn => (
                                            <TableRow key={txn.id}>
                                                <TableCell>{toNepaliDate(txn.date)}</TableCell>
                                                <TableCell><Badge variant="outline">{txn.type}</Badge></TableCell>
                                                <TableCell>{txn.vehicleName}</TableCell>
                                                <TableCell>{txn.partyName}</TableCell>
                                                <TableCell className={cn(txn.type === 'Payment' ? 'text-red-600' : 'text-green-600')}>{txn.amount.toLocaleString()}</TableCell>
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
