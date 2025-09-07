
'use client';

import { useState, useEffect } from 'react';
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


export default function NewPaymentReceiptPage() {
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [parties, setParties] = useState<Party[]>([]);
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
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
            router.push('/fleet/transactions');
        } catch (error) {
            console.error("Failed to save voucher:", error);
            toast({ title: "Error", description: "Failed to save voucher.", variant: "destructive" });
        }
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
                 <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm py-24">
                  <div className="flex flex-col items-center gap-1 text-center">
                    <h3 className="text-2xl font-bold tracking-tight">Create a Voucher</h3>
                    <p className="text-sm text-muted-foreground">Click the button above to get started.</p>
                  </div>
                </div>
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
