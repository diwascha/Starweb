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
    Zap,
    Download
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
    
    // Draft Workspace State
    const [draftEntries, setDraftEntries] = useState<DraftEntry[]>([
        { id: generateId(), type: 'Received', partyName: '', description: '', amount: '' },
        { id: generateId(), type: 'Outflow', partyName: '', description: '', amount: '' }
    ]);

    // History Filters
    const [searchQuery, setSearchQuery] = useState('');
    const [historyDateRange, setHistoryDateRange] = useState<DateRange | undefined>(undefined);

    useEffect(() => {
        const unsub = onPaymentEntriesUpdate((data) => {
            setSavedEntries(data);
            setIsLoading(false);
        });
        return () => unsub();
    }, []);

    // Generate next voucher number
    useEffect(() => {
        if (activeTab === 'tracker' && savedEntries.length >= 0) {
            generateNextPaymentTrackerNumber(savedEntries, entryDate.toISOString()).then(setVoucherNo);
        }
    }, [savedEntries, activeTab, entryDate]);

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

            toast({ title: 'Ledger Finalized', description: `Voucher ${voucherNo} has been archived.` });
            
            // Clear draft and move to history
            setDraftEntries([
                { id: generateId(), type: 'Received', partyName: '', description: '', amount: '' },
                { id: generateId(), type: 'Outflow', partyName: '', description: '', amount: '' }
            ]);
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
                    <h1 className="text-3xl font-black text-gray-900 tracking-tighter uppercase leading-none">Payment Tracker</h1>
                    <p className="text-muted-foreground text-[11px] font-black uppercase tracking-widest mt-1 italic">Voucher-Based Daily Cash Flow • High Density Workspace</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={handleExportPdf} disabled={isExporting} className="h-9 px-4 font-black text-[10px] uppercase tracking-widest">
                        {isExporting ? <Loader2 className="animate-spin h-4 w-4"/> : <FileDown className="h-4 w-4" />} Export PDF
                    </Button>
                    <Button onClick={handleFinalizeVoucher} disabled={isSaving} className="h-9 px-6 font-black text-[10px] uppercase tracking-widest shadow-xl shadow-primary/20">
                        {isSaving ? <Loader2 className="animate-spin h-4 w-4 mr-2"/> : <Save className="mr-2 h-4 w-4" />} Finalize Document
                    </Button>
                </div>
            </header>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="bg-muted/50 p-1 mb-4 h-11">
                    <TabsTrigger value="tracker" className="gap-2 px-8 font-black text-[10px] uppercase tracking-widest">
                        <Calculator className="h-4 w-4" />
                        Live Workspace
                    </TabsTrigger>
                    <TabsTrigger value="history" className="gap-2 px-8 font-black text-[10px] uppercase tracking-widest">
                        <History className="h-4 w-4" />
                        Historical Registry
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="tracker" className="space-y-6 animate-in fade-in slide-in-from-left-2">
                    {/* Voucher Header */}
                    <div className="bg-primary/5 p-4 rounded-xl border-2 border-primary/10 flex flex-col md:flex-row gap-6 items-center">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-white rounded-lg shadow-sm"><Hash className="h-4 w-4 text-primary"/></div>
                            <div className="space-y-0.5">
                                <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Voucher Number</Label>
                                <p className="font-black text-sm text-blue-900 font-mono tracking-tight">{voucherNo}</p>
                            </div>
                        </div>
                        <Separator orientation="vertical" className="h-10 hidden md:block" />
                        <div className="flex items-center gap-3">
                            <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Target Date</Label>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button variant="outline" className="w-[200px] justify-start text-left font-normal bg-white h-9 border-gray-300">
                                        <CalendarIconLucide className="mr-2 h-3.5 w-3.5 opacity-50" />
                                        <span className="font-black text-[11px] truncate uppercase">
                                            {toNepaliDate(entryDate.toISOString())} BS
                                        </span>
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                    <DualCalendar selected={entryDate} onSelect={d => d && setEntryDate(d)} />
                                </PopoverContent>
                            </Popover>
                        </div>
                        <div className="flex-1 text-right">
                             <Badge variant="outline" className="h-6 px-3 bg-white border-primary/20 text-primary font-black uppercase text-[9px] tracking-widest animate-pulse">Draft Mode Active</Badge>
                        </div>
                    </div>

                    <div ref={printableRef} className="space-y-4">
                        <Card className="shadow-sm border-gray-200 bg-white overflow-hidden">
                            <CardContent className="p-0">
                                <ScrollArea className="w-full">
                                    <Table className="border-collapse table-fixed w-full min-w-[800px]">
                                        {/* RECEIVED SECTION */}
                                        <TableHeader>
                                            <TableRow className="bg-blue-900 hover:bg-blue-900 h-[36px] border-b">
                                                <TableHead colSpan={5} className="px-4 h-[36px] align-middle">
                                                    <div className="flex items-center justify-between w-full">
                                                        <span className="text-[12px] font-black uppercase tracking-[0.3em] text-white">1. Inflow Ledger (Receipts)</span>
                                                        <Button variant="secondary" size="sm" onClick={() => handleAddLine('Received')} className="h-6 text-[9px] font-black uppercase bg-white/20 text-white border-none hover:bg-white/30">
                                                            <PlusCircle className="mr-1 h-3 w-3" /> Add Receipt Line
                                                        </Button>
                                                    </div>
                                                </TableHead>
                                            </TableRow>
                                            <TableRow className="bg-muted/10 h-[24px]">
                                                <TableHead className="w-12 text-center border-r font-black text-[10px] uppercase px-2">S.N.</TableHead>
                                                <TableHead className="border-r font-black text-[10px] uppercase px-3">Party Name / Source</TableHead>
                                                <TableHead className="border-r font-black text-[10px] uppercase px-3">Description / Note</TableHead>
                                                <TableHead className="text-right font-black text-[10px] uppercase px-4 w-[200px]">Amount (रु)</TableHead>
                                                <TableHead className="w-12 px-2 text-center"></TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {receivedDrafts.map((e, i) => (
                                                <TableRow key={e.id} className="h-[18px] border-b group transition-colors">
                                                    <TableCell className="text-center border-r text-[11px] text-muted-foreground px-2 py-0 h-[18px] leading-none font-bold">{i + 1}</TableCell>
                                                    <TableCell className="border-r p-0 h-[18px]">
                                                        <Input 
                                                            value={e.partyName} 
                                                            onChange={v => handleUpdateLine(e.id, 'partyName', v.target.value)} 
                                                            className="h-full border-none rounded-none text-[14px] px-3 py-0 font-black uppercase leading-none bg-transparent focus-visible:bg-white" 
                                                            placeholder="..."
                                                        />
                                                    </TableCell>
                                                    <TableCell className="border-r p-0 h-[18px]">
                                                        <Input 
                                                            value={e.description} 
                                                            onChange={v => handleUpdateLine(e.id, 'description', v.target.value)} 
                                                            className="h-full border-none rounded-none text-[14px] px-3 py-0 italic leading-none bg-transparent focus-visible:bg-white" 
                                                            placeholder="..."
                                                        />
                                                    </TableCell>
                                                    <TableCell className="text-right border-r p-0 h-[18px]">
                                                        <Input 
                                                            type="number" 
                                                            value={e.amount} 
                                                            onChange={v => handleUpdateLine(e.id, 'amount', v.target.value)} 
                                                            className="h-full border-none rounded-none text-right px-4 font-black text-[14px] py-0 leading-none bg-transparent focus-visible:bg-white" 
                                                            placeholder="0.00"
                                                        />
                                                    </TableCell>
                                                    <TableCell className="text-center px-0 h-[18px] py-0">
                                                        <Button variant="ghost" size="icon" className="h-full w-full rounded-none text-destructive opacity-20 group-hover:opacity-100 transition-opacity" onClick={() => handleRemoveLine(e.id)}>
                                                            <Trash2 className="h-3 w-3"/>
                                                        </Button>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                            <TableRow className="bg-blue-50 font-black h-[28px] border-b-2 border-gray-400">
                                                <TableCell className="border-r px-2 h-[28px]"></TableCell>
                                                <TableCell colSpan={2} className="uppercase tracking-[0.2em] text-[10px] border-r px-4 text-right h-[28px] align-middle">Aggregate Daily Received</TableCell>
                                                <TableCell className="text-right tabular-nums text-[14px] px-4 border-r h-[28px] align-middle text-blue-900">{totals.rec.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                                <TableCell className="h-[28px]" />
                                            </TableRow>
                                        </TableBody>

                                        {/* OUTFLOW SECTION */}
                                        <TableHeader>
                                            <TableRow className="h-6"><TableCell colSpan={5}></TableCell></TableRow>
                                            <TableRow className="bg-red-900 hover:bg-red-900 h-[36px] border-b">
                                                <TableHead colSpan={5} className="px-4 h-[36px] align-middle">
                                                    <div className="flex items-center justify-between w-full">
                                                        <span className="text-[12px] font-black uppercase tracking-[0.3em] text-white">2. Outflow Ledger (Payments)</span>
                                                        <Button variant="secondary" size="sm" onClick={() => handleAddLine('Outflow')} className="h-6 text-[9px] font-black uppercase bg-white/20 text-white border-none hover:bg-white/30">
                                                            <PlusCircle className="mr-1 h-3 w-3" /> Add Payment Line
                                                        </Button>
                                                    </div>
                                                </TableHead>
                                            </TableRow>
                                            <TableRow className="bg-muted/10 h-[24px]">
                                                <TableHead className="w-12 text-center border-r font-black text-[10px] uppercase px-2">S.N.</TableHead>
                                                <TableHead className="border-r font-black text-[10px] uppercase px-3">Beneficiary / Destination</TableHead>
                                                <TableHead className="border-r font-black text-[10px] uppercase px-3">Description / Note</TableHead>
                                                <TableHead className="text-right font-black text-[10px] uppercase px-4 w-[200px]">Amount (रु)</TableHead>
                                                <TableHead className="w-12 px-2 text-center"></TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {outflowDrafts.map((e, i) => (
                                                <TableRow key={e.id} className="h-[18px] border-b group transition-colors">
                                                    <TableCell className="text-center border-r text-[11px] text-muted-foreground px-2 py-0 h-[18px] leading-none font-bold">{i + 1}</TableCell>
                                                    <TableCell className="border-r p-0 h-[18px]">
                                                        <Input 
                                                            value={e.partyName} 
                                                            onChange={v => handleUpdateLine(e.id, 'partyName', v.target.value)} 
                                                            className="h-full border-none rounded-none text-[14px] px-3 py-0 font-black uppercase leading-none bg-transparent focus-visible:bg-white" 
                                                            placeholder="..."
                                                        />
                                                    </TableCell>
                                                    <TableCell className="border-r p-0 h-[18px]">
                                                        <Input 
                                                            value={e.description} 
                                                            onChange={v => handleUpdateLine(e.id, 'description', v.target.value)} 
                                                            className="h-full border-none rounded-none text-[14px] px-3 py-0 italic leading-none bg-transparent focus-visible:bg-white" 
                                                            placeholder="..."
                                                        />
                                                    </TableCell>
                                                    <TableCell className="text-right border-r p-0 h-[18px]">
                                                        <Input 
                                                            type="number" 
                                                            value={e.amount} 
                                                            onChange={v => handleUpdateLine(e.id, 'amount', v.target.value)} 
                                                            className="h-full border-none rounded-none text-right px-4 font-black text-[14px] py-0 leading-none bg-transparent focus-visible:bg-white" 
                                                            placeholder="0.00"
                                                        />
                                                    </TableCell>
                                                    <TableCell className="text-center px-0 h-[18px] py-0">
                                                        <Button variant="ghost" size="icon" className="h-full w-full rounded-none text-destructive opacity-20 group-hover:opacity-100 transition-opacity" onClick={() => handleRemoveLine(e.id)}>
                                                            <Trash2 className="h-3 w-3"/>
                                                        </Button>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                            <TableRow className="bg-red-50 font-black h-[28px] border-b-2 border-gray-400">
                                                <TableCell className="border-r px-2 h-[28px]"></TableCell>
                                                <TableCell colSpan={2} className="uppercase tracking-[0.2em] text-[10px] border-r px-4 text-right h-[28px] align-middle">Aggregate Daily Outflow</TableCell>
                                                <TableCell className="text-right tabular-nums text-[14px] px-4 border-r h-[28px] align-middle text-red-900">{totals.pay.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                                <TableCell className="h-[28px]" />
                                            </TableRow>
                                        </TableBody>

                                        {/* SUMMARY FOOTER */}
                                        <TableFooter>
                                            <TableRow className="h-4 border-none"><TableCell colSpan={5}></TableCell></TableRow>
                                            <TableRow className="bg-emerald-600 border-t-2 border-gray-900 h-[42px] hover:bg-emerald-600">
                                                <TableCell className="border-r h-[42px]"></TableCell>
                                                <TableCell colSpan={2} className="uppercase tracking-[0.4em] font-black text-[12px] text-white px-8 h-[42px] align-middle">Net Operational Balance</TableCell>
                                                <TableCell className="text-right tabular-nums text-[20px] px-4 font-black border-r h-[42px] align-middle text-white">
                                                    {totals.net.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                </TableCell>
                                                <TableCell className="h-[42px]" />
                                            </TableRow>
                                        </TableFooter>
                                    </Table>
                                    <ScrollBar orientation="horizontal" />
                                </ScrollArea>
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>

                <TabsContent value="history" className="animate-in fade-in slide-in-from-right-2">
                    <div className="bg-muted/20 p-4 rounded-xl border border-dashed mb-6 flex flex-col md:flex-row gap-6 items-center">
                        <div className="flex items-center gap-3">
                            <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">History Period</Label>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button variant="outline" className="w-[240px] justify-start text-left font-normal bg-white h-10 border-gray-300">
                                        <CalendarIconLucide className="mr-2 h-4 w-4 opacity-50" />
                                        <span className="font-bold text-xs truncate">
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
                            <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Quick Filter</Label>
                            <div className="relative flex-1">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input 
                                    placeholder="Search party, voucher or narration..." 
                                    className="pl-9 h-10 bg-white" 
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                />
                            </div>
                        </div>
                        {(searchQuery || historyDateRange) && (
                            <Button variant="ghost" size="sm" onClick={() => { setSearchQuery(''); setHistoryDateRange(undefined); }} className="h-10 text-muted-foreground uppercase font-black text-[9px]">
                                <FilterX className="mr-1.5 h-3.5 w-3.5" /> Clear
                            </Button>
                        )}
                    </div>

                    <Card className="shadow-sm border-gray-100 bg-white overflow-hidden">
                        <CardContent className="p-0">
                            <Table className="text-[14px]">
                                <TableHeader className="bg-muted/50 border-b">
                                    <TableRow className="h-10">
                                        <TableHead className="pl-6 font-bold uppercase text-[10px]">Date (BS)</TableHead>
                                        <TableHead className="font-bold uppercase text-[10px]">Voucher #</TableHead>
                                        <TableHead className="font-bold uppercase text-[10px]">Type</TableHead>
                                        <TableHead className="font-bold uppercase text-[10px]">Entity / Party</TableHead>
                                        <TableHead className="text-right pr-6 font-bold uppercase text-[10px]">Amount</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredHistory.map(e => (
                                        <TableRow key={e.id} className="h-14 border-b hover:bg-muted/10 transition-colors">
                                            <TableCell className="pl-6 font-medium text-gray-500">{toNepaliDate(e.date)}</TableCell>
                                            <TableCell className="font-mono font-bold text-blue-600">{e.voucherNo}</TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className={cn(
                                                    "text-[9px] font-black uppercase",
                                                    e.type === 'Received' ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-red-50 text-red-700 border-red-200"
                                                )}>{e.type}</Badge>
                                            </TableCell>
                                            <TableCell className="font-black uppercase tracking-tight">{e.partyName}</TableCell>
                                            <TableCell className="text-right pr-6 font-black tabular-nums">
                                                Rs. {e.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {filteredHistory.length === 0 && (
                                        <TableRow><TableCell colSpan={5} className="py-20 text-center text-muted-foreground italic">No historical records found for this criteria.</TableCell></TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

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
