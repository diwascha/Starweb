
import { getVoucherTransactions } from '@/services/transaction-service';
import { getVehicles } from '@/services/vehicle-service';
import { getParties } from '@/services/party-service';
import { getAccounts } from '@/services/account-service';
import { getTransactions } from '@/services/transaction-service';
import { PaymentReceiptForm } from '../../../_components/payment-receipt-form';
import { Suspense } from 'react';
import type { Transaction } from '@/lib/types';


// This function is required for Next.js static exports to work with dynamic routes.
export async function generateStaticParams() {
    // Always try to generate params for desktop builds
    if (process.env.TAURI_BUILD !== 'true') {
        return [];
    }

    try {
      const transactions = await getTransactions(true); // Force fetch for build
      if (!transactions || transactions.length === 0) {
        return [];
      }
      
      const voucherIds = new Set<string>();
      transactions.forEach(t => {
          if (t.voucherId) {
              voucherIds.add(t.voucherId);
          }
      });
      
      return Array.from(voucherIds).map(id => ({
        voucherId: id,
      }));
    } catch (error) {
      console.error("Failed to generate static params for edit vouchers:", error);
      return [];
    }
}

export default async function EditVoucherPage({ params }: { params: { voucherId: string } }) {
  const { voucherId } = params;
  
  const [initialTransactions, vehicles, parties, accounts, allTransactions] = await Promise.all([
    getVoucherTransactions(voucherId),
    getVehicles(),
    getParties(),
    getAccounts(),
    getTransactions(),
  ]);

  if (!initialTransactions || initialTransactions.length === 0) {
     return (
      <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm py-24">
        <h3 className="text-2xl font-bold tracking-tight">Voucher not found.</h3>
      </div>
    );
  }

  const base = initialTransactions[0];
  const items = initialTransactions.map(t => ({
    ledgerId: t.partyId || '',
    vehicleId: t.vehicleId || '',
    recAmount: t.type === 'Receipt' ? t.amount : 0,
    payAmount: t.type === 'Payment' ? t.amount : 0,
    narration: t.remarks || '',
  }));
  
  const initialFormValues = {
    voucherNo: base.items[0]?.particular.replace(/ .*/,'') || 'N/A',
    date: new Date(base.date),
    billingType: base.billingType,
    accountId: base.accountId,
    chequeNo: base.chequeNumber,
    chequeDate: base.chequeDate ? new Date(base.chequeDate) : null,
    items: items,
    remarks: base.remarks,
  };


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
            onFormSubmit={async () => {}}
            onCancel={() => {}}
            initialValues={initialFormValues}
            />
        </Suspense>
    </div>
  );
}
