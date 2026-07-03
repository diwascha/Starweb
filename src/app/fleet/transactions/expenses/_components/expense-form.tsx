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
    Lightbulb,
    Edit,
    Trash2,
    DollarSign,
    PlusIcon,
    ShieldCheck,
    Briefcase,
    ArrowRightLeft
} from 'lucide-react';
import { cn, toNepaliDate } from '@/lib/utils';
import type { Vehicle, Party, Account, AccountOwnership, PartyType, Transaction, Destination } from '@/lib/types';
import type { Expense, ExpenseType } from '@/lib/expense-types';
import { addExpense, updateExpense } from '@/services/expense-service';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { addParty } from '@/services/party-service';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { onDestinationsUpdate, addDestination, updateDestination, deleteDestination } from '@/services/destination-service';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Separator } from '@/components/ui/separator';

const expenseTypes: { type: ExpenseType; label: string; sub: string; icon: any; color: string }[] = [
    { type: 'Advance', label: 'Advance / Peski', sub: 'Trip advance', icon: Wallet, color: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
    { type: 'Maintenance', label: 'Maintenance Fee', sub: 'Repair / Service', icon: Wrench, color: 'text-blue-600 bg-blue-50 border-blue-200' },
    { type: 'Loan Repayment', label: 'Loan Repayment', sub: 'Bank / EMI', icon: Building2, color: 'text-orange-600 bg-orange-50 border-orange-200' },
    { type: 'Membership Renewal', label: 'Renewal', sub: 'Policy / Tax', icon: ShieldCheck, color: 'text-purple-600 bg-purple-50 border-purple-200' },
    { type: 'Purchase', label: 'Cash Purchase', sub: 'Oil, spares, etc.', icon: ShoppingCart, color: 'text-cyan-600 bg-cyan-50 border-cyan-200' },
    { type: 'Shivam / Others', label: 'Shivam / Others', sub: 'Misc expenses', icon: Briefcase, color: 'text-pink-600 bg-pink-50 border-pink-200' },
];

const expenseSchema = z.object({
    voucherNo: z.string().min(1, "Voucher No is required."),
    date: z.date(),
    vehicleId: z.string().min(1, "Truck is required."),
    expenseType: z.enum(['Advance', 'Maintenance', 'Purchase', 'Loan Repayment', 'Membership Renewal', 'Shivam / Others']),
    amount: z.number().min(1, "Amount must be positive."),
    extraAmount: z.number().optional().default(0),
    extraRemarks: z.string().optional(),
    paymentMode: z.enum(['Cash', 'Bank', 'Mixed']),
    cashAmount: z.number().optional().default(0),
    bankAmount: z.number().optional().default(0),
    partyId: z.string().optional(),
    accountId: z.string().optional(),
    destination: z.string().optional(),
    remarks: z.string().max(200).optional(),
}).refine(data => {
    if (['Maintenance', 'Purchase', 'Membership Renewal', 'Shivam / Others'].includes(data.expenseType)) return !!data.partyId;
    return true;
}, { message: "Party / Supplier is required.", path: ['partyId'] })
.refine(data => {
    if (data.expenseType === 'Loan Repayment') return !!data.accountId;
    return true;
}, { message: "Loan Account is required.", path: ['accountId'] })
.refine(data => {
    if ((data.paymentMode === 'Bank' || data.paymentMode === 'Mixed') && data.expenseType !== 'Loan Repayment') return !!data.accountId;
    return true;
}, { message: "Bank Account is required for Bank/Mixed payment.", path: ['accountId'] })
.refine(data => {
    if (data.expenseType === 'Advance') return !!data.destination && data.destination.trim() !== '';
    return true;
}, { message: "Destination is required for Advances.", path: ['destination'] })
.refine(data => {
    if (data.paymentMode === 'Mixed') {
        const totalExpected = data.amount + (data.extraAmount || 0);
        return (data.cashAmount + data.bankAmount) === totalExpected;
    }
    return true;
}, { message: "Cash + Bank amount must equal Total settlement amount.", path: ['cashAmount'] });

interface ExpenseFormProps {
    vehicles: Vehicle[];
    parties: Party[];
    accounts: Account[];
    transactions: Transaction[];
    initialVoucherNo: string;
    expenseToEdit?: Expense;
}

export function ExpenseForm({ vehicles, parties, accounts, transactions, initialVoucherNo, expenseToEdit }: ExpenseFormProps) {
    const { user } = useAuth();
    const { toast } = useToast();
    const router = useRouter();
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    // Additional Master Data
    const [destinations, setDestinations] = useState<Destination[]>([]);
    const [destSearch, setDestSearch] = useState('');
    const [showExtraFields, setShowExtraFields] = useState(expenseToEdit?.extraAmount ? expenseToEdit.extraAmount > 0 : false);
    
    // Quick Add States
    const [isPartyDialogOpen, setIsPartyDialogOpen] = useState(false);
    const [partyForm, setPartyForm] = useState<{name: string, type: PartyType, ownership: AccountOwnership, address: string, panNumber: string}>({ 
        name: '', type: 'Vendor', ownership: 'Sijan', address: '', panNumber: ''
    });
    const [isDestDialogOpen, setIsDestDialogOpen] = useState(false);
    const [destForm, setDestForm] = useState({ name: '', standardAdvance: 0, remarks: '' });
    const [editingDestination, setEditingDestination] = useState<Destination | null>(null);

    const form = useForm<z.infer<typeof expenseSchema>>({
        resolver: zodResolver(expenseSchema),
        defaultValues: {
            voucherNo: expenseToEdit?.voucherNo || initialVoucherNo,
            date: expenseToEdit ? new Date(expenseToEdit.date) : new Date(),
            expenseType: expenseToEdit?.expenseType || 'Advance',
            paymentMode: expenseToEdit?.paymentMode || 'Cash',
            amount: expenseToEdit?.amount || 0,
            extraAmount: expenseToEdit?.extraAmount || 0,
            extraRemarks: expenseToEdit?.extraRemarks || '',
            remarks: expenseToEdit?.remarks || '',
            vehicleId: expenseToEdit?.vehicleId || '',
            partyId: expenseToEdit?.partyId || '',
            accountId: expenseToEdit?.accountId || '',
            destination: expenseToEdit?.destination || '',
            cashAmount: expenseToEdit?.cashAmount || 0,
            bankAmount: expenseToEdit?.bankAmount || 0,
        }
    });

    useEffect(() => {
        if (!expenseToEdit && initialVoucherNo) {
            form.setValue('voucherNo', initialVoucherNo);
        }
    }, [initialVoucherNo, form, expenseToEdit]);

    const watchedType = form.watch('expenseType');
    const watchedMode = form.watch('paymentMode');
    const watchedPartyId = form.watch('partyId');
    const watchedDestinationName = form.watch('destination');
    const watchedAmount = form.watch('amount');
    const watchedExtraAmount = form.watch('extraAmount');
    const watchedCashAmount = form.watch('cashAmount');
    const watchedBankAmount = form.watch('bankAmount');

    useEffect(() => {
        const unsubDest = onDestinationsUpdate(setDestinations);
        return () => unsubDest();
    }, []);

    const sijanParties = parties.filter(p => p.ownership === 'Sijan' || p.ownership === 'Both');
    const sijanAccounts = accounts.filter(a => (a.ownership === 'Sijan' || a.ownership === 'Both') && (a.type === 'Bank' || a.type === 'Cash'));

    const routeStandardAmount = useMemo(() => {
        if (watchedType !== 'Advance' || !watchedDestinationName) return null;
        const dest = destinations.find(d => d.name === watchedDestinationName);
        return dest?.standardAdvanceAmount || null;
    }, [watchedType, watchedDestinationName, destinations]);

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

    const handleBalanceSplit = (type: 'cash' | 'bank') => {
        const total = watchedAmount + watchedExtraAmount;
        if (type === 'cash') {
            form.setValue('cashAmount', Math.max(0, total - watchedBankAmount));
        } else {
            form.setValue('bankAmount', Math.max(0, total - watchedCashAmount));
        }
    };

    const onSubmit = async (values: z.infer<typeof expenseSchema>) => {
        if (!user) return;
        setIsSubmitting(true);
        try {
            if (expenseToEdit) {
                await updateExpense(expenseToEdit.id, {
                    ...values,
                    date: values.date.toISOString(),
                }, user.username);
                toast({ title: 'Success', description: 'Expense updated successfully.' });
            } else {
                await addExpense({
                    ...values,
                    date: values.date.toISOString(),
                    createdBy: user.username,
                });
                toast({ title: 'Success', description: 'Expense recorded successfully.' });
            }
            router.push('/fleet/transactions/expenses');
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
            setPartyForm({ name: '', type: 'Vendor', ownership: 'Sijan', address: '', panNumber: '' });
            toast({ title: 'Party Added' });
        } catch {
            toast({ title: 'Error adding party', variant: 'destructive' });
        }
    };

    const handleOpenDestinationDialog = (destination: Destination | null = null) => {
        if (destination) {
            setEditingDestination(destination);
            setDestForm({ 
                name: destination.name, 
                standardAdvance: destination.standardAdvanceAmount || 0,
                remarks: destination.remarks || ''
            });
        } else {
            setEditingDestination(null);
            setDestForm({ name: destSearch, standardAdvance: 0, remarks: '' });
        }
        setIsDestDialogOpen(true);
    };

    const handleQuickAddDest = async () => {
        if (!user || !destForm.name.trim()) return;
        try {
            if (editingDestination) {
                await updateDestination(editingDestination.id, { 
                    name: destForm.name.trim(), 
                    standardAdvanceAmount: Number(destForm.standardAdvance) || 0,
                    remarks: destForm.remarks.trim(),
                    lastModifiedBy: user.username 
                });
                toast({ title: 'Destination Updated' });
            } else {
                await addDestination({ 
                    name: destForm.name.trim(), 
                    standardAdvanceAmount: Number(destForm.standardAdvance) || 0,
                    remarks: destForm.remarks.trim(),
                    createdBy: user.username 
                });
                form.setValue('destination', destForm.name.trim());
                toast({ title: 'Destination Added' });
            }
            setIsDestDialogOpen(false);
            setDestForm({ name: '', standardAdvance: 0, remarks: '' });
            setEditingDestination(null);
        } catch {
            toast({ title: 'Error saving destination', variant: 'destructive' });
        }
    };

    const handleDeleteDest = async () => {
        if (!editingDestination) return;
        try {
            await deleteDestination(editingDestination.id);
            toast({ title: 'Destination Deleted' });
            setIsDestDialogOpen(false);
            setEditingDestination(null);
            setDestForm({ name: '', standardAdvance: 0, remarks: '' });
        } catch {
            toast({ title: 'Error deleting destination', variant: 'destructive' });
        }
    };

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <FormField control={form.control} name="voucherNo" render={({ field }) => (
                        <FormItem>
                            <FormLabel>Voucher No.</FormLabel>
                            <FormControl>
                                <Input {...field} readOnly className="bg-muted/50 h-12 font-mono" />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )} />

                    <FormField control={form.control} name="date" render={({ field }) => (
                        <FormItem className="flex flex-col">
                            <FormLabel>Date</FormLabel>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <FormControl>
                                        <Button variant="outline" className={cn("pl-3 text-left font-normal h-12", !field.value && "text-muted-foreground")}>
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
                                    <SelectTrigger className="h-12">
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
                    <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
                        {expenseTypes.map((item) => (
                            <button
                                key={item.type}
                                type="button"
                                onClick={() => form.setValue('expenseType', item.type as any)}
                                className={cn(
                                    "flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all text-center gap-1.5",
                                    watchedType === item.type 
                                        ? cn("ring-2 ring-primary border-primary", item.color)
                                        : "border-muted bg-white hover:bg-muted/50"
                                )}
                            >
                                <item.icon className={cn("h-6 w-6", watchedType === item.type ? "" : "text-muted-foreground")} />
                                <div>
                                    <p className="text-[10px] font-bold leading-tight">{item.label}</p>
                                    <p className="text-[8px] opacity-60 mt-0.5">{item.sub}</p>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>

                {watchedType === 'Advance' && (
                    <FormField control={form.control} name="destination" render={({ field }) => (
                        <FormItem className="flex flex-col">
                            <FormLabel>Destination Route <span className="text-destructive">*</span></FormLabel>
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
                                                    <Button variant="ghost" className="w-full justify-start text-xs" onClick={() => handleOpenDestinationDialog()}>
                                                        <PlusCircle className="mr-2 h-4 w-4" /> Add "{destSearch}"
                                                    </Button>
                                                </CommandEmpty>
                                                <CommandGroup>
                                                    {destinations.map(d => (
                                                        <CommandItem 
                                                            key={d.id} 
                                                            value={d.name} 
                                                            onSelect={() => field.onChange(d.name)}
                                                            className="flex justify-between items-center"
                                                        >
                                                            <div className="flex items-center">
                                                                <Check className={cn("mr-2 h-4 w-4", field.value === d.name ? "opacity-100" : "opacity-0")} />
                                                                <div className="flex flex-col">
                                                                    <span>{d.name}</span>
                                                                    {d.standardAdvanceAmount && (
                                                                        <span className="text-[10px] text-muted-foreground uppercase font-bold">Standard: Rs. {d.standardAdvanceAmount.toLocaleString()}</span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                            <Button 
                                                                variant="ghost" 
                                                                size="icon" 
                                                                className="h-6 w-6" 
                                                                onClick={(e) => { 
                                                                    e.stopPropagation(); 
                                                                    handleOpenDestinationDialog(d); 
                                                                }}
                                                            >
                                                                <Edit className="h-4 w-4" />
                                                            </Button>
                                                        </CommandItem>
                                                    ))}
                                                </CommandGroup>
                                            </CommandList>
                                        </Command>
                                    </PopoverContent>
                                </Popover>
                                <Button type="button" variant="outline" size="icon" className="h-12 w-12 shrink-0" onClick={() => handleOpenDestinationDialog()}>
                                    <Plus className="h-5 w-5" />
                                </Button>
                            </div>
                            <FormMessage />
                        </FormItem>
                    )} />
                )}

                <div className={cn(
                    "flex items-center gap-4 p-3 rounded-lg border bg-blue-50/50 text-blue-800 text-sm",
                    watchedType === 'Advance' && !routeStandardAmount && "hidden"
                )}>
                    <Info className="h-4 w-4 shrink-0" />
                    <span className="flex-1">
                        {watchedType === 'Maintenance' && "Maintenance selected • Select the party who provided the service."}
                        {watchedType === 'Purchase' && "Purchase selected • Select the supplier for the item."}
                        {watchedType === 'Loan Repayment' && "Loan Repayment selected • Select the bank account where the EMI was paid."}
                        {watchedType === 'Membership Renewal' && "Renewal selected • Select the authority or agency paid."}
                        {watchedType === 'Shivam / Others' && "Shivam / Others selected • Select the relevant party or leave blank for misc."}
                        {watchedType === 'Advance' && routeStandardAmount && (
                            <div className="flex items-center gap-2">
                                <Lightbulb className="h-4 w-4 text-amber-600" />
                                <span>The standard advance for <b>{watchedDestinationName}</b> is <b>Rs. {routeStandardAmount.toLocaleString()}</b>.</span>
                                <Button 
                                    type="button" 
                                    variant="link" 
                                    size="sm" 
                                    className="h-auto p-0 font-bold underline"
                                    onClick={() => form.setValue('amount', routeStandardAmount)}
                                >
                                    Use standard amount
                                </Button>
                            </div>
                        )}
                    </span>
                    {['Maintenance', 'Purchase', 'Membership Renewal', 'Shivam / Others'].includes(watchedType) && (
                        <Button type="button" variant="outline" size="sm" onClick={() => setIsPartyDialogOpen(true)} className="bg-white">
                            <Plus className="mr-1 h-3 w-3" /> Add New Party
                        </Button>
                    )}
                </div>

                {['Maintenance', 'Purchase', 'Membership Renewal', 'Shivam / Others'].includes(watchedType) && (
                    <FormField control={form.control} name="partyId" render={({ field }) => (
                        <FormItem>
                            <FormLabel>
                                Party / Service Provider <span className={cn(watchedType === 'Shivam / Others' ? "" : "text-destructive")}>{watchedType === 'Shivam / Others' ? "" : "*"}</span>
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

                {(watchedType === 'Loan Repayment' || watchedMode === 'Bank' || watchedMode === 'Mixed') && (
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

                <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-end">
                        <FormField control={form.control} name="amount" render={({ field }) => (
                            <FormItem>
                                <FormLabel>{watchedType === 'Advance' ? 'Advance Amount / Peski (NPR)' : 'Base Amount'} <span className="text-destructive">*</span></FormLabel>
                                <FormControl>
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-bold">Rs.</span>
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
                                    <Button
                                        type="button"
                                        variant={field.value === 'Mixed' ? 'default' : 'outline'}
                                        className="flex-1 h-12"
                                        onClick={() => {
                                            field.onChange('Mixed');
                                            if (watchedCashAmount === 0 && watchedBankAmount === 0) {
                                                form.setValue('cashAmount', watchedAmount + watchedExtraAmount);
                                            }
                                        }}
                                    >
                                        <ArrowRightLeft className="mr-2 h-4 w-4" /> Mixed
                                    </Button>
                                </div>
                            </FormItem>
                        )} />
                    </div>

                    {watchedMode === 'Mixed' && (
                        <div className="bg-blue-50/30 p-4 rounded-xl border border-blue-100 grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in slide-in-from-top-2">
                            <FormField control={form.control} name="cashAmount" render={({ field }) => (
                                <FormItem>
                                    <div className="flex justify-between items-center mb-1">
                                        <FormLabel className="text-xs">Paid by Cash</FormLabel>
                                        <Button type="button" variant="link" size="sm" className="h-auto p-0 text-[10px]" onClick={() => handleBalanceSplit('cash')}>Set Balance</Button>
                                    </div>
                                    <FormControl>
                                        <Input type="number" {...field} className="h-10 font-semibold" onChange={e => field.onChange(parseFloat(e.target.value) || 0)} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )} />
                            <FormField control={form.control} name="bankAmount" render={({ field }) => (
                                <FormItem>
                                    <div className="flex justify-between items-center mb-1">
                                        <FormLabel className="text-xs">Paid by Bank</FormLabel>
                                        <Button type="button" variant="link" size="sm" className="h-auto p-0 text-[10px]" onClick={() => handleBalanceSplit('bank')}>Set Balance</Button>
                                    </div>
                                    <FormControl>
                                        <Input type="number" {...field} className="h-10 font-semibold" onChange={e => field.onChange(parseFloat(e.target.value) || 0)} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )} />
                        </div>
                    )}

                    {watchedType === 'Advance' && (
                        <div className="bg-muted/30 p-4 rounded-xl border border-dashed space-y-4">
                            {!showExtraFields ? (
                                <Button 
                                    type="button" 
                                    variant="outline" 
                                    size="sm" 
                                    className="h-8 text-[10px] uppercase font-bold tracking-wider"
                                    onClick={() => setShowExtraFields(true)}
                                >
                                    <PlusIcon className="mr-1 h-3 w-3" /> Add Extra Combined Expense
                                </Button>
                            ) : (
                                <div className="animate-in fade-in slide-in-from-top-2">
                                    <div className="flex items-center justify-between mb-3">
                                        <h4 className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest flex items-center gap-2">
                                            <DollarSign className="h-3 w-3" /> Combined Extra Charge
                                        </h4>
                                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => {
                                            setShowExtraFields(false);
                                            form.setValue('extraAmount', 0);
                                            form.setValue('extraRemarks', '');
                                        }}>
                                            <X className="h-3 w-3" />
                                        </Button>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <FormField control={form.control} name="extraAmount" render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="text-xs">Extra Amount</FormLabel>
                                                <FormControl>
                                                    <Input 
                                                        type="number" 
                                                        className="h-9 font-semibold" 
                                                        {...field} 
                                                        onChange={e => field.onChange(parseFloat(e.target.value) || 0)} 
                                                    />
                                                </FormControl>
                                            </FormItem>
                                        )} />
                                        <FormField control={form.control} name="extraRemarks" render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="text-xs">Charge Description</FormLabel>
                                                <FormControl>
                                                    <Input 
                                                        placeholder="e.g. Unplanned Repair, Road Tax" 
                                                        className="h-9 text-xs" 
                                                        {...field} 
                                                    />
                                                </FormControl>
                                            </FormItem>
                                        )} />
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div className="p-4 bg-primary/5 rounded-xl border border-primary/20">
                    <div className="flex justify-between items-center">
                        <div>
                            <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">Total Settlement</p>
                            <h3 className="text-2xl font-black tabular-nums">Rs. {(watchedAmount + watchedExtraAmount).toLocaleString(undefined, {minimumFractionDigits: 2})}</h3>
                        </div>
                        <Badge variant="outline" className="h-fit bg-white px-3 py-1 font-mono">
                            {watchedMode.toUpperCase()}
                        </Badge>
                    </div>
                </div>

                <FormField control={form.control} name="remarks" render={({ field }) => (
                    <FormItem>
                        <FormLabel>General Remarks <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
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
                    <Button type="submit" size="lg" className="px-10 h-12 font-bold" disabled={isSubmitting}>
                        {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</> : <><Save className="mr-2 h-4 w-4" /> {expenseToEdit ? 'Update Expense' : 'Save Expense'}</>}
                    </Button>
                    <Button type="button" variant="outline" size="lg" className="h-12" onClick={() => router.back()}>
                        <X className="mr-2 h-4 w-4" /> Cancel
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
                            <Label>PAN Number</Label>
                            <Input value={partyForm.panNumber} onChange={e => setPartyForm({...partyForm, panNumber: e.target.value})} placeholder="Tax Identification Number" />
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
                    <DialogHeader>
                        <DialogTitle>{editingDestination ? 'Edit Destination' : 'Add New Destination'}</DialogTitle>
                    </DialogHeader>
                    <div className="py-4 space-y-4">
                        <div className="space-y-2">
                            <Label>Destination Name</Label>
                            <Input 
                                value={destForm.name} 
                                onChange={e => setDestForm({...destForm, name: e.target.value})} 
                                placeholder="e.g. BIRTAMODE"
                                onKeyDown={e => e.key === 'Enter' && handleQuickAddDest()}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Standard Advance Amount (Rs.)</Label>
                            <Input 
                                type="number"
                                value={destForm.standardAdvance} 
                                onChange={e => setDestForm({...destForm, standardAdvance: Number(e.target.value) || 0})} 
                                placeholder="Normal Peski amount for this route"
                            />
                            <p className="text-[10px] text-muted-foreground">This amount will be suggested automatically when this route is selected.</p>
                        </div>
                        <div className="space-y-2">
                            <Label>Remarks / Route Notes</Label>
                            <Textarea 
                                value={destForm.remarks} 
                                onChange={e => setDestForm({...destForm, remarks: e.target.value})} 
                                placeholder="Optional notes about this route..."
                                className="min-h-[80px]"
                            />
                        </div>
                    </div>
                    <DialogFooter className="flex justify-between items-center sm:justify-between w-full">
                        {editingDestination && (
                             <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button variant="ghost" size="icon" className="text-destructive">
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                        <AlertDialogTitle>Delete Destination?</AlertDialogTitle>
                                        <AlertDialogDescription>
                                            This will permanently remove "{editingDestination.name}" from your selection list.
                                        </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                        <AlertDialogAction onClick={handleDeleteDest} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                             </AlertDialog>
                        )}
                        <div className="flex gap-2 ml-auto">
                            <Button variant="outline" onClick={() => setIsDestDialogOpen(false)}>Cancel</Button>
                            <Button onClick={handleQuickAddDest}>{editingDestination ? 'Update' : 'Add Location'}</Button>
                        </div>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </Form>
    );
}
