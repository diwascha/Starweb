export const runtime = 'nodejs';

import { getTransaction } from '@/services/transaction-service';
import PurchaseViewClient from './_components/PurchaseViewClient';
import { getVehicles } from '@/services/vehicle-service';
import { getParties } from '@/services/party-service';
import { getAccounts } from '@/services/account-service';

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
