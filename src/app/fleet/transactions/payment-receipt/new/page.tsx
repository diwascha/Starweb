
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
import { PlusCircle } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { toNepaliDate } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';


export default function NewPaymentReceiptPage() {
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [parties, setParties] = useState<Party[]>([]);
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [filterType, setFilterType] = useState<'All' | 'Payment' | 'Receipt'>('All');

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
    
    const filteredVoucherTransactions = useMemo(() => {
        return transactions
            .filter(t => {
                const isVoucher = t.type === 'Payment' || t.type === 'Receipt';
                if (!isVoucher) return false;
                if (filterType === 'All') return true;
                return t.type === filterType;
            })
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [transactions, filterType]);

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
                        <TabsList>
                            <TabsTrigger value="All">All</TabsTrigger>
                            <TabsTrigger value="Payment">Payments</TabsTrigger>
                            <TabsTrigger value="Receipt">Receipts</TabsTrigger>
                        </TabsList>
                        <TabsContent value={filterType}>
                            <Card className="mt-4">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Date</TableHead>
                                            <TableHead>Type</TableHead>
                                            <TableHead>Vehicle</TableHead>
                                            <TableHead>Party</TableHead>
                                            <TableHead>Amount</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {filteredVoucherTransactions.map(txn => (
                                            <TableRow key={txn.id}>
                                                <TableCell>{toNepaliDate(txn.date)}</TableCell>
                                                <TableCell><Badge variant="outline">{txn.type}</Badge></TableCell>
                                                <TableCell>{vehiclesById.get(txn.vehicleId) || 'N/A'}</TableCell>
                                                <TableCell>{partiesById.get(txn.partyId!) || 'N/A'}</TableCell>
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
