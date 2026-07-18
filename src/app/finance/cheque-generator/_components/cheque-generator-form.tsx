'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, ChevronsUpDown, Check, PlusCircle, Printer, Save, Loader2, Trash2, Plus, Image as ImageIcon } from 'lucide-react';
import { cn, toWords, generateNextVoucherNumber, toNepaliDate, generateId } from '@/lib/utils';
import { format, addDays, parseISO } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { onPartiesUpdate, addParty, updateParty } from '@/services/party-service';
import type { Party, PartyType, Cheque, ChequeSplit, ChequeStatus, Account, BankAccountType, AccountOwnership, PartialPayment } from '@/lib/types';
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
import { addCheque, onChequesUpdate, updateCheque } from '@/services/cheque-service';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ChequeView } from './cheque-view';
import { onAccountsUpdate, addAccount as addAccountService } from '@/services/account-service';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import html2canvas from 'html2canvas';

interface ChequeGeneratorFormProps {
    chequeToEdit?: Cheque | null;
    onSaveSuccess: () => void;
}


export function ChequeGeneratorForm({ chequeToEdit, onSaveSuccess }: ChequeGeneratorFormProps) {
    const [paymentDate, setPaymentDate] = useState<Date>(new Date());
    const [invoiceDate, setInvoiceDate] = useState<Date | undefined>();
    const [invoiceNumber, setInvoiceNumber] = useState('');
    const [partyName, setPartyName] = useState('');
    const [partyOwnership, setPartyOwnership] = useState<string>('Both');
    
    const [invoiceAmount, setInvoiceAmount] = useState<number | ''>('');
    const [numberOfSplits, setNumberOfSplits] = useState<number>(1);
    
    const [chequeSplits, setChequeSplits] = useState<ChequeSplit[]>([]);

    const [parties, setParties] = useState<Party[]>([]);
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [selectedAccountId, setSelectedAccountId] = useState<string | undefined>();
    const [isSaving, setIsSaving] = useState(false);
    
    // Dialog States
    const [isPartyDialogOpen, setIsPartyDialogOpen] = useState(false);
    const [editingParty, setEditingParty] = useState<Party | null>(null);
    const [isAccountDialogOpen, setIsAccountDialogOpen] = useState(false);
    const [partyForm, setPartyForm] = useState<{ name: string, type: PartyType, ownership: AccountOwnership, address?: string; panNumber?: string; }>({ name: '', type: 'Vendor', ownership: '', address: '', panNumber: '' });
    const [accountForm, setAccountForm] = useState({ name: '', type: 'Bank' as 'Cash' | 'Bank', ownership: '' as AccountOwnership, accountNumber: '', bankName: '', branch: '', bankAccountType: 'Saving' as BankAccountType });
    const [partySearch, setPartySearch] = useState('');
    const [isPartyPopoverOpen, setIsPartyPopoverOpen] = useState(false);

    const { toast } = useToast();
    const { user, getAllowedOwnerships } = useAuth();
    const allowedOwnerships = useMemo(() => getAllowedOwnerships('finance'), [getAllowedOwnerships]);
    
    const [cheques, setCheques] = useState<any[]>([]);
    const [voucherNo, setVoucherNo] = useState('');

    const printRef = useRef<HTMLDivElement>(null);
    const [isPreviewOpen, setIsPreviewOpen] = useState(false);
    const [isExporting, setIsExporting] = useState(false);

    useEffect(() => {
        const unsubParties = onPartiesUpdate(setParties);
        const unsubCheques = onChequesUpdate(setCheques);
        const unsubAccounts = onAccountsUpdate(setAccounts);
        
        if (!chequeToEdit) {
            setChequeSplits([{
                id: generateId(),
                chequeDate: new Date(),
                chequeNumber: '',
                amount: '',
                remarks: '',
                interval: 0,
                status: 'Due',
                partialPayments: [],
            }]);
        }

        return () => {
          unsubParties();
          unsubCheques();
          unsubAccounts();
        };
    }, []);
    
     useEffect(() => {
        if (chequeToEdit) {
            setVoucherNo(chequeToEdit.voucherNo);
            setPaymentDate(new Date(chequeToEdit.paymentDate));
            setInvoiceDate(chequeToEdit.invoiceDate ? new Date(chequeToEdit.invoiceDate) : undefined);
            setInvoiceNumber(chequeToEdit.invoiceNumber || '');
            setPartyName(chequeToEdit.partyName);
            setPartyOwnership(chequeToEdit.ownership || 'Both');
            setInvoiceAmount(chequeToEdit.amount);
            setNumberOfSplits(chequeToEdit.splits.length);
            setSelectedAccountId(chequeToEdit.accountId);
            setChequeSplits(chequeToEdit.splits.map(s => {
                const splitDate = new Date(s.chequeDate);
                const baseDate = chequeToEdit.invoiceDate ? new Date(chequeToEdit.invoiceDate) : new Date(chequeToEdit.paymentDate);
                const interval = Math.round((splitDate.getTime() - baseDate.getTime()) / (1000 * 3600 * 24));
                return {
                    id: s.id || generateId(),
                    chequeDate: splitDate,
                    chequeNumber: s.chequeNumber,
                    amount: s.amount === 0 ? '' : s.amount,
                    remarks: s.remarks,
                    interval: interval >= 0 ? interval : 0,
                    status: s.status || 'Due',
                    partialPayments: s.partialPayments || [],
                    cancellationReason: s.cancellationReason || '',
                } as ChequeSplit;
            }));
        } else {
            const setNextVoucher = async () => {
                 generateNextVoucherNumber(cheques, 'PDC-').then(setVoucherNo);
            };
            setNextVoucher();
        }
    }, [chequeToEdit, cheques]);

    useEffect(() => {
        const totalAmount = Number(invoiceAmount) || 0;
        const numSplits = Math.max(1, numberOfSplits || 1);
        const baseDate = invoiceDate || paymentDate;

        const newSplits: ChequeSplit[] = Array.from({ length: numSplits }, (_, i) => {
            const existingSplit = chequeSplits[i] || {};
            
            const splitAmount = totalAmount > 0 ? Math.floor(totalAmount / numSplits) : '';
            const remainder = totalAmount > 0 ? totalAmount % numSplits : 0;
            const currentAmount = totalAmount > 0 ? (Number(splitAmount) + (i < remainder ? 1 : 0)) : '';
            
            const intervalDays = existingSplit.interval || 0;
            const chequeDate = addDays(baseDate, intervalDays);

            return {
                id: (existingSplit as any).id || `${Date.now()}-${i}`,
                chequeDate: chequeDate,
                chequeNumber: existingSplit.chequeNumber || '',
                amount: currentAmount as number | "",
                remarks: existingSplit.remarks || '',
                interval: intervalDays,
                status: 'Due' as ChequeStatus,
                partialPayments: (existingSplit as any).partialPayments || [],
            };
        });
        setChequeSplits(newSplits);
    }, [numberOfSplits, invoiceAmount, paymentDate, invoiceDate]);

    // Centralized filtering
    const filteredParties = useMemo(() => {
        return parties
            .filter(p => p.ownership === 'Both' || allowedOwnerships.includes(p.ownership))
            .sort((a, b) => a.name.localeCompare(b.name));
    }, [parties, allowedOwnerships]);

    const bankAccounts = useMemo(() => {
        return accounts.filter(a => a.type === 'Bank' && (a.ownership === 'Both' || allowedOwnerships.includes(a.ownership)));
    }, [accounts, allowedOwnerships]);
    
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
        const party = filteredParties.find(c => c.name === selectedPartyName);
        setPartyName(party?.name || selectedPartyName);
        setPartyOwnership(party?.ownership || 'Both');
        setIsPartyPopoverOpen(false);
    };

    const handleOpenPartyDialog = (party: Party | null = null, searchName: string = '') => {
        if (party) {
            setEditingParty(party);
            setPartyForm({ 
                name: party.name, 
                type: party.type, 
                ownership: party.ownership || '', 
                address: party.address || '', 
                panNumber: party.panNumber || '' 
            });
        } else {
            setEditingParty(null);
            setPartyForm({ 
                name: searchName, 
                type: 'Vendor', 
                ownership: allowedOwnerships.includes('Shivam') ? 'Shivam' : (allowedOwnerships[0] || 'Both'), 
                address: '', 
                panNumber: '' 
            });
        }
        setIsPartyPopoverOpen(false);
        setIsPartyDialogOpen(true);
    };
    
    const handleSubmitParty = async () => {
        if(!user) return;
        if(!partyForm.name || !partyForm.type || !partyForm.ownership) {
            toast({title: 'Error', description: 'Name, Type, and Ownership are mandatory.', variant: 'destructive'});
            return;
        }
        try {
            if (editingParty) {
                await updateParty(editingParty.id, { ...partyForm, lastModifiedBy: user.username });
                toast({title: 'Success', description: 'Party updated.'});
                handlePartySelect(partyForm.name);
            } else {
                const newId = await addParty({...partyForm, createdBy: user.username });
                handlePartySelect(partyForm.name);
                toast({title: 'Success', description: 'New party added.'});
            }
            setIsPartyDialogOpen(false);
            setPartyForm({name: '', type: 'Vendor', ownership: '', address: '', panNumber: ''});
            setEditingParty(null);
        } catch {
            toast({title: 'Error', description: 'Failed to save party.', variant: 'destructive'});
        }
    };
    
    const handleAccountSubmit = async () => {
        if (!user) return;
        if (!accountForm.name || !accountForm.bankName || !accountForm.accountNumber || !accountForm.ownership) {
            toast({ title: 'Error', description: 'All mandatory fields are required.', variant: 'destructive' });
            return;
        }
        try {
            const newAccountId = await addAccountService({
                ...accountForm,
                type: 'Bank',
                createdBy: user.username,
                createdAt: new Date().toISOString(),
            });
            setSelectedAccountId(newAccountId);
            toast({ title: 'Success', description: 'New bank account added.' });
            setIsAccountDialogOpen(false);
        } catch {
            toast({ title: 'Error', description: 'Failed to add bank account.', variant: 'destructive' });
        }
    };


    const resetForm = () => {
        setPaymentDate(new Date());
        setInvoiceDate(undefined);
        setInvoiceNumber('');
        setPartyName('');
        setPartyOwnership('Both');
        setInvoiceAmount('');
        setNumberOfSplits(1);
        setSelectedAccountId(undefined);
        setChequeSplits([{ id: generateId(), chequeDate: new Date(), chequeNumber: '', amount: '', remarks: '', interval: 0, status: 'Due', partialPayments: [] }]);
        onSaveSuccess();
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
                accountId: selectedAccountId,
                ownership: partyOwnership,
                splits: chequeSplits.map(s => ({
                    id: s.id,
                    chequeDate: s.chequeDate.toISOString(),
                    chequeNumber: s.chequeNumber,
                    amount: Number(s.amount) || 0,
                    remarks: s.remarks,
                    status: s.status,
                    partialPayments: (s as any).partialPayments || [],
                    cancellationReason: (s as any).cancellationReason || '',
                })),
                createdBy: chequeToEdit?.createdBy || user.username,
            };

            if (chequeToEdit) {
                await updateCheque(chequeToEdit.id, {...chequeData});
                toast({ title: 'Success', description: 'Cheque record updated.' });
            } else {
                await addCheque(chequeData);
                toast({ title: 'Success', description: 'Cheque record saved.' });
            }
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
        setIsPreviewOpen(true);
    };

    const handleSplitChange = (index: number, field: keyof ChequeSplit, value: any) => {
        const newSplits = [...chequeSplits];
        (newSplits[index] as any)[field] = value;
        
        if(field === 'interval') {
            const intervalDays = Number(value) || 0;
            const baseDate = invoiceDate || paymentDate;
            newSplits[index].chequeDate = addDays(baseDate, intervalDays);
        }

        setChequeSplits(newSplits);
    };

    return (
        <div className="space-y-6">
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-end">
                 <div className="space-y-2">
                    <Label htmlFor="voucherNo">Voucher Number</Label>
                    <Input id="voucherNo" value={voucherNo} readOnly className="bg-muted/50" />
                 </div>
                 <div className="space-y-2">
                    <Label htmlFor="paymentDate">Date:</Label>
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button id="paymentDate" variant="outline" className="w-full justify-start text-left font-normal">
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {paymentDate ? `${toNepaliDate(paymentDate.toISOString())} (${format(paymentDate, "PPP")})` : <span>Pick a date</span>}
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
                                {invoiceDate ? `${toNepaliDate(invoiceDate.toISOString())} (${format(invoiceDate, "PPP")})` : <span>Pick a date</span>}
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
                                            handleOpenPartyDialog(null, partySearch);
                                        }}
                                    >
                                        <PlusCircle className="mr-2 h-4 w-4" /> Add "{partySearch}"
                                    </Button>
                                </CommandEmpty>
                                <CommandGroup>
                                    {filteredParties.map((c) => (
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
                 <div className="space-y-2">
                    <Label htmlFor="bankAccount">Bank Account</Label>
                    <div className="flex gap-2">
                        <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                            <SelectTrigger id="bankAccount">
                                <SelectValue placeholder="Select a bank account" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="cash">Cash Payment</SelectItem>
                                {bankAccounts.map(account => (
                                    <SelectItem key={account.id} value={account.id}>
                                        {account.bankName} - {account.accountNumber}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Button type="button" variant="outline" size="icon" onClick={() => { setAccountForm({name:'', type:'Bank', ownership: allowedOwnerships.includes('Shivam') ? 'Shivam' : (allowedOwnerships[0] || 'Both'), accountNumber:'', bankName:'', branch:'', bankAccountType:'Saving'}); setIsAccountDialogOpen(true); }}>
                            <Plus className="h-4 w-4" />
                        </Button>
                    </div>
                 </div>
            </div>

            <div className="border rounded-lg p-4 space-y-4">
                 <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-[120px]">Interval (Days)</TableHead>
                            <TableHead className="w-[200px]">Cheque Date</TableHead>
                            <TableHead>Cheque Number</TableHead>
                            <TableHead>Amount (NPR)</TableHead>
                            <TableHead>Remarks</TableHead>
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
                                                {split.chequeDate ? `${toNepaliDate(split.chequeDate.toISOString())} (${format(split.chequeDate, "PPP")})` : <span>Pick a date</span>}
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
                <div className={cn("flex justify-between items-center text-sm font-bold", remainingAmount === 0 ? 'text-green-600' : 'text-red-600')}>
                    <Label>Remaining Balance</Label>
                    <span className="text-lg">{remainingAmount.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                </div>
            </div>
            
            <div className="flex justify-end gap-2">
                 <Button onClick={handleSave} variant="outline" disabled={isSaving}>
                    {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    {chequeToEdit ? 'Save Changes' : 'Save Voucher'}
                </Button>
                <Button onClick={handlePrint}>
                    <Printer className="mr-2 h-4 w-4" /> Preview & Print
                </Button>
            </div>
            
             <Dialog open={isPartyDialogOpen} onOpenChange={setIsPartyDialogOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader><DialogTitle>{editingParty ? 'Edit Party' : 'Add New Party'}</DialogTitle></DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="space-y-2">
                            <Label>Party Name</Label>
                            <Input value={partyForm.name} onChange={e => setPartyForm(p => ({...p, name: e.target.value}))} />
                        </div>
                         <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Party Type</Label>
                                <Select value={partyForm.type} onValueChange={(v: PartyType) => setPartyForm(p => ({...p, type: v}))}>
                                    <SelectTrigger><SelectValue/></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="Vendor">Vendor</SelectItem>
                                        <SelectItem value="Customer">Customer</SelectItem>
                                        <SelectItem value="Both">Both</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label>Ownership</Label>
                                <Select value={partyForm.ownership} onValueChange={(v: any) => setPartyForm(p => ({...p, ownership: v}))}>
                                    <SelectTrigger><SelectValue/></SelectTrigger>
                                    <SelectContent>
                                        {allowedOwnerships.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </div>
                    <DialogFooter><Button onClick={handleSubmitParty} className="w-full">Save Partner</Button></DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={isAccountDialogOpen} onOpenChange={setIsAccountDialogOpen}>
                <DialogContent className="sm:max-w-md">
                <DialogHeader><DialogTitle>Add New Bank Account</DialogTitle></DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Ownership</Label>
                            <Select value={accountForm.ownership} onValueChange={(v: any) => setAccountForm(p => ({...p, ownership: v}))}>
                                <SelectTrigger><SelectValue/></SelectTrigger>
                                <SelectContent>
                                    {allowedOwnerships.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Account Type</Label>
                            <Select value={accountForm.bankAccountType || 'Saving'} onValueChange={(v: BankAccountType) => setAccountForm(p => ({ ...p, bankAccountType: v }))}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Saving">Saving</SelectItem>
                                    <SelectItem value="Current">Current</SelectItem>
                                    <SelectItem value="Over Draft">Over Draft</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label>Bank Name</Label>
                        <Input value={accountForm.bankName} onChange={e => setAccountForm(p => ({...p, bankName: e.target.value}))} />
                    </div>
                    <div className="space-y-2">
                        <Label>Account Number</Label>
                        <Input value={accountForm.accountNumber} onChange={e => setAccountForm(p => ({...p, accountNumber: e.target.value}))} />
                    </div>
                </div>
                <DialogFooter><Button onClick={handleAccountSubmit} className="w-full">Save Account</Button></DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
