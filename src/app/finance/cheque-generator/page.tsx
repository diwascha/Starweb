'use client';

import React, { Suspense, useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { ChequeGeneratorForm } from './_components/cheque-generator-form';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { 
  Search, 
  ArrowUpDown, 
  MoreHorizontal, 
  Printer, 
  Trash2, 
  Edit, 
  AlertTriangle, 
  PlusCircle, 
  History, 
  Image as ImageIcon, 
  Save, 
  Loader2, 
  Check, 
  X, 
  Clock, 
  FilterX, 
  Users, 
  ShieldCheck, 
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Plus
} from 'lucide-react';
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
import { cn, toNepaliDate, generateId } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipProvider, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Textarea } from '@/components/ui/textarea';
import { onAccountsUpdate } from '@/services/account-service';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';

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
        <TableRow className="h-14">
            <TableCell>{toNepaliDate(split.chequeDate.toISOString())}</TableCell>
            <TableCell className="font-bold text-gray-900">{split.parentCheque.payeeName}</TableCell>
            <TableCell className="font-mono text-xs text-blue-600 font-bold">{split.chequeNumber || 'N/A'}</TableCell>
            <TableCell className="font-mono text-xs">Rs. {Number(split.amount).toLocaleString(undefined, {minimumFractionDigits: 2})}</TableCell>
            <TableCell className="font-mono text-xs text-red-600 font-bold">Rs. {split.remainingAmount.toLocaleString(undefined, {minimumFractionDigits: 2})}</TableCell>
            <TableCell className="text-center">{getStatusBadge()}</TableCell>
            <TableCell className="text-right pr-6">
                <DropdownMenu>
                    <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                        <DropdownMenuLabel className="text-[10px] uppercase font-black tracking-widest text-muted-foreground">Voucher #{split.parentCheque.voucherNo}</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onSelect={() => onManagePayments(split)}><History className="mr-2 h-4 w-4 text-primary" /> Payment Ledger</DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => onEditVoucher(split.parentCheque)}><Edit className="mr-2 h-4 w-4" /> Edit Voucher</DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => onPrintVoucher(split.parentCheque)}><Printer className="mr-2 h-4 w-4"/> View & Print</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onSelect={() => onMarkAsPaid(split.parentCheque, split.id)} className="text-emerald-600 font-bold"><Check className="mr-2 h-4 w-4" /> Mark Fully Paid</DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => onMarkAsCanceled(split.parentCheque, split.id)} className="text-red-600"><X className="mr-2 h-4 w-4" /> Cancel Issue</DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => onMarkAsDue(split.parentCheque, split.id)}><Clock className="mr-2 h-4 w-4" /> Reset to Due</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <AlertDialog>
                            <AlertDialogTrigger asChild><DropdownMenuItem onSelect={e => e.preventDefault()} className="text-destructive"><Trash2 className="mr-2 h-4 w-4" /> Delete Record</DropdownMenuItem></AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader><AlertDialogTitle>Purge Voucher Data?</AlertDialogTitle><AlertDialogDescription>This will remove all associated cheques in this voucher. Action is permanent.</AlertDialogDescription></AlertDialogHeader>
                                <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => onDeleteVoucher(split.parentCheque.id)} className="bg-destructive text-white">Purge Record</AlertDialogAction></AlertDialogFooter>
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
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection }>({ key: 'chequeDate', direction: 'desc' });
    const { toast } = useToast();
    const { user } = useAuth();
    
    // Pagination State
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(10);
    
    const [chequeToPrint, setChequeToPrint] = useState<Cheque | null>(null);
    const [isPrintPreviewOpen, setIsPrintPreviewOpen] = useState(false);
    const printRef = useRef<HTMLDivElement>(null);
    
    const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false);
    const [payingSplit, setPayingSplit] = useState<AugmentedChequeSplit | null>(null);
    const [newPaymentAmount, setNewPaymentAmount] = useState<number | ''>('');
    const [newPaymentRemark, setNewPaymentRemark] = useState('');

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

    useEffect(() => {
        setCurrentPage(1);
    }, [searchQuery, filterParty, filterStatus, itemsPerPage]);

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

    const paginatedSplits = useMemo(() => {
        if (itemsPerPage === -1) return sortedAndFilteredSplits;
        const start = (currentPage - 1) * itemsPerPage;
        return sortedAndFilteredSplits.slice(start, start + itemsPerPage);
    }, [sortedAndFilteredSplits, currentPage, itemsPerPage]);

    const totalPages = useMemo(() => {
        if (itemsPerPage === -1) return 1;
        return Math.ceil(sortedAndFilteredSplits.length / itemsPerPage);
    }, [sortedAndFilteredSplits, itemsPerPage]);

    const handleStatusUpdate = useCallback(async (cheque: Cheque, splitId: string, newStatus: ChequeStatus, remark?: string) => {
        if (!user) return;
        const updatedSplits = cheque.splits.map(s => {
            if (s.id === splitId) {
                const updated = { ...s, status: newStatus, cancellationReason: newStatus === 'Canceled' ? remark : null } as any;
                if (newStatus === 'Paid') {
                    const totalAmount = Number(s.amount) || 0;
                    const paid = (s.partialPayments || []).reduce((sum, p) => sum + p.amount, 0);
                    const remaining = totalAmount - paid;
                    if (remaining > 0) {
                        updated.partialPayments = [...(s.partialPayments || []), { id: `m-${Date.now()}`, date: new Date().toISOString(), amount: remaining, remarks: remark || 'Paid manually' }];
                    }
                } else if (newStatus === 'Due') {
                    updated.partialPayments = [];
                }
                return updated;
            }
            return s;
        });
        await updateCheque(cheque.id, { splits: updatedSplits, lastModifiedBy: user.username });
        toast({ title: 'Status Updated', description: `Cheque marked as ${newStatus}.` });
    }, [user, toast]);

    const handleAddPartialPayment = async () => {
        if (!user || !payingSplit || newPaymentAmount === '' || newPaymentAmount <= 0) return;
        
        if (newPaymentAmount > payingSplit.remainingAmount) {
            toast({ title: 'Invalid Amount', description: 'Payment cannot exceed remaining balance.', variant: 'destructive' });
            return;
        }

        const updatedSplits = payingSplit.parentCheque.splits.map(s => {
            if (s.id === payingSplit.id) {
                const newPayment: PartialPayment = {
                    id: generateId(),
                    date: new Date().toISOString(),
                    amount: Number(newPaymentAmount),
                    remarks: newPaymentRemark.trim()
                };
                const partialPayments = [...(s.partialPayments || []), newPayment];
                const totalPaid = partialPayments.reduce((sum, p) => sum + p.amount, 0);
                const chequeAmount = Number(s.amount) || 0;
                
                return { 
                    ...s, 
                    partialPayments, 
                    status: totalPaid >= chequeAmount ? 'Paid' : 'Partially Paid' 
                };
            }
            return s;
        });

        try {
            await updateCheque(payingSplit.parentCheque.id, { splits: updatedSplits as any, lastModifiedBy: user.username });
            toast({ title: 'Payment Recorded' });
            setNewPaymentAmount('');
            setNewPaymentRemark('');
            setIsPaymentDialogOpen(false);
        } catch {
            toast({ title: 'Error', variant: 'destructive' });
        }
    };

    const handleDeletePartialPayment = async (splitId: string, paymentId: string) => {
        if (!user || !payingSplit) return;

        const updatedSplits = payingSplit.parentCheque.splits.map(s => {
            if (s.id === splitId) {
                const partialPayments = (s.partialPayments || []).filter(p => p.id !== paymentId);
                const totalPaid = partialPayments.reduce((sum, p) => sum + p.amount, 0);
                
                return { 
                    ...s, 
                    partialPayments, 
                    status: totalPaid > 0 ? 'Partially Paid' : 'Due' 
                };
            }
            return s;
        });

        try {
            await updateCheque(payingSplit.parentCheque.id, { splits: updatedSplits as any, lastModifiedBy: user.username });
            toast({ title: 'Payment Removed' });
        } catch {
            toast({ title: 'Error', variant: 'destructive' });
        }
    };

    const requestSort = (key: SortKey) => {
        setSortConfig(prev => ({
            key,
            direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
        }));
    };

    const handleClearFilters = () => {
        setSearchQuery('');
        setFilterParty('All');
        setFilterStatus('All');
    };

    const isFiltered = filterParty !== 'All' || filterStatus !== 'All' || searchQuery !== '';

    return (
        <div className="space-y-4">
            <Card className="border-gray-100 shadow-sm overflow-hidden">
                <CardHeader className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 py-5 px-6 bg-muted/20 border-b">
                    <div>
                        <CardTitle className="text-xl font-bold text-gray-900">Cheque History</CardTitle>
                        <CardDescription className="text-xs text-muted-foreground mt-1">View and manage post-dated and issued cheques.</CardDescription>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
                        <div className="relative flex-1 sm:flex-none sm:min-w-[240px]">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                            <Input 
                                placeholder="Search Payee or Cheque #..." 
                                className="pl-8 h-9 text-xs bg-white border-gray-200 focus-visible:ring-primary shadow-none" 
                                value={searchQuery} 
                                onChange={(e) => setSearchQuery(e.target.value)} 
                            />
                        </div>
                        
                        <div className="flex items-center gap-2">
                            <Select value={filterParty} onValueChange={setFilterParty}>
                                <SelectTrigger className="h-9 w-[160px] text-xs bg-white border-gray-200 shadow-none">
                                    <div className="flex items-center gap-2 overflow-hidden text-left">
                                        <Users className="h-3 w-3 text-muted-foreground shrink-0" />
                                        <SelectValue placeholder="All Parties" />
                                    </div>
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="All">All Parties</SelectItem>
                                    {uniqueParties.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                                </SelectContent>
                            </Select>

                            <Select value={filterStatus} onValueChange={setFilterStatus}>
                                <SelectTrigger className="h-9 w-[130px] text-xs bg-white border-gray-200 shadow-none">
                                    <div className="flex items-center gap-2">
                                        <ShieldCheck className="h-3 w-3 text-muted-foreground shrink-0" />
                                        <SelectValue placeholder="Status" />
                                    </div>
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
                            <Button 
                                variant="ghost" 
                                size="sm" 
                                onClick={handleClearFilters} 
                                className="h-9 px-2 text-[10px] font-bold uppercase tracking-tight text-muted-foreground hover:text-foreground"
                            >
                                <FilterX className="mr-1.5 h-3.5 w-3.5" /> Clear
                            </Button>
                        )}
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <Table className="text-[13px]">
                            <TableHeader className="bg-muted/50 border-b">
                                <TableRow className="hover:bg-transparent h-11">
                                    <TableHead className="w-[140px] font-bold text-gray-700">
                                        <Button variant="ghost" onClick={() => requestSort('chequeDate')} className="-ml-4 h-8 px-2 text-[11px] font-black uppercase tracking-wider">
                                            Date <ArrowUpDown className={cn("ml-1.5 h-3 w-3", sortConfig.key === 'chequeDate' ? "text-primary opacity-100" : "opacity-30")} />
                                        </Button>
                                    </TableHead>
                                    <TableHead className="font-bold text-gray-700">
                                        <Button variant="ghost" onClick={() => requestSort('payeeName')} className="-ml-4 h-8 px-2 text-[11px] font-black uppercase tracking-wider">
                                            Payee <ArrowUpDown className={cn("ml-1.5 h-3 w-3", sortConfig.key === 'payeeName' ? "text-primary opacity-100" : "opacity-30")} />
                                        </Button>
                                    </TableHead>
                                    <TableHead className="text-[11px] font-black uppercase tracking-wider text-muted-foreground">Cheque #</TableHead>
                                    <TableHead className="text-[11px] font-black uppercase tracking-wider text-muted-foreground">Amount</TableHead>
                                    <TableHead className="text-[11px] font-black uppercase tracking-wider text-muted-foreground">Balance</TableHead>
                                    <TableHead className="text-[11px] font-black uppercase tracking-wider text-muted-foreground text-center">Status</TableHead>
                                    <TableHead className="text-right pr-6 text-[11px] font-black uppercase tracking-wider text-muted-foreground">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody className="bg-white">
                                {paginatedSplits.map(split => (
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
                    </div>
                </CardContent>
                {(totalPages > 1 || itemsPerPage !== -1) && (
                    <CardFooter className="flex items-center justify-between py-4 border-t bg-muted/5">
                        <div className="text-xs text-muted-foreground font-medium">
                            {itemsPerPage === -1 ? (
                                <>Showing all <span className="font-bold text-foreground">{sortedAndFilteredSplits.length}</span> cheques</>
                            ) : (
                                <>
                                    Showing <span className="font-bold text-foreground">{(currentPage - 1) * itemsPerPage + 1}</span> to <span className="font-bold text-foreground">{Math.min(currentPage * itemsPerPage, sortedAndFilteredSplits.length)}</span> of <span className="font-bold text-foreground">{sortedAndFilteredSplits.length}</span> cheques
                                </>
                            )}
                        </div>
                        <div className="flex items-center gap-6">
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-muted-foreground whitespace-nowrap">Rows per page:</span>
                                <Select value={String(itemsPerPage)} onValueChange={(v) => {
                                    setItemsPerPage(parseInt(v));
                                    setCurrentPage(1);
                                }}>
                                    <SelectTrigger className="h-8 w-[70px] bg-white border-gray-200">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="10">10</SelectItem>
                                        <SelectItem value="25">25</SelectItem>
                                        <SelectItem value="50">50</SelectItem>
                                        <SelectItem value="-1">All</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            {itemsPerPage !== -1 && (
                                <div className="flex items-center gap-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                        disabled={currentPage === 1}
                                        className="h-8 w-8 p-0"
                                    >
                                        <ChevronLeft className="h-4 w-4" />
                                    </Button>
                                    <div className="text-xs font-bold px-2 whitespace-nowrap">Page {currentPage} of {totalPages}</div>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                        disabled={currentPage === totalPages}
                                        className="h-8 w-8 p-0"
                                    >
                                        <ChevronRight className="h-4 w-4" />
                                    </Button>
                                </div>
                            )}
                        </div>
                    </CardFooter>
                )}
            </Card>

            <Dialog open={isPaymentDialogOpen} onOpenChange={setIsPaymentDialogOpen}>
                <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col p-0">
                    <DialogHeader className="p-6 border-b bg-muted/10">
                        <DialogTitle className="text-xl font-bold uppercase tracking-tight">Payment Ledger: {payingSplit?.parentCheque.payeeName}</DialogTitle>
                        <DialogDescription className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                            Cheque {payingSplit?.chequeNumber || 'N/A'} &middot; Total Rs. {Number(payingSplit?.amount || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}
                        </DialogDescription>
                    </DialogHeader>
                    
                    <div className="flex-1 overflow-hidden flex flex-col">
                        <div className="p-6 border-b bg-muted/5 space-y-4">
                            <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">New Settlement Entry</h4>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
                                <div className="space-y-1.5">
                                    <Label className="text-[10px] font-bold uppercase text-muted-foreground">Amount (रु)</Label>
                                    <Input 
                                        type="number" 
                                        value={newPaymentAmount} 
                                        onChange={e => setNewPaymentAmount(e.target.value === '' ? '' : parseFloat(e.target.value))} 
                                        className="h-9 font-black"
                                        placeholder="0.00"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-[10px] font-bold uppercase text-muted-foreground">Note / Remark</Label>
                                    <Input 
                                        value={newPaymentRemark} 
                                        onChange={e => setNewPaymentRemark(e.target.value)} 
                                        className="h-9 text-xs"
                                        placeholder="e.g. Paid via eSewa"
                                    />
                                </div>
                                <Button onClick={handleAddPartialPayment} disabled={!newPaymentAmount || Number(newPaymentAmount) <= 0} className="h-9 font-bold uppercase text-[10px] tracking-widest shadow-lg shadow-primary/20">
                                    <Plus className="mr-1.5 h-3.5 w-3.5" /> Post Payment
                                </Button>
                            </div>
                        </div>

                        <ScrollArea className="flex-1">
                            <div className="p-6">
                                <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground mb-4">Payment History</h4>
                                <Table className="text-xs border rounded-lg overflow-hidden">
                                    <TableHeader className="bg-muted/50">
                                        <TableRow className="h-10 hover:bg-transparent">
                                            <TableHead className="pl-4 font-bold">Date</TableHead>
                                            <TableHead className="font-bold">Amount</TableHead>
                                            <TableHead className="font-bold">Remarks</TableHead>
                                            <TableHead className="text-right pr-4 font-bold"></TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {(payingSplit?.partialPayments || []).length > 0 ? (
                                            payingSplit?.partialPayments?.map((p) => (
                                                <TableRow key={p.id} className="h-11">
                                                    <TableCell className="pl-4 font-mono text-[10px] text-muted-foreground">{format(new Date(p.date), 'yyyy-MM-dd HH:mm')}</TableCell>
                                                    <TableCell className="font-black">Rs. {p.amount.toLocaleString(undefined, {minimumFractionDigits: 2})}</TableCell>
                                                    <TableCell className="italic text-muted-foreground">{p.remarks || '—'}</TableCell>
                                                    <TableCell className="text-right pr-4">
                                                        <Button 
                                                            variant="ghost" 
                                                            size="icon" 
                                                            className="h-7 w-7 text-destructive hover:bg-red-50" 
                                                            onClick={() => handleDeletePartialPayment(payingSplit!.id, p.id)}
                                                        >
                                                            <Trash2 className="h-3.5 w-3.5" />
                                                        </Button>
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        ) : (
                                            <TableRow>
                                                <TableCell colSpan={4} className="h-24 text-center text-muted-foreground italic">No payments recorded yet.</TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                    {(payingSplit?.partialPayments || []).length > 0 && (
                                        <TableFooter className="bg-muted/30">
                                            <TableRow className="h-11 font-black">
                                                <TableCell className="pl-4 text-right">Total Settled</TableCell>
                                                <TableCell className="text-emerald-700">Rs. {payingSplit?.paidAmount.toLocaleString(undefined, {minimumFractionDigits: 2})}</TableCell>
                                                <TableCell colSpan={2}></TableCell>
                                            </TableRow>
                                            <TableRow className="h-11 font-black bg-red-50/50">
                                                <TableCell className="pl-4 text-right">Balance Due</TableCell>
                                                <TableCell className="text-red-700">Rs. {payingSplit?.remainingAmount.toLocaleString(undefined, {minimumFractionDigits: 2})}</TableCell>
                                                <TableCell colSpan={2}></TableCell>
                                            </TableRow>
                                        </TableFooter>
                                    )}
                                </Table>
                            </div>
                        </ScrollArea>
                    </div>
                    
                    <DialogFooter className="p-6 border-t bg-white shrink-0">
                        <Button variant="outline" onClick={() => setIsPaymentDialogOpen(false)} className="w-full font-bold uppercase text-[10px] tracking-widest h-10">Close Ledger</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

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
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Cheque Control Center</h1>
          <p className="text-muted-foreground">Manage payment vouchers and post-dated cheque distribution.</p>
      </header>
       <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-4 bg-muted/50 p-1">
                <TabsTrigger value="generator" className="gap-2 px-6"><PlusCircle className="h-4 w-4"/> Generator</TabsTrigger>
                <TabsTrigger value="history" className="gap-2 px-6"><History className="h-4 w-4"/> History Logs</TabsTrigger>
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
