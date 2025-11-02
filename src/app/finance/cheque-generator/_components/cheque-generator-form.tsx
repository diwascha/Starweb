
'use client';

import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, ChevronsUpDown, Check, PlusCircle, Printer } from 'lucide-react';
import { cn, toWords } from '@/lib/utils';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { onPartiesUpdate, addParty } from '@/services/party-service';
import type { Party, PartyType } from '@/lib/types';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { DualCalendar } from '@/components/ui/dual-calendar';
import { useAuth } from '@/hooks/use-auth';
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

export function ChequeGeneratorForm() {
    const [date, setDate] = useState<Date>(new Date());
    const [partyName, setPartyName] = useState('');
    const [payeeName, setPayeeName] = useState('');
    const [amount, setAmount] = useState<number | ''>('');
    
    const [parties, setParties] = useState<Party[]>([]);
    
    // Dialog States
    const [isPartyDialogOpen, setIsPartyDialogOpen] = useState(false);
    const [partyForm, setPartyForm] = useState<{ name: string, type: PartyType, address?: string; panNumber?: string; }>({ name: '', type: 'Vendor', address: '', panNumber: '' });
    const [partySearch, setPartySearch] = useState('');
    const [isPartyPopoverOpen, setIsPartyPopoverOpen] = useState(false);


    const { toast } = useToast();
    const { user } = useAuth();

    useEffect(() => {
        const unsubParties = onPartiesUpdate(setParties);
        return () => unsubParties();
    }, []);

    const sortedParties = useMemo(() => parties.sort((a, b) => a.name.localeCompare(b.name)), [parties]);

    const handlePartySelect = (selectedPartyName: string) => {
        const party = sortedParties.find(c => c.name === selectedPartyName);
        setPartyName(party?.name || selectedPartyName);
        setPayeeName(party?.name || selectedPartyName); // Default payee name to party name
        setIsPartyPopoverOpen(false);
    };
    
    const amountInWords = useMemo(() => {
        if (amount === '' || amount <= 0) return 'Zero Only.';
        return toWords(amount);
    }, [amount]);

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
            setPartyForm({name: '', type: 'Vendor', address: '', panNumber: ''});
        } catch {
            toast({title: 'Error', description: 'Failed to add party.', variant: 'destructive'});
        }
    };
    
    const handlePrint = () => {
        if (!payeeName || !amount) {
            toast({ title: 'Error', description: 'Please fill in payee and amount.', variant: 'destructive'});
            return;
        }
        // This would ideally open a print dialog for a formatted cheque.
        // For now, we'll just log it.
        console.log({
            date: format(date, 'yyyy-MM-dd'),
            payee: payeeName,
            amount: amount,
            amountInWords: amountInWords
        });
        toast({ title: 'Printing...', description: 'Cheque print dialog would appear here.' });
    };

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
                    <Popover open={isPartyPopoverOpen} onOpenChange={setIsPartyPopoverOpen}>
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
                                            setPartyForm(prev => ({ ...prev, name: partySearch, type: 'Vendor' }));
                                            setIsPartyPopoverOpen(false);
                                            setIsPartyDialogOpen(true);
                                        }}
                                    >
                                        <PlusCircle className="mr-2 h-4 w-4" /> Add "{partySearch}"
                                    </Button>
                                </CommandEmpty>
                                <CommandGroup>
                                    {sortedParties.map((c) => (
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
                    <Label htmlFor="payee-name">Payee Name (as on cheque):</Label>
                    <Input id="payee-name" value={payeeName} onChange={(e) => setPayeeName(e.target.value)} />
                </div>
            </div>

            <div className="border rounded-lg p-4 space-y-4">
                 <div className="space-y-2">
                    <Label htmlFor="amount">Amount (NPR)</Label>
                    <Input id="amount" type="number" placeholder="e.g. 25000" value={amount} onChange={(e) => setAmount(e.target.value === '' ? '' : parseFloat(e.target.value))} />
                </div>
                <div className="space-y-2">
                    <Label>Amount in Words</Label>
                    <div className="p-3 border rounded-md bg-muted min-h-[40px]">
                        <p className="font-semibold">{amountInWords}</p>
                    </div>
                </div>
            </div>
            
            <div className="flex justify-end">
                <Button onClick={handlePrint}>
                    <Printer className="mr-2 h-4 w-4" /> Print Cheque
                </Button>
            </div>
            
             <Dialog open={isPartyDialogOpen} onOpenChange={setIsPartyDialogOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Add New Party</DialogTitle>
                         <DialogDescription>
                            Create a new vendor/supplier record.
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
                        <Button onClick={handleSubmitParty}>Add Party</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
