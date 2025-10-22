
'use client';

import { Suspense } from 'react';
import { SavedInvoicesClient } from './_components/saved-invoices-client';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';

function ListSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex justify-between">
        <Skeleton className="h-8 w-1/4" />
        <Skeleton className="h-10 w-24" />
      </div>
      <div className="border rounded-lg">
        <Skeleton className="h-12 w-full border-b" />
        <div className="space-y-2 p-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
    </div>
  );
}

export default function SavedEstimatesPage() {
    const router = useRouter();
  return (
    <div className="flex flex-col gap-8">
      <header className="flex items-center justify-between">
        <div>
            <h1 className="text-3xl font-bold tracking-tight">Saved Estimate Invoices</h1>
            <p className="text-muted-foreground">View, manage, and load your saved estimates.</p>
        </div>
        <Button variant="outline" onClick={() => router.back()}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Calculator
        </Button>
      </header>
      <Suspense fallback={<ListSkeleton />}>
        <SavedInvoicesClient />
      </Suspense>
    </div>
  );
}

    