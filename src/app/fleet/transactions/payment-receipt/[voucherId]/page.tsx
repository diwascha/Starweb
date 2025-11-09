'use client';

import { useEffect, useState } from 'react';
import { getVoucherTransactions } from '@/services/transaction-service';
import type { Transaction, Vehicle, Party, Account } from '@/lib/types';
import VoucherViewClient from './_components/VoucherViewClient';
import { getVehicles } from '@/services/vehicle-service';
import { getParties } from '@/services/party-service';
import { getAccounts } from '@/services/account-service';

export default function VoucherViewPage({ params }: { params: { voucherId: string } }) {
  const { voucherId } = params;
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      setIsLoading(true);
      try {
        const [txnData, vehicleData, partyData, accountData] = await Promise.all([
          getVoucherTransactions(voucherId),
          getVehicles(),
          getParties(),
          getAccounts(),
        ]);
        setTransactions(txnData);
        setVehicles(vehicleData);
        setParties(partyData);
        setAccounts(accountData);
      } catch (error) {
        console.error("Failed to fetch voucher data:", error);
      } finally {
        setIsLoading(false);
      }
    }
    fetchData();
  }, [voucherId]);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-full">
        <p>Loading voucher...</p>
      </div>
    );
  }

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
