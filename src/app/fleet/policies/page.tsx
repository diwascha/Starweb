'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Superseded by the Fleet Registry (tabbed view: Vehicles, Drivers, Policies
// & Memberships). Kept as a redirect so old bookmarks/links don't 404.
export default function PoliciesRedirectPage() {
    const router = useRouter();
    useEffect(() => { router.replace('/fleet/registry?tab=policies'); }, [router]);
    return null;
}
