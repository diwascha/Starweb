
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

export default function NewPaymentReceiptPage() {
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [parties, setParties] = useState<Party[]>([]);
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [isLoading, setIsLoading] = useState(true);
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
        <div className="flex flex-col gap-8">
            <header>
                <h1 className="text-3xl font-bold tracking-tight">New Payment / Receipt</h1>
                <p className="text-muted-foreground">Record a new payment or receipt voucher.</p>
            </header>
            <PaymentReceiptForm
                accounts={accounts}
                parties={parties}
                vehicles={vehicles}
                transactions={transactions}
                onFormSubmit={handleFormSubmit}
                onCancel={() => router.push('/fleet/transactions')}
            />
        </div>
    );
}

    