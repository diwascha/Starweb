
import { getTransaction, getTransactions } from '@/services/transaction-service';
import PurchaseViewClient from './_components/PurchaseViewClient';
import { getVehicles } from '@/services/vehicle-service';
import { getParties } from '@/services/party-service';
import { getAccounts } from '@/services/account-service';

export async function generateStaticParams() {
  if (process.env.TAURI_BUILD !== 'true') {
    return [];
  }
  try {
    const transactions = await getTransactions(true);
    const purchaseTransactions = transactions.filter(t => t.type === 'Purchase');
    if (!purchaseTransactions || purchaseTransactions.length === 0) {
      return [];
    }
    return purchaseTransactions.map((t) => ({
      id: t.id,
    }));
  } catch (error) {
    console.error("Failed to generate static params for purchase view:", error);
    return [];
  }
}

export default async function PurchaseViewPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const [initialTransaction, vehicles, parties, accounts] = await Promise.all([
    getTransaction(id),
    getVehicles(true),
    getParties(true),
    getAccounts(true),
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
