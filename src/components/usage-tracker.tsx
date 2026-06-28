'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { trackPageVisit } from '@/services/usage-service';
import { useAuth } from '@/hooks/use-auth';
import { getNormalizedPath } from '@/lib/utils';

export function UsageTracker() {
  const pathname = usePathname();
  const { user } = useAuth();

  useEffect(() => {
    // Normalize path to prevent duplicates like /settings vs /settings/
    const normalizedPath = getNormalizedPath(pathname);
    
    // Only track if a user is logged in and it's not the login page 
    // or the root redirect gateway (/) to keep analytics meaningful.
    if (user && normalizedPath !== '/login' && normalizedPath !== '/') {
      trackPageVisit(normalizedPath);
    }
  }, [pathname, user]);

  return null;
}