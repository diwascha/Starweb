
'use client';
import { useState, useEffect, useMemo, useCallback } from 'react';
import type { Party, PartyType, Product, ProductSpecification, EstimateInvoice, EstimateInvoiceItem } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, ChevronsUpDown, Check, PlusCircle, Trash2, Printer, Save, FileText, Loader2, Plus, Edit } from 'lucide-react';
import { cn, toWords, toNepaliDate } from '@/lib/utils';
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
import { addEstimatedInvoice } from '@/services/estimate-invoice-service';
import { useRouter } from 'next/navigation';

export function InvoiceCalculator() {
    const [date, setDate] = useState<Date>(new Date());
    const [party, setParty] = useState<Party | null>(null);
    const [invoiceNumber, setInvoiceNumber] = useState('');
    const [items, setItems] = useState<EstimateInvoiceItem[]>([]);
    
    const [parties, setParties] = useState<Party[]>([]);
    const [products, setProducts] = useState<Product[]>([]);

    const { toast } = useToast();
    const { user } = useAuth();
    const router = useRouter();

    const [isPartyDialogOpen, setIsPartyDialogOpen] = useState(false);
    const [partyForm, setPartyForm] = useState<{ name: string, type: PartyType, address?: string; panNumber?: string; }>({ name: '', type: 'Customer', address: '', panNumber: '' });
    const [editingParty, setEditingParty] = useState<Party | null>(null);
    const [partySearch, setPartySearch] = useState('');

    useEffect(() => {
        const unsubParties = onPartiesUpdate(setParties);
        const unsubProducts = onProductsUpdate(setProducts);
        return () => {
            unsubParties();
            unsubProducts();
        }
    }, []);
    
    const customers = useMemo(() => parties.filter(p => p.type === 'Customer' || p.type === 'Both'), [parties]);
    
    const handlePartySelect = (selectedPartyId: string) => {
        const selected = customers.find(c => c.id === selectedPartyId);
        setParty(selected || null);
        setPartySearch('');
    };

    const handleOpenPartyDialog = (partyToEdit: Party | null = null, searchName: string = '') => {
        if (partyToEdit) {
            setEditingParty(partyToEdit);
            setPartyForm({ name: partyToEdit.name, type: partyToEdit.type, address: partyToEdit.address, panNumber: partyToEdit.panNumber });
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
                handlePartySelect(newPartyId);
                toast({ title: 'Success', description: 'New party added.' });
            }
            setIsPartyDialogOpen(false);
        } catch {
            toast({ title: 'Error', description: 'Failed to save party.', variant: 'destructive' });
        }
    };
    
    // ... rest of the component
    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-end">
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
                                {party?.name || "Select a party..."}
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
                                    {customers.map((c) => (
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
        </div>
    );
}

    