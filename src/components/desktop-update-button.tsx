'use client';
/**
 * "Check for updates" in the sidebar footer - desktop app only (hidden in the
 * browser, which is always current). Nothing checks automatically: the user
 * clicks, the app asks GitHub Releases for latest.json, and if a newer signed
 * version exists it offers to install it. See docs/DESKTOP_RELEASES.md.
 */
import { useState } from 'react';
import { RefreshCw, Loader2 } from 'lucide-react';
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
    AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

// Tauri v1 exposes its API on window.__TAURI__ (withGlobalTauri in tauri.conf.json).
type TauriGlobal = {
    app: { getVersion: () => Promise<string> };
    updater: {
        checkUpdate: () => Promise<{ shouldUpdate: boolean; manifest?: { version: string; body?: string; date?: string } }>;
        installUpdate: () => Promise<void>;
    };
    process: { relaunch: () => Promise<void> };
};
const tauri = (): TauriGlobal | null =>
    typeof window !== 'undefined' ? ((window as any).__TAURI__ as TauriGlobal | undefined) ?? null : null;

export function DesktopUpdateButton({ className }: { className?: string }) {
    const { toast } = useToast();
    const [checking, setChecking] = useState(false);
    const [installing, setInstalling] = useState(false);
    const [offer, setOffer] = useState<{ current: string; next: string; notes?: string } | null>(null);

    if (!tauri()) return null;

    const check = async () => {
        const t = tauri();
        if (!t) return;
        setChecking(true);
        try {
            const [current, result] = await Promise.all([t.app.getVersion(), t.updater.checkUpdate()]);
            if (result.shouldUpdate && result.manifest) {
                setOffer({ current, next: result.manifest.version, notes: result.manifest.body });
            } else {
                toast({ title: 'You are up to date', description: `StarSutra ${current} is the latest version.` });
            }
        } catch (e: any) {
            toast({ title: 'Could not check for updates', description: String(e?.message || e || 'Check the internet connection and try again.'), variant: 'destructive' });
        } finally {
            setChecking(false);
        }
    };

    const install = async () => {
        const t = tauri();
        if (!t) return;
        setInstalling(true);
        try {
            // Downloads, verifies the signature, and runs the installer; on
            // Windows the app closes while it installs.
            await t.updater.installUpdate();
            await t.process.relaunch();
        } catch (e: any) {
            toast({ title: 'Update failed', description: String(e?.message || e), variant: 'destructive' });
            setInstalling(false);
        }
    };

    return (
        <>
            <Button
                variant="ghost"
                size="icon"
                className={cn('h-8 w-8 text-muted-foreground hover:text-primary transition-colors', className)}
                onClick={check}
                disabled={checking || installing}
                title="Check for updates"
                aria-label="Check for updates"
            >
                {checking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            </Button>
            <AlertDialog open={!!offer} onOpenChange={(open) => { if (!open && !installing) setOffer(null); }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Update available: version {offer?.next}</AlertDialogTitle>
                        <AlertDialogDescription>
                            You have version {offer?.current}. Installing takes about a minute; the app closes and reopens by itself.
                            Save any open work first.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    {offer?.notes && <p className="text-sm whitespace-pre-wrap rounded-md border p-3 max-h-48 overflow-auto">{offer.notes}</p>}
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={installing}>Later</AlertDialogCancel>
                        <AlertDialogAction onClick={(e) => { e.preventDefault(); void install(); }} disabled={installing}>
                            {installing ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Installing...</> : 'Install update'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
