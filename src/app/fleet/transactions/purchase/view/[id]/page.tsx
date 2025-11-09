
import { getTransaction, getTransactions } from '@/services/transaction-service';
import PurchaseViewClient from './_components/PurchaseViewClient';
import { getVehicles } from '@/services/vehicle-service';
import { getParties } from '@/services/party-service';
import { getAccounts } from '@/services/account-service';

export default async function PurchaseViewPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const [initialTransaction, vehicles, parties, accounts] = await Promise.all([
    getTransaction(id),
    getVehicles(),
    getParties(),
    getAccounts(),
  ]);

  if (!initialTransaction) {
    return (
        <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm py-24">
            <h3 className="text-2xl font-bold tracking-tight">Purchase transaction not found.</h3>
        </div>
    );
  }

  return (
    <PurchaseViewClient 
        initialTransaction={initialTransaction}
        vehicles={vehicles}
        parties={parties}
        accounts={accounts}
    />
  );
}
