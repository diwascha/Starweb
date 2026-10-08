'use client';

import { useState, useEffect, useMemo } from 'react';
import type { Product, Party, AccountOwnership } from '@/lib/types';
import { onPartiesUpdate, addParty } from '@/services/party-service';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { normalizeBF } from '@/lib/utils';
import { calculateItemCost } from '@/lib/cost-calculator';
import { PLY_OPTIONS, BF_OPTIONS } from '@/lib/constants';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { PlusCircle, Calculator } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { onProductsUpdate } from '@/services/product-service';
import { MOISTURE_CLASSES, moistureClassOf, specAtMoisture, suggestFromSimilar, COPYABLE_FROM_SIMILAR, type MoistureClass } from '@/lib/qc-spec';

interface ProductFormProps {
    productToEdit?: Product | null;
    onSaveSuccess: (data: any) => void;
    initialName?: string;
    /** Require the per-product QT parameters (moisture, GSM, weight, load).
     *  On for the PackSpec catalog; off for quick-adding from a quotation. */
    requireQtFields?: boolean;
}

// Differ per product: must be entered before the product can be saved.
const REQUIRED_QT_FIELDS: [string, string][] = [['moisture', 'Moisture'], ['gsm', 'GSM'], ['weightOfBox', 'Weight of Box'], ['load', 'Load']];

