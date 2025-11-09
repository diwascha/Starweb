
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
    
    // Group transactions by voucherId to get unique IDs
    const voucherIds = new Set<string>();
    transactions.forEach(t => {
        if (t.type === 'Payment' || t.type === 'Receipt') {
            if (t.voucherId) {
                voucherIds.add(t.voucherId);
            } else {
                // Fallback for legacy data that might not have a voucherId
                voucherIds.add(`legacy-${t.id}`);
            }
        }
    });
    
    return Array.from(voucherIds).map(id => ({
      voucherId: id,
    }));
  } catch (error) {
    console.error("Failed to generate static params for vouchers:", error);
    // Return an empty array on error to prevent build failure
    return [];
  }
}

export default async function VoucherViewPage({ params }: { params: { voucherId: string } }) {
  const { voucherId } = params;
  const transactions = await getVoucherTransactions(voucherId);
  const vehicles = await getVehicles();
  const parties = await getParties();
  const accounts = await getAccounts();

  if (transactions.length === 0) {
    return (
      <div className="flex justify-center items-center h-full">
        <p>Voucher not found.</p>
      </div>
    );
  }

  return (
    <VoucherViewClient
      initialTransactions={transactions}
      vehicles={vehicles}
      parties={parties}
      accounts={accounts}
    />
  );
}
