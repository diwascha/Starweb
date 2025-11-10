
'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getVoucherTransactions } from '@/services/transaction-service';
import { getVehicles } from '@/services/vehicle-service';
import { getParties } from '@/services/party-service';
import { getAccounts } from '@/services/account-service';
import { getTransactions, updateVoucher } from '@/services/transaction-service';
import { PaymentReceiptForm } from '../../_components/payment-receipt-form';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { Skeleton } from '@/components/ui/skeleton';

function EditVoucherComponent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const voucherId = searchParams.get('voucherId');
    const { toast } = useToast();
    const { user } = useAuth();

    const [initialValues, setInitialValues] = useState<any>(null);
    const [vehicles, setVehicles] = useState<any[]>([]);
    const [parties, setParties] = useState<any[]>([]);
    const [accounts, setAccounts] = useState<any[]>([]);
    const [allTransactions, setAllTransactions] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (voucherId) {
            Promise.all([
                getVoucherTransactions(voucherId),
                getVehicles(true),
                getParties(true),
                getAccounts(true),
                getTransactions(true),
            ]).then(([initialTransactions, vehicleData, partyData, accountData, allTxnsData]) => {
                if (initialTransactions && initialTransactions.length > 0) {
                    const base = initialTransactions[0];
                    const items = initialTransactions.map(t => ({
                        ledgerId: t.partyId || '',
                        vehicleId: t.vehicleId || '',
                        recAmount: t.type === 'Receipt' ? t.amount : 0,
                        payAmount: t.type === 'Payment' ? t.amount : 0,
                        narration: t.remarks || '',
                    }));

                    setInitialValues({
                        voucherNo: base.items[0]?.particular.replace(/ .*/,'') || 'N/A',
                        date: new Date(base.date),
                        billingType: base.billingType,
                        accountId: base.accountId,
                        chequeNo: base.chequeNumber,
                        chequeDate: base.chequeDate ? new Date(base.chequeDate) : undefined,
                        items: items,
                        remarks: base.remarks,
                    });
                }
                setVehicles(vehicleData);
                setParties(partyData);
                setAccounts(accountData);
                setAllTransactions(allTxnsData);
                setLoading(false);
            });
        }
    }, [voucherId]);
    
    const handleFormSubmit = async (values: any) => {
        if (!user || !voucherId) return;
        try {
            await updateVoucher(voucherId, values, user.username);
            toast({ title: 'Success', description: 'Voucher updated successfully.' });
            router.push('/fleet/transactions/payment-receipt/new');
        } catch (error) {
            console.error('Failed to update voucher:', error);
            toast({ title: 'Error', description: 'Could not update voucher.', variant: 'destructive' });
        }
    };


    if (loading) {
        return <Skeleton className="h-[500px] w-full" />;
    }
    
    if (!initialValues) {
        return <div>Voucher not found.</div>;
    }
    
    return (
        <PaymentReceiptForm
            accounts={accounts}
            parties={parties}
            vehicles={vehicles}
            transactions={allTransactions}
            onFormSubmit={handleFormSubmit}
            onCancel={() => router.push('/fleet/transactions/payment-receipt/new')}
            initialValues={initialValues}
        />
    );
}


export default function EditVoucherPage() {
  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Edit Voucher</h1>
        <p className="text-muted-foreground">Modify the details for this payment/receipt voucher.</p>
      </header>
        <Suspense fallback={<Skeleton className="h-[500px] w-full" />}>
            <EditVoucherComponent />
        </Suspense>
    </div>
  );
}
