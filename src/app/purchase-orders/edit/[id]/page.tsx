
'use client';

import { PurchaseOrderForm } from '@/app/purchase-orders/_components/purchase-order-form';
import type { PurchaseOrder } from '@/lib/types';
import { useEffect, useState } from 'react';
import { onPurchaseOrdersUpdate } from '@/services/purchase-order-service';

export default function EditPurchaseOrderPage({ params }: { params: { id: string } }) {
  const poId = params.id;
  const [purchaseOrder, setPurchaseOrder] = useState<PurchaseOrder | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (poId) {
      const unsubscribe = onPurchaseOrdersUpdate((purchaseOrders) => {
        const found = purchaseOrders.find(p => p.id === poId);
        setPurchaseOrder(found || null);
        setIsLoading(false);
      });
      return () => unsubscribe();
    } else {
      setIsLoading(false);
    }
  }, [poId]);

  if (isLoading) {
    return <div>Loading purchase order...</div>;
  }

  if (!purchaseOrder) {
    return <div>Purchase order not found.</div>;
  }

  return <PurchaseOrderForm poToEdit={purchaseOrder} />;
}
