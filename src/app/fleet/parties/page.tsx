
'use client';

import { useState, useEffect, useMemo } from 'react';
import type { Transaction, Vehicle, Party } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Search, CalendarIcon, Download, MoreHorizontal, Trash2, View } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/hooks/use-auth';
import { onTransactionsUpdate, deleteTransaction } from '@/services/transaction-service';
import { onVehiclesUpdate } from '@/services/vehicle-service';
import { onPartiesUpdate } from '@/services/party-service';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn, toNepaliDate } from '@/lib/utils';
import { format, isWithinInterval, startOfDay, endOfDay } from 'date-fns';
import type { DateRange } from 'react-day-picker';
import { DualDateRangePicker } from '@/components/ui/dual-date-range-picker';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function PartyLedgerPage() {
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [parties, setParties] = useState<Party[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
    const [activePartyTab, setActivePartyTab] = useState<string>('All');
    const router = useRouter();
    const { toast } = useToast();
    const { hasPermission } = useAuth();

    const vehiclesById = useMemo(() => new Map(vehicles.map(v => [v.id, v.name])), [vehicles]);
    const partiesById = useMemo(() => new Map(parties.map(p => [p.id, p.name])), [parties]);

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
        };
    }, []);

    const handleDelete = async (id: string) => {
        try {
            await deleteTransaction(id);
            toast({ title: 'Success', description: 'Transaction deleted.' });
        } catch (error) {
             toast({ title: 'Error', description: 'Failed to delete transaction.', variant: 'destructive' });
        }
    };

    const filteredTransactions = useMemo(() => {
        let filtered = [...transactions];

        if (searchQuery) {
            const lowercasedQuery = searchQuery.toLowerCase();
            filtered = filtered.filter(t =>
                (vehiclesById.get(t.vehicleId) || '').toLowerCase().includes(lowercasedQuery) ||
                (t.partyId ? partiesById.get(t.partyId) || '' : '').toLowerCase().includes(lowercasedQuery) ||
                (t.remarks || '').toLowerCase().includes(lowercasedQuery)
            );
        }

        if (dateRange?.from) {
            const interval = {
                start: startOfDay(dateRange.from),
                end: endOfDay(dateRange.to || dateRange.from),
            };
            filtered = filtered.filter(t => isWithinInterval(new Date(t.date), interval));
        }
        
        if (activePartyTab !== 'All') {
            filtered = filtered.filter(t => t.partyId === activePartyTab);
        }
        
        return filtered.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [transactions, searchQuery, dateRange, vehiclesById, partiesById, activePartyTab]);
    
    const handleExport = async () => {
        const XLSX = (await import('xlsx'));
        const dataToExport = filteredTransactions.map(t => ({
            'Date (BS)': toNepaliDate(t.date),
            'Date (AD)': format(new Date(t.date), 'yyyy-MM-dd'),
            'Vehicle': vehiclesById.get(t.vehicleId) || 'N/A',
            'Type': t.type,
            'Party': t.partyId ? partiesById.get(t.partyId) : 'N/A',
            'Amount': t.amount,
            'Billing Type': t.billingType,
            'Remarks': t.remarks,
        }));
        
        const worksheet = XLSX.utils.json_to_sheet(dataToExport);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Transactions");
        XLSX.writeFile(workbook, `Transactions-${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    const renderContent = () => {
        if (isLoading) {
            return (
                <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm py-24">
                    <h3 className="text-2xl font-bold tracking-tight">Loading...</h3>
                </div>
            );
        }

        if (transactions.length === 0) {
            return (
                <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm py-24">
                  <div className="flex flex-col items-center gap-1 text-center">
                    <h3 className="text-2xl font-bold tracking-tight">No transactions found</h3>
                    <p className="text-sm text-muted-foreground">Sales, Purchases, and Payments will appear here once recorded.</p>
                  </div>
                </div>
            );
        }

        return (
            <Card>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Date</TableHead>
                            <TableHead>Vehicle</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Party</TableHead>
                            <TableHead>Amount</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredTransactions.map(txn => (
                            <TableRow key={txn.id}>
                                <TableCell>{toNepaliDate(txn.date)}</TableCell>
                                <TableCell>{vehiclesById.get(txn.vehicleId)}</TableCell>
                                <TableCell><Badge variant="outline">{txn.type}</Badge></TableCell>
                                <TableCell>{txn.partyId ? partiesById.get(txn.partyId) : 'N/A'}</TableCell>
                                <TableCell className={cn(['Sales', 'Receipt'].includes(txn.type) ? 'text-green-600' : 'text-red-600')}>
                                  {txn.amount.toLocaleString()}
                                </TableCell>
                                <TableCell className="text-right">
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            {hasPermission('fleet', 'delete') && (
                                                <AlertDialog>
                                                    <AlertDialogTrigger asChild><DropdownMenuItem onSelect={e => e.preventDefault()}><Trash2 className="mr-2 h-4 w-4 text-destructive" /> <span className="text-destructive">Delete</span></DropdownMenuItem></AlertDialogTrigger>
                                                    <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Are you sure?</AlertDialogTitle><AlertDialogDescription>This will permanently delete the transaction.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => handleDelete(txn.id)}>Delete</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
                                                </AlertDialog>
                                            )}
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </Card>
        );
    };

    return (
        <div className="flex flex-col gap-8">
            <header>
                <h1 className="text-3xl font-bold tracking-tight">Party Ledger</h1>
                <p className="text-muted-foreground">View ledgers for all your clients and vendors.</p>
            </header>
            <div className="flex flex-col gap-4">
                 <div className="flex flex-col md:flex-row gap-2">
                    <div className="relative flex-1">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input type="search" placeholder="Search by vehicle, party, etc..." className="pl-8 w-full" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                    </div>
                    <Popover><PopoverTrigger asChild>
                        <Button id="date" variant={"outline"} className={cn("w-full md:w-[300px] justify-start text-left font-normal", !dateRange && "text-muted-foreground")}>
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {dateRange?.from ? (dateRange.to ? (`${format(dateRange.from, "LLL dd, y")} - ${format(dateRange.to, "LLL dd, y")}`) : format(dateRange.from, "LLL dd, y")) : (<span>Pick a date range</span>)}
                        </Button>
                    </PopoverTrigger><PopoverContent className="w-auto p-0" align="end"><DualDateRangePicker selected={dateRange} onSelect={setDateRange} /></PopoverContent></Popover>
                    {activePartyTab !== 'All' && (
                        <Button variant="outline" onClick={() => router.push(`/fleet/ledger/${activePartyTab}`)}>
                            <View className="mr-2 h-4 w-4" /> View Ledger
                        </Button>
                    )}
                    <Button variant="outline" onClick={handleExport}>
                        <Download className="mr-2 h-4 w-4" /> Export
                    </Button>
                </div>
            </div>
             <Tabs value={activePartyTab} onValueChange={setActivePartyTab}>
                <TabsList className="grid w-full grid-cols-2 md:grid-cols-4 lg:grid-cols-6">
                    <TabsTrigger value="All">All Parties</TabsTrigger>
                    {parties.map(p => (
                        <TabsTrigger key={p.id} value={p.id}>{p.name}</TabsTrigger>
                    ))}
                </TabsList>
                <TabsContent value={activePartyTab} className="mt-4">
                    {renderContent()}
                </TabsContent>
            </Tabs>
        </div>
    );
}

    