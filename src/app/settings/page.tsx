'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

/**
 * @fileOverview Redirect wrapper for modular settings.
 */
export default function SettingsRedirectPage() {
    const router = useRouter();

    useEffect(() => {
        router.replace('/settings/general');
    }, [router]);

    return (
        <div className="flex h-[70vh] flex-col items-center justify-center gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm font-bold uppercase tracking-widest text-muted-foreground animate-pulse">
                Loading Configuration Hub...
            </p>
        </div>
    );
}
