
'use client';
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import type { Party, PartyType, Product, EstimateInvoiceItem, EstimatedInvoice } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, ChevronsUpDown, Check, PlusCircle, Trash2, Printer, Save, FileText, Loader2, Plus, Edit, Image as ImageIcon } from 'lucide-react';
import { cn, toWords, toNepaliDate, generateNextEstimateInvoiceNumber } from '@/lib/utils';
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
import { addEstimatedInvoice, onEstimatedInvoicesUpdate } from '@/services/estimate-invoice-service';
import { useRouter } from 'next/navigation';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import { InvoiceView } from './invoice-view';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import html2canvas from 'html2canvas';


export function InvoiceCalculator() {
    const [date, setDate] = useState<Date>(new Date());
    const [party, setParty] = useState<Party | null>(null);
    const [invoiceNumber, setInvoiceNumber] = useState('');
    const [items, setItems] = useState<EstimateInvoiceItem[]>([]);
    
    const [allInvoices, setAllInvoices] = useState<EstimatedInvoice[]>([]);
    const [parties, setParties] = useState<Party[]>([]);
    const [products, setProducts] = useState<Product[]>([]);

    const { toast } = useToast();
    const { user } = useAuth();
    const router = useRouter();

    const [isPartyDialogOpen, setIsPartyDialogOpen] = useState(false);
    const [partyForm, setPartyForm] = useState<{ name: string, type: PartyType, address?: string; panNumber?: string; }>({ name: '', type: 'Customer', address: '', panNumber: '' });
    const [editingParty, setEditingParty] = useState<Party | null>(null);
    const [partySearch, setPartySearch] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [isPartyPopoverOpen, setIsPartyPopoverOpen] = useState(false);
    
    const [isPreviewOpen, setIsPreviewOpen] = useState(false);
    const printRef = React.useRef<HTMLDivElement>(null);
    const [isExporting, setIsExporting] = useState(false);


    useEffect(() => {
        const unsubInvoices = onEstimatedInvoicesUpdate(setAllInvoices);
        const unsubParties = onPartiesUpdate(setParties);
        const unsubProducts = onProductsUpdate(setProducts);
        return () => {
            unsubInvoices();
            unsubParties();
            unsubProducts();
        }
    }, []);
    
    useEffect(() => {
        const setNextNumber = async () => {
            if (!invoiceNumber) { // Only generate if not already set
                const nextNumber = await generateNextEstimateInvoiceNumber(allInvoices);
                setInvoiceNumber(nextNumber);
            }
        };
        if (allInvoices.length >= 0) { // Should run even if there are no invoices yet
            setNextNumber();
        }
    }, [allInvoices, invoiceNumber]);
    
    const allParties = useMemo(() => parties.sort((a, b) => a.name.localeCompare(b.name)), [parties]);
    
    const handlePartySelect = (selectedPartyId: string) => {
        const selected = allParties.find(c => c.id === selectedPartyId);
        setParty(selected || null);
        setPartySearch('');
        setIsPartyPopoverOpen(false);
    };

    const handleOpenPartyDialog = (partyToEdit: Party | null = null, searchName: string = '') => {
        if (partyToEdit) {
            setEditingParty(partyToEdit);
            setPartyForm({ name: partyToEdit.name, type: partyToEdit.type, address: partyToEdit.address || '', panNumber: partyToEdit.panNumber || '' });
        } else {
            setEditingParty(null);
            setPartyForm({ name: searchName, type: 'Customer', address: '', panNumber: '' });
        }
        setIsPartyPopoverOpen(false);
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
                const updatedParty = { ...editingParty, ...partyForm };
                setParty(updatedParty);
                toast({ title: 'Success', description: 'Party updated.' });
            } else {
                const newPartyId = await addParty({ ...partyForm, createdBy: user.username });
                const newParty = { id: newPartyId, ...partyForm, createdBy: user.username, createdAt: new Date().toISOString() } as Party;
                setParties(p => [...p, newParty]);
                setParty(newParty);
                toast({ title: 'Success', description: 'New party added.' });
            }
            setIsPartyDialogOpen(false);
        } catch {
            toast({ title: 'Error', description: 'Failed to save party.', variant: 'destructive' });
        }
    };
    
    const handleAddItem = () => {
        setItems([...items, { id: Date.now().toString(), productName: '', quantity: 1, rate: 0, gross: 0 }]);
    };
    
    const handleItemChange = (index: number, field: keyof EstimateInvoiceItem, value: any) => {
        const newItems = [...items];
        const item = { ...newItems[index] };
        (item as any)[field] = value;

        if (field === 'productName') {
            const product = products.find(p => p.name === value);
            if (product?.rate) {
                item.rate = product.rate;
            }
        }
        
        item.gross = (item.quantity || 0) * (item.rate || 0);
        newItems[index] = item;
        setItems(newItems);
    };

    const handleRemoveItem = (index: number) => {
        setItems(items.filter((_, i) => i !== index));
    };

    const invoiceData = useMemo(() => {
        const grossTotal = items.reduce((sum, item) => sum + item.gross, 0);
        const vatTotal = grossTotal * 0.13;
        const netTotal = grossTotal + vatTotal;
        const amountInWords = toWords(netTotal);
        
        return {
            invoiceNumber,
            date: date.toISOString(),
            party: party,
            items,
            grossTotal,
            vatTotal,
            netTotal,
            amountInWords,
            createdBy: user?.username,
        }
    }, [items, party, date, invoiceNumber, user]);
    
    const handleSaveInvoice = async () => {
        if (!party || items.length === 0 || !items.every(i => i.productName && i.quantity > 0 && i.rate > 0)) {
            toast({ title: 'Validation Error', description: 'Please select a party and ensure all items have a product, quantity, and rate.', variant: 'destructive' });
            return;
        }
        
        setIsSaving(true);
        try {
            await addEstimatedInvoice({
                invoiceNumber: invoiceData.invoiceNumber,
                date: invoiceData.date,
                partyName: invoiceData.party?.name || 'N/A',
                panNumber: invoiceData.party?.panNumber,
                items: invoiceData.items,
                grossTotal: invoiceData.grossTotal,
                vatTotal: invoiceData.vatTotal,
                netTotal: invoiceData.netTotal,
                amountInWords: invoiceData.amountInWords,
                createdBy: user!.username,
                createdAt: new Date().toISOString(),
            });
            toast({ title: 'Success', description: 'Estimate invoice saved.' });
        } catch (error) {
            toast({ title: 'Error', description: 'Failed to save invoice.', variant: 'destructive' });
        } finally {
            setIsSaving(false);
        }
    };
    
    const handlePrint = () => {
        const printableArea = printRef.current;
        if (!printableArea) return;
        
        const printWindow = window.open('', '', 'height=800,width=800');
        printWindow?.document.write('<html><head><title>Print Invoice</title>');
        printWindow?.document.write('<style>@media print{@page{size: A4;margin: 0;}body{margin: 1.6cm;}}body{font-family:sans-serif;}table{width:100%;border-collapse:collapse;}th,td{border:1px solid #ddd;padding:8px;}.text-right{text-align:right;}.font-bold{font-weight:bold;}</style>');
        printWindow?.document.write('</head><body>');
        printWindow?.document.write(printableArea.innerHTML);
        printWindow?.document.write('</body></html>');
        printWindow?.document.close();
        printWindow?.focus();
        setTimeout(() => {
            printWindow?.print();
            printWindow?.close();
        }, 250);
    };

    const handleExportPdf = () => {
        if (!invoiceData.party) return;
        setIsExporting(true);

        const doc = new jsPDF();
        const { party, items, grossTotal, vatTotal, netTotal, amountInWords, date, invoiceNumber } = invoiceData;

        // Header
        doc.setFontSize(18);
        doc.setFont('helvetica', 'bold');
        doc.text('SHIVAM PACKAGING INDUSTRIES PVT LTD.', doc.internal.pageSize.getWidth() / 2, 20, { align: 'center' });
        doc.setFontSize(14);
        doc.setFont('helvetica', 'normal');
        doc.text('शिवम प्याकेजिङ्ग इन्डस्ट्रिज प्रा.लि.', doc.internal.pageSize.getWidth() / 2, 28, { align: 'center' });
        doc.setFontSize(10);
        doc.text('HETAUDA 08, BAGMATI PROVIENCE, NEPAL', doc.internal.pageSize.getWidth() / 2, 34, { align: 'center' });
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('ESTIMATE INVOICE', doc.internal.pageSize.getWidth() / 2, 42, { align: 'center' });
        
        // Info
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text(`Invoice No: ${invoiceNumber}`, 14, 55);
        doc.text(`Party Name: ${party.name}`, 14, 60);
        doc.text(`Address: ${party.address || ''}`, 14, 65);
        doc.text(`PAN/VAT No: ${party.panNumber || ''}`, 14, 70);

        const nepaliDate = toNepaliDate(date);
        const adDate = format(new Date(date), 'yyyy-MM-dd');
        doc.text(`Date: ${nepaliDate} BS (${adDate})`, doc.internal.pageSize.getWidth() - 14, 55, { align: 'right' });

        // Table
        (doc as any).autoTable({
            startY: 75,
            head: [['S.N.', 'Particulars', 'Quantity', 'Rate', 'Amount']],
            body: items.map((item, index) => [
                index + 1,
                item.productName,
                item.quantity,
                item.rate.toLocaleString(undefined, {minimumFractionDigits: 2}),
                item.gross.toLocaleString(undefined, {minimumFractionDigits: 2})
            ]),
            theme: 'grid',
            headStyles: { fillColor: [230, 230, 230], textColor: 20, fontStyle: 'bold' },
            styles: { fontSize: 9 },
            columnStyles: {
                2: { halign: 'right' },
                3: { halign: 'right' },
                4: { halign: 'right' },
            },
            didDrawPage: (data: any) => {
                // Totals
                let finalY = data.cursor.y;
                doc.setFontSize(10);
                
                doc.text('Gross Total', 140, finalY + 8, { align: 'right' });
                doc.text(grossTotal.toLocaleString(undefined, {minimumFractionDigits: 2}), 200, finalY + 8, { align: 'right' });
                
                doc.text('VAT (13%)', 140, finalY + 15, { align: 'right' });
                doc.text(vatTotal.toLocaleString(undefined, {minimumFractionDigits: 2}), 200, finalY + 15, { align: 'right' });
                
                doc.setFont('helvetica', 'bold');
                doc.text('Net Total', 140, finalY + 22, { align: 'right' });
                doc.text(netTotal.toLocaleString(undefined, {minimumFractionDigits: 2}), 200, finalY + 22, { align: 'right' });

                // In Words & Disclaimer
                doc.setFont('helvetica', 'normal');
                doc.text(`In Words: ${amountInWords}`, 14, finalY + 30);

                doc.setFontSize(8);
                doc.setFont('helvetica', 'bold');
                doc.text('Disclaimer:', doc.internal.pageSize.getWidth() / 2, finalY + 40, { align: 'center' });
                doc.setFont('helvetica', 'normal');
                doc.text('This is an estimate for discussion purposes and not a substitute for a formal VAT invoice.', doc.internal.pageSize.getWidth() / 2, finalY + 44, { align: 'center' });
            }
        });
        
        doc.save(`Estimate-${invoiceData.invoiceNumber}.pdf`);
        setIsExporting(false);
    };

    const handleExportJpg = async () => {
        if (!printRef.current) return;
        setIsExporting(true);

        try {
            const canvas = await html2canvas(printRef.current, { 
                scale: 3, 
                useCORS: true,
                backgroundColor: '#ffffff'
            });
            const link = document.createElement('a');
            link.download = `Estimate-${invoiceData.invoiceNumber}.jpg`;
            link.href = canvas.toDataURL('image/jpeg', 0.9);
            link.click();
        } catch (error) {
            console.error(`Failed to export as JPG`, error);
            toast({ title: 'Export Failed', description: `Could not export invoice as JPG.`, variant: 'destructive' });
        } finally {
            setIsExporting(false);
        }
    };


    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-end">
                <div className="space-y-2">
                    <Label htmlFor="invoiceNumber">Auto Document Numbering</Label>
                    <Input id="invoiceNumber" value={invoiceNumber} readOnly className="bg-muted/50" />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="date">Date:</Label>
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button variant="outline" className="w-full justify-start text-left font-normal">
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {date ? `${toNepaliDate(date.toISOString())} BS (${format(date, "PPP")})` : <span>Pick a date</span>}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                            <DualCalendar selected={date} onSelect={(d) => d && setDate(d)} />
                        </PopoverContent>
                    </Popover>
                 </div>
                 <div className="space-y-2">
                    <Label htmlFor="party-name">Party Name:</Label>
                    <Popover open={isPartyPopoverOpen} onOpenChange={setIsPartyPopoverOpen}>
                        <PopoverTrigger asChild>
                           <Button variant="outline" role="combobox" className="w-full justify-between">
                                {party ? party.name : "Select a party..."}
                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="p-0 w-[--radix-popover-trigger-width]">
                            <Command>
                                <CommandInput
                                  placeholder="Search party..."
                                  value={partySearch}
                                  onValueChange={setPartySearch}
                                />
                                <CommandList>
                                <CommandEmpty>
                                     <Button
                                        variant="ghost"
                                        className="w-full justify-start"
                                        onClick={() => handleOpenPartyDialog(null, partySearch)}
                                    >
                                        <PlusCircle className="mr-2 h-4 w-4" /> Add "{partySearch}"
                                    </Button>
                                </CommandEmpty>
                                <CommandGroup>
                                    {allParties.map((c) => (
                                    <CommandItem key={c.id} value={c.name} onSelect={() => handlePartySelect(c.id)}>
                                        <Check className={cn("mr-2 h-4 w-4", party?.id === c.id ? "opacity-100" : "opacity-0")}/>
                                        {c.name}
                                    </CommandItem>
                                    ))}
                                </CommandGroup>
                                </CommandList>
                            </Command>
                        </PopoverContent>
                    </Popover>
                </div>
            </div>

            <div className="border rounded-lg p-4">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-[50px]"></TableHead>
                            <TableHead>Product</TableHead>
                            <TableHead className="w-[120px]">Quantity</TableHead>
                            <TableHead className="w-[150px]">Rate</TableHead>
                            <TableHead className="w-[150px] text-right">Amount</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {items.map((item, index) => (
                            <TableRow key={item.id}>
                                <TableCell>
                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleRemoveItem(index)}>
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </TableCell>
                                <TableCell>
                                    <Popover>
                                        <PopoverTrigger asChild>
                                           <Button variant="outline" role="combobox" className="w-full justify-between">
                                                {item.productName || "Select a product..."}
                                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="p-0 w-[--radix-popover-trigger-width]">
                                            <Command>
                                                <CommandInput placeholder="Search product..." />
                                                <CommandList>
                                                    <CommandEmpty>No products found.</CommandEmpty>
                                                    <CommandGroup>
                                                        {products.map(p => (
                                                            <CommandItem key={p.id} value={p.name} onSelect={() => handleItemChange(index, 'productName', p.name)}>
                                                                <Check className={cn("mr-2 h-4 w-4", item.productName === p.name ? "opacity-100" : "opacity-0")} />
                                                                {p.name}
                                                            </CommandItem>
                                                        ))}
                                                    </CommandGroup>
                                                </CommandList>
                                            </Command>
                                        </PopoverContent>
                                    </Popover>
                                </TableCell>
                                <TableCell>
                                    <Input type="number" value={item.quantity} onChange={(e) => handleItemChange(index, 'quantity', parseFloat(e.target.value) || 0)} />
                                </TableCell>
                                <TableCell>
                                    <Input type="number" value={item.rate} onChange={(e) => handleItemChange(index, 'rate', parseFloat(e.target.value) || 0)} />
                                </TableCell>
                                <TableCell className="text-right font-medium">
                                    {item.gross.toLocaleString(undefined, {minimumFractionDigits: 2})}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
                <Button variant="outline" size="sm" className="mt-4" onClick={handleAddItem}>
                    <Plus className="mr-2 h-4 w-4" /> Add Item
                </Button>
            </div>
            
             <div className="flex flex-col md:flex-row gap-6">
                <div className="flex-1 space-y-2">
                    <Label>Amount in Words</Label>
                     <div className="p-3 border rounded-md bg-muted min-h-[40px]">
                        <p className="font-semibold">{invoiceData.amountInWords}</p>
                    </div>
                </div>
                <div className="w-full md:w-80 space-y-2">
                     <div className="flex justify-between items-center text-sm">
                        <span className="text-muted-foreground">Gross Total</span>
                        <span className="font-medium">{invoiceData.grossTotal.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                        <span className="text-muted-foreground">VAT (13%)</span>
                        <span className="font-medium">{invoiceData.vatTotal.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                    </div>
                     <Separator />
                     <div className="flex justify-between items-center text-lg font-bold">
                        <span>Net Total</span>
                        <span>{invoiceData.netTotal.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                    </div>
                </div>
             </div>

            <div className="flex justify-end gap-2">
                 <Button variant="outline" onClick={() => setIsPreviewOpen(true)} disabled={!party || items.length === 0}><Printer className="mr-2 h-4 w-4" /> Preview & Print</Button>
                 <Button onClick={handleSaveInvoice} disabled={isSaving}>
                    {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                     Save Invoice
                 </Button>
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

            <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
                <DialogContent className="max-w-4xl">
                     <DialogHeader>
                        <DialogTitle>Invoice Preview</DialogTitle>
                        <DialogDescription>Review the invoice before printing or exporting.</DialogDescription>
                    </DialogHeader>
                    <div className="max-h-[70vh] overflow-auto p-4 bg-gray-100">
                         <div ref={printRef} className="w-[210mm] mx-auto bg-white">
                            <InvoiceView {...invoiceData} />
                         </div>
                    </div>
                    <DialogFooter className="sm:justify-end gap-2">
                        <Button variant="outline" onClick={() => handleExportJpg()} disabled={isExporting}>
                            {isExporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <ImageIcon className="mr-2 h-4 w-4"/>}
                             Export as JPG
                        </Button>
                        <Button variant="outline" onClick={() => handleExportPdf()} disabled={isExporting}>
                            {isExporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Save className="mr-2 h-4 w-4"/>}
                            Export as PDF
                        </Button>
                        <Button onClick={handlePrint}><Printer className="mr-2 h-4 w-4" /> Print</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
    

    


