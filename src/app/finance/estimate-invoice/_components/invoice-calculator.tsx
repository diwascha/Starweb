
'use client';

import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, ChevronsUpDown, Check, Plus, Trash2, Save, PlusCircle } from 'lucide-react';
import { cn, toWords } from '@/lib/utils';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { onProductsUpdate } from '@/services/product-service';
import { onPartiesUpdate, addParty } from '@/services/party-service';
import { getEstimatedInvoices, addEstimatedInvoice } from '@/services/estimate-invoice-service';
import type { Product, Party, EstimatedInvoice, PartyType } from '@/lib/types';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { DualCalendar } from '@/components/ui/dual-calendar';
import { useAuth } from '@/hooks/use-auth';
import { useRouter } from 'next/navigation';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface InvoiceItem {
    id: string;
    productName: string;
    quantity: number;
    rate: number;
    gross: number;
}

export function InvoiceCalculator() {
    const [invoiceNumber, setInvoiceNumber] = useState('');
    const [date, setDate] = useState<Date>(new Date());
    const [partyName, setPartyName] = useState('');
    const [panNumber, setPanNumber] = useState('');
    const [items, setItems] = useState<InvoiceItem[]>([]);

    const [products, setProducts] = useState<Product[]>([]);
    const [parties, setParties] = useState<Party[]>([]);
    
    // Dialog States
    const [isPartyDialogOpen, setIsPartyDialogOpen] = useState(false);
    const [partyForm, setPartyForm] = useState<{ name: string, type: PartyType, address?: string; panNumber?: string; }>({ name: '', type: 'Customer', address: '', panNumber: '' });
    const [partySearch, setPartySearch] = useState('');

    const { toast } = useToast();
    const { user } = useAuth();
    const router = useRouter();

    useEffect(() => {
        const unsubProducts = onProductsUpdate(setProducts);
        const unsubParties = onPartiesUpdate(setParties);
        
        getEstimatedInvoices().then(invoices => {
            const lastInvNum = invoices[0]?.invoiceNumber;
            const nextInvNum = lastInvNum ? String(parseInt(lastInvNum, 10) + 1).padStart(3, '0') : "001";
            setInvoiceNumber(nextInvNum);
        });

        return () => {
            unsubProducts();
            unsubParties();
        };
    }, []);

    const customers = useMemo(() => parties.filter(p => p.type === 'Customer' || p.type === 'Both'), [parties]);

    const handlePartySelect = (selectedPartyName: string) => {
        const party = customers.find(c => c.name === selectedPartyName);
        setPartyName(party?.name || selectedPartyName);
        setPanNumber(party?.panNumber || '');
        setPartySearch('');
    };

    const addNewRow = () => {
        setItems(prev => [...prev, { id: Date.now().toString(), productName: '', quantity: 0, rate: 0, gross: 0 }]);
    };
    
    const removeRow = (id: string) => {
        setItems(prev => prev.filter(item => item.id !== id));
    };

    const handleItemChange = (id: string, field: keyof InvoiceItem, value: string | number) => {
        setItems(prev => prev.map(item => {
            if (item.id === id) {
                const updatedItem = { ...item, [field]: value };
                if (field === 'quantity' || field === 'rate') {
                    updatedItem.gross = updatedItem.quantity * updatedItem.rate;
                }
                if (field === 'productName') {
                    const product = products.find(p => p.name === value);
                    // This is tricky, a product doesn't have a single "rate".
                    // Let's leave rate manual for now.
                }
                return updatedItem;
            }
            return item;
        }));
    };
    
    const { totalQty, grossTotal, vatTotal, netTotal, amountInWords } = useMemo(() => {
        const qty = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
        const gross = items.reduce((sum, item) => sum + Number(item.gross || 0), 0);
        const vat = gross * 0.13;
        const net = gross + vat;
        const words = toWords(net);
        return { totalQty: qty, grossTotal: gross, vatTotal: vat, netTotal: net, amountInWords: words };
    }, [items]);

    const handleSave = async () => {
        if (!user) {
            toast({ title: 'Error', description: 'You must be logged in to save.', variant: 'destructive'});
            return;
        }
        if (!partyName || items.length === 0 || items.some(i => !i.productName || !i.quantity || !i.rate)) {
             toast({ title: 'Error', description: 'Please fill in party name and all item details.', variant: 'destructive'});
            return;
        }

        const invoiceData: Omit<EstimatedInvoice, 'id' | 'createdAt'> = {
            invoiceNumber,
            date: date.toISOString(),
            partyName,
            panNumber,
            items,
            grossTotal,
            vatTotal,
            netTotal,
            amountInWords,
            createdBy: user.username,
        };

        try {
            await addEstimatedInvoice(invoiceData);
            toast({ title: 'Success', description: 'Invoice saved successfully.' });
            
            getEstimatedInvoices().then(invoices => {
                 const lastInvNum = invoices[0]?.invoiceNumber;
                 const nextInvNum = lastInvNum ? String(parseInt(lastInvNum, 10) + 1).padStart(3, '0') : "001";
                 setInvoiceNumber(nextInvNum);
            });
            
            setPartyName('');
            setPanNumber('');
            setItems([]);

        } catch (error) {
            console.error(error);
            toast({ title: 'Error', description: 'Failed to save invoice.', variant: 'destructive'});
        }
    };
    
    const handleSubmitParty = async () => {
        if(!user) return;
        if(!partyForm.name || !partyForm.type) {
            toast({title: 'Error', description: 'Party name and type are required.', variant: 'destructive'});
            return;
        }
        try {
            await addParty({...partyForm, createdBy: user.username});
            handlePartySelect(partyForm.name);
            toast({title: 'Success', description: 'New party added.'});
            setIsPartyDialogOpen(false);
            setPartyForm({name: '', type: 'Customer', address: '', panNumber: ''});
        } catch {
            toast({title: 'Error', description: 'Failed to add party.', variant: 'destructive'});
        }
    };


    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
                <div className="space-y-2">
                    <Label htmlFor="invoice-number">Invoice No:</Label>
                    <Input id="invoice-number" value={invoiceNumber} readOnly className="bg-muted/50" />
                </div>
                 <div className="space-y-2">
                    <Label htmlFor="date">Date:</Label>
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button variant="outline" className="w-full justify-start text-left font-normal">
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {date ? format(date, 'PPP') : <span>Pick a date</span>}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                            <DualCalendar selected={date} onSelect={(d) => d && setDate(d)} />
                        </PopoverContent>
                    </Popover>
                 </div>
                 <div className="space-y-2">
                    <Label htmlFor="party-name">Party Name:</Label>
                    <Popover>
                        <PopoverTrigger asChild>
                           <Button variant="outline" role="combobox" className="w-full justify-between">
                                {partyName || "Select a party..."}
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
                                        onClick={() => {
                                            setPartyForm(prev => ({ ...prev, name: partySearch }));
                                            setIsPartyDialogOpen(true);
                                        }}
                                    >
                                        <PlusCircle className="mr-2 h-4 w-4" /> Add "{partySearch}"
                                    </Button>
                                </CommandEmpty>
                                <CommandGroup>
                                    {customers.map((c) => (
                                    <CommandItem key={c.id} value={c.name} onSelect={() => handlePartySelect(c.name)}>
                                        <Check className={cn("mr-2 h-4 w-4", partyName === c.name ? "opacity-100" : "opacity-0")}/>
                                        {c.name}
                                    </CommandItem>
                                    ))}
                                </CommandGroup>
                                </CommandList>
                            </Command>
                        </PopoverContent>
                    </Popover>
                </div>
                 <div className="space-y-2">
                    <Label htmlFor="pan-number">PAN Number:</Label>
                    <Input id="pan-number" value={panNumber} onChange={(e) => setPanNumber(e.target.value)} />
                </div>
            </div>

            <div className="border rounded-lg p-4">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-semibold">Products</h3>
                     <Button type="button" onClick={addNewRow} size="sm">
                        <Plus className="mr-2 h-4 w-4" /> Add Row
                    </Button>
                </div>
                 <Table>
                    <TableHeader><TableRow>
                        <TableHead>S.N.</TableHead>
                        <TableHead>Product Name</TableHead>
                        <TableHead>Qty</TableHead>
                        <TableHead>Rate</TableHead>
                        <TableHead>Gross</TableHead>
                        <TableHead></TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                        {items.map((item, index) => (
                            <TableRow key={item.id}>
                                <TableCell>{index + 1}</TableCell>
                                <TableCell>
                                    <Popover>
                                        <PopoverTrigger asChild>
                                            <Button variant="outline" role="combobox" className="w-[300px] justify-between">
                                                {item.productName || "Select a product..."}
                                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="p-0 w-[--radix-popover-trigger-width]">
                                            <Command>
                                                <CommandInput placeholder="Search product..." />
                                                <CommandList>
                                                <CommandEmpty>No product found.</CommandEmpty>
                                                <CommandGroup>
                                                    {products.map((p) => (
                                                    <CommandItem key={p.id} value={p.name} onSelect={() => handleItemChange(item.id, 'productName', p.name)}>
                                                        <Check className={cn("mr-2 h-4 w-4", item.productName === p.name ? "opacity-100" : "opacity-0")}/>
                                                        {p.name}
                                                    </CommandItem>
                                                    ))}
                                                </CommandGroup>
                                                </CommandList>
                                            </Command>
                                        </PopoverContent>
                                    </Popover>
                                </TableCell>
                                <TableCell><Input type="number" value={item.quantity} onChange={e => handleItemChange(item.id, 'quantity', parseFloat(e.target.value) || 0)} className="w-24"/></TableCell>
                                <TableCell><Input type="number" value={item.rate} onChange={e => handleItemChange(item.id, 'rate', parseFloat(e.target.value) || 0)} className="w-24"/></TableCell>
                                <TableCell>{item.gross.toFixed(2)}</TableCell>
                                <TableCell><Button variant="ghost" size="icon" onClick={() => removeRow(item.id)}><Trash2 className="h-4 w-4 text-destructive"/></Button></TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                    <Label>Total Quantity: {totalQty}</Label>
                    <div className="p-4 border rounded-md bg-muted">
                        <p className="font-semibold text-lg">{amountInWords}</p>
                    </div>
                </div>
                <div className="space-y-2 border rounded-lg p-4">
                    <div className="flex justify-between"><span>Gross Total:</span><span>{grossTotal.toFixed(2)}</span></div>
                    <div className="flex justify-between"><span>VAT (13%):</span><span>{vatTotal.toFixed(2)}</span></div>
                    <div className="flex justify-between font-bold text-lg border-t pt-2 mt-2"><span>Net Total:</span><span>{netTotal.toFixed(2)}</span></div>
                </div>
            </div>

            <div className="flex justify-end gap-2">
                <Button onClick={handleSave}>
                    <Save className="mr-2 h-4 w-4" /> Save Invoice
                </Button>
            </div>
            
             <Dialog open={isPartyDialogOpen} onOpenChange={setIsPartyDialogOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Add New Party</DialogTitle>
                         <DialogDescription>
                            Create a new customer record. This will be available across the app.
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
                                    <SelectItem value="Customer">Customer</SelectItem>
                                    <SelectItem value="Vendor">Vendor</SelectItem>
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
                        <Button onClick={handleSubmitParty}>Add Party</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

    

    