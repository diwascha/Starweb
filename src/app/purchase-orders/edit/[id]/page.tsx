
'use client';

import { PurchaseOrderForm } from '@/app/purchase-orders/_components/purchase-order-form';
import useLocalStorage from '@/hooks/use-local-storage';
import type { PurchaseOrder } from '@/lib/types';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

export default function EditPurchaseOrderPage() {
  const params = useParams();
  const poId = Array.isArray(params.id) ? params.id[0] : params.id;
  const [purchaseOrders] = useLocalStorage<PurchaseOrder[]>('purchaseOrders', []);
  const [purchaseOrder, setPurchaseOrder] = useState<PurchaseOrder | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (poId) {
      const found = purchaseOrders.find(p => p.id === poId);
      setPurchaseOrder(found || null);
    }
    setIsLoading(false);
  }, [poId, purchaseOrders]);

  if (isLoading) {
    return <div>Loading purchase order...</div>;
  }

  if (!purchaseOrder) {
    return <div>Purchase order not found.</div>;
  }

  return <PurchaseOrderForm poToEdit={purchaseOrder} />;
}
