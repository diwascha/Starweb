
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { Loader2 } from 'lucide-react';

export default function Home() {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    // This effect will run whenever the loading or user state changes.
    if (!loading) {
      if (user) {
        // If loading is finished and there's a user, they should be on the dashboard.
        router.replace('/dashboard');
      } else {
        // If loading is finished and there's no user, they should be at the login page.
        router.replace('/login');
      }
    }
  }, [router, user, loading]);

  // Render a loading state while the authentication check is in progress.
  return (
    <div className="flex h-screen flex-1 items-center justify-center">
      <div className="flex flex-col items-center gap-2 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <h3 className="text-xl font-bold tracking-tight">Initializing Session</h3>
        <p className="text-sm text-muted-foreground">Please wait while we check your credentials.</p>
      </div>
    </div>
  );
}
