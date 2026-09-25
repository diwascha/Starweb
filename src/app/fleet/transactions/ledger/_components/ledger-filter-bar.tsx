'use client';

import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

export function LedgerFilterBar({ children, className }: { children: React.ReactNode; className?: string }) {
    return (
        <div className={cn('flex flex-wrap gap-3 items-end bg-muted/20 p-4 rounded-xl border border-dashed', className)}>
            {children}
        </div>
    );
}

export function LedgerFilterField({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
    return (
        <div className={cn('space-y-1.5 min-w-[150px]', className)}>
            <Label className="text-[0.625rem] uppercase font-bold text-muted-foreground">{label}</Label>
            {children}
        </div>
    );
}