export function ProductForm({ productToEdit, onSaveSuccess, initialName, requireQtFields = false }: ProductFormProps) {
    const [form, setForm] = useState<any>({ 
        name: initialName || '', materialCode: '', partyId: '', 
        specification: { 
            ply: '3', wastagePercent: '3.5', boxType: 'RSC', paperType: 'KRAFT', paperBf: '18 BF', 
            topGsm: '120', flute1Gsm: '100', middleGsm: '', flute2Gsm: '', liner2Gsm: '', flute3Gsm: '', liner3Gsm: '', flute4Gsm: '', bottomGsm: '120', dimension: '',
            weightOfBox: '', moisture: '', load: '', printing: '', gsm: '',
            stapleWidth: '', stapling: '', overlapWidth: ''
        } 
    });
    const [dim, setDim] = useState({ l: '', b: '', h: '' });
    const [parties, setParties] = useState<Party[]>([]);
    const [isPartyDialogOpen, setIsPartyDialogOpen] = useState(false);
    const [partyForm, setPartyForm] = useState<{name: string, ownership: AccountOwnership, address?: string}>({name: '', ownership: 'Shivam', address: ''});
    const { toast } = useToast();
    const { user } = useAuth();

    useEffect(() => { onPartiesUpdate(setParties); }, []);
    
    useEffect(() => {
        if (productToEdit) {
            // Stored as "278x178x85", but older entries use "*" or "×".
            const [l = '', b = '', h = ''] = (productToEdit.specification?.dimension || '').split(/\s*[x×*X]\s*/);
            setDim({ l, b, h });
            setForm({
                ...productToEdit,
                specification: {
                    ...form.specification,
                    ...productToEdit.specification,
                }
            });
        }
    }, [productToEdit]);

    const filteredParties = useMemo(() => {
        return parties
            .filter(p => p.ownership === 'Shivam' || p.ownership === 'Both')
            .sort((a, b) => a.name.localeCompare(b.name));
    }, [parties]);

    const handleSave = () => {
        if (!form.name || !form.partyId) { 
            toast({ title: 'Validation Error', description: 'Name and Party are required.', variant: 'destructive' }); 
            return; 
        }
        const missing = !requireQtFields ? [] : REQUIRED_QT_FIELDS.filter(([k]) => !String(form.specification[k] ?? '').trim()).map(([, label]) => label);
        if (missing.length) {
            toast({ title: 'Fill in the test parameters', description: `Required for test reports: ${missing.join(', ')}.`, variant: 'destructive' });
            return;
        }
        const p = parties.find(x => x.id === form.partyId);
        onSaveSuccess({ 
            ...form, 
            partyName: p?.name, 
            partyAddress: p?.address, 
            // Keep the stored dimension if the L/B/H boxes were left empty.
            specification: { ...form.specification, dimension: (dim.l || dim.b || dim.h) ? `${dim.l}x${dim.b}x${dim.h}` : (form.specification.dimension || '') } 
        });
    };

    const handleQuickAddParty = async () => {
        if (!user) return;
        if (!partyForm.name || !partyForm.ownership) {
            toast({ title: 'Error', description: 'Name and Ownership are mandatory.' });
            return;
        }
        try {
            const newId = await addParty({ 
                name: partyForm.name, 
                type: 'Customer', 
                ownership: partyForm.ownership,
                address: partyForm.address || '',
                createdBy: user.username
            });
            setForm({ ...form, partyId: newId });
            setIsPartyDialogOpen(false);
            toast({ title: 'Success', description: 'Party added.' });
        } catch {
            toast({ title: 'Error', description: 'Failed to add party.' });
        }
    };

    const updateSpec = (f: string, v: string) => setForm((p: any) => ({ ...p, specification: { ...p.specification, [f]: v } }));

    // Staple width / stapling / overlap come from the most similar box in the
    // catalog (same ply, closest size) and fill only fields left blank.
    const [catalog, setCatalog] = useState<Product[]>([]);
    useEffect(() => onProductsUpdate(setCatalog), []);
    const dimensionText = `${dim.l}x${dim.b}x${dim.h}`;
    const suggestions = useMemo(
        () => suggestFromSimilar({ ...form.specification, dimension: dimensionText }, catalog, productToEdit?.id),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [catalog, form.specification.ply, dimensionText, productToEdit?.id]
    );
    const [suggestedFrom, setSuggestedFrom] = useState<Record<string, string>>({});
    useEffect(() => {
        const fill: Record<string, string> = {};
        const from: Record<string, string> = {};
        for (const k of COPYABLE_FROM_SIMILAR) {
            const sug = suggestions[k];
            const current = String(form.specification[k] ?? '').trim();
            // Fill blanks, and keep following the best match while the value is still our suggestion.
            if (sug && (!current || (suggestedFrom[k] && current !== sug.value))) { fill[k] = sug.value; from[k] = sug.from; }
        }
        if (Object.keys(fill).length) {
            setForm((p: any) => ({ ...p, specification: { ...p.specification, ...fill } }));
            setSuggestedFrom(prev => ({ ...prev, ...from }));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [suggestions]);
    const editSpecManually = (k: string, v: string) => {
        setSuggestedFrom(prev => { const n = { ...prev }; delete n[k]; return n; });
        updateSpec(k, v);
    };

    // Moisture class -> moisture range, and the GSM / weight / load expected at it.
    const moistureClass = moistureClassOf(form.specification.moisture);
    const handleCalculateAtMoisture = (cls: MoistureClass | null = moistureClass) => {
        if (!cls) { toast({ title: 'Choose a moisture level first', variant: 'destructive' }); return; }
        const res = specAtMoisture({ ...form.specification, l: dim.l, b: dim.b, h: dim.h }, cls);
        if (!res) {
            toast({ title: 'Missing inputs', description: 'Fill in dimensions and GSM composition first.', variant: 'destructive' });
            return;
        }
        setForm((p: any) => ({
            ...p,
            specification: {
                ...p.specification,
                moisture: MOISTURE_CLASSES[cls].range,
                gsm: String(res.gsm),
                weightOfBox: String(res.weightOfBox),
                ...(res.load != null ? { load: `${res.load} Kg-F` } : {}),
            },
        }));
        toast({ title: `Calculated at ${MOISTURE_CLASSES[cls].label} moisture (${MOISTURE_CLASSES[cls].range}%)`, description: `GSM ${res.gsm} · Weight ${res.weightOfBox} g${res.load != null ? ` · Load ${res.load} Kg-F` : ''}` });
    };

    const pValue = parseInt(form.specification.ply, 10);

    // Derives box weight from dimensions + GSM composition using the same
    // formula the Quotation Engine uses, so a user doesn't have to weigh a
    // sample box or do the math by hand just to fill in this field.
    const handleCalculateWeight = () => {
        const calc = calculateItemCost(
            { ...form.specification, l: dim.l, b: dim.b, h: dim.h, noOfPcs: '1' },
            {}, 0, 0, 0, 'Per Consignment'
        );
        if (!calc.paperWeight) {
            toast({ title: 'Missing inputs', description: 'Fill in dimensions and GSM composition first.', variant: 'destructive' });
            return;
        }
        updateSpec('weightOfBox', String(Math.round(calc.paperWeight)));
    };

    return (
        <div className="space-y-6 pt-2 pb-8 overflow-y-auto max-h-[75vh]">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                    <h3 className="text-xs font-bold uppercase border-b pb-1 text-muted-foreground">General Info</h3>
                    <div className="space-y-2"><Label>Product Name</Label><Input value={form.name ?? ''} onChange={e => setForm({...form, name: e.target.value})} /></div>
                    <div className="space-y-2"><Label>Material Code</Label><Input value={form.materialCode ?? ''} onChange={e => setForm({...form, materialCode: e.target.value})} placeholder="e.g. BX-1042" /></div>
                    <div className="space-y-2">
                        <Label>Party (Customer)</Label>
                        <div className="flex gap-2">
                            <Select value={form.partyId ?? ''} onValueChange={v => setForm({...form, partyId: v})}>
                                <SelectTrigger><SelectValue placeholder="Select party..." /></SelectTrigger>
                                <SelectContent>{filteredParties.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                            </Select>
                            <Button variant="outline" size="icon" onClick={() => setIsPartyDialogOpen(true)}><PlusCircle className="h-4 w-4"/></Button>
                        </div>
                    </div>
                </div>
                <div className="space-y-4">
                    <h3 className="text-xs font-bold uppercase border-b pb-1 text-muted-foreground">Dimensions (mm)</h3>
                    <div className="grid grid-cols-3 gap-2">
                        <div><Label className="text-[0.625rem]">L</Label><Input type="number" value={dim.l ?? ''} onChange={e => setDim({...dim, l: e.target.value})} /></div>
                        <div><Label className="text-[0.625rem]">B</Label><Input type="number" value={dim.b ?? ''} onChange={e => setDim({...dim, b: e.target.value})} /></div>
                        <div><Label className="text-[0.625rem]">H</Label><Input type="number" value={dim.h ?? ''} onChange={e => setDim({...dim, h: e.target.value})} /></div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 mt-2">
                        <div>
                            <Label className="text-[0.625rem]">Weight (g){requireQtFields ? ' *' : ''}</Label>
                            <div className="flex gap-1">
                                <Input value={form.specification.weightOfBox ?? ''} onChange={e => updateSpec('weightOfBox', e.target.value)} />
                                <Button type="button" variant="outline" size="icon" className="shrink-0" title="Calculate from dimensions & GSM" onClick={handleCalculateWeight}><Calculator className="h-4 w-4" /></Button>
                            </div>
                        </div>
                        <div><Label className="text-[0.625rem]">Load (KGF){requireQtFields ? ' *' : ''}</Label><Input value={form.specification.load ?? ''} onChange={e => updateSpec('load', e.target.value)} /></div>
                    </div>
                </div>
            </div>
            <Separator />
            {/* Printed in the Specification column of QT reports / certificates.
                Ply, dimension, weight, load and printing are set elsewhere on this form. */}
            <div className="space-y-2">
                <h3 className="text-xs font-bold uppercase border-b pb-1 text-muted-foreground">Quality Test Report Parameters</h3>
                <div className="flex flex-wrap items-end gap-2">
                    <div className="w-40">
                        <Label className="text-[0.625rem]">Moisture level{requireQtFields ? ' *' : ''}</Label>
                        <Select value={moistureClass ?? ''} onValueChange={(v) => updateSpec('moisture', MOISTURE_CLASSES[v as MoistureClass].range)}>
                            <SelectTrigger><SelectValue placeholder="Choose" /></SelectTrigger>
                            <SelectContent>
                                {(Object.keys(MOISTURE_CLASSES) as MoistureClass[]).map(k => (
                                    <SelectItem key={k} value={k}>{MOISTURE_CLASSES[k].label} ({MOISTURE_CLASSES[k].range}%)</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <Button type="button" variant="outline" onClick={() => handleCalculateAtMoisture()} disabled={!moistureClass} className="h-10">
                        <Calculator className="mr-2 h-4 w-4" /> Calculate GSM / Weight / Load
                    </Button>
                    <p className="text-[0.625rem] text-muted-foreground basis-full">
                        Higher moisture = more GSM and box weight, less load. Uses the dimensions and GSM composition below; results stay editable.
                    </p>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div><Label className="text-[0.625rem]">Moisture (%){requireQtFields ? ' *' : ''}</Label><Input value={form.specification.moisture ?? ''} onChange={e => updateSpec('moisture', e.target.value)} placeholder="e.g. 7-7.9" /></div>
                    <div><Label className="text-[0.625rem]">GSM (board){requireQtFields ? ' *' : ''}</Label><Input value={form.specification.gsm ?? ''} onChange={e => updateSpec('gsm', e.target.value)} placeholder="e.g. 502" /></div>
                    {COPYABLE_FROM_SIMILAR.map(k => (
                        <div key={k}>
                            <Label className="text-[0.625rem]">{k === 'stapleWidth' ? 'Staple Width' : k === 'stapling' ? 'Stapling' : 'Overlap Width'}</Label>
                            <Input value={form.specification[k] ?? ''} onChange={e => editSpecManually(k, e.target.value)} placeholder={k === 'stapling' ? 'e.g. 6pin' : 'e.g. 20mm'} />
                            {suggestedFrom[k] && <p className="text-[0.5625rem] text-muted-foreground truncate" title={suggestedFrom[k]}>from {suggestedFrom[k]}</p>}
                        </div>
                    ))}
                </div>
            </div>
            <Separator />
            <div className="space-y-4">
                <h3 className="text-xs font-bold uppercase border-b pb-1 text-muted-foreground">Technical Specs</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div><Label>Ply</Label><Select value={form.specification.ply ?? '3'} onValueChange={v => updateSpec('ply', v)}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{PLY_OPTIONS.map(opt => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}</SelectContent></Select></div>
                    <div><Label>Paper Type</Label><Select value={form.specification.paperType ?? 'KRAFT'} onValueChange={v => updateSpec('paperType', v)}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="KRAFT">Kraft</SelectItem><SelectItem value="VIRGIN">Virgin</SelectItem><SelectItem value="VIRGIN & KRAFT">Mixed</SelectItem></SelectContent></Select></div>
                    <div><Label>Paper BF</Label><Select value={normalizeBF(form.specification.paperBf)} onValueChange={v => updateSpec('paperBf', v)}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{BF_OPTIONS.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent></Select></div>
                    <div><Label>Waste %</Label><Input type="number" value={form.specification.wastagePercent ?? '3.5'} onChange={e => updateSpec('wastagePercent', e.target.value)} /></div>
                </div>
                {pValue > 0 && (
                <div className="p-6 bg-muted/10 rounded-lg space-y-4 border border-dashed">
                    <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">GSM Composition Layers (Up to {pValue} Ply)</Label>
                    <div className="grid grid-cols-3 md:grid-cols-5 gap-4">
                        <div><Label className="text-[0.625rem] font-bold">L1 (Top)</Label><Input type="number" value={form.specification.topGsm ?? ''} onChange={e => updateSpec('topGsm', e.target.value)} /></div>
                        <div><Label className="text-[0.625rem] font-bold">F1</Label><Input type="number" value={form.specification.flute1Gsm ?? ''} onChange={e => updateSpec('flute1Gsm', e.target.value)} /></div>
                        {pValue >= 5 && (
                            <>
                                <div><Label className="text-[0.625rem] font-bold">L2 (Mid 1)</Label><Input type="number" value={form.specification.middleGsm ?? ''} onChange={e => updateSpec('middleGsm', e.target.value)} /></div>
                                <div><Label className="text-[0.625rem] font-bold">F2</Label><Input type="number" value={form.specification.flute2Gsm ?? ''} onChange={e => updateSpec('flute2Gsm', e.target.value)} /></div>
                            </>
                        )}
                        {pValue >= 7 && (
                            <>
                                <div><Label className="text-[0.625rem] font-bold">L3 (Mid 2)</Label><Input type="number" value={form.specification.liner2Gsm ?? ''} onChange={e => updateSpec('liner2Gsm', e.target.value)} /></div>
                                <div><Label className="text-[0.625rem] font-bold">F3</Label><Input type="number" value={form.specification.flute3Gsm ?? ''} onChange={e => updateSpec('flute3Gsm', e.target.value)} /></div>
                            </>
                        )}
                        {pValue >= 9 && (
                            <>
                                <div><Label className="text-[0.625rem] font-bold">L4 (Mid 3)</Label><Input type="number" value={form.specification.liner3Gsm ?? ''} onChange={e => updateSpec('liner3Gsm', e.target.value)} /></div>
                                <div><Label className="text-[0.625rem] font-bold">F4</Label><Input type="number" value={form.specification.flute4Gsm ?? ''} onChange={e => updateSpec('flute4Gsm', e.target.value)} /></div>
                            </>
                        )}
                        <div><Label className="text-[0.625rem] font-bold">L5 (Bottom)</Label><Input type="number" value={form.specification.bottomGsm ?? ''} onChange={e => updateSpec('bottomGsm', e.target.value)} /></div>
                    </div>
                </div>
                )}
                <div className="space-y-2"><Label>Finishing & Printing Instructions</Label><Textarea value={form.specification.printing ?? ''} onChange={e => updateSpec('printing', e.target.value)} placeholder="e.g. 2 Color Flexo printing, Glue closing..." /></div>
            </div>
            <div className="pt-4">
                <Button className="w-full h-11" onClick={handleSave}>Save Product Record</Button>
            </div>

            <Dialog open={isPartyDialogOpen} onOpenChange={setIsPartyDialogOpen}>
                <DialogContent className="sm:max-w-sm">
                    <DialogHeader><DialogTitle>Quick Add Customer</DialogTitle></DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="party-name">Party Name</Label>
                            <Input id="party-name" value={partyForm.name} onChange={e => setPartyForm({...partyForm, name: e.target.value})} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="party-ownership">Ownership</Label>
                            <Select value={partyForm.ownership} onValueChange={(v: AccountOwnership) => setPartyForm({...partyForm, ownership: v})}>
                                <SelectTrigger id="party-ownership"><SelectValue/></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Sijan">Sijan Dhuwani</SelectItem>
                                    <SelectItem value="Shivam">Shivam Packaging</SelectItem>
                                    <SelectItem value="Both">Both</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="party-address">Address</Label>
                            <Input id="party-address" value={partyForm.address} onChange={e => setPartyForm({...partyForm, address: e.target.value})} />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsPartyDialogOpen(false)}>Cancel</Button>
                        <Button onClick={handleQuickAddParty}>Add Customer</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}