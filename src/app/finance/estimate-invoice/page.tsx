
'use client';

import { Suspense } from 'react';
import { InvoiceCalculator } from './_components/invoice-calculator';
import { Skeleton } from '@/components/ui/skeleton';

function CalculatorSkeleton() {
    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Skeleton className="h-10" />
                <Skeleton className="h-10" />
                <Skeleton className="h-10" />
                <Skeleton className="h-10" />
            </div>
             <div className="border rounded-lg p-4">
                <Skeleton className="h-8 w-1/4 mb-4" />
                <div className="space-y-2">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                </div>
            </div>
             <div className="border rounded-lg p-4">
                <Skeleton className="h-8 w-1/4 mb-4" />
                <Skeleton className="h-10 w-full" />
            </div>
             <div className="flex justify-end">
                <Skeleton className="h-10 w-24" />
             </div>
        </div>
    );
}

export default function EstimateInvoicePage() {
  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Estimate Invoice Generator</h1>
        <p className="text-muted-foreground">Create and print estimate invoices for customers.</p>
      </header>
       <Suspense fallback={<CalculatorSkeleton />}>
            <InvoiceCalculator />
        </Suspense>
    </div>
  );
}

    