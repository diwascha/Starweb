'use client';

import React from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useFieldArray } from 'react-hook-form';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/form';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { Account, Party, Vehicle, Transaction, PartyType, UnitOfMeasurement, AccountOwnership, BankAccountType } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, ChevronsUpDown, Check, Plus, Trash2, X } from 'lucide-react';
import { DualCalendar } from '@/components/ui/dual-calendar';
import { format } from 'date-fns';
import { cn, toNepaliDate, normalizeBF } from '@/lib/utils';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAuth } from '@/hooks/use-auth';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { addParty } from '@/services/party-service';
import { addAccount, updateAccount } from '@/services/account-service';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { Loader2, Edit } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { addUom } from '@/services/uom-service';

const purchaseCategories = [
    'Fuel',
    'Maintenance',
    'Membership Renewal',
    'Spare Parts',
    'Taxes / Fees',
    'Other'
];

const transactionItemSchema = z.object({
    particular: z.string().min(1, 'Particular is required.'),
    quantity: z.number().min(0, 'Quantity must be positive.'),
    uom: z.string().optional(),
    rate: z.number().min(0, 'Rate must be positive.'),
});

const transactionSchema = z.object({
    purchaseNumber: z.string().optional(),
    vehicleId: z.string().min(1, 'Vehicle is required.'),
    date: z.date({ required_error: 'Posting date is required.' }),
    category: z.string().min(1, 'Category is required.'),
    invoiceNumber: z.string().optional(),
    invoiceDate: z.date().optional().nullable(),
    invoiceType: z.enum(['Taxable', 'Normal']),
    billingType: z.enum(['Cash', 'Bank', 'Credit']),
    chequeNumber: z.string().optional(),
    chequeDate: z.date().optional().nullable(),
    dueDate: z.date().optional().nullable(),
    partyId: z.string().optional(),
    accountId: z.string().optional(),
    items: z.array(transactionItemSchema).min(1, 'At least one item is required.'),
    remarks: z.string().optional(),
    type: z.enum(['Purchase', 'Sales']),
}).refine(data => {
    if (data.billingType === 'Bank') return !!data.chequeDate;
    return true;
}, { message: 'Cheque Date is required for Bank billing.', path: ['chequeDate'] })
.refine(data => {
    if (data.billingType === 'Bank') return !!data.chequeNumber && data.chequeNumber.trim() !== '';
    return true;
}, { message: 'Cheque Number is required for Bank billing.', path: ['chequeNumber'] })
.refine(data => {
    if (data.billingType === 'Bank') return !!data.accountId;
    return true;
}, { message: 'Bank Account is required for Bank billing.', path: ['accountId'] })
.refine(data => {
    if (data.billingType === 'Credit') return !!data.dueDate;
    return true;
}, { message: 'Due Date is required for Credit billing.', path: ['dueDate'] })
.refine(data => {
    if (['Credit', 'Purchase', 'Sales'].includes(data.billingType) || ['Purchase', 'Sales'].includes(data.type)) return !!data.partyId;
    return true;
}, { message: 'Supplier/Party is required for this transaction type.', path: ['partyId'] });

type TransactionFormValues = z.infer<typeof transactionSchema>;

interface PurchaseFormProps {
  accounts: Account[];
  parties: Party[];
  vehicles: Vehicle[];
  uoms: UnitOfMeasurement[];
  onFormSubmit: (values: any) => Promise<void>;
  onCancel: () => void;
  initialValues?: Partial<TransactionFormValues> & { type: 'Purchase' | 'Sales' };
}

