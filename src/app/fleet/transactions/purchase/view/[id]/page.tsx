
import { getTransaction, getTransactions } from '@/services/transaction-service';
import PurchaseViewClient from './_components/PurchaseViewClient';
import { getVehicles } from '@/services/vehicle-service';
import { getParties } from '@/services/party-service';
import { getAccounts } from '@/services/account-service';

// This function is required for Next.js static exports to work with dynamic routes.
export async function generateStaticParams() {
    // Always try to generate params for desktop builds
    if (process.env.TAURI_BUILD !== 'true') {
        return [];
    }

  try {
    const transactions = await getTransactions(true); // Force fetch for build
    const purchaseTransactions = transactions.filter(t => t.type === 'Purchase');
    if (!purchaseTransactions || purchaseTransactions.length === 0) {
      return [];
    }
    return purchaseTransactions.map((t) => ({
      id: t.id,
    }));
  } catch (error) {
    console.error("Failed to generate static params for view purchases:", error);
    return [];
  }
}

export default async function PurchaseViewPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const transaction = await getTransaction(id);
  const vehicles = await getVehicles();
  const parties = await getParties();
  const accounts = await getAccounts();

  if (!transaction) {
    return (
      <div className="flex justify-center items-center h-full">
        <p>Transaction not found.</p>
      </div>
    );
  }
  
  return (
    <PurchaseViewClient 
        initialTransaction={transaction}
        vehicles={vehicles}
        parties={parties}
        accounts={accounts}
    />
  );
}
