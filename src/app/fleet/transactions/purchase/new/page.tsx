'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, History, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PurchaseForm } from '../../_components/purchase-form';
import { onVehiclesUpdate } from '@/services/vehicle-service';
import { onPartiesUpdate } from '@/services/party-service';
import { onAccountsUpdate } from '@/services/account-service';
import { onUomsUpdate } from '@/services/uom-service';
import { onTransactionsUpdate, addTransaction } from '@/services/transaction-service';
import { generateNextPurchaseNumber } from '@/lib/utils';
import type { Vehicle, Party, Account, Transaction, UnitOfMeasurement } from '@/lib/types';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';

export default function NewPurchaseEntryPage() {
    const router = useRouter();
    const { user } = useAuth();
    const { toast } = useToast();
    
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [parties, setParties] = useState<Party[]>([]);
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [uoms, setUoms] = useState<UnitOfMeasurement[]>([]);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [nextPurchaseNo, setNextPurchaseNo] = useState('');
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        setIsLoading(true);
        const unsubs = [
            onVehiclesUpdate(setVehicles),
            onPartiesUpdate(setParties),
            onAccountsUpdate(setAccounts),
            onUomsUpdate(setUoms),
            onTransactionsUpdate(setTransactions)
        ];
        setIsLoading(false);
        return () => unsubs.forEach(u => u());
    }, []);

    useEffect(() => {
        const purchases = transactions.filter(t => t.type === 'Purchase' || t.referenceType === 'Purchase Entry');
        generateNextPurchaseNumber(purchases).then(setNextPurchaseNo);
    }, [transactions]);

    const handleFormSubmit = async (values: any) => {
        if (!user) return;
        
        const subtotal = values.items.reduce((sum: number, item: any) => sum + (item.quantity * item.rate), 0);
        const vat = values.invoiceType === 'Taxable' ? subtotal * 0.13 : 0;
        const total = subtotal + vat;

        const txnPayload: Omit<Transaction, 'id' | 'createdAt' | 'lastModifiedAt'> = {
            ...values,
            date: values.date.toISOString(),
            invoiceDate: values.invoiceDate?.toISOString() || null,
            chequeDate: values.chequeDate?.toISOString() || null,
            dueDate: values.dueDate?.toISOString() || null,
            type: values.billingType === 'Credit' ? 'Purchase' : 'Payment',
            amount: total,
            referenceType: 'Purchase Entry',
            referenceId: values.purchaseNumber,
            ownership: 'Sijan',
            createdBy: user.username
        };

        try {
            await addTransaction(txnPayload);
            toast({ title: 'Success', description: 'Purchase recorded.' });
            router.push('/fleet/transactions/purchase');
        } catch {
            toast({ title: 'Error', variant: 'destructive' });
        }
    };

    if (isLoading) {
        return <div className="p-12 text-center flex flex-col items-center gap-4">
            <Loader2 className="h-8 w-8 animate-spin" />
            <p>Loading procurement data...</p>
        </div>;
    }

    return (
        <div className="max-w-7xl mx-auto space-y-8">
            <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => router.back()}>
                            <ArrowLeft className="h-4 w-4" />
                        </Button>
                        <h1 className="text-3xl font-bold tracking-tight text-gray-900">Purchase Entry</h1>
                    </div>
                    <p className="text-muted-foreground ml-10">Procure parts, fuel, or stock for the fleet.</p>
                </div>
                <Button variant="outline" onClick={() => router.push('/fleet/transactions/purchase')}>
                    <History className="mr-2 h-4 w-4" /> Purchase History
                </Button>
            </header>
            
            <PurchaseForm 
                accounts={accounts}
                parties={parties}
                vehicles={vehicles}
                uoms={uoms}
                onFormSubmit={handleFormSubmit}
                onCancel={() => router.push('/fleet/transactions/purchase')}
                initialValues={{ purchaseNumber: nextPurchaseNo }}
            />
        </div>
    );
}
