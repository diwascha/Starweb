'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

/**
 * @fileOverview Redirect wrapper for the consolidated HR Office page.
 */
export default function HolidayRedirectPage() {
    const router = useRouter();

    useEffect(() => {
        router.replace('/hr/office');
    }, [router]);

    return (
        <div className="flex h-[70vh] flex-col items-center justify-center gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm font-bold uppercase tracking-widest text-muted-foreground animate-pulse">
                Redirecting to HR Office...
            </p>
        </div>
    );
}
