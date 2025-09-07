'use client';
export const runtime = 'nodejs';

import PurchaseOrderView from './_components/purchase-order-view';
import { use } from 'react';

export default function PurchaseOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <PurchaseOrderView poId={id} />;
}
