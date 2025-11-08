
import { getVoucherTransactions, getTransactions } from '@/services/transaction-service';
import type { Transaction, Vehicle, Party, Account } from '@/lib/types';
import VoucherViewClient from './_components/VoucherViewClient';
import { getVehicles } from '@/services/vehicle-service';
import { getParties } from '@/services/party-service';
import { getAccounts } from '@/services/account-service';


// This function is required for Next.js static exports to work with dynamic routes.
export async function generateStaticParams() {
  const isDesktop = process.env.TAURI_BUILD === 'true';
  if (!isDesktop) {
    return [];
  }
  const transactions = await getTransactions();
  const voucherIds = Array.from(new Set(transactions.map(t => t.voucherId).filter(Boolean)));
  return voucherIds.map(id => ({ voucherId: id as string }));
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
