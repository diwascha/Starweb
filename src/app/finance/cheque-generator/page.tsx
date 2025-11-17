

'use client';

import { Suspense, useState, useEffect, useMemo, useRef } from 'react';
import { ChequeGeneratorForm } from './_components/cheque-generator-form';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Search, ArrowUpDown, MoreHorizontal, Printer, Trash2, Edit, AlertTriangle, PlusCircle, History, Image as ImageIcon, Save, Loader2 } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { onChequesUpdate, deleteCheque, updateCheque } from '@/services/cheque-service';
import type { Cheque, ChequeSplit, ChequeStatus, PartialPayment, Account } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { format, differenceInDays, startOfToday, parseISO } from 'date-fns';
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
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Textarea } from '@/components/ui/textarea';
import { onAccountsUpdate } from '@/services/account-service';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';


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
    const [accounts, setAccounts] = useState<Account[]>([]);
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
    const [paymentForm, setPaymentForm] = useState<{ date: Date, amount: number, remarks?: string }>({ date: new Date(), amount: 0, remarks: '' });
    const [payingSplit, setPayingSplit] = useState<AugmentedChequeSplit | null>(null);
    const [editingPayment, setEditingPayment] = useState<PartialPayment | null>(null);

    const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false);
    const [cancelReason, setCancelReason] = useState('');
    const [splitToCancel, setSplitToCancel] = useState<{cheque: Cheque, splitId: string} | null>(null);

    const [isExporting, setIsExporting] = useState(false);


    useEffect(() => {
        const unsubCheques = onChequesUpdate(setCheques);
        const unsubAccounts = onAccountsUpdate(setAccounts);
        return () => {
          unsubCheques();
          unsubAccounts();
        };
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
    
    const handleExportPdf = async () => {
        if (!printRef.current || !chequeToPrint) return;
        setIsExporting(true);
        try {
            const doc = new jsPDF('p', 'mm', 'a5');
            const content = printRef.current;
            await html2canvas(content, { scale: 2 }).then((canvas) => {
                const imgData = canvas.toDataURL('image/png');
                const pdfWidth = doc.internal.pageSize.getWidth();
                const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
                doc.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
                doc.save(`Voucher-${chequeToPrint.voucherNo}.pdf`);
            });
        } catch (error) {
            console.error('PDF export failed:', error);
            toast({ title: 'Error', description: 'Failed to export PDF.', variant: 'destructive' });
        } finally {
            setIsExporting(false);
        }
    };

    const handleExportJpg = async () => {
        if (!printRef.current || !chequeToPrint) return;
        setIsExporting(true);
        try {
            const canvas = await html2canvas(printRef.current, { scale: 3, useCORS: true, backgroundColor: '#ffffff' });
            const link = document.createElement('a');
            link.download = `Voucher-${chequeToPrint.voucherNo}.jpg`;
            link.href = canvas.toDataURL('image/jpeg', 0.9);
            link.click();
        } catch (error) {
            console.error(`Failed to export as JPG`, error);
            toast({ title: 'Export Failed', description: `Could not export as JPG.`, variant: 'destructive' });
        } finally {
            setIsExporting(false);
        }
    };

    const getStatusBadge = (split: AugmentedChequeSplit) => {
        const { status, daysRemaining, isOverdue, cancellationReason } = split;

        if (status === 'Paid') {
            return <Badge variant="default" className="bg-green-600 hover:bg-green-700">Paid</Badge>;
        }
        if (status === 'Canceled') {
            return (
                <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger asChild>
                             <Badge variant="destructive">Canceled</Badge>
                        </TooltipTrigger>
                        {cancellationReason && <TooltipContent><p>{cancellationReason}</p></TooltipContent>}
                    </Tooltip>
                </TooltipProvider>
            );
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
    
    const openPaymentDialog = (split: AugmentedChequeSplit) => {
        setPayingSplit(split);
        setEditingPayment(null);
        setPaymentForm({ date: new Date(), amount: 0, remarks: '' });
        setIsPaymentDialogOpen(true);
    };

    const handleEditPayment = (payment: PartialPayment) => {
        setEditingPayment(payment);
        setPaymentForm({
            date: new Date(payment.date),
            amount: payment.amount,
            remarks: payment.remarks || ''
        });
    };
    
    const handleDeletePayment = async (paymentId: string) => {
        if (!payingSplit || !user) return;
        
        const updatedSplits = payingSplit.parentCheque.splits.map(s => {
            if (s.id === payingSplit.id) {
                const updatedPayments = (s.partialPayments || []).filter(p => p.id !== paymentId);
                const totalPaid = updatedPayments.reduce((sum, p) => sum + p.amount, 0);

                let newStatus: ChequeStatus = 'Due';
                if (totalPaid >= Number(s.amount)) newStatus = 'Paid';
                else if (totalPaid > 0) newStatus = 'Partially Paid';

                return { ...s, partialPayments: updatedPayments, status: newStatus };
            }
            return s;
        });

        try {
            await updateCheque(payingSplit.parentCheque.id, { splits: updatedSplits, lastModifiedBy: user.username });
            toast({ title: 'Payment Deleted', description: 'Partial payment has been removed.' });
        } catch (error) {
            toast({ title: 'Error', description: 'Failed to delete payment.', variant: 'destructive' });
        }
    };


    const handleSavePayment = async () => {
        if (!payingSplit || !user) return;
        
        const { date, amount, remarks } = paymentForm;
        
        const maxAmount = editingPayment ? payingSplit.remainingAmount + editingPayment.amount : payingSplit.remainingAmount;
        if (amount <= 0 || amount > maxAmount) {
            toast({ title: "Invalid Amount", description: `Payment must be between 0 and ${maxAmount}.`, variant: "destructive" });
            return;
        }

        const updatedSplits = payingSplit.parentCheque.splits.map(s => {
            if (s.id === payingSplit.id) {
                const existingPayments = s.partialPayments || [];
                let updatedPayments: PartialPayment[];

                if (editingPayment) {
                     updatedPayments = existingPayments.map(p => 
                        p.id === editingPayment.id ? { ...p, date: date.toISOString(), amount, remarks: remarks || '' } : p
                    );
                } else {
                    const newPayment: PartialPayment = { id: Date.now().toString(), date: date.toISOString(), amount, remarks: remarks || '' };
                    updatedPayments = [...existingPayments, newPayment];
                }
                
                const totalPaid = updatedPayments.reduce((sum, p) => sum + p.amount, 0);
                
                let newStatus: ChequeStatus = 'Due';
                if (totalPaid >= Number(s.amount)) newStatus = 'Paid';
                else if (totalPaid > 0) newStatus = 'Partially Paid';

                return { ...s, partialPayments: updatedPayments, status: newStatus };
            }
            return s;
        });

        try {
            await updateCheque(payingSplit.parentCheque.id, { splits: updatedSplits, lastModifiedBy: user.username });
            toast({ title: 'Success', description: `Payment ${editingPayment ? 'updated' : 'added'}.` });
            setEditingPayment(null);
            setPaymentForm({ date: new Date(), amount: 0, remarks: '' });
        } catch (error) {
            console.error("Failed to save payment:", error);
            toast({ title: 'Error', description: 'Failed to save payment.', variant: 'destructive' });
        }
    };


    const handleStatusUpdate = async (cheque: Cheque, splitId: string, newStatus: ChequeStatus, reason?: string) => {
        if (!user) return;
        const updatedSplits = cheque.splits.map(s => {
            if (s.id === splitId) {
                const updatedSplit = { ...s, status: newStatus, cancellationReason: newStatus === 'Canceled' ? reason : undefined };
                return updatedSplit;
            }
            return s;
        });
        try {
            await updateCheque(cheque.id, { splits: updatedSplits, lastModifiedBy: user.username });
            toast({ title: 'Status Updated', description: `Cheque status set to ${newStatus}.` });
        } catch (error) {
            toast({ title: 'Error', description: 'Failed to update status.', variant: 'destructive' });
        }
    };

    const handleConfirmCancel = () => {
        if (splitToCancel && cancelReason) {
            handleStatusUpdate(splitToCancel.cheque, splitToCancel.splitId, 'Canceled', cancelReason);
            setIsCancelDialogOpen(false);
            setCancelReason('');
            setSplitToCancel(null);
        } else {
            toast({ title: 'Reason Required', description: 'Please provide a reason for cancellation.', variant: 'destructive' });
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
                    <TableHead><Button variant="ghost" onClick={() => requestSort('dueStatus')}>Due Status</Button></TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {sortedAndFilteredSplits.length > 0 ? (
                        sortedAndFilteredSplits.map(split => (
                        <TableRow key={`${split.parentCheque.id}-${split.id}`}>
                        <TableCell>{toNepaliDate(split.chequeDate.toISOString())}</TableCell>
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
                                    <DropdownMenuItem onSelect={() => openPaymentDialog(split)}><History className="mr-2 h-4 w-4" /> Manage Payments</DropdownMenuItem>
                                    <DropdownMenuItem onSelect={() => onEdit(split.parentCheque)}><Edit className="mr-2 h-4 w-4" /> Edit Voucher</DropdownMenuItem>
                                    <DropdownMenuItem onSelect={() => handlePrint(split.parentCheque)}><Printer className="mr-2 h-4 w-4"/> Print Voucher</DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                     <DropdownMenuItem onSelect={() => handleStatusUpdate(split.parentCheque, split.id, 'Paid')}>Mark as Paid</DropdownMenuItem>
                                     <DropdownMenuItem onSelect={() => {setSplitToCancel({cheque: split.parentCheque, splitId: split.id}); setIsCancelDialogOpen(true);}}>Mark as Canceled</DropdownMenuItem>
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
                        <DialogTitle>Voucher Preview</DialogTitle>
                        <DialogDescription>Review the cheque voucher before printing or exporting.</DialogDescription>
                    </DialogHeader>
                     <div className="max-h-[70vh] overflow-auto p-4 bg-gray-100">
                         <div ref={printRef}>
                            {chequeToPrint && (
                                <ChequeView
                                    voucherNo={chequeToPrint.voucherNo}
                                    voucherDate={new Date(chequeToPrint.createdAt)}
                                    payeeName={chequeToPrint.payeeName}
                                    account={accounts.find(a => a.id === chequeToPrint.accountId)}
                                    splits={chequeToPrint.splits.map(s => ({
                                        ...s,
                                        chequeDate: new Date(s.chequeDate)
                                    }))}
                                />
                            )}
                         </div>
                    </div>
                     <DialogFooter className="sm:justify-end gap-2">
                        <Button variant="outline" onClick={() => setIsPrintPreviewOpen(false)}>Cancel</Button>
                        <Button variant="outline" onClick={handleExportJpg} disabled={isExporting}>
                            {isExporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <ImageIcon className="mr-2 h-4 w-4"/>}
                             Export as JPG
                        </Button>
                        <Button variant="outline" onClick={handleExportPdf} disabled={isExporting}>
                            {isExporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Save className="mr-2 h-4 w-4"/>}
                            Export as PDF
                        </Button>
                        <Button onClick={doActualPrint}><Printer className="mr-2 h-4 w-4" /> Print</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

             <Dialog open={isPaymentDialogOpen} onOpenChange={setIsPaymentDialogOpen}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Manage Payments</DialogTitle>
                        <DialogDescription>
                            For Cheque # {payingSplit?.chequeNumber} to {payingSplit?.parentCheque.payeeName}
                        </DialogDescription>
                    </DialogHeader>
                    {payingSplit && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-4">
                            <div>
                                <h4 className="font-semibold mb-2">Payment History</h4>
                                <ScrollArea className="h-64 border rounded-md">
                                    {(payingSplit.partialPayments || []).length > 0 ? (
                                        <Table>
                                            <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Amount</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
                                            <TableBody>
                                                {(payingSplit.partialPayments || []).map(p => (
                                                    <TableRow key={p.id}>
                                                        <TableCell>{format(new Date(p.date), 'PPP')}</TableCell>
                                                        <TableCell>{p.amount.toLocaleString()}</TableCell>
                                                        <TableCell className="text-right">
                                                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEditPayment(p)}><Edit className="h-4 w-4" /></Button>
                                                            <AlertDialog>
                                                                <AlertDialogTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7 text-destructive"><Trash2 className="h-4 w-4" /></Button></AlertDialogTrigger>
                                                                <AlertDialogContent>
                                                                    <AlertDialogHeader><AlertDialogTitle>Delete Payment?</AlertDialogTitle><AlertDialogDescription>This will permanently delete this partial payment record.</AlertDialogDescription></AlertDialogHeader>
                                                                    <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => handleDeletePayment(p.id)}>Delete</AlertDialogAction></AlertDialogFooter>
                                                                </AlertDialogContent>
                                                            </AlertDialog>
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    ) : (
                                        <p className="text-center text-sm text-muted-foreground p-4">No payments recorded yet.</p>
                                    )}
                                </ScrollArea>
                            </div>
                            <div className="space-y-4">
                                <h4 className="font-semibold">{editingPayment ? 'Edit Payment' : 'Add New Payment'}</h4>
                                <div className="grid grid-cols-2 text-sm">
                                    <div><span className="font-medium">Total:</span> {Number(payingSplit.amount).toLocaleString()}</div>
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
                                        max={editingPayment ? payingSplit.remainingAmount + editingPayment.amount : payingSplit.remainingAmount}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="payment-remarks">Remarks (Optional)</Label>
                                    <Input id="payment-remarks" value={paymentForm.remarks} onChange={(e) => setPaymentForm(p => ({...p, remarks: e.target.value}))} />
                                </div>
                                <div className="flex justify-end gap-2">
                                     {editingPayment && <Button variant="ghost" onClick={() => {setEditingPayment(null); setPaymentForm({ date: new Date(), amount: 0, remarks: '' });}}>Cancel Edit</Button>}
                                     <Button onClick={handleSavePayment}>{editingPayment ? 'Save Changes' : 'Add Payment'}</Button>
                                </div>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
            <Dialog open={isCancelDialogOpen} onOpenChange={setIsCancelDialogOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Reason for Cancellation</DialogTitle>
                        <DialogDescription>
                            Please provide a reason for canceling cheque # {splitToCancel && splitToCancel.cheque.splits.find(s => s.id === splitToCancel.splitId)?.chequeNumber}.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4">
                        <Textarea
                            placeholder="Enter reason here..."
                            value={cancelReason}
                            onChange={(e) => setCancelReason(e.target.value)}
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsCancelDialogOpen(false)}>Cancel</Button>
                        <Button variant="destructive" onClick={handleConfirmCancel}>Confirm Cancellation</Button>
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
