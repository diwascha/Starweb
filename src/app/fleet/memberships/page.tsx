
'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function MembershipsRedirectPage() {
    const router = useRouter();
    useEffect(() => {
        router.replace('/fleet/policies');
    }, [router]);
    
    return (
        <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm py-24">
            <div className="flex flex-col items-center gap-1 text-center">
                <h3 className="text-2xl font-bold tracking-tight">Redirecting...</h3>
                <p className="text-sm text-muted-foreground">
                    This page has been moved. You are being redirected to Policies & Memberships.
                </p>
            </div>
        </div>
    );
}
