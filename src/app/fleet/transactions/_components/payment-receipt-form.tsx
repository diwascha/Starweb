
'use client';

import React from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useFieldArray } from 'react-hook-form';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import type { Account, Party, Vehicle, Transaction } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, ChevronsUpDown, Check, Plus, Trash2 } from 'lucide-react';
import { DualCalendar } from '@/components/ui/dual-calendar';
import { format } from 'date-fns';
import { cn, toNepaliDate } from '@/lib/utils';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAuth } from '@/hooks/use-auth';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';


const voucherItemSchema = z.object({
  ledgerId: z.string().min(1, "General Ledger is required."),
  vehicleId: z.string().min(1, "Vehicle is required."),
  recAmount: z.number().optional(),
  payAmount: z.number().optional(),
  narration: z.string().optional(),
});

const voucherSchema = z.object({
  voucherType: z.enum(['Payment', 'Receipt']),
  voucherNo: z.string().min(1, "Voucher number is required."),
  date: z.date(),
  billingType: z.enum(['Cash', 'Bank']),
  accountId: z.string().optional(),
  chequeNo: z.string().optional(),
  chequeDate: z.date().optional().nullable(),
  items: z.array(voucherItemSchema).min(1, "At least one ledger entry is required."),
  remarks: z.string().optional(),
}).refine(data => {
    if (data.billingType === 'Bank') return !!data.accountId;
    return true;
}, { message: 'Bank Account is required for Bank billing.', path: ['accountId'] })
.refine(data => {
    if (data.billingType === 'Bank') return !!data.chequeNo && data.chequeNo.trim() !== '';
    return true;
}, { message: 'Cheque Number is required for Bank billing.', path: ['chequeNo'] })
.refine(data => {
    if (data.billingType === 'Bank') return !!data.chequeDate;
    return true;
}, { message: 'Cheque Date is required for Bank billing.', path: ['chequeDate'] });


type VoucherFormValues = z.infer<typeof voucherSchema>;

interface PaymentReceiptFormProps {
  accounts: Account[];
  parties: Party[];
  vehicles: Vehicle[];
  transactions: Transaction[];
  onFormSubmit: (values: any) => Promise<void>;
  onCancel: () => void;
}

