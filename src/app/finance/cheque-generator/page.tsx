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
import { cn, toNepaliDate } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipProvider, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Textarea } from '@/components/ui/textarea';
import { onAccountsUpdate } from '@/services/account-service';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import html2canvas from 'html2canvas';

type SortKey = 'chequeDate' | 'payeeName' | 'amount' | 'chequeNumber' | 'status' | 'dueStatus';
type SortDirection = 'asc' | 'desc';

interface AugmentedChequeSplit extends ChequeSplit {
    daysRemaining: number;
    isOverdue: boolean;
    parentCheque: Cheque;
    paidAmount: number;
    remainingAmount: number;
}

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
        if (status === 'Paid') return <Badge variant="default" className="bg-emerald-600">Paid</Badge>;
        if (status === 'Canceled') return (
            <TooltipProvider><Tooltip><TooltipTrigger asChild><Badge variant="destructive">Canceled</Badge></TooltipTrigger>
            {cancellationReason && <TooltipContent><p>{cancellationReason}</p></TooltipContent>}</Tooltip></TooltipProvider>
        );
        if (status === 'Partially Paid') return <Badge variant="default" className="bg-blue-600">Partially Paid</Badge>;
        if (isOverdue) return <Badge variant="destructive"><AlertTriangle className="mr-1 h-3 w-3" /> Overdue {-daysRemaining}d</Badge>;
        if (daysRemaining <= 7) return <Badge variant="default" className="bg-amber-500 text-black">Due {daysRemaining}d</Badge>;
        return <Badge variant="outline" className="text-blue-600 border-blue-600">Due {daysRemaining}d</Badge>;
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
                    <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Voucher #{split.parentCheque.voucherNo}</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onSelect={() => onManagePayments(split)}><History className="mr-2 h-4 w-4" /> Payments</DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => onEditVoucher(split.parentCheque)}><Edit className="mr-2 h-4 w-4" /> Edit</DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => onPrintVoucher(split.parentCheque)}><Printer className="mr-2 h-4 w-4"/> Print</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onSelect={() => onMarkAsPaid(split.parentCheque, split.id)} className="text-emerald-600"><Check className="mr-2 h-4 w-4" /> Mark Paid</DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => onMarkAsCanceled(split.parentCheque, split.id)} className="text-red-600"><X className="mr-2 h-4 w-4" /> Cancel</DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => onMarkAsDue(split.parentCheque, split.id)}><Clock className="mr-2 h-4 w-4" /> Mark Due</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <AlertDialog>
                            <AlertDialogTrigger asChild><DropdownMenuItem onSelect={e => e.preventDefault()} className="text-red-600"><Trash2 className="mr-2 h-4 w-4" /> Delete</DropdownMenuItem></AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader><AlertDialogTitle>Delete Voucher?</AlertDialogTitle><AlertDialogDescription>This will remove all associated cheques.</AlertDialogDescription></AlertDialogHeader>
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
    const { toast } = useToast();
    const { user } = useAuth();
    
    const [chequeToPrint, setChequeToPrint] = useState<Cheque | null>(null);
    const [isPrintPreviewOpen, setIsPrintPreviewOpen] = useState(false);
    const printRef = useRef<HTMLDivElement>(null);
    
    const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false);
    const [payingSplit, setPayingSplit] = useState<AugmentedChequeSplit | null>(null);

    const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false);
    const [cancelReason, setCancelReason] = useState('');
    const [splitToCancel, setSplitToCancel] = useState<{cheque: Cheque, splitId: string} | null>(null);

    const [isPaidDialogOpen, setIsPaidDialogOpen] = useState(false);
    const [paidRemark, setPaidRemark] = useState('');
    const [splitToPay, setSplitToPay] = useState<{cheque: Cheque, splitId: string} | null>(null);

    const [isExporting, setIsExporting] = useState(false);

    useEffect(() => {
        const unsubs = [onChequesUpdate(setCheques), onAccountsUpdate(setAccounts)];
        return () => unsubs.forEach(u => u());
    }, []);

    const sortedAndFilteredSplits = useMemo(() => {
        const today = startOfToday().getTime();
        const q = searchQuery.toLowerCase();
        
        let res = cheques.flatMap(c => 
            c.splits.map(s => {
                const paid = (s.partialPayments || []).reduce((sum, p) => sum + p.amount, 0);
                const total = Number(s.amount) || 0;
                const days = Math.ceil((new Date(s.chequeDate).getTime() - today) / (1000 * 60 * 60 * 24));
                return { ...s, chequeDate: new Date(s.chequeDate), daysRemaining: days, isOverdue: days < 0, parentCheque: c, paidAmount: paid, remainingAmount: total - paid } as AugmentedChequeSplit;
            })
        ).filter(s => q === '' || s.parentCheque.payeeName.toLowerCase().includes(q) || (s.chequeNumber || '').toLowerCase().includes(q));

        res.sort((a, b) => {
            const aVal = (a as any)[sortConfig.key] ?? (a.parentCheque as any)[sortConfig.key];
            const bVal = (b as any)[sortConfig.key] ?? (b.parentCheque as any)[sortConfig.key];
            if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
            return sortConfig.direction === 'asc' ? 1 : -1;
        });

        return res;
    }, [cheques, searchQuery, sortConfig]);

    const handleStatusUpdate = useCallback(async (cheque: Cheque, splitId: string, newStatus: ChequeStatus, remark?: string) => {
        if (!user) return;
        const updatedSplits = cheque.splits.map(s => {
            if (s.id === splitId) {
                const updated = { ...s, status: newStatus, cancellationReason: newStatus === 'Canceled' ? remark : null } as any;
                if (newStatus === 'Paid') {
                    const remaining = (Number(s.amount) || 0) - (s.partialPayments || []).reduce((sum, p) => sum + p.amount, 0);
                    if (remaining > 0) updated.partialPayments = [...(s.partialPayments || []), { id: `m-${Date.now()}`, date: new Date().toISOString(), amount: remaining, remarks: remark || 'Paid manually' }];
                }
                return updated;
            }
            return s;
        });
        await updateCheque(cheque.id, { splits: updatedSplits, lastModifiedBy: user.username });
        toast({ title: 'Success' });
    }, [user, toast]);

    return (
        <>
            <Card>
            <CardHeader className="flex flex-row items-center justify-between">
                <div><CardTitle>History</CardTitle></div>
                <div className="relative w-64"><Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" /><Input placeholder="Search..." className="pl-8" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} /></div>
            </CardHeader>
            <CardContent>
                <Table>
                <TableHeader><TableRow>
                    <TableHead>Date</TableHead><TableHead>Payee</TableHead><TableHead>Cheque #</TableHead><TableHead>Amount</TableHead><TableHead>Rem.</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                    {sortedAndFilteredSplits.map(split => (
                        <ChequeSplitRow 
                            key={`${split.parentCheque.id}-${split.id}`}
                            split={split}
                            onManagePayments={(s) => { setPayingSplit(s); setIsPaymentDialogOpen(true); }}
                            onEditVoucher={onEdit}
                            onPrintVoucher={(c) => { setChequeToPrint(c); setIsPrintPreviewOpen(true); }}
                            onMarkAsPaid={(c, id) => { setSplitToPay({cheque: c, splitId: id}); setIsPaidDialogOpen(true); }}
                            onMarkAsCanceled={(c, id) => { setSplitToCancel({cheque: c, splitId: id}); setIsCancelDialogOpen(true); }}
                            onMarkAsDue={(c, id) => handleStatusUpdate(c, id, 'Due')}
                            onDeleteVoucher={(id) => deleteCheque(id)}
                        />
                    ))}
                </TableBody>
                </Table>
            </CardContent>
            </Card>

            <Dialog open={isPaidDialogOpen} onOpenChange={setIsPaidDialogOpen}>
                <DialogContent><DialogHeader><DialogTitle>Confirm Payment</DialogTitle></DialogHeader>
                    <Input value={paidRemark} onChange={e => setPaidRemark(e.target.value)} placeholder="Remark..." />
                    <DialogFooter><Button onClick={() => { if(splitToPay) handleStatusUpdate(splitToPay.cheque, splitToPay.splitId, 'Paid', paidRemark); setIsPaidDialogOpen(false); }}>Paid</Button></DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={isCancelDialogOpen} onOpenChange={setIsCancelDialogOpen}>
                <DialogContent><DialogHeader><DialogTitle>Cancel Cheque</DialogTitle></DialogHeader>
                    <Textarea value={cancelReason} onChange={e => setCancelReason(e.target.value)} placeholder="Reason..." />
                    <DialogFooter><Button variant="destructive" onClick={() => { if(splitToCancel) handleStatusUpdate(splitToCancel.cheque, splitToCancel.splitId, 'Canceled', cancelReason); setIsCancelDialogOpen(false); }}>Cancel</Button></DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}

export default function ChequeGeneratorPage() {
    const [activeTab, setActiveTab] = useState('generator');
    const [chequeToEdit, setCheckToEdit] = useState<Cheque | null>(null);

  return (
    <div className="flex flex-col gap-8">
      <header><h1 className="text-3xl font-bold">Cheque Control</h1></header>
       <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList><TabsTrigger value="generator">Generator</TabsTrigger><TabsTrigger value="history">History</TabsTrigger></TabsList>
            <TabsContent value="generator">
                 <Suspense fallback={<Skeleton className="h-96 w-full" />}>
                    <ChequeGeneratorForm key={chequeToEdit?.id || 'new'} chequeToEdit={chequeToEdit} onSaveSuccess={() => { setCheckToEdit(null); setActiveTab('history'); }} />
                 </Suspense>
            </TabsContent>
            <TabsContent value="history"><SavedChequesList onEdit={(c) => { setCheckToEdit(c); setActiveTab('generator'); }} /></TabsContent>
        </Tabs>
    </div>
  );
}
