'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

/**
 * @fileOverview Redirection logic for unified fleet reporting.
 * Purchases are now merged into the main Expense History.
 */
export default function PurchaseLogsRedirect() {
    const router = useRouter();

    useEffect(() => {
        router.replace('/fleet/transactions/expenses');
    }, [router]);

    return (
        <div className="flex h-[70vh] flex-col items-center justify-center gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm font-bold uppercase tracking-widest text-muted-foreground animate-pulse">
                Redirecting to Unified Expense History...
            </p>
        </div>
    );
}
