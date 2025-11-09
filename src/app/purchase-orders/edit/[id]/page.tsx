
'use client';
import { PurchaseOrderForm } from '@/app/purchase-orders/_components/purchase-order-form';
import { getPurchaseOrder } from '@/services/purchase-order-service';
import { useEffect, useState } from 'react';
import type { PurchaseOrder } from '@/lib/types';


export default function EditPurchaseOrderPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const [po, setPo] = useState<PurchaseOrder | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getPurchaseOrder(id).then(data => {
      setPo(data);
      setLoading(false);
    });
  }, [id]);
  
  if (loading) {
    return <div>Loading...</div>;
  }

  if (!po) {
    return <div>Purchase order not found.</div>;
  }

  return <PurchaseOrderForm poToEdit={po} />;
}
