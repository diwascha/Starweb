
import { PurchaseOrderForm } from '@/app/purchase-orders/_components/purchase-order-form';
import { getPurchaseOrder, getPurchaseOrders } from '@/services/purchase-order-service';

// This is a Server Component that fetches initial data
export default async function EditPurchaseOrderPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const initialPurchaseOrder = await getPurchaseOrder(id);

  if (!initialPurchaseOrder) {
    return <div>Purchase order not found.</div>;
  }

  return <PurchaseOrderForm poToEdit={initialPurchaseOrder} />;
}
