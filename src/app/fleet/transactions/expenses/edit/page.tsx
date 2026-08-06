'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, History, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ExpenseForm } from '../_components/expense-form';
import { onVehiclesUpdate } from '@/services/vehicle-service';
import { onPartiesUpdate } from '@/services/party-service';
import { onAccountsUpdate } from '@/services/account-service';
import { getTransactions } from '@/services/transaction-service';
import { getExpense, getExpenseByVoucherNo } from '@/services/expense-service';
import type { Vehicle, Party, Account, Transaction } from '@/lib/types';
import type { Expense } from '@/lib/expense-types';

function EditExpenseContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const id = searchParams.get('id');

    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [parties, setParties] = useState<Party[]>([]);
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [expense, setExpense] = useState<Expense | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!id) {
            setIsLoading(false);
            return;
        }

        const fetchData = async () => {
            setIsLoading(true);
            try {
                // Fetch basic dependencies
                const [vData, pData, aData, tData] = await Promise.all([
                    new Promise<Vehicle[]>(resolve => onVehiclesUpdate(resolve)),
                    new Promise<Party[]>(resolve => onPartiesUpdate(resolve)),
                    new Promise<Account[]>(resolve => onAccountsUpdate(resolve)),
                    getTransactions()
                ]);
                
                setVehicles(vData);
                setParties(pData);
                setAccounts(aData);
                setTransactions(tData);

                // Attempt to load the primary expense record
                let eData = await getExpense(id);
                
                // Fallback 1: If the ID passed was a Transaction ID (e.g. from the ledger), 
                // try to find the linked Expense record.
                if (!eData) {
                    const matchedTxn = tData.find(t => t.id === id);
                    if (matchedTxn && matchedTxn.expenseId) {
                        eData = await getExpense(matchedTxn.expenseId);
                    } else if (matchedTxn && matchedTxn.referenceId) {
                         // Search by voucher number
                         eData = await getExpenseByVoucherNo(matchedTxn.referenceId);
                    }
                }

                // Fallback 2: try id itself as voucher number (handles slashes in URL)
                if (!eData) {
                    eData = await getExpenseByVoucherNo(id);
                }

                setExpense(eData);
            } catch (err) {
                console.error("Failed to load edit data", err);
            } finally {
                setIsLoading(false);
            }
        };

        fetchData();
    }, [id]);

    if (isLoading) {
        return <div className="p-12 text-center flex flex-col items-center justify-center h-[70vh] gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Authorizing record lookup...</p>
        </div>;
    }

    if (!expense) {
        return (
            <div className="p-12 text-center space-y-4">
                <p className="text-muted-foreground font-medium">Expense record not found or inaccessible.</p>
                <Button variant="outline" onClick={() => router.back()}>Go Back</Button>
            </div>
        );
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
