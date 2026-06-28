
'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DualCalendar } from '@/components/ui/dual-calendar';
import { format } from 'date-fns';
import { 
    Wallet, 
    Wrench, 
    Building2, 
    ShoppingCart, 
    CalendarIcon, 
    Plus, 
    Loader2, 
    Info,
    X,
    Save,
    MapPin,
    ChevronsUpDown,
    Check,
    PlusCircle,
    Lightbulb
} from 'lucide-react';
import { cn, toNepaliDate } from '@/lib/utils';
import type { Vehicle, Party, Account, AccountOwnership, PartyType, Transaction, Destination } from '@/lib/types';
import type { Expense, ExpenseType } from '@/lib/expense-types';
import { addExpense, onExpensesUpdate } from '@/services/expense-service';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { addParty } from '@/services/party-service';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { onDestinationsUpdate, addDestination } from '@/services/destination-service';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';

const expenseTypes: { type: ExpenseType; label: string; sub: string; icon: any; color: string }[] = [
    { type: 'Advance', label: 'Advance / Peski', sub: 'Trip advance', icon: Wallet, color: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
    { type: 'Maintenance', label: 'Maintenance Fee', sub: 'Repair / Service', icon: Wrench, color: 'text-blue-600 bg-blue-50 border-blue-200' },
    { type: 'Loan Repayment', label: 'Loan Repayment', sub: 'Bank / EMI', icon: Building2, color: 'text-orange-600 bg-orange-50 border-orange-200' },
    { type: 'Purchase', label: 'Purchase / Payment', sub: 'Oil, tyre, resole, etc.', icon: ShoppingCart, color: 'text-cyan-600 bg-cyan-50 border-cyan-200' },
];

const expenseSchema = z.object({
    date: z.date(),
    vehicleId: z.string().min(1, "Truck is required."),
    expenseType: z.enum(['Advance', 'Maintenance', 'Purchase', 'Loan Repayment']),
    amount: z.number().min(1, "Amount must be positive."),
    paymentMode: z.enum(['Cash', 'Bank']),
    partyId: z.string().optional(),
    accountId: z.string().optional(),
    destination: z.string().optional(),
    remarks: z.string().max(200).optional(),
}).refine(data => {
    if (['Maintenance', 'Purchase'].includes(data.expenseType)) return !!data.partyId;
    return true;
}, { message: "Party / Supplier is required.", path: ['partyId'] })
.refine(data => {
    if (data.expenseType === 'Loan Repayment') return !!data.accountId;
    return true;
}, { message: "Loan Account is required.", path: ['accountId'] })
.refine(data => {
    if (data.paymentMode === 'Bank') return !!data.accountId;
    return true;
}, { message: "Bank Account is required for Bank payment.", path: ['accountId'] })
.refine(data => {
    if (data.expenseType === 'Advance') return !!data.destination && data.destination.trim() !== '';
    return true;
}, { message: "Destination is required for Advances.", path: ['destination'] });

interface ExpenseFormProps {
    vehicles: Vehicle[];
    parties: Party[];
    accounts: Account[];
    transactions: Transaction[];
}

export function ExpenseForm({ vehicles, parties, accounts, transactions }: ExpenseFormProps) {
    const { user } = useAuth();
    const { toast } = useToast();
    const router = useRouter();
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    // Additional Master Data
    const [destinations, setDestinations] = useState<Destination[]>([]);
    const [allExpenses, setAllExpenses] = useState<Expense[]>([]);
    const [destSearch, setDestSearch] = useState('');
    
    // Quick Add States
    const [isPartyDialogOpen, setIsPartyDialogOpen] = useState(false);
    const [partyForm, setPartyForm] = useState<{name: string, type: PartyType, ownership: AccountOwnership, address: string}>({ 
        name: '', type: 'Vendor', ownership: 'Sijan', address: '' 
    });
    const [isDestDialogOpen, setIsDestDialogOpen] = useState(false);
    const [newDestName, setNewDestName] = useState('');

    const form = useForm<z.infer<typeof expenseSchema>>({
        resolver: zodResolver(expenseSchema),
        defaultValues: {
            date: new Date(),
            expenseType: 'Advance',
            paymentMode: 'Cash',
            amount: 0,
            remarks: '',
        }
    });

    const watchedType = form.watch('expenseType');
    const watchedMode = form.watch('paymentMode');
    const watchedPartyId = form.watch('partyId');
    const watchedDestination = form.watch('destination');

    useEffect(() => {
        const unsubDest = onDestinationsUpdate(setDestinations);
        const unsubExp = onExpensesUpdate(setAllExpenses);
        return () => { unsubDest(); unsubExp(); };
    }, []);

    const sijanParties = parties.filter(p => p.ownership === 'Sijan' || p.ownership === 'Both');
    const sijanAccounts = accounts.filter(a => (a.ownership === 'Sijan' || a.ownership === 'Both') && (a.type === 'Bank' || a.type === 'Cash'));

    // Historical Advance Lookup
    const suggestedAdvance = useMemo(() => {
        if (watchedType !== 'Advance' || !watchedDestination) return null;
        const previousAdvances = allExpenses.filter(e => 
            e.expenseType === 'Advance' && 
            e.destination?.toLowerCase() === watchedDestination.toLowerCase() &&
            e.amount > 0
        );
        if (previousAdvances.length === 0) return null;
        // Get the most recent amount
        return previousAdvances[0].amount;
    }, [watchedType, watchedDestination, allExpenses]);

    const partyBalance = useMemo(() => {
        if (!watchedPartyId) return null;
        const filteredTxns = transactions.filter(t => t.partyId === watchedPartyId);
        const balance = filteredTxns.reduce((acc, t) => {
            if (t.type === 'Sales') acc.receivables += t.amount;
            if (t.type === 'Receipt') acc.receivables -= t.amount;
            if (t.type === 'Purchase') acc.payables += t.amount;
            if (t.type === 'Payment') acc.payables -= t.amount;
            return acc;
        }, { receivables: 0, payables: 0 });
        return balance;
    }, [watchedPartyId, transactions]);

    const onSubmit = async (values: z.infer<typeof expenseSchema>) => {
        if (!user) return;
        setIsSubmitting(true);
        try {
            await addExpense({
                ...values,
                date: values.date.toISOString(),
                createdBy: user.username,
            });
            toast({ title: 'Success', description: 'Expense recorded successfully.' });
            form.reset({
                ...form.getValues(),
                amount: 0,
                remarks: '',
                partyId: '',
                destination: '',
            });
            setDestSearch('');
        } catch (error: any) {
            console.error("Expense Save Failure:", error);
            toast({ title: 'Save Failed', description: error.message || 'Check connection and try again.', variant: 'destructive' });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleQuickAddParty = async () => {
        if (!user || !partyForm.name || !partyForm.ownership) return;
        try {
            const id = await addParty({ ...partyForm, createdBy: user.username });
            form.setValue('partyId', id);
            setIsPartyDialogOpen(false);
            setPartyForm({ name: '', type: 'Vendor', ownership: 'Sijan', address: '' });
            toast({ title: 'Party Added' });
        } catch {
            toast({ title: 'Error adding party', variant: 'destructive' });
        }
    };

    const handleQuickAddDest = async () => {
        if (!user || !newDestName.trim()) return;
        try {
            await addDestination({ name: newDestName.trim(), createdBy: user.username });
            form.setValue('destination', newDestName.trim());
            setIsDestDialogOpen(false);
            setNewDestName('');
            toast({ title: 'Destination Added' });
        } catch {
            toast({ title: 'Error adding destination', variant: 'destructive' });
        }
    };

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FormField control={form.control} name="date" render={({ field }) => (
                        <FormItem className="flex flex-col">
                            <FormLabel>Date</FormLabel>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <FormControl>
                                        <Button variant="outline" className={cn("pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>
                                            <CalendarIcon className="mr-2 h-4 w-4" />
                                            {field.value ? `${toNepaliDate(field.value.toISOString())} (${format(field.value, "PP")})` : <span>Pick a date</span>}
                                        </Button>
                                    </FormControl>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                    <DualCalendar selected={field.value} onSelect={field.onChange} />
                                </PopoverContent>
                            </Popover>
                            <FormMessage />
                        </FormItem>
                    )} />

                    <FormField control={form.control} name="vehicleId" render={({ field }) => (
                        <FormItem>
                            <FormLabel>Truck (Vehicle) <span className="text-destructive">*</span></FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                                <FormControl>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select a truck" />
                                    </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                    {vehicles.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                    )} />
                </div>

                <div className="space-y-3">
                    <FormLabel>Expense Type <span className="text-destructive">*</span></FormLabel>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {expenseTypes.map((item) => (
                            <button
                                key={item.type}
                                type="button"
                                onClick={() => form.setValue('expenseType', item.type as any)}
                                className={cn(
                                    "flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all text-center gap-2",
                                    watchedType === item.type 
                                        ? cn("ring-2 ring-primary border-primary", item.color)
                                        : "border-muted bg-white hover:bg-muted/50"
                                )}
                            >
                                <item.icon className={cn("h-8 w-8", watchedType === item.type ? "" : "text-muted-foreground")} />
                                <div>
                                    <p className="text-xs font-bold leading-tight">{item.label}</p>
                                    <p className="text-[10px] opacity-60 mt-0.5">{item.sub}</p>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>

                {watchedType === 'Advance' && (
                    <FormField control={form.control} name="destination" render={({ field }) => (
                        <FormItem className="flex flex-col">
                            <FormLabel>Destination (Location) <span className="text-destructive">*</span></FormLabel>
                            <div className="flex gap-2">
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <FormControl>
                                            <Button variant="outline" role="combobox" className={cn("w-full justify-between h-12 text-base font-normal", !field.value && "text-muted-foreground")}>
                                                <div className="flex items-center gap-2">
                                                    <MapPin className="h-4 w-4 opacity-50" />
                                                    {field.value || "Select destination..."}
                                                </div>
                                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                            </Button>
                                        </FormControl>
                                    </PopoverTrigger>
                                    <PopoverContent className="p-0 w-[--radix-popover-trigger-width]">
                                        <Command>
                                            <CommandInput placeholder="Search location..." onValueChange={setDestSearch} />
                                            <CommandList>
                                                <CommandEmpty>
                                                    <Button variant="ghost" className="w-full justify-start text-xs" onClick={() => { setNewDestName(destSearch); setIsDestDialogOpen(true); }}>
                                                        <PlusCircle className="mr-2 h-4 w-4" /> Add "{destSearch}"
                                                    </Button>
                                                </CommandEmpty>
                                                <CommandGroup>
                                                    {destinations.map(d => (
                                                        <CommandItem key={d.id} value={d.name} onSelect={() => field.onChange(d.name)}>
                                                            <Check className={cn("mr-2 h-4 w-4", field.value === d.name ? "opacity-100" : "opacity-0")} />
                                                            {d.name}
                                                        </CommandItem>
                                                    ))}
                                                </CommandGroup>
                                            </CommandList>
                                        </Command>
                                    </PopoverContent>
                                </Popover>
                                <Button type="button" variant="outline" size="icon" className="h-12 w-12 shrink-0" onClick={() => setIsDestDialogOpen(true)}>
                                    <Plus className="h-5 w-5" />
                                </Button>
                            </div>
                            <FormMessage />
                        </FormItem>
                    )} />
                )}

                <div className={cn(
                    "flex items-center gap-4 p-3 rounded-lg border bg-blue-50/50 text-blue-800 text-sm",
                    watchedType === 'Advance' && !suggestedAdvance && "hidden"
                )}>
                    <Info className="h-4 w-4 shrink-0" />
                    <span className="flex-1">
                        {watchedType === 'Maintenance' && "Maintenance selected • Select the party who provided the service."}
                        {watchedType === 'Purchase' && "Purchase selected • Select the supplier for the item."}
                        {watchedType === 'Loan Repayment' && "Loan Repayment selected • Select the bank account where the EMI was paid."}
                        {watchedType === 'Advance' && suggestedAdvance && (
                            <div className="flex items-center gap-2">
                                <Lightbulb className="h-4 w-4 text-amber-600" />
                                <span>Previous advance to <b>{watchedDestination}</b> was <b>Rs. {suggestedAdvance.toLocaleString()}</b>.</span>
                                <Button 
                                    type="button" 
                                    variant="link" 
                                    size="sm" 
                                    className="h-auto p-0 font-bold underline"
                                    onClick={() => form.setValue('amount', suggestedAdvance)}
                                >
                                    Use this amount
                                </Button>
                            </div>
                        )}
                    </span>
                    {['Maintenance', 'Purchase'].includes(watchedType) && (
                        <Button type="button" variant="outline" size="sm" onClick={() => setIsPartyDialogOpen(true)} className="bg-white">
                            <Plus className="mr-1 h-3 w-3" /> Add New Party
                        </Button>
                    )}
                </div>

                {['Maintenance', 'Purchase'].includes(watchedType) && (
                    <FormField control={form.control} name="partyId" render={({ field }) => (
                        <FormItem>
                            <FormLabel>
                                Party / Service Provider <span className="text-destructive">*</span>
                            </FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                                <FormControl>
                                    <SelectTrigger className="h-12 text-base">
                                        <SelectValue placeholder="Search or select party..." />
                                    </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                    {sijanParties.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                            {partyBalance && (
                                <div className="flex gap-4 mt-1.5 px-1">
                                    {partyBalance.payables !== 0 && (
                                        <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-800 border-amber-200">
                                            Current Payable: Rs. {partyBalance.payables.toLocaleString()}
                                        </Badge>
                                    )}
                                    {partyBalance.receivables !== 0 && (
                                        <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-800 border-emerald-200">
                                            Current Receivable: Rs. {partyBalance.receivables.toLocaleString()}
                                        </Badge>
                                    )}
                                </div>
                            )}
                            <FormMessage />
                        </FormItem>
                    )} />
                )}

                {(watchedType === 'Loan Repayment' || watchedMode === 'Bank') && (
                    <FormField control={form.control} name="accountId" render={({ field }) => (
                        <FormItem>
                            <FormLabel>{watchedType === 'Loan Repayment' ? 'Loan Account (Bank)' : 'Source Bank Account'} <span className="text-destructive">*</span></FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                                <FormControl>
                                    <SelectTrigger className="h-12">
                                        <SelectValue placeholder="Select bank account" />
                                    </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                    {sijanAccounts.map(a => <SelectItem key={a.id} value={a.id}>{a.bankName} - {a.accountNumber}</SelectItem>)}
                                </SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                    )} />
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-end">
                    <FormField control={form.control} name="amount" render={({ field }) => (
                        <FormItem>
                            <FormLabel>Amount (Rs.) <span className="text-destructive">*</span></FormLabel>
                            <FormControl>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">Rs.</span>
                                    <Input 
                                        type="number" 
                                        className="pl-10 h-12 text-lg font-bold" 
                                        {...field} 
                                        onChange={e => field.onChange(parseFloat(e.target.value) || 0)} 
                                    />
                                </div>
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )} />

                    <FormField control={form.control} name="paymentMode" render={({ field }) => (
                        <FormItem className="space-y-2">
                            <FormLabel>Payment Mode</FormLabel>
                            <div className="flex gap-2">
                                <Button
                                    type="button"
                                    variant={field.value === 'Cash' ? 'default' : 'outline'}
                                    className="flex-1 h-12"
                                    onClick={() => field.onChange('Cash')}
                                >
                                    <Wallet className="mr-2 h-4 w-4" /> Cash
                                </Button>
                                <Button
                                    type="button"
                                    variant={field.value === 'Bank' ? 'default' : 'outline'}
                                    className="flex-1 h-12"
                                    onClick={() => field.onChange('Bank')}
                                >
                                    <Building2 className="mr-2 h-4 w-4" /> Bank
                                </Button>
                            </div>
                        </FormItem>
                    )} />
                </div>

                <FormField control={form.control} name="remarks" render={({ field }) => (
                    <FormItem>
                        <FormLabel>Remarks <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                        <FormControl>
                            <div className="relative">
                                <Textarea 
                                    placeholder="Enter additional details..." 
                                    className="min-h-[100px] resize-none" 
                                    {...field} 
                                />
                                <span className="absolute bottom-2 right-2 text-[10px] text-muted-foreground">
                                    {(field.value || '').length} / 200
                                </span>
                            </div>
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                )} />

                <div className="flex items-center gap-3 pt-4 border-t">
                    <Button type="submit" size="lg" className="px-10 h-12" disabled={isSubmitting}>
                        {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</> : <><Save className="mr-2 h-4 w-4" /> Save Expense</>}
                    </Button>
                    <Button type="button" variant="outline" size="lg" className="h-12" onClick={() => form.reset()}>
                        <X className="mr-2 h-4 w-4" /> Clear
                    </Button>
                </div>
            </form>

            <Dialog open={isPartyDialogOpen} onOpenChange={setIsPartyDialogOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader><DialogTitle>Quick Add Supplier</DialogTitle></DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="space-y-2">
                            <Label>Supplier Name</Label>
                            <Input value={partyForm.name} onChange={e => setPartyForm({...partyForm, name: e.target.value})} />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Category</Label>
                                <Select value={partyForm.type} onValueChange={(v: PartyType) => setPartyForm({...partyForm, type: v})}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="Vendor">Service Provider / Vendor</SelectItem>
                                        <SelectItem value="Customer">Client / RT Customer</SelectItem>
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
                        <Button onClick={handleQuickAddParty}>Add Supplier</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={isDestDialogOpen} onOpenChange={setIsDestDialogOpen}>
                <DialogContent className="sm:max-w-sm">
                    <DialogHeader><DialogTitle>Quick Add Destination</DialogTitle></DialogHeader>
                    <div className="py-4 space-y-4">
                        <div className="space-y-2">
                            <Label>Destination Name</Label>
                            <Input 
                                value={newDestName} 
                                onChange={e => setNewDestName(e.target.value)} 
                                placeholder="e.g. BIRTAMODE"
                                onKeyDown={e => e.key === 'Enter' && handleQuickAddDest()}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsDestDialogOpen(false)}>Cancel</Button>
                        <Button onClick={handleQuickAddDest}>Add Location</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </Form>
    );
}
