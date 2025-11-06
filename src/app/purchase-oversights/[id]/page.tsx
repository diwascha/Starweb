
import PurchaseOrderView from '@/app/purchase-orders/[id]/_components/purchase-order-view';

// This function is required for Next.js static exports to work with dynamic routes.
export async function generateStaticParams() {
  return [];
}

// This is a Server Component that fetches initial data
export default async function PurchaseOversightViewPage({ params }: { params: { id: string } }) {
  return <PurchaseOrderView initialPurchaseOrder={null} poId={params.id} />;
}
