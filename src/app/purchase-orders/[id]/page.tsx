
'use client';
import PurchaseOrderView from './_components/purchase-order-view';
import { getPurchaseOrder } from '@/services/purchase-order-service';
import { useEffect, useState } from 'react';
import type { PurchaseOrder } from '@/lib/types';

export default function PurchaseOrderPage({ params }: { params: { id: string } }) {
  const [initialPurchaseOrder, setInitialPurchaseOrder] = useState<PurchaseOrder | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (params.id) {
      getPurchaseOrder(params.id).then(data => {
        setInitialPurchaseOrder(data);
        setLoading(false);
      });
    }
  }, [params.id]);

  if (loading) {
    return <div>Loading Purchase Order...</div>;
  }

  return <PurchaseOrderView initialPurchaseOrder={initialPurchaseOrder} poId={params.id} />;
}
