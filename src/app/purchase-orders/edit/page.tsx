
'use client';
import { PurchaseOrderForm } from '@/app/purchase-orders/_components/purchase-order-form';
import { getPurchaseOrder } from '@/services/purchase-order-service';
import { useEffect, useState, Suspense } from 'react';
import type { PurchaseOrder } from '@/lib/types';
import { useSearchParams } from 'next/navigation';

function EditPurchaseOrderComponent() {
  const searchParams = useSearchParams();
  const id = searchParams.get('id');
  const [po, setPo] = useState<PurchaseOrder | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) {
        getPurchaseOrder(id).then(data => {
            setPo(data);
            setLoading(false);
        });
    } else {
        setLoading(false);
    }
  }, [id]);
  
  if (loading) {
    return <div>Loading...</div>;
  }

  if (!id) {
      return <div>No Purchase Order ID provided.</div>;
  }

  if (!po) {
    return <div>Purchase order not found.</div>;
  }

  return <PurchaseOrderForm poToEdit={po} />;
}

export default function EditPurchaseOrderPage() {
    return (
        <Suspense fallback={<div>Loading...</div>}>
            <EditPurchaseOrderComponent />
        </Suspense>
    );
}
