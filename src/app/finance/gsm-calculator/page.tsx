'use client';

// The GSM calculator moved to Test Report Management; old links and
// bookmarks land here and are forwarded.
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function GsmCalculatorMoved() {
    const router = useRouter();
    useEffect(() => { router.replace('/reports/gsm-calculator'); }, [router]);
    return null;
}
