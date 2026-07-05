'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useFieldArray } from 'react-hook-form';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import type { Account, Party, Vehicle, UnitOfMeasurement } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, ChevronsUpDown, Check, Plus, Trash2, Loader2 } from 'lucide-react';
import { DualCalendar } from '@/components/ui/dual-calendar';
import { format } from 'date-fns';
import { cn, toNepaliDate } from '@/lib/utils';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';

const purchaseItemSchema = z.object({
  particular: z.string().min(1, "Particular is required."),
  quantity: z.number().min(0.01, "Qty must be > 0"),
  uom: z.string().nullish(),
  rate: z.number().min(0, "Rate cannot be negative"),
});

const purchaseSchema = z.object({
  purchaseNumber: z.string().min(1, "Purchase number is required."),
  date: z.date(),
  vehicleId: z.string().min(1, "Vehicle selection is required."),
  partyId: z.string().min(1, "Supplier selection is required."),
  invoiceNumber: z.string().optional(),
  invoiceDate: z.date().nullish(),
  invoiceType: z.enum(['Normal', 'Taxable']),
  billingType: z.enum(['Cash', 'Bank', 'Credit']),
  accountId: z.string().nullish(),
  chequeNumber: z.string().optional(),
  chequeDate: z.date().nullish(),
  dueDate: z.date().nullish(),
  items: z.array(purchaseItemSchema).min(1, "At least one item is required."),
  remarks: z.string().optional(),
}).refine(data => {
    if (data.billingType === 'Bank') return !!data.accountId;
    return true;
}, { message: 'Bank Account is required.', path: ['accountId'] });

type PurchaseFormValues = z.infer<typeof purchaseSchema>;

interface PurchaseFormProps {
  accounts: Account[];
  parties: Party[];
  vehicles: Vehicle[];
  uoms: UnitOfMeasurement[];
  onFormSubmit: (values: any) => Promise<void>;
  onCancel: () => void;
  initialValues?: Partial<PurchaseFormValues>;
}

