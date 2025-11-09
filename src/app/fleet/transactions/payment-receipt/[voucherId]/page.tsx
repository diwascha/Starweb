'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';

import { getVoucherTransactions } from '@/services/transaction-service';
import type { Transaction, Vehicle, Party, Account } from '@/lib/types';
import VoucherViewClient from './_components/VoucherViewClient';
import { getVehicles } from '@/services/vehicle-service';
import { getParties } from '@/services/party-service';
import { getAccounts } from '@/services/account-service';

export default function VoucherViewPage() {
  const sp = useSearchParams();
  // read /fleet/transactions/payment-receipt?voucherId=123
  const voucherId = useMemo(() => sp.get('voucherId') ?? '', [sp]);

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!voucherId) return;
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      try {
        // IMPORTANT: these must be client-safe (no server-only code)
        const [txnData, vehicleData, partyData, accountData] = await Promise.all([
          getVoucherTransactions(voucherId),
          getVehicles(),
          getParties(),
          getAccounts(),
        ]);
        if (!cancelled) {
          setTransactions(txnData);
          setVehicles(vehicleData);
          setParties(partyData);
          setAccounts(accountData);
        }
      } catch (err) {
        console.error('Failed to fetch voucher data:', err);
        if (!cancelled) {
          setTransactions([]);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [voucherId]);

  if (!voucherId) {
    return (
      <div className="flex justify-center items-center h-full">
        <p>Missing <code>voucherId</code> in URL.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-full">
        <p>Loading voucher…</p>
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
