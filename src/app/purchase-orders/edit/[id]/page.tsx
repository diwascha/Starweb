
import { PurchaseOrderForm } from '@/app/purchase-orders/_components/purchase-order-form';
import { getPurchaseOrder, getPurchaseOrders } from '@/services/purchase-order-service';

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
export default async function EditPurchaseOrderPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const initialPurchaseOrder = await getPurchaseOrder(id);

  if (!initialPurchaseOrder) {
    return <div>Purchase order not found.</div>;
  }

  return <PurchaseOrderForm poToEdit={initialPurchaseOrder} />;
}