export function PurchaseForm({ accounts, parties, vehicles, uoms, onFormSubmit, onCancel, initialValues }: PurchaseFormProps) {
    const { toast } = useToast();
    const { user } = useAuth();

    const [isSubmitting, setIsSubmitting] = React.useState(false);
    
    // Dialogs
    const [isPartyDialogOpen, setIsPartyDialogOpen] = React.useState(false);
    const [isAccountDialogOpen, setIsAccountDialogOpen] = React.useState(false);
    
    const [uomSearch, setUomSearch] = React.useState('');


    // Form states
    const [partyForm, setPartyForm] = React.useState<{name: string, type: PartyType, ownership: AccountOwnership}>({name: '', type: 'Vendor', ownership: 'Both'});
    const [accountForm, setAccountForm] = React.useState({ name: '', type: 'Cash' as 'Cash' | 'Bank', ownership: 'Both' as AccountOwnership, accountNumber: '', bankName: '', branch: '', bankAccountType: 'Saving' as BankAccountType });
    const [editingAccount, setEditingAccount] = React.useState<Account | null>(null);

    const form = useForm<TransactionFormValues>({
        resolver: zodResolver(transactionSchema),
        defaultValues: {
            date: new Date(),
            invoiceType: 'Taxable',
            billingType: 'Cash',
            category: 'Fuel',
            items: [{ particular: '', quantity: 0, uom: '', rate: 0 }],
            type: 'Purchase',
            ...initialValues
        }
    });

    const { fields, append, remove } = useFieldArray({ control: form.control, name: "items" });
    
    const watchedFormValues = form.watch();
    const { subtotal, vatAmount, totalAmount } = React.useMemo(() => {
        const items = watchedFormValues.items || [];
        const sub = items.reduce((sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.rate) || 0), 0);
        const vat = watchedFormValues.invoiceType === 'Taxable' ? sub * 0.13 : 0;
        const total = sub + vat;
        return { subtotal: sub, vatAmount: vat, totalAmount: total };
    }, [watchedFormValues.items, watchedFormValues.invoiceType]);

    const bankAccounts = React.useMemo(() => accounts.filter(a => a.type === 'Bank'), [accounts]);
    const partiesById = React.useMemo(() => new Map(parties.map(p => [p.id, p.name])), [parties]);
    const accountsById = React.useMemo(() => new Map(accounts.map(a => [a.id, a.bankName ? `${a.bankName} - ${a.accountNumber}` : a.name])), [accounts]);
    
    const allUnits = React.useMemo(() => uoms.map(u => u.abbreviation), [uoms]);


    const handleSubmit = async (values: TransactionFormValues) => {
        setIsSubmitting(true);
        await onFormSubmit(values);
        setIsSubmitting(false);
    };

    const handleSubmitParty = async () => {
        if(!user) return;
        if(!partyForm.name || !partyForm.type || !partyForm.ownership) {
            toast({title: 'Error', description: 'Name, Type, and Ownership are mandatory.', variant: 'destructive'});
            return;
        }
        try {
            const newPartyId = await addParty({...partyForm, createdBy: user.username});
            form.setValue('partyId', newPartyId);
            toast({title: 'Success', description: 'New party added.'});
            setIsPartyDialogOpen(false);
            setPartyForm({name: '', type: 'Vendor', ownership: 'Both'});
        } catch {
             toast({title: 'Error', description: 'Failed to add party.', variant: 'destructive'});
        }
    };
    
    const handleOpenAccountDialog = (account: Account | null = null) => {
        if (account) {
            setEditingAccount(account);
            setAccountForm({ 
                name: account.name, 
                type: account.type, 
                ownership: account.ownership || 'Both',
                accountNumber: account.accountNumber || '', 
                bankName: account.bankName || '', 
                branch: account.branch || '',
                bankAccountType: account.bankAccountType || 'Saving'
            });
        } else {
            setEditingAccount(null);
            setAccountForm({ name: '', type: 'Cash', ownership: 'Both', accountNumber: '', bankName: '', branch: '', bankAccountType: 'Saving' });
        }
        setIsAccountDialogOpen(true);
    };

    const handleSubmitAccount = async () => {
        if(!user) return;
        if(!accountForm.name || !accountForm.type || !accountForm.ownership) {
            toast({title: 'Error', description: 'Name, Type, and Ownership are mandatory.', variant: 'destructive'});
            return;
        }
         if (accountForm.type === 'Bank' && (!accountForm.bankName || !accountForm.accountNumber)) {
            toast({ title: 'Error', description: 'Bank Name and Account Number are required for bank accounts.', variant: 'destructive' });
            return;
        }
        try {
            if (editingAccount) {
                await updateAccount(editingAccount.id, { ...accountForm, lastModifiedBy: user.username });
                toast({ title: 'Success', description: 'Account updated.' });
            } else {
                const newAccountId = await addAccount({ ...accountForm, createdBy: user.username });
                form.setValue('accountId', newAccountId);
                toast({title: 'Success', description: 'New account added.'});
            }
            
            setIsAccountDialogOpen(false);
        } catch {
             toast({title: 'Error', description: 'Failed to add account.', variant: 'destructive'});
        }
    };
    
    const handleAddUom = async (uomName: string) => {
        if (!user) return;
        if (!uomName.trim()) return;
        const newUom = {
            name: uomName,
            abbreviation: uomName,
            createdBy: user.username,
            createdAt: new Date().toISOString()
        };
        try {
            await addUom(newUom);
            toast({ title: 'Success', description: `Unit "${uomName}" added.` });
        } catch {
            toast({ title: 'Error', description: 'Failed to add unit.', variant: 'destructive' });
        }
    };


  return (
    <>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Purchase Entry</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid gap-6 py-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                             <FormField control={form.control} name="purchaseNumber" render={({ field }) => (
                                <FormItem><FormLabel>Purchase Number</FormLabel><FormControl><Input {...field} readOnly className="bg-muted/50" /></FormControl><FormMessage/></FormItem>
                            )}/>
                            <FormField control={form.control} name="date" render={({ field }) => (
                                <FormItem><FormLabel>Posting Date</FormLabel>
                                <Popover><PopoverTrigger asChild><FormControl>
                                    <Button variant={"outline"} className={cn("w-full justify-start text-left font-normal", !field.value && "text-muted-foreground")}>
                                        <CalendarIcon className="mr-2 h-4 w-4" />{field.value ? `${toNepaliDate(field.value.toISOString())} BS (${format(field.value, "PPP")})` : <span>Pick a date</span>}
                                    </Button>
                                </FormControl></PopoverTrigger><PopoverContent className="w-auto p-0"><DualCalendar selected={field.value} onSelect={field.onChange} /></PopoverContent></Popover>
                                <FormMessage/>
                                </FormItem>
                            )}/>
                            <FormField control={form.control} name="category" render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Purchase Category</FormLabel>
                                    <Select onValueChange={field.onChange} value={field.value}>
                                        <FormControl>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Select category" />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            {purchaseCategories.map(cat => <SelectItem key={cat} value={cat}>{cat}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                    <FormMessage />
                                </FormItem>
                            )} />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            <FormField control={form.control} name="vehicleId" render={({ field }) => (
                                <FormItem><FormLabel>Vehicle</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select vehicle" /></SelectTrigger></FormControl>
                                    <SelectContent>{vehicles.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}</SelectContent>
                                </Select><FormMessage/></FormItem>
                            )}/>
                            <FormField control={form.control} name="partyId" render={({ field }) => (
                                <FormItem><FormLabel>Supplier</FormLabel>
                                <div className="flex gap-2">
                                <Popover><PopoverTrigger asChild><FormControl>
                                    <Button variant="outline" role="combobox" className="w-full justify-between">
                                        {field.value ? partiesById.get(field.value) : "Select supplier..."}<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                    </Button>
                                </FormControl></PopoverTrigger><PopoverContent className="p-0"><Command>
                                    <CommandInput placeholder="Search supplier..." />
                                    <CommandList><CommandEmpty>No supplier found.</CommandEmpty><CommandGroup>
                                        {parties.filter(p => p.type === 'Vendor' || p.type === 'Both').map(party => <CommandItem key={party.id} value={party.name} onSelect={() => field.onChange(party.id)}>
                                            <Check className={cn("mr-2 h-4 w-4", field.value === party.id ? "opacity-100" : "opacity-0")} />{party.name}
                                        </CommandItem>)}
                                    </CommandGroup></CommandList>
                                </Command></PopoverContent></Popover>
                                <Button type="button" size="icon" variant="outline" onClick={() => setIsPartyDialogOpen(true)}><Plus className="h-4 w-4"/></Button>
                                </div><FormMessage/></FormItem>
                             )}/>
                        </div>
                         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            <FormField control={form.control} name="invoiceNumber" render={({ field }) => (
                                <FormItem><FormLabel>Supplier Invoice #</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage/></FormItem>
                            )}/>
                            <FormField control={form.control} name="invoiceDate" render={({ field }) => (
                                <FormItem><FormLabel>Invoice Date</FormLabel>
                                 <Popover><PopoverTrigger asChild><FormControl>
                                    <Button variant={"outline"} className={cn("w-full justify-start text-left font-normal", !field.value && "text-muted-foreground")}>
                                        <CalendarIcon className="mr-2 h-4 w-4" />{field.value ? `${toNepaliDate(field.value.toISOString())} BS (${format(field.value, "PPP")})` : <span>Pick a date</span>}
                                    </Button>
                                 </FormControl></PopoverTrigger><PopoverContent className="w-auto p-0"><DualCalendar selected={field.value ?? undefined} onSelect={field.onChange} /></PopoverContent></Popover>
                                <FormMessage/></FormItem>
                            )}/>
                             <FormField control={form.control} name="invoiceType" render={({ field }) => (
                                <FormItem className="space-y-3"><FormLabel>Invoice Type</FormLabel><FormControl>
                                    <RadioGroup onValueChange={field.onChange} value={field.value} className="flex items-center space-x-4">
                                        <FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="Taxable" /></FormControl><FormLabel className="font-normal">Taxable (13%)</FormLabel></FormItem>
                                        <FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="Normal" /></FormControl><FormLabel className="font-normal">Non-Taxable</FormLabel></FormItem>
                                    </RadioGroup>
                                </FormControl><FormMessage/></FormItem>
                            )}/>
                         </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pt-4 border-t border-dashed">
                            <FormField control={form.control} name="billingType" render={({ field }) => (
                                <FormItem><FormLabel>Payment Mode</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select billing type" /></SelectTrigger></FormControl>
                                    <SelectContent>
                                        <SelectItem value="Cash">Cash</SelectItem><SelectItem value="Bank">Bank</SelectItem>
                                        <SelectItem value="Credit">On Account (Credit)</SelectItem>
                                    </SelectContent>
                                </Select><FormMessage/></FormItem>
                            )}/>
                            {watchedFormValues.billingType === 'Bank' && (
                                <>
                                 <FormField control={form.control} name="accountId" render={({ field }) => (
                                     <FormItem><FormLabel>Bank Account</FormLabel>
                                        <div className="flex gap-2">
                                            <Popover><PopoverTrigger asChild><FormControl>
                                                <Button variant="outline" role="combobox" className="w-full justify-between">
                                                    {field.value ? accountsById.get(field.value) : "Select account..."}<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                                </Button>
                                            </FormControl></PopoverTrigger><PopoverContent className="p-0 w-[--radix-popover-trigger-width]"><Command>
                                                <CommandInput placeholder="Search accounts..." />
                                                <CommandList><CommandEmpty>No accounts found.</CommandEmpty><CommandGroup>
                                                    {bankAccounts.map(account => <CommandItem key={account.id} value={account.name} onSelect={() => field.onChange(account.id)} className="flex justify-between items-center">
                                                        <div><Check className={cn("mr-2 h-4 w-4", field.value === account.id ? "opacity-100" : "opacity-0")} />{accountsById.get(account.id)}</div>
                                                        <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => {e.stopPropagation(); handleOpenAccountDialog(account);}}><Edit className="h-4 w-4"/></Button>
                                                    </CommandItem>)}
                                                </CommandGroup></CommandList>
                                            </Command></PopoverContent></Popover>
                                            <Button type="button" size="icon" variant="outline" onClick={() => handleOpenAccountDialog(null)}><Plus className="h-4 w-4"/></Button>
                                        </div>
                                     <FormMessage/></FormItem>
                                 )}/>
                                 <FormField control={form.control} name="chequeNumber" render={({ field }) => (<FormItem><FormLabel>Cheque / Ref No.</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage/></FormItem>)}/>
                                 <FormField control={form.control} name="chequeDate" render={({ field }) => (<FormItem><FormLabel>Cheque Date</FormLabel><Popover><PopoverTrigger asChild><FormControl>
                                        <Button variant={"outline"} className={cn("w-full justify-start text-left font-normal", !field.value && "text-muted-foreground")}><CalendarIcon className="mr-2 h-4 w-4" />{field.value ? format(field.value, "PPP") : <span>Pick a date</span>}</Button>
                                </FormControl></PopoverTrigger><PopoverContent className="w-auto p-0"><Calendar mode="single" selected={field.value ?? undefined} onSelect={field.onChange} /></PopoverContent></Popover><FormMessage/></FormItem>)}/>
                                </>
                            )}
                             {watchedFormValues.billingType === 'Credit' && (
                                <FormField control={form.control} name="dueDate" render={({ field }) => (<FormItem><FormLabel>Payment Due Date</FormLabel><Popover><PopoverTrigger asChild><FormControl>
                                        <Button variant={"outline"} className={cn("w-full justify-start text-left font-normal", !field.value && "text-muted-foreground")}><CalendarIcon className="mr-2 h-4 w-4" />{field.value ? format(field.value, "PPP") : <span>Pick a date</span>}</Button>
                                </FormControl></PopoverTrigger><PopoverContent className="w-auto p-0"><Calendar mode="single" selected={field.value ?? undefined} onSelect={field.onChange} /></PopoverContent></Popover><FormMessage/></FormItem>)}/>
                             )}
                        </div>
                        <div className="pt-6">
                        <Label className="text-base font-bold uppercase tracking-wider text-muted-foreground">Itemized Particulars</Label>
                        <Table className="mt-2"><TableHeader className="bg-muted/50"><TableRow>
                            <TableHead>Particular / Description</TableHead><TableHead className="w-[120px]">Quantity</TableHead><TableHead className="w-[100px]">UOM</TableHead><TableHead className="w-[150px]">Rate</TableHead><TableHead className="w-[150px] text-right">Amount</TableHead><TableHead className="w-[50px]"/>
                        </TableRow></TableHeader>
                        <TableBody>
                        {fields.map((item, index) => (
                            <TableRow key={item.id}>
                                <TableCell><FormField control={form.control} name={`items.${index}.particular`} render={({ field }) => <Input {...field} className="h-9" placeholder="e.g. Engine Oil, Policy Fee" />} /></TableCell>
                                <TableCell><FormField control={form.control} name={`items.${index}.quantity`} render={({ field }) => <Input type="number" className="h-9" {...field} onChange={e => field.onChange(parseFloat(e.target.value) || 0)} />} /></TableCell>
                                <TableCell>
                                    <FormField
                                    control={form.control}
                                    name={`items.${index}.uom`}
                                    render={({ field }) => (
                                        <Popover>
                                        <PopoverTrigger asChild>
                                            <FormControl>
                                            <Button variant="outline" role="combobox" className="w-full justify-between font-normal h-9 text-xs">
                                                {field.value || "Unit"}
                                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                            </Button>
                                            </FormControl>
                                        </PopoverTrigger>
                                        <PopoverContent className="p-0 w-[--radix-popover-trigger-width]">
                                            <Command>
                                            <CommandInput placeholder="Search unit..." onValueChange={setUomSearch} />
                                            <CommandList>
                                                <CommandEmpty>
                                                    <button type="button" className="relative flex w-full cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-muted"
                                                         onClick={() => {
                                                            handleAddUom(uomSearch);
                                                            field.onChange(uomSearch);
                                                        }}
                                                    >
                                                        Add "{uomSearch}"
                                                    </button>
                                                </CommandEmpty>
                                                <CommandGroup>
                                                {allUnits.map((uom) => (
                                                    <CommandItem
                                                    key={uom}
                                                    value={uom}
                                                    onSelect={() => field.onChange(uom)}
                                                    >
                                                    <Check className={cn("mr-2 h-4 w-4", uom === field.value ? "opacity-100" : "opacity-0")} />
                                                    {uom}
                                                    </CommandItem>
                                                ))}
                                                </CommandGroup>
                                            </CommandList>
                                            </Command>
                                        </PopoverContent>
                                        </Popover>
                                    )}
                                    />
                                </TableCell>
                                <TableCell><FormField control={form.control} name={`items.${index}.rate`} render={({ field }) => <Input type="number" className="h-9" {...field} onChange={e => field.onChange(parseFloat(e.target.value) || 0)} />} /></TableCell>
                                <TableCell className="text-right font-medium">{((watchedFormValues.items?.[index]?.quantity || 0) * (watchedFormValues.items?.[index]?.rate || 0)).toLocaleString()}</TableCell>
                                <TableCell><Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => remove(index)}><X className="h-4 w-4"/></Button></TableCell>
                            </TableRow>
                        ))}
                        </TableBody></Table>
                        <Button type="button" size="sm" variant="outline" className="mt-2" onClick={() => append({ particular: '', quantity: 0, uom: '', rate: 0 })}>
                            <Plus className="mr-2 h-4 w-4"/> Add Entry Row
                        </Button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-6 border-t">
                            <FormField control={form.control} name="remarks" render={({ field }) => (
                                <FormItem><FormLabel>General Remarks / Narration</FormLabel><FormControl><Textarea className="min-h-[110px]" {...field} value={field.value ?? ''} placeholder="Provide any additional details..." /></FormControl><FormMessage/></FormItem>
                            )}/>
                            <div className="space-y-4">
                                <Label className="font-bold uppercase text-xs">Summary Breakdown</Label>
                                <div className="p-4 border rounded-lg space-y-3 bg-muted/20">
                                    <div className="flex justify-between text-sm"><span>Subtotal</span><span className="font-mono">{subtotal.toLocaleString(undefined, {minimumFractionDigits: 2})}</span></div>
                                    {watchedFormValues.invoiceType === 'Taxable' && <div className="flex justify-between text-sm text-muted-foreground italic"><span>VAT (13%)</span><span className="font-mono">{vatAmount.toLocaleString(undefined, {minimumFractionDigits: 2})}</span></div>}
                                    <Separator />
                                    <div className="flex justify-between font-black text-xl"><span>Grand Total</span><span className="font-mono">Rs. {totalAmount.toLocaleString(undefined, {minimumFractionDigits: 2})}</span></div>
                                </div>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <div className="flex justify-end gap-3 pt-4">
                <Button type="button" variant="outline" className="h-11 px-8" onClick={onCancel}>Cancel</Button>
                <Button type="submit" className="h-11 px-12 font-bold" disabled={isSubmitting}>
                    {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</> : (initialValues ? 'Update Transaction' : 'Post Transaction')}
                </Button>
            </div>
        </form>
      </Form>
      
      <Dialog open={isPartyDialogOpen} onOpenChange={setIsPartyDialogOpen}>
        <DialogContent className="sm:max-w-sm">
            <DialogHeader><DialogTitle>Add New Supplier</DialogTitle></DialogHeader>
            <div className="grid gap-4 py-4">
                <div className="space-y-2">
                    <Label htmlFor="party-name">Supplier Name</Label>
                    <Input id="party-name" value={partyForm.name} onChange={(e) => setPartyForm(prev => ({...prev, name: e.target.value}))}/>
                </div>
                 <div className="space-y-2">
                    <Label htmlFor="party-ownership">Ownership</Label>
                    <Select value={partyForm.ownership} onValueChange={(v: AccountOwnership) => setPartyForm(p => ({...p, ownership: v}))}>
                        <SelectTrigger id="party-ownership"><SelectValue/></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="Sijan">Sijan Dhuwani</SelectItem>
                            <SelectItem value="Shivam">Shivam Packaging</SelectItem>
                            <SelectItem value="Both">Both</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-2">
                    <Label htmlFor="party-pan">PAN Number (Optional)</Label>
                    <Input id="party-pan" value={partyForm.panNumber || ''} onChange={(e) => setPartyForm(prev => ({...prev, panNumber: e.target.value}))}/>
                </div>
                <div className="space-y-2">
                    <Label htmlFor="party-address">Address</Label>
                    <Textarea id="party-address" value={partyForm.address} onChange={(e) => setPartyForm(prev => ({...prev, address: e.target.value}))}/>
                </div>
            </div>
            <DialogFooter>
                <Button variant="outline" onClick={() => setIsPartyDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleSubmitParty}>Add Supplier</Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isAccountDialogOpen} onOpenChange={setIsAccountDialogOpen}>
        <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle>{editingAccount ? 'Edit Account' : 'Add New Account'}</DialogTitle></DialogHeader>
            <div className="grid gap-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label htmlFor="account-type">Account Type</Label>
                        <Select value={accountForm.type} onValueChange={(v: 'Cash' | 'Bank') => setAccountForm(p => ({...p, type: v}))}>
                            <SelectTrigger id="account-type"><SelectValue/></SelectTrigger>
                            <SelectContent><SelectItem value="Cash">Cash</SelectItem><SelectItem value="Bank">Bank</SelectItem></SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="account-ownership">Ownership</Label>
                        <Select value={accountForm.ownership} onValueChange={(v: AccountOwnership) => setAccountForm(p => ({...p, ownership: v}))}>
                            <SelectTrigger id="account-ownership"><SelectValue/></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="Sijan">Sijan Dhuwani</SelectItem>
                                <SelectItem value="Shivam">Shivam Packaging</SelectItem>
                                <SelectItem value="Both">Both</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
                 <div className="space-y-2">
                    <Label htmlFor="account-name">{accountForm.type === 'Bank' ? 'Account Holder Name' : 'Account Name'}</Label>
                    <Input id="account-name" value={accountForm.name} onChange={e => setAccountForm(p => ({...p, name: e.target.value}))} />
                </div>
                {accountForm.type === 'Bank' && (
                    <>
                        <div className="space-y-2">
                            <Label htmlFor="bank-name">Bank Name</Label>
                            <Input id="bank-name" value={accountForm.bankName} onChange={e => setAccountForm(p => ({...p, bankName: e.target.value}))} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="account-number">Account Number</Label>
                            <Input id="account-number" value={accountForm.accountNumber} onChange={e => setAccountForm(p => ({...p, accountNumber: e.target.value}))} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="branch">Branch</Label>
                            <Input id="branch" value={accountForm.branch} onChange={e => setAccountForm(p => ({...p, branch: e.target.value}))} />
                        </div>
                    </>
                )}
            </div>
            <DialogFooter>
                <Button variant="outline" onClick={() => { setIsAccountDialogOpen(false); setAccountForm({ name: '', type: 'Cash', ownership: 'Both', accountNumber: '', bankName: '', branch: '', bankAccountType: 'Saving' });}}>Cancel</Button>
                <Button onClick={handleSubmitAccount}>{editingAccount ? 'Save Changes' : 'Add Account'}</Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
