'use client';

import { ShieldAlert } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import Link from 'next/link';

interface LockedFeatureNoticeProps {
    title: string;
    /** e.g. "streams a full fiscal year of attendance records (~17,000 reads per visit)" */
    reason: string;
}

/**
 * Shown in place of a feature disabled to conserve Firestore's free read
 * quota. Nothing behind this page has been deleted - an administrator can
 * re-enable it from Settings > System when it's actually needed.
 */
export function LockedFeatureNotice({ title, reason }: LockedFeatureNoticeProps) {
    return (
        <div className="flex flex-col gap-8">
            <header>
                <h1 className="text-3xl font-bold tracking-tight text-foreground">{title}</h1>
                <p className="text-muted-foreground text-sm">Temporarily disabled to conserve database quota.</p>
            </header>
            <Card className="border-2">
                <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
                    <ShieldAlert className="h-8 w-8 text-muted-foreground" />
                    <p className="max-w-md text-sm font-semibold text-muted-foreground">
                        This page {reason}, which is more than the free database plan allows to run
                        every day alongside the rest of the app. Nothing here has been removed - an
                        administrator can switch it back on from{' '}
                        <Link href="/settings/system" className="underline hover:text-foreground">
                            Settings &amp; Security
                        </Link>{' '}
                        when it's needed, then off again afterwards.
                    </p>
                </CardContent>
            </Card>
        </div>
    );
}
