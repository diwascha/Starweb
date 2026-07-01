'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, History, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ExpenseForm } from '../_components/expense-form';
import { onVehiclesUpdate } from '@/services/vehicle-service';
import { onPartiesUpdate } from '@/services/party-service';
import { onAccountsUpdate } from '@/services/account-service';
import { onTransactionsUpdate } from '@/services/transaction-service';
import { getExpense } from '@/services/expense-service';
import type { Vehicle, Party, Account, Transaction } from '@/lib/types';
import type { Expense } from '@/lib/expense-types';
import { Skeleton } from '@/components/ui/skeleton';

function EditExpenseContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const expenseId = searchParams.get('id');

    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [parties, setParties] = useState<Party[]>([]);
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [expense, setExpense] = useState<Expense | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!expenseId) return;

        const fetchData = async () => {
            setIsLoading(true);
            try {
                const [vData, pData, aData, tData, eData] = await Promise.all([
                    new Promise<Vehicle[]>(resolve => onVehiclesUpdate(resolve)),
                    new Promise<Party[]>(resolve => onPartiesUpdate(resolve)),
                    new Promise<Account[]>(resolve => onAccountsUpdate(resolve)),
                    new Promise<Transaction[]>(resolve => onTransactionsUpdate(resolve)),
                    getExpense(expenseId)
                ]);
                
                setVehicles(vData);
                setParties(pData);
                setAccounts(aData);
                setTransactions(tData);
                setExpense(eData);
            } catch (err) {
                console.error("Failed to load edit data", err);
            } finally {
                setIsLoading(false);
            }
        };

        fetchData();
    }, [expenseId]);

    if (isLoading) {
        return <div className="p-12 text-center flex flex-col items-center gap-4">
            <Loader2 className="h-8 w-8 animate-spin" />
            <p>Loading expense record...</p>
        </div>;
    }

    if (!expense) {
        return <div className="p-12 text-center">Expense record not found.</div>;
    }

    return (
        <div className="max-w-4xl mx-auto space-y-8">
            <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => router.back()}>
                            <ArrowLeft className="h-4 w-4" />
                        </Button>
                        <h1 className="text-3xl font-bold tracking-tight">Edit Expense Entry</h1>
                    </div>
                    <p className="text-muted-foreground ml-10">Modify record #{expense.voucherNo}</p>
                </div>
                <Button variant="outline" onClick={() => router.push('/fleet/transactions/expenses')}>
                    <History className="mr-2 h-4 w-4" /> View All Logs
                </Button>
            </header>
            
            <ExpenseForm 
                vehicles={vehicles}
                parties={parties}
                accounts={accounts}
                transactions={transactions}
                initialVoucherNo={expense.voucherNo}
                expenseToEdit={expense}
            />
        </div>
    );
}

export default function EditExpensePage() {
    return (
        <Suspense fallback={<div className="p-12 text-center">Initializing...</div>}>
            <EditExpenseContent />
        </Suspense>
    );
}
