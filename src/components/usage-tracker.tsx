
'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { trackPageVisit } from '@/services/usage-service';
import { useAuth } from '@/hooks/use-auth';

export function UsageTracker() {
  const pathname = usePathname();
  const { user } = useAuth();

  useEffect(() => {
    // Only track if a user is logged in and it's not the login page itself
    if (user && pathname !== '/login') {
      trackPageVisit(pathname);
    }
  }, [pathname, user]);

  return null;
}
