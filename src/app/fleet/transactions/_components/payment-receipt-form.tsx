'use client';

import React from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useFieldArray } from 'react-hook-form';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { Account, Party, Vehicle, Transaction, AccountOwnership, PartyType } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, ChevronsUpDown, Check, Plus, Trash2, PlusCircle, Loader2 } from 'lucide-react';
import { DualCalendar } from '@/components/ui/dual-calendar';
import { format } from 'date-fns';
import { cn, toNepaliDate, generateNextVoucherNumber } from '@/lib/utils';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { useAuth } from '@/hooks/use-auth';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { onTransactionsUpdate } from '@/services/transaction-service';

const voucherItemSchema = z.object({
  ledgerId: z.string().min(1, "General Ledger is required."),
  vehicleId: z.string().min(1, "Vehicle is required."),
  recAmount: z.number().optional(),
  payAmount: z.number().optional(),
  narration: z.string().nullish(),
});

const voucherSchema = z.object({
  voucherNo: z.string().min(1, "Voucher number is required."),
  date: z.date(),
  billingType: z.string().min(1, "Billing type is required."),
  accountId: z.string().nullish(),
  chequeNo: z.string().nullish(),
  chequeDate: z.date().nullish(),
  items: z.array(voucherItemSchema).min(1, "At least one entry is required."),
  remarks: z.string().nullish(),
}).refine(data => {
    if (data.billingType === 'Bank') return !!data.accountId;
    return true;
}, { message: 'Bank Account is required.', path: ['accountId'] });

type VoucherFormValues = z.infer<typeof voucherSchema>;

interface PaymentReceiptFormProps {
  accounts: Account[];
  parties: Party[];
  vehicles: Vehicle[];
  transactions: Transaction[];
  onFormSubmit: (values: any) => Promise<void>;
  onCancel: () => void;
  initialValues?: Partial<VoucherFormValues>;
}

