export const runtime = 'nodejs';

import PurchaseOrderView from './_components/purchase-order-view';
import { getPurchaseOrder } from '@/services/purchase-order-service';

// This is a Server Component that fetches initial data
export default async function PurchaseOrderPage({ params }: { params: { id: string } }) {
  const initialPurchaseOrder = await getPurchaseOrder(params.id);

  if (!initialPurchaseOrder) {
    return <div>Purchase Order not found.</div>;
  }
  
  return <PurchaseOrderView initialPurchaseOrder={initialPurchaseOrder} />;
}
