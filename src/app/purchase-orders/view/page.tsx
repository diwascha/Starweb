'use client';
import PurchaseOrderView from '../[id]/_components/purchase-order-view';
import { getPurchaseOrder } from '@/services/purchase-order-service';
import { useEffect, useState, Suspense, use } from 'react';
import type { PurchaseOrder } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';


function PurchaseOrderViewComponent(props: { params: Promise<any>, searchParams: Promise<any> }) {
  // Next.js 15: Unwrap dynamic params and searchParams
  use(props.params);
  const searchParams = use(props.searchParams);
  
  const id = searchParams.id;
  const [initialPurchaseOrder, setInitialPurchaseOrder] = useState<PurchaseOrder | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) {
      getPurchaseOrder(id).then(poData => {
        setInitialPurchaseOrder(poData);
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

export default function PurchaseOrderPage(props: { params: Promise<any>, searchParams: Promise<any> }) {
    return (
        <Suspense fallback={
            <div className="space-y-4">
                <Skeleton className="h-10 w-1/4" />
                <Skeleton className="h-[80vh] w-full" />
            </div>
        }>
            <PurchaseOrderViewComponent {...props} />
        </Suspense>
    );
}
