'use client';
export const runtime = 'nodejs';

import PurchaseOrderView from '@/app/purchase-orders/[id]/_components/purchase-order-view';

export default function PurchaseOversightViewPage({ params }: { params: { id: string } }) {
  return <PurchaseOrderView initialPurchaseOrder={null} poId={params.id} />;
}
