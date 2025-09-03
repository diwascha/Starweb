
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/reports');
  }, [router]);

  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="flex flex-col items-center gap-1 text-center">
        <h3 className="text-2xl font-bold tracking-tight">Redirecting...</h3>
        <p className="text-sm text-muted-foreground">Please wait while we take you to the reports dashboard.</p>
      </div>
    </div>
  );
}
