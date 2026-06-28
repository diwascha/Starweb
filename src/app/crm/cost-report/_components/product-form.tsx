'use client';

import { useState, useEffect } from 'react';
import type { Product, Party, ProductSpecification, AccountOwnership } from '@/lib/types';
import { onPartiesUpdate, addParty } from '@/services/party-service';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { normalizeBF } from '@/lib/utils';
import { PLY_OPTIONS, BF_OPTIONS } from '@/lib/constants';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { PlusCircle } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';

interface ProductFormProps {
    productToEdit?: Product | null;
    onSaveSuccess: (data: any) => void;
}

export function ProductForm({ productToEdit, onSaveSuccess }: ProductFormProps) {
    const [form, setForm] = useState<any>({ 
        name: '', materialCode: '', partyId: '', 
        specification: { 
            ply: '3', wastagePercent: '3.5', boxType: 'RSC', paperType: 'KRAFT', paperBf: '18 BF', 
            topGsm: '120', flute1Gsm: '100', middleGsm: '', flute2Gsm: '', liner2Gsm: '', flute3Gsm: '', liner3Gsm: '', flute4Gsm: '', bottomGsm: '120', dimension: '',
            weightOfBox: '', moisture: '', load: '', printing: ''
        } 
    });
    const [dim, setDim] = useState({ l: '', b: '', h: '' });
    const [parties, setParties] = useState<Party[]>([]);
    const [isPartyDialogOpen, setIsPartyDialogOpen] = useState(false);
    const [partyForm, setPartyForm] = useState<{name: string, ownership: AccountOwnership, address?: string}>({name: '', ownership: 'Both', address: ''});
    const { toast } = useToast();
    const { user } = useAuth();

    useEffect(() => { onPartiesUpdate(setParties); }, []);
    
    useEffect(() => {
        if (productToEdit) {
            const [l, b, h] = productToEdit.specification?.dimension?.split('x') || ['', '', ''];
            setDim({ l, b, h });
            setForm({
                ...productToEdit,
                specification: {
                    ...form.specification,
                    ...productToEdit.specification
                }
            });
        }
    }, [productToEdit]);

    const handleSave = () => {
        if (!form.name || !form.partyId) { 
            toast({ title: 'Validation Error', description: 'Name and Party are required.', variant: 'destructive' }); 
            return; 
        }
        const p = parties.find(x => x.id === form.partyId);
        onSaveSuccess({ 
            ...form, 
            partyName: p?.name, 
            partyAddress: p?.address, 
            specification: { ...form.specification, dimension: `${dim.l}x${dim.b}x${dim.h}` } 
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

    const p = parseInt(form.specification.ply, 10);

    return (
        <div className="space-y-6 pt-2 pb-8 overflow-y-auto max-h-[75vh]">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                    <h3 className="text-xs font-bold uppercase border-b pb-1 text-muted-foreground">General Info</h3>
                    <div className="space-y-2"><Label>Product Name</Label><Input value={form.name ?? ''} onChange={e => setForm({...form, name: e.target.value})} /></div>
                    <div className="space-y-2">
                        <Label>Party (Customer)</Label>
                        <div className="flex gap-2">
                            <Select value={form.partyId ?? ''} onValueChange={v => setForm({...form, partyId: v})}>
                                <SelectTrigger><SelectValue placeholder="Select party..." /></SelectTrigger>
                                <SelectContent>{parties.sort((a,b)=>a.name.localeCompare(b.name)).map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                            </Select>
                            <Button variant="outline" size="icon" onClick={() => setIsPartyDialogOpen(true)}><PlusCircle className="h-4 w-4"/></Button>
                        </div>
                    </div>
                </div>
                <div className="space-y-4">
                    <h3 className="text-xs font-bold uppercase border-b pb-1 text-muted-foreground">Dimensions (mm)</h3>
                    <div className="grid grid-cols-3 gap-2">
                        <div><Label className="text-[10px]">L</Label><Input type="number" value={dim.l ?? ''} onChange={e => setDim({...dim, l: e.target.value})} /></div>
                        <div><Label className="text-[10px]">B</Label><Input type="number" value={dim.b ?? ''} onChange={e => setDim({...dim, b: e.target.value})} /></div>
                        <div><Label className="text-[10px]">H</Label><Input type="number" value={dim.h ?? ''} onChange={e => setDim({...dim, h: e.target.value})} /></div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 mt-2">
                        <div><Label className="text-[10px]">Weight (g)</Label><Input value={form.specification.weightOfBox ?? ''} onChange={e => updateSpec('weightOfBox', e.target.value)} /></div>
                        <div><Label className="text-[10px]">Load (KGF)</Label><Input value={form.specification.load ?? ''} onChange={e => updateSpec('load', e.target.value)} /></div>
                    </div>
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
                {p > 0 && (
                <div className="p-6 bg-muted/10 rounded-lg space-y-4 border border-dashed">
                    <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">GSM Composition Layers (Up to {p} Ply)</Label>
                    <div className="grid grid-cols-3 md:grid-cols-5 gap-4">
                        <div><Label className="text-[10px] font-bold">L1 (Top)</Label><Input type="number" value={form.specification.topGsm ?? ''} onChange={e => updateSpec('topGsm', e.target.value)} /></div>
                        <div><Label className="text-[10px] font-bold">F1</Label><Input type="number" value={form.specification.flute1Gsm ?? ''} onChange={e => updateSpec('flute1Gsm', e.target.value)} /></div>
                        {p >= 5 && (
                            <>
                                <div><Label className="text-[10px] font-bold">L2 (Mid 1)</Label><Input type="number" value={form.specification.middleGsm ?? ''} onChange={e => updateSpec('middleGsm', e.target.value)} /></div>
                                <div><Label className="text-[10px] font-bold">F2</Label><Input type="number" value={form.specification.flute2Gsm ?? ''} onChange={e => updateSpec('flute2Gsm', e.target.value)} /></div>
                            </>
                        )}
                        {p >= 7 && (
                            <>
                                <div><Label className="text-[10px] font-bold">L3 (Mid 2)</Label><Input type="number" value={form.specification.liner2Gsm ?? ''} onChange={e => updateSpec('liner2Gsm', e.target.value)} /></div>
                                <div><Label className="text-[10px] font-bold">F3</Label><Input type="number" value={form.specification.flute3Gsm ?? ''} onChange={e => updateSpec('flute3Gsm', e.target.value)} /></div>
                            </>
                        )}
                        {p >= 9 && (
                            <>
                                <div><Label className="text-[10px] font-bold">L4 (Mid 3)</Label><Input type="number" value={form.specification.liner3Gsm ?? ''} onChange={e => updateSpec('liner3Gsm', e.target.value)} /></div>
                                <div><Label className="text-[10px] font-bold">F4</Label><Input type="number" value={form.specification.flute4Gsm ?? ''} onChange={e => updateSpec('flute4Gsm', e.target.value)} /></div>
                            </>
                        )}
                        <div><Label className="text-[10px] font-bold">L5 (Bottom)</Label><Input type="number" value={form.specification.bottomGsm ?? ''} onChange={e => updateSpec('bottomGsm', e.target.value)} /></div>
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
