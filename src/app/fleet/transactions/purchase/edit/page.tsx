'use client';

import { useEffect, use } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';

/**
 * @fileOverview Redirection wrapper for unified fleet entry.
 * Editing old Purchase records now leverages the enhanced Expense system.
 */
export default function EditPurchaseRedirect(props: { params: Promise<any>, searchParams: Promise<any> }) {
    const router = useRouter();
    const searchParams = use(props.searchParams);
    const id = searchParams.id;

    useEffect(() => {
        if (id) {
            router.replace(`/fleet/transactions/expenses/edit?id=${id}`);
        } else {
            router.replace('/fleet/transactions/expenses');
        }
    }, [router, id]);

    return (
        <div className="flex h-[70vh] flex-col items-center justify-center gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm font-bold uppercase tracking-widest text-muted-foreground animate-pulse">
                Navigating to Unified Ledger...
            </p>
        </div>
    );
}