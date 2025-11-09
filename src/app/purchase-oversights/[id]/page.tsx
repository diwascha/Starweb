
import PurchaseOrderView from '@/app/purchase-orders/[id]/_components/purchase-order-view';
import { getPurchaseOrders, getPurchaseOrder } from '@/services/purchase-order-service';

// This is a Server Component that fetches initial data
export default async function PurchaseOversightViewPage({ params }: { params: { id: string } }) {
  const initialPurchaseOrder = await getPurchaseOrder(params.id);

  if (!initialPurchaseOrder) {
    return <div>Purchase Order not found.</div>;
  }

  return <PurchaseOrderView initialPurchaseOrder={initialPurchaseOrder} poId={params.id} />;
}
