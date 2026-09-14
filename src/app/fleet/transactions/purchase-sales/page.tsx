'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function PurchaseSalesIndexPage() {
    const router = useRouter();
    useEffect(() => { router.replace('/fleet/transactions/purchase-sales/sales'); }, [router]);
    return null;
}
