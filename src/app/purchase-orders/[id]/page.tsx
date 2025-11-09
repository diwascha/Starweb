
import PurchaseOrderView from './_components/purchase-order-view';
import { getPurchaseOrder, getPurchaseOrders } from '@/services/purchase-order-service';

// This function is required for Next.js static exports to work with dynamic routes.
export async function generateStaticParams() {
  // Always try to generate params for desktop builds
  if (process.env.TAURI_BUILD !== 'true') {
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
    console.error("Failed to generate static params for POs:", error);
    return [];
  }
}

// This is a Server Component that fetches initial data
export default async function PurchaseOrderPage({ params }: { params: { id: string } }) {
  // The client component will now handle fetching, so we can pass null.
  return <PurchaseOrderView initialPurchaseOrder={null} poId={params.id} />;
}
