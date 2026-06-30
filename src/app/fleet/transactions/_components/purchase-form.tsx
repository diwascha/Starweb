'use client';

import React from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useFieldArray } from 'react-hook-form';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { Account, Party, Vehicle, Transaction, PartyType, UnitOfMeasurement, AccountOwnership, BankAccountType } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, ChevronsUpDown, Check, Plus, Trash2, X, PlusCircle, Edit, Loader2 } from 'lucide-react';
import { DualCalendar } from '@/components/ui/dual-calendar';
import { format } from 'date-fns';
import { cn, toNepaliDate, normalizeBF, generateId } from '@/lib/utils';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAuth } from '@/hooks/use-auth';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { onTransactionsUpdate } from '@/services/transaction-service';
import { generateNextPurchaseNumber } from '@/lib/utils';
import { addParty, updateParty } from '@/services/party-service';
import { addAccount, updateAccount } from '@/services/account-service';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';

const purchaseCategories = [
    'Fuel', 'Maintenance', 'Membership Renewal', 'Spare Parts', 'Taxes / Fees', 'Other'
];

const transactionItemSchema = z.object({
    particular: z.string().min(1, 'Particular is required.'),
    quantity: z.number().min(0, 'Quantity must be positive.'),
    uom: z.string().nullish(),
    rate: z.number().min(0, 'Rate must be positive.'),
});

const transactionSchema = z.object({
    purchaseNumber: z.string().min(1, "Purchase number is required."),
    vehicleId: z.string().min(1, 'Vehicle is required.'),
    date: z.date({ required_error: 'Posting date is required.' }),
    category: z.string().min(1, 'Category is required.'),
    invoiceNumber: z.string().nullish(),
    invoiceDate: z.date().nullish(),
    invoiceType: z.enum(['Taxable', 'Normal']),
    billingType: z.enum(['Cash', 'Bank', 'Credit']),
    chequeNumber: z.string().nullish(),
    chequeDate: z.date().nullish(),
    dueDate: z.date().nullish(),
    partyId: z.string().nullish(),
    accountId: z.string().nullish(),
    items: z.array(transactionItemSchema).min(1, 'At least one item is required.'),
    remarks: z.string().nullish(),
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
    if (['Credit', 'Purchase', 'Sales'].includes(data.billingType)) return !!data.partyId;
    return true;
}, { message: 'Supplier/Party is required.', path: ['partyId'] });

type TransactionFormValues = z.infer<typeof transactionSchema>;

interface PurchaseFormProps {
  accounts: Account[];
  parties: Party[];
  vehicles: Vehicle[];
  uoms: UnitOfMeasurement[];
  onFormSubmit: (values: any) => Promise<void>;
  onCancel: () => void;
  initialValues?: Partial<TransactionFormValues>;
}

