'use client';

import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Printer, RotateCcw, Save } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { NepalChequeView } from './nepal-cheque-print';
import { CHEQUE_FIELD_LABELS, CHEQUE_LAYOUT_PRESETS, CHEQUE_LAYOUT_SETTING_KEY, LEGACY_LAYOUT, type ChequeFieldKey, type ChequeLayout } from '@/lib/cheque-layout';
import { setSetting } from '@/services/settings-service';

/**
 * Calibrating cheque printing.
 *
 * The only reliable way to line printing up with paper someone else printed
 * is to measure it. This prints a millimetre grid at the configured leaf size
 * onto ordinary paper: hold it against a real cheque, read how far each field
 * is out, type the correction, print again. Two passes is usually enough, and
 * every pass costs a sheet of A4 rather than a cheque leaf.
 */
export function ChequeCalibrationDialog({
    open,
    onOpenChange,
    layout,
    onSaved,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    layout: ChequeLayout;
    onSaved: (layout: ChequeLayout) => void;
}) {
    const { toast } = useToast();
    const [draft, setDraft] = useState<ChequeLayout>(layout);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => { if (open) setDraft(layout); }, [open, layout]);

    const setField = (key: ChequeFieldKey, prop: string, value: number) => {
        setDraft(d => ({
            ...d,
            fields: { ...d.fields, [key]: { ...(d.fields as any)[key], [prop]: value } },
        }));
    };

    const printSheet = () => {
        const win = window.open('', '', 'height=600,width=900');
        if (!win) {
            toast({ title: 'Popup blocked', description: 'Allow popups for this site, then print again.', variant: 'destructive' });
            return;
        }
        const host = document.getElementById('cheque-calibration-preview');
        if (!host) return;

        // Same shape as the real cheque print: the leaf's own @page size, no
        // margin, and inline styles only - there is no stylesheet here.
        win.document.write(
            `<!DOCTYPE html><html><head><meta charset="utf-8" /><title>Cheque calibration</title>` +
            `<style>` +
            `@page { size: ${draft.widthMm}mm ${draft.heightMm}mm; margin: 0; }` +
            `html, body { margin: 0; padding: 0; background: #fff; }` +
            `* { -webkit-print-color-adjust: exact; print-color-adjust: exact; }` +
            `</style></head><body>` +
            `<div style="width:${draft.widthMm}mm;height:${draft.heightMm}mm;position:relative;overflow:hidden;">${host.innerHTML}</div>` +
            `<scr` + `ipt>window.addEventListener('load',function(){setTimeout(function(){window.focus();window.print();window.close();},250);});</scr` + `ipt>` +
            `</body></html>`
        );
        win.document.close();
    };

    const save = async () => {
        setIsSaving(true);
        try {
            await setSetting(CHEQUE_LAYOUT_SETTING_KEY, draft);
            onSaved(draft);
            toast({ title: 'Cheque layout saved', description: 'New cheques will print with these positions.' });
            onOpenChange(false);
        } catch {
            toast({ title: 'Could not save', description: 'The cheque layout was not stored.', variant: 'destructive' });
        } finally {
            setIsSaving(false);
        }
    };

    const numberField = (label: string, value: number, onChange: (n: number) => void, step = 0.5) => (
        <div className="space-y-1">
            <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</Label>
            <Input
                type="number"
                step={step}
                value={value}
                onChange={e => onChange(parseFloat(e.target.value) || 0)}
                className="h-8 text-xs font-mono"
            />
        </div>
    );

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-5xl h-[92vh] flex flex-col p-0">
                <DialogHeader className="p-6 border-b">
                    <DialogTitle>Cheque print calibration</DialogTitle>
                    <DialogDescription>
                        Nepali bank cheques are not standardised, so these positions have to be measured against the book in your printer.
                        Print the grid on plain paper, hold it against a real leaf, and correct whatever is out. Nothing here touches a cheque until you are happy.
                    </DialogDescription>
                </DialogHeader>

                <ScrollArea className="flex-1">
                    <div className="p-6 space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                            <div className="md:col-span-2 space-y-1">
                                <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Starting layout</Label>
                                <Select
                                    value={draft.id}
                                    onValueChange={id => {
                                        const preset = CHEQUE_LAYOUT_PRESETS.find(p => p.id === id) || LEGACY_LAYOUT;
                                        setDraft(preset);
                                    }}
                                >
                                    <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        {CHEQUE_LAYOUT_PRESETS.map(p => (
                                            <SelectItem key={p.id} value={p.id} className="text-xs">{p.label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            {numberField('Leaf width (mm)', draft.widthMm, v => setDraft(d => ({ ...d, widthMm: v })), 1)}
                            {numberField('Leaf height (mm)', draft.heightMm, v => setDraft(d => ({ ...d, heightMm: v })), 1)}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {numberField('Whole-sheet nudge X (mm)', draft.offsetXMm, v => setDraft(d => ({ ...d, offsetXMm: v })))}
                            {numberField('Whole-sheet nudge Y (mm)', draft.offsetYMm, v => setDraft(d => ({ ...d, offsetYMm: v })))}
                        </div>
                        <p className="text-[11px] text-muted-foreground -mt-2">
                            Use the whole-sheet nudge when everything is out by the same amount — that is the printer, not the layout.
                        </p>

                        <div className="space-y-4">
                            {(Object.keys(CHEQUE_FIELD_LABELS) as ChequeFieldKey[]).map(key => {
                                const pos = (draft.fields as any)[key];
                                return (
                                    <div key={key} className="rounded-lg border p-4 space-y-3">
                                        <div className="text-[11px] font-black uppercase tracking-widest">{CHEQUE_FIELD_LABELS[key]}</div>
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                            {numberField('X (mm)', pos.xMm, v => setField(key, 'xMm', v))}
                                            {numberField('Y (mm)', pos.yMm, v => setField(key, 'yMm', v))}
                                            {numberField('Font (pt)', pos.fontPt ?? 10, v => setField(key, 'fontPt', v), 0.5)}
                                            {pos.widthMm !== undefined && numberField('Width (mm)', pos.widthMm, v => setField(key, 'widthMm', v), 1)}
                                            {key === 'date' && numberField('Box pitch (mm)', pos.boxPitchMm, v => setField(key, 'boxPitchMm', v), 0.1)}
                                            {key === 'amountWords' && numberField('Line height (mm)', pos.lineHeightMm, v => setField(key, 'lineHeightMm', v), 0.5)}
                                            {key === 'acPayee' && numberField('Angle (deg)', pos.rotateDeg, v => setField(key, 'rotateDeg', v), 1)}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        <div className="space-y-2">
                            <div className="text-[11px] font-black uppercase tracking-widest">Preview (actual size)</div>
                            <div className="overflow-auto border rounded-lg bg-neutral-100 p-4">
                                <div id="cheque-calibration-preview" className="bg-white shadow-lg inline-block">
                                    <NepalChequeView
                                        payeeName="SAMPLE PAYEE NAME PVT LTD"
                                        amount={123456.78}
                                        date={new Date().toISOString()}
                                        layout={draft}
                                        calibration
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </ScrollArea>

                <DialogFooter className="p-6 border-t bg-white">
                    <Button variant="outline" onClick={() => setDraft(LEGACY_LAYOUT)} className="mr-auto">
                        <RotateCcw className="mr-2 h-4 w-4" /> Reset
                    </Button>
                    <Button variant="outline" onClick={printSheet}>
                        <Printer className="mr-2 h-4 w-4" /> Print grid on plain paper
                    </Button>
                    <Button onClick={save} disabled={isSaving}>
                        <Save className="mr-2 h-4 w-4" /> Save layout
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
