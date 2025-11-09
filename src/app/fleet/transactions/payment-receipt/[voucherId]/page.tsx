import { getVoucherTransactions, getTransactions } from '@/services/transaction-service';
import type { Transaction, Vehicle, Party, Account } from '@/lib/types';
import VoucherViewClient from './_components/VoucherViewClient';
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
    if (!transactions || transactions.length === 0) {
      return [];
    }
    
    // Group transactions by voucherId to get unique voucherIds
    const voucherIds = transactions.reduce((acc, t) => {
        if (t.voucherId) {
            acc.add(t.voucherId);
        }
        return acc;
    }, new Set<string>());

    return Array.from(voucherIds).map(id => ({
      voucherId: id,
    }));
  } catch (error) {
    console.error("Failed to generate static params for vouchers:", error);
    return [];
  }
}

export default async function VoucherViewPage({ params }: { params: { voucherId: string } }) {
  const { voucherId } = params;
  
  const [initialTransactions, vehicles, parties, accounts] = await Promise.all([
    getVoucherTransactions(voucherId),
    getVehicles(true),
    getParties(true),
    getAccounts(),
  ]);

  if (!initialTransactions || initialTransactions.length === 0) {
     return (
      <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm py-24">
        <h3 className="text-2xl font-bold tracking-tight">Voucher not found.</h3>
      </div>
    );
  }

  return (
    <VoucherViewClient
      initialTransactions={initialTransactions}
      vehicles={vehicles}
      parties={parties}
      accounts={accounts}
    />
  );
}
