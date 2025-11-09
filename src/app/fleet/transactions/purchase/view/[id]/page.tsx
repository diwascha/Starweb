
'use client';

import { useEffect, useState } from 'react';
import { getTransaction } from '@/services/transaction-service';
import PurchaseViewClient from './_components/PurchaseViewClient';
import { getVehicles } from '@/services/vehicle-service';
import { getParties } from '@/services/party-service';
import { getAccounts } from '@/services/account-service';
import type { Transaction, Vehicle, Party, Account } from '@/lib/types';


export default function PurchaseViewPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const [transaction, setTransaction] = useState<Transaction | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      setIsLoading(true);
      try {
        const [txnData, vehicleData, partyData, accountData] = await Promise.all([
          getTransaction(id),
          getVehicles(),
          getParties(),
          getAccounts(),
        ]);
        setTransaction(txnData);
        setVehicles(vehicleData);
        setParties(partyData);
        setAccounts(accountData);
      } catch (error) {
        console.error("Failed to fetch purchase data:", error);
      } finally {
        setIsLoading(false);
      }
    }
    fetchData();
  }, [id]);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-full">
        <p>Loading transaction...</p>
      </div>
    );
  }

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

