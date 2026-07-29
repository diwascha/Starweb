'use client';

import React, { Suspense, useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { ChequeGeneratorForm } from './_components/cheque-generator-form';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  Check,
  X,
  Clock,
  FilterX,
  Users,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  Plus,
  Minus,
  RotateCcw,
  CalendarIcon,
  CreditCard,
  Receipt,
} from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { onChequesUpdate, deleteCheque, updateCheque } from '@/services/cheque-service';
import type { Cheque, ChequeSplit, ChequeStatus, PartialPayment, Account } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { format, startOfToday } from 'date-fns';
import { ChequeView } from './_components/cheque-view';
import { NepalChequeView } from './_components/nepal-cheque-print';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { cn, toNepaliDate, generateId } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import { Label } from '@/components/ui/label';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Tooltip, TooltipProvider, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Textarea } from '@/components/ui/textarea';
import { onAccountsUpdate } from '@/services/account-service';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DualCalendar } from '@/components/ui/dual-calendar';
import { ChequeLedger } from './_components/cheque-ledger';

type SortKey = 'chequeDate' | 'payeeName' | 'amount' | 'chequeNumber' | 'status' | 'dueStatus';
type SortDirection = 'asc' | 'desc';

/** Tolerance for float money comparisons (half a paisa). */
const EPS = 0.005;

const money = (n: number) =>
  Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface AugmentedChequeSplit extends ChequeSplit {
  daysRemaining: number;
  isOverdue: boolean;
  parentCheque: Cheque;
  paidAmount: number;
  remainingAmount: number;
}

const ChequeSplitRow = React.memo(
  ({
    split,
    onManagePayments,
    onEditVoucher,
    onPrintVoucher,
    onPrintNepalCheque,
    onMarkAsPaid,
    onMarkAsCanceled,
    onMarkAsDue,
    onDeleteVoucher,
  }: {
    split: AugmentedChequeSplit;
    onManagePayments: (s: AugmentedChequeSplit) => void;
    onEditVoucher: (c: Cheque) => void;
    onPrintVoucher: (c: Cheque) => void;
    onPrintNepalCheque: (s: AugmentedChequeSplit) => void;
    onMarkAsPaid: (c: Cheque, id: string) => void;
    onMarkAsCanceled: (c: Cheque, id: string) => void;
    onMarkAsDue: (s: AugmentedChequeSplit) => void;
    onDeleteVoucher: (id: string) => void;
  }) => {
    const getStatusBadge = () => {
      const { status, daysRemaining, isOverdue, cancellationReason } = split;

      if (status === 'Paid') return <Badge className="bg-emerald-600 hover:bg-emerald-600">Paid</Badge>;

      if (status === 'Canceled') {
        return (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="destructive">Canceled</Badge>
              </TooltipTrigger>
              {cancellationReason ? (
                <TooltipContent>
                  <p>{cancellationReason}</p>
                </TooltipContent>
              ) : null}
            </Tooltip>
          </TooltipProvider>
        );
      }

      if (status === 'Partially Paid') {
        return (
          <Badge className={cn('bg-blue-600 hover:bg-blue-600', isOverdue && 'bg-orange-600 hover:bg-orange-600')}>
            {isOverdue ? `Part. Paid · ${-daysRemaining}d late` : 'Partially Paid'}
          </Badge>
        );
      }

      if (isOverdue) {
        return (
          <Badge variant="destructive">
            <AlertTriangle className="mr-1 h-3 w-3" /> Overdue {-daysRemaining}d
          </Badge>
        );
      }

      if (daysRemaining <= 7) return <Badge className="bg-amber-500 text-black hover:bg-amber-500">Due {daysRemaining}d</Badge>;

      return (
        <Badge variant="outline" className="text-blue-600 border-blue-600">
          Due {daysRemaining}d
        </Badge>
      );
    };

    return (
      <TableRow className="h-14">
        <TableCell>{toNepaliDate(split.chequeDate.toISOString())}</TableCell>
        <TableCell className="font-bold text-gray-900">{split.parentCheque.payeeName}</TableCell>
        <TableCell className="font-mono text-xs text-blue-600 font-bold">{split.chequeNumber || 'N/A'}</TableCell>
        <TableCell className="font-mono text-xs">Rs. {money(Number(split.amount))}</TableCell>
        <TableCell className="font-mono text-xs text-red-600 font-bold">Rs. {money(split.remainingAmount)}</TableCell>
        <TableCell className="text-center">{getStatusBadge()}</TableCell>
        <TableCell className="text-right pr-6">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="text-[10px] uppercase font-black tracking-widest text-muted-foreground">
                Voucher #{split.parentCheque.voucherNo}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => onManagePayments(split)}>
                <History className="mr-2 h-4 w-4 text-primary" /> Payment Ledger
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onEditVoucher(split.parentCheque)}>
                <Edit className="mr-2 h-4 w-4" /> Edit Voucher
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onPrintVoucher(split.parentCheque)}>
                <Printer className="mr-2 h-4 w-4" /> View &amp; Print Voucher
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onPrintNepalCheque(split)} className="font-bold text-primary">
                <CreditCard className="mr-2 h-4 w-4" /> Print Nepal Cheque
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => onMarkAsPaid(split.parentCheque, split.id)}
                className="text-emerald-600 font-bold"
              >
                <Check className="mr-2 h-4 w-4" /> Mark Fully Paid
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onMarkAsCanceled(split.parentCheque, split.id)} className="text-red-600">
                <X className="mr-2 h-4 w-4" /> Cancel Issue
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onMarkAsDue(split)}>
                <Clock className="mr-2 h-4 w-4" /> Reset to Due
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-destructive">
                    <Trash2 className="mr-2 h-4 w-4" /> Delete Record
                  </DropdownMenuItem>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete voucher #{split.parentCheque.voucherNo}?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This removes all {split.parentCheque.splits.length} cheque(s) in this voucher along with their payment
                      history. This cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Keep record</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => onDeleteVoucher(split.parentCheque.id)}
                      className="bg-destructive text-white hover:bg-destructive/90"
                    >
                      Delete voucher
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </DropdownMenuContent>
          </DropdownMenu>
        </TableCell>
      </TableRow>
    );
  }
);
ChequeSplitRow.displayName = 'ChequeSplitRow';

