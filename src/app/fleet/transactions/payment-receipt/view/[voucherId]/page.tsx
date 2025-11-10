
'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';

import { onVoucherTransactionsUpdate } from '@/services/transaction-service';
import type { Transaction, Vehicle, Party, Account } from '@/lib/types';
import VoucherViewClient from '../../_components/VoucherViewClient';
import { onVehiclesUpdate } from '@/services/vehicle-service';
import { onPartiesUpdate } from '@/services/party-service';
import { onAccountsUpdate } from '@/services/account-service';

function VoucherView() {
  const params = useParams();
  const voucherId = params.voucherId as string;

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!voucherId) return;

    const unsubTxns = onVoucherTransactionsUpdate(voucherId, (txnData) => {
        if (txnData.length === 0) {
            setError('Voucher not found.');
        } else {
            setTransactions(txnData);
            setError(null);
        }
        setIsLoading(false);
    });
    
    const unsubVehicles = onVehiclesUpdate(setVehicles);
    const unsubParties = onPartiesUpdate(setParties);
    const unsubAccounts = onAccountsUpdate(setAccounts);

    return () => {
        unsubTxns();
        unsubVehicles();
        unsubParties();
        unsubAccounts();
    }
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


export default function VoucherViewPage() {
    return (
        <Suspense fallback={<div>Loading...</div>}>
            <VoucherView />
        </Suspense>
    )
}