export function PaymentReceiptForm({ accounts, parties, vehicles, transactions, onFormSubmit, onCancel, initialValues }: PaymentReceiptFormProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const form = useForm<VoucherFormValues>({
    resolver: zodResolver(voucherSchema),
    defaultValues: {
      billingType: 'Cash',
      voucherNo: '',
      date: new Date(),
      items: [{ ledgerId: '', vehicleId: '', recAmount: 0, payAmount: 0, narration: '' }],
      ...initialValues
    },
  });

  const { fields, append, remove } = useFieldArray({ control: form.control, name: "items" });
  const watchedItems = form.watch("items") || [];
  const watchedBillingType = form.watch("billingType");

  const sortedVehicles = React.useMemo(() => [...vehicles].sort((a, b) => a.name.localeCompare(b.name)), [vehicles]);
  const generalLedgers = React.useMemo(() => 
    parties.filter(p => p.ownership === 'Sijan' || p.ownership === 'Both').sort((a, b) => a.name.localeCompare(b.name)), 
  [parties]);

  const sijanAccounts = React.useMemo(() => 
    accounts.filter(a => a.type === 'Bank' && (a.ownership === 'Sijan' || a.ownership === 'Both')).sort((a, b) => (a.bankName || '').localeCompare(b.bankName || '')), 
  [accounts]);

  React.useEffect(() => {
    if (!initialValues?.voucherNo) {
        const unsub = onTransactionsUpdate(async (txns) => {
            const pmtRcdTxns = txns.filter(t => t.type === 'Payment' || t.type === 'Receipt');
            const nextNum = await generateNextVoucherNumber(pmtRcdTxns, 'PRV-');
            form.setValue('voucherNo', nextNum);
        });
        return () => unsub();
    }
  }, [initialValues, form]);

  const totals = React.useMemo(() => {
      const rec = watchedItems.reduce((sum, item) => sum + (Number(item.recAmount) || 0), 0);
      const pay = watchedItems.reduce((sum, item) => sum + (Number(item.payAmount) || 0), 0);
      return { rec, pay };
  }, [watchedItems]);

  const handleFormSubmitInternal = async (values: VoucherFormValues) => {
      setIsSubmitting(true);
      await onFormSubmit(values);
      setIsSubmitting(false);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleFormSubmitInternal)} className="space-y-6">
        <Card className="bg-blue-50/40 p-6 shadow-sm border-blue-100">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <FormField control={form.control} name="voucherNo" render={({ field }) => (
              <FormItem><FormLabel>Voucher No.</FormLabel><FormControl><Input {...field} readOnly className="bg-muted/50 font-mono" /></FormControl><FormMessage/></FormItem>
            )}/>
            <FormField control={form.control} name="date" render={({ field }) => (
              <FormItem><FormLabel>Date</FormLabel><Popover><PopoverTrigger asChild><FormControl><Button variant="outline" className="w-full justify-start text-left font-normal bg-white"><CalendarIcon className="mr-2 h-4 w-4" />{field.value ? toNepaliDate(field.value.toISOString()) : 'Select Date'}</Button></FormControl></PopoverTrigger><PopoverContent className="w-auto p-0"><DualCalendar selected={field.value} onSelect={field.onChange} /></PopoverContent></Popover><FormMessage/></FormItem>
            )}/>
            <FormField control={form.control} name="billingType" render={({ field }) => (
              <FormItem><FormLabel>Source</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger className="bg-white"><SelectValue/></SelectTrigger></FormControl><SelectContent><SelectItem value="Cash">Cash</SelectItem><SelectItem value="Bank">Bank</SelectItem></SelectContent></Select><FormMessage/></FormItem>
            )}/>
          </div>
          {watchedBillingType === 'Bank' && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6 pt-6 border-t border-blue-100">
                  <FormField control={form.control} name="accountId" render={({ field }) => (
                      <FormItem><FormLabel>Bank Account</FormLabel><Select onValueChange={field.onChange} value={field.value || ''}><FormControl><SelectTrigger className="bg-white"><SelectValue placeholder="Select Account"/></SelectTrigger></FormControl><SelectContent>{sijanAccounts.map(a => <SelectItem key={a.id} value={a.id}>{a.bankName} - {a.accountNumber}</SelectItem>)}</SelectContent></Select><FormMessage/></FormItem>
                  )}/>
                  <FormField control={form.control} name="chequeNo" render={({ field }) => (<FormItem><FormLabel>Cheque / Ref #</FormLabel><FormControl><Input {...field} value={field.value ?? ''} className="bg-white" /></FormControl></FormItem>)}/>
              </div>
          )}
        </Card>

        <div className="border rounded-lg overflow-hidden shadow-sm">
            <Table>
                <TableHeader className="bg-muted/30"><TableRow><TableHead>Vehicle</TableHead><TableHead>Ledger</TableHead><TableHead className="w-32">Rec Amount</TableHead><TableHead className="w-32">Pay Amount</TableHead><TableHead>Narration</TableHead><TableHead className="w-10"></TableHead></TableRow></TableHeader>
                <TableBody>
                    {fields.map((item, index) => (
                        <TableRow key={item.id}>
                            <TableCell><FormField control={form.control} name={`items.${index}.vehicleId`} render={({ field }) => (<Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger className="h-9"><SelectValue placeholder="Select"/></SelectTrigger></FormControl><SelectContent>{sortedVehicles.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}</SelectContent></Select>)}/> </TableCell>
                            <TableCell><FormField control={form.control} name={`items.${index}.ledgerId`} render={({ field }) => (<Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger className="h-9"><SelectValue placeholder="Select Ledger"/></SelectTrigger></FormControl><SelectContent>{generalLedgers.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select>)}/> </TableCell>
                            <TableCell><FormField control={form.control} name={`items.${index}.recAmount`} render={({ field }) => (<Input type="number" {...field} onChange={e => field.onChange(parseFloat(e.target.value) || 0)} className="h-9" />)}/></TableCell>
                            <TableCell><FormField control={form.control} name={`items.${index}.payAmount`} render={({ field }) => (<Input type="number" {...field} onChange={e => field.onChange(parseFloat(e.target.value) || 0)} className="h-9" />)}/></TableCell>
                            <TableCell><FormField control={form.control} name={`items.${index}.narration`} render={({ field }) => (<Input {...field} value={field.value ?? ''} className="h-9" />)}/></TableCell>
                            <TableCell><Button type="button" variant="ghost" size="icon" onClick={() => remove(index)}><Trash2 className="h-4 w-4"/></Button></TableCell>
                        </TableRow>
                    ))}
                </TableBody>
                <TableFooter className="bg-muted/50">
                    <TableRow><TableCell colSpan={2} className="text-right font-bold">Totals</TableCell><TableCell className="font-mono font-bold text-emerald-600">{totals.rec.toLocaleString()}</TableCell><TableCell className="font-mono font-bold text-red-600">{totals.pay.toLocaleString()}</TableCell><TableCell colSpan={2}></TableCell></TableRow>
                </TableFooter>
            </Table>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => append({ ledgerId: '', vehicleId: '', recAmount: 0, payAmount: 0, narration: '' })}><Plus className="mr-2 h-4 w-4"/> Add Row</Button>

        <div className="flex justify-end gap-3 pt-6 border-t">
            <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting}>{isSubmitting ? <Loader2 className="animate-spin h-4 w-4 mr-2"/> : null}Save Voucher</Button>
        </div>
      </form>
    </Form>
  );
}