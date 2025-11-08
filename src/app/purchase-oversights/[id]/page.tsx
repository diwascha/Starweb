import PurchaseOrderView from '@/app/purchase-orders/[id]/_components/purchase-order-view';
import { getPurchaseOrders, getPurchaseOrder } from '@/services/purchase-order-service';

// This function is required for Next.js static exports to work with dynamic routes.
export async function generateStaticParams() {
  const isDesktop = process.env.TAURI_BUILD === 'true';
  if (!isDesktop) {
    return [];
  }
  try {
    const purchaseOrders = await getPurchaseOrders(true); // Force fetch for build
    if (!purchaseOrders || purchaseOrders.length === 0) {
        return [];
    }
    return purchaseOrders.map((po) => ({
      id: po.id,
    }));
  } catch (error) {
    console.error("Failed to generate static params for PO oversights:", error);
    return [];
  }
}

// This is a Server Component that fetches initial data
export default async function PurchaseOversightViewPage({ params }: { params: { id: string } }) {
  const initialPurchaseOrder = await getPurchaseOrder(params.id);

  if (!initialPurchaseOrder) {
    return <div>Purchase Order not found.</div>;
  }

  return <PurchaseOrderView initialPurchaseOrder={initialPurchaseOrder} poId={params.id} />;
}
