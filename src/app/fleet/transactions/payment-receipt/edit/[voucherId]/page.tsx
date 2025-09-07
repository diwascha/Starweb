
export const runtime = 'nodejs';
'use client';

import { useEffect, useState, useMemo, use, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { getVoucherTransactions, updateVoucher } from '@/services/transaction-service';
import type { Transaction, Vehicle, Party, Account } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { onVehiclesUpdate } from '@/services/vehicle-service';
import { onPartiesUpdate } from '@/services/party-service';
import { onAccountsUpdate } from '@/services/account-service';
import { onTransactionsUpdate } from '@/services/transaction-service';

const PaymentReceiptForm = dynamic(() => import('../../../_components/payment-receipt-form').then(mod => mod.PaymentReceiptForm), {
  ssr: false,
  loading: () => <p>Loading form...</p>
});

export default function EditVoucherPage({ params }: { params: Promise<{ voucherId: string }> }) {
  const { voucherId } = use(params);
  const router = useRouter();
  const { toast } = useToast();
  const { user } = useAuth();
  
  const [initialTransactions, setInitialTransactions] = useState<Transaction[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // We need all these for the form dropdowns
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [allTransactions, setAllTransactions] = useState<Transaction[]>([]);

  useEffect(() => {
    Promise.all([
      getVoucherTransactions(voucherId),
      new Promise<Vehicle[]>(resolve => onVehiclesUpdate(resolve)),
      new Promise<Party[]>(resolve => onPartiesUpdate(resolve)),
      new Promise<Account[]>(resolve => onAccountsUpdate(resolve)),
      new Promise<Transaction[]>(resolve => onTransactionsUpdate(resolve)),
    ]).then(([voucherTransactions, vehiclesData, partiesData, accountsData, allTxnsData]) => {
      setInitialTransactions(voucherTransactions);
      setVehicles(vehiclesData);
      setParties(partiesData);
      setAccounts(accountsData);
      setAllTransactions(allTxnsData);
      setIsLoading(false);
    });
  }, [voucherId]);
  
  const initialFormValues = useMemo(() => {
    if (!initialTransactions || initialTransactions.length === 0) return null;
    
    const base = initialTransactions[0];
    const items = initialTransactions.map(t => ({
      ledgerId: t.partyId || '',
      vehicleId: t.vehicleId || '',
      recAmount: t.type === 'Receipt' ? t.amount : 0,
      payAmount: t.type === 'Payment' ? t.amount : 0,
      narration: t.remarks || '',
    }));
    
    return {
      voucherNo: base.items[0]?.particular.replace(/ .*/,'') || 'N/A',
      date: new Date(base.date),
      billingType: base.billingType,
      accountId: base.accountId,
      chequeNo: base.chequeNumber,
      chequeDate: base.chequeDate ? new Date(base.chequeDate) : null,
      items: items,
      remarks: base.remarks,
    };
  }, [initialTransactions]);

  const handleFormSubmit = async (values: any) => {
    if (!user) {
        toast({ title: "Error", description: "You must be logged in.", variant: "destructive" });
        return;
    }
    try {
        await updateVoucher(voucherId, values, user.username);
        toast({ title: "Voucher Updated", description: "The voucher has been successfully updated." });
        router.push('/fleet/transactions/payment-receipt/new');
    } catch (error) {
        console.error("Failed to update voucher:", error);
        toast({ title: "Error", description: "Failed to update voucher.", variant: "destructive" });
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm py-24">
        <h3 className="text-2xl font-bold tracking-tight">Loading Voucher...</h3>
      </div>
    );
  }

  if (!initialFormValues) {
     return (
      <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm py-24">
        <h3 className="text-2xl font-bold tracking-tight">Voucher not found.</h3>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Edit Voucher</h1>
        <p className="text-muted-foreground">Modify the details for voucher #{initialFormValues.voucherNo}.</p>
      </header>
      <Suspense fallback={<div>Loading form...</div>}>
        <PaymentReceiptForm
          accounts={accounts}
          parties={parties}
          vehicles={vehicles}
          transactions={allTransactions}
          onFormSubmit={handleFormSubmit}
          onCancel={() => router.push('/fleet/transactions/payment-receipt/new')}
          initialValues={initialFormValues}
        />
      </Suspense>
    </div>
  );
}
