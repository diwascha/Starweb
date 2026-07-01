'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import type { Transaction, Vehicle, Party, Account } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { onVehiclesUpdate } from '@/services/vehicle-service';
import { onPartiesUpdate } from '@/services/party-service';
import { onAccountsUpdate } from '@/services/account-service';
import { onTransactionsUpdate, saveVoucher } from '@/services/transaction-service';
import { Button } from '@/components/ui/button';
import { ArrowLeft, History } from 'lucide-react';
import { generateNextVoucherNumber } from '@/lib/utils';

const PaymentReceiptForm = dynamic(() => import('../../_components/payment-receipt-form').then(mod => mod.PaymentReceiptForm), {
  ssr: false,
  loading: () => <div className="p-12 text-center">Loading Voucher Form...</div>
});

export default function NewPaymentReceiptPage() {
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [parties, setParties] = useState<Party[]>([]);
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [nextVoucherNum, setNextVoucherNum] = useState('');
    
    const { toast } = useToast();
    const { user } = useAuth();
    const router = useRouter();

    useEffect(() => {
        setIsLoading(true);
        const unsubs = [
            onVehiclesUpdate(setVehicles),
            onPartiesUpdate(setParties),
            onAccountsUpdate(setAccounts),
            onTransactionsUpdate(setTransactions)
        ];
        setIsLoading(false);
        return () => unsubs.forEach(u => u());
    }, []);

    // Reactive Payment/Receipt Voucher Number Generation
    useEffect(() => {
        const pmtRcdTxns = transactions.filter(t => t.type === 'Payment' || t.type === 'Receipt');
        generateNextVoucherNumber(pmtRcdTxns, 'PRV-').then(setNextVoucherNum);
    }, [transactions]);

    const handleFormSubmit = async (values: any) => {
        if (!user) {
            toast({ title: "Error", description: "You must be logged in to save.", variant: "destructive" });
            return;
        }
        try {
            await saveVoucher(values, user.username);
            toast({ title: "Voucher Saved", description: "The voucher has been successfully recorded." });
            router.push('/fleet/transactions/payment-receipt/list'); // Return to voucher logs
        } catch (error) {
            console.error("Failed to save voucher:", error);
            toast({ title: "Error", description: "Failed to save voucher.", variant: "destructive" });
        }
    };
    
    if (isLoading) {
        return <div className="p-12 text-center">Loading dependencies...</div>;
    }

    return (
        <div className="max-w-7xl mx-auto space-y-8">
            <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => router.push('/fleet/transactions/payment-receipt/list')}>
                            <ArrowLeft className="h-4 w-4" />
                        </Button>
                        <h1 className="text-3xl font-bold tracking-tight">New Payment / Receipt</h1>
                    </div>
                    <p className="text-muted-foreground ml-10">Record a settlement, maintenance payment, or renewal fee.</p>
                </div>
                <Button variant="outline" onClick={() => router.push('/fleet/transactions/payment-receipt/list')}>
                    <History className="mr-2 h-4 w-4" /> Pmt. / Rcd. logs
                </Button>
            </header>
            
            <Suspense fallback={<div className="p-12 text-center">Preparing form...</div>}>
                <PaymentReceiptForm
                    accounts={accounts}
                    parties={parties}
                    vehicles={vehicles}
                    transactions={transactions}
                    onFormSubmit={handleFormSubmit}
                    onCancel={() => router.push('/fleet/transactions/payment-receipt/list')}
                    initialValues={{ voucherNo: nextVoucherNum }}
                />
            </Suspense>
        </div>
    );
}