export function PurchaseForm({ accounts, parties, vehicles, uoms, onFormSubmit, onCancel, initialValues }: PurchaseFormProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<PurchaseFormValues>({
    resolver: zodResolver(purchaseSchema),
    defaultValues: {
      date: new Date(),
      invoiceType: 'Normal',
      billingType: 'Cash',
      items: [{ particular: '', quantity: 0, rate: 0 }],
      ...initialValues
    },
  });

  const { fields, append, remove } = useFieldArray({ control: form.control, name: "items" });
  
  const watchedItems = form.watch("items");
  const watchedBillingType = form.watch("billingType");
  const watchedInvoiceType = form.watch("invoiceType");

  const totals = useMemo(() => {
      const subtotal = (watchedItems || []).reduce((sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.rate) || 0), 0);
      const vat = watchedInvoiceType === 'Taxable' ? subtotal * 0.13 : 0;
      return { subtotal, vat, grandTotal: subtotal + vat };
  }, [watchedItems, watchedInvoiceType]);

  const handleFormSubmitInternal = async (values: PurchaseFormValues) => {
    setIsSubmitting(true);
    try {
      await onFormSubmit(values);
    } catch (error) {
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleFormSubmitInternal)} className="space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card>
                <CardHeader className="py-4"><CardTitle className="text-sm font-bold">General Info</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                    <FormField control={form.control} name="purchaseNumber" render={({ field }) => (
                        <FormItem><FormLabel>Purchase #</FormLabel><FormControl><Input {...field} readOnly className="bg-muted/50 font-mono" /></FormControl><FormMessage/></FormItem>
                    )}/>
                    <FormField control={form.control} name="date" render={({ field }) => (
                        <FormItem><FormLabel>Posting Date</FormLabel><Popover><PopoverTrigger asChild><FormControl><Button variant="outline" className="w-full justify-start font-normal"><CalendarIcon className="mr-2 h-4 w-4" />{field.value ? toNepaliDate(field.value.toISOString()) : 'Select'}</Button></FormControl></PopoverTrigger><PopoverContent className="p-0"><DualCalendar selected={field.value} onSelect={field.onChange}/></PopoverContent></Popover><FormMessage/></FormItem>
                    )}/>
                    <FormField control={form.control} name="vehicleId" render={({ field }) => (
                        <FormItem><FormLabel>Vehicle (Truck)</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select Vehicle"/></SelectTrigger></FormControl><SelectContent>{vehicles.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}</SelectContent></Select><FormMessage/></FormItem>
                    )}/>
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="py-4"><CardTitle className="text-sm font-bold">Supplier & Invoice</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                    <FormField control={form.control} name="partyId" render={({ field }) => (
                        <FormItem><FormLabel>Supplier</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select Supplier"/></SelectTrigger></FormControl><SelectContent>{parties.filter(p => p.type !== 'Customer').map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select><FormMessage/></FormItem>
                    )}/>
                    <div className="grid grid-cols-2 gap-2">
                        <FormField control={form.control} name="invoiceNumber" render={({ field }) => (
                            <FormItem><FormLabel>Invoice #</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>
                        )}/>
                        <FormField control={form.control} name="invoiceType" render={({ field }) => (
                            <FormItem><FormLabel>VAT Status</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue/></SelectTrigger></FormControl><SelectContent><SelectItem value="Normal">Non-VAT</SelectItem><SelectItem value="Taxable">VAT (13%)</SelectItem></SelectContent></Select></FormItem>
                        )}/>
                    </div>
                    <FormField control={form.control} name="invoiceDate" render={({ field }) => (
                        <FormItem><FormLabel>Supplier Date</FormLabel><Popover><PopoverTrigger asChild><FormControl><Button variant="outline" className="w-full justify-start font-normal"><CalendarIcon className="mr-2 h-4 w-4" />{field.value ? toNepaliDate(field.value.toISOString()) : 'Optional'}</Button></FormControl></PopoverTrigger><PopoverContent className="p-0"><DualCalendar selected={field.value || undefined} onSelect={field.onChange}/></PopoverContent></Popover></FormItem>
                    )}/>
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="py-4"><CardTitle className="text-sm font-bold">Payment Terms</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                    <FormField control={form.control} name="billingType" render={({ field }) => (
                        <FormItem><FormLabel>Payment Mode</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue/></SelectTrigger></FormControl><SelectContent><SelectItem value="Cash">Cash</SelectItem><SelectItem value="Bank">Bank</SelectItem><SelectItem value="Credit">Credit</SelectItem></SelectContent></Select></FormItem>
                    )}/>
                    {watchedBillingType === 'Bank' && (
                        <FormField control={form.control} name="accountId" render={({ field }) => (
                            <FormItem><FormLabel>Select Account</FormLabel><Select onValueChange={field.onChange} value={field.value || ''}><FormControl><SelectTrigger><SelectValue placeholder="Bank..."/></SelectTrigger></FormControl><SelectContent>{accounts.filter(a => a.type === 'Bank').map(a => <SelectItem key={a.id} value={a.id}>{a.bankName}</SelectItem>)}</SelectContent></Select><FormMessage/></FormItem>
                        )}/>
                    )}
                    {watchedBillingType === 'Credit' && (
                        <FormField control={form.control} name="dueDate" render={({ field }) => (
                            <FormItem><FormLabel>Due Date</FormLabel><Popover><PopoverTrigger asChild><FormControl><Button variant="outline" className="w-full justify-start font-normal"><CalendarIcon className="mr-2 h-4 w-4" />{field.value ? toNepaliDate(field.value.toISOString()) : 'Select'}</Button></FormControl></PopoverTrigger><PopoverContent className="p-0"><DualCalendar selected={field.value || undefined} onSelect={field.onChange}/></PopoverContent></Popover></FormItem>
                        )}/>
                    )}
                </CardContent>
            </Card>
        </div>

        <Card>
            <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-lg font-bold">Line Items</CardTitle>
                <Button type="button" variant="outline" size="sm" onClick={() => append({ particular: '', quantity: 0, rate: 0 })}><Plus className="mr-2 h-4 w-4"/> Add Item</Button>
            </CardHeader>
            <CardContent className="p-0">
                <Table>
                    <TableHeader><TableRow><TableHead>Particular / Description</TableHead><TableHead className="w-24">Qty</TableHead><TableHead className="w-24">Unit</TableHead><TableHead className="w-32">Rate</TableHead><TableHead className="w-32 text-right">Amount</TableHead><TableHead className="w-10"></TableHead></TableRow></TableHeader>
                    <TableBody>
                        {fields.map((item, index) => (
                            <TableRow key={item.id}>
                                <TableCell><FormField control={form.control} name={`items.${index}.particular`} render={({ field }) => (<Input {...field} placeholder="Maintenance item, Fuel, etc." className="h-9"/>)}/></TableCell>
                                <TableCell><FormField control={form.control} name={`items.${index}.quantity`} render={({ field }) => (<Input type="number" {...field} onChange={e => field.onChange(parseFloat(e.target.value) || 0)} className="h-9"/>)}/></TableCell>
                                <TableCell><FormField control={form.control} name={`items.${index}.uom`} render={({ field }) => (<Select onValueChange={field.onChange} value={field.value || ''}><FormControl><SelectTrigger className="h-9"><SelectValue placeholder="Unit"/></SelectTrigger></FormControl><SelectContent>{uoms.map(u => <SelectItem key={u.id} value={u.abbreviation}>{u.abbreviation}</SelectItem>)}</SelectContent></Select>)}/></TableCell>
                                <TableCell><FormField control={form.control} name={`items.${index}.rate`} render={({ field }) => (<Input type="number" {...field} onChange={e => field.onChange(parseFloat(e.target.value) || 0)} className="h-9"/>)}/></TableCell>
                                <TableCell className="text-right font-mono font-bold">{( (watchedItems[index]?.quantity || 0) * (watchedItems[index]?.rate || 0) ).toLocaleString()}</TableCell>
                                <TableCell><Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => remove(index)}><Trash2 className="h-4 w-4"/></Button></TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </CardContent>
            <CardFooter className="bg-muted/30 flex flex-col items-end py-4">
                <div className="w-full md:w-64 space-y-2">
                    <div className="flex justify-between text-sm"><span>Subtotal</span><span>Rs. {totals.subtotal.toLocaleString()}</span></div>
                    {watchedInvoiceType === 'Taxable' && (
                        <div className="flex justify-between text-sm text-blue-600"><span>VAT (13%)</span><span>Rs. {totals.vat.toLocaleString()}</span></div>
                    )}
                    <Separator />
                    <div className="flex justify-between text-lg font-black"><span>Total</span><span>Rs. {totals.grandTotal.toLocaleString()}</span></div>
                </div>
            </CardFooter>
        </Card>

        <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting}>{isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>} Save Purchase Record</Button>
        </div>
      </form>
    </Form>
  );
}