export function PurchaseForm({ accounts, parties, vehicles, uoms, onFormSubmit, onCancel, initialValues }: PurchaseFormProps) {
    const { toast } = useToast();
    const { user } = useAuth();
    const [isSubmitting, setIsSubmitting] = React.useState(false);
    const [isPartyDialogOpen, setIsPartyDialogOpen] = React.useState(false);
    const [isAccountDialogOpen, setIsAccountDialogOpen] = React.useState(false);
    const [partyForm, setPartyForm] = React.useState<{name: string, type: PartyType, ownership: AccountOwnership}>({name: '', type: 'Vendor', ownership: 'Both'});
    const [accountForm, setAccountForm] = React.useState({ name: '', type: 'Cash' as AccountType, ownership: 'Both' as AccountOwnership, accountNumber: '', bankName: '', branch: '', bankAccountType: 'Saving' as BankAccountType });

    const form = useForm<TransactionFormValues>({
        resolver: zodResolver(transactionSchema),
        defaultValues: {
            date: new Date(),
            invoiceType: 'Taxable',
            billingType: 'Cash',
            category: 'Fuel',
            items: [{ particular: '', quantity: 0, uom: '', rate: 0 }],
            type: 'Purchase',
            purchaseNumber: '',
            ...initialValues
        }
    });

    const { fields, append, remove } = useFieldArray({ control: form.control, name: "items" });
    const watchedFormValues = form.watch();

    React.useEffect(() => {
        if (!initialValues?.purchaseNumber && !initialValues?.id) {
            const unsub = onTransactionsUpdate(async (txns) => {
                const purchaseTxns = txns.filter(t => t.type === 'Purchase');
                const nextNum = await generateNextPurchaseNumber(purchaseTxns);
                form.setValue('purchaseNumber', nextNum);
            });
            return () => unsub();
        }
    }, [initialValues, form]);

    const totals = React.useMemo(() => {
        const sub = (watchedFormValues.items || []).reduce((sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.rate) || 0), 0);
        const vat = watchedFormValues.invoiceType === 'Taxable' ? sub * 0.13 : 0;
        return { subtotal: sub, vatAmount: vat, totalAmount: sub + vat };
    }, [watchedFormValues.items, watchedFormValues.invoiceType]);

    const bankAccounts = React.useMemo(() => accounts.filter(a => a.type === 'Bank' && (a.ownership === 'Sijan' || a.ownership === 'Both')), [accounts]);
    const partiesById = React.useMemo(() => new Map(parties.map(p => [p.id, p.name])), [parties]);

    const handleSubmitParty = async () => {
        if(!user || !partyForm.name) return;
        try {
            const id = await addParty({...partyForm, createdBy: user.username});
            form.setValue('partyId', id);
            setIsPartyDialogOpen(false);
            toast({title: 'Success', description: 'New party added.'});
        } catch { toast({title: 'Error', variant: 'destructive'}); }
    };

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onFormSubmit)} className="space-y-6">
                <Card>
                    <CardHeader><CardTitle>Purchase Entry</CardTitle></CardHeader>
                    <CardContent className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <FormField control={form.control} name="purchaseNumber" render={({ field }) => (
                                <FormItem><FormLabel>Purchase Number</FormLabel><FormControl><Input {...field} readOnly className="bg-muted/50 font-mono" /></FormControl><FormMessage/></FormItem>
                            )}/>
                            <FormField control={form.control} name="date" render={({ field }) => (
                                <FormItem><FormLabel>Posting Date</FormLabel>
                                <Popover><PopoverTrigger asChild><FormControl>
                                    <Button variant="outline" className="w-full justify-start text-left font-normal bg-white"><CalendarIcon className="mr-2 h-4 w-4" />{field.value ? toNepaliDate(field.value.toISOString()) : 'Select Date'}</Button>
                                </FormControl></PopoverTrigger><PopoverContent className="w-auto p-0"><DualCalendar selected={field.value} onSelect={field.onChange} /></PopoverContent></Popover>
                                <FormMessage/></FormItem>
                            )}/>
                            <FormField control={form.control} name="category" render={({ field }) => (
                                <FormItem><FormLabel>Category</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue/></SelectTrigger></FormControl><SelectContent>{purchaseCategories.map(cat => <SelectItem key={cat} value={cat}>{cat}</SelectItem>)}</SelectContent></Select><FormMessage/></FormItem>
                            )}/>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <FormField control={form.control} name="vehicleId" render={({ field }) => (
                                <FormItem><FormLabel>Vehicle</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select vehicle" /></SelectTrigger></FormControl><SelectContent>{vehicles.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}</SelectContent></Select><FormMessage/></FormItem>
                            )}/>
                            <FormField control={form.control} name="partyId" render={({ field }) => (
                                <FormItem><FormLabel>Supplier</FormLabel><div className="flex gap-2"><Select onValueChange={field.onChange} value={field.value || ''}><FormControl><SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger></FormControl><SelectContent>{parties.filter(p => (p.type === 'Vendor' || p.type === 'Both') && (p.ownership === 'Sijan' || p.ownership === 'Both')).map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select><Button type="button" size="icon" variant="outline" onClick={() => setIsPartyDialogOpen(true)}><Plus className="h-4 w-4"/></Button></div><FormMessage/></FormItem>
                            )}/>
                            <FormField control={form.control} name="invoiceNumber" render={({ field }) => (
                                <FormItem><FormLabel>Supplier Invoice #</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage/></FormItem>
                            )}/>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4 border-t">
                            <FormField control={form.control} name="billingType" render={({ field }) => (
                                <FormItem><FormLabel>Payment Mode</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue/></SelectTrigger></FormControl><SelectContent><SelectItem value="Cash">Cash</SelectItem><SelectItem value="Bank">Bank</SelectItem><SelectItem value="Credit">Credit (On Account)</SelectItem></SelectContent></Select><FormMessage/></FormItem>
                            )}/>
                            {watchedFormValues.billingType === 'Bank' && (
                                <FormField control={form.control} name="accountId" render={({ field }) => (
                                    <FormItem><FormLabel>Bank Account</FormLabel><Select onValueChange={field.onChange} value={field.value || ''}><FormControl><SelectTrigger><SelectValue/></SelectTrigger></FormControl><SelectContent>{bankAccounts.map(a => <SelectItem key={a.id} value={a.id}>{a.bankName} - {a.accountNumber}</SelectItem>)}</SelectContent></Select><FormMessage/></FormItem>
                                )}/>
                            )}
                            <FormField control={form.control} name="invoiceType" render={({ field }) => (
                                <FormItem className="space-y-3"><FormLabel>Invoice Type</FormLabel><FormControl><RadioGroup onValueChange={field.onChange} value={field.value} className="flex space-x-4"><FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="Taxable" /></FormControl><FormLabel className="font-normal">Taxable (13%)</FormLabel></FormItem><FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="Normal" /></FormControl><FormLabel className="font-normal">Non-Taxable</FormLabel></FormItem></RadioGroup></FormControl><FormMessage/></FormItem>
                            )}/>
                        </div>
                        <Table>
                            <TableHeader><TableRow><TableHead>Particular</TableHead><TableHead className="w-24">Qty</TableHead><TableHead className="w-32">Rate</TableHead><TableHead className="text-right w-32">Amount</TableHead><TableHead className="w-10"></TableHead></TableRow></TableHeader>
                            <TableBody>
                                {fields.map((item, index) => (
                                    <TableRow key={item.id}>
                                        <TableCell><FormField control={form.control} name={`items.${index}.particular`} render={({ field }) => <Input {...field} className="h-9" />} /></TableCell>
                                        <TableCell><FormField control={form.control} name={`items.${index}.quantity`} render={({ field }) => <Input type="number" {...field} onChange={e => field.onChange(parseFloat(e.target.value) || 0)} className="h-9" />} /></TableCell>
                                        <TableCell><FormField control={form.control} name={`items.${index}.rate`} render={({ field }) => <Input type="number" {...field} onChange={e => field.onChange(parseFloat(e.target.value) || 0)} className="h-9" />} /></TableCell>
                                        <TableCell className="text-right font-mono">{(watchedFormValues.items?.[index]?.quantity || 0) * (watchedFormValues.items?.[index]?.rate || 0)}</TableCell>
                                        <TableCell><Button type="button" variant="ghost" size="icon" onClick={() => remove(index)}><X className="h-4 w-4"/></Button></TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                        <Button type="button" variant="outline" size="sm" onClick={() => append({ particular: '', quantity: 0, rate: 0 })}><Plus className="mr-2 h-4 w-4"/> Add Row</Button>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-6 border-t">
                            <FormField control={form.control} name="remarks" render={({ field }) => (
                                <FormItem><FormLabel>Remarks</FormLabel><FormControl><Textarea {...field} value={field.value ?? ''} className="min-h-[100px]" /></FormControl><FormMessage/></FormItem>
                            )}/>
                            <div className="p-4 bg-muted/20 rounded-lg space-y-2">
                                <div className="flex justify-between text-sm"><span>Subtotal</span><span>{totals.subtotal.toLocaleString()}</span></div>
                                {watchedFormValues.invoiceType === 'Taxable' && <div className="flex justify-between text-sm italic text-muted-foreground"><span>VAT (13%)</span><span>{totals.vatAmount.toLocaleString()}</span></div>}
                                <Separator />
                                <div className="flex justify-between font-bold text-lg"><span>Total Amount</span><span>Rs. {totals.totalAmount.toLocaleString()}</span></div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <div className="flex justify-end gap-3"><Button type="button" variant="outline" onClick={onCancel}>Cancel</Button><Button type="submit" disabled={isSubmitting}>{isSubmitting ? <Loader2 className="animate-spin h-4 w-4 mr-2"/> : null}Save Transaction</Button></div>
            </form>

            <Dialog open={isPartyDialogOpen} onOpenChange={setIsPartyDialogOpen}>
                <DialogContent><DialogHeader><DialogTitle>Quick Add Supplier</DialogTitle></DialogHeader><div className="space-y-4 py-4"><div className="space-y-2"><Label>Name</Label><Input value={partyForm.name} onChange={e => setPartyForm({...partyForm, name: e.target.value})}/></div><div className="space-y-2"><Label>Ownership</Label><Select value={partyForm.ownership} onValueChange={(v: any) => setPartyForm({...partyForm, ownership: v})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="Sijan">Sijan</SelectItem><SelectItem value="Shivam">Shivam</SelectItem><SelectItem value="Both">Both</SelectItem></SelectContent></Select></div></div><DialogFooter><Button onClick={handleSubmitParty}>Add Supplier</Button></DialogFooter></DialogContent>
            </Dialog>
        </Form>
    );
}