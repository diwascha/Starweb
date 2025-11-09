
'use client';
import { Suspense, useEffect, useState } from 'react';
import PurchaseViewClient from './_components/PurchaseViewClient';
import { getTransaction, onTransactionsUpdate } from '@/services/transaction-service';
import { onVehiclesUpdate } from '@/services/vehicle-service';
import { onPartiesUpdate } from '@/services/party-service';
import { onAccountsUpdate } from '@/services/account-service';
import type { Transaction, Vehicle, Party, Account } from '@/lib/types';


export default function PurchaseViewPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const [transaction, setTransaction] = useState<Transaction | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const unsubVehicles = onVehiclesUpdate(setVehicles);
    const unsubParties = onPartiesUpdate(setParties);
    const unsubAccounts = onAccountsUpdate(setAccounts);
    
    // For a single document, it's often more efficient to fetch once
    // but we can use onSnapshot if real-time updates for this one doc are needed.
    getTransaction(id).then(data => {
        setTransaction(data);
        setIsLoading(false);
    });

    return () => {
        unsubVehicles();
        unsubParties();
        unsubAccounts();
    }
  }, [id]);

  if (isLoading) {
    return (
        <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm py-24">
            <h3 className="text-2xl font-bold tracking-tight">Loading Purchase...</h3>
        </div>
    );
  }

  if (!transaction) {
    return (
        <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm py-24">
            <h3 className="text-2xl font-bold tracking-tight">Purchase transaction not found.</h3>
        </div>
    );
  }

  return (
    <Suspense fallback={<div>Loading...</div>}>
      <PurchaseViewClient 
          initialTransaction={transaction}
          vehicles={vehicles}
          parties={parties}
          accounts={accounts}
      />
    </Suspense>
  );
}
