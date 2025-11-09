
'use client';

import { PurchaseForm } from '../../../../_components/purchase-form';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { updateTransaction } from '@/services/transaction-service';
import type { Account, Party, Vehicle, UnitOfMeasurement } from '@/lib/types';

interface EditPurchaseClientPageProps {
  accounts: Account[];
  parties: Party[];
  vehicles: Vehicle[];
  uoms: UnitOfMeasurement[];
  initialValues: any;
  transactionId: string;
}

export default function EditPurchaseClientPage({
  accounts,
  parties,
  vehicles,
  uoms,
  initialValues,
  transactionId,
}: EditPurchaseClientPageProps) {
  const router = useRouter();
  const { toast } = useToast();
  const { user } = useAuth();

  const handleFormSubmit = async (values: any) => {
    if (!user) {
      toast({ title: 'Error', description: 'You must be logged in to perform this action.', variant: 'destructive' });
      return;
    }

    const calculatedSubtotal = (values.items || []).reduce((sum: number, item: { quantity: number; rate: number; }) => sum + (Number(item.quantity) || 0) * (Number(item.rate) || 0), 0);
    const calculatedVat = values.invoiceType === 'Taxable' ? calculatedSubtotal * 0.13 : 0;
    const grandTotal = calculatedSubtotal + calculatedVat;
    
    const transactionData = {
        ...values,
        date: values.date.toISOString(),
        invoiceNumber: values.invoiceNumber || null,
        invoiceDate: values.invoiceDate?.toISOString() || null,
        chequeNumber: values.chequeNo || null,
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
        lastModifiedAt: new Date().toISOString(),
    };

    try {
      await updateTransaction(transactionId, transactionData);
      toast({ title: 'Success', description: 'Purchase transaction updated.' });
      router.push('/fleet/transactions/purchase/new');
      router.refresh(); // To ensure the list on the previous page is updated
    } catch (error) {
      console.error("Failed to update transaction:", error);
      toast({ title: 'Error', description: 'Failed to update transaction.', variant: 'destructive' });
    }
  };

  return (
    <PurchaseForm
      accounts={accounts}
      parties={parties}
      vehicles={vehicles}
      uoms={uoms}
      onFormSubmit={handleFormSubmit}
      onCancel={() => router.push('/fleet/transactions/purchase/new')}
      initialValues={initialValues}
    />
  );
}
