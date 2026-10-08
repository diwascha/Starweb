'use client';

import { useState, useEffect, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Save, Loader2, ArrowLeft, Search, Check, CalendarIcon, Package, ShieldCheck, Edit } from 'lucide-react';
import type { Product, Report, ProductSpecification, TestResult } from '@/lib/types';
import { onProductsUpdate } from '@/services/product-service';
import { addReport, getReport, onReportsUpdate, updateReport, testParameterKeys, formatParameterLabel, TEST_PARAMETERS } from '@/services/report-service';
import { generateNextSerialNumber, reportFallbackPrefix, toNepaliDate } from '@/lib/utils';
import { reserveNumberFor } from '@/services/number-reservation-service';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandList, CommandItem } from '@/components/ui/command';
import { DualCalendar } from '@/components/ui/dual-calendar';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { Separator } from '@/components/ui/separator';
import { autoMark, moistureCorrect, moistureTarget, firstNumber, VISUAL_PARAMETERS, resolveTolerance, TOLERANCE_PARAMETERS, type QcMark } from '@/lib/qc-check';
import { onQcTolerancesUpdate, DEFAULT_TOLERANCE_ID, type QcToleranceDoc } from '@/services/qc-tolerance-service';

type Row = TestResult & { include: boolean };
type Kind = 'test' | 'coc';
const MARK_LABEL: Record<QcMark, string> = { Pass: 'OK', Low: 'Low', High: 'High' };

