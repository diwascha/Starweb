import { TableCell, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';
import { Inbox } from 'lucide-react';

interface TableEmptyStateProps {
    colSpan: number;
    message?: string;
    icon?: LucideIcon;
    className?: string;
}

/** Consistent "nothing here" row for data tables, instead of a bare empty body. */
export function TableEmptyState({ colSpan, message = 'No records found.', icon: Icon = Inbox, className }: TableEmptyStateProps) {
    return (
        <TableRow>
            <TableCell colSpan={colSpan} className={cn('text-center py-16 text-muted-foreground', className)}>
                <div className="flex flex-col items-center gap-2">
                    <Icon className="h-8 w-8 opacity-30" />
                    <span className="text-sm italic">{message}</span>
                </div>
            </TableCell>
        </TableRow>
    );
}
