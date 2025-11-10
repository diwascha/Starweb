
'use client';
import { Suspense, useEffect, useState } from 'react';
import PurchaseViewClient from '../_components/PurchaseViewClient';
import { getTransaction } from '@/services/transaction-service';
import { onVehiclesUpdate } from '@/services/vehicle-service';
import { onPartiesUpdate } from '@/services/party-service';
import { onAccountsUpdate } from '@/services/account-service';
import type { Transaction, Vehicle, Party, Account } from '@/lib/types';
import { useSearchParams } from 'next/navigation';


function PurchaseView() {
    const searchParams = useSearchParams();
    const id = searchParams.get('id');
    const [transaction, setTransaction] = useState<Transaction | null>(null);
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [parties, setParties] = useState<Party[]>([]);
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!id) {
            setIsLoading(false);
            return;
        }

        const unsubVehicles = onVehiclesUpdate(setVehicles);
        const unsubParties = onPartiesUpdate(setParties);
        const unsubAccounts = onAccountsUpdate(setAccounts);
        
        getTransaction(id).then(data => {
            setTransaction(data);
            setIsLoading(false);
        });

        return () => {
            unsubVehicles();
            unsubParties();
            unsubAccounts();
        }
    }, [id]);

    if (isLoading) {
        return (
            <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm py-24">
                <h3 className="text-2xl font-bold tracking-tight">Loading Purchase...</h3>
            </div>
        );
    }
    
    if (!id) {
        return <div className="p-8 text-center">No transaction ID provided.</div>;
    }

    if (!transaction) {
        return (
            <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm py-24">
                <h3 className="text-2xl font-bold tracking-tight">Purchase transaction not found.</h3>
            </div>
        );
    }

    return (
        <PurchaseViewClient 
            initialTransaction={transaction}
            vehicles={vehicles}
            parties={parties}
            accounts={accounts}
        />
    );
}

export default function PurchaseViewPage() {
    return (
        <Suspense fallback={<div>Loading...</div>}>
            <PurchaseView />
        </Suspense>
    );
}
