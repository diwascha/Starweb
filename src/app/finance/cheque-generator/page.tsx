
'use client';

import { Suspense, useState, useEffect, useMemo, useRef } from 'react';
import { ChequeGeneratorForm } from './_components/cheque-generator-form';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Search, ArrowUpDown, MoreHorizontal, Printer, Trash2, Edit, AlertTriangle, PlusCircle } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { onChequesUpdate, deleteCheque, updateCheque } from '@/services/cheque-service';
import type { Cheque, ChequeSplit, ChequeStatus, PartialPayment } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { format, differenceInDays, startOfToday } from 'date-fns';
import { ChequeView } from './_components/cheque-view';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { cn, toNepaliDate } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { CalendarIcon } from 'lucide-react';
import { DualCalendar } from '@/components/ui/dual-calendar';
import { Label } from '@/components/ui/label';


function FormSkeleton() {
    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Skeleton className="h-10" />
                <Skeleton className="h-10" />
                <Skeleton className="h-10" />
                <Skeleton className="h-10" />
                <Skeleton className="h-10 lg:col-span-2" />
                <Skeleton className="h-10 lg:col-span-2" />
            </div>
             <div className="border rounded-lg p-4 space-y-4">
                <Skeleton className="h-8 w-1/4" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
            </div>
             <div className="flex justify-end gap-2">
                <Skeleton className="h-10 w-28" />
                <Skeleton className="h-10 w-32" />
             </div>
        </div>
    );
}

type SortKey = 'chequeDate' | 'payeeName' | 'amount' | 'chequeNumber' | 'status' | 'dueStatus';
type SortDirection = 'asc' | 'desc';

interface AugmentedChequeSplit extends ChequeSplit {
    daysRemaining: number;
    isOverdue: boolean;
    parentCheque: Cheque;
    paidAmount: number;
    remainingAmount: number;
}

