
'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { getTransaction } from '@/services/transaction-service';
import { getVehicles } from '@/services/vehicle-service';
import { getParties } from '@/services/party-service';
import { getAccounts } from '@/services/account-service';
import { getUoms } from '@/services/uom-service';
import EditPurchaseClientPage from '../_components/EditPurchaseClientPage';


function EditPurchaseComponent() {
  const searchParams = useSearchParams();
  const id = searchParams.get('id');
  const [initialValues, setInitialValues] = useState<any>(null);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [parties, setParties] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [uoms, setUoms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) {
      Promise.all([
        getTransaction(id),
        getVehicles(),
        getParties(),
        getAccounts(),
        getUoms()
      ]).then(([transactionData, vehicleData, partyData, accountData, uomData]) => {
        if (transactionData) {
          setInitialValues({
            ...transactionData,
            date: new Date(transactionData.date),
            invoiceDate: transactionData.invoiceDate ? new Date(transactionData.invoiceDate) : null,
            chequeDate: transactionData.chequeDate ? new Date(transactionData.chequeDate) : null,
            dueDate: transactionData.dueDate ? new Date(transactionData.dueDate) : null,
          });
        }
        setVehicles(vehicleData);
        setParties(partyData);
        setAccounts(accountData);
        setUoms(uomData);
        setLoading(false);
      });
    }
  }, [id]);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm py-24">
        <h3 className="text-2xl font-bold tracking-tight">Loading...</h3>
      </div>
    );
  }

  if (!initialValues) {
    return (
      <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm py-24">
        <h3 className="text-2xl font-bold tracking-tight">Purchase not found.</h3>
      </div>
    );
  }

  return (
    <EditPurchaseClientPage
      accounts={accounts}
      parties={parties}
      vehicles={vehicles}
      uoms={uoms}
      initialValues={initialValues}
      transactionId={id!}
    />
  );
}


export default function EditPurchasePage() {
  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Edit Purchase</h1>
        <p className="text-muted-foreground">Modify the details for this purchase transaction.</p>
      </header>
       <Suspense fallback={<div>Loading Form...</div>}>
         <EditPurchaseComponent />
       </Suspense>
    </div>
  );
}
