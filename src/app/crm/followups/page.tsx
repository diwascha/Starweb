'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

/**
 * @fileOverview Redirect wrapper for the old standalone Follow-ups page.
 * Follow-ups now live as a tab on the merged Client Activity page, next to
 * the Deals pipeline and the Incidents & Feedback log for the same client.
 */
export default function FollowUpsRedirectPage() {
    const router = useRouter();

    useEffect(() => {
        router.replace('/crm/deals');
    }, [router]);

    return (
        <div className="flex h-[70vh] flex-col items-center justify-center gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm font-bold uppercase tracking-widest text-muted-foreground animate-pulse">
                Navigating to Client Activity...
            </p>
        </div>
    );
}
