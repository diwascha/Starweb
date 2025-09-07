
import { getTransaction } from '@/services/transaction-service';
import { getVehicles } from '@/services/vehicle-service';
import { getParties } from '@/services/party-service';
import { getAccounts } from '@/services/account-service';
import { PurchaseForm } from '../../../_components/purchase-form';

export default async function EditPurchasePage({ params }: { params: { id: string } }) {
  const { id } = params;
  
  const [initialTransaction, vehicles, parties, accounts] = await Promise.all([
    getTransaction(id),
    getVehicles(),
    getParties(),
    getAccounts()
  ]);

  if (!initialTransaction) {
     return (
      <div class="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm py-24">
        <h3 class="text-2xl font-bold tracking-tight">Purchase not found.</h3>
      </div>
    );
  }

  const initialFormValues = {
      ...initialTransaction,
      date: new Date(initialTransaction.date),
      invoiceDate: initialTransaction.invoiceDate ? new Date(initialTransaction.invoiceDate) : null,
      chequeDate: initialTransaction.chequeDate ? new Date(initialTransaction.chequeDate) : null,
      dueDate: initialTransaction.dueDate ? new Date(initialTransaction.dueDate) : null,
  };

  return (
    <div class="flex flex-col gap-8">
      <header>
        <h1 class="text-3xl font-bold tracking-tight">Edit Purchase</h1>
        <p class="text-muted-foreground">Modify the details for purchase #{initialFormValues.purchaseNumber}.</p>
      </header>
        <PurchaseForm
          accounts={accounts}
          parties={parties}
          vehicles={vehicles}
          onFormSubmit={async () => {}}
          onCancel={() => {}}
          initialValues={initialFormValues}
        />
    </div>
  );
}
