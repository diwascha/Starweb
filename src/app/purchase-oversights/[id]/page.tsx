
import PurchaseOrderView from '@/app/purchase-orders/[id]/_components/purchase-order-view';

// This is a Server Component that fetches initial data
export default async function PurchaseOversightViewPage({ params }: { params: { id: string } }) {
  return <PurchaseOrderView initialPurchaseOrder={null} poId={params.id} />;
}
