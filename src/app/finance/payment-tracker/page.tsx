'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { 
    Plus, 
    Search, 
    Edit, 
    Trash2, 
    FileSpreadsheet, 
    FilterX, 
    Loader2, 
    Check, 
    Calendar as CalendarIconLucide, 
    X,
    Printer,
    FileDown,
    Image as ImageIcon,
    Save,
    History,
    ChevronLeft,
    ChevronRight,
    Calculator,
    ClipboardList,
    PlusCircle,
    Hash,
    ArrowRight,
    ArrowRightLeft,
    ArrowDownCircle,
    ArrowUpCircle,
    Zap,
    Download,
    MoreHorizontal
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { 
    onPaymentEntriesUpdate, 
    addPaymentEntry, 
    updatePaymentEntry, 
    deletePaymentEntry,
    savePaymentVoucher 
} from '@/services/payment-tracker-service';
import type { PaymentTrackerEntry } from '@/lib/types';
import { cn, toNepaliDate, generateId, generateNextPaymentTrackerNumber } from '@/lib/utils';
import { format, startOfDay, endOfDay, isWithinInterval } from 'date-fns';
import { DualDateRangePicker } from '@/components/ui/dual-date-range-picker';
import type { DateRange } from 'react-day-picker';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DualCalendar } from '@/components/ui/dual-calendar';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { 
    DropdownMenu, 
    DropdownMenuContent, 
    DropdownMenuItem, 
    DropdownMenuTrigger, 
    DropdownMenuSeparator 
} from '@/components/ui/dropdown-menu';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { 
    Dialog, 
    DialogContent, 
    DialogHeader, 
    DialogTitle, 
    DialogFooter, 
    DialogDescription 
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

interface DraftEntry {
    id: string;
    type: 'Received' | 'Outflow';
    partyName: string;
    description: string;
    amount: string;
}

export default function PaymentTrackerPage() {
    const { user } = useAuth();
    const { toast } = useToast();
    const printableRef = useRef<HTMLDivElement>(null);
    
    const [activeTab, setActiveTab] = useState('tracker');
    const [savedEntries, setSavedEntries] = useState<PaymentTrackerEntry[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isExporting, setIsExporting] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    
    // Header State
    const [voucherNo, setVoucherNo] = useState('');
    const [entryDate, setEntryDate] = useState<Date>(new Date());
    const [isEditing, setIsEditing] = useState(false);
    
    // Draft Workspace State
    const [draftEntries, setDraftEntries] = useState<DraftEntry[]>([
        { id: generateId(), type: 'Received', partyName: '', description: '', amount: '' },
        { id: generateId(), type: 'Outflow', partyName: '', description: '', amount: '' }
    ]);

    // History Filters
    const [searchQuery, setSearchQuery] = useState('');
    const [historyDateRange, setHistoryDateRange] = useState<DateRange | undefined>(undefined);

    // History Management State
    const [deletingHistoricalEntry, setDeletingHistoricalEntry] = useState<PaymentTrackerEntry | null>(null);

    useEffect(() => {
        const unsub = onPaymentEntriesUpdate((data) => {
            setSavedEntries(data);
            setIsLoading(false);
        });
        return () => unsub();
    }, []);

    // Generate next voucher number
    useEffect(() => {
        if (activeTab === 'tracker' && !isEditing) {
            generateNextPaymentTrackerNumber(savedEntries, entryDate.toISOString()).then(setVoucherNo);
        }
    }, [savedEntries, activeTab, entryDate, isEditing]);

    const totals = useMemo(() => {
        let rec = 0;
        let pay = 0;
        draftEntries.forEach(e => {
            const amt = parseFloat(e.amount) || 0;
            if (e.type === 'Received') rec += amt;
            else pay += amt;
        });
        return { rec, pay, net: rec - pay };
    }, [draftEntries]);

    const handleAddLine = (type: 'Received' | 'Outflow') => {
        setDraftEntries([...draftEntries, { id: generateId(), type, partyName: '', description: '', amount: '' }]);
    };

    const handleRemoveLine = (id: string) => {
        if (draftEntries.length <= 1) return;
        setDraftEntries(draftEntries.filter(e => e.id !== id));
    };

    const handleUpdateLine = (id: string, field: keyof DraftEntry, value: string) => {
        setDraftEntries(prev => prev.map(e => e.id === id ? { ...e, [field]: value } : e));
    };

    const handleFinalizeVoucher = async () => {
        if (!user) return;
        
        const validEntries = draftEntries.filter(e => e.partyName.trim() !== '' && (parseFloat(e.amount) || 0) > 0);
        if (validEntries.length === 0) {
            toast({ title: 'Validation Error', description: 'Enter at least one valid entry with party and amount.', variant: 'destructive' });
            return;
        }

        setIsSaving(true);
        try {
            // If editing, we first remove the old records for this specific voucher
            // To ensure no duplicates or orphaned rows remain.
            if (isEditing) {
                // Fetch all entries for this voucher number to get their IDs
                const oldEntries = savedEntries.filter(e => e.voucherNo === voucherNo);
                for (const old of oldEntries) {
                    await deletePaymentEntry(old.id);
                }
            }

            await savePaymentVoucher({
                voucherNo,
                date: entryDate.toISOString(),
                entries: validEntries.map(e => ({
                    type: e.type,
                    partyName: e.partyName,
                    description: e.description,
                    amount: parseFloat(e.amount) || 0,
                    ownership: 'Both'
                })),
                createdBy: user.username
            });

            toast({ title: isEditing ? 'Voucher Updated' : 'Voucher Saved', description: `Voucher ${voucherNo} has been archived.` });
            
            // Reset workspace
            setDraftEntries([
                { id: generateId(), type: 'Received', partyName: '', description: '', amount: '' },
                { id: generateId(), type: 'Outflow', partyName: '', description: '', amount: '' }
            ]);
            setIsEditing(false);
            setActiveTab('history');
        } catch (error) {
            toast({ title: 'Error', description: 'Failed to save voucher.', variant: 'destructive' });
        } finally {
            setIsSaving(false);
        }
    };

    const filteredHistory = useMemo(() => {
        let filtered = [...savedEntries];
        
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            filtered = filtered.filter(e => 
                e.partyName.toLowerCase().includes(q) || 
                e.description.toLowerCase().includes(q) ||
                (e.voucherNo || '').toLowerCase().includes(q)
            );
        }

        if (historyDateRange?.from) {
            const start = startOfDay(historyDateRange.from);
            const end = endOfDay(historyDateRange.to || historyDateRange.from);
            filtered = filtered.filter(e => {
                const d = new Date(e.date);
                return isWithinInterval(d, { start, end });
            });
        }

        return filtered.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [savedEntries, searchQuery, historyDateRange]);

    const handleEditHistorical = (entry: PaymentTrackerEntry) => {
        // Load all entries belonging to the same voucher into the workspace
        const voucherEntries = savedEntries.filter(e => e.voucherNo === entry.voucherNo);
        
        const drafts: DraftEntry[] = voucherEntries.map(e => ({
            id: e.id,
            type: e.type,
            partyName: e.partyName,
            description: e.description,
            amount: String(e.amount)
        }));

        setDraftEntries(drafts);
        setVoucherNo(entry.voucherNo || '');
        setEntryDate(new Date(entry.date));
        setIsEditing(true);
        setActiveTab('tracker');
        
        toast({ title: 'Workspace Loaded', description: `Voucher ${entry.voucherNo} is ready for modifications.` });
    };

    const handleDeleteHistorical = async () => {
        if (!deletingHistoricalEntry) return;
        try {
            await deletePaymentEntry(deletingHistoricalEntry.id);
            toast({ title: 'Entry Deleted' });
            setDeletingHistoricalEntry(null);
        } catch {
            toast({ title: 'Delete Failed', variant: 'destructive' });
        }
    };

    const handleExportPdf = async () => {
        setIsExporting(true);
        try {
            const { jsPDF } = await import('jspdf');
            const { default: autoTable } = await import('jspdf-autotable');
            const doc = new jsPDF();
            doc.text(`Payment Ledger: ${voucherNo}`, 14, 15);
            doc.setFontSize(10);
            doc.text(`Date: ${toNepaliDate(entryDate.toISOString())} BS`, 14, 22);
            
            autoTable(doc, {
                startY: 30,
                head: [['Ref #', 'Type', 'Party', 'Description', 'Amount']],
                body: draftEntries
                    .filter(e => e.partyName.trim() !== '')
                    .map(e => [voucherNo, e.type, e.partyName, e.description, e.amount])
            });
            doc.save(`Ledger-${voucherNo}.pdf`);
        } finally {
            setIsExporting(false);
        }
    };

    const receivedDrafts = draftEntries.filter(e => e.type === 'Received');
    const outflowDrafts = draftEntries.filter(e => e.type === 'Outflow');

    return (
        <div className="flex flex-col gap-6">
            <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 print:hidden">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Payment Tracker</h1>
                    <p className="text-muted-foreground text-sm">Voucher-based daily cash flow</p>
                </div>
            </header>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="bg-muted/50 p-1 mb-4 h-10">
                    <TabsTrigger value="tracker" className="gap-2 px-6 text-xs font-semibold">
                        <Calculator className="h-4 w-4" />
                        Workspace {isEditing && <Badge className="ml-2 bg-amber-500 text-black border-none text-[8px] h-4">EDITING</Badge>}
                    </TabsTrigger>
                    <TabsTrigger value="history" className="gap-2 px-6 text-xs font-semibold">
                        <History className="h-4 w-4" />
                        History
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="tracker" className="space-y-6 animate-in fade-in">
                    {/* Voucher Header */}
                    <div className="bg-white p-4 rounded-xl border shadow-sm flex flex-col md:flex-row gap-4 md:gap-6 md:items-center">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-muted/50 rounded-lg"><Hash className="h-4 w-4 text-primary"/></div>
                            <div className="space-y-0.5">
                                <Label className="text-[11px] font-medium text-muted-foreground">Voucher Number</Label>
                                <p className="font-semibold text-sm text-gray-900 font-mono">{voucherNo}</p>
                            </div>
                        </div>
                        <Separator orientation="vertical" className="h-10 hidden md:block" />
                        <div className="flex items-center gap-3">
                            <Label className="text-[11px] font-medium text-muted-foreground">Date</Label>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button variant="outline" className="w-[200px] justify-start text-left font-normal bg-white h-9">
                                        <CalendarIconLucide className="mr-2 h-3.5 w-3.5 opacity-50" />
                                        <span className="font-semibold text-xs truncate">
                                            {toNepaliDate(entryDate.toISOString())} BS
                                        </span>
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                    <DualCalendar selected={entryDate} onSelect={d => d && setEntryDate(d)} />
                                </PopoverContent>
                            </Popover>
                        </div>
                        <div className="flex-1 flex justify-end gap-2">
                            {isEditing && (
                                <Button variant="ghost" size="sm" onClick={() => { setIsEditing(false); setDraftEntries([{ id: generateId(), type: 'Received', partyName: '', description: '', amount: '' }, { id: generateId(), type: 'Outflow', partyName: '', description: '', amount: '' }]); }} className="h-9 px-4 text-xs font-bold text-muted-foreground">
                                    Cancel Edit
                                </Button>
                            )}
                            <Button variant="outline" size="sm" onClick={handleExportPdf} disabled={isExporting} className="h-9 px-4 text-xs font-semibold">
                                {isExporting ? <Loader2 className="animate-spin h-4 w-4 mr-2"/> : <FileDown className="h-4 w-4 mr-2" />} Export PDF
                            </Button>
                            <Button onClick={handleFinalizeVoucher} disabled={isSaving} className="h-9 px-5 text-xs font-semibold">
                                {isSaving ? <Loader2 className="animate-spin h-4 w-4 mr-2"/> : <Save className="mr-2 h-4 w-4" />} {isEditing ? 'Update Records' : 'Save Voucher'}
                            </Button>
                        </div>
                    </div>

                    <div ref={printableRef} className="space-y-4">
                        <Card className="shadow-sm border-gray-200 bg-white overflow-hidden">
                            <CardContent className="p-0">
                                <ScrollArea className="w-full">
                                    <Table className="border-collapse table-fixed w-full min-w-[800px]">
                                        {/* RECEIVED SECTION */}
                                        <TableHeader>
                                            <TableRow className="bg-blue-50/70 hover:bg-blue-50/70 h-12 border-b">
                                                <TableHead colSpan={5} className="px-4 align-middle">
                                                    <div className="flex items-center justify-between w-full">
                                                        <span className="text-xs font-semibold uppercase tracking-wide text-blue-800 flex items-center gap-2">
                                                            <ArrowDownCircle className="h-4 w-4" /> Receipts (Inflow)
                                                        </span>
                                                        <Button variant="ghost" size="sm" onClick={() => handleAddLine('Received')} className="h-7 text-xs font-medium text-blue-700 hover:text-blue-800 hover:bg-blue-100/60">
                                                            <PlusCircle className="mr-1.5 h-3.5 w-3.5" /> Add Line
                                                        </Button>
                                                    </div>
                                                </TableHead>
                                            </TableRow>
                                            <TableRow className="bg-muted/20 h-8">
                                                <TableHead className="w-12 text-center border-r text-[11px] font-medium text-muted-foreground px-2">S.N.</TableHead>
                                                <TableHead className="border-r text-[11px] font-medium text-muted-foreground px-3">Party / Source</TableHead>
                                                <TableHead className="border-r text-[11px] font-medium text-muted-foreground px-3">Description</TableHead>
                                                <TableHead className="text-right text-[11px] font-medium text-muted-foreground px-4 w-[200px]">Amount (रु)</TableHead>
                                                <TableHead className="w-12 px-2 text-center"></TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {receivedDrafts.map((e, i) => (
                                                <TableRow key={e.id} className="h-10 border-b group transition-colors hover:bg-muted/10">
                                                    <TableCell className="text-center border-r text-sm text-muted-foreground px-2 py-0">{i + 1}</TableCell>
                                                    <TableCell className="border-r p-0">
                                                        <Input 
                                                            value={e.partyName} 
                                                            onChange={v => handleUpdateLine(e.id, 'partyName', v.target.value)} 
                                                            className="h-10 border-none rounded-none text-sm px-3 font-medium bg-transparent focus-visible:bg-blue-50/30 focus-visible:ring-1 focus-visible:ring-inset" 
                                                            placeholder="Party name..."
                                                        />
                                                    </TableCell>
                                                    <TableCell className="border-r p-0">
                                                        <Input 
                                                            value={e.description} 
                                                            onChange={v => handleUpdateLine(e.id, 'description', v.target.value)} 
                                                            className="h-10 border-none rounded-none text-sm px-3 text-gray-600 bg-transparent focus-visible:bg-blue-50/30 focus-visible:ring-1 focus-visible:ring-inset" 
                                                            placeholder="Note..."
                                                        />
                                                    </TableCell>
                                                    <TableCell className="text-right border-r p-0">
                                                        <Input 
                                                            type="number" 
                                                            value={e.amount} 
                                                            onChange={v => handleUpdateLine(e.id, 'amount', v.target.value)} 
                                                            className="h-10 border-none rounded-none text-right px-4 font-semibold text-sm tabular-nums bg-transparent focus-visible:bg-blue-50/30 focus-visible:ring-1 focus-visible:ring-inset" 
                                                            placeholder="0.00"
                                                        />
                                                    </TableCell>
                                                    <TableCell className="text-center p-0">
                                                        <Button variant="ghost" size="icon" className="h-10 w-full rounded-none text-muted-foreground/40 hover:text-destructive" onClick={() => handleRemoveLine(e.id)}>
                                                            <Trash2 className="h-3.5 w-3.5"/>
                                                        </Button>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                            <TableRow className="bg-muted/20 h-10 border-b">
                                                <TableCell className="border-r px-2"></TableCell>
                                                <TableCell colSpan={2} className="text-xs font-semibold text-gray-600 border-r px-4 text-right align-middle">Total Received</TableCell>
                                                <TableCell className="text-right tabular-nums text-sm font-semibold px-4 border-r align-middle text-blue-700">{totals.rec.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                                <TableCell />
                                            </TableRow>
                                        </TableBody>

                                        {/* OUTFLOW SECTION */}
                                        <TableHeader>
                                            <TableRow className="h-4 border-none hover:bg-transparent"><TableCell colSpan={5} className="p-0"></TableCell></TableRow>
                                            <TableRow className="bg-red-50/70 hover:bg-red-50/70 h-12 border-b">
                                                <TableHead colSpan={5} className="px-4 align-middle">
                                                    <div className="flex items-center justify-between w-full">
                                                        <span className="text-xs font-semibold uppercase tracking-wide text-red-800 flex items-center gap-2">
                                                            <ArrowUpCircle className="h-4 w-4" /> Payments (Outflow)
                                                        </span>
                                                        <Button variant="ghost" size="sm" onClick={() => handleAddLine('Outflow')} className="h-7 text-xs font-medium text-red-700 hover:text-red-800 hover:bg-red-100/60">
                                                            <PlusCircle className="mr-1.5 h-3.5 w-3.5" /> Add Line
                                                        </Button>
                                                    </div>
                                                </TableHead>
                                            </TableRow>
                                            <TableRow className="bg-muted/20 h-8">
                                                <TableHead className="w-12 text-center border-r text-[11px] font-medium text-muted-foreground px-2">S.N.</TableHead>
                                                <TableHead className="border-r text-[11px] font-medium text-muted-foreground px-3">Beneficiary</TableHead>
                                                <TableHead className="border-r text-[11px] font-medium text-muted-foreground px-3">Description</TableHead>
                                                <TableHead className="text-right text-[11px] font-medium text-muted-foreground px-4 w-[200px]">Amount (रु)</TableHead>
                                                <TableHead className="w-12 px-2 text-center"></TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {outflowDrafts.map((e, i) => (
                                                <TableRow key={e.id} className="h-10 border-b group transition-colors hover:bg-muted/10">
                                                    <TableCell className="text-center border-r text-sm text-muted-foreground px-2 py-0">{i + 1}</TableCell>
                                                    <TableCell className="border-r p-0">
                                                        <Input 
                                                            value={e.partyName} 
                                                            onChange={v => handleUpdateLine(e.id, 'partyName', v.target.value)} 
                                                            className="h-10 border-none rounded-none text-sm px-3 font-medium bg-transparent focus-visible:bg-red-50/30 focus-visible:ring-1 focus-visible:ring-inset" 
                                                            placeholder="Beneficiary name..."
                                                        />
                                                    </TableCell>
                                                    <TableCell className="border-r p-0">
                                                        <Input 
                                                            value={e.description} 
                                                            onChange={v => handleUpdateLine(e.id, 'description', v.target.value)} 
                                                            className="h-10 border-none rounded-none text-sm px-3 text-gray-600 bg-transparent focus-visible:bg-red-50/30 focus-visible:ring-1 focus-visible:ring-inset" 
                                                            placeholder="Note..."
                                                        />
                                                    </TableCell>
                                                    <TableCell className="text-right border-r p-0">
                                                        <Input 
                                                            type="number" 
                                                            value={e.amount} 
                                                            onChange={v => handleUpdateLine(e.id, 'amount', v.target.value)} 
                                                            className="h-10 border-none rounded-none text-right px-4 font-semibold text-sm tabular-nums bg-transparent focus-visible:bg-blue-50/30 focus-visible:ring-1 focus-visible:ring-inset" 
                                                            placeholder="0.00"
                                                        />
                                                    </TableCell>
                                                    <TableCell className="text-center p-0">
                                                        <Button variant="ghost" size="icon" className="h-10 w-full rounded-none text-muted-foreground/40 hover:text-destructive" onClick={() => handleRemoveLine(e.id)}>
                                                            <Trash2 className="h-3.5 w-3.5"/>
                                                        </Button>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                            <TableRow className="bg-muted/20 h-10 border-b">
                                                <TableCell className="border-r px-2"></TableCell>
                                                <TableCell colSpan={2} className="text-xs font-semibold text-gray-600 border-r px-4 text-right align-middle">Total Paid Out</TableCell>
                                                <TableCell className="text-right tabular-nums text-sm font-semibold px-4 border-r align-middle text-red-700">{totals.pay.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                                <TableCell />
                                            </TableRow>
                                        </TableBody>

                                        {/* SUMMARY FOOTER */}
                                        <TableFooter>
                                            <TableRow className="h-3 border-none hover:bg-transparent bg-transparent"><TableCell colSpan={5} className="p-0"></TableCell></TableRow>
                                            <TableRow className={cn(
                                                "h-12 border-t-2 hover:bg-transparent",
                                                totals.net >= 0 ? "bg-emerald-50/70 border-emerald-200" : "bg-amber-50/70 border-amber-200"
                                            )}>
                                                <TableCell className="border-r"></TableCell>
                                                <TableCell colSpan={2} className={cn(
                                                    "text-sm font-semibold px-6 align-middle",
                                                    totals.net >= 0 ? "text-emerald-800" : "text-amber-800"
                                                )}>Net Balance</TableCell>
                                                <TableCell className={cn(
                                                    "text-right tabular-nums text-lg px-4 font-bold border-r align-middle",
                                                    totals.net >= 0 ? "text-emerald-700" : "text-amber-700"
                                                )}>
                                                    {totals.net.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                </TableCell>
                                                <TableCell />
                                            </TableRow>
                                        </TableFooter>
                                    </Table>
                                    <ScrollBar orientation="horizontal" />
                                </ScrollArea>
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>

                <TabsContent value="history" className="animate-in fade-in">
                    <div className="bg-white p-4 rounded-xl border shadow-sm mb-6 flex flex-col md:flex-row gap-4 md:gap-6 md:items-center">
                        <div className="flex items-center gap-3">
                            <Label className="text-[11px] font-medium text-muted-foreground whitespace-nowrap">Period</Label>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button variant="outline" className="w-[240px] justify-start text-left font-normal bg-white h-9">
                                        <CalendarIconLucide className="mr-2 h-4 w-4 opacity-50" />
                                        <span className="font-medium text-xs truncate">
                                            {historyDateRange?.from ? `${toNepaliDate(historyDateRange.from.toISOString())} - ${historyDateRange.to ? toNepaliDate(historyDateRange.to.toISOString()) : '...'}` : 'Select Range'}
                                        </span>
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                    <DualDateRangePicker selected={historyDateRange} onSelect={setHistoryDateRange} />
                                </PopoverContent>
                            </Popover>
                        </div>
                        <div className="flex items-center gap-3 flex-1">
                            <div className="relative flex-1">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input 
                                    placeholder="Search party, voucher or description..." 
                                    className="pl-9 h-9 bg-white" 
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                />
                            </div>
                        </div>
                        {(searchQuery || historyDateRange) && (
                            <Button variant="ghost" size="sm" onClick={() => { setSearchQuery(''); setHistoryDateRange(undefined); }} className="h-9 text-muted-foreground text-xs">
                                <FilterX className="mr-1.5 h-3.5 w-3.5" /> Clear
                            </Button>
                        )}
                    </div>

                    <Card className="shadow-sm border-gray-100 bg-white overflow-hidden">
                        <CardContent className="p-0">
                            <Table className="text-sm">
                                <TableHeader className="bg-muted/30 border-b">
                                    <TableRow className="h-10">
                                        <TableHead className="pl-6 text-[11px] font-medium text-muted-foreground uppercase">Date (BS)</TableHead>
                                        <TableHead className="text-[11px] font-medium text-muted-foreground uppercase">Voucher #</TableHead>
                                        <TableHead className="text-[11px] font-medium text-muted-foreground uppercase">Type</TableHead>
                                        <TableHead className="text-[11px] font-medium text-muted-foreground uppercase">Party</TableHead>
                                        <TableHead className="text-right text-[11px] font-medium text-muted-foreground uppercase">Amount</TableHead>
                                        <TableHead className="text-right pr-6 text-[11px] font-medium text-muted-foreground uppercase">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredHistory.map(e => (
                                        <TableRow key={e.id} className="h-12 border-b hover:bg-muted/10 transition-colors group">
                                            <TableCell className="pl-6 text-gray-500">{toNepaliDate(e.date)}</TableCell>
                                            <TableCell className="font-mono font-medium text-primary">{e.voucherNo}</TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className={cn(
                                                    "text-[10px] font-medium",
                                                    e.type === 'Received' ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-red-50 text-red-700 border-red-200"
                                                )}>{e.type}</Badge>
                                            </TableCell>
                                            <TableCell className="font-medium text-gray-900">{e.partyName}</TableCell>
                                            <TableCell className="text-right font-semibold tabular-nums">
                                                Rs. {e.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                            </TableCell>
                                            <TableCell className="text-right pr-6">
                                                <div className="flex justify-end gap-1 opacity-100 lg:opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-primary" onClick={() => handleEditHistorical(e)}>
                                                        <Edit className="h-4 w-4" />
                                                    </Button>
                                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeletingHistoricalEntry(e)}>
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {filteredHistory.length === 0 && (
                                        <TableRow><TableCell colSpan={6} className="py-20 text-center text-muted-foreground">No records found for this criteria.</TableCell></TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            {/* Delete Confirmation Alert */}
            <AlertDialog open={!!deletingHistoricalEntry} onOpenChange={(open) => !open && setDeletingHistoricalEntry(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Entry?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will permanently remove this transaction from the historical ledger. This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel className="text-xs font-semibold">Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDeleteHistorical} className="bg-destructive text-destructive-foreground hover:bg-destructive/90 text-xs font-semibold">
                            Delete Permanently
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <style jsx global>{`
                @media print {
                    @page { size: A4; margin: 10mm; }
                    body { background: white !important; }
                    aside, header, nav, .tabs-list, .print\\:hidden, button, .bg-muted\/20 { display: none !important; }
                    .main-content, main, .printable-container, .printable-area { display: block !important; width: 100% !important; margin: 0 !important; padding: 0 !important; }
                    table { border: 1px solid #000 !important; width: 100% !important; }
                    th, td { border: 1px solid #000 !important; color: black !important; padding: 4px !important; }
                    .font-black { font-weight: 900 !important; }
                }
            `}</style>
        </div>
    );
}
