'use client';

import { Button } from '@/components/ui/button';
import { TableHead } from '@/components/ui/table';
import { ArrowUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SortableHeadProps {
    label: string;
    active: boolean;
    align?: 'left' | 'right';
    className?: string;
    onClick: () => void;
}

export function SortableHead({ label, active, align = 'left', className, onClick }: SortableHeadProps) {
    return (
        <TableHead className={className}>
            <Button
                variant="ghost"
                onClick={onClick}
                className={cn(
                    '-ml-4 h-8 px-2 text-[0.6875rem] font-black uppercase tracking-wider',
                    align === 'right' && 'ml-0 -mr-4 w-full justify-end'
                )}
            >
                {label} <ArrowUpDown className={cn('ml-2 h-3 w-3', active ? 'opacity-100' : 'opacity-30')} />
            </Button>
        </TableHead>
    );
}
