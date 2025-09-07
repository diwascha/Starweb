
'use client';

import { useEffect, useState, useMemo, use, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { getTransaction, updateTransaction } from '@/services/transaction-service';
import type { Transaction, Vehicle, Party, Account } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { onVehiclesUpdate } from '@/services/vehicle-service';
import { onPartiesUpdate } from '@/services/party-service';
import { onAccountsUpdate } from '@/services/account-service';

const PurchaseForm = dynamic(() => import('../../../_components/purchase-form').then(mod => mod.PurchaseForm), {
  ssr: false,
  loading: () => <p>Loading form...</p>
});

export default function EditPurchasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { toast } = useToast();
  const { user } = useAuth();
  
  const [initialTransaction, setInitialTransaction] = useState<Transaction | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // We need all these for the form dropdowns
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);

  useEffect(() => {
    Promise.all([
      getTransaction(id),
      new Promise<Vehicle[]>(resolve => onVehiclesUpdate(resolve)),
      new Promise<Party[]>(resolve => onPartiesUpdate(resolve)),
      new Promise<Account[]>(resolve => onAccountsUpdate(resolve)),
    ]).then(([txnData, vehiclesData, partiesData, accountsData]) => {
      setInitialTransaction(txnData);
      setVehicles(vehiclesData);
      setParties(partiesData);
      setAccounts(accountsData);
      setIsLoading(false);
    });
  }, [id]);
  
  const initialFormValues = useMemo(() => {
    if (!initialTransaction) return null;
    
    return {
      ...initialTransaction,
      date: new Date(initialTransaction.date),
      invoiceDate: initialTransaction.invoiceDate ? new Date(initialTransaction.invoiceDate) : null,
      chequeDate: initialTransaction.chequeDate ? new Date(initialTransaction.chequeDate) : null,
      dueDate: initialTransaction.dueDate ? new Date(initialTransaction.dueDate) : null,
    };
  }, [initialTransaction]);

  const handleFormSubmit = async (values: any) => {
    if (!user) {
        toast({ title: "Error", description: "You must be logged in.", variant: "destructive" });
        return;
    }
    
    const calculatedSubtotal = (values.items || []).reduce((sum: number, item: { quantity: number; rate: number; }) => sum + (Number(item.quantity) || 0) * (Number(item.rate) || 0), 0);
    const calculatedVat = values.invoiceType === 'Taxable' ? calculatedSubtotal * 0.13 : 0;
    const grandTotal = calculatedSubtotal + calculatedVat;

    try {
        const updatedData: Partial<Omit<Transaction, 'id'>> = {
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
            lastModifiedBy: user.username,
        };
        await updateTransaction(id, updatedData);
        toast({ title: "Transaction Updated", description: "The purchase has been successfully updated." });
        router.push('/fleet/transactions/purchase/new');
    } catch (error) {
        console.error("Failed to update transaction:", error);
        toast({ title: "Error", description: "Failed to update transaction.", variant: "destructive" });
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm py-24">
        <h3 className="text-2xl font-bold tracking-tight">Loading Purchase...</h3>
      </div>
    );
  }

  if (!initialFormValues) {
     return (
      <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm py-24">
        <h3 className="text-2xl font-bold tracking-tight">Purchase not found.</h3>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Edit Purchase</h1>
        <p className="text-muted-foreground">Modify the details for purchase #{initialFormValues.purchaseNumber}.</p>
      </header>
      <Suspense fallback={<div>Loading form...</div>}>
        <PurchaseForm
          accounts={accounts}
          parties={parties}
          vehicles={vehicles}
          onFormSubmit={handleFormSubmit}
          onCancel={() => router.push('/fleet/transactions/purchase/new')}
          initialValues={initialFormValues}
        />
      </Suspense>
    </div>
  );
}
