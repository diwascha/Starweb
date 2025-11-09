
import { PurchaseOrderForm } from '@/app/purchase-orders/_components/purchase-order-form';
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
        console.error("Failed to generate static params for edit POs:", error);
        return [];
    }
}

// This is a Server Component that fetches initial data
export default async function EditPurchaseOrderPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const initialPurchaseOrder = await getPurchaseOrder(id);

  if (!initialPurchaseOrder) {
    return <div>Purchase order not found.</div>;
  }

  return <PurchaseOrderForm poToEdit={initialPurchaseOrder} />;
}
