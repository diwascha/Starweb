'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, Loader2, Users } from 'lucide-react';
import type { Employee } from '@/lib/types';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { cn, toNepaliDate } from '@/lib/utils';
import { suggestSurvivor } from '@/lib/employee-duplicates';
import {
    mergeEmployees,
    previewEmployeeMerge,
    type MergePreview,
} from '@/services/hr/employee-merge';

interface MergeEmployeesDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** The records under consideration - at least two. */
    candidates: Employee[];
    performedBy: string;
    onMerged?: () => void;
}

export function MergeEmployeesDialog({
    open,
    onOpenChange,
    candidates,
    performedBy,
    onMerged,
}: MergeEmployeesDialogProps) {
    const { toast } = useToast();
    const { user } = useAuth();
    const [survivorId, setSurvivorId] = useState<string>('');
    const [preview, setPreview] = useState<MergePreview | null>(null);
    const [isPreviewing, setIsPreviewing] = useState(false);
    const [isMerging, setIsMerging] = useState(false);

    const survivor = useMemo(
        () => candidates.find(c => c.id === survivorId) || null,
        [candidates, survivorId],
    );
    const duplicates = useMemo(
        () => candidates.filter(c => c.id !== survivorId),
        [candidates, survivorId],
    );

    // Default to the most complete record whenever the dialog is opened with
    // a new set of candidates.
    useEffect(() => {
        if (!open || candidates.length === 0) return;
        setSurvivorId(suggestSurvivor(candidates).id);
        setPreview(null);
    }, [open, candidates]);

    // The preview counts what would move, so the operator sees the blast
    // radius before committing to something irreversible.
    useEffect(() => {
        if (!open || !survivor || duplicates.length === 0) {
            setPreview(null);
            return;
        }
        let cancelled = false;
        setIsPreviewing(true);
        setPreview(null);
        previewEmployeeMerge(survivor, duplicates)
            .then(result => { if (!cancelled) setPreview(result); })
            .catch(() => {
                if (!cancelled) {
                    toast({
                        title: 'Could not read linked records',
                        description: 'The merge preview failed. Check your connection and try again.',
                        variant: 'destructive',
                    });
                }
            })
            .finally(() => { if (!cancelled) setIsPreviewing(false); });
        return () => { cancelled = true; };
    }, [open, survivor, duplicates, toast]);

    const handleMerge = async () => {
        if (!survivor || duplicates.length === 0) return;
        setIsMerging(true);
        try {
            const result = await mergeEmployees(survivor, duplicates, performedBy, { isAdmin: !!user?.isAdmin });
            toast({
                title: 'Records merged',
                description: `${result.moved} linked record(s) moved to ${survivor.name}. `
                    + `${result.duplicatesRemoved} duplicate record(s) removed`
                    + (result.conflicts > 0 ? `, ${result.conflicts} conflict(s) skipped.` : '.'),
            });
            onMerged?.();
            onOpenChange(false);
        } catch (error: any) {
            toast({
                title: 'Merge failed',
                description: error?.message || 'The records could not be merged.',
                variant: 'destructive',
            });
        } finally {
            setIsMerging(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-3xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Users className="h-5 w-5" /> Merge Duplicate Employees
                    </DialogTitle>
                    <DialogDescription>
                        Choose the record to keep. Attendance, payroll, bonus and behaviour
                        history from the other records is moved onto it, and the duplicates
                        are deleted. This cannot be undone.
                    </DialogDescription>
                </DialogHeader>

                <ScrollArea className="max-h-[55vh] pr-4">
                    <div className="space-y-4">
                        <div>
                            <Label className="text-[0.625rem] font-black uppercase tracking-widest text-muted-foreground">
                                Record to keep
                            </Label>
                            <RadioGroup value={survivorId} onValueChange={setSurvivorId} className="mt-2 space-y-2">
                                {candidates.map(candidate => (
                                    <label
                                        key={candidate.id}
                                        htmlFor={`survivor-${candidate.id}`}
                                        className={cn(
                                            'flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors',
                                            candidate.id === survivorId
                                                ? 'border-primary bg-primary/5'
                                                : 'border-border hover:bg-muted/40',
                                        )}
                                    >
                                        <RadioGroupItem value={candidate.id} id={`survivor-${candidate.id}`} className="mt-1" />
                                        <div className="min-w-0 flex-1">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className="font-black uppercase tracking-tight">{candidate.name}</span>
                                                {candidate.id === survivorId
                                                    ? <Badge className="bg-primary">Keeping</Badge>
                                                    : <Badge variant="outline" className="text-destructive border-destructive/30">Will be deleted</Badge>}
                                            </div>
                                            <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5 text-[0.6875rem] text-muted-foreground sm:grid-cols-3">
                                                <span>{candidate.department || '—'} / {candidate.position || '—'}</span>
                                                <span>{candidate.mobileNumber || 'No mobile'}</span>
                                                <span>{candidate.status || 'Working'}</span>
                                                <span>Rs. {(candidate.wageAmount || 0).toLocaleString('en-IN')} {candidate.wageBasis}</span>
                                                <span>Joined {candidate.joiningDate ? toNepaliDate(candidate.joiningDate) : '—'}</span>
                                                <span>{candidate.documentNumber || 'No ID on file'}</span>
                                            </div>
                                        </div>
                                    </label>
                                ))}
                            </RadioGroup>
                        </div>

                        <Separator />

                        <div>
                            <Label className="text-[0.625rem] font-black uppercase tracking-widest text-muted-foreground">
                                What will move
                            </Label>
                            {isPreviewing && (
                                <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                                    <Loader2 className="h-4 w-4 animate-spin" /> Checking linked records…
                                </div>
                            )}
                            {!isPreviewing && preview && preview.lines.length === 0 && (
                                <p className="mt-2 text-sm text-muted-foreground">
                                    No attendance, payroll or other linked records found for the
                                    duplicate record(s). Only the employee record itself will be removed.
                                </p>
                            )}
                            {!isPreviewing && preview && preview.lines.length > 0 && (
                                <div className="mt-2 overflow-hidden rounded-lg border">
                                    {preview.lines.map(line => (
                                        <div
                                            key={line.collection}
                                            className="flex items-center justify-between border-b px-3 py-2 text-sm last:border-b-0"
                                        >
                                            <span className="font-semibold">{line.label}</span>
                                            <span className="flex items-center gap-3">
                                                <span className="flex items-center gap-1.5 font-mono text-xs">
                                                    {line.moving} <ArrowRight className="h-3 w-3" /> {survivor?.name}
                                                </span>
                                                {line.conflicts > 0 && (
                                                    <Badge variant="outline" className="border-amber-500/40 text-amber-600">
                                                        {line.conflicts} conflict{line.conflicts > 1 ? 's' : ''}
                                                    </Badge>
                                                )}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                            {!isPreviewing && preview && preview.totalConflicts > 0 && (
                                <div className="mt-3 flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
                                    <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
                                    <p className="text-muted-foreground">
                                        <span className="font-bold text-foreground">
                                            {preview.totalConflicts} record(s) cannot be moved.
                                        </span>{' '}
                                        Both records already have data for the same period, so the kept
                                        record's own figures are left untouched and the duplicate's copy
                                        is discarded. Recalculate those months afterwards if the totals
                                        need to reflect the combined attendance.
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                </ScrollArea>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isMerging}>
                        Cancel
                    </Button>
                    <Button
                        onClick={handleMerge}
                        disabled={isMerging || isPreviewing || !survivor || duplicates.length === 0}
                        className="font-black uppercase tracking-widest"
                    >
                        {isMerging
                            ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Merging</>
                            : `Merge ${duplicates.length} record${duplicates.length === 1 ? '' : 's'}`}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
