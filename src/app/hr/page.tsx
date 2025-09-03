
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';

// This page now simply redirects to the default HR sub-page.
export default function HRPage() {
  const router = useRouter();
  const { hasPermission } = useAuth();
  
  useEffect(() => {
    // Redirect to the first available HR page based on permissions
    if (hasPermission('hr', 'view')) {
      router.replace('/hr/employees');
    } else {
      // If they somehow land here without permission, send them to dashboard
      router.replace('/dashboard');
    }
  }, [router, hasPermission]);
  
  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="flex flex-col items-center gap-1 text-center">
        <h3 className="text-2xl font-bold tracking-tight">Redirecting...</h3>
        <p className="text-sm text-muted-foreground">Please wait.</p>
      </div>
    </div>
  );
}
