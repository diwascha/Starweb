
import { getVoucherTransactions } from '@/services/transaction-service';
import type { Transaction, Vehicle, Party, Account } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Printer } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { toNepaliDate, cn } from '@/lib/utils';
import { onVehiclesUpdate } from '@/services/vehicle-service';
import { onPartiesUpdate } from '@/services/party-service';
import { onAccountsUpdate } from '@/services/account-service';
import { format } from 'date-fns';
import { getVehicles } from '@/services/vehicle-service';
import { getParties } from '@/services/party-service';
import { getAccounts } from '@/services/account-service';
import VoucherViewClient from './_components/VoucherViewClient';

// This function is required for Next.js static exports to work with dynamic routes.
export async function generateStaticParams() {
  return [];
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
