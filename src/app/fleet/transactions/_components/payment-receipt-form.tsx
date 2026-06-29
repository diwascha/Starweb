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
import { CalendarIcon, ChevronsUpDown, Check, Plus, Trash2, PlusCircle } from 'lucide-react';
import { DualCalendar } from '@/components/ui/dual-calendar';
import { format } from 'date-fns';
import { cn, toNepaliDate } from '@/lib/utils';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAuth } from '@/hooks/use-auth';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { addParty } from '@/services/party-service';

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
  const [isBillingPopoverOpen, setIsBillingPopoverOpen] = React.useState(false);
  
  // Quick Add Party State
  const [isPartyDialogOpen, setIsPartyDialogOpen] = React.useState(false);
  const [partyForm, setPartyForm] = React.useState<{name: string, type: PartyType, ownership: AccountOwnership, address: string}>({ name: '', type: 'Vendor', ownership: 'Sijan', address: '' });
  const [currentRowIndex, setCurrentRowIndex] = React.useState<number | null>(null);

  // Filter for Sijan related accounts only
  const sijanAccounts = React.useMemo(() => 
    accounts.filter(a => 
      (a.type === 'Bank') && 
      (a.ownership === 'Sijan' || a.ownership === 'Both')
    ), [accounts]);

  // Filter for Sijan related ledgers (parties) only
  const generalLedgers = React.useMemo(() => 
    parties.filter(p => 
        p.ownership === 'Sijan' || p.ownership === 'Both'
    ), [parties]);

  const form = useForm<VoucherFormValues>({
    resolver: zodResolver(voucherSchema),
    defaultValues: {
      billingType: 'Cash',
      voucherNo: 'PRV-001',
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
  const watchedAccountId = form.watch("accountId");
  
  const totalRec = watchedItems.reduce((sum, item) => sum + (Number(item.recAmount) || 0), 0);
  const totalPay = watchedItems.reduce((sum, item) => sum + (Number(item.payAmount) || 0), 0);
  const netAmount = totalRec - totalPay;
  
  const summaryData = watchedItems.map(item => {
    const { ledgerId, vehicleId, recAmount = 0, payAmount = 0 } = item;
    
    if (!ledgerId && !vehicleId) {
      return { ledgerName: 'N/A', vehicleName: 'N/A', receivable: 0, payable: 0 };
    }

    const filteredTxns = transactions.filter(t => {
      const partyMatch = ledgerId ? t.partyId === ledgerId : false;
      const vehicleMatch = vehicleId ? t.vehicleId === vehicleId : false;
      if (ledgerId && vehicleId) return partyMatch && vehicleMatch;
      return partyMatch || vehicleMatch;
    });

    const balances = filteredTxns.reduce((acc, t) => {
      if (t.type === 'Sales') acc.receivables += t.amount;
      if (t.type === 'Receipt') acc.receivables -= t.amount;
      if (t.type === 'Purchase') acc.payables += t.amount;
      if (t.type === 'Payment') acc.payables -= t.amount;
      return acc;
    }, { receivables: 0, payables: 0 });

    return {
      ledgerName: parties.find(p => p.id === ledgerId)?.name || 'N/A',
      vehicleName: vehicles.find(v => v.id === vehicleId)?.name || 'N/A',
      receivable: balances.receivables - recAmount,
      payable: balances.payables - payAmount,
    };
  });

  const getBillingLabel = () => {
      if (watchedBillingType === 'Cash') return 'Cash';
      if (watchedBillingType === 'Bank' && watchedAccountId) {
          const account = sijanAccounts.find(a => a.id === watchedAccountId);
          return account ? (account.bankName ? `${account.bankName} - ${account.accountNumber}` : account.name) : 'Bank Selected';
      }
      return 'Select billing source...';
  };


  const handleSubmit = (values: VoucherFormValues) => {
    onFormSubmit(values);
  };
  
  const handleQuickAddParty = async () => {
    if (!user || !partyForm.name || !partyForm.ownership) return;
    try {
        const id = await addParty({ ...partyForm, createdBy: user.username });
        if (currentRowIndex !== null) {
            form.setValue(`items.${currentRowIndex}.ledgerId`, id);
        }
        setIsPartyDialogOpen(false);
        setPartyForm({ name: '', type: 'Vendor', ownership: 'Sijan', address: '' });
        setCurrentRowIndex(null);
        toast({ title: 'Party Added' });
    } catch {
        toast({ title: 'Error adding party', variant: 'destructive' });
    }
  };
  
  return (
    <>
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
        <Card className="bg-blue-50 border-blue-200 p-6 shadow-sm">
          <CardContent className="p-0">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-end">
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
              
              <FormItem>
                <FormLabel>Billing Source (Cash / Bank)</FormLabel>
                <Popover open={isBillingPopoverOpen} onOpenChange={setIsBillingPopoverOpen}>
                  <PopoverTrigger asChild>
                    <FormControl>
                      <Button variant="outline" role="combobox" className="w-full justify-between bg-white h-10 text-xs overflow-hidden">
                        <span className="truncate">{getBillingLabel()}</span>
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent className="p-0 w-[--radix-popover-trigger-width]">
                    <Command>
                      <CommandInput placeholder="Search Cash or Bank..." />
                      <CommandList>
                        <CommandEmpty>No source found.</CommandEmpty>
                        <CommandGroup heading="Available Sources">
                          <CommandItem 
                            value="Cash" 
                            onSelect={() => {
                                form.setValue("billingType", "Cash");
                                form.setValue("accountId", undefined);
                                setIsBillingPopoverOpen(false);
                            }}
                          >
                            <Check className={cn("mr-2 h-4 w-4", watchedBillingType === "Cash" ? "opacity-100" : "opacity-0")} />
                            <div className="flex flex-col">
                                <span className="font-bold">General Cash</span>
                                <span className="text-[10px] text-muted-foreground">Office Cash Account</span>
                            </div>
                          </CommandItem>
                          {sijanAccounts.map(account => (
                            <CommandItem 
                              key={account.id} 
                              value={`${account.name} ${account.bankName || ''} ${account.accountNumber || ''} ${account.id}`}
                              onSelect={() => {
                                  form.setValue("billingType", "Bank");
                                  form.setValue("accountId", account.id);
                                  setIsBillingPopoverOpen(false);
                              }}
                            >
                              <Check className={cn("mr-2 h-4 w-4", watchedAccountId === account.id ? "opacity-100" : "opacity-0")} />
                              <div className="flex flex-col">
                                  <span className="font-bold text-xs">{account.bankName ? account.bankName : account.name}</span>
                                  <span className="text-[10px] text-muted-foreground uppercase">{account.accountNumber ? `A/C: ${account.accountNumber}` : 'Bank Account'}</span>
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
            </div>
            
            {watchedBillingType === 'Bank' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-end mt-6 pt-6 border-t border-blue-100">
                  <FormField 
                    control={form.control} 
                    name="chequeNo" 
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Cheque / Reference Number</FormLabel>
                        <FormControl>
                          <Input {...field} value={field.value ?? ''} className="bg-white" placeholder="Enter cheque or transaction ID"/>
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
                        <FormLabel>Cheque / Transaction Date</FormLabel>
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
              </div>
            )}
          </CardContent>
        </Card>

        <div className="border rounded-lg overflow-hidden shadow-sm">
            <Table>
            <TableHeader>
                <TableRow>
                <TableHead className="w-[50px] text-center">S.No</TableHead>
                <TableHead>Vehicle</TableHead>
                <TableHead>General Ledger (A/C)</TableHead>
                <TableHead className="w-[140px]">Rec Amount</TableHead>
                <TableHead className="w-[140px]">Pay Amount</TableHead>
                <TableHead>Narration / Entry Remark</TableHead>
                <TableHead className="w-[50px]"></TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {fields.map((item, index) => (
                <TableRow key={item.id} className="h-14">
                    <TableCell className="text-center font-medium">{index + 1}</TableCell>
                    <TableCell>
                        <FormField control={form.control} name={`items.${index}.vehicleId`} render={({ field }) => (
                            <Select onValueChange={field.onChange} value={field.value}>
                                <FormControl>
                                    <SelectTrigger className="h-9">
                                        <SelectValue placeholder="Select vehicle" />
                                    </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                    {vehicles.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        )}/>
                    </TableCell>
                    <TableCell>
                    <FormField control={form.control} name={`items.${index}.ledgerId`} render={({ field }) => (
                        <div className="flex gap-2">
                        <Popover><PopoverTrigger asChild><FormControl>
                            <Button variant="outline" role="combobox" className="w-full justify-between h-9 font-normal">
                                {field.value ? generalLedgers.find(p => p.id === field.value)?.name : "Select ledger..."}<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                        </FormControl></PopoverTrigger><PopoverContent className="p-0 w-[--radix-popover-trigger-width]"><Command>
                            <CommandInput placeholder="Search ledger..." />
                            <CommandList>
                                <CommandEmpty>
                                    <Button variant="ghost" className="w-full justify-start text-xs" onClick={() => { setCurrentRowIndex(index); setIsPartyDialogOpen(true); }}>
                                        <PlusCircle className="mr-2 h-4 w-4" /> Add New Party
                                    </Button>
                                </CommandEmpty>
                                <CommandGroup>
                                {generalLedgers.map(party => <CommandItem key={party.id} value={`${party.name} ${party.ownership} ${party.id}`} onSelect={() => field.onChange(party.id)}>
                                    <Check className={cn("mr-2 h-4 w-4", field.value === party.id ? "opacity-100" : "opacity-0")} />{party.name}
                                </CommandItem>)}
                            </CommandGroup></CommandList>
                        </Command></PopoverContent></Popover>
                        <Button type="button" size="icon" variant="outline" className="h-9 w-9 shrink-0" onClick={() => { setCurrentRowIndex(index); setIsPartyDialogOpen(true); }}><Plus className="h-4 w-4"/></Button>
                        </div>
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
        
        <div className="space-y-6 mt-8">
            <Card className="bg-muted/20 border-dashed">
                <CardHeader className="py-4"><CardTitle className="text-sm font-bold uppercase">Balance Summary Impact</CardTitle></CardHeader>
                <CardContent className="p-0">
                    <Table className="text-xs">
                    <TableHeader>
                        <TableRow>
                        <TableHead className="w-[50px] text-center">S.No</TableHead>
                        <TableHead>Vehicle</TableHead>
                        <TableHead>Ledger (A/C)</TableHead>
                        <TableHead className="text-right">Estimated Receivable</TableHead>
                        <TableHead className="text-right">Estimated Payable</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {summaryData.map((item, index) => (
                            <TableRow key={index}>
                            <TableCell className="text-center">{index + 1}</TableCell>
                            <TableCell>{item.vehicleName}</TableCell>
                            <TableCell>{item.ledgerName}</TableCell>
                            <TableCell className="text-right font-mono">{item.receivable.toLocaleString()}</TableCell>
                            <TableCell className="text-right font-mono">{item.payable.toLocaleString()}</TableCell>
                            </TableRow>
                        ))}
                        {summaryData.length === 0 && <TableRow><TableCell colSpan={5} className="text-center py-4 text-muted-foreground">Add items to see impact summary.</TableCell></TableRow>}
                    </TableBody>
                    </Table>
                </CardContent>
            </Card>
            
            <Card className="bg-blue-600 text-white shadow-lg">
                <CardContent className="p-6">
                    <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-8">
                        <div className="flex flex-col sm:flex-row gap-8 sm:gap-12">
                            <div className="space-y-1">
                                <span className="text-[10px] uppercase font-bold opacity-70 tracking-widest">Total Receipt</span>
                                <p className="text-xl font-mono font-bold">Rs. {totalRec.toLocaleString(undefined, {minimumFractionDigits: 2})}</p>
                            </div>
                            <div className="space-y-1">
                                <span className="text-[10px] uppercase font-bold opacity-70 tracking-widest">Total Payment</span>
                                <p className="text-xl font-mono font-bold">Rs. {totalPay.toLocaleString(undefined, {minimumFractionDigits: 2})}</p>
                            </div>
                            <div className="space-y-1">
                                <span className="text-[10px] uppercase font-bold opacity-70 tracking-widest">Net Settlement</span>
                                <div className="flex items-center gap-3">
                                    <span className="text-2xl font-mono font-black">Rs. {Math.abs(netAmount).toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                                    <Badge variant="outline" className="bg-white/10 text-white border-white/20 text-[10px] px-2 py-0.5 font-black uppercase">
                                        {netAmount >= 0 ? 'NET RECEIVABLE' : 'NET PAYABLE'}
                                    </Badge>
                                </div>
                            </div>
                        </div>
                        
                        <div className="w-full lg:max-w-md">
                            <FormField control={form.control} name="remarks" render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="text-white/80 text-xs font-bold uppercase tracking-wider">General Remarks</FormLabel>
                                    <FormControl>
                                        <Textarea {...field} value={field.value ?? ''} className="bg-white/10 text-white border-white/20 placeholder:text-white/40 min-h-[60px] text-sm" placeholder="Add extra details for this settlement..."/>
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}/>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>

        <div className="flex justify-end gap-3 pt-6 border-t">
            <Button type="button" variant="outline" className="h-11 px-8" onClick={onCancel}>Cancel</Button>
            <Button type="submit" className="h-11 px-12 font-bold">{initialValues?.items ? 'Update Voucher' : 'Post Voucher'}</Button>
        </div>
      </form>
    </Form>

    <Dialog open={isPartyDialogOpen} onOpenChange={setIsPartyDialogOpen}>
        <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle>Quick Add Party</DialogTitle></DialogHeader>
            <div className="grid gap-4 py-4">
                <div className="space-y-2">
                    <Label>Party Name</Label>
                    <Input value={partyForm.name} onChange={e => setPartyForm({...partyForm, name: e.target.value})} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label>Category</Label>
                        <Select value={partyForm.type} onValueChange={(v: PartyType) => setPartyForm({...partyForm, type: v})}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="Vendor">Vendor</SelectItem>
                                <SelectItem value="Customer">Customer</SelectItem>
                                <SelectItem value="Both">Both</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label>Ownership</Label>
                        <Select value={partyForm.ownership} onValueChange={(v: AccountOwnership) => setPartyForm({...partyForm, ownership: v})}>
                            <SelectTrigger><SelectValue/></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="Sijan">Sijan Dhuwani</SelectItem>
                                <SelectItem value="Shivam">Shivam Packaging</SelectItem>
                                <SelectItem value="Both">Both</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
                <div className="space-y-2">
                    <Label>Address</Label>
                    <Input value={partyForm.address} onChange={e => setPartyForm({...partyForm, address: e.target.value})} />
                </div>
            </div>
            <DialogFooter>
                <Button variant="outline" onClick={() => setIsPartyDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleQuickAddParty}>Add Party</Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>
    </>
  );
}
