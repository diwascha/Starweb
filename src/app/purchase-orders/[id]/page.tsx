
import PurchaseOrderView from './_components/purchase-order-view';
import { getPurchaseOrder, getPurchaseOrders } from '@/services/purchase-order-service';

// This is a Server Component that fetches initial data
export default async function PurchaseOrderPage({ params }: { params: { id: string } }) {
  const initialPurchaseOrder = await getPurchaseOrder(params.id);
  
  return <PurchaseOrderView initialPurchaseOrder={initialPurchaseOrder} poId={params.id} />;
}
