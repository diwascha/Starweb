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
    ArrowRightLeft,
    HandCoins,
    FileText
} from 'lucide-react';
import { cn, toNepaliDate, generateNextExpenseNumber } from '@/lib/utils';
import type { Vehicle, Party, Account, AccountOwnership, PartyType, Transaction, Destination } from '@/lib/types';
import type { Expense, ExpenseType } from '@/lib/expense-types';
import { addExpense, updateExpense, onExpensesUpdate } from '@/services/expense-service';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { addParty } from '@/services/party-service';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { onDestinationsUpdate, addDestination, updateDestination, deleteDestination } from '@/services/destination-service';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { 
    AlertDialog, 
    AlertDialogAction, 
    AlertDialogCancel, 
    AlertDialogContent, 
    AlertDialogHeader, 
    AlertDialogTitle, 
    AlertDialogDescription as AlertDialogDesc, 
    AlertDialogFooter,
    AlertDialogTrigger 
} from '@/components/ui/alert-dialog';
import { Separator } from '@/components/ui/separator';

const expenseTypes: { type: ExpenseType; label: string; sub: string; icon: any; color: string }[] = [
    { type: 'Advance', label: 'Advance / Peski', sub: 'Trip advance', icon: Wallet, color: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
    { type: 'Maintenance', label: 'Maintenance Fee', sub: 'Repair / Service', icon: Wrench, color: 'text-blue-600 bg-blue-50 border-blue-200' },
    { type: 'Loan Repayment', label: 'Loan Repayment', sub: 'Bank / EMI', icon: Building2, color: 'text-orange-600 bg-orange-50 border-orange-200' },
    { type: 'Vendor Purchase', label: 'Vendor Purchase', sub: 'Parts, Fuel, Spares', icon: ShoppingCart, color: 'text-cyan-600 bg-cyan-50 border-cyan-200' },
];

// Shared props for numeric inputs: numeric keypad on mobile + no scroll-wheel value changes on desktop.
const numFieldProps = {
    type: 'number' as const,
    inputMode: 'decimal' as const,
    onWheel: (e: React.WheelEvent<HTMLInputElement>) => e.currentTarget.blur(),
};

const expenseSchema = z.object({
    voucherNo: z.string().min(1, "Voucher No is required."),
    date: z.date(),
    vehicleId: z.string().min(1, "Truck is required."),
    expenseType: z.enum(['Advance', 'Maintenance', 'Vendor Purchase', 'Loan Repayment']),
    amount: z.number().min(1, "Amount must be positive."),
    extraAmount: z.number().optional().default(0),
    extraRemarks: z.string().optional(),
    paymentMode: z.enum(['Cash', 'Bank', 'Mixed', 'Credit']),
    cashAmount: z.number().optional().default(0),
    bankAmount: z.number().optional().default(0),
    dueDate: z.date().optional().nullable(),
    invoiceNumber: z.string().optional(),
    invoiceDate: z.date().optional().nullable(),
    partyId: z.string().optional(),
    accountId: z.string().optional(),
    destination: z.string().optional(),
    remarks: z.string().max(200).optional(),
}).refine(data => {
    if (['Maintenance', 'Vendor Purchase', 'Loan Repayment'].includes(data.expenseType)) return !!data.partyId;
    if (data.paymentMode === 'Credit') return !!data.partyId;
    return true;
}, { message: "Party / Creditor is required.", path: ['partyId'] })
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
    if (data.paymentMode === 'Credit') return !!data.dueDate;
    return true;
}, { message: "Due date is required for credit entries.", path: ['dueDate'] })
.refine(data => {
    if (data.paymentMode === 'Credit') return data.expenseType === 'Vendor Purchase';
    return true;
}, { message: "Credit is only allowed for Vendor Purchases.", path: ['paymentMode'] })
.refine(data => {
    if (data.paymentMode === 'Mixed') {
        const totalExpected = data.amount + (data.extraAmount || 0);
        return Math.abs(((data.cashAmount || 0) + (data.bankAmount || 0)) - totalExpected) < 0.01;
    }
    return true;
}, { message: "Cash + Bank amount must equal Total settlement amount.", path: ['cashAmount'] });

