'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { trackPageVisit } from '@/services/usage-service';
import { useAuth } from '@/hooks/use-auth';
import { getNormalizedPath } from '@/lib/utils';

/**
 * @fileOverview Performance-optimized usage tracker.
 * Avoids redundant tracking and ensures non-blocking execution.
 */
export function UsageTracker() {
  const pathname = usePathname();
  const { user } = useAuth();
  const lastTrackedPath = useRef<string | null>(null);

  useEffect(() => {
    const normalizedPath = getNormalizedPath(pathname);
    
    // Only track if logged in, not on gateway pages, and the path has actually changed.
    if (user && normalizedPath !== '/login' && normalizedPath !== '/' && normalizedPath !== lastTrackedPath.current) {
      lastTrackedPath.current = normalizedPath;
      
      // Fire-and-forget tracking to avoid blocking any UI processes.
      // Small timeout ensures tracking happens after critical render path.
      const timer = setTimeout(() => {
        trackPageVisit(normalizedPath).catch(() => {
            // Silently ignore tracking failures to maintain UX performance
        });
      }, 500);
      
      return () => clearTimeout(timer);
    }
  }, [pathname, user]);

  return null;
}
