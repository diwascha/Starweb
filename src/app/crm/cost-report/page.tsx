
'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import type { Product, Party, PartyType } from '@/lib/types';
import { onProductsUpdate } from '@/services/product-service';
import { onPartiesUpdate, addParty, updateParty } from '@/services/party-service';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Printer, Loader2, Plus, Trash2, ChevronsUpDown, Check, PlusCircle, Edit } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon } from 'lucide-react';
import { DualCalendar } from '@/components/ui/dual-calendar';
import { cn, toNepaliDate } from '@/lib/utils';
import { format } from 'date-fns';
import { useAuth } from '@/hooks/use-auth';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';

interface CostReportItem {
  id: string;
  productId: string;
  l: string;
  b: string;
  h: string;
  ply: string;
  fluteType: string;
  paperBf: string;
  topGsm: string;
  flute1Gsm: string;
  middleGsm: string;
  flute2Gsm: string;
  bottomGsm: string;
  paperRate: string;
  gumRate: string;
  stitchingRate: string;
  wastagePercent: string;
  calculatedCost: number;
}

const initialItemState: Omit<CostReportItem, 'id' | 'productId' | 'calculatedCost'> = {
    l: '', b: '', h: '', ply: '3', fluteType: 'B', paperBf: '18',
    topGsm: '120', flute1Gsm: '100', middleGsm: '120', flute2Gsm: '100', bottomGsm: '120',
    paperRate: '', gumRate: '1.5', stitchingRate: '0.5', wastagePercent: '3.5',
};

