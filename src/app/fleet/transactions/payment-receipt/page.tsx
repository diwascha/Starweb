'use client';

import { Suspense, useEffect, useMemo, useState, use } from 'react';
import { useSearchParams } from 'next/navigation';

import { getVoucherTransactions } from '@/services/transaction-service';
import type { Transaction, Vehicle, Party, Account } from '@/lib/types';
import VoucherViewClient from './_components/VoucherViewClient';
import { getVehicles } from '@/services/vehicle-service';
import { getParties } from '@/services/party-service';
import { getAccounts } from '@/services/account-service';

function VoucherView(props: { params: Promise<any>, searchParams: Promise<any> }) {
  // Next.js 15: Unwrap dynamic params and searchParams
  use(props.params);
  const searchParams = use(props.searchParams);
  
  const voucherId = searchParams.voucherId || '';

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!voucherId) return;
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      setError(null);
      try {
        const [txnData, vehicleData, partyData, accountData] = await Promise.all([
          getVoucherTransactions(voucherId),
          getVehicles(true),
          getParties(true),
          getAccounts(),
        ]);
        if (!cancelled) {
          if (txnData.length === 0) {
            setError('Voucher not found.');
          } else {
            setTransactions(txnData);
          }
          setVehicles(vehicleData);
          setParties(partyData);
          setAccounts(accountData);
        }
      } catch (err) {
        console.error('Failed to fetch voucher data:', err);
        if (!cancelled) {
          setError('Failed to load voucher data.');
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
  
  if (error) {
    return (
      <div className="flex justify-center items-center h-full">
        <p className="text-destructive">{error}</p>
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


export default function VoucherViewPage(props: { params: Promise<any>, searchParams: Promise<any> }) {
    return (
        <Suspense fallback={<div>Loading...</div>}>
            <VoucherView {...props} />
        </Suspense>
    )
}
