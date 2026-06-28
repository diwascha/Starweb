
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, History } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ExpenseForm } from '../_components/expense-form';
import { onVehiclesUpdate } from '@/services/vehicle-service';
import { onPartiesUpdate } from '@/services/party-service';
import { onAccountsUpdate } from '@/services/account-service';
import { onTransactionsUpdate } from '@/services/transaction-service';
import type { Vehicle, Party, Account, Transaction } from '@/lib/types';

export default function NewExpenseEntryPage() {
    const router = useRouter();
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [parties, setParties] = useState<Party[]>([]);
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [isLoading, setIsLoading] = useState(true);

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

    if (isLoading) {
        return <div className="p-12 text-center">Loading dependencies...</div>;
    }

    return (
        <div className="max-w-4xl mx-auto space-y-8">
            <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => router.back()}>
                            <ArrowLeft className="h-4 w-4" />
                        </Button>
                        <h1 className="text-3xl font-bold tracking-tight">New Expense Entry</h1>
                    </div>
                    <p className="text-muted-foreground ml-10">Record a truck-related expense payment</p>
                </div>
                <Button variant="outline" onClick={() => router.push('/fleet/transactions')}>
                    <History className="mr-2 h-4 w-4" /> Expense History
                </Button>
            </header>
            
            <ExpenseForm 
                vehicles={vehicles}
                parties={parties}
                accounts={accounts}
                transactions={transactions}
            />
        </div>
    );
}
