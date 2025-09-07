
'use client';

import { useState, useEffect } from 'react';
import type { Transaction, Vehicle, Party, Account } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { onVehiclesUpdate } from '@/services/vehicle-service';
import { onPartiesUpdate } from '@/services/party-service';
import { onAccountsUpdate } from '@/services/account-service';
import { addTransaction } from '@/services/transaction-service';
import { PurchaseForm } from '../../_components/purchase-form';
import { useRouter } from 'next/navigation';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { PlusCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

export default function NewPurchasePage() {
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [parties, setParties] = useState<Party[]>([]);
    const [accounts, setAccounts] = useState<Account[]>([]);
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
        setIsLoading(false);

        return () => {
            unsubVehicles();
            unsubParties();
            unsubAccounts();
        }
    }, []);

    const handleFormSubmit = async (values: any) => {
        if (!user) return;
        
        const calculatedSubtotal = (values.items || []).reduce((sum: number, item: { quantity: number; rate: number; }) => sum + (Number(item.quantity) || 0) * (Number(item.rate) || 0), 0);
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
            items: values.items.map((item: { quantity: any; rate: any; }) => ({
                ...item,
                quantity: Number(item.quantity) || 0,
                rate: Number(item.rate) || 0,
            })),
            amount: grandTotal,
            remarks: values.remarks || null,
            accountId: values.accountId || null,
            partyId: values.partyId || null,
            createdBy: user.username,
        };

        try {
            await addTransaction(transactionData);
            toast({ title: 'Success', description: 'New transaction recorded.' });
            setIsDialogOpen(false);
            router.push('/fleet/transactions');
        } catch (error) {
             console.error("Failed to save transaction:", error);
             toast({ title: 'Error', description: 'Failed to save transaction.', variant: 'destructive' });
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
                        <h1 className="text-3xl font-bold tracking-tight">New Purchase</h1>
                        <p className="text-muted-foreground">Record a new purchase transaction for the fleet.</p>
                    </div>
                    <DialogTrigger asChild>
                        <Button>
                            <PlusCircle className="mr-2 h-4 w-4" /> Create New Purchase
                        </Button>
                    </DialogTrigger>
                </header>
                 <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm py-24">
                  <div className="flex flex-col items-center gap-1 text-center">
                    <h3 className="text-2xl font-bold tracking-tight">Create a Purchase Entry</h3>
                    <p className="text-sm text-muted-foreground">Click the button above to get started.</p>
                  </div>
                </div>
            </div>
            <DialogContent className="max-w-4xl">
                 <PurchaseForm 
                    accounts={accounts}
                    parties={parties}
                    vehicles={vehicles}
                    onFormSubmit={handleFormSubmit}
                    onCancel={() => setIsDialogOpen(false)}
                />
            </DialogContent>
        </Dialog>
    );
}