type ExpenseFormValues = z.infer<typeof expenseSchema>;

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
    const [allExpenses, setAllExpenses] = useState<Expense[]>([]);
    
    // Additional Master Data
    const [destinations, setDestinations] = useState<Destination[]>([]);
    const [destSearch, setDestSearch] = useState('');
    const [partySearch, setPartySearch] = useState('');
    const [showExtraFields, setShowExtraFields] = useState(expenseToEdit?.extraAmount ? expenseToEdit.extraAmount > 0 : false);
    const [showCancelConfirm, setShowCancelConfirm] = useState(false);
    
    // Quick Add States
    const [isPartyDialogOpen, setIsPartyDialogOpen] = useState(false);
    const [partyForm, setPartyForm] = useState<{name: string, type: PartyType, ownership: AccountOwnership, address: string, panNumber: string}>({ 
        name: '', type: 'Vendor', ownership: 'Sijan', address: '', panNumber: ''
    });
    const [isDestDialogOpen, setIsDestDialogOpen] = useState(false);
    const [destForm, setDestForm] = useState({ name: '', standardAdvance: 0, remarks: '' });
    const [editingDestination, setEditingDestination] = useState<Destination | null>(null);

    const form = useForm<ExpenseFormValues>({
        resolver: zodResolver(expenseSchema),
        defaultValues: {
            voucherNo: expenseToEdit?.voucherNo || initialVoucherNo,
            date: expenseToEdit ? new Date(expenseToEdit.date) : new Date(),
            expenseType: (expenseToEdit?.expenseType === 'Purchase' || expenseToEdit?.expenseType === 'Membership Renewal' || expenseToEdit?.expenseType === 'Shivam / Others') 
                ? 'Vendor Purchase' 
                : (expenseToEdit?.expenseType || 'Advance'),
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
            dueDate: expenseToEdit?.dueDate ? new Date(expenseToEdit.dueDate) : null,
            invoiceNumber: expenseToEdit?.invoiceNumber || '',
            invoiceDate: expenseToEdit?.invoiceDate ? new Date(expenseToEdit.invoiceDate) : null,
        }
    });

    const watchedDate = form.watch('date');
    useEffect(() => {
        const unsub = onExpensesUpdate(setAllExpenses);
        return () => unsub();
    }, []);

    useEffect(() => {
        if (!expenseToEdit && watchedDate) {
            generateNextExpenseNumber(allExpenses, watchedDate.toISOString()).then(nextPoNumber => {
                form.setValue('voucherNo', nextPoNumber);
            });
        }
    }, [allExpenses, watchedDate, form, expenseToEdit]);

    const watchedType = form.watch('expenseType');
    const watchedMode = form.watch('paymentMode');
    const watchedPartyId = form.watch('partyId');
    const watchedDestinationName = form.watch('destination');
    const watchedAmount = form.watch('amount');
    const watchedExtraAmount = form.watch('extraAmount');
    const watchedCashAmount = form.watch('cashAmount');
    const watchedBankAmount = form.watch('bankAmount');

    // Rule: Revert from Credit if user switches to a restricted type
    useEffect(() => {
        if (watchedType !== 'Vendor Purchase' && watchedMode === 'Credit') {
            form.setValue('paymentMode', 'Cash');
        }
    }, [watchedType, watchedMode, form]);

    // FIX #1: Clear the combined-extra fields whenever the type leaves "Advance",
    // otherwise a hidden extraAmount silently inflates the grand total.
    useEffect(() => {
        if (watchedType !== 'Advance') {
            if (form.getValues('extraAmount')) {
                form.setValue('extraAmount', 0);
                form.setValue('extraRemarks', '');
                // Re-sync Mixed split if it was based on the old (larger) total.
                if (form.getValues('paymentMode') === 'Mixed') {
                    form.setValue('cashAmount', form.getValues('amount') || 0);
                    form.setValue('bankAmount', 0);
                }
            }
            setShowExtraFields(false);
        }
    }, [watchedType, form]);

    useEffect(() => {
        const unsubDest = onDestinationsUpdate(setDestinations);
        return () => unsubDest();
    }, []);

    const sortedVehicles = useMemo(() => [...vehicles].sort((a, b) => a.name.localeCompare(b.name)), [vehicles]);
    const sortedParties = useMemo(() => 
        parties.filter(p => p.ownership === 'Sijan' || p.ownership === 'Both').sort((a, b) => a.name.localeCompare(b.name)), 
    [parties]);
    const sortedAccounts = useMemo(() => 
        accounts.filter(a => (a.ownership === 'Sijan' || a.ownership === 'Both') && (a.type === 'Bank' || a.type === 'Cash'))
            .sort((a, b) => (a.bankName || a.name).localeCompare(b.bankName || b.name)), 
    [accounts]);
    const sortedDestinations = useMemo(() => [...destinations].sort((a, b) => a.name.localeCompare(b.name)), [destinations]);

    const routeStandardAmount = useMemo(() => {
        if (watchedType !== 'Advance' || !watchedDestinationName) return null;
        const dest = sortedDestinations.find(d => d.name === watchedDestinationName);
        return dest?.standardAdvanceAmount || null;
    }, [watchedType, watchedDestinationName, sortedDestinations]);

    const totalSettlement = (watchedAmount || 0) + (watchedExtraAmount || 0);

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

    const onSubmit = async (values: ExpenseFormValues) => {
        if (!user) return;
        setIsSubmitting(true);
        try {
            const isAdvance = values.expenseType === 'Advance';
            const isMixed = values.paymentMode === 'Mixed';

            // FIX #2: strip values that don't belong to the current mode/type so
            // stale Mixed / extra amounts never get persisted.
            const payload = {
                ...values,
                extraAmount: isAdvance ? (values.extraAmount || 0) : 0,
                extraRemarks: isAdvance ? (values.extraRemarks || '') : '',
                cashAmount: isMixed ? (values.cashAmount || 0) : 0,
                bankAmount: isMixed ? (values.bankAmount || 0) : 0,
                date: values.date.toISOString(),
                dueDate: values.dueDate?.toISOString() || null,
                invoiceDate: values.invoiceDate?.toISOString() || null,
                ownership: 'Sijan'
            };

            if (expenseToEdit) {
                await updateExpense(expenseToEdit.id, payload as any, user.username);
                toast({ title: 'Success', description: 'Expense updated successfully.' });
            } else {
                await addExpense({
                    ...payload as any,
                    createdBy: user.username,
                    ownership: 'Sijan'
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

    // FIX #7: on validation failure, surface a toast and scroll to the first
    // offending field on long mobile forms.
    const onInvalid = (errors: Record<string, any>) => {
        const firstKey = Object.keys(errors)[0];
        toast({ title: 'Please fix the highlighted fields', description: errors[firstKey]?.message, variant: 'destructive' });
        const el = document.querySelector(`[name="${firstKey}"]`);
        if (el) (el as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'center' });
    };

    const handleCancelClick = () => {
        if (form.formState.isDirty) {
            setShowCancelConfirm(true);
        } else {
            router.back();
        }
    };

    const handleQuickAddParty = async () => {
        if (!user || !partyForm.name || !partyForm.ownership) return;
        try {
            const id = await addParty({ 
                ...partyForm, 
                createdBy: user.username 
            });
            form.setValue('partyId', id, { shouldValidate: true });
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
                    createdAt: new Date().toISOString(),
                    createdBy: user.username 
                });
                form.setValue('destination', destForm.name.trim(), { shouldValidate: true });
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

    const selectedPartyName = watchedPartyId ? sortedParties.find(p => p.id === watchedPartyId)?.name : '';

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit, onInvalid)} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <FormField control={form.control} name="voucherNo" render={({ field }) => (
                        <FormItem>
                            <FormLabel>Voucher No.</FormLabel>
                            <FormControl>
                                <Input {...field} readOnly className="bg-muted/50 h-10 font-mono text-sm" />
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
                                        <Button variant="outline" className={cn("pl-3 text-left font-normal h-10", !field.value && "text-muted-foreground")}>
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
                                    <SelectTrigger className="h-10">
                                        <SelectValue placeholder="Select a truck" />
                                    </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                    {sortedVehicles.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                    )} />
                </div>

                <div className="space-y-4">
                    <FormLabel className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground">Select Expense Type <span className="text-destructive">*</span></FormLabel>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                        {expenseTypes.map((item) => (
                            <button
                                key={item.type}
                                type="button"
                                onClick={() => form.setValue('expenseType', item.type as any)}
                                className={cn(
                                    "flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all gap-2 text-center group",
                                    watchedType === item.type 
                                        ? cn("ring-2 ring-primary border-primary bg-primary/5", item.color.split(' ')[0])
                                        : "border-muted bg-white hover:bg-muted/50 text-muted-foreground"
                                )}
                            >
                                <div className={cn(
                                    "p-2 rounded-lg transition-colors",
                                    watchedType === item.type ? item.color.split(' ')[1] : "bg-muted/50 group-hover:bg-muted"
                                )}>
                                    <item.icon className={cn("h-5 w-5", watchedType === item.type ? item.color.split(' ')[0] : "text-muted-foreground")} />
                                </div>
                                <div className="space-y-0.5">
                                    <span className="text-[11px] font-bold block leading-tight">{item.label}</span>
                                    <span className="text-[9px] opacity-70 block leading-tight">{item.sub}</span>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>

                <div className="space-y-6 pt-4 pb-6 border-y border-dashed bg-muted/5 px-4 rounded-xl">
                    <FormField control={form.control} name="paymentMode" render={({ field }) => (
                        <FormItem className="space-y-2">
                            <FormLabel>Payment Status</FormLabel>
                            <div className="flex flex-col gap-3">
                                <div className="flex flex-wrap gap-2 max-w-2xl">
                                    <Button
                                        type="button"
                                        variant={field.value === 'Cash' ? 'default' : 'outline'}
                                        className="h-10 px-4"
                                        onClick={() => field.onChange('Cash')}
                                    >
                                        <Wallet className="mr-2 h-4 w-4" /> Cash
                                    </Button>
                                    <Button
                                        type="button"
                                        variant={field.value === 'Bank' ? 'default' : 'outline'}
                                        className="h-10 px-4"
                                        onClick={() => field.onChange('Bank')}
                                    >
                                        <Building2 className="mr-2 h-4 w-4" /> Bank
                                    </Button>
                                    <Button
                                        type="button"
                                        variant={field.value === 'Mixed' ? 'default' : 'outline'}
                                        className="h-10 px-4"
                                        onClick={() => {
                                            field.onChange('Mixed');
                                            if ((watchedCashAmount || 0) === 0 && (watchedBankAmount || 0) === 0) {
                                                form.setValue('cashAmount', totalSettlement);
                                                form.setValue('bankAmount', 0);
                                            }
                                        }}
                                    >
                                        <ArrowRightLeft className="mr-2 h-4 w-4" /> Mixed
                                    </Button>
                                    {watchedType === 'Vendor Purchase' && (
                                        <Button
                                            type="button"
                                            variant={field.value === 'Credit' ? 'default' : 'outline'}
                                            className="h-10 px-4 animate-in fade-in zoom-in-95"
                                            onClick={() => field.onChange('Credit')}
                                        >
                                            <HandCoins className="mr-2 h-4 w-4" /> Credit (Pay Later)
                                        </Button>
                                    )}
                                </div>
                                
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
                                    {(watchedType === 'Loan Repayment' || watchedMode === 'Bank' || watchedMode === 'Mixed') && (
                                        <FormField control={form.control} name="accountId" render={({ field: accountField }) => (
                                            <FormItem className="animate-in fade-in slide-in-from-top-1">
                                                <Select onValueChange={accountField.onChange} value={accountField.value}>
                                                    <FormControl>
                                                        <SelectTrigger className="h-9 text-xs border-primary/20 bg-primary/5">
                                                            <SelectValue placeholder={watchedType === 'Loan Repayment' ? "Select loan account..." : "Select bank account..."} />
                                                        </SelectTrigger>
                                                    </FormControl>
                                                    <SelectContent>
                                                        {sortedAccounts.map(a => <SelectItem key={a.id} value={a.id}>{a.bankName} - {a.accountNumber}</SelectItem>)}
                                                    </SelectContent>
                                                </Select>
                                                <FormMessage />
                                            </FormItem>
                                        )} />
                                    )}

                                    {watchedMode === 'Credit' && (
                                        <FormField control={form.control} name="dueDate" render={({ field: dueField }) => (
                                            <FormItem className="animate-in fade-in slide-in-from-top-1">
                                                <Popover>
                                                    <PopoverTrigger asChild>
                                                        <FormControl>
                                                            <Button variant="outline" className={cn("w-full h-9 text-xs justify-start text-left font-normal border-amber-200 bg-amber-50/50 text-amber-900", !dueField.value && "text-muted-foreground")}>
                                                                <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                                                                {dueField.value ? `Pay on: ${toNepaliDate(dueField.value.toISOString())}` : <span>Set Payment Due Date</span>}
                                                            </Button>
                                                        </FormControl>
                                                    </PopoverTrigger>
                                                    <PopoverContent className="w-auto p-0" align="start">
                                                        <DualCalendar selected={dueField.value || undefined} onSelect={dueField.onChange} />
                                                    </PopoverContent>
                                                </Popover>
                                                <FormMessage />
                                            </FormItem>
                                        )} />
                                    )}
                                </div>
                            </div>
                        </FormItem>
                    )} />
                </div>

                {watchedType === 'Advance' && (
                    <FormField control={form.control} name="destination" render={({ field }) => (
                        <FormItem className="flex flex-col animate-in fade-in zoom-in-95">
                            <FormLabel>Destination Route <span className="text-destructive">*</span></FormLabel>
                            <div className="flex gap-2">
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <FormControl>
                                            <Button variant="outline" role="combobox" className={cn("w-full justify-between h-10 text-sm font-normal", !field.value && "text-muted-foreground")}>
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
                                                    {sortedDestinations.map(d => (
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
                                <Button type="button" variant="outline" size="icon" className="h-10 w-10 shrink-0" onClick={() => handleOpenDestinationDialog()}>
                                    <Plus className="h-4 w-4" />
                                </Button>
                            </div>
                            <FormMessage />
                        </FormItem>
                    )} />
                )}

                <div className={cn(
                    "flex items-center gap-4 p-3 rounded-lg border bg-blue-50/50 text-blue-800 text-xs",
                    (watchedType === 'Advance' && !routeStandardAmount && watchedMode !== 'Credit') && "hidden",
                    (!['Maintenance', 'Vendor Purchase', 'Loan Repayment', 'Advance'].includes(watchedType) && watchedMode !== 'Credit') && "hidden"
                )}>
                    <Info className="h-3.5 w-3.5 shrink-0" />
                    <span className="flex-1">
                        {watchedType === 'Maintenance' && "Maintenance selected • Select the party who provided the service."}
                        {watchedType === 'Vendor Purchase' && "Vendor Purchase selected • Select the supplier for the parts/fuel."}
                        {watchedType === 'Loan Repayment' && "Loan Repayment selected • Select the lender (Party) and the specific loan account."}
                        {watchedMode === 'Credit' && "Credit settlement selected • Specify the supplier / creditor."}
                        {watchedType === 'Advance' && routeStandardAmount && (
                            <div className="flex items-center gap-2">
                                <Lightbulb className="h-3.5 w-3.5 text-amber-600" />
                                <span>The standard advance for <b>{watchedDestinationName}</b> is <b>Rs. {routeStandardAmount.toLocaleString()}</b>.</span>
                                <Button 
                                    type="button" 
                                    variant="link" 
                                    size="sm" 
                                    className="h-auto p-0 font-bold underline text-xs"
                                    onClick={() => form.setValue('amount', routeStandardAmount)}
                                >
                                    Use standard amount
                                </Button>
                            </div>
                        )}
                    </span>
                    {(['Maintenance', 'Vendor Purchase', 'Loan Repayment'].includes(watchedType) || watchedMode === 'Credit') && (
                        <Button type="button" variant="outline" size="sm" onClick={() => setIsPartyDialogOpen(true)} className="bg-white text-[10px]">
                            <Plus className="mr-1 h-3 w-3" /> Add New Party
                        </Button>
                    )}
                </div>

                {(['Maintenance', 'Vendor Purchase', 'Loan Repayment'].includes(watchedType) || watchedMode === 'Credit') && (
                    <FormField control={form.control} name="partyId" render={({ field }) => (
                        <FormItem className="flex flex-col">
                            <FormLabel>
                                {watchedType === 'Loan Repayment' ? 'Lending Institution / Bank (Party)' : 'Party / Service Provider / Creditor'} 
                                <span className="text-destructive">*</span>
                            </FormLabel>
                            {/* FIX #5: searchable combobox instead of a plain Select for long lists on mobile. */}
                            <Popover>
                                <PopoverTrigger asChild>
                                    <FormControl>
                                        <Button variant="outline" role="combobox" className={cn("w-full justify-between h-10 text-sm font-normal", !field.value && "text-muted-foreground")}>
                                            <div className="flex items-center gap-2 truncate">
                                                <Briefcase className="h-4 w-4 opacity-50 shrink-0" />
                                                <span className="truncate">{selectedPartyName || "Search or select party..."}</span>
                                            </div>
                                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                        </Button>
                                    </FormControl>
                                </PopoverTrigger>
                                <PopoverContent className="p-0 w-[--radix-popover-trigger-width]">
                                    <Command>
                                        <CommandInput placeholder="Search party..." onValueChange={setPartySearch} />
                                        <CommandList>
                                            <CommandEmpty>
                                                <Button variant="ghost" className="w-full justify-start text-xs" onClick={() => { setPartyForm(p => ({ ...p, name: partySearch })); setIsPartyDialogOpen(true); }}>
                                                    <PlusCircle className="mr-2 h-4 w-4" /> Add "{partySearch}"
                                                </Button>
                                            </CommandEmpty>
                                            <CommandGroup>
                                                {sortedParties.map(p => (
                                                    <CommandItem key={p.id} value={p.name} onSelect={() => field.onChange(p.id)}>
                                                        <Check className={cn("mr-2 h-4 w-4", field.value === p.id ? "opacity-100" : "opacity-0")} />
                                                        {p.name}
                                                    </CommandItem>
                                                ))}
                                            </CommandGroup>
                                        </CommandList>
                                    </Command>
                                </PopoverContent>
                            </Popover>
                            {partyBalance && (
                                <div className="flex gap-4 mt-1.5 px-1">
                                    {partyBalance.payables !== 0 && (
                                        <Badge variant="outline" className="text-[9px] bg-amber-50 text-amber-800 border-amber-200 uppercase tracking-tighter">
                                            Payable: Rs. {partyBalance.payables.toLocaleString()}
                                        </Badge>
                                    )}
                                    {partyBalance.receivables !== 0 && (
                                        <Badge variant="outline" className="text-[9px] bg-emerald-50 text-emerald-800 border-emerald-200 uppercase tracking-tighter">
                                            Receivable: Rs. {partyBalance.receivables.toLocaleString()}
                                        </Badge>
                                    )}
                                </div>
                            )}
                            <FormMessage />
                        </FormItem>
                    )} />
                )}

                {watchedType === 'Vendor Purchase' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-xl bg-blue-50/20 border-2 border-dashed border-blue-100 animate-in fade-in slide-in-from-top-2">
                        <FormField control={form.control} name="invoiceNumber" render={({ field }) => (
                            <FormItem>
                                <FormLabel className="text-xs flex items-center gap-2">
                                    <FileText className="h-3 w-3 text-blue-600" />
                                    Invoice Number (Optional)
                                </FormLabel>
                                <FormControl>
                                    <Input {...field} placeholder="e.g. INV-1234" className="h-9 bg-white" />
                                </FormControl>
                            </FormItem>
                        )} />
                        <FormField control={form.control} name="invoiceDate" render={({ field }) => (
                            <FormItem className="flex flex-col">
                                <FormLabel className="text-xs flex items-center gap-2">
                                    <CalendarIcon className="h-3 w-3 text-blue-600" />
                                    Invoice Date (Optional)
                                </FormLabel>
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <FormControl>
                                            <Button variant="outline" className={cn("h-9 justify-start text-left font-normal bg-white text-xs px-3", !field.value && "text-muted-foreground")}>
                                                <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                                                {field.value ? toNepaliDate(field.value.toISOString()) : <span>Pick Invoice Date</span>}
                                            </Button>
                                        </FormControl>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0" align="start">
                                        <DualCalendar selected={field.value || undefined} onSelect={field.onChange} />
                                    </PopoverContent>
                                </Popover>
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
                                        if (watchedMode === 'Mixed') {
                                            form.setValue('cashAmount', watchedAmount || 0);
                                            form.setValue('bankAmount', 0);
                                        }
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
                                                    {...numFieldProps}
                                                    className="h-9 font-semibold text-sm" 
                                                    {...field} 
                                                    value={field.value || ''}
                                                    onChange={e => {
                                                        const val = parseFloat(e.target.value) || 0;
                                                        field.onChange(val);
                                                        if (form.getValues('paymentMode') === 'Mixed') {
                                                            const total = val + (form.getValues('amount') || 0);
                                                            form.setValue('cashAmount', total);
                                                            form.setValue('bankAmount', 0);
                                                        }
                                                    }} 
                                                />
                                            </FormControl>
                                        </FormItem>
                                    )} />
                                    <FormField control={form.control} name="extraRemarks" render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="text-xs">Charge Description</FormLabel>
                                            <FormControl>
                                                <Input 
                                                    placeholder="e.g. Repair, Road Tax" 
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

                <div className="pt-4 pb-6 border-t border-dashed bg-muted/10 px-4 rounded-xl">
                    <div className={cn(
                        "grid gap-6 items-end",
                        watchedMode === 'Mixed' ? "grid-cols-1 md:grid-cols-3" : "grid-cols-1"
                    )}>
                        <FormField control={form.control} name="amount" render={({ field }) => (
                            <FormItem>
                                <FormLabel>{watchedType === 'Advance' ? 'Advance Amount (NPR)' : 'Base Amount'} <span className="text-destructive">*</span></FormLabel>
                                <FormControl>
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-bold">Rs.</span>
                                        <Input 
                                            {...numFieldProps}
                                            className="pl-10 h-10 text-base font-bold" 
                                            {...field} 
                                            value={field.value || ''}
                                            onChange={e => {
                                                const val = parseFloat(e.target.value) || 0;
                                                field.onChange(val);
                                                if (form.getValues('paymentMode') === 'Mixed') {
                                                    const total = val + (form.getValues('extraAmount') || 0);
                                                    form.setValue('cashAmount', total);
                                                    form.setValue('bankAmount', 0);
                                                }
                                            }} 
                                        />
                                    </div>
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )} />

                        {watchedMode === 'Mixed' && (
                            <>
                                <FormField control={form.control} name="cashAmount" render={({ field }) => (
                                    <FormItem className="animate-in fade-in slide-in-from-left-2">
                                        <FormLabel className="text-xs">Paid by Cash</FormLabel>
                                        <FormControl>
                                            <Input 
                                                {...numFieldProps}
                                                {...field} 
                                                value={field.value || ''}
                                                className="h-10 font-semibold text-sm border-emerald-100 bg-white" 
                                                onChange={e => {
                                                    const val = parseFloat(e.target.value) || 0;
                                                    field.onChange(val);
                                                    const total = (form.getValues('amount') || 0) + (form.getValues('extraAmount') || 0);
                                                    form.setValue('bankAmount', Math.max(0, total - val));
                                                }} 
                                            />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )} />
                                <FormField control={form.control} name="bankAmount" render={({ field }) => (
                                    <FormItem className="animate-in fade-in slide-in-from-left-2">
                                        <FormLabel className="text-xs">Paid by Bank</FormLabel>
                                        <FormControl>
                                            <Input 
                                                {...numFieldProps}
                                                {...field} 
                                                value={field.value || ''}
                                                className="h-10 font-semibold text-sm border-blue-100 bg-white" 
                                                onChange={e => {
                                                    const val = parseFloat(e.target.value) || 0;
                                                    field.onChange(val);
                                                    const total = (form.getValues('amount') || 0) + (form.getValues('extraAmount') || 0);
                                                    form.setValue('cashAmount', Math.max(0, total - val));
                                                }} 
                                            />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )} />
                            </>
                        )}
                    </div>
                </div>

                <div className="p-4 bg-primary/5 rounded-xl border border-primary/20">
                    <div className="flex justify-between items-center">
                        <div>
                            <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">Grand Total Settlement</p>
                            <h3 className="text-xl font-black tabular-nums">Rs. {totalSettlement.toLocaleString(undefined, {minimumFractionDigits: 2})}</h3>
                        </div>
                        <Badge variant="outline" className="h-fit bg-white px-3 py-1 font-mono text-[10px]">
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
                                    className="min-h-[80px] text-sm resize-none" 
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

                {/* FIX #6: sticky action bar keeps Save/Cancel reachable on long mobile forms. */}
                <div className="sticky bottom-0 z-20 flex items-center gap-3 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 py-3">
                    <Button type="submit" size="lg" className="px-10 h-11 font-bold" disabled={isSubmitting}>
                        {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</> : <><Save className="mr-2 h-4 w-4" /> {expenseToEdit ? 'Update Expense' : 'Save Expense'}</>}
                    </Button>
                    <Button type="button" variant="outline" size="lg" className="h-11" onClick={handleCancelClick}>
                        <X className="mr-2 h-4 w-4" /> Cancel
                    </Button>
                </div>
            </form>

            {/* FIX #9: confirm before discarding unsaved edits. */}
            <AlertDialog open={showCancelConfirm} onOpenChange={setShowCancelConfirm}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
                        <AlertDialogDesc>You have unsaved edits on this expense. Leaving now will lose them.</AlertDialogDesc>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Keep Editing</AlertDialogCancel>
                        <AlertDialogAction onClick={() => router.back()}>Discard</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <Dialog open={isPartyDialogOpen} onOpenChange={setIsPartyDialogOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader><DialogTitle>Quick Add Supplier / Lender</DialogTitle></DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="space-y-2">
                            <Label>Name</Label>
                            <Input value={partyForm.name} onChange={e => setPartyForm({...partyForm, name: e.target.value})} />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Category</Label>
                                <Select value={partyForm.type} onValueChange={(v: PartyType) => setPartyForm({...partyForm, type: v})}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="Vendor">Service Provider / Vendor / Bank</SelectItem>
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
                        <Button onClick={handleQuickAddParty}>Add Record</Button>
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
                                {...numFieldProps}
                                value={destForm.standardAdvance || ''} 
                                onChange={e => setDestForm({...destForm, standardAdvance: Number(e.target.value) || 0})} 
                                placeholder="Normal Peski amount"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Remarks / Route Notes</Label>
                            <Textarea 
                                value={destForm.remarks} 
                                onChange={e => setDestForm({...destForm, remarks: e.target.value})} 
                                placeholder="Optional notes..."
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
                                        <AlertDialogDesc>
                                            Permanently remove "{editingDestination.name}"?
                                        </AlertDialogDesc>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                        <AlertDialogAction onClick={handleDeleteDest}>Delete</AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                        )}
                        <Button variant="outline" onClick={() => setIsDestDialogOpen(false)}>Cancel</Button>
                        <Button onClick={handleQuickAddDest}>{editingDestination ? 'Update' : 'Add'}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </Form>
    );
}