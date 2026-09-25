'use client';

import { useEffect, useState } from 'react';
import { History, Loader2, TrendingDown, TrendingUp } from 'lucide-react';
import type { Employee, Payroll, WageRevision } from '@/lib/types';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { toNepaliDate } from '@/lib/utils';
import { NEPALI_MONTHS } from '@/lib/constants';
import { getPayrollHistoryForEmployee } from '@/services/payroll/data';

interface WageHistoryDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    employee: Employee | null;
}

const monthName = (bsMonth: number) =>
    NEPALI_MONTHS.find(m => m.value === bsMonth)?.name || String(bsMonth);

const money = (value: number | undefined) => `Rs. ${(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

/** Direction of a revision against the one before it, for the arrow badge. */
const revisionDelta = (revisions: WageRevision[], index: number): number => {
    const previous = revisions[index + 1];
    if (!previous) return 0;
    return (revisions[index].wageAmount || 0) - (previous.wageAmount || 0);
};

export function WageHistoryDialog({ open, onOpenChange, employee }: WageHistoryDialogProps) {
    const [payroll, setPayroll] = useState<Payroll[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (!open || !employee) {
            setPayroll([]);
            return;
        }
        let cancelled = false;
        setIsLoading(true);
        getPayrollHistoryForEmployee(employee.id)
            .then(records => { if (!cancelled) setPayroll(records); })
            .finally(() => { if (!cancelled) setIsLoading(false); });
        return () => { cancelled = true; };
    }, [open, employee]);

    // Newest revision first; the stored array is append-ordered.
    const revisions = [...(employee?.wageHistory || [])].reverse();

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <History className="h-5 w-5" /> Wage History — {employee?.name}
                    </DialogTitle>
                    <DialogDescription>
                        Recorded rate revisions on the employee record, and the rate actually
                        applied in each payroll run.
                    </DialogDescription>
                </DialogHeader>

                <ScrollArea className="max-h-[60vh] pr-4">
                    <div className="space-y-6">
                        <div>
                            <Label className="text-[0.625rem] font-black uppercase tracking-widest text-muted-foreground">
                                Rate revisions
                            </Label>
                            {revisions.length === 0 ? (
                                <p className="mt-2 text-sm text-muted-foreground">
                                    No revisions recorded yet. A new entry is added automatically the
                                    next time this employee's wage basis, amount or allowance changes.
                                </p>
                            ) : (
                                <div className="mt-2 overflow-hidden rounded-lg border">
                                    <Table>
                                        <TableHeader className="bg-muted/30">
                                            <TableRow className="hover:bg-transparent">
                                                <TableHead className="text-[0.625rem] font-black uppercase tracking-widest">Effective From</TableHead>
                                                <TableHead className="text-[0.625rem] font-black uppercase tracking-widest">Basis</TableHead>
                                                <TableHead className="text-right text-[0.625rem] font-black uppercase tracking-widest">Wage</TableHead>
                                                <TableHead className="text-right text-[0.625rem] font-black uppercase tracking-widest">Allowance</TableHead>
                                                <TableHead className="text-[0.625rem] font-black uppercase tracking-widest">Recorded By</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {revisions.map((revision, index) => {
                                                const delta = revisionDelta(revisions, index);
                                                return (
                                                    <TableRow key={`${revision.recordedAt}-${index}`}>
                                                        <TableCell className="font-mono text-xs">
                                                            {revision.effectiveFrom ? toNepaliDate(revision.effectiveFrom) : '—'}
                                                            {revision.note && (
                                                                <span className="ml-2 text-[0.625rem] uppercase text-muted-foreground">{revision.note}</span>
                                                            )}
                                                        </TableCell>
                                                        <TableCell className="text-xs font-bold uppercase">{revision.wageBasis}</TableCell>
                                                        <TableCell className="text-right">
                                                            <span className="flex items-center justify-end gap-2">
                                                                <span className="font-black text-xs">{money(revision.wageAmount)}</span>
                                                                {delta !== 0 && (
                                                                    <Badge
                                                                        variant="outline"
                                                                        className={delta > 0
                                                                            ? 'border-green-500/40 text-green-600'
                                                                            : 'border-destructive/40 text-destructive'}
                                                                    >
                                                                        {delta > 0
                                                                            ? <TrendingUp className="mr-1 h-3 w-3" />
                                                                            : <TrendingDown className="mr-1 h-3 w-3" />}
                                                                        {delta > 0 ? '+' : ''}{delta.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                                                    </Badge>
                                                                )}
                                                            </span>
                                                        </TableCell>
                                                        <TableCell className="text-right font-mono text-xs">{money(revision.allowance)}</TableCell>
                                                        <TableCell className="text-xs text-muted-foreground">{revision.recordedBy}</TableCell>
                                                    </TableRow>
                                                );
                                            })}
                                        </TableBody>
                                    </Table>
                                </div>
                            )}
                        </div>

                        <Separator />

                        <div>
                            <Label className="text-[0.625rem] font-black uppercase tracking-widest text-muted-foreground">
                                As paid in payroll
                            </Label>
                            {isLoading ? (
                                <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                                    <Loader2 className="h-4 w-4 animate-spin" /> Loading payroll history…
                                </div>
                            ) : payroll.length === 0 ? (
                                <p className="mt-2 text-sm text-muted-foreground">
                                    No payroll records found for this employee.
                                </p>
                            ) : (
                                <div className="mt-2 overflow-hidden rounded-lg border">
                                    <Table>
                                        <TableHeader className="bg-muted/30">
                                            <TableRow className="hover:bg-transparent">
                                                <TableHead className="text-[0.625rem] font-black uppercase tracking-widest">Period</TableHead>
                                                <TableHead className="text-[0.625rem] font-black uppercase tracking-widest">Basis Applied</TableHead>
                                                <TableHead className="text-right text-[0.625rem] font-black uppercase tracking-widest">Hourly Rate</TableHead>
                                                <TableHead className="text-right text-[0.625rem] font-black uppercase tracking-widest">Basic Pay</TableHead>
                                                <TableHead className="text-right text-[0.625rem] font-black uppercase tracking-widest">Gross</TableHead>
                                                <TableHead className="text-right text-[0.625rem] font-black uppercase tracking-widest">Net</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {payroll.map(record => (
                                                <TableRow key={record.id}>
                                                    <TableCell className="text-xs font-bold">
                                                        {monthName(record.bsMonth)} {record.bsYear}
                                                    </TableCell>
                                                    <TableCell className="text-xs">{record.base || '—'}</TableCell>
                                                    <TableCell className="text-right font-mono text-xs">
                                                        {(record.rate || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                                    </TableCell>
                                                    <TableCell className="text-right font-mono text-xs">{money(record.regularPay)}</TableCell>
                                                    <TableCell className="text-right font-mono text-xs">{money(record.totalPay)}</TableCell>
                                                    <TableCell className="text-right font-mono text-xs font-black">
                                                        {money(record.roundedNet ?? record.netPayment)}
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            )}
                        </div>
                    </div>
                </ScrollArea>
            </DialogContent>
        </Dialog>
    );
}
