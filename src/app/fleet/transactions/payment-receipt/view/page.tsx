
'use client';
import { Suspense } from 'react';
import VoucherViewPage from './[voucherId]/page';

export default function Page() {
    return (
        <Suspense fallback={<div>Loading Page...</div>}>
            <VoucherViewPage />
        </Suspense>
    )
}
