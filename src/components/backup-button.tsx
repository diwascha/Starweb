'use client';
/**
 * Small backup icon in the sidebar footer (administrators only). Asks first,
 * because a backup reads every record once - about 3,300 reads today, out of
 * the free plan's 50,000 per day.
 */
import { useState } from 'react';
import { DatabaseBackup, Loader2 } from 'lucide-react';
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
    AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { downloadBackup } from '@/lib/backup-download';
import { cn } from '@/lib/utils';

export function BackupButton({ className }: { className?: string }) {
    const { user } = useAuth();
    const { toast } = useToast();
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState(false);

    if (!user?.isAdmin) return null;

    const run = async () => {
        setBusy(true);
        try {
            const result = await downloadBackup(user.id);
            if (result.skipped.length > 0) {
                toast({
                    title: 'Backup incomplete',
                    description: `Saved ${result.records.toLocaleString('en-IN')} records, but could not read: ${result.skipped.map(s => s.collection).join(', ')}.`,
                    variant: 'destructive',
                });
            } else {
                toast({ title: 'Backup downloaded', description: `${result.records.toLocaleString('en-IN')} records saved to your Downloads folder.` });
            }
        } catch {
            toast({ title: 'Backup failed', description: 'Check the connection and try again.', variant: 'destructive' });
        } finally {
            setBusy(false);
            setOpen(false);
        }
    };

    return (
        <>
            <Button
                variant="ghost"
                size="icon"
                className={cn('h-8 w-8 text-muted-foreground hover:text-primary transition-colors', className)}
                onClick={() => setOpen(true)}
                disabled={busy}
                title="Download backup"
                aria-label="Download backup"
            >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <DatabaseBackup className="h-3.5 w-3.5" />}
            </Button>
            <AlertDialog open={open} onOpenChange={(v) => { if (!busy) setOpen(v); }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Download a backup?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This saves a copy of all business data to your Downloads folder. It reads every record once
                            (about 3,300 reads today, out of the free 50,000 per day), so once a week is enough.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
                        <AlertDialogAction disabled={busy} onClick={(e) => { e.preventDefault(); run(); }}>
                            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Download
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
