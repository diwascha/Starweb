'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Superseded by the Expenses / Payment & Receipts tabbed view. Kept as a
// redirect so old bookmarks/links don't 404.
export default function VoucherLogsPage() {
    const router = useRouter();
    useEffect(() => { router.replace('/fleet/transactions/expense-payment/vouchers'); }, [router]);
    return null;
}