function ReportFormContent() {
    const { user, hasPermission } = useAuth();
    const { toast } = useToast();
    const router = useRouter();
    const editId = useSearchParams().get('id');

    const [products, setProducts] = useState<Product[]>([]);
    const [allReports, setAllReports] = useState<Report[]>([]);
    const [editing, setEditing] = useState<Report | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
    const [isProductPopoverOpen, setIsProductPopoverOpen] = useState(false);
    const [productSearch, setProductSearch] = useState('');

    const [formData, setFormData] = useState({
        serialNumber: '',
        taxInvoiceNumber: '',
        challanNumber: '',
        quantity: '',
        date: new Date(),
    });
    const [rows, setRows] = useState<Record<string, Row>>({});
    const [tolerances, setTolerances] = useState<QcToleranceDoc[]>([]);
    // Challan No usually equals Invoice No: it follows the invoice until typed in.
    const [challanEdited, setChallanEdited] = useState(false);
    const [kind, setKind] = useState<Kind>('test');
    const [targetMoisture, setTargetMoisture] = useState('');

    useEffect(() => {
        const unsubs = [
            onProductsUpdate(setProducts),
            onQcTolerancesUpdate(setTolerances),
            onReportsUpdate((data) => {
                setAllReports(data);
                setIsLoading(false);
            })
        ];
        return () => unsubs.forEach(u => u());
    }, []);

    // Edit mode: load the report once and fill the form from it.
    useEffect(() => {
        if (!editId) return;
        getReport(editId).then(r => {
            if (!r) { toast({ title: 'Report not found', variant: 'destructive' }); return; }
            setEditing(r);
            setChallanEdited(true);
            setKind(r.kind === 'coc' ? 'coc' : 'test');
            setSelectedProduct(r.product);
            setFormData({
                serialNumber: r.serialNumber,
                taxInvoiceNumber: r.taxInvoiceNumber === 'N/A' ? '' : r.taxInvoiceNumber || '',
                challanNumber: r.challanNumber === 'N/A' ? '' : r.challanNumber || '',
                quantity: r.quantity === 'N/A' ? '' : r.quantity || '',
                date: new Date(r.date),
            });
            const saved = (r.testData || {}) as Record<string, TestResult>;
            const next: Record<string, Row> = {};
            for (const k of new Set([...TEST_PARAMETERS, ...Object.keys(saved)])) {
                next[k] = { value: saved[k]?.value || '', remark: saved[k]?.remark || '', result: (saved[k]?.result as QcMark) || 'Pass', include: k in saved };
            }
            setRows(next);
            setTargetMoisture(String(moistureTarget(r.product?.specification?.moisture || '') ?? ''));
        });
    }, [editId, toast]);

    // Preview of the next number (new reports only); the real one is reserved on save.
    useEffect(() => {
        if (editId || isLoading) return;
        generateNextSerialNumber(allReports, formData.date.toISOString()).then(num => {
            setFormData(prev => ({ ...prev, serialNumber: num }));
        });
    }, [allReports, isLoading, formData.date, editId]);

    const handleProductSelect = (product: Product) => {
        setSelectedProduct(product);
        setIsProductPopoverOpen(false);
        // Each customer wants different parameters: start from what this
        // product's last report included, else every parameter it has a spec for.
        const last = allReports
            .filter(r => r.product?.id === product.id && r.id !== editId)
            .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))[0];
        const included = new Set(last ? Object.keys(last.testData || {}) : testParameterKeys(product.specification));
        const next: Record<string, Row> = {};
        for (const k of TEST_PARAMETERS) {
            // Ply / stapling / printing are visual checks against the spec,
            // so they start filled in; measured values start empty.
            const spec = String(product.specification?.[k] ?? '');
            const visual = VISUAL_PARAMETERS.has(k) && spec;
            next[k] = { value: visual ? spec : '', remark: '', result: 'Pass', include: included.has(k) };
        }
        setRows(next);
        // The usual dispatch quantity for this product, as a starting point.
        if (last?.quantity && last.quantity !== 'N/A') setFormData(prev => (prev.quantity ? prev : { ...prev, quantity: last.quantity }));
        setTargetMoisture(String(moistureTarget(product.specification?.moisture || '') ?? ''));
    };

    const setRow = (key: string, patch: Partial<Row>) =>
        setRows(prev => ({ ...prev, [key]: { ...prev[key], ...patch } }));

    const specOf = (key: string) => String(selectedProduct?.specification?.[key as keyof ProductSpecification] ?? '');

    // Typing a reading sets OK / Low / High from the spec; the buttons still override.
    // This customer's tolerance for a parameter (falls back to the Default row).
    const toleranceFor = (key: string) => {
        const customer = tolerances.find(t => t.id === selectedProduct?.partyId)?.values;
        const fallback = tolerances.find(t => t.id === DEFAULT_TOLERANCE_ID)?.values;
        return resolveTolerance(key, customer, fallback);
    };
    const toleranceLabel = (key: string) => {
        const p = TOLERANCE_PARAMETERS.find(x => x.key === key);
        if (!p) return '';
        const t = toleranceFor(key);
        return t.value == null ? 'not checked' : `±${t.value}${p.unit === '%' ? '%' : ' mm'}${t.source === 'customer' ? '' : ' (default)'}`;
    };

    const setReading = (key: string, value: string) => {
        const mark = autoMark(key, specOf(key), value, toleranceFor(key).value);
        setRow(key, mark ? { value, result: mark } : { value });
    };

    // Ply, stapling and printing are checked by eye: one click records "as spec".
    const fillVisualFromSpec = () => setRows(prev => {
        const next = { ...prev };
        for (const k of VISUAL_PARAMETERS) {
            if (next[k]?.include && specOf(k)) next[k] = { ...next[k], value: specOf(k), result: 'Pass' };
        }
        return next;
    });

    // GSM and box weight converted from the measured moisture to the target, noted in Remarks.
    const applyMoistureCorrection = () => {
        const measured = firstNumber(rows.moisture?.value || '');
        const target = firstNumber(targetMoisture);
        if (measured == null || target == null) {
            toast({ title: 'Enter the measured moisture and a target first', variant: 'destructive' });
            return;
        }
        const updated: string[] = [];
        const next = { ...rows };
        for (const k of ['gsm', 'weightOfBox']) {
            const raw = next[k]?.value || '';
            const v = firstNumber(raw);
            if (!next[k]?.include || v == null) continue;
            const corrected = moistureCorrect(v, measured, target);
            if (corrected == null) continue;
            // Keep the reading's precision: 502 -> 480, but 0.45 kg -> 0.43, not 0.
            const decimals = Math.max((raw.match(/\d+\.(\d+)/)?.[1] || '').length, v < 10 ? 2 : 0);
            const note = `${corrected.toFixed(decimals)} @ ${target}% moisture`;
            const others = (next[k].remark || '').split(';').map(x => x.trim()).filter(x => x && !/@ [\d.]+% moisture$/.test(x));
            next[k] = { ...next[k], remark: [note, ...others].join('; ') };
            updated.push(`${formatParameterLabel(k)} ${note}`);
        }
        if (!updated.length) {
            toast({ title: 'Nothing to correct', description: 'Enter the measured GSM and/or Weight of Box (and keep them ticked) first.', variant: 'destructive' });
            return;
        }
        setRows(next);
        toast({ title: 'Added to Remarks', description: updated.join(' · ') });
    };

    const includedCount = Object.values(rows).filter(r => r.include).length;
    const canSave = editId ? hasPermission('reports', 'edit') : hasPermission('reports', 'create');

    const handleSubmit = async () => {
        if (!user || !selectedProduct || !canSave) return;
        if (!includedCount) { toast({ title: 'Choose at least one parameter', variant: 'destructive' }); return; }
        if (kind === 'test') {
            const missing = Object.entries(rows).filter(([, r]) => r.include && !r.value.trim()).map(([k]) => formatParameterLabel(k));
            if (missing.length) {
                toast({ title: 'Enter the test results', description: `No reading for: ${missing.join(', ')}. Untick a parameter to leave it off, or issue a Certificate of Conformance instead.`, variant: 'destructive' });
                return;
            }
        }
        setIsSaving(true);
        try {
            const testData: Record<string, TestResult> = {};
            for (const [k, r] of Object.entries(rows)) {
                if (!r.include) continue;
                testData[k] = kind === 'coc'
                    ? { value: '' }
                    : { value: r.value.trim(), remark: (r.remark || '').trim(), result: (r.result as QcMark) || 'Pass' };
            }
            const common = {
                taxInvoiceNumber: formData.taxInvoiceNumber.trim() || 'N/A',
                challanNumber: formData.challanNumber.trim() || 'N/A',
                quantity: formData.quantity.trim() || 'N/A',
                product: selectedProduct,
                kind,
                date: formData.date.toISOString(),
                testData: testData as any,
            };
            if (editing) {
                await updateReport(editing.id, { ...common, lastModifiedBy: user.username });
                toast({ title: 'Report Updated', description: `Report #${editing.serialNumber} saved.` });
                router.push(`/report/view/?id=${editing.id}`);
            } else {
                const serialNumber = await reserveNumberFor(
                    'report', reportFallbackPrefix(common.date), allReports.map(r => r.serialNumber), common.date,
                );
                const reportId = await addReport({
                    ...common,
                    serialNumber,
                    createdAt: new Date().toISOString(),
                    createdBy: user.username,
                    ownership: selectedProduct.ownership || 'Both',
                });
                toast({ title: kind === 'coc' ? 'Certificate Created' : 'Report Created', description: `#${serialNumber} saved.` });
                router.push(`/report/view/?id=${reportId}`);
            }
        } catch {
            toast({ title: 'Error', description: 'The report could not be saved.', variant: 'destructive' });
        } finally {
            setIsSaving(false);
        }
    };

    const paramKeys = useMemo(() => Object.keys(rows), [rows]);

    if (isLoading || (editId && !editing)) return <div className="p-12 text-center flex flex-col items-center justify-center h-[70vh] gap-4"><Loader2 className="animate-spin h-8 w-8 text-primary"/><p>Loading...</p></div>;

    return (
        <div className="max-w-5xl mx-auto space-y-8 pb-20">
            <header className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={() => router.back()} className="h-10 w-10 border shadow-sm"><ArrowLeft className="h-5 w-5" /></Button>
                    <div>
                        <h1 className="text-3xl font-black tracking-tight text-foreground uppercase">{editing ? `Edit #${editing.serialNumber}` : 'New QT Document'}</h1>
                        <p className="text-muted-foreground text-sm font-medium italic">Tick the parameters this customer needs on the document.</p>
                    </div>
                </div>
                <div className="flex rounded-lg border overflow-hidden" role="radiogroup" aria-label="Document type">
                    {([['test', 'Quality Test Report'], ['coc', 'Certificate of Conformance']] as const).map(([k, label]) => (
                        <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)}
                            className={cn('px-4 h-10 text-xs font-bold', kind === k ? 'bg-primary text-primary-foreground' : 'bg-card hover:bg-muted')}>
                            {label}
                        </button>
                    ))}
                </div>
            </header>
            <p className="text-xs text-muted-foreground -mt-4">
                {kind === 'test'
                    ? 'Quality Test Report: type in the readings you measured. OK / Low / High is set from the specification as you type.'
                    : 'Certificate of Conformance: states the goods are made to the specification. No test results are printed.'}
            </p>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-8">
                    <Card className="shadow-sm border-border overflow-hidden">
                        <CardHeader className="bg-muted/10 border-b py-4 px-6">
                            <CardTitle className="text-sm font-black uppercase text-foreground flex items-center gap-2">
                                <Package className="h-4 w-4 text-primary"/>
                                Name of Item
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-6">
                            <Popover open={isProductPopoverOpen} onOpenChange={setIsProductPopoverOpen}>
                                <PopoverTrigger asChild>
                                    <Button variant="outline" role="combobox" className="w-full justify-between h-11 text-base font-bold bg-card">
                                        {selectedProduct ? selectedProduct.name : "Select or type product name..."}
                                        <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="p-0 w-[--radix-popover-trigger-width]">
                                    <Command>
                                        <CommandInput placeholder="Search products..." value={productSearch} onValueChange={setProductSearch} />
                                        <CommandList>
                                            <CommandEmpty>No products found.</CommandEmpty>
                                            <CommandGroup>
                                                {products.map(p => (
                                                    <CommandItem key={p.id} value={`${p.name} ${p.partyName || ''} ${p.materialCode || ''}`} onSelect={() => handleProductSelect(p)} className="h-11">
                                                        <Check className={cn("mr-2 h-4 w-4", selectedProduct?.id === p.id ? "opacity-100" : "opacity-0")} />
                                                        <div className="flex flex-col">
                                                            <span className="font-bold uppercase text-xs">{p.name}</span>
                                                            <span className="text-[0.625rem] text-muted-foreground uppercase">{p.materialCode} &bull; {p.partyName}</span>
                                                        </div>
                                                    </CommandItem>
                                                ))}
                                            </CommandGroup>
                                        </CommandList>
                                    </Command>
                                </PopoverContent>
                            </Popover>
                            {selectedProduct && <p className="text-xs text-muted-foreground mt-2">Deliver To: <span className="font-bold text-foreground">{selectedProduct.partyName || '-'}</span></p>}
                        </CardContent>
                    </Card>

                    {selectedProduct && (
                        <Card className="shadow-sm border-border overflow-hidden">
                            <CardHeader className="bg-muted/10 border-b py-4 px-6">
                                <CardTitle className="text-sm font-black uppercase text-foreground flex items-center gap-2">
                                    <Edit className="h-4 w-4 text-primary"/>
                                    {kind === 'test' ? 'Test Results' : 'Specification'} <span className="text-muted-foreground font-medium normal-case">({includedCount} on document)</span>
                                </CardTitle>
                            </CardHeader>
                            {kind === 'test' && (
                                <div className="flex flex-wrap items-end gap-3 px-6 py-3 border-b bg-muted/5">
                                    <Button type="button" variant="outline" size="sm" onClick={fillVisualFromSpec} className="h-9 text-xs">
                                        Ply / Stapling / Printing as spec
                                    </Button>
                                    <div className="flex items-end gap-2 ml-auto">
                                        <div className="space-y-1">
                                            <Label className="text-[0.625rem] font-black uppercase text-muted-foreground">Target moisture %</Label>
                                            <Input value={targetMoisture} onChange={e => setTargetMoisture(e.target.value)} inputMode="decimal" className="h-9 w-24" />
                                        </div>
                                        <Button type="button" variant="outline" size="sm" onClick={applyMoistureCorrection} className="h-9 text-xs">
                                            Calculate GSM / weight at target
                                        </Button>
                                    </div>
                                </div>
                            )}
                            <CardContent className="p-0 overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="bg-muted/30 text-[0.625rem] uppercase tracking-wider text-muted-foreground">
                                        <tr>
                                            <th className="p-2 w-10 text-center">Show</th>
                                            <th className="p-2 text-left">Particular</th>
                                            <th className="p-2 text-left">Specification</th>
                                            {kind === 'test' && <>
                                                <th className="p-2 text-left">Result (measured)</th>
                                                <th className="p-2 text-left">OK / Low / High</th>
                                                <th className="p-2 text-left">Remarks</th>
                                            </>}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {paramKeys.map(key => {
                                            const r = rows[key];
                                            const spec = specOf(key);
                                            const bad = kind === 'test' && r.include && (r.result === 'Low' || r.result === 'High');
                                            return (
                                                <tr key={key} className={cn('border-t', !r.include && 'opacity-40', bad && 'bg-red-50 dark:bg-red-950/30')}>
                                                    <td className="p-2 text-center"><Checkbox checked={r.include} onCheckedChange={v => setRow(key, { include: !!v })} aria-label={`Show ${formatParameterLabel(key)} on document`} /></td>
                                                    <td className="p-2 font-bold whitespace-nowrap">{formatParameterLabel(key)}</td>
                                                    <td className="p-2 text-muted-foreground whitespace-nowrap">
                                                        {spec || '-'}
                                                        {kind === 'test' && toleranceLabel(key) && <span className="block text-[0.5625rem]">{toleranceLabel(key)}</span>}
                                                    </td>
                                                    {kind === 'test' && <>
                                                        <td className="p-2 min-w-[7rem]"><Input value={r.value} disabled={!r.include} onChange={e => setReading(key, e.target.value)}
                                                            data-result-input inputMode={VISUAL_PARAMETERS.has(key) || key === 'dimension' ? 'text' : 'decimal'}
                                                            onKeyDown={e => {
                                                                if (e.key !== 'Enter') return;
                                                                e.preventDefault();
                                                                // Enter moves to the next reading, so a column of numbers is typed without the mouse.
                                                                const all = Array.from(document.querySelectorAll<HTMLInputElement>('input[data-result-input]:not(:disabled)'));
                                                                all[all.indexOf(e.currentTarget) + 1]?.focus();
                                                            }}
                                                            className="h-9 font-bold" /></td>
                                                        <td className="p-2">
                                                            <div className="flex rounded-md border overflow-hidden w-fit">
                                                                {(['Pass', 'Low', 'High'] as const).map(v => (
                                                                    <button key={v} type="button" disabled={!r.include} onClick={() => setRow(key, { result: v })}
                                                                        className={cn('px-2.5 h-9 text-xs font-bold', r.result === v ? (v === 'Pass' ? 'bg-primary text-primary-foreground' : 'bg-red-600 text-white') : 'bg-card')}>
                                                                        {MARK_LABEL[v]}
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        </td>
                                                        <td className="p-2 min-w-[8rem]"><Input value={r.remark || ''} disabled={!r.include} onChange={e => setRow(key, { remark: e.target.value })} className="h-9" /></td>
                                                    </>}
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </CardContent>
                        </Card>
                    )}
                </div>

                <div className="lg:col-span-1 space-y-8">
                    <Card className="shadow-sm border-border bg-card">
                        <CardHeader className="py-4 border-b bg-muted/5">
                            <CardTitle className="text-xs uppercase font-black tracking-widest text-muted-foreground">Document</CardTitle>
                        </CardHeader>
                        <CardContent className="p-6 space-y-6">
                            <div className="space-y-1.5">
                                <Label className="text-[0.625rem] font-black uppercase text-muted-foreground px-1">Report No</Label>
                                <Input value={formData.serialNumber} readOnly className="bg-muted/50 font-mono text-sm h-10 border-2" />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-[0.625rem] font-black uppercase text-muted-foreground px-1">Date</Label>
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <Button variant="outline" className="w-full justify-start h-10 font-bold text-xs border-2 bg-card">
                                            <CalendarIcon className="mr-2 h-4 w-4 text-primary" />
                                            {toNepaliDate(formData.date.toISOString())} BS ({format(formData.date, "PP")})
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0" align="start">
                                        <DualCalendar selected={formData.date} onSelect={d => d && setFormData(prev => ({ ...prev, date: d }))} />
                                    </PopoverContent>
                                </Popover>
                            </div>
                            <Separator />
                            <div className="space-y-1.5">
                                <Label className="text-[0.625rem] font-black uppercase text-muted-foreground px-1">Invoice No</Label>
                                <Input value={formData.taxInvoiceNumber} onChange={e => { const v = e.target.value; setFormData(p => ({ ...p, taxInvoiceNumber: v, challanNumber: challanEdited ? p.challanNumber : v })); }} className="h-10" />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-[0.625rem] font-black uppercase text-muted-foreground px-1">Challan No</Label>
                                <Input value={formData.challanNumber} onChange={e => { setChallanEdited(true); setFormData(p => ({...p, challanNumber: e.target.value})); }} className="h-10" />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-[0.625rem] font-black uppercase text-muted-foreground px-1">Supplied Quantity</Label>
                                <Input value={formData.quantity} onChange={e => setFormData(p => ({...p, quantity: e.target.value}))} onBlur={() => setFormData(p => (/^\d[\d,]*$/.test(p.quantity.trim()) ? { ...p, quantity: `${p.quantity.trim()} Pcs` } : p))} placeholder="e.g. 15000 Pcs" className="h-10 font-bold" />
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="shadow-sm border-border">
                        <CardContent className="p-6">
                            <Button
                                onClick={handleSubmit}
                                disabled={isSaving || !selectedProduct || !canSave}
                                className="w-full h-12 font-black text-xs uppercase tracking-[0.2em]"
                            >
                                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : editing ? <Save className="mr-2 h-4 w-4"/> : <ShieldCheck className="mr-2 h-4 w-4"/>}
                                {editing ? 'Save Changes' : kind === 'coc' ? 'Save Certificate' : 'Save Report'}
                            </Button>
                            {!canSave && <p className="text-xs text-muted-foreground mt-2 text-center">You don&apos;t have permission to {editing ? 'edit' : 'create'} QT documents.</p>}
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}

export default function NewReportPage() {
    return (
        <Suspense fallback={<div className="p-12 flex justify-center"><Loader2 className="animate-spin h-8 w-8 text-primary"/></div>}>
            <ReportFormContent />
        </Suspense>
    );
}
