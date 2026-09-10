'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

/**
 * @fileOverview Redirect wrapper - Consolidated Ledger import now lives
 * alongside Machine Logs import on the unified Data Import page, so there's
 * a single place to bring in workforce data regardless of source format.
 */
export default function ImportRedirectPage() {
    const router = useRouter();

    useEffect(() => {
        router.replace('/hr/attendance/raw');
    }, [router]);

    return (
        <div className="flex h-[70vh] flex-col items-center justify-center gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm font-bold uppercase tracking-widest text-muted-foreground animate-pulse">
                Redirecting to Data Import...
            </p>
        </div>
    );
}
