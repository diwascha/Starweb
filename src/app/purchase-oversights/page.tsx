
'use client';
import PurchaseOrderView from '@/app/purchase-orders/[id]/_components/purchase-order-view';
import { getPurchaseOrder } from '@/services/purchase-order-service';
import { useEffect, useState, Suspense } from 'react';
import type { PurchaseOrder } from '@/lib/types';
import { useSearchParams } from 'next/navigation';
import { Skeleton } from '@/components/ui/skeleton';

function PurchaseOversightViewComponent() {
  const searchParams = useSearchParams();
  const id = searchParams.get('id');
  const [initialPurchaseOrder, setInitialPurchaseOrder] = useState<PurchaseOrder | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) {
      getPurchaseOrder(id).then(data => {
        setInitialPurchaseOrder(data);
        setLoading(false);
      });
    } else {
        setLoading(false);
    }
  }, [id]);

  if (loading) {
    return <div className="p-8 text-center">Loading Purchase Order...</div>;
  }
  
  if (!id) {
    return <div className="p-8 text-center">No Purchase Order ID provided.</div>;
  }

  if (!initialPurchaseOrder) {
      return <div>Purchase Order not found.</div>;
  }

  return <PurchaseOrderView initialPurchaseOrder={initialPurchaseOrder} poId={id} />;
}

// This is a Server Component that fetches initial data
export default function PurchaseOversightViewPage() {
  return (
    <Suspense fallback={
        <div className="space-y-4">
            <Skeleton className="h-10 w-1/4" />
            <Skeleton className="h-[80vh] w-full" />
        </div>
    }>
        <PurchaseOversightViewComponent />
    </Suspense>
  );
}

