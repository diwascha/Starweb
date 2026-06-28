'use client';

import React from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useFieldArray } from 'react-hook-form';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const voucherItemSchema = z.object({
  ledgerId: z.string().min(1, "General Ledger is required."),
  vehicleId: z.string().min(1, "Vehicle is required."),
  recAmount: z.number().optional(),
  payAmount: z.number().optional(),
  narration: z.string().optional(),
});

const voucherSchema = z.object({
  voucherNo: z.string().min(1, "Voucher number is required."),
  date: z.date(),
  billingType: z.string().min(1, "Billing type is required."),
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
  initialValues?: Partial<VoucherFormValues>;
}

export function PaymentReceiptForm({ accounts, parties, vehicles, transactions, onFormSubmit, onCancel, initialValues }: PaymentReceiptFormProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [billingSearch, setBillingSearch] = React.useState('');
  
  const cashAndBankAccounts = React.useMemo(() => accounts.filter(a => a.type === 'Cash' || a.type === 'Bank'), [accounts]);
  const generalLedgers = parties;

  const form = useForm<VoucherFormValues>({
    resolver: zodResolver(voucherSchema),
    defaultValues: {
      billingType: 'Cash',
      voucherNo: '001',
      date: new Date(),
      items: [{ ledgerId: '', vehicleId: '', recAmount: 0, payAmount: 0, narration: '' }],
      ...initialValues
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "items"
  });
  
  const watchedItems = form.watch("items") || [];
  const watchedBillingType = form.watch("billingType");
  
  const totalRec = watchedItems.reduce((sum, item) => sum + (Number(item.recAmount) || 0), 0);
  const totalPay = watchedItems.reduce((sum, item) => sum + (Number(item.payAmount) || 0), 0);
  const netAmount = totalRec - totalPay;
  
  const summaryData = watchedItems.map(item => {
    const { ledgerId, vehicleId, recAmount = 0, payAmount = 0 } = item;
    
    if (!ledgerId && !vehicleId) {
      return {
        ledgerName: 'N/A',
        vehicleName: 'N/A',
        receivable: 0,
        payable: 0,
      };
    }

    const filteredTxns = transactions.filter(t => {
      const partyMatch = ledgerId ? t.partyId === ledgerId : false;
      const vehicleMatch = vehicleId ? t.vehicleId === vehicleId : false;

      if (ledgerId && vehicleId) {
        return partyMatch && vehicleMatch;
      }
      return partyMatch || vehicleMatch;
    });

    const balances = filteredTxns.reduce((acc, t) => {
      if (t.type === 'Sales') acc.receivables += t.amount;
      if (t.type === 'Receipt') acc.receivables -= t.amount;
      if (t.type === 'Purchase') acc.payables += t.amount;
      if (t.type === 'Payment') acc.payables -= t.amount;
      return acc;
    }, { receivables: 0, payables: 0 });

    const finalReceivable = balances.receivables - recAmount;
    const finalPayable = balances.payables - payAmount;

    return {
      ledgerName: parties.find(p => p.id === ledgerId)?.name || 'N/A',
      vehicleName: vehicles.find(v => v.id === vehicleId)?.name || 'N/A',
      receivable: finalReceivable,
      payable: finalPayable,
    };
  });


  const handleSubmit = (values: VoucherFormValues) => {
    onFormSubmit(values);
  };
  
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
        <Card className="bg-blue-50 border-blue-200 p-6 shadow-sm">
          <CardContent className="p-0">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 items-end">
              <FormField control={form.control} name="voucherNo" render={({ field }) => (
                <FormItem>
                  <FormLabel>Voucher No.</FormLabel>
                  <FormControl><Input {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}/>
              <FormField control={form.control} name="date" render={({ field }) => (
                <FormItem>
                  <FormLabel>Date</FormLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button variant={"outline"} className={cn("w-full justify-start text-left font-normal bg-white", !field.value && "text-muted-foreground")}>
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {field.value ? `${toNepaliDate(field.value.toISOString())} (${format(field.value, "PP")})` : <span>Pick a date</span>}
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0"><DualCalendar selected={field.value} onSelect={field.onChange} /></PopoverContent>
                  </Popover>
                  <FormMessage/>
                </FormItem>
              )}/>
              
              <FormField control={form.control} name="billingType" render={({ field }) => (
                <FormItem>
                  <FormLabel>Billing (Mode)</FormLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button variant="outline" role="combobox" className="w-full justify-between bg-white">
                          {field.value || "Select billing..."}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="p-0">
                      <Command>
                        <CommandInput placeholder="Search or add mode..." onValueChange={setBillingSearch} />
                        <CommandList>
                          <CommandEmpty>
                            <button type="button" className="p-2 text-xs w-full text-left hover:bg-muted" onClick={() => field.onChange(billingSearch)}>
                              Add "{billingSearch}"
                            </button>
                          </CommandEmpty>
                          <CommandGroup>
                            <CommandItem value="Cash" onSelect={() => field.onChange("Cash")}>
                              <Check className={cn("mr-2 h-4 w-4", field.value === "Cash" ? "opacity-100" : "opacity-0")} /> Cash
                            </CommandItem>
                            <CommandItem value="Bank" onSelect={() => field.onChange("Bank")}>
                              <Check className={cn("mr-2 h-4 w-4", field.value === "Bank" ? "opacity-100" : "opacity-0")} /> Bank
                            </CommandItem>
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  <FormMessage/>
                </FormItem>
              )}/>
              
              {watchedBillingType === 'Bank' && (
                <>
                  <FormField 
                    control={form.control} 
                    name="accountId" 
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Bank Account</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button variant="outline" role="combobox" className="w-full justify-between bg-white text-xs truncate">
                                {field.value ? (() => {
                                  const a = cashAndBankAccounts.find(acc => acc.id === field.value);
                                  return a ? (a.bankName ? `${a.bankName} - ${a.accountNumber}` : a.name) : "Select account...";
                                })() : "Select account..."}
                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="p-0 w-[--radix-popover-trigger-width]">
                            <Command>
                              <CommandInput placeholder="Search accounts..." />
                              <CommandList>
                                <CommandEmpty>No accounts found.</CommandEmpty>
                                <CommandGroup>
                                  {cashAndBankAccounts.map(account => (
                                    <CommandItem 
                                      key={account.id} 
                                      value={`${account.name} ${account.bankName || ''} ${account.accountNumber || ''} ${account.ownership} ${account.id}`}
                                      onSelect={() => field.onChange(account.id)}
                                    >
                                      <Check className={cn("mr-2 h-4 w-4", field.value === account.id ? "opacity-100" : "opacity-0")} />
                                      <div className="flex flex-col text-[10px]">
                                          <span>{account.bankName ? `${account.bankName} - ${account.accountNumber}` : account.name}</span>
                                          <span className="text-muted-foreground uppercase">{account.ownership}</span>
                                      </div>
                                    </CommandItem>
                                  ))}
                                </CommandGroup>
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>
                        <FormMessage/>
                      </FormItem>
                    )}
                  />
                  <FormField 
                    control={form.control} 
                    name="chequeNo" 
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Cheque No.</FormLabel>
                        <FormControl>
                          <Input {...field} value={field.value ?? ''} className="bg-white"/>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField 
                    control={form.control} 
                    name="chequeDate" 
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Cheque Date</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button variant={"outline"} className={cn("w-full justify-start text-left font-normal bg-white", !field.value && "text-muted-foreground")}>
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {field.value ? format(field.value, "PP") : <span>Pick a date</span>}
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0">
                            <DualCalendar selected={field.value ?? undefined} onSelect={field.onChange} />
                          </PopoverContent>
                        </Popover>
                        <FormMessage/>
                      </FormItem>
                    )}
                  />
                </>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="border rounded-lg overflow-hidden shadow-sm">
            <Table>
            <TableHeader className="bg-muted/50">
                <TableRow>
                <TableHead className="w-[50px] text-center">S.No</TableHead>
                <TableHead>Vehicle</TableHead>
                <TableHead>General Ledger</TableHead>
                <TableHead className="w-[140px]">Rec Amount</TableHead>
                <TableHead className="w-[140px]">Pay Amount</TableHead>
                <TableHead>Narration / Remark</TableHead>
                <TableHead className="w-[50px]"></TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {fields.map((item, index) => (
                <TableRow key={item.id} className="h-14">
                    <TableCell className="text-center font-medium">{index + 1}</TableCell>
                    <TableCell>
                    <FormField control={form.control} name={`items.${index}.vehicleId`} render={({ field }) => (
                        <Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger className="h-9"><SelectValue placeholder="Select vehicle" /></SelectTrigger></FormControl>
                            <SelectContent>{vehicles.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}</SelectContent>
                        </Select>
                    )}/>
                    </TableCell>
                    <TableCell>
                    <FormField control={form.control} name={`items.${index}.ledgerId`} render={({ field }) => (
                        <Popover><PopoverTrigger asChild><FormControl>
                            <Button variant="outline" role="combobox" className="w-full justify-between h-9 font-normal">
                                {field.value ? generalLedgers.find(p => p.id === field.value)?.name : "Select ledger..."}<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                        </FormControl></PopoverTrigger><PopoverContent className="p-0 w-[--radix-popover-trigger-width]"><Command>
                            <CommandInput placeholder="Search ledger..." />
                            <CommandList><CommandEmpty>No ledger found.</CommandEmpty><CommandGroup>
                                {generalLedgers.map(party => <CommandItem key={party.id} value={`${party.name} ${party.ownership} ${party.id}`} onSelect={() => field.onChange(party.id)}>
                                    <Check className={cn("mr-2 h-4 w-4", field.value === party.id ? "opacity-100" : "opacity-0")} />{party.name}
                                </CommandItem>)}
                            </CommandGroup></CommandList>
                        </Command></PopoverContent></Popover>
                    )}/>
                    </TableCell>
                    <TableCell>
                    <FormField control={form.control} name={`items.${index}.recAmount`} render={({ field }) => <Input type="number" className="h-9" {...field} onChange={e => field.onChange(parseFloat(e.target.value) || 0)} />} />
                    </TableCell>
                    <TableCell>
                    <FormField control={form.control} name={`items.${index}.payAmount`} render={({ field }) => <Input type="number" className="h-9" {...field} onChange={e => field.onChange(parseFloat(e.target.value) || 0)} />} />
                    </TableCell>
                    <TableCell>
                    <FormField control={form.control} name={`items.${index}.narration`} render={({ field }) => <Input className="h-9" {...field} value={field.value ?? ''} />} />
                    </TableCell>
                    <TableCell>
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => remove(index)}><Trash2 className="h-4 w-4"/></Button>
                    </TableCell>
                </TableRow>
                ))}
            </TableBody>
            </Table>
        </div>
        <Button type="button" size="sm" variant="outline" className="mt-2" onClick={() => append({ ledgerId: '', vehicleId: '', recAmount: 0, payAmount: 0, narration: '' })}>
            <Plus className="mr-2 h-4 w-4"/> Add Entry Row
        </Button>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-8">
            <Card className="lg:col-span-2 bg-muted/20 border-dashed">
                <CardHeader className="py-4"><CardTitle className="text-sm font-bold uppercase">Balance Verification</CardTitle></CardHeader>
                <CardContent className="p-0">
                    <Table className="text-xs">
                    <TableHeader>
                        <TableRow>
                        <TableHead className="w-[50px] text-center">S.No</TableHead>
                        <TableHead>Vehicle</TableHead>
                        <TableHead>Ledger</TableHead>
                        <TableHead className="text-right">A/C Receivable</TableHead>
                        <TableHead className="text-right">A/C Payable</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {summaryData.map((item, index) => (
                            <TableRow key={index}>
                            <TableCell className="text-center">{index + 1}</TableCell>
                            <TableCell>{item.vehicleName}</TableCell>
                            <TableCell>{item.ledgerName}</TableCell>
                            <TableCell className="text-right">{item.receivable.toLocaleString()}</TableCell>
                            <TableCell className="text-right">{item.payable.toLocaleString()}</TableCell>
                            </TableRow>
                        ))}
                        {summaryData.length === 0 && <TableRow><TableCell colSpan={5} className="text-center py-4 text-muted-foreground">Add items to see impact summary.</TableCell></TableRow>}
                    </TableBody>
                    </Table>
                </CardContent>
            </Card>
            
            <Card className="bg-blue-600 text-white shadow-lg">
                <CardHeader className="py-4"><CardTitle className="text-sm font-bold uppercase">Final Settlement</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex justify-between items-center text-sm border-b border-white/20 pb-2">
                        <span className="opacity-80">Total Receipt</span>
                        <span className="font-mono font-bold">Rs. {totalRec.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm border-b border-white/20 pb-2">
                        <span className="opacity-80">Total Payment</span>
                        <span className="font-mono font-bold">Rs. {totalPay.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                    </div>
                    <div className="flex flex-col gap-1 pt-2">
                        <span className="text-[10px] uppercase font-bold opacity-70">Net Settlement Amount</span>
                        <span className="text-3xl font-mono font-black">Rs. {Math.abs(netAmount).toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                        <Badge variant="outline" className="w-fit text-[10px] bg-white/10 text-white border-white/20">
                            {netAmount >= 0 ? 'NET RECEIVABLE' : 'NET PAYABLE'}
                        </Badge>
                    </div>
                    <FormField control={form.control} name="remarks" render={({ field }) => (
                        <FormItem className="mt-6"><FormLabel className="text-white/80">General Remarks</FormLabel><FormControl><Textarea {...field} value={field.value ?? ''} className="bg-white/10 text-white border-white/20 placeholder:text-white/40 min-h-[60px]" placeholder="Add any extra details here..."/></FormControl><FormMessage /></FormItem>
                    )}/>
                </CardContent>
            </Card>
        </div>

        <div className="flex justify-end gap-3 pt-6 border-t">
            <Button type="button" variant="outline" className="h-11 px-8" onClick={onCancel}>Cancel</Button>
            <Button type="submit" className="h-11 px-12 font-bold">{initialValues?.items ? 'Update Voucher' : 'Post Voucher'}</Button>
        </div>
      </form>
    </Form>
  );
}