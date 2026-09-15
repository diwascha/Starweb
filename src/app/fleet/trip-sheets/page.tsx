'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Superseded by the Purchase & Sales ledger (one of the app's three
// consolidated ledgers). Kept as a redirect so old bookmarks/links don't 404.
export default function TripSheetsPage() {
    const router = useRouter();
    useEffect(() => { router.replace('/fleet/transactions/ledger?view=sales'); }, [router]);
    return null;
}
