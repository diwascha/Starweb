
'use client';

import { useState, useEffect, Suspense, use } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, History, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import EditPurchaseClientPage from '../_components/EditPurchaseClientPage';
import { onVehiclesUpdate } from '@/services/vehicle-service';
import { onPartiesUpdate } from '@/services/party-service';
import { onAccountsUpdate } from '@/services/account-service';
import { onUomsUpdate } from '@/services/uom-service';
import { getTransaction } from '@/services/transaction-service';
import type { Vehicle, Party, Account, Transaction, UnitOfMeasurement } from '@/lib/types';

/**
 * @fileOverview Dedicated edit page for Purchase transactions.
 */

function EditPurchasePageContent(props: { searchParams: Promise<any> }) {
    const router = useRouter();
    const searchParams = use(props.searchParams);
    const id = searchParams.id;

    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [parties, setParties] = useState<Party[]>([]);
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [uoms, setUoms] = useState<UnitOfMeasurement[]>([]);
    const [transaction, setTransaction] = useState<Transaction | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!id) {
            setIsLoading(false);
            return;
        }

        const fetchData = async () => {
            setIsLoading(true);
            try {
                const [vData, pData, aData, uData, tData] = await Promise.all([
                    new Promise<Vehicle[]>(resolve => onVehiclesUpdate(resolve)),
                    new Promise<Party[]>(resolve => onPartiesUpdate(resolve)),
                    new Promise<Account[]>(resolve => onAccountsUpdate(resolve)),
                    new Promise<UnitOfMeasurement[]>(resolve => onUomsUpdate(resolve)),
                    getTransaction(id)
                ]);
                
                setVehicles(vData);
                setParties(pData);
                setAccounts(aData);
                setUoms(uData);
                setTransaction(tData);
            } catch (err) {
                console.error("Failed to load edit data", err);
            } finally {
                setIsLoading(false);
            }
        };

        fetchData();
    }, [id]);

    if (isLoading) {
        return (
            <div className="flex h-[70vh] flex-col items-center justify-center gap-4">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Loading procurement record...</p>
            </div>
        );
    }

    if (!transaction) {
        return <div className="p-12 text-center">Purchase record not found.</div>;
    }

    // Adapt transaction to form values
    const initialValues = {
        ...transaction,
        date: new Date(transaction.date),
        invoiceDate: transaction.invoiceDate ? new Date(transaction.invoiceDate) : null,
        chequeDate: transaction.chequeDate ? new Date(transaction.chequeDate) : null,
        dueDate: transaction.dueDate ? new Date(transaction.dueDate) : null,
    };

    return (
        <div className="max-w-7xl mx-auto space-y-8">
            <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => router.back()}>
                            <ArrowLeft className="h-4 w-4" />
                        </Button>
                        <h1 className="text-3xl font-bold tracking-tight">Edit Purchase</h1>
                    </div>
                    <p className="text-muted-foreground ml-10">Record #{transaction.purchaseNumber || id}</p>
                </div>
                <Button variant="outline" onClick={() => router.push('/fleet/transactions/purchase')}>
                    <History className="mr-2 h-4 w-4" /> Purchase History
                </Button>
            </header>
            
            <EditPurchaseClientPage 
                accounts={accounts}
                parties={parties}
                vehicles={vehicles}
                uoms={uoms}
                initialValues={initialValues}
                transactionId={transaction.id}
            />
        </div>
    );
}

export default function EditPurchasePage(props: { params: Promise<any>, searchParams: Promise<any> }) {
    return (
        <Suspense fallback={<div className="p-12 text-center">Initializing...</div>}>
            <EditPurchasePageContent searchParams={props.searchParams} />
        </Suspense>
    );
}
