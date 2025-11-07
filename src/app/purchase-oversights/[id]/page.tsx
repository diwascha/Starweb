
import PurchaseOrderView from '@/app/purchase-orders/[id]/_components/purchase-order-view';
import { getPurchaseOrders } from '@/services/purchase-order-service';

// This function is required for Next.js static exports to work with dynamic routes.
export async function generateStaticParams() {
  const isDesktop = process.env.NEXT_PUBLIC_IS_DESKTOP === 'true';
  if (!isDesktop) {
    return [];
  }
  const purchaseOrders = await getPurchaseOrders();
  return purchaseOrders.map((po) => ({
    id: po.id,
  }));
}

// This is a Server Component that fetches initial data
export default async function PurchaseOversightViewPage({ params }: { params: { id: string } }) {
  return <PurchaseOrderView initialPurchaseOrder={null} poId={params.id} />;
}
