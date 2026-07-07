'use client';
import React, { useState, useEffect, useMemo } from 'react';
import type { Party, PartyType, Product, EstimateInvoiceItem, EstimatedInvoice, AccountOwnership } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, ChevronsUpDown, Check, PlusCircle, Trash2, Printer, Save, Loader2, Plus, Image as ImageIcon, ChevronDown } from 'lucide-react';
import { cn, toWords, toNepaliDate, generateNextEstimateInvoiceNumber, generateId } from '@/lib/utils';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { onPartiesUpdate, addParty, updateParty } from '@/services/party-service';
import { onProductsUpdate } from '@/services/product-service';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { DualCalendar } from '@/components/ui/dual-calendar';
import { useAuth } from '@/hooks/use-auth';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { addEstimatedInvoice, onEstimatedInvoicesUpdate, updateEstimatedInvoice } from '@/services/estimate-invoice-service';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { InvoiceView } from './invoice-view';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import html2canvas from 'html2canvas';
import { ScrollArea } from '@/components/ui/scroll-area';

interface InvoiceCalculatorProps {
  invoiceToEdit?: EstimatedInvoice;
  onSaveSuccess: () => void;
}

export function InvoiceCalculator({ invoiceToEdit, onSaveSuccess }: InvoiceCalculatorProps) {
    const [date, setDate] = useState<Date>(new Date());
    const [party, setParty] = useState<Party | null>(null);
    const [invoiceNumber, setInvoiceNumber] = useState('');
    const [items, setItems] = useState<EstimateInvoiceItem[]>([]);
    
    const [allInvoices, setAllInvoices] = useState<EstimatedInvoice[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [parties, setParties] = useState<Party[]>([]);

    const { toast } = useToast();
    const { user } = useAuth();

    const [isPartyDialogOpen, setIsPartyDialogOpen] = useState(false);
    const [partyForm, setPartyForm] = useState({ name: '', type: 'Customer' as PartyType, ownership: 'Both' as AccountOwnership, address: '', panNumber: '' });
    const [editingParty, setEditingParty] = useState<Party | null>(null);
    const [partySearch, setPartySearch] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [isPartyPopoverOpen, setIsPartyPopoverOpen] = useState(false);
    
    const [isPreviewOpen, setIsPreviewOpen] = useState(false);
    const printRef = React.useRef<HTMLDivElement>(null);
    const [isExporting, setIsExporting] = useState(false);
    
    useEffect(() => {
        const unsubs = [
            onEstimatedInvoicesUpdate(setAllInvoices),
            onPartiesUpdate(setParties),
            onProductsUpdate(setProducts)
        ];
        if (!invoiceToEdit) {
            setItems([{ id: generateId(), productName: '', quantity: 1, rate: 0, gross: 0 }]);
        }
        return () => unsubs.forEach(u => u());
    }, [invoiceToEdit]);
    
    useEffect(() => {
        if (invoiceToEdit) {
          setDate(new Date(invoiceToEdit.date));
          setInvoiceNumber(invoiceToEdit.invoiceNumber);
          setItems(invoiceToEdit.items);
          const existingParty = parties.find(p => p.name === invoiceToEdit.partyName);
          if (existingParty) setParty(existingParty);
        } else if (allInvoices.length > 0) {
          generateNextEstimateInvoiceNumber(allInvoices).then(setInvoiceNumber);
        }
    }, [invoiceToEdit, allInvoices, parties]);
    
    const allParties = useMemo(() => [...parties].sort((a, b) => a.name.localeCompare(b.name)), [parties]);
    
    const handlePartySelect = (selectedPartyId: string) => {
        const selected = allParties.find(c => c.id === selectedPartyId);
        setParty(selected || null);
        setIsPartyPopoverOpen(false);
    };

    const handleOpenPartyDialog = (partyToEdit: Party | null = null, searchName: string = '') => {
        if (partyToEdit) {
            setEditingParty(partyToEdit);
            setPartyForm({ name: partyToEdit.name, type: partyToEdit.type, ownership: partyToEdit.ownership || 'Both', address: partyToEdit.address || '', panNumber: partyToEdit.panNumber || '' });
        } else {
            setEditingParty(null);
            setPartyForm({ name: searchName, type: 'Customer', ownership: 'Both', address: '', panNumber: '' });
        }
        setIsPartyPopoverOpen(false);
        setIsPartyDialogOpen(true);
    };

    const handleSubmitParty = async () => {
        if (!user || !partyForm.name) return;
        try {
            if (editingParty) {
                await updateParty(editingParty.id, { ...partyForm, lastModifiedBy: user.username });
                toast({ title: 'Party Updated' });
            } else {
                await addParty({ ...partyForm, createdBy: user.username });
                toast({ title: 'New party added.' });
            }
            setIsPartyDialogOpen(false);
        } catch {
            toast({ title: 'Error', variant: 'destructive' });
        }
    };
    
    const handleItemChange = (index: number, field: keyof EstimateInvoiceItem, value: any) => {
        const newItems = [...items];
        const item = { ...newItems[index], [field]: value };
        if (field === 'productName') {
            const product = products.find(p => p.name === value);
            if (product?.rate) item.rate = product.rate;
        }
        item.gross = (item.quantity || 0) * (item.rate || 0);
        newItems[index] = item;
        setItems(newItems);
    };

    const invoiceData = useMemo(() => {
        const grossTotal = items.reduce((sum, item) => sum + item.gross, 0);
        const vatTotal = grossTotal * 0.13;
        const netTotal = grossTotal + vatTotal;
        return {
            invoiceNumber, date: date.toISOString(), party, items, grossTotal, vatTotal, netTotal,
            amountInWords: toWords(netTotal), createdBy: user?.username,
        }
    }, [items, party, date, invoiceNumber, user]);
    
    const handleSaveInvoice = async () => {
        if (!user || !party || items.length === 0) return;
        setIsSaving(true);
        try {
            const dataToSave = {
                invoiceNumber,
                date: invoiceData.date,
                partyName: party.name,
                panNumber: party.panNumber,
                items: invoiceData.items,
                grossTotal: invoiceData.grossTotal,
                vatTotal: invoiceData.vatTotal,
                netTotal: invoiceData.netTotal,
                amountInWords: invoiceData.amountInWords,
                createdBy: user.username,
                createdAt: invoiceToEdit?.createdAt || new Date().toISOString(),
            };

            if (invoiceToEdit) {
                 await updateEstimatedInvoice(invoiceToEdit.id, dataToSave);
                 toast({ title: 'Estimate invoice updated.' });
                 onSaveSuccess();
            } else {
                await addEstimatedInvoice(dataToSave);
                toast({ title: 'Estimate invoice saved.' });
                setDate(new Date());
                setParty(null);
                setItems([{ id: generateId(), productName: '', quantity: 1, rate: 0, gross: 0 }]);
            }
        } catch {
            toast({ title: 'Error', variant: 'destructive' });
        } finally {
            setIsSaving(false);
        }
    };
    
    const handleExportPdf = async () => {
        if (!invoiceData.party) return;
        setIsExporting(true);
        try {
            const doc = new jsPDF();
            autoTable(doc, {
                startY: 65,
                head: [['S.N.', 'Particulars', 'Quantity', 'Rate', 'Amount']],
                body: invoiceData.items.map((item, index) => [index + 1, item.productName, item.quantity, item.rate, item.gross]),
                theme: 'grid'
            });
            doc.save(`Estimate-${invoiceData.invoiceNumber}.pdf`);
        } finally {
            setIsExporting(false);
        }
    };

    return (
        <div className="space-y-6">
            <header className="flex justify-between items-center">
                <h1 className="text-2xl font-bold tracking-tight">{invoiceToEdit ? `Edit Invoice #${invoiceToEdit.invoiceNumber}` : 'New Estimate Invoice'}</h1>
                {invoiceToEdit && <Button variant="outline" onClick={onSaveSuccess}>Cancel Edit</Button>}
            </header>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-end">
                <div className="space-y-2"><Label>Document No.</Label><Input value={invoiceNumber} readOnly className="bg-muted/50" /></div>
                <div className="space-y-2"><Label>Date</Label>
                    <Popover>
                        <PopoverTrigger asChild><Button variant="outline" className="w-full justify-start text-left font-normal"><CalendarIcon className="mr-2 h-4 w-4" />{date ? toNepaliDate(date.toISOString()) : 'Select Date'}</Button></PopoverTrigger>
                        <PopoverContent className="w-auto p-0"><DualCalendar selected={date} onSelect={d => d && setDate(d)} /></PopoverContent>
                    </Popover>
                </div>
                <div className="space-y-2"><Label>Party Name</Label>
                    <Popover open={isPartyPopoverOpen} onOpenChange={setIsPartyPopoverOpen}>
                        <PopoverTrigger asChild><Button variant="outline" role="combobox" className="w-full justify-between">{party ? party.name : "Select party..."}<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" /></Button></PopoverTrigger>
                        <PopoverContent className="p-0">
                            <Command>
                                <CommandInput placeholder="Search party..." value={partySearch} onValueChange={setPartySearch} />
                                <CommandList>
                                    <CommandEmpty><Button variant="ghost" className="w-full justify-start" onClick={() => handleOpenPartyDialog(null, partySearch)}><PlusCircle className="mr-2 h-4 w-4" /> Add "{partySearch}"</Button></CommandEmpty>
                                    <CommandGroup>{allParties.map(p => (<CommandItem key={p.id} value={p.name} onSelect={() => handlePartySelect(p.id)}><Check className={cn("mr-2 h-4 w-4", party?.id === p.id ? "opacity-100" : "opacity-0")}/>{p.name}</CommandItem>))}</CommandGroup>
                                </CommandList>
                            </Command>
                        </PopoverContent>
                    </Popover>
                </div>
            </div>

            <Card className="p-0 overflow-hidden">
                <Table>
                    <TableHeader className="bg-muted/50"><TableRow><TableHead className="w-12"></TableHead><TableHead>Product</TableHead><TableHead className="w-32">Qty</TableHead><TableHead className="w-32">Rate</TableHead><TableHead className="w-32 text-right">Amount</TableHead></TableRow></TableHeader>
                    <TableBody>
                        {items.map((item, index) => (
                            <TableRow key={item.id}>
                                <TableCell><Button variant="ghost" size="icon" onClick={() => setItems(items.filter((_, i) => i !== index))} className="text-destructive h-8 w-8"><Trash2 className="h-4 w-4" /></Button></TableCell>
                                <TableCell>
                                    <Popover>
                                        <PopoverTrigger asChild><Button variant="outline" className="w-full justify-between h-9 text-xs">{item.productName || "Select product..."}<ChevronDown className="h-3 w-3 opacity-50"/></Button></PopoverTrigger>
                                        <PopoverContent className="p-0"><Command><CommandInput placeholder="Search..."/><CommandList><CommandGroup>{products.map(p => (<CommandItem key={p.id} value={p.name} onSelect={() => handleItemChange(index, 'productName', p.name)} className="text-xs">{p.name}</CommandItem>))}</CommandGroup></CommandList></Command></PopoverContent>
                                    </Popover>
                                </TableCell>
                                <TableCell><Input type="number" value={item.quantity} onChange={e => handleItemChange(index, 'quantity', parseFloat(e.target.value) || 0)} className="h-9" /></TableCell>
                                <TableCell><Input type="number" value={item.rate} onChange={e => handleItemChange(index, 'rate', parseFloat(e.target.value) || 0)} className="h-9" /></TableCell>
                                <TableCell className="text-right font-bold">Rs. {item.gross.toLocaleString()}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
                <div className="p-4 border-t bg-muted/10 flex justify-between items-center">
                    <Button variant="outline" size="sm" onClick={() => setItems([...items, { id: generateId(), productName: '', quantity: 1, rate: 0, gross: 0 }])}><Plus className="mr-2 h-4 w-4" /> Add Row</Button>
                    <div className="text-right space-y-1">
                        <p className="text-xs text-muted-foreground uppercase font-bold">Total Estimate</p>
                        <p className="text-xl font-black text-blue-900">Rs. {invoiceData.netTotal.toLocaleString()}</p>
                    </div>
                </div>
            </Card>

            <div className="flex justify-end gap-2">
                 <Button variant="outline" onClick={() => setIsPreviewOpen(true)} disabled={!party || items.length === 0}><Printer className="mr-2 h-4 w-4" /> Preview</Button>
                 <Button onClick={handleSaveInvoice} disabled={isSaving}>{isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} Save Invoice</Button>
            </div>

            <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
                <DialogContent className="max-w-4xl h-[90vh] flex flex-col p-0">
                    <DialogHeader className="p-6 pb-2"><DialogTitle>Invoice Preview</DialogTitle></DialogHeader>
                    <ScrollArea className="flex-1 bg-muted/20 p-8"><div ref={printRef} className="mx-auto w-[210mm] shadow-2xl bg-white"><InvoiceView {...invoiceData} /></div></ScrollArea>
                    <DialogFooter className="p-6 border-t"><Button variant="outline" onClick={handleExportPdf}>Save as PDF</Button><Button onClick={() => window.print()}>Print</Button></DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={isPartyDialogOpen} onOpenChange={setIsPartyDialogOpen}>
                <DialogContent>
                    <DialogHeader><DialogTitle>{editingParty ? 'Edit Party' : 'Quick Add Party'}</DialogTitle></DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="space-y-2"><Label>Name</Label><Input value={partyForm.name} onChange={e => setPartyForm({...partyForm, name: e.target.value})} /></div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2"><Label>Type</Label><Select value={partyForm.type} onValueChange={(v: any) => setPartyForm({...partyForm, type: v})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="Vendor">Vendor</SelectItem><SelectItem value="Customer">Customer</SelectItem></SelectContent></Select></div>
                            <div className="space-y-2"><Label>Ownership</Label><Select value={partyForm.ownership} onValueChange={(v: any) => setPartyForm({...partyForm, ownership: v})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="Sijan">Sijan</SelectItem><SelectItem value="Shivam">Shivam</SelectItem></SelectContent></Select></div>
                        </div>
                    </div>
                    <DialogFooter><Button onClick={handleSubmitParty}>Save Record</Button></DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
