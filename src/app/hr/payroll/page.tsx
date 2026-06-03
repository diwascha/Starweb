
'use client';

import PayrollClientPage from './_components/payroll-client-page';
import { Suspense } from 'react';
import { Skeleton } from '@/components/ui/skeleton';

function PayrollSkeleton() {
    return (
        <div className="space-y-4">
            <div className="flex justify-between">
                <Skeleton className="h-10 w-1/4" />
                <div className="flex gap-2">
                    <Skeleton className="h-10 w-24" />
                    <Skeleton className="h-10 w-32" />
                </div>
            </div>
            <Skeleton className="h-[400px] w-full" />
        </div>
    );
}

export default function PayrollPage() {
    return (
        <Suspense fallback={<PayrollSkeleton />}>
            <PayrollClientPage />
        </Suspense>
    );
}