function SavedChequesList({ onEdit }: { onEdit: (cheque: Cheque) => void }) {
    const [cheques, setCheques] = useState<Cheque[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection }>({ key: 'chequeDate', direction: 'asc' });
    const [filterStatus, setFilterStatus] = useState<string>('All');
    const [filterPayee, setFilterPayee] = useState<string>('All');
    const { toast } = useToast();
    const { user } = useAuth();
    
    const [chequeToPrint, setChequeToPrint] = useState<Cheque | null>(null);
    const [isPrintPreviewOpen, setIsPrintPreviewOpen] = useState(false);
    const printRef = useRef<HTMLDivElement>(null);
    
    const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false);
    const [paymentForm, setPaymentForm] = useState<{ date: Date, amount: number, remarks?: string }>({ date: new Date(), amount: 0 });
    const [payingSplit, setPayingSplit] = useState<AugmentedChequeSplit | null>(null);


    useEffect(() => {
        const unsub = onChequesUpdate(setCheques);
        return () => unsub();
    }, []);

    const requestSort = (key: SortKey) => {
        let direction: SortDirection = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const uniquePayees = useMemo(() => {
        const payees = new Set(cheques.map(c => c.payeeName));
        return ['All', ...Array.from(payees).sort()];
    }, [cheques]);


    const sortedAndFilteredSplits = useMemo(() => {
        const today = startOfToday();
        
        let allSplits: AugmentedChequeSplit[] = cheques.flatMap(c => 
            c.splits.map(s => {
                const chequeDate = new Date(s.chequeDate);
                const paidAmount = (s.partialPayments || []).reduce((sum, p) => sum + p.amount, 0);
                const totalAmount = Number(s.amount) || 0;
                return {
                    ...s,
                    id: s.id, 
                    chequeDate: chequeDate,
                    daysRemaining: differenceInDays(chequeDate, today),
                    isOverdue: differenceInDays(chequeDate, today) < 0,
                    parentCheque: c,
                    amount: totalAmount,
                    paidAmount: paidAmount,
                    remainingAmount: totalAmount - paidAmount,
                    status: s.status || 'Due'
                };
            })
        );


        if (searchQuery) {
            const lowercasedQuery = searchQuery.toLowerCase();
            allSplits = allSplits.filter(s =>
                s.parentCheque.payeeName.toLowerCase().includes(lowercasedQuery) ||
                (s.chequeNumber || '').toLowerCase().includes(lowercasedQuery) ||
                (s.parentCheque.invoiceNumber || '').toLowerCase().includes(lowercasedQuery) ||
                (s.parentCheque.voucherNo || '').toLowerCase().includes(lowercasedQuery)
            );
        }

        if (filterStatus !== 'All') {
            allSplits = allSplits.filter(s => s.status === filterStatus);
        }
        
        if (filterPayee !== 'All') {
            allSplits = allSplits.filter(s => s.parentCheque.payeeName === filterPayee);
        }
        
        allSplits.sort((a, b) => {
            let aVal: any, bVal: any;

            if (sortConfig.key === 'chequeDate') {
                aVal = new Date(a.chequeDate).getTime();
                bVal = new Date(b.chequeDate).getTime();
            } else if (sortConfig.key === 'payeeName') {
                aVal = a.parentCheque.payeeName;
                bVal = b.parentCheque.payeeName;
            } else if (sortConfig.key === 'dueStatus') {
                aVal = a.daysRemaining;
                bVal = b.daysRemaining;
            } else if (sortConfig.key === 'amount') {
                aVal = Number(a.amount) || 0;
                bVal = Number(b.amount) || 0;
            } else {
                 aVal = a[sortConfig.key as keyof AugmentedChequeSplit];
                 bVal = b[sortConfig.key as keyof AugmentedChequeSplit];
            }
            
            if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });

        return allSplits;
    }, [cheques, searchQuery, sortConfig, filterStatus, filterPayee]);

    const handleDelete = async (id: string) => {
        try {
            await deleteCheque(id);
            toast({ title: "Deleted", description: "Cheque record has been deleted." });
        } catch (error) {
            toast({ title: "Error", description: "Failed to delete cheque record.", variant: "destructive" });
        }
    };
    
    const handlePrint = (cheque: Cheque) => {
        setChequeToPrint(cheque);
        setIsPrintPreviewOpen(true);
    };

    const doActualPrint = () => {
        const printableArea = printRef.current;
        if (!printableArea) return;
        
        const printWindow = window.open('', '', 'height=800,width=800');
        printWindow?.document.write('<html><head><title>Print Cheques</title>');
        printWindow?.document.write('<style>@media print{@page{size: auto;margin: 5mm;}body{margin: 0;}.cheque-container{border:1px solid #ccc; padding: 10px; margin-bottom: 20px; page-break-inside: avoid;}}</style>');
        printWindow?.document.write('</head><body>');
        printWindow?.document.write(printableArea.innerHTML);
        printWindow?.document.write('</body></html>');
        printWindow?.document.close();
        printWindow?.focus();
        setTimeout(() => {
            printWindow?.print();
            printWindow?.close();
        }, 250);
    };
    
    const getStatusBadge = (split: AugmentedChequeSplit) => {
        const { status, daysRemaining, isOverdue, remainingAmount } = split;

        if (status === 'Paid') {
            return <Badge variant="default" className="bg-green-600 hover:bg-green-700">Paid</Badge>;
        }
        if (status === 'Canceled') {
            return <Badge variant="destructive">Canceled</Badge>;
        }
        if (status === 'Partially Paid') {
            return <Badge variant="default" className="bg-blue-600 hover:bg-blue-700">Partially Paid</Badge>;
        }
        
        if (isOverdue) {
            return <Badge variant="destructive"><AlertTriangle className="mr-1 h-3 w-3" /> Overdue by {-daysRemaining} day(s)</Badge>;
        }
        if (daysRemaining <= 7) {
            return <Badge variant="default" className="bg-yellow-500 text-black hover:bg-yellow-600"><AlertTriangle className="mr-1 h-3 w-3" /> Due in {daysRemaining} day(s)</Badge>;
        }
        return <Badge variant="outline" className="text-blue-600 border-blue-600">Due in {daysRemaining} day(s)</Badge>;
    };
    
    const handleAddPayment = async () => {
        if (!payingSplit || !user) return;
        
        const { date, amount, remarks } = paymentForm;

        if (amount <= 0 || amount > payingSplit.remainingAmount) {
            toast({ title: "Invalid Amount", description: `Payment must be between 0 and ${payingSplit.remainingAmount}.`, variant: "destructive" });
            return;
        }

        const newPayment: PartialPayment = {
            id: Date.now().toString(),
            date: date.toISOString(),
            amount,
            remarks: remarks || '',
        };

        const updatedSplits = payingSplit.parentCheque.splits.map(s => {
            if (s.id === payingSplit.id) {
                const existingPayments = s.partialPayments || [];
                const updatedPayments = [...existingPayments, newPayment];
                const totalPaid = updatedPayments.reduce((sum, p) => sum + p.amount, 0);
                
                let newStatus: ChequeStatus = 'Partially Paid';
                if (totalPaid >= Number(s.amount)) {
                    newStatus = 'Paid';
                }

                return {
                    ...s,
                    partialPayments: updatedPayments,
                    status: newStatus
                };
            }
            return s;
        });

        const dataToUpdate: Partial<Cheque> = {
            splits: updatedSplits,
            lastModifiedBy: user.username,
        };
        
        try {
            await updateCheque(payingSplit.parentCheque.id, dataToUpdate);
            toast({ title: 'Payment Added', description: 'Partial payment has been recorded.' });
            setIsPaymentDialogOpen(false);
            setPayingSplit(null);
            setPaymentForm({ date: new Date(), amount: 0, remarks: '' });
        } catch (error) {
            console.error("Failed to add payment:", error);
            toast({ title: 'Error', description: 'Failed to add payment.', variant: 'destructive' });
        }
    };


    const handleStatusUpdate = async (cheque: Cheque, splitId: string, newStatus: ChequeStatus) => {
        if (!user) return;
        const updatedSplits = cheque.splits.map(s => 
            s.id === splitId ? { ...s, status: newStatus } : s
        );
        try {
            await updateCheque(cheque.id, { splits: updatedSplits, lastModifiedBy: user.username });
            toast({ title: 'Status Updated', description: `Cheque status set to ${newStatus}.` });
        } catch (error) {
            toast({ title: 'Error', description: 'Failed to update status.', variant: 'destructive' });
        }
    };


    
    return (
        <>
            <Card>
            <CardHeader>
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                        <CardTitle>Saved Cheques</CardTitle>
                        <CardDescription>A log of all saved cheque records.</CardDescription>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                        <Input
                            placeholder="Search..."
                            className="w-full sm:w-[200px]"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                         <Select value={filterStatus} onValueChange={setFilterStatus}>
                            <SelectTrigger className="w-full sm:w-[150px]">
                                <SelectValue placeholder="Filter by Status" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="All">All Statuses</SelectItem>
                                <SelectItem value="Due">Due</SelectItem>
                                <SelectItem value="Paid">Paid</SelectItem>
                                <SelectItem value="Canceled">Canceled</SelectItem>
                                <SelectItem value="Partially Paid">Partially Paid</SelectItem>
                            </SelectContent>
                        </Select>
                        <Select value={filterPayee} onValueChange={setFilterPayee}>
                            <SelectTrigger className="w-full sm:w-[200px]">
                                <SelectValue placeholder="Filter by Payee" />
                            </SelectTrigger>
                            <SelectContent>
                                {uniquePayees.map(payee => (
                                    <SelectItem key={payee} value={payee}>{payee}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                <Table>
                <TableHeader>
                    <TableRow>
                    <TableHead><Button variant="ghost" onClick={() => requestSort('chequeDate')}>Cheque Date <ArrowUpDown className="ml-2 h-4 w-4 inline-block" /></Button></TableHead>
                    <TableHead><Button variant="ghost" onClick={() => requestSort('payeeName')}>Payee Name <ArrowUpDown className="ml-2 h-4 w-4 inline-block" /></Button></TableHead>
                    <TableHead><Button variant="ghost" onClick={() => requestSort('chequeNumber')}>Cheque # <ArrowUpDown className="ml-2 h-4 w-4 inline-block" /></Button></TableHead>
                    <TableHead><Button variant="ghost" onClick={() => requestSort('amount')}>Amount <ArrowUpDown className="ml-2 h-4 w-4 inline-block" /></Button></TableHead>
                    <TableHead>Remaining</TableHead>
                    <TableHead><Button variant="ghost" onClick={() => requestSort('dueStatus')}>Status</Button></TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {sortedAndFilteredSplits.length > 0 ? (
                        sortedAndFilteredSplits.map(split => (
                        <TableRow key={`${split.parentCheque.id}-${split.id}`}>
                        <TableCell>{format(new Date(split.chequeDate), 'PPP')}</TableCell>
                        <TableCell>{split.parentCheque.payeeName}</TableCell>
                        <TableCell>{split.chequeNumber}</TableCell>
                        <TableCell>{Number(split.amount).toLocaleString()}</TableCell>
                        <TableCell>{split.remainingAmount.toLocaleString()}</TableCell>
                        <TableCell>{getStatusBadge(split)}</TableCell>
                        <TableCell className="text-right">
                            <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                    <DropdownMenuLabel>Voucher #{split.parentCheque.voucherNo}</DropdownMenuLabel>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onSelect={() => {setPayingSplit(split); setIsPaymentDialogOpen(true);}}><PlusCircle className="mr-2 h-4 w-4" /> Add Payment</DropdownMenuItem>
                                    <DropdownMenuItem onSelect={() => onEdit(split.parentCheque)}><Edit className="mr-2 h-4 w-4" /> Edit Voucher</DropdownMenuItem>
                                    <DropdownMenuItem onSelect={() => handlePrint(split.parentCheque)}><Printer className="mr-2 h-4 w-4"/> Print Voucher</DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                     <DropdownMenuItem onSelect={() => handleStatusUpdate(split.parentCheque, split.id, 'Paid')}>Mark as Paid</DropdownMenuItem>
                                     <DropdownMenuItem onSelect={() => handleStatusUpdate(split.parentCheque, split.id, 'Canceled')}>Mark as Canceled</DropdownMenuItem>
                                     <DropdownMenuItem onSelect={() => handleStatusUpdate(split.parentCheque, split.id, 'Due')}>Mark as Due</DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                        <DropdownMenuItem onSelect={e => e.preventDefault()}><Trash2 className="mr-2 h-4 w-4 text-destructive" /> <span className="text-destructive">Delete Voucher</span></DropdownMenuItem>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                        <AlertDialogHeader><AlertDialogTitle>Delete this record?</AlertDialogTitle><AlertDialogDescription>This action will delete the entire voucher and all its associated cheques. It cannot be undone.</AlertDialogDescription></AlertDialogHeader>
                                        <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => handleDelete(split.parentCheque.id)}>Delete</AlertDialogAction></AlertDialogFooter>
                                    </AlertDialogContent>
                                    </AlertDialog>
                            </DropdownMenuContent>
                            </DropdownMenu>
                        </TableCell>
                        </TableRow>
                    ))
                    ) : (
                    <TableRow>
                        <TableCell colSpan={7} className="text-center">No saved cheques yet.</TableCell>
                    </TableRow>
                    )}
                </TableBody>
                </Table>
            </CardContent>
            </Card>
             <Dialog open={isPrintPreviewOpen} onOpenChange={setIsPrintPreviewOpen}>
                <DialogContent className="max-w-4xl">
                    <DialogHeader>
                        <DialogTitle>Cheque Preview</DialogTitle>
                        <DialogDescription>Review the cheques before printing.</DialogDescription>
                    </DialogHeader>
                     <div className="max-h-[70vh] overflow-auto p-4 bg-gray-100">
                         <div ref={printRef}>
                            {chequeToPrint && (
                                <ChequeView
                                    voucherDate={new Date(chequeToPrint.createdAt)}
                                    payeeName={chequeToPrint.payeeName}
                                    splits={chequeToPrint.splits.map(s => ({
                                        ...s,
                                        chequeDate: new Date(s.chequeDate)
                                    }))}
                                />
                            )}
                         </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsPrintPreviewOpen(false)}>Cancel</Button>
                        <Button onClick={doActualPrint}><Printer className="mr-2 h-4 w-4" /> Print</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

             <Dialog open={isPaymentDialogOpen} onOpenChange={setIsPaymentDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Add Partial Payment</DialogTitle>
                        <DialogDescription>
                            For Cheque # {payingSplit?.chequeNumber} to {payingSplit?.parentCheque.payeeName}
                        </DialogDescription>
                    </DialogHeader>
                    {payingSplit && (
                        <div className="space-y-4 py-4">
                             <div className="grid grid-cols-2 text-sm">
                                <div><span className="font-medium">Total Amount:</span> {Number(payingSplit.amount).toLocaleString()}</div>
                                <div className="font-bold"><span className="font-medium">Remaining:</span> {payingSplit.remainingAmount.toLocaleString()}</div>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="payment-date">Payment Date</Label>
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <Button variant="outline" className="w-full justify-start text-left font-normal">
                                            <CalendarIcon className="mr-2 h-4 w-4" />
                                            {paymentForm.date ? format(paymentForm.date, 'PPP') : <span>Pick a date</span>}
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0">
                                        <DualCalendar selected={paymentForm.date} onSelect={(d) => d && setPaymentForm(p => ({...p, date: d}))} />
                                    </PopoverContent>
                                </Popover>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="payment-amount">Payment Amount</Label>
                                <Input
                                    id="payment-amount"
                                    type="number"
                                    value={paymentForm.amount}
                                    onChange={(e) => setPaymentForm(p => ({...p, amount: parseFloat(e.target.value) || 0}))}
                                    max={payingSplit.remainingAmount}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="payment-remarks">Remarks (Optional)</Label>
                                <Input id="payment-remarks" value={paymentForm.remarks} onChange={(e) => setPaymentForm(p => ({...p, remarks: e.target.value}))} />
                            </div>
                        </div>
                    )}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsPaymentDialogOpen(false)}>Cancel</Button>
                        <Button onClick={handleAddPayment}>Add Payment</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}

export default function ChequeGeneratorPage() {
    const [activeTab, setActiveTab] = useState('generator');
    const [chequeToEdit, setChequeToEdit] = useState<Cheque | null>(null);

    const handleEditCheque = (cheque: Cheque) => {
        setChequeToEdit(cheque);
        setActiveTab('generator');
    };

    const handleFinishEditing = () => {
        setChequeToEdit(null);
        setActiveTab('history');
    };


  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Cheque Generator</h1>
        <p className="text-muted-foreground">Generate and print cheques for your parties.</p>
      </header>
       <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-4">
                <TabsTrigger value="generator">Cheque Generator</TabsTrigger>
                <TabsTrigger value="history">Saved Cheques</TabsTrigger>
            </TabsList>
            <TabsContent value="generator">
                 <Suspense fallback={<FormSkeleton />}>
                    <ChequeGeneratorForm 
                        key={chequeToEdit?.id || 'new'}
                        chequeToEdit={chequeToEdit}
                        onSaveSuccess={handleFinishEditing}
                    />
                 </Suspense>
            </TabsContent>
            <TabsContent value="history">
                <SavedChequesList onEdit={handleEditCheque} />
            </TabsContent>
        </Tabs>
    </div>
  );
}
