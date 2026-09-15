'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Superseded by the unified Fleet Ledger (dropdown-based ledger switcher).
// Kept as a redirect so old bookmarks/links don't 404.
export default function ExpensePaymentIndexPage() {
    const router = useRouter();
    useEffect(() => { router.replace('/fleet/transactions/ledger?view=expenses'); }, [router]);
    return null;
}
