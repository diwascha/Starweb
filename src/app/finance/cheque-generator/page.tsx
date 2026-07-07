'use client';

import React, { Suspense, useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { ChequeGeneratorForm } from './_components/cheque-generator-form';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Search, ArrowUpDown, MoreHorizontal, Printer, Trash2, Edit, AlertTriangle, PlusCircle, History, Image as ImageIcon, Save, Loader2, Check, X, Clock, FilterX } from 'lucide-react';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
            <TableCell className="font-medium">{split.parentCheque.payeeName}</TableCell>
            <TableCell className="font-mono text-xs">{split.chequeNumber}</TableCell>
            <TableCell className="font-mono">Rs. {Number(split.amount).toLocaleString()}</TableCell>
            <TableCell className="font-mono">Rs. {split.remainingAmount.toLocaleString()}</TableCell>
            <TableCell>{getStatusBadge()}</TableCell>
            <TableCell className="text-right">
                <DropdownMenu>
                    <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
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
    const [filterParty, setFilterParty] = useState('All');
    const [filterStatus, setFilterStatus] = useState('All');
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

    const uniqueParties = useMemo(() => {
        const parties = new Set(cheques.map(c => c.payeeName));
        return Array.from(parties).sort();
    }, [cheques]);

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
        ).filter(s => {
            const matchesSearch = q === '' || s.parentCheque.payeeName.toLowerCase().includes(q) || (s.chequeNumber || '').toLowerCase().includes(q);
            const matchesParty = filterParty === 'All' || s.parentCheque.payeeName === filterParty;
            const matchesStatus = filterStatus === 'All' || s.status === filterStatus;
            return matchesSearch && matchesParty && matchesStatus;
        });

        res.sort((a, b) => {
            const aVal = (a as any)[sortConfig.key] ?? (a.parentCheque as any)[sortConfig.key];
            const bVal = (b as any)[sortConfig.key] ?? (b.parentCheque as any)[sortConfig.key];
            if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
            return sortConfig.direction === 'asc' ? 1 : -1;
        });

        return res;
    }, [cheques, searchQuery, sortConfig, filterParty, filterStatus]);

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

    const isFiltered = filterParty !== 'All' || filterStatus !== 'All' || searchQuery !== '';

    return (
        <div className="space-y-4">
            <Card>
                <CardHeader className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                    <div>
                        <CardTitle>Cheque History</CardTitle>
                        <CardDescription>View and manage post-dated and issued cheques.</CardDescription>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                        <div className="relative w-full sm:w-64">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input placeholder="Search Payee or Cheque #..." className="pl-8 h-9 text-xs" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                        </div>
                        
                        <div className="flex gap-2">
                            <Select value={filterParty} onValueChange={setFilterParty}>
                                <SelectTrigger className="h-9 w-[160px] text-xs">
                                    <SelectValue placeholder="Party Filter" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="All">All Parties</SelectItem>
                                    {uniqueParties.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                                </SelectContent>
                            </Select>

                            <Select value={filterStatus} onValueChange={setFilterStatus}>
                                <SelectTrigger className="h-9 w-[130px] text-xs">
                                    <SelectValue placeholder="Status" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="All">All Statuses</SelectItem>
                                    <SelectItem value="Due">Due Only</SelectItem>
                                    <SelectItem value="Paid">Paid Only</SelectItem>
                                    <SelectItem value="Canceled">Canceled</SelectItem>
                                    <SelectItem value="Partially Paid">Partially Paid</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {isFiltered && (
                            <Button variant="ghost" size="sm" onClick={() => { setSearchQuery(''); setFilterParty('All'); setFilterStatus('All'); }} className="h-9 px-2 text-xs text-muted-foreground hover:text-foreground">
                                <FilterX className="mr-2 h-4 w-4" /> Reset
                            </Button>
                        )}
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-muted/50">
                                <TableHead className="text-xs uppercase font-bold"><Button variant="ghost" onClick={() => requestSort('chequeDate')} className="h-8 px-2 text-xs">Date <ArrowUpDown className="ml-2 h-3 w-3" /></Button></TableHead>
                                <TableHead className="text-xs uppercase font-bold"><Button variant="ghost" onClick={() => requestSort('payeeName')} className="h-8 px-2 text-xs">Payee <ArrowUpDown className="ml-2 h-3 w-3" /></Button></TableHead>
                                <TableHead className="text-xs uppercase font-bold">Cheque #</TableHead>
                                <TableHead className="text-xs uppercase font-bold">Amount</TableHead>
                                <TableHead className="text-xs uppercase font-bold">Rem.</TableHead>
                                <TableHead className="text-xs uppercase font-bold">Status</TableHead>
                                <TableHead className="text-right text-xs uppercase font-bold pr-6">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
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
                            {sortedAndFilteredSplits.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={7} className="text-center py-20 text-muted-foreground italic">No cheque records match your filters.</TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            <Dialog open={isPaidDialogOpen} onOpenChange={setIsPaidDialogOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader><DialogTitle>Confirm Full Payment</DialogTitle></DialogHeader>
                    <div className="py-4 space-y-4">
                        <Label>Remarks / Internal Notes</Label>
                        <Input value={paidRemark} onChange={e => setPaidRemark(e.target.value)} placeholder="e.g. Paid via mobile banking..." />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsPaidDialogOpen(false)}>Cancel</Button>
                        <Button onClick={() => { if(splitToPay) handleStatusUpdate(splitToPay.cheque, splitToPay.splitId, 'Paid', paidRemark); setIsPaidDialogOpen(false); }}>Mark as Paid</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={isCancelDialogOpen} onOpenChange={setIsCancelDialogOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader><DialogTitle>Cancel Cheque Issue</DialogTitle></DialogHeader>
                    <div className="py-4 space-y-4">
                        <Label>Reason for Cancellation</Label>
                        <Textarea value={cancelReason} onChange={e => setCancelReason(e.target.value)} placeholder="e.g. Cheque damaged, Order changed..." />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsCancelDialogOpen(false)}>Go Back</Button>
                        <Button variant="destructive" onClick={() => { if(splitToCancel) handleStatusUpdate(splitToCancel.cheque, splitToCancel.splitId, 'Canceled', cancelReason); setIsCancelDialogOpen(false); }}>Confirm Cancellation</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={isPrintPreviewOpen} onOpenChange={setIsPrintPreviewOpen}>
                <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col p-0">
                    <DialogHeader className="p-6 border-b">
                        <DialogTitle>Print Voucher Preview</DialogTitle>
                    </DialogHeader>
                    <ScrollArea className="flex-1 bg-muted/20 p-8">
                        <div ref={printRef} className="mx-auto w-[210mm] shadow-2xl">
                            {chequeToPrint && (
                                <ChequeView 
                                    voucherNo={chequeToPrint.voucherNo} 
                                    voucherDate={new Date(chequeToPrint.paymentDate)} 
                                    payeeName={chequeToPrint.payeeName} 
                                    account={accounts.find(a => a.id === chequeToPrint.accountId)} 
                                    splits={chequeToPrint.splits.map(s => ({...s, chequeDate: new Date(s.chequeDate)}))} 
                                />
                            )}
                        </div>
                    </ScrollArea>
                    <DialogFooter className="p-6 border-t bg-white">
                        <Button variant="outline" onClick={() => setIsPrintPreviewOpen(false)}>Close</Button>
                        <Button onClick={() => {
                             const win = window.open('', '', 'height=800,width=800');
                             win?.document.write('<html><head><title>Print</title><style>body{margin:0;} @media print { .print-hidden { display: none; } }</style></head><body>');
                             win?.document.write(printRef.current?.innerHTML || '');
                             win?.document.write('</body></html>');
                             win?.document.close();
                             win?.print();
                        }}>
                            <Printer className="mr-2 h-4 w-4" /> Print Document
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

export default function ChequeGeneratorPage() {
    const [activeTab, setActiveTab] = useState('generator');
    const [chequeToEdit, setCheckToEdit] = useState<Cheque | null>(null);

  return (
    <div className="flex flex-col gap-8">
      <header>
          <h1 className="text-3xl font-bold tracking-tight">Cheque Control Center</h1>
          <p className="text-muted-foreground">Manage payment vouchers and post-dated cheque distribution.</p>
      </header>
       <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-4">
                <TabsTrigger value="generator" className="gap-2"><PlusCircle className="h-4 w-4"/> Generator</TabsTrigger>
                <TabsTrigger value="history" className="gap-2"><History className="h-4 w-4"/> History Logs</TabsTrigger>
            </TabsList>
            <TabsContent value="generator">
                 <Suspense fallback={<Skeleton className="h-96 w-full" />}>
                    <ChequeGeneratorForm key={chequeToEdit?.id || 'new'} chequeToEdit={chequeToEdit} onSaveSuccess={() => { setCheckToEdit(null); setActiveTab('history'); }} />
                 </Suspense>
            </TabsContent>
            <TabsContent value="history">
                <SavedChequesList onEdit={(c) => { setCheckToEdit(c); setActiveTab('generator'); }} />
            </TabsContent>
        </Tabs>
    </div>
  );
}