export default function CostReportPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [selectedPartyId, setSelectedPartyId] = useState<string>('');
  const [reportNumber, setReportNumber] = useState('CR-001'); // Placeholder
  const [reportDate, setReportDate] = useState<Date>(new Date());
  const [items, setItems] = useState<CostReportItem[]>([
    { id: Date.now().toString(), productId: '', ...initialItemState, calculatedCost: 0 }
  ]);
  
  const { toast } = useToast();
  const { user } = useAuth();
  
  const [isPartyDialogOpen, setIsPartyDialogOpen] = useState(false);
  const [partyForm, setPartyForm] = useState<{ name: string; type: PartyType; address?: string; panNumber?: string; }>({ name: '', type: 'Customer', address: '', panNumber: '' });
  const [editingParty, setEditingParty] = useState<Party | null>(null);


  useEffect(() => {
    const unsubProducts = onProductsUpdate(setProducts);
    const unsubParties = onPartiesUpdate(setParties);
    return () => {
        unsubProducts();
        unsubParties();
    };
  }, []);

  const calculateItemCost = useCallback((item: CostReportItem) => {
    const l = parseFloat(item.l) || 0;
    const b = parseFloat(item.b) || 0;
    const h = parseFloat(item.h) || 0;
    const ply = parseInt(item.ply, 10) || 0;
    
    if (l === 0 || b === 0 || h === 0 || ply === 0) return 0;

    const sheetSizeL = ((2 * l) + (2 * b) + 5);
    const sheetSizeB = (b + h + 2);

    const fluteFactor = item.fluteType === 'B' ? 1.33 : (item.fluteType === 'C' ? 1.45 : 1.25);

    const topGsm = parseInt(item.topGsm, 10) || 0;
    const flute1Gsm = parseInt(item.flute1Gsm, 10) || 0;
    const middleGsm = parseInt(item.middleGsm, 10) || 0;
    const flute2Gsm = parseInt(item.flute2Gsm, 10) || 0;
    const bottomGsm = parseInt(item.bottomGsm, 10) || 0;
    
    const sheetArea = (sheetSizeL * sheetSizeB) / 10000;

    let paperWeight = 0;
    if (ply === 3) {
      paperWeight = ((topGsm / 1000) * sheetArea) + ((flute1Gsm / 1000) * sheetArea * fluteFactor) + ((bottomGsm / 1000) * sheetArea);
    } else if (ply === 5) {
      paperWeight = ((topGsm / 1000) * sheetArea) + ((flute1Gsm / 1000) * sheetArea * fluteFactor) + ((middleGsm / 1000) * sheetArea) + ((flute2Gsm / 1000) * sheetArea * fluteFactor) + ((bottomGsm / 1000) * sheetArea);
    }
    
    const wastage = parseFloat(item.wastagePercent) / 100 || 0;
    const totalBoxWeight = paperWeight * (1 + wastage);
    
    const paperRate = parseFloat(item.paperRate) || 0;
    const paperCost = totalBoxWeight * paperRate;
    
    const gumCost = (paperWeight * (ply - 1) / 2) * (parseFloat(item.gumRate) || 0);
    const stitchingCost = parseFloat(item.stitchingRate) || 0;
    
    return paperCost + gumCost + stitchingCost;
  }, []);

  useEffect(() => {
    setItems(prevItems => prevItems.map(item => ({
      ...item,
      calculatedCost: calculateItemCost(item),
    })));
  }, [items, calculateItemCost]);

  const handleProductSelect = (index: number, productId: string) => {
    const product = products.find(p => p.id === productId);
    if (!product) return;
    
    const spec = product.specification;
    const [l,b,h] = spec.dimension?.split('x') || ['','',''];
    
    setItems(prevItems => {
        const newItems = [...prevItems];
        newItems[index] = {
            ...newItems[index],
            productId: product.id,
            l: l || '', b: b || '', h: h || '',
            ply: spec.ply || '3',
            // Reset other fields or pull from product spec if available
        };
        return newItems;
    });
  };

  const handleItemChange = (index: number, field: keyof CostReportItem, value: string) => {
    setItems(prevItems => {
        const newItems = [...prevItems];
        (newItems[index] as any)[field] = value;
        return newItems;
    });
  };

  const handleAddItem = () => {
    setItems(prev => [...prev, { id: Date.now().toString(), productId: '', ...initialItemState, calculatedCost: 0 }]);
  };
  
  const handleRemoveItem = (id: string) => {
    setItems(prev => prev.filter(item => item.id !== id));
  };
  
  const totalCost = useMemo(() => {
    return items.reduce((sum, item) => sum + (item.calculatedCost || 0), 0);
  }, [items]);
  
  const handleOpenPartyDialog = (partyToEdit: Party | null = null, searchName: string = '') => {
    if (partyToEdit) {
        setEditingParty(partyToEdit);
        setPartyForm({ name: partyToEdit.name, type: partyToEdit.type, address: partyToEdit.address || '', panNumber: partyToEdit.panNumber || '' });
    } else {
        setEditingParty(null);
        setPartyForm({ name: searchName, type: 'Customer', address: '', panNumber: '' });
    }
    setIsPartyDialogOpen(true);
  };
  
  const handleSubmitParty = async () => {
    if (!user) return;
    if (!partyForm.name) {
        toast({ title: 'Error', description: 'Party name is required.', variant: 'destructive' });
        return;
    }
    try {
        if (editingParty) {
            await updateParty(editingParty.id, { ...partyForm, lastModifiedBy: user.username });
            toast({ title: 'Success', description: 'Party updated.' });
        } else {
            const newPartyId = await addParty({ ...partyForm, createdBy: user.username });
            setSelectedPartyId(newPartyId);
            toast({ title: 'Success', description: 'New party added.' });
        }
        setIsPartyDialogOpen(false);
    } catch {
        toast({ title: 'Error', description: 'Failed to save party.', variant: 'destructive' });
    }
  };


  return (
    <>
      <div className="flex flex-col gap-8">
        <header>
          <h1 className="text-3xl font-bold tracking-tight">Cost Report Generator</h1>
          <p className="text-muted-foreground">Calculate product costs based on multiple raw materials and specifications.</p>
        </header>

        <Card>
            <CardHeader>
                <CardTitle>Report Details</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-6">
                 <div className="space-y-2">
                    <Label htmlFor="reportNumber">Report Number</Label>
                    <Input id="reportNumber" value={reportNumber} readOnly className="bg-muted/50" />
                 </div>
                 <div className="space-y-2">
                    <Label htmlFor="reportDate">Report Date</Label>
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button variant={"outline"} className={cn("w-full justify-start text-left font-normal", !reportDate && "text-muted-foreground")}>
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {reportDate ? `${toNepaliDate(reportDate.toISOString())} BS (${format(reportDate, "PPP")})` : <span>Pick a date</span>}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                            <DualCalendar selected={reportDate} onSelect={(d) => d && setReportDate(d)} />
                        </PopoverContent>
                    </Popover>
                 </div>
                 <div className="space-y-2">
                    <Label htmlFor="party-select">Party Name</Label>
                    <div className="flex gap-2">
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button variant="outline" role="combobox" className="w-full justify-between">
                                    {selectedPartyId ? parties.find(p => p.id === selectedPartyId)?.name : "Select party..."}
                                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="p-0 w-[--radix-popover-trigger-width]">
                                <Command>
                                    <CommandInput placeholder="Search party..." />
                                    <CommandList>
                                        <CommandEmpty>
                                             <Button variant="ghost" className="w-full justify-start" onClick={() => handleOpenPartyDialog(null, '')}><PlusCircle className="mr-2 h-4 w-4" /> Add New Party</Button>
                                        </CommandEmpty>
                                        <CommandGroup>
                                            {parties.map(p => (
                                                <CommandItem key={p.id} value={p.name} onSelect={() => setSelectedPartyId(p.id)} className="flex justify-between">
                                                    <div>
                                                        <Check className={cn("mr-2 h-4 w-4", selectedPartyId === p.id ? "opacity-100" : "opacity-0")} />
                                                        {p.name}
                                                    </div>
                                                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => {e.stopPropagation(); handleOpenPartyDialog(p)}}><Edit className="h-3 w-3"/></Button>
                                                </CommandItem>
                                            ))}
                                        </CommandGroup>
                                    </CommandList>
                                </Command>
                            </PopoverContent>
                        </Popover>
                    </div>
                 </div>
            </CardContent>
        </Card>
        
        <Card>
            <CardHeader>
                <CardTitle>Product Cost Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="space-y-4">
                    {items.map((item, index) => (
                        <div key={item.id} className="border rounded-lg p-4 space-y-4 relative">
                            <Button variant="ghost" size="icon" className="absolute top-2 right-2 h-7 w-7 text-destructive" onClick={() => handleRemoveItem(item.id)}>
                                <Trash2 className="h-4 w-4" />
                            </Button>
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                <div className="space-y-2 md:col-span-4">
                                    <Label>Select Product (Optional)</Label>
                                    <Select onValueChange={(v) => handleProductSelect(index, v)} value={item.productId}>
                                        <SelectTrigger><SelectValue placeholder="Select a product to prefill data..." /></SelectTrigger>
                                        <SelectContent>{products.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                                    </Select>
                                </div>
                                 <div className="space-y-2"><Label>L (cm)</Label><Input type="number" value={item.l} onChange={e => handleItemChange(index, 'l', e.target.value)} /></div>
                                 <div className="space-y-2"><Label>B (cm)</Label><Input type="number" value={item.b} onChange={e => handleItemChange(index, 'b', e.target.value)} /></div>
                                 <div className="space-y-2"><Label>H (cm)</Label><Input type="number" value={item.h} onChange={e => handleItemChange(index, 'h', e.target.value)} /></div>
                                <div className="space-y-2"><Label>Ply</Label><Input type="number" value={item.ply} onChange={e => handleItemChange(index, 'ply', e.target.value)} /></div>
                            </div>
                            <div>
                                <Label>GSM Layers (Top to Bottom)</Label>
                                <div className="grid grid-cols-5 gap-2 mt-2">
                                   <div className="space-y-1"><Label className="text-xs">Top</Label><Input name="topGsm" type="number" value={item.topGsm} onChange={(e) => handleItemChange(index, 'topGsm', e.target.value)} /></div>
                                   <div className="space-y-1"><Label className="text-xs">Flute 1</Label><Input name="flute1Gsm" type="number" value={item.flute1Gsm} onChange={(e) => handleItemChange(index, 'flute1Gsm', e.target.value)} /></div>
                                   <div className="space-y-1"><Label className="text-xs">Middle</Label><Input name="middleGsm" type="number" value={item.middleGsm} onChange={(e) => handleItemChange(index, 'middleGsm', e.target.value)} disabled={item.ply !== '5'}/></div>
                                   <div className="space-y-1"><Label className="text-xs">Flute 2</Label><Input name="flute2Gsm" type="number" value={item.flute2Gsm} onChange={(e) => handleItemChange(index, 'flute2Gsm', e.target.value)} disabled={item.ply !== '5'}/></div>
                                   <div className="space-y-1"><Label className="text-xs">Bottom</Label><Input name="bottomGsm" type="number" value={item.bottomGsm} onChange={(e) => handleItemChange(index, 'bottomGsm', e.target.value)} /></div>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div className="space-y-2"><Label>Paper Rate (per KG)</Label><Input type="number" value={item.paperRate} onChange={e => handleItemChange(index, 'paperRate', e.target.value)} /></div>
                                <div className="space-y-2"><Label>Gum Rate</Label><Input type="number" value={item.gumRate} onChange={e => handleItemChange(index, 'gumRate', e.target.value)} /></div>
                                <div className="space-y-2"><Label>Stitching Rate</Label><Input type="number" value={item.stitchingRate} onChange={e => handleItemChange(index, 'stitchingRate', e.target.value)} /></div>
                                <div className="space-y-2"><Label>Wastage (%)</Label><Input type="number" value={item.wastagePercent} onChange={e => handleItemChange(index, 'wastagePercent', e.target.value)} /></div>
                            </div>
                             <div className="text-right font-bold text-lg">
                                Estimated Cost: {item.calculatedCost > 0 ? item.calculatedCost.toFixed(2) : '...'}
                            </div>
                        </div>
                    ))}
                </div>
                 <Button variant="outline" size="sm" onClick={handleAddItem} className="mt-4"><Plus className="mr-2 h-4 w-4" />Add Another Product</Button>
            </CardContent>
             <CardContent>
                <div className="flex justify-end pt-4 border-t">
                    <div className="text-2xl font-bold">
                        Total Report Cost: <span className="text-primary">{totalCost.toFixed(2)}</span>
                    </div>
                </div>
            </CardContent>
        </Card>
      </div>

       <Dialog open={isPartyDialogOpen} onOpenChange={setIsPartyDialogOpen}>
          <DialogContent className="sm:max-w-md">
              <DialogHeader>
                  <DialogTitle>{editingParty ? 'Edit Party' : 'Add New Party'}</DialogTitle>
                   <DialogDescription>
                      {editingParty ? 'Update the details for this party.' : 'Create a new customer/vendor record.'}
                  </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                  <div className="space-y-2">
                      <Label htmlFor="party-name-dialog">Party Name</Label>
                      <Input id="party-name-dialog" value={partyForm.name} onChange={e => setPartyForm(p => ({...p, name: e.target.value}))} />
                  </div>
                   <div className="space-y-2">
                      <Label htmlFor="party-type-dialog">Party Type</Label>
                      <Select value={partyForm.type} onValueChange={(v: PartyType) => setPartyForm(p => ({...p, type: v}))}>
                          <SelectTrigger id="party-type-dialog"><SelectValue/></SelectTrigger>
                          <SelectContent>
                              <SelectItem value="Vendor">Vendor</SelectItem>
                              <SelectItem value="Customer">Customer</SelectItem>
                              <SelectItem value="Both">Both</SelectItem>
                          </SelectContent>
                      </Select>
                  </div>
                  <div className="space-y-2">
                      <Label htmlFor="party-pan-dialog">PAN Number</Label>
                      <Input id="party-pan-dialog" value={partyForm.panNumber || ''} onChange={e => setPartyForm(p => ({...p, panNumber: e.target.value}))} />
                  </div>
                  <div className="space-y-2">
                      <Label htmlFor="party-address-dialog">Address</Label>
                      <Textarea id="party-address-dialog" value={partyForm.address || ''} onChange={e => setPartyForm(p => ({...p, address: e.target.value}))} />
                  </div>
              </div>
              <DialogFooter>
                  <Button variant="outline" onClick={() => setIsPartyDialogOpen(false)}>Cancel</Button>
                  <Button onClick={handleSubmitParty}>{editingParty ? 'Save Changes' : 'Add Party'}</Button>
              </DialogFooter>
          </DialogContent>
      </Dialog>
    </>
  );
}

