'use client';

import type { ReactNode } from 'react';
import { ArrowUpDown, ChevronUp, ChevronDown } from 'lucide-react';
import { TableHead } from '@/components/ui/table';
import { cn } from '@/lib/utils';

/**
 * Click-the-header-text-to-sort control shared by every Excel-style table in
 * the app (Payroll, Benchmark, Attendance, Data Import). Pass a
 * MultiSelectFilter (or any control) as children to also get a per-column
 * filter icon in the same header cell - the two are independent, so a column
 * can have either, both, or neither.
 */
export function SortableHead<K extends string>({
    label,
    sortKey,
    sortConfig,
    onSort,
    align = 'left',
    className,
    children,
}: {
    label: string;
    sortKey: K;
    sortConfig: { key: K; direction: 'asc' | 'desc' } | null;
    onSort: (key: K) => void;
    align?: 'left' | 'center' | 'right';
    className?: string;
    children?: ReactNode;
}) {
    const isActive = sortConfig?.key === sortKey;
    return (
        <TableHead className={cn('font-black uppercase px-3', align === 'center' && 'text-center', align === 'right' && 'text-right', className)}>
            <span className="inline-flex items-center gap-1">
                <button type="button" onClick={() => onSort(sortKey)} className={cn('inline-flex items-center gap-1 hover:text-primary transition-colors', isActive && 'text-primary')}>
                    {label}
                    {isActive ? (sortConfig!.direction === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-30" />}
                </button>
                {children}
            </span>
        </TableHead>
    );
}
