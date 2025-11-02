
'use client';

import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, ChevronsUpDown, Check, PlusCircle, Printer, Save, Loader2, Trash2 } from 'lucide-react';
import { cn, toWords, generateNextVoucherNumber } from '@/lib/utils';
import { format, addDays } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { onPartiesUpdate, addParty } from '@/services/party-service';
import type { Party, PartyType, Cheque, ChequeSplit } from '@/lib/types';
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
import { addCheque, onChequesUpdate } from '@/services/cheque-service';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export function ChequeGeneratorForm() {
    const [paymentDate, setPaymentDate] = useState<Date>(new Date());
    const [invoiceDate, setInvoiceDate] = useState<Date | undefined>();
    const [invoiceNumber, setInvoiceNumber] = useState('');
    const [partyName, setPartyName] = useState('');
    
    const [invoiceAmount, setInvoiceAmount] = useState<number | ''>('');
    const [numberOfSplits, setNumberOfSplits] = useState<number>(1);
    
    const [chequeSplits, setChequeSplits] = useState<ChequeSplit[]>([{
        id: Date.now().toString(),
        chequeDate: new Date(),
        chequeNumber: '',
        amount: '',
        remarks: '',
        interval: 0,
    }]);

    const [parties, setParties] = useState<Party[]>([]);
    const [isSaving, setIsSaving] = useState(false);
    
    // Dialog States
    const [isPartyDialogOpen, setIsPartyDialogOpen] = useState(false);
    const [partyForm, setPartyForm] = useState<{ name: string, type: PartyType, address?: string; panNumber?: string; }>({ name: '', type: 'Vendor', address: '', panNumber: '' });
    const [partySearch, setPartySearch] = useState('');
    const [isPartyPopoverOpen, setIsPartyPopoverOpen] = useState(false);

    const { toast } = useToast();
    const { user } = useAuth();
    
    const [cheques, setCheques] = useState<Cheque[]>([]);
    const [voucherNo, setVoucherNo] = useState('');

    useEffect(() => {
        const unsubParties = onPartiesUpdate(setParties);
        const unsubCheques = onChequesUpdate(setCheques);
        return () => {
          unsubParties();
          unsubCheques();
        };
    }, []);
    
     useEffect(() => {
        const setNextVoucher = async () => {
             generateNextVoucherNumber(cheques, 'PDC-').then(setVoucherNo);
        };
        setNextVoucher();
    }, [cheques]);

    useEffect(() => {
        const totalAmount = Number(invoiceAmount) || 0;
        const numSplits = Math.max(1, numberOfSplits || 1);
        
        const newSplits: ChequeSplit[] = Array.from({ length: numSplits }, (_, i) => {
            const existingSplit = chequeSplits[i];
            const splitAmount = Math.floor(totalAmount / numSplits);
            const remainder = totalAmount % numSplits;
            
            let currentAmount: number | '' = '';
            if (totalAmount > 0) {
                currentAmount = splitAmount + (i < remainder ? 1 : 0);
            }

            return {
                id: existingSplit?.id || `${Date.now()}-${i}`,
                chequeDate: existingSplit?.chequeDate || paymentDate,
                chequeNumber: existingSplit?.chequeNumber || '',
                amount: currentAmount,
                remarks: existingSplit?.remarks || '',
                interval: existingSplit?.interval || 0,
            };
        });

        setChequeSplits(newSplits);
    }, [numberOfSplits, invoiceAmount, paymentDate]);


    const allParties = useMemo(() => parties.sort((a, b) => a.name.localeCompare(b.name)), [parties]);
    
    const totalSplitAmount = useMemo(() => {
        return chequeSplits.reduce((sum, split) => sum + (Number(split.amount) || 0), 0);
    }, [chequeSplits]);

    const remainingAmount = useMemo(() => {
        return (Number(invoiceAmount) || 0) - totalSplitAmount;
    }, [invoiceAmount, totalSplitAmount]);

    const amountInWords = useMemo(() => {
        const total = Number(invoiceAmount) || 0;
        if (total <= 0) return 'Zero Only.';
        return toWords(total);
    }, [invoiceAmount]);

    const handlePartySelect = (selectedPartyName: string) => {
        const party = allParties.find(c => c.name === selectedPartyName);
        setPartyName(party?.name || selectedPartyName);
        setIsPartyPopoverOpen(false);
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
            setPartyForm({name: '', type: 'Vendor', address: '', panNumber: ''});
        } catch {
            toast({title: 'Error', description: 'Failed to add party.', variant: 'destructive'});
        }
    };
    
    const resetForm = () => {
        setPaymentDate(new Date());
        setInvoiceDate(undefined);
        setInvoiceNumber('');
        setPartyName('');
        setInvoiceAmount('');
        setNumberOfSplits(1);
        setChequeSplits([{ id: Date.now().toString(), chequeDate: new Date(), chequeNumber: '', amount: '', remarks: '', interval: 0 }]);
    };

    const handleSave = async () => {
        if (!user || !partyName || !invoiceAmount || Number(invoiceAmount) <= 0) {
            toast({ title: 'Error', description: 'Party Name and a valid invoice amount are required.', variant: 'destructive'});
            return;
        }
        if (remainingAmount !== 0) {
            toast({ title: 'Error', description: 'Total of splits must equal the Invoice Amount.', variant: 'destructive'});
            return;
        }
        setIsSaving(true);
        try {
            const chequeData: Omit<Cheque, 'id' | 'createdAt'> = {
                paymentDate: paymentDate.toISOString(),
                voucherNo: voucherNo,
                invoiceDate: invoiceDate?.toISOString(),
                invoiceNumber,
                partyName,
                payeeName: partyName,
                amount: Number(invoiceAmount),
                amountInWords,
                splits: chequeSplits.map(s => ({
                    ...s,
                    chequeDate: s.chequeDate.toISOString(),
                    amount: Number(s.amount) || 0,
                })),
                createdBy: user.username,
            };
            await addCheque(chequeData);
            toast({ title: 'Success', description: 'Cheque record saved.' });
            resetForm();
        } catch (error) {
            toast({ title: 'Error', description: 'Failed to save cheque record.', variant: 'destructive' });
        } finally {
            setIsSaving(false);
        }
    };
    
    const handlePrint = () => {
        if (!partyName || totalSplitAmount <= 0) {
            toast({ title: 'Error', description: 'Please fill in party and cheque details.', variant: 'destructive'});
            return;
        }
        console.log({
            invoiceDate: invoiceDate ? format(invoiceDate, 'yyyy-MM-dd') : 'N/A',
            invoiceNumber,
            payee: partyName,
            totalAmount: totalSplitAmount,
            amountInWords: amountInWords,
            cheques: chequeSplits
        });
        toast({ title: 'Printing...', description: 'Cheque print dialog would appear here.' });
    };

    const handleSplitChange = (index: number, field: keyof ChequeSplit, value: any) => {
        const newSplits = [...chequeSplits];
        (newSplits[index] as any)[field] = value;
        
        if(field === 'interval') {
            const intervalDays = Number(value) || 0;
            newSplits[index].chequeDate = addDays(paymentDate, intervalDays);
        }

        setChequeSplits(newSplits);
    };

    return (
        <div className="space-y-6">
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-end">
                 <div className="space-y-2">
                    <Label htmlFor="voucherNo">Auto Cheque Numbering</Label>
                    <Input id="voucherNo" value={voucherNo} readOnly className="bg-muted/50" />
                 </div>
                 <div className="space-y-2">
                    <Label htmlFor="paymentDate">Date:</Label>
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button id="paymentDate" variant="outline" className="w-full justify-start text-left font-normal">
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {paymentDate ? format(paymentDate, 'PPP') : <span>Pick a date</span>}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                            <DualCalendar selected={paymentDate} onSelect={(d) => d && setPaymentDate(d)} />
                        </PopoverContent>
                    </Popover>
                 </div>
                  <div className="space-y-2">
                    <Label htmlFor="invoiceDate">Invoice Date:</Label>
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button id="invoiceDate" variant="outline" className="w-full justify-start text-left font-normal">
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {invoiceDate ? format(invoiceDate, 'PPP') : <span>Pick a date</span>}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                            <DualCalendar selected={invoiceDate} onSelect={(d) => d && setInvoiceDate(d)} />
                        </PopoverContent>
                    </Popover>
                 </div>
                 <div className="space-y-2">
                    <Label htmlFor="invoiceNumber">Invoice Number:</Label>
                    <Input id="invoiceNumber" value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} />
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
                                    {allParties.map((c) => (
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
                    <Label htmlFor="invoiceAmount">Invoice Amount (NPR)</Label>
                    <Input id="invoiceAmount" type="number" value={invoiceAmount} onChange={(e) => setInvoiceAmount(e.target.value === '' ? '' : parseFloat(e.target.value))} />
                 </div>
                 <div className="space-y-2">
                    <Label htmlFor="numberOfSplits">Number of Cheque Splits</Label>
                    <Input id="numberOfSplits" type="number" min="1" value={numberOfSplits} onChange={(e) => setNumberOfSplits(Math.max(1, parseInt(e.target.value, 10) || 1))} />
                 </div>
            </div>

            <div className="border rounded-lg p-4 space-y-4">
                <div className="flex justify-between items-center">
                    <Label className="text-lg font-medium">Cheque Details</Label>
                </div>
                 <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-[120px]">Interval (Days)</TableHead>
                            <TableHead className="w-[200px]">Cheque Date</TableHead>
                            <TableHead>Cheque Number</TableHead>
                            <TableHead>Amount (NPR)</TableHead>
                            <TableHead>Remarks</TableHead>
                            <TableHead className="w-[50px]"></TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {chequeSplits.map((split, index) => (
                            <TableRow key={split.id}>
                                <TableCell>
                                    <Input type="number" value={split.interval} onChange={(e) => handleSplitChange(index, 'interval', e.target.value)} />
                                </TableCell>
                                <TableCell>
                                    <Popover>
                                        <PopoverTrigger asChild>
                                            <Button variant="outline" className="w-full justify-start text-left font-normal">
                                                <CalendarIcon className="mr-2 h-4 w-4" />
                                                {split.chequeDate ? format(split.chequeDate, 'PPP') : <span>Pick a date</span>}
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-auto p-0">
                                            <DualCalendar selected={split.chequeDate} onSelect={(d) => d && handleSplitChange(index, 'chequeDate', d)} />
                                        </PopoverContent>
                                    </Popover>
                                </TableCell>
                                <TableCell>
                                    <Input value={split.chequeNumber} onChange={(e) => handleSplitChange(index, 'chequeNumber', e.target.value)} />
                                </TableCell>
                                <TableCell>
                                    <Input type="number" value={split.amount} onChange={(e) => handleSplitChange(index, 'amount', e.target.value)} />
                                </TableCell>
                                <TableCell>
                                    <Input value={split.remarks} onChange={(e) => handleSplitChange(index, 'remarks', e.target.value)} />
                                </TableCell>
                                <TableCell>
                                    {/* Remove button could be added back if needed */}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
            
            <div className="border rounded-lg p-4 space-y-4">
                 <div className="flex justify-between items-center text-sm">
                    <Label>Total Invoice Amount (NPR)</Label>
                    <span className="font-bold text-lg">{Number(invoiceAmount || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                    <Label>Total Split Amount (NPR)</Label>
                    <span className="font-bold text-lg">{totalSplitAmount.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                </div>
                <div className={cn("flex justify-between items-center text-sm font-bold", remainingAmount === 0 ? 'text-green-600' : 'text-red-600')}>
                    <Label>Remaining Amount</Label>
                    <span className="text-lg">{remainingAmount.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                </div>
                <div className="space-y-2">
                    <Label>Amount in Words (for Total Invoice Amount)</Label>
                    <div className="p-3 border rounded-md bg-muted min-h-[40px]">
                        <p className="font-semibold">{amountInWords}</p>
                    </div>
                </div>
            </div>
            
            <div className="flex justify-end gap-2">
                 <Button onClick={handleSave} variant="outline" disabled={isSaving}>
                    {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    Save Cheque
                </Button>
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
