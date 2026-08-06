'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getVoucherTransactions, updateVoucher } from '@/services/transaction-service';
import { onVehiclesUpdate } from '@/services/vehicle-service';
import { onPartiesUpdate } from '@/services/party-service';
import { onAccountsUpdate } from '@/services/account-service';
import { PaymentReceiptForm } from '../../_components/payment-receipt-form';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { Loader2 } from 'lucide-react';

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
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!voucherId) {
          setLoading(false);
          return;
        }

        const fetchData = async () => {
            setLoading(true);
            try {
                const [vouchers, vData, pData, aData] = await Promise.all([
                    getVoucherTransactions(voucherId),
                    new Promise<any[]>(resolve => onVehiclesUpdate(resolve)),
                    new Promise<any[]>(resolve => onPartiesUpdate(resolve)),
                    new Promise<any[]>(resolve => onAccountsUpdate(resolve))
                ]);

                if (vouchers.length > 0) {
                    const base = vouchers[0];
                    const items = vouchers.map(t => ({
                        ledgerId: t.partyId || '',
                        vehicleId: t.vehicleId || '',
                        recAmount: t.type === 'Receipt' ? t.amount : 0,
                        payAmount: t.type === 'Payment' ? t.amount : 0,
                        narration: t.remarks || '',
                    }));

                    setInitialValues({
                        voucherNo: base.referenceId || 'N/A',
                        date: new Date(base.date),
                        billingType: base.billingType,
                        accountId: base.accountId,
                        chequeNo: base.chequeNumber,
                        chequeDate: base.chequeDate ? new Date(base.chequeDate) : undefined,
                        items: items,
                        remarks: base.remarks,
                    });
                }
                setVehicles(vData);
                setParties(pData);
                setAccounts(aData);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [voucherId]);
    
    const handleFormSubmit = async (values: any) => {
        if (!user || !voucherId) return;
        try {
            await updateVoucher(voucherId, values, user.username);
            toast({ title: 'Success', description: 'Voucher updated.' });
            router.push('/fleet/transactions/payment-receipt/list');
        } catch (error) {
            toast({ title: 'Error', description: 'Could not update voucher.', variant: 'destructive' });
        }
    };

    if (loading) return <div className="p-12 text-center flex flex-col items-center gap-4"><Loader2 className="animate-spin h-8 w-8 text-primary"/><p>Fetching voucher data...</p></div>;
    if (!initialValues) return <div className="p-12 text-center">Voucher not found.</div>;
    
    return (
        <PaymentReceiptForm
            accounts={accounts}
            parties={parties}
            vehicles={vehicles}
            transactions={[]}
            onFormSubmit={handleFormSubmit}
            onCancel={() => router.push('/fleet/transactions/payment-receipt/list')}
            initialValues={initialValues}
        />
    );
}

export default function EditVoucherPage() {
  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Edit Voucher</h1>
        <p className="text-muted-foreground">Modify payment/receipt records.</p>
      </header>
      <Suspense fallback={<div className="p-12 text-center">Initializing form...</div>}>
          <EditVoucherComponent />
      </Suspense>
    </div>
  );
}
