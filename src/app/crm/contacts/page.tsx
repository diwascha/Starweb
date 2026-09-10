'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

/**
 * @fileOverview Redirect wrapper for the old standalone Contacts directory.
 * Contact management now lives inside each company's own record on the
 * Companies page, so a person's info stays next to the account they work
 * for instead of being a disconnected list.
 */
export default function ContactsRedirectPage() {
    const router = useRouter();

    useEffect(() => {
        router.replace('/crm/companies');
    }, [router]);

    return (
        <div className="flex h-[70vh] flex-col items-center justify-center gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm font-bold uppercase tracking-widest text-muted-foreground animate-pulse">
                Navigating to Companies &amp; Contacts...
            </p>
        </div>
    );
}
