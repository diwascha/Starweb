export const runtime = 'edge';
import PurchaseOrderView from './_components/purchase-order-view';

export default function PurchaseOrderPage({ params }: { params: { id: string } }) {
  return <PurchaseOrderView poId={params.id} />;
}