function SavedChequesList({ onEdit }: { onEdit: (cheque: Cheque) => void }) {
  const [cheques, setCheques] = useState<Cheque[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterParty, setFilterParty] = useState('All');
  const [filterStatus, setFilterStatus] = useState('All');
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection }>({
    key: 'chequeDate',
    direction: 'desc',
  });

  const { toast } = useToast();
  const { user, getAllowedOwnerships } = useAuth();
  const allowedOwnerships = useMemo(() => getAllowedOwnerships('finance'), [getAllowedOwnerships]);

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const [chequeToPrint, setChequeToPrint] = useState<Cheque | null>(null);
  const [isPrintPreviewOpen, setIsPrintPreviewOpen] = useState(false);

  // Nepal cheque print — store identity only, derive the record live.
  const [nepalPrintKey, setNepalPrintKey] = useState<{ chequeId: string; splitId: string } | null>(null);
  const [isNepalPrintOpen, setIsNepalPrintOpen] = useState(false);
  const [isAcPayee, setIsAcPayee] = useState(true);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);

  const printRef = useRef<HTMLDivElement>(null);
  const nepalPrintRef = useRef<HTMLDivElement>(null);

  const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false);
  const [payingKey, setPayingKey] = useState<{ chequeId: string; splitId: string } | null>(null);
  const [newPaymentAmount, setNewPaymentAmount] = useState<number | ''>('');
  const [newPaymentRemark, setNewPaymentRemark] = useState('');
  const [newPaymentDate, setNewPaymentDate] = useState<Date>(new Date());
  const [isPostingPayment, setIsPostingPayment] = useState(false);

  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [splitToCancel, setSplitToCancel] = useState<{ cheque: Cheque; splitId: string } | null>(null);

  const [isPaidDialogOpen, setIsPaidDialogOpen] = useState(false);
  const [paidRemark, setPaidRemark] = useState('');
  const [paidDate, setPaidDate] = useState<Date>(new Date());
  const [splitToPay, setSplitToPay] = useState<{ cheque: Cheque; splitId: string } | null>(null);

  const [isResetDialogOpen, setIsResetDialogOpen] = useState(false);
  const [splitToReset, setSplitToReset] = useState<AugmentedChequeSplit | null>(null);

  useEffect(() => {
    const unsubs = [onChequesUpdate(setCheques), onAccountsUpdate(setAccounts)];
    return () => unsubs.forEach((u) => u());
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterParty, filterStatus, itemsPerPage]);

  const uniqueParties = useMemo(() => {
    const parties = new Set(cheques.map((c) => c.payeeName).filter(Boolean));
    return Array.from(parties).sort();
  }, [cheques]);

  /**
   * Every visible split, augmented with derived balances.
   * Unfiltered — this is the lookup source for the open dialogs so they keep
   * showing live data even when the active filter would exclude the row.
   */
  const allSplits = useMemo<AugmentedChequeSplit[]>(() => {
    const today = startOfToday().getTime();
    return cheques.flatMap((c) => {
      if (c.ownership !== 'Both' && !allowedOwnerships.includes(c.ownership)) return [];
      return (c.splits || []).map((s) => {
        const paid = (s.partialPayments || []).reduce((sum, p) => sum + Number(p.amount || 0), 0);
        const total = Number(s.amount) || 0;
        const chequeDate = new Date(s.chequeDate);
        const days = Math.ceil((chequeDate.getTime() - today) / (1000 * 60 * 60 * 24));
        return {
          ...s,
          chequeDate,
          daysRemaining: days,
          // A settled or cancelled cheque is never "overdue".
          isOverdue: days < 0 && s.status !== 'Paid' && s.status !== 'Canceled',
          parentCheque: c,
          paidAmount: paid,
          remainingAmount: total - paid,
        } as AugmentedChequeSplit;
      });
    });
  }, [cheques, allowedOwnerships]);

  const getSortValue = useCallback((s: AugmentedChequeSplit, key: SortKey): number | string => {
    switch (key) {
      case 'chequeDate':
        return s.chequeDate.getTime();
      case 'payeeName':
        return (s.parentCheque.payeeName || '').toLowerCase();
      case 'amount':
        return Number(s.amount) || 0;
      case 'chequeNumber':
        return (s.chequeNumber || '').toLowerCase();
      case 'status':
        return String(s.status || '');
      case 'dueStatus':
        return s.daysRemaining;
      default:
        return '';
    }
  }, []);

  const sortedAndFilteredSplits = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    const res = allSplits.filter((s) => {
      const matchesSearch =
        q === '' ||
        (s.parentCheque.payeeName || '').toLowerCase().includes(q) ||
        (s.chequeNumber || '').toLowerCase().includes(q) ||
        (s.parentCheque.voucherNo || '').toLowerCase().includes(q);

      const matchesParty = filterParty === 'All' || s.parentCheque.payeeName === filterParty;

      // "Overdue" is derived, not a stored status — handle it separately.
      const matchesStatus =
        filterStatus === 'All' || (filterStatus === 'Overdue' ? s.isOverdue : s.status === filterStatus);

      return matchesSearch && matchesParty && matchesStatus;
    });

    const dir = sortConfig.direction === 'asc' ? 1 : -1;
    res.sort((a, b) => {
      const aVal = getSortValue(a, sortConfig.key);
      const bVal = getSortValue(b, sortConfig.key);
      if (aVal < bVal) return -1 * dir;
      if (aVal > bVal) return 1 * dir;
      // Stable tiebreak so equal rows don't shuffle between renders.
      return String(a.id).localeCompare(String(b.id));
    });

    return res;
  }, [allSplits, searchQuery, sortConfig, filterParty, filterStatus, getSortValue]);

  const totalPages = useMemo(() => {
    if (itemsPerPage === -1) return 1;
    return Math.max(1, Math.ceil(sortedAndFilteredSplits.length / itemsPerPage));
  }, [sortedAndFilteredSplits, itemsPerPage]);

  // Clamp the page if filtering shrank the result set beneath us.
  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const paginatedSplits = useMemo(() => {
    if (itemsPerPage === -1) return sortedAndFilteredSplits;
    const start = (currentPage - 1) * itemsPerPage;
    return sortedAndFilteredSplits.slice(start, start + itemsPerPage);
  }, [sortedAndFilteredSplits, currentPage, itemsPerPage]);

  /** Live-derived, so the ledger refreshes as soon as Firestore echoes back. */
  const payingSplit = useMemo(() => {
    if (!payingKey) return null;
    return allSplits.find((s) => s.parentCheque.id === payingKey.chequeId && s.id === payingKey.splitId) ?? null;
  }, [payingKey, allSplits]);

  const nepalChequeToPrint = useMemo(() => {
    if (!nepalPrintKey) return null;
    return allSplits.find((s) => s.parentCheque.id === nepalPrintKey.chequeId && s.id === nepalPrintKey.splitId) ?? null;
  }, [nepalPrintKey, allSplits]);

  const handleStatusUpdate = useCallback(
    async (cheque: Cheque, splitId: string, newStatus: ChequeStatus, remark?: string, customDate?: Date) => {
      if (!user) return;

      const updatedSplits = cheque.splits.map((s) => {
        if (s.id !== splitId) return s;

        const updated: any = {
          ...s,
          status: newStatus,
          cancellationReason: newStatus === 'Canceled' ? remark || '' : '',
        };

        if (newStatus === 'Paid') {
          const totalAmount = Number(s.amount) || 0;
          const paid = (s.partialPayments || []).reduce((sum, p) => sum + Number(p.amount || 0), 0);
          const remaining = totalAmount - paid;
          if (remaining > EPS) {
            updated.partialPayments = [
              ...(s.partialPayments || []),
              {
                id: generateId(),
                date: (customDate || new Date()).toISOString(),
                amount: remaining,
                remarks: remark || 'Settled in full',
              },
            ];
          }
        } else if (newStatus === 'Due') {
          updated.partialPayments = [];
        }

        return updated;
      });

      try {
        await updateCheque(cheque.id, { splits: updatedSplits as any, lastModifiedBy: user.username });
        toast({ title: 'Status updated', description: `Cheque marked as ${newStatus}.` });
      } catch {
        toast({ title: 'Update failed', description: 'The status could not be saved.', variant: 'destructive' });
      }
    },
    [user, toast]
  );

  const handleAddPartialPayment = async () => {
    if (!user || !payingSplit) return;

    const amt = Number(newPaymentAmount);
    if (!amt || amt <= 0) return;

    // Checked against the LIVE balance, not the snapshot taken when the
    // dialog opened — otherwise two quick entries can overpay the cheque.
    if (amt > payingSplit.remainingAmount + EPS) {
      toast({
        title: 'Amount too high',
        description: `Enter Rs. ${money(payingSplit.remainingAmount)} or less — that's the remaining balance.`,
        variant: 'destructive',
      });
      return;
    }

    setIsPostingPayment(true);

    const updatedSplits = payingSplit.parentCheque.splits.map((s) => {
      if (s.id !== payingSplit.id) return s;

      const newPayment: PartialPayment = {
        id: generateId(),
        date: newPaymentDate.toISOString(),
        amount: amt,
        remarks: newPaymentRemark.trim(),
      };

      const partialPayments = [...(s.partialPayments || []), newPayment];
      const totalPaid = partialPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
      const chequeAmount = Number(s.amount) || 0;

      return {
        ...s,
        partialPayments,
        status: totalPaid + EPS >= chequeAmount ? 'Paid' : 'Partially Paid',
      };
    });

    try {
      await updateCheque(payingSplit.parentCheque.id, {
        splits: updatedSplits as any,
        lastModifiedBy: user.username,
      });
      toast({ title: 'Payment recorded' });
      setNewPaymentAmount('');
      setNewPaymentRemark('');
      setNewPaymentDate(new Date());
      // Dialog stays open — the history table below updates live.
    } catch {
      toast({ title: 'Save failed', description: 'The payment was not recorded.', variant: 'destructive' });
    } finally {
      setIsPostingPayment(false);
    }
  };

  const handleDeletePartialPayment = async (paymentId: string) => {
    if (!user || !payingSplit) return;

    const updatedSplits = payingSplit.parentCheque.splits.map((s) => {
      if (s.id !== payingSplit.id) return s;

      const partialPayments = (s.partialPayments || []).filter((p) => p.id !== paymentId);
      const totalPaid = partialPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
      const chequeAmount = Number(s.amount) || 0;

      // Removing one of several payments can still leave the cheque settled,
      // so re-test "fully covered" instead of assuming Partially Paid.
      const status: ChequeStatus =
        chequeAmount > 0 && totalPaid + EPS >= chequeAmount ? 'Paid' : totalPaid > 0 ? 'Partially Paid' : 'Due';

      return { ...s, partialPayments, status };
    });

    try {
      await updateCheque(payingSplit.parentCheque.id, {
        splits: updatedSplits as any,
        lastModifiedBy: user.username,
      });
      toast({ title: 'Payment removed' });
    } catch {
      toast({ title: 'Delete failed', description: 'The payment is still on the ledger.', variant: 'destructive' });
    }
  };

  const requestSort = (key: SortKey) => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  const handleClearFilters = () => {
    setSearchQuery('');
    setFilterParty('All');
    setFilterStatus('All');
  };

  const isFiltered = filterParty !== 'All' || filterStatus !== 'All' || searchQuery !== '';

  /**
   * Nepal cheque print. The markup is fully inline-styled, so the clone needs
   * no stylesheet and no CDN. Printing is deferred until after load so the
   * layout is settled before the dialog fires.
   */
  const printNepalCheque = () => {
    const content = nepalPrintRef.current?.innerHTML;
    if (!content) return;

    const win = window.open('', '', 'height=600,width=900');
    if (!win) {
      toast({ title: 'Popup blocked', description: 'Allow popups for this site, then print again.', variant: 'destructive' });
      return;
    }

    win.document.write(
      `<!DOCTYPE html><html><head><meta charset="utf-8" /><title>Cheque Print</title>` +
        `<style>` +
        `@page { size: 176mm 88mm; margin: 0; }` +
        `html, body { margin: 0; padding: 0; background: #fff; }` +
        `* { -webkit-print-color-adjust: exact; print-color-adjust: exact; }` +
        `</style></head><body>` +
        `<div style="width:176mm;height:88mm;position:relative;overflow:hidden;">${content}</div>` +
        `<scr` +
        `ipt>window.addEventListener('load',function(){setTimeout(function(){window.focus();window.print();window.close();},250);});</scr` +
        `ipt>` +
        `</body></html>`
    );
    win.document.close();
  };

  /** Voucher print — carries the app stylesheets over so it isn't unstyled. */
  const printVoucher = () => {
    const content = printRef.current?.innerHTML;
    if (!content) return;

    const win = window.open('', '', 'height=800,width=800');
    if (!win) {
      toast({ title: 'Popup blocked', description: 'Allow popups for this site, then print again.', variant: 'destructive' });
      return;
    }

    const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
      .map((n) => n.outerHTML)
      .join('');

    win.document.write(
      `<!DOCTYPE html><html><head><meta charset="utf-8" /><title>Print Voucher</title>${styles}` +
        `<style>@page { size: A4; margin: 10mm; } body { margin: 0; background: #fff; } .print-hidden { display: none !important; }</style>` +
        `</head><body>${content}` +
        `<scr` +
        `ipt>window.addEventListener('load',function(){setTimeout(function(){window.focus();window.print();window.close();},400);});</scr` +
        `ipt>` +
        `</body></html>`
    );
    win.document.close();
  };

  const sortButton = (key: SortKey, label: string) => (
    <Button variant="ghost" onClick={() => requestSort(key)} className="-ml-4 h-8 px-2 text-[11px] font-black uppercase tracking-wider">
      {label}
      <ArrowUpDown className={cn('ml-1.5 h-3 w-3', sortConfig.key === key ? 'text-primary opacity-100' : 'opacity-30')} />
    </Button>
  );

  return (
    <div className="space-y-4">
      <Card className="border-gray-100 shadow-sm overflow-hidden bg-white">
        <CardHeader className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 py-5 px-6 bg-muted/20 border-b">
          <div>
            <CardTitle className="text-xl font-bold text-gray-900">Cheque History</CardTitle>
            <CardDescription className="text-xs text-muted-foreground mt-1">
              View and manage post-dated and issued cheques.
            </CardDescription>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
            <div className="relative flex-1 sm:flex-none sm:min-w-[240px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search payee, cheque no. or voucher..."
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
                    <SelectValue placeholder="All parties" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All">All parties</SelectItem>
                  {uniqueParties.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="h-9 w-[145px] text-xs bg-white border-gray-200 shadow-none">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-3 w-3 text-muted-foreground shrink-0" />
                    <SelectValue placeholder="Status" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All">All statuses</SelectItem>
                  <SelectItem value="Due">Due</SelectItem>
                  <SelectItem value="Overdue">Overdue</SelectItem>
                  <SelectItem value="Partially Paid">Partially paid</SelectItem>
                  <SelectItem value="Paid">Paid</SelectItem>
                  <SelectItem value="Canceled">Canceled</SelectItem>
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
                  <TableHead className="w-[140px] font-bold text-gray-700">{sortButton('chequeDate', 'Date')}</TableHead>
                  <TableHead className="font-bold text-gray-700">{sortButton('payeeName', 'Payee')}</TableHead>
                  <TableHead className="font-bold text-gray-700">{sortButton('chequeNumber', 'Cheque #')}</TableHead>
                  <TableHead className="font-bold text-gray-700">{sortButton('amount', 'Amount')}</TableHead>
                  <TableHead className="text-[11px] font-black uppercase tracking-wider text-muted-foreground">Balance</TableHead>
                  <TableHead className="text-center font-bold text-gray-700">
                    <Button
                      variant="ghost"
                      onClick={() => requestSort('dueStatus')}
                      className="h-8 px-2 text-[11px] font-black uppercase tracking-wider"
                    >
                      Status
                      <ArrowUpDown
                        className={cn('ml-1.5 h-3 w-3', sortConfig.key === 'dueStatus' ? 'text-primary opacity-100' : 'opacity-30')}
                      />
                    </Button>
                  </TableHead>
                  <TableHead className="text-right pr-6 text-[11px] font-black uppercase tracking-wider text-muted-foreground">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>

              <TableBody className="bg-white">
                {paginatedSplits.map((split) => (
                  <ChequeSplitRow
                    key={`${split.parentCheque.id}-${split.id}`}
                    split={split}
                    onManagePayments={(s) => {
                      setPayingKey({ chequeId: s.parentCheque.id, splitId: s.id });
                      setNewPaymentAmount('');
                      setNewPaymentRemark('');
                      setNewPaymentDate(new Date());
                      setIsPaymentDialogOpen(true);
                    }}
                    onEditVoucher={onEdit}
                    onPrintVoucher={(c) => {
                      setChequeToPrint(c);
                      setIsPrintPreviewOpen(true);
                    }}
                    onPrintNepalCheque={(s) => {
                      setNepalPrintKey({ chequeId: s.parentCheque.id, splitId: s.id });
                      setIsAcPayee(true);
                      setOffsetX(0);
                      setOffsetY(0);
                      setIsNepalPrintOpen(true);
                    }}
                    onMarkAsPaid={(c, id) => {
                      setSplitToPay({ cheque: c, splitId: id });
                      setPaidRemark('');
                      setPaidDate(new Date());
                      setIsPaidDialogOpen(true);
                    }}
                    onMarkAsCanceled={(c, id) => {
                      setSplitToCancel({ cheque: c, splitId: id });
                      setCancelReason('');
                      setIsCancelDialogOpen(true);
                    }}
                    onMarkAsDue={(s) => {
                      setSplitToReset(s);
                      setIsResetDialogOpen(true);
                    }}
                    onDeleteVoucher={(id) => deleteCheque(id)}
                  />
                ))}

                {sortedAndFilteredSplits.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-20 text-muted-foreground italic">
                      {isFiltered ? 'No cheques match these filters. Clear them to see everything.' : 'No cheques yet. Create one from the Generator tab.'}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>

        {sortedAndFilteredSplits.length > 0 && (
          <CardFooter className="flex items-center justify-between py-4 border-t bg-muted/5">
            <div className="text-xs text-muted-foreground font-medium">
              {itemsPerPage === -1 ? (
                <>
                  Showing all <span className="font-bold text-foreground">{sortedAndFilteredSplits.length}</span> cheques
                </>
              ) : (
                <>
                  Showing <span className="font-bold text-foreground">{(currentPage - 1) * itemsPerPage + 1}</span> to{' '}
                  <span className="font-bold text-foreground">
                    {Math.min(currentPage * itemsPerPage, sortedAndFilteredSplits.length)}
                  </span>{' '}
                  of <span className="font-bold text-foreground">{sortedAndFilteredSplits.length}</span> cheques
                </>
              )}
            </div>

            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground whitespace-nowrap">Rows per page:</span>
                <Select
                  value={String(itemsPerPage)}
                  onValueChange={(v) => {
                    setItemsPerPage(parseInt(v, 10));
                    setCurrentPage(1);
                  }}
                >
                  <SelectTrigger className="h-8 w-[72px] bg-white border-gray-200">
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
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="h-8 w-8 p-0"
                    aria-label="Previous page"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <div className="text-xs font-bold px-2 whitespace-nowrap">
                    Page {currentPage} of {totalPages}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage >= totalPages}
                    className="h-8 w-8 p-0"
                    aria-label="Next page"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          </CardFooter>
        )}
      </Card>

      {/* ------------------------- Payment ledger ------------------------- */}
      <Dialog
        open={isPaymentDialogOpen}
        onOpenChange={(open) => {
          setIsPaymentDialogOpen(open);
          if (!open) setPayingKey(null);
        }}
      >
        <DialogContent className="sm:max-w-4xl max-h-[95vh] flex flex-col p-0 shadow-2xl border-none">
          <DialogHeader className="p-6 border-b bg-muted/10">
            <DialogTitle className="text-xl font-bold uppercase tracking-tight">
              Payment ledger: {payingSplit?.parentCheque.payeeName}
            </DialogTitle>
            <DialogDescription className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              Cheque {payingSplit?.chequeNumber || 'N/A'} &middot; Total Rs. {money(Number(payingSplit?.amount || 0))}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-hidden flex flex-col">
            <div className="p-6 border-b bg-muted/5 space-y-4">
              <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">New settlement entry</h4>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 items-end">
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-bold uppercase text-muted-foreground">Payment date</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start text-left font-normal h-9 bg-white text-xs px-3">
                        <CalendarIcon className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
                        {newPaymentDate
                          ? `${toNepaliDate(newPaymentDate.toISOString())} (${format(newPaymentDate, 'PP')})`
                          : 'Pick date'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <DualCalendar selected={newPaymentDate} onSelect={(d) => d && setNewPaymentDate(d)} />
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-[10px] font-bold uppercase text-muted-foreground">Amount (रु)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={newPaymentAmount}
                    onChange={(e) => setNewPaymentAmount(e.target.value === '' ? '' : parseFloat(e.target.value))}
                    className="h-9 font-black"
                    placeholder="0.00"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-[10px] font-bold uppercase text-muted-foreground">Note / remark</Label>
                  <Input
                    value={newPaymentRemark}
                    onChange={(e) => setNewPaymentRemark(e.target.value)}
                    className="h-9 text-xs"
                    placeholder="e.g. Paid via eSewa"
                  />
                </div>

                <Button
                  onClick={handleAddPartialPayment}
                  disabled={
                    isPostingPayment ||
                    !newPaymentAmount ||
                    Number(newPaymentAmount) <= 0 ||
                    !payingSplit ||
                    payingSplit.remainingAmount <= EPS
                  }
                  className="h-9 font-bold uppercase text-[10px] tracking-widest shadow-lg shadow-primary/20"
                >
                  <Plus className="mr-1.5 h-3.5 w-3.5" /> Record payment
                </Button>
              </div>

              {payingSplit && payingSplit.remainingAmount <= EPS && (
                <p className="text-[11px] text-emerald-700 font-medium">This cheque is fully settled.</p>
              )}
            </div>

            <div className="flex-1 flex flex-col overflow-hidden">
                <div className="p-4 border-b flex items-center justify-between bg-muted/10 shrink-0">
                    <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Payment history</h4>
                </div>
                <ScrollArea className="flex-1">
                    <div className="p-6">
                        <Table className="text-xs border rounded-lg overflow-hidden">
                        <TableHeader className="bg-muted/50">
                            <TableRow className="h-10 hover:bg-transparent">
                            <TableHead className="pl-4 font-bold">Date</TableHead>
                            <TableHead className="font-bold">Amount</TableHead>
                            <TableHead className="font-bold">Remarks</TableHead>
                            <TableHead className="text-right pr-4 font-bold" />
                            </TableRow>
                        </TableHeader>

                        <TableBody>
                            {(payingSplit?.partialPayments || []).length > 0 ? (
                            (payingSplit?.partialPayments || []).map((p) => (
                                <TableRow key={p.id} className="h-11">
                                <TableCell className="pl-4">
                                    <div className="flex flex-col">
                                    <span className="font-bold text-blue-900">{toNepaliDate(p.date)}</span>
                                    <span className="text-[9px] text-muted-foreground">{format(new Date(p.date), 'yyyy-MM-dd')}</span>
                                    </div>
                                </TableCell>
                                <TableCell className="font-black">Rs. {money(Number(p.amount))}</TableCell>
                                <TableCell className="italic text-muted-foreground">{p.remarks || '—'}</TableCell>
                                <TableCell className="text-right pr-4">
                                    <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-destructive hover:bg-red-50"
                                    onClick={() => handleDeletePartialPayment(p.id)}
                                    aria-label="Remove payment"
                                    >
                                    <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                </TableCell>
                                </TableRow>
                            ))
                            ) : (
                            <TableRow>
                                <TableCell colSpan={4} className="h-24 text-center text-muted-foreground italic">
                                No payments recorded yet.
                                </TableCell>
                            </TableRow>
                            )}
                        </TableBody>

                        {(payingSplit?.partialPayments || []).length > 0 && (
                            <TableFooter className="bg-muted/30">
                            <TableRow className="h-11 font-black">
                                <TableCell className="pl-4 text-right">Total settled</TableCell>
                                <TableCell className="text-emerald-700">Rs. {money(payingSplit?.paidAmount ?? 0)}</TableCell>
                                <TableCell colSpan={2} />
                            </TableRow>
                            <TableRow className="h-11 font-black bg-red-50/50">
                                <TableCell className="pl-4 text-right">Balance due</TableCell>
                                <TableCell className="text-red-700">Rs. {money(payingSplit?.remainingAmount ?? 0)}</TableCell>
                                <TableCell colSpan={2} />
                            </TableRow>
                            </TableFooter>
                        )}
                        </Table>
                    </div>
                    <ScrollBar orientation="vertical" />
                </ScrollArea>
            </div>
          </div>

          <DialogFooter className="p-6 border-t bg-white shrink-0">
            <Button
              variant="outline"
              onClick={() => setIsPaymentDialogOpen(false)}
              className="w-full font-bold uppercase text-[10px] tracking-widest h-10"
            >
              Close ledger
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ------------------------- Mark fully paid ------------------------- */}
      <Dialog open={isPaidDialogOpen} onOpenChange={setIsPaidDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Mark cheque as fully paid</DialogTitle>
            <DialogDescription className="text-xs">
              Any outstanding balance is recorded as a single settlement entry on the ledger.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-4">
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase font-bold text-muted-foreground">Payment date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-left font-normal h-10 bg-white">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {paidDate ? `${toNepaliDate(paidDate.toISOString())} (${format(paidDate, 'PP')})` : 'Pick date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <DualCalendar selected={paidDate} onSelect={(d) => d && setPaidDate(d)} />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase font-bold text-muted-foreground">Remarks</Label>
              <Input value={paidRemark} onChange={(e) => setPaidRemark(e.target.value)} placeholder="e.g. Cleared via mobile banking" />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPaidDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (splitToPay) handleStatusUpdate(splitToPay.cheque, splitToPay.splitId, 'Paid', paidRemark, paidDate);
                setIsPaidDialogOpen(false);
              }}
            >
              Mark as paid
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ------------------------- Cancel issue ------------------------- */}
      <Dialog open={isCancelDialogOpen} onOpenChange={setIsCancelDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cancel this cheque</DialogTitle>
            <DialogDescription className="text-xs">A reason is required — it appears on the status badge.</DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-2">
            <Label>Reason for cancellation</Label>
            <Textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="e.g. Cheque leaf damaged, order changed"
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCancelDialogOpen(false)}>
              Go back
            </Button>
            <Button
              variant="destructive"
              disabled={!cancelReason.trim()}
              onClick={() => {
                if (splitToCancel) handleStatusUpdate(splitToCancel.cheque, splitToCancel.splitId, 'Canceled', cancelReason.trim());
                setIsCancelDialogOpen(false);
              }}
            >
              Cancel cheque
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------- Reset to due (destructive — now confirmed) ---------- */}
      <AlertDialog open={isResetDialogOpen} onOpenChange={setIsResetDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset this cheque to due?</AlertDialogTitle>
            <AlertDialogDescription>
              {splitToReset && (splitToReset.partialPayments || []).length > 0 ? (
                <>
                  This deletes {(splitToReset.partialPayments || []).length} recorded payment(s) totalling Rs.{' '}
                  {money(splitToReset.paidAmount)} from the ledger. This cannot be undone.
                </>
              ) : (
                'The status goes back to Due. No payments are on this cheque.'
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep as is</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => {
                if (splitToReset) handleStatusUpdate(splitToReset.parentCheque, splitToReset.id, 'Due');
                setIsResetDialogOpen(false);
                setSplitToReset(null);
              }}
            >
              Reset and clear payments
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ------------------------- Voucher print ------------------------- */}
      <Dialog open={isPrintPreviewOpen} onOpenChange={setIsPrintPreviewOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col p-0">
          <DialogHeader className="p-6 border-b">
            <DialogTitle>Voucher preview</DialogTitle>
          </DialogHeader>

          <ScrollArea className="flex-1 bg-muted/20 p-8">
            <div ref={printRef} className="mx-auto w-[210mm] shadow-2xl bg-white">
              {chequeToPrint && (
                <ChequeView
                  voucherNo={chequeToPrint.voucherNo}
                  voucherDate={new Date(chequeToPrint.paymentDate)}
                  payeeName={chequeToPrint.payeeName}
                  account={accounts.find((a) => a.id === chequeToPrint.accountId)}
                  splits={chequeToPrint.splits.map((s) => ({ ...s, chequeDate: new Date(s.chequeDate) }))}
                />
              )}
            </div>
            <ScrollBar orientation="horizontal" />
            <ScrollBar orientation="vertical" />
          </ScrollArea>

          <DialogFooter className="p-6 border-t bg-white">
            <Button variant="outline" onClick={() => setIsPrintPreviewOpen(false)}>
              Close
            </Button>
            <Button onClick={printVoucher}>
              <Printer className="mr-2 h-4 w-4" /> Print voucher
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ------------------------- Nepal cheque print ------------------------- */}
      <Dialog open={isNepalPrintOpen} onOpenChange={setIsNepalPrintOpen}>
        <DialogContent className="max-w-5xl h-[95vh] flex flex-col p-0 border-none shadow-2xl overflow-hidden bg-neutral-100">
          <DialogHeader className="p-6 border-b bg-white shrink-0">
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle className="text-xl font-black uppercase tracking-tight flex items-center gap-2">
                  <CreditCard className="h-5 w-5 text-primary" />
                  Nepal cheque alignment
                </DialogTitle>
                <DialogDescription className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                  Actual size &middot; 176mm × 88mm
                </DialogDescription>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setIsNepalPrintOpen(false)} aria-label="Close preview">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </DialogHeader>

          <ScrollArea className="flex-1 p-10">
            <div className="flex flex-col items-center gap-8">
              <div ref={nepalPrintRef} className="shadow-[0_20px_50px_rgba(0,0,0,0.2)] ring-1 ring-black/10">
                {nepalChequeToPrint && (
                  <NepalChequeView
                    payeeName={nepalChequeToPrint.parentCheque.payeeName}
                    amount={Number(nepalChequeToPrint.amount) || 0}
                    date={nepalChequeToPrint.chequeDate.toISOString()}
                    isAcPayee={isAcPayee}
                    offsetX={offsetX}
                    offsetY={offsetY}
                  />
                )}
              </div>

              {/* Print options */}
              <div className="w-full max-w-2xl bg-white border rounded-2xl p-6 space-y-6">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <Label className="text-xs font-black uppercase tracking-widest">Crossing</Label>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Turn this off to print a bearer cheque.
                    </p>
                  </div>
                  <div className="flex gap-1 rounded-lg border p-1">
                    <Button
                      size="sm"
                      variant={isAcPayee ? 'default' : 'ghost'}
                      className="h-7 text-[10px] font-bold uppercase tracking-wider"
                      onClick={() => setIsAcPayee(true)}
                    >
                      A/C payee
                    </Button>
                    <Button
                      size="sm"
                      variant={!isAcPayee ? 'default' : 'ghost'}
                      className="h-7 text-[10px] font-bold uppercase tracking-wider"
                      onClick={() => setIsAcPayee(false)}
                    >
                      Bearer
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  {([
                    ['Horizontal nudge', offsetX, setOffsetX] as const,
                    ['Vertical nudge', offsetY, setOffsetY] as const,
                  ]).map(([label, value, setter]) => (
                    <div key={label} className="space-y-2">
                      <Label className="text-[10px] font-bold uppercase text-muted-foreground">
                        {label}: {value > 0 ? `+${value}` : value}mm
                      </Label>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setter((v) => Math.round((v - 0.5) * 2) / 2)}>
                          <Minus className="h-3.5 w-3.5" />
                        </Button>
                        <Input
                          type="number"
                          step="0.5"
                          value={value}
                          onChange={(e) => setter(parseFloat(e.target.value) || 0)}
                          className="h-8 text-center text-xs font-bold"
                        />
                        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setter((v) => Math.round((v + 0.5) * 2) / 2)}>
                          <Plus className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-[10px] font-bold uppercase tracking-wider text-muted-foreground"
                    onClick={() => {
                      setOffsetX(0);
                      setOffsetY(0);
                    }}
                  >
                    <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Reset nudge
                  </Button>
                </div>
              </div>

              <div className="max-w-2xl bg-amber-50 border-2 border-amber-200 rounded-2xl p-6 space-y-3">
                <div className="flex items-center gap-2 text-amber-800">
                  <AlertTriangle className="h-5 w-5" />
                  <h4 className="font-black uppercase text-xs tracking-widest">Before printing on a real leaf</h4>
                </div>
                <p className="text-xs text-amber-900 leading-relaxed font-medium">
                  Print a test on plain A4 first and hold it behind the cheque leaf. Set <b>Scale: 100%</b> (or{' '}
                  <b>Actual size</b>) and turn <b>Headers and footers</b> off in the browser print dialog. Use the nudge
                  controls above to correct any offset, then print for real.
                </p>
              </div>
            </div>
            <ScrollBar orientation="horizontal" />
            <ScrollBar orientation="vertical" />
          </ScrollArea>

          <DialogFooter className="p-6 bg-white border-t shrink-0">
            <div className="flex w-full justify-between items-center">
              <p className="text-[10px] font-black uppercase text-muted-foreground tracking-tighter">
                Cheque ref: {nepalChequeToPrint?.chequeNumber || 'N/A'}
              </p>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => setIsNepalPrintOpen(false)}
                  className="h-11 px-8 font-bold text-[10px] uppercase tracking-widest"
                >
                  Close
                </Button>
                <Button
                  onClick={printNepalCheque}
                  disabled={!nepalChequeToPrint}
                  className="h-11 px-12 font-black text-[10px] uppercase tracking-widest shadow-xl shadow-primary/20"
                >
                  <Printer className="mr-2 h-4 w-4" /> Print cheque
                </Button>
              </div>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function ChequeGeneratorPage() {
  const [activeTab, setActiveTab] = useState('generator');
  const [chequeToEdit, setChequeToEdit] = useState<Cheque | null>(null);

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">Cheque Control Center</h1>
        <p className="text-muted-foreground">Manage payment vouchers and post-dated cheque distribution.</p>
      </header>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-4 bg-muted/50 p-1">
          <TabsTrigger value="generator" className="gap-2 px-6">
            <PlusCircle className="h-4 w-4" /> Generator
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-2 px-6">
            <History className="h-4 w-4" /> History
          </TabsTrigger>
          <TabsTrigger value="ledger" className="gap-2 px-6">
            <Receipt className="h-4 w-4" /> Payment Ledger
          </TabsTrigger>
        </TabsList>

        <TabsContent value="generator">
          <Suspense fallback={<Skeleton className="h-96 w-full" />}>
            <ChequeGeneratorForm
              key={chequeToEdit?.id || 'new'}
              chequeToEdit={chequeToEdit}
              onSaveSuccess={() => {
                setChequeToEdit(null);
                setActiveTab('history');
              }}
            />
          </Suspense>
        </TabsContent>

        <TabsContent value="history">
          <SavedChequesList
            onEdit={(c) => {
              setChequeToEdit(c);
              setActiveTab('generator');
            }}
          />
        </TabsContent>

        <TabsContent value="ledger">
          <ChequeLedger />
        </TabsContent>
      </Tabs>
    </div>
  );
}