export function PaymentReceiptForm({ accounts, parties, vehicles, transactions, onFormSubmit, onCancel }: PaymentReceiptFormProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  
  const cashAndBankAccounts = React.useMemo(() => accounts.filter(a => a.type === 'Cash' || a.type === 'Bank'), [accounts]);
  const generalLedgers = parties;

  const form = useForm<VoucherFormValues>({
    resolver: zodResolver(voucherSchema),
    defaultValues: {
      voucherType: 'Payment',
      billingType: 'Cash',
      voucherNo: '001', // Placeholder
      date: new Date(),
      items: [{ ledgerId: '', vehicleId: '', recAmount: 0, payAmount: 0, narration: '' }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "items"
  });
  
  const watchedItems = form.watch("items");
  const watchedBillingType = form.watch("billingType");
  const watchedAccountId = form.watch("accountId");
  const watchedFirstItem = form.watch("items.0");
  
  const selectedAccount = cashAndBankAccounts.find(a => a.id === watchedAccountId);
  
  const { totalRec, totalPay, netAmount } = React.useMemo(() => {
    const rec = watchedItems.reduce((sum, item) => sum + (Number(item.recAmount) || 0), 0);
    const pay = watchedItems.reduce((sum, item) => sum + (Number(item.payAmount) || 0), 0);
    return {
      totalRec: rec,
      totalPay: pay,
      netAmount: rec - pay,
    };
  }, [watchedItems]);
  
  const summaryData = React.useMemo(() => {
    const ledgerId = watchedFirstItem?.ledgerId;
    const vehicleId = watchedFirstItem?.vehicleId;

    if (!ledgerId && !vehicleId) return { receivables: 0, payables: 0, title: 'Select a Ledger or Vehicle' };

    let filteredTxns: Transaction[];
    let titleParts: (string | undefined)[] = [];

    const selectedPartyName = parties.find(p => p.id === ledgerId)?.name;
    const selectedVehicleName = vehicles.find(v => v.id === vehicleId)?.name;
    
    titleParts.push(selectedPartyName);
    if(vehicleId && selectedVehicleName) titleParts.push(selectedVehicleName);


    if (ledgerId && vehicleId) {
      filteredTxns = transactions.filter(t => t.partyId === ledgerId || t.vehicleId === vehicleId);
    } else if (ledgerId) {
      filteredTxns = transactions.filter(t => t.partyId === ledgerId);
    } else if (vehicleId) {
      filteredTxns = transactions.filter(t => t.vehicleId === vehicleId);
    } else {
      filteredTxns = [];
    }
    
    const { receivables, payables } = filteredTxns.reduce((acc, t) => {
        if (t.type === 'Sales') acc.receivables += t.amount;
        if (t.type === 'Receipt') acc.receivables -= t.amount;
        if (t.type === 'Purchase') acc.payables += t.amount;
        if (t.type === 'Payment') acc.payables -= t.amount;
        return acc;
    }, { receivables: 0, payables: 0 });


    return { receivables, payables, title: titleParts.filter(Boolean).join(' & ') || 'Summary' };
  }, [watchedFirstItem, transactions, parties, vehicles]);



  const handleSubmit = (values: VoucherFormValues) => {
    // This is a placeholder for the actual submission logic.
    toast({ title: "Voucher Saved", description: "The voucher has been recorded." });
    onFormSubmit(values);
  };
  
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
        <Card className="bg-blue-100 border-blue-300 p-4">
          <CardContent className="p-0">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
              <FormField control={form.control} name="voucherType" render={({ field }) => (
                <FormItem><FormLabel>Voucher Type</FormLabel><FormControl>
                    <RadioGroup onValueChange={field.onChange} value={field.value} className="flex items-center space-x-4 pt-2">
                        <FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="Payment" /></FormControl><FormLabel className="font-normal">Payment</FormLabel></FormItem>
                        <FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="Receipt" /></FormControl><FormLabel className="font-normal">Receipt</FormLabel></FormItem>
                    </RadioGroup>
                </FormControl><FormMessage/></FormItem>
              )}/>
              <FormField control={form.control} name="voucherNo" render={({ field }) => (
                <FormItem><FormLabel>Voucher No.</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )}/>
              <FormField control={form.control} name="date" render={({ field }) => (
                  <FormItem><FormLabel>Date</FormLabel>
                  <Popover><PopoverTrigger asChild><FormControl>
                      <Button variant={"outline"} className={cn("w-full justify-start text-left font-normal bg-white", !field.value && "text-muted-foreground")}>
                          <CalendarIcon className="mr-2 h-4 w-4" />{field.value ? `${toNepaliDate(field.value.toISOString())} (${format(field.value, "PP")})` : <span>Pick a date</span>}
                      </Button>
                  </FormControl></PopoverTrigger><PopoverContent className="w-auto p-0"><DualCalendar selected={field.value} onSelect={field.onChange} /></PopoverContent></Popover>
                  <FormMessage/>
                  </FormItem>
              )}/>
               <FormField control={form.control} name="billingType" render={({ field }) => (
                <FormItem><FormLabel>Billing</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select billing type" /></SelectTrigger></FormControl>
                    <SelectContent>
                        <SelectItem value="Cash">Cash</SelectItem><SelectItem value="Bank">Bank</SelectItem>
                    </SelectContent>
                </Select><FormMessage/></FormItem>
              )}/>
              
              {watchedBillingType === 'Bank' && (
                <>
                  <FormField control={form.control} name="accountId" render={({ field }) => (
                    <FormItem><FormLabel>Bank Account</FormLabel>
                        <Popover><PopoverTrigger asChild><FormControl>
                            <Button variant="outline" role="combobox" className="w-full justify-between bg-white">
                                {field.value ? cashAndBankAccounts.find(a => a.id === field.value)?.name : "Select account..."}<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                        </FormControl></PopoverTrigger><PopoverContent className="p-0 w-[--radix-popover-trigger-width]"><Command>
                            <CommandInput placeholder="Search accounts..." />
                            <CommandList><CommandEmpty>No accounts found.</CommandEmpty><CommandGroup>
                                {cashAndBankAccounts.map(account => <CommandItem key={account.id} value={account.name} onSelect={() => field.onChange(account.id)}>
                                    <Check className={cn("mr-2 h-4 w-4", field.value === account.id ? "opacity-100" : "opacity-0")} />{account.bankName ? `${account.bankName} - ${account.accountNumber}`: account.name}
                                </CommandItem>)}
                            </CommandGroup></CommandList>
                        </Command></PopoverContent></Popover><FormMessage/></FormItem>
                  )}/>
                  <FormField control={form.control} name="chequeNo" render={({ field }) => (
                      <FormItem><FormLabel>Cheque No.</FormLabel><FormControl><Input {...field} value={field.value ?? ''} className="bg-white"/></FormControl><FormMessage /></FormItem>
                  )}/>
                  <FormField control={form.control} name="chequeDate" render={({ field }) => (
                      <FormItem><FormLabel>Cheque Date</FormLabel><Popover><PopoverTrigger asChild><FormControl>
                          <Button variant={"outline"} className={cn("w-full justify-start text-left font-normal bg-white", !field.value && "text-muted-foreground")}><CalendarIcon className="mr-2 h-4 w-4" />{field.value ? format(field.value, "PPP") : <span>Pick a date</span>}</Button>
                      </FormControl></PopoverTrigger><PopoverContent className="w-auto p-0"><Calendar mode="single" selected={field.value ?? undefined} onSelect={field.onChange} /></PopoverContent></Popover><FormMessage/></FormItem>
                  )}/>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[50px]">S.No</TableHead>
              <TableHead>General Ledger</TableHead>
              <TableHead>Vehicle</TableHead>
              <TableHead>Rec Amount</TableHead>
              <TableHead>Pay Amount</TableHead>
              <TableHead>Narration</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {fields.map((item, index) => (
              <TableRow key={item.id}>
                <TableCell>{index + 1}</TableCell>
                <TableCell>
                  <FormField control={form.control} name={`items.${index}.ledgerId`} render={({ field }) => (
                    <Popover><PopoverTrigger asChild><FormControl>
                        <Button variant="outline" role="combobox" className="w-full justify-between">
                            {field.value ? generalLedgers.find(p => p.id === field.value)?.name : "Select ledger..."}<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                    </FormControl></PopoverTrigger><PopoverContent className="p-0 w-[--radix-popover-trigger-width]"><Command>
                        <CommandInput placeholder="Search ledger..." />
                        <CommandList><CommandEmpty>No ledger found.</CommandEmpty><CommandGroup>
                            {generalLedgers.map(party => <CommandItem key={party.id} value={party.name} onSelect={() => field.onChange(party.id)}>
                                <Check className={cn("mr-2 h-4 w-4", field.value === party.id ? "opacity-100" : "opacity-0")} />{party.name}
                            </CommandItem>)}
                        </CommandGroup></CommandList>
                    </Command></PopoverContent></Popover>
                  )}/>
                </TableCell>
                <TableCell>
                  <FormField control={form.control} name={`items.${index}.vehicleId`} render={({ field }) => (
                    <Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select vehicle" /></SelectTrigger></FormControl>
                        <SelectContent>{vehicles.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}</SelectContent>
                    </Select>
                  )}/>
                </TableCell>
                <TableCell>
                  <FormField control={form.control} name={`items.${index}.recAmount`} render={({ field }) => <Input type="number" {...field} onChange={e => field.onChange(parseFloat(e.target.value) || 0)} />} />
                </TableCell>
                <TableCell>
                  <FormField control={form.control} name={`items.${index}.payAmount`} render={({ field }) => <Input type="number" {...field} onChange={e => field.onChange(parseFloat(e.target.value) || 0)} />} />
                </TableCell>
                <TableCell>
                  <FormField control={form.control} name={`items.${index}.narration`} render={({ field }) => <Input {...field} value={field.value ?? ''} />} />
                </TableCell>
                <TableCell>
                  <Button type="button" variant="ghost" size="icon" onClick={() => remove(index)}><Trash2 className="h-4 w-4 text-destructive"/></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <Button type="button" size="sm" variant="outline" className="mt-2" onClick={() => append({ ledgerId: '', vehicleId: '', recAmount: 0, payAmount: 0, narration: '' })}>
            <Plus className="mr-2 h-4 w-4"/> Add Row
        </Button>
        
        <Card className="bg-blue-100 border-blue-300 p-4 mt-4">
            <CardContent className="p-0">
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                     <div className="space-y-2">
                         <Label>Summary for {summaryData.title}</Label>
                        <div className="p-2 rounded-lg bg-gray-200">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="w-[50px]">S.No</TableHead>
                                <TableHead>Ledger</TableHead>
                                <TableHead>Vehicle</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {watchedItems.map((item, index) => {
                                const ledger = generalLedgers.find(p => p.id === item.ledgerId);
                                const vehicle = vehicles.find(v => v.id === item.vehicleId);
                                if (!ledger || !vehicle) return null;
                                return (
                                  <TableRow key={index}>
                                    <TableCell>{index + 1}</TableCell>
                                    <TableCell>{ledger?.name}</TableCell>
                                    <TableCell>{vehicle?.name}</TableCell>
                                  </TableRow>
                                )
                              })}
                            </TableBody>
                          </Table>
                        </div>
                     </div>
                    <div className="space-y-2">
                        <Label>Current Transaction Totals</Label>
                        <div className="flex justify-between bg-gray-200 p-2 rounded-md">
                            <Label>Total Rec Amt</Label>
                            <span className="font-mono">{totalRec.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                        </div>
                         <div className="flex justify-between bg-gray-200 p-2 rounded-md">
                            <Label>Total Pay Amt</Label>
                            <span className="font-mono">{totalPay.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                        </div>
                        <div className="flex justify-between bg-gray-800 text-white p-2 rounded-md">
                            <Label>Net Amount in Rs</Label>
                            <span className="font-mono">{netAmount.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                        </div>
                    </div>
                </div>
                 <FormField control={form.control} name="remarks" render={({ field }) => (
                    <FormItem className="mt-4"><FormLabel>Remarks</FormLabel><FormControl><Input {...field} value={field.value ?? ''} className="bg-white"/></FormControl><FormMessage /></FormItem>
                )}/>
            </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
            <Button type="submit">Ok</Button>
        </div>
      </form>
    </Form>
  );
}
