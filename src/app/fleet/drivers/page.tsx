'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Superseded by /fleet/registry (tabbed Vehicles + Drivers view). Kept as a
// redirect so old bookmarks/links don't 404.
export default function DriversPage() {
    const router = useRouter();
    useEffect(() => { router.replace('/fleet/registry'); }, [router]);
    return null;
}
