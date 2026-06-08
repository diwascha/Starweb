
'use client';

import React, { Suspense, useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { ChequeGeneratorForm } from './_components/cheque-generator-form';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Search, ArrowUpDown, MoreHorizontal, Printer, Trash2, Edit, AlertTriangle, PlusCircle, History, Image as ImageIcon, Save, Loader2, Check, X, Clock } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { onChequesUpdate, deleteCheque, updateCheque } from '@/services/cheque-service';
import type { Cheque, ChequeSplit, ChequeStatus, PartialPayment, Account } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { format, differenceInDays, startOfToday } from 'date-fns';
import { ChequeView } from './_components/cheque-view';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { cn, toNepaliDate, toWords } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { DualCalendar } from '@/components/ui/dual-calendar';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipProvider, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Textarea } from '@/components/ui/textarea';
import { onAccountsUpdate } from '@/services/account-service';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
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

// Extracted TableRow to prevent full table re-renders
const ChequeSplitRow = React.memo(({ 
    split, 
    onManagePayments, 
    onEditVoucher, 
    onPrintVoucher, 
    onMarkAsPaid, 
    onMarkAsCanceled, 
    onMarkAsDue, 
    onDeleteVoucher 
}: { 
    split: AugmentedChequeSplit,
    onManagePayments: (s: AugmentedChequeSplit) => void,
    onEditVoucher: (c: Cheque) => void,
    onPrintVoucher: (c: Cheque) => void,
    onMarkAsPaid: (c: Cheque, id: string) => void,
    onMarkAsCanceled: (c: Cheque, id: string) => void,
    onMarkAsDue: (c: Cheque, id: string) => void,
    onDeleteVoucher: (id: string) => void
}) => {
    const getStatusBadge = () => {
        const { status, daysRemaining, isOverdue, cancellationReason } = split;
        if (status === 'Paid') return <Badge variant="default" className="bg-green-600 hover:bg-green-700">Paid</Badge>;
        if (status === 'Canceled') return (
            <TooltipProvider><Tooltip><TooltipTrigger asChild><Badge variant="destructive">Canceled</Badge></TooltipTrigger>
            {cancellationReason && <TooltipContent><p>{cancellationReason}</p></TooltipContent>}</Tooltip></TooltipProvider>
        );
        if (status === 'Partially Paid') return <Badge variant="default" className="bg-blue-600 hover:bg-blue-700">Partially Paid</Badge>;
        if (isOverdue) return <Badge variant="destructive"><AlertTriangle className="mr-1 h-3 w-3" /> Overdue by {-daysRemaining} day(s)</Badge>;
        if (daysRemaining <= 7) return <Badge variant="default" className="bg-yellow-500 text-black hover:bg-yellow-600"><AlertTriangle className="mr-1 h-3 w-3" /> Due in {daysRemaining} day(s)</Badge>;
        return <Badge variant="outline" className="text-blue-600 border-blue-600">Due in {daysRemaining} day(s)</Badge>;
    };

    return (
        <TableRow>
            <TableCell>{toNepaliDate(split.chequeDate.toISOString())}</TableCell>
            <TableCell>{split.parentCheque.payeeName}</TableCell>
            <TableCell>{split.chequeNumber}</TableCell>
            <TableCell>{Number(split.amount).toLocaleString()}</TableCell>
            <TableCell>{split.remainingAmount.toLocaleString()}</TableCell>
            <TableCell>{getStatusBadge()}</TableCell>
            <TableCell className="text-right">
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Voucher #{split.parentCheque.voucherNo}</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onSelect={() => onManagePayments(split)}><History className="mr-2 h-4 w-4" /> Manage Payments</DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => onEditVoucher(split.parentCheque)}><Edit className="mr-2 h-4 w-4" /> Edit Voucher</DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => onPrintVoucher(split.parentCheque)}><Printer className="mr-2 h-4 w-4"/> Print Voucher</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onSelect={() => onMarkAsPaid(split.parentCheque, split.id)}><Check className="mr-2 h-4 w-4 text-green-600" /> Mark as Paid</DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => onMarkAsCanceled(split.parentCheque, split.id)}><X className="mr-2 h-4 w-4 text-destructive" /> Mark as Canceled</DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => onMarkAsDue(split.parentCheque, split.id)}><Clock className="mr-2 h-4 w-4" /> Mark as Due</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <DropdownMenuItem onSelect={e => e.preventDefault()}><Trash2 className="mr-2 h-4 w-4 text-destructive" /> <span className="text-destructive">Delete Voucher</span></DropdownMenuItem>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader><AlertDialogTitle>Are you sure?</AlertDialogTitle><AlertDialogDescription>This action will delete the entire voucher and all its associated cheques. It cannot be undone.</AlertDialogDescription></AlertDialogHeader>
                                <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => onDeleteVoucher(split.parentCheque.id)}>Delete</AlertDialogAction></AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    </DropdownMenuContent>
                </DropdownMenu>
            </TableCell>
        </TableRow>
    );
});
ChequeSplitRow.displayName = 'ChequeSplitRow';

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

    const [isPaidDialogOpen, setIsPaidDialogOpen] = useState(false);
    const [paidRemark, setPaidRemark] = useState('');
    const [splitToPay, setSplitToPay] = useState<{cheque: Cheque, splitId: string} | null>(null);

    const [isExporting, setIsExporting] = useState(false);

    useEffect(() => {
        const unsubCheques = onChequesUpdate(setCheques);
        const unsubAccounts = onAccountsUpdate(setAccounts);
        return () => {
          unsubCheques();
          unsubAccounts();
        };
    }, []);

    const requestSort = useCallback((key: SortKey) => {
        setSortConfig(prev => ({
            key,
            direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
        }));
    }, []);

    const uniquePayees = useMemo(() => {
        const payees = new Set(cheques.map(c => c.payeeName));
        return ['All', ...Array.from(payees).sort()];
    }, [cheques]);

    const sortedAndFilteredSplits = useMemo(() => {
        const today = startOfToday().getTime();
        const queryNormalized = searchQuery.trim().toLowerCase();
        
        // Single pass for mapping and filtering to O(n)
        let result = cheques.flatMap(c => 
            c.splits.map(s => {
                const chequeTime = new Date(s.chequeDate).getTime();
                const paidAmount = (s.partialPayments || []).reduce((sum, p) => sum + p.amount, 0);
                const totalAmount = Number(s.amount) || 0;
                const daysRemaining = Math.ceil((chequeTime - today) / (1000 * 60 * 60 * 24));
                
                return {
                    ...s,
                    chequeDate: new Date(chequeTime),
                    daysRemaining,
                    isOverdue: daysRemaining < 0,
                    parentCheque: c,
                    amount: totalAmount,
                    paidAmount,
                    remainingAmount: totalAmount - paidAmount,
                    status: s.status || 'Due'
                };
            })
        ).filter(s => {
            if (filterStatus !== 'All' && s.status !== filterStatus) return false;
            if (filterPayee !== 'All' && s.parentCheque.payeeName !== filterPayee) return false;
            if (queryNormalized) {
                return (
                    s.parentCheque.payeeName.toLowerCase().includes(queryNormalized) ||
                    (s.chequeNumber || '').toLowerCase().includes(queryNormalized) ||
                    (s.parentCheque.invoiceNumber || '').toLowerCase().includes(queryNormalized) ||
                    (s.parentCheque.voucherNo || '').toLowerCase().includes(queryNormalized)
                );
            }
            return true;
        });

        // Sort pass
        result.sort((a, b) => {
            let aVal, bVal;
            if (sortConfig.key === 'chequeDate') {
                aVal = a.chequeDate.getTime();
                bVal = b.chequeDate.getTime();
            } else if (sortConfig.key === 'payeeName') {
                aVal = a.parentCheque.payeeName;
                bVal = b.parentCheque.payeeName;
            } else if (sortConfig.key === 'dueStatus') {
                aVal = a.daysRemaining;
                bVal = b.daysRemaining;
            } else {
                 aVal = a[sortConfig.key as keyof AugmentedChequeSplit];
                 bVal = b[sortConfig.key as keyof AugmentedChequeSplit];
            }
            
            if (aVal === bVal) return 0;
            const res = aVal < bVal ? -1 : 1;
            return sortConfig.direction === 'asc' ? res : -res;
        });

        return result;
    }, [cheques, searchQuery, sortConfig, filterStatus, filterPayee]);

    const handleDelete = useCallback(async (id: string) => {
        try {
            await deleteCheque(id);
            toast({ title: "Deleted", description: "Cheque record has been deleted." });
        } catch (error) {
            toast({ title: "Error", description: "Failed to delete cheque record.", variant: "destructive" });
        }
    }, [toast]);
    
    const handlePrintRequest = useCallback((cheque: Cheque) => {
        setChequeToPrint(cheque);
        setIsPrintPreviewOpen(true);
    }, []);

    const doActualPrint = useCallback(() => {
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
    }, []);
    
    const handleExportPdf = useCallback(async () => {
        if (!chequeToPrint) return;
        setIsExporting(true);
        try {
            const doc = new jsPDF('p', 'mm', 'a4');
            const account = accounts.find(a => a.id === chequeToPrint.accountId);
            doc.setFont('Helvetica', 'bold'); doc.setFontSize(16);
            doc.text('SHIVAM PACKAGING INDUSTRIES PVT LTD.', doc.internal.pageSize.getWidth() / 2, 15, { align: 'center' });
            doc.setFont('Helvetica', 'normal'); doc.setFontSize(10);
            doc.text('HETAUDA 08, BAGMATI PROVIENCE, NEPAL', doc.internal.pageSize.getWidth() / 2, 21, { align: 'center' });
            doc.setFont('Helvetica', 'bold'); doc.setFontSize(14);
            doc.text('PAYMENT VOUCHER', doc.internal.pageSize.getWidth() / 2, 30, { align: 'center' });
            doc.setFontSize(10);
            doc.text(`Voucher No: ${chequeToPrint.voucherNo}`, 14, 40);
            doc.text(`Payee: ${chequeToPrint.partyName}`, 14, 45);
            doc.text(`Date: ${toNepaliDate(chequeToPrint.paymentDate)} BS (${format(new Date(chequeToPrint.paymentDate), 'yyyy-MM-dd')})`, doc.internal.pageSize.getWidth() - 14, 40, { align: 'right' });
            const body = chequeToPrint.splits.map(split => [
                account && account.type === 'Bank' ? `${account.bankName}\nA/C: ${account.accountNumber}` : "Cash Payment",
                split.chequeNumber || 'N/A',
                `${toNepaliDate(split.chequeDate)} (${format(new Date(split.chequeDate), 'yyyy-MM-dd')})`,
                (Number(split.amount) || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })
            ]);
            autoTable(doc, {
                startY: 55,
                head: [['Bank Details', 'Cheque No.', 'Cheque Date', 'Amount']],
                body: body,
                theme: 'grid',
                headStyles: { fillColor: [230, 230, 230], textColor: 20, fontStyle: 'bold' },
                foot: [['Total', '', '', { content: chequeToPrint.amount.toLocaleString(undefined, { minimumFractionDigits: 2 }), styles: { halign: 'right' } }]],
                footStyles: { fontStyle: 'bold', fontSize: 11 },
                didDrawPage: (data) => {
                    let finalY = data.cursor.y;
                    doc.setFontSize(10);
                    doc.text(`In Words: ${chequeToPrint.amountInWords}`, 14, finalY + 10);
                    const signatureY = Math.max(finalY + 40, doc.internal.pageSize.getHeight() - 40);
                    doc.line(20, signatureY, 70, signatureY); doc.text("Receiver's Signature", 45, signatureY + 5, { align: 'center' });
                    doc.line(doc.internal.pageSize.getWidth() - 70, signatureY, doc.internal.pageSize.getWidth() - 20, signatureY); doc.text("Authorized Signature", doc.internal.pageSize.getWidth() - 45, signatureY + 5, { align: 'center' });
                }
            });
            doc.save(`Voucher-${chequeToPrint.voucherNo}.pdf`);
        } catch (error) {
            toast({ title: 'Error', description: 'Failed to export PDF.', variant: 'destructive' });
        } finally {
            setIsExporting(false);
        }
    }, [chequeToPrint, accounts, toast]);

    const handleExportJpg = useCallback(async () => {
        if (!printRef.current || !chequeToPrint) return;
        setIsExporting(true);
        try {
            const canvas = await html2canvas(printRef.current, { scale: 3, useCORS: true, backgroundColor: '#ffffff' });
            const link = document.createElement('a');
            link.download = `Voucher-${chequeToPrint.voucherNo}.jpg`;
            link.href = canvas.toDataURL('image/jpeg', 0.9);
            link.click();
        } catch (error) {
            toast({ title: 'Export Failed', description: `Could not export as JPG.`, variant: 'destructive' });
        } finally {
            setIsExporting(false);
        }
    }, [chequeToPrint, toast]);

    const handleStatusUpdate = useCallback(async (cheque: Cheque, splitId: string, newStatus: ChequeStatus, reasonOrRemark?: string) => {
        if (!user) return;
        const updatedSplits = cheque.splits.map(s => {
            if (s.id === splitId) {
                let finalCancellationReason = s.cancellationReason || null;
                if (newStatus === 'Canceled') finalCancellationReason = reasonOrRemark || 'No reason provided';
                else finalCancellationReason = null;

                const updatedSplit: any = { ...s, status: newStatus, cancellationReason: finalCancellationReason };
                if (newStatus === 'Paid') {
                    const totalAmount = Number(s.amount) || 0;
                    const paidSoFar = (s.partialPayments || []).reduce((sum, p) => sum + p.amount, 0);
                    const remaining = totalAmount - paidSoFar;
                    if (remaining > 0) {
                        updatedSplit.partialPayments = [...(s.partialPayments || []), { id: `manual-${Date.now()}`, date: new Date().toISOString(), amount: remaining, remarks: reasonOrRemark || 'Marked as paid manually' }];
                    }
                }
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
    }, [user, toast]);

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
                        <div className="relative">
                            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input placeholder="Search..." className="pl-8 w-full sm:w-[200px]" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                        </div>
                        <Select value={filterStatus} onValueChange={setFilterStatus}>
                            <SelectTrigger className="w-full sm:w-[150px]"><SelectValue placeholder="Status" /></SelectTrigger>
                            <SelectContent><SelectItem value="All">All Statuses</SelectItem><SelectItem value="Due">Due</SelectItem><SelectItem value="Paid">Paid</SelectItem><SelectItem value="Canceled">Canceled</SelectItem><SelectItem value="Partially Paid">Partially Paid</SelectItem></SelectContent>
                        </Select>
                        <Select value={filterPayee} onValueChange={setFilterPayee}>
                            <SelectTrigger className="w-full sm:w-[200px]"><SelectValue placeholder="Payee" /></SelectTrigger>
                            <SelectContent>{uniquePayees.map(payee => <SelectItem key={payee} value={payee}>{payee}</SelectItem>)}</SelectContent>
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
                        <ChequeSplitRow 
                            key={`${split.parentCheque.id}-${split.id}`}
                            split={split}
                            onManagePayments={(s) => { setPayingSplit(s); setIsPaymentDialogOpen(true); }}
                            onEditVoucher={onEdit}
                            onPrintVoucher={handlePrintRequest}
                            onMarkAsPaid={(c, id) => { setSplitToPay({cheque: c, splitId: id}); setIsPaidDialogOpen(true); }}
                            onMarkAsCanceled={(c, id) => { setSplitToCancel({cheque: c, splitId: id}); setIsCancelDialogOpen(true); }}
                            onMarkAsDue={handleStatusUpdate}
                            onDeleteVoucher={handleDelete}
                        />
                    ))
                    ) : (
                    <TableRow><TableCell colSpan={7} className="text-center">No saved cheques yet.</TableCell></TableRow>
                    )}
                </TableBody>
                </Table>
            </CardContent>
            </Card>

            {isPrintPreviewOpen && (
             <Dialog open={isPrintPreviewOpen} onOpenChange={setIsPrintPreviewOpen}>
                <DialogContent className="max-w-4xl">
                    <DialogHeader><DialogTitle>Voucher Preview</DialogTitle></DialogHeader>
                     <div className="max-h-[70vh] overflow-auto p-4 bg-gray-100">
                         <div ref={printRef}>
                            {chequeToPrint && <ChequeView voucherNo={chequeToPrint.voucherNo} voucherDate={new Date(chequeToPrint.createdAt)} payeeName={chequeToPrint.payeeName} account={accounts.find(a => a.id === chequeToPrint.accountId)} splits={chequeToPrint.splits.map(s => ({ ...s, chequeDate: new Date(s.chequeDate) }))} />}
                         </div>
                    </div>
                     <DialogFooter className="sm:justify-end gap-2">
                        <Button variant="outline" onClick={() => setIsPrintPreviewOpen(false)}>Cancel</Button>
                        <Button variant="outline" onClick={handleExportJpg} disabled={isExporting}>{isExporting ? <Loader2 className="animate-spin h-4 w-4"/> : <ImageIcon className="h-4 w-4"/>} Export as JPG</Button>
                        <Button variant="outline" onClick={handleExportPdf} disabled={isExporting}>{isExporting ? <Loader2 className="animate-spin h-4 w-4"/> : <Save className="h-4 w-4"/>} Export as PDF</Button>
                        <Button onClick={doActualPrint}><Printer className="mr-2 h-4 w-4" /> Print</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            )}

            {isPaymentDialogOpen && (
             <Dialog open={isPaymentDialogOpen} onOpenChange={setIsPaymentDialogOpen}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader><DialogTitle>Manage Payments</DialogTitle><DialogDescription>For Cheque # {payingSplit?.chequeNumber} to {payingSplit?.parentCheque.payeeName}</DialogDescription></DialogHeader>
                    {payingSplit && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-4">
                            <div>
                                <h4 className="font-semibold mb-2">Payment History</h4>
                                <ScrollArea className="h-64 border rounded-md">
                                    {(payingSplit.partialPayments || []).length > 0 ? (
                                        <Table>
                                            <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Amount</TableHead><TableHead className="text-right"></TableHead></TableRow></TableHeader>
                                            <TableBody>
                                                {(payingSplit.partialPayments || []).map(p => (
                                                    <TableRow key={p.id}>
                                                        <TableCell>{format(new Date(p.date), 'PP')}</TableCell>
                                                        <TableCell>{p.amount.toLocaleString()}</TableCell>
                                                        <TableCell className="text-right">
                                                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditingPayment(p); setPaymentForm({ date: new Date(p.date), amount: p.amount, remarks: p.remarks || '' }); }}><Edit className="h-4 w-4" /></Button>
                                                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={async () => {
                                                                const updatedSplits = payingSplit.parentCheque.splits.map(s => {
                                                                    if (s.id === payingSplit.id) {
                                                                        const up = (s.partialPayments || []).filter(pay => pay.id !== p.id);
                                                                        const tp = up.reduce((sum, pay) => sum + pay.amount, 0);
                                                                        let ns: ChequeStatus = 'Due';
                                                                        if (tp >= Number(s.amount)) ns = 'Paid'; else if (tp > 0) ns = 'Partially Paid';
                                                                        return { ...s, partialPayments: up, status: ns };
                                                                    }
                                                                    return s;
                                                                });
                                                                await updateCheque(payingSplit.parentCheque.id, { splits: updatedSplits, lastModifiedBy: user?.username });
                                                            }}><Trash2 className="h-4 w-4" /></Button>
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    ) : <p className="text-center text-sm text-muted-foreground p-4">No payments recorded.</p>}
                                </ScrollArea>
                            </div>
                            <div className="space-y-4">
                                <h4 className="font-semibold">{editingPayment ? 'Edit Payment' : 'Add New Payment'}</h4>
                                <div className="grid grid-cols-2 text-sm">
                                    <div><span className="font-medium">Total:</span> {Number(payingSplit.amount).toLocaleString()}</div>
                                    <div className="font-bold"><span className="font-medium">Remaining:</span> {payingSplit.remainingAmount.toLocaleString()}</div>
                                </div>
                                <div className="space-y-2">
                                    <Label>Payment Date</Label>
                                    <Popover><PopoverTrigger asChild><Button variant="outline" className="w-full justify-start text-left font-normal"><CalendarIcon className="mr-2 h-4 w-4" /> {format(paymentForm.date, 'PP')}</Button></PopoverTrigger>
                                    <PopoverContent className="w-auto p-0"><DualCalendar selected={paymentForm.date} onSelect={(d) => d && setPaymentForm(p => ({...p, date: d}))} /></PopoverContent></Popover>
                                </div>
                                <div className="space-y-2"><Label>Payment Amount</Label><Input type="number" value={paymentForm.amount} onChange={(e) => setPaymentForm(p => ({...p, amount: parseFloat(e.target.value) || 0}))} /></div>
                                <div className="space-y-2"><Label>Remarks</Label><Input value={paymentForm.remarks} onChange={(e) => setPaymentForm(p => ({...p, remarks: e.target.value}))} /></div>
                                <div className="flex justify-end gap-2">
                                     {editingPayment && <Button variant="ghost" onClick={() => {setEditingPayment(null); setPaymentForm({ date: new Date(), amount: 0, remarks: '' });}}>Cancel</Button>}
                                     <Button onClick={async () => {
                                        const updatedSplits = payingSplit.parentCheque.splits.map(s => {
                                            if (s.id === payingSplit.id) {
                                                const ep = s.partialPayments || [];
                                                let up;
                                                if (editingPayment) up = ep.map(pay => pay.id === editingPayment.id ? { ...pay, date: paymentForm.date.toISOString(), amount: paymentForm.amount, remarks: paymentForm.remarks || '' } : pay);
                                                else up = [...ep, { id: Date.now().toString(), date: paymentForm.date.toISOString(), amount: paymentForm.amount, remarks: paymentForm.remarks || '' }];
                                                const tp = up.reduce((sum, pay) => sum + pay.amount, 0);
                                                let ns: ChequeStatus = 'Due';
                                                if (tp >= Number(s.amount)) ns = 'Paid'; else if (tp > 0) ns = 'Partially Paid';
                                                return { ...s, partialPayments: up, status: ns };
                                            }
                                            return s;
                                        });
                                        await updateCheque(payingSplit.parentCheque.id, { splits: updatedSplits, lastModifiedBy: user?.username });
                                        setEditingPayment(null); setPaymentForm({ date: new Date(), amount: 0, remarks: '' });
                                     }}>{editingPayment ? 'Save' : 'Add'}</Button>
                                </div>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
            )}
        </>
    );
}

export default function ChequeGeneratorPage() {
    const [activeTab, setActiveTab] = useState('generator');
    const [chequeToEdit, setCheckToEdit] = useState<Cheque | null>(null);

    const handleEditCheque = useCallback((cheque: Cheque) => {
        setCheckToEdit(cheque);
        setActiveTab('generator');
    }, []);

    const handleFinishEditing = useCallback(() => {
        setCheckToEdit(null);
        setActiveTab('history');
    }, []);

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
