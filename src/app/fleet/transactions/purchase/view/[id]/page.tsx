
import { getTransaction, getTransactions } from '@/services/transaction-service';
import PurchaseViewClient from './_components/PurchaseViewClient';
import { getVehicles } from '@/services/vehicle-service';
import { getParties } from '@/services/party-service';
import { getAccounts } from '@/services/account-service';

export async function generateStaticParams() {
  const transactions = await getTransactions();
  const purchaseTransactions = transactions.filter(t => t.type === 'Purchase');
  if (!purchaseTransactions || purchaseTransactions.length === 0) {
    return [];
  }
  return purchaseTransactions.map((t) => ({
    id: t.id,
  }));
}

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
