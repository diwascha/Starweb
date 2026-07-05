'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import type { Vehicle, Party, Account, UnitOfMeasurement, Transaction } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { onVehiclesUpdate } from '@/services/vehicle-service';
import { onPartiesUpdate } from '@/services/party-service';
import { onAccountsUpdate } from '@/services/account-service';
import { onTransactionsUpdate, addTransaction } from '@/services/transaction-service';
import { onUomsUpdate } from '@/services/uom-service';
import { Button } from '@/components/ui/button';
import { ArrowLeft, History } from 'lucide-react';
import { generateNextPurchaseNumber } from '@/lib/utils';

// Correctly map the named export for dynamic loading
const PurchaseForm = dynamic(
  () => import('../../_components/purchase-form').then(mod => mod.PurchaseForm),
  {
    ssr: false,
    loading: () => <div className="p-12 text-center">Loading Purchase Form...</div>
  }
);

export default function NewPurchaseEntryPage() {
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [parties, setParties] = useState<Party[]>([]);
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [uoms, setUoms] = useState<UnitOfMeasurement[]>([]);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [nextPurchaseNum, setNextPurchaseNum] = useState('');

    const { toast } = useToast();
    const { user } = useAuth();
    const router = useRouter();

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
        const purchaseTxns = transactions.filter(t => t.type === 'Purchase');
        generateNextPurchaseNumber(purchaseTxns).then(setNextPurchaseNum);
    }, [transactions]);

    const handleFormSubmit = async (values: any) => {
        if (!user) return;
        
        const calculatedSubtotal = (values.items || []).reduce((sum: number, item: any) => sum + (Number(item.quantity) || 0) * (Number(item.rate) || 0), 0);
        const calculatedVat = values.invoiceType === 'Taxable' ? calculatedSubtotal * 0.13 : 0;
        const grandTotal = calculatedSubtotal + calculatedVat;
        
        const transactionData = {
            ...values,
            date: values.date.toISOString(),
            invoiceNumber: values.invoiceNumber || null,
            invoiceDate: values.invoiceDate?.toISOString() || null,
            chequeNumber: values.chequeNumber || null,
            chequeDate: values.chequeDate?.toISOString() || null,
            dueDate: values.dueDate?.toISOString() || null,
            items: values.items.map((item: any) => ({
                ...item,
                quantity: Number(item.quantity) || 0,
                rate: Number(item.rate) || 0,
            })),
            amount: grandTotal,
            remarks: values.remarks || null,
            accountId: values.accountId || null,
            partyId: values.partyId || null,
            createdBy: user.username,
            type: 'Purchase' as const,
        };

        try {
            await addTransaction(transactionData);
            toast({ title: 'Success', description: 'Purchase transaction recorded.' });
            router.push('/fleet/transactions/purchase');
        } catch (error) {
             console.error("Failed to save transaction:", error);
             toast({ title: 'Error', description: 'Failed to save transaction.', variant: 'destructive' });
        }
    };
    
    if (isLoading) {
        return <div className="p-12 text-center">Loading dependencies...</div>;
    }

    return (
        <div className="max-w-6xl mx-auto space-y-8">
            <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => router.back()}>
                            <ArrowLeft className="h-4 w-4" />
                        </Button>
                        <h1 className="text-3xl font-bold tracking-tight">Purchase Entry</h1>
                    </div>
                    <p className="text-muted-foreground ml-10">Record a new purchase for vehicle maintenance, fuel, or renewals.</p>
                </div>
                <Button variant="outline" onClick={() => router.push('/fleet/transactions/purchase')}>
                    <History className="mr-2 h-4 w-4" /> View Purchase Logs
                </Button>
            </header>
            
            <Suspense fallback={<div className="p-12 text-center">Preparing form...</div>}>
                <PurchaseForm 
                    accounts={accounts}
                    parties={parties}
                    vehicles={vehicles}
                    uoms={uoms}
                    onFormSubmit={handleFormSubmit}
                    onCancel={() => router.back()}
                    initialValues={{ purchaseNumber: nextPurchaseNum }}
                />
            </Suspense>
        </div>
    );
}
