
'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { 
    Plus, 
    Search, 
    Edit, 
    Trash2, 
    FileText,
    FilterX, 
    Loader2, 
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
    PlusCircle,
    Hash,
    ArrowDownCircle,
    ArrowUpCircle,
    Eye
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
    deletePaymentVoucher,
    savePaymentVoucher,
    replacePaymentVoucher
} from '@/services/payment-tracker-service';
import { onSettingUpdate } from '@/services/settings-service';
import type { PaymentTrackerEntry, CompanyProfile } from '@/lib/types';
import { cn, toNepaliDate, generateId, generateNextPaymentTrackerNumber } from '@/lib/utils';
import { format, startOfDay, endOfDay, isWithinInterval } from 'date-fns';
import { DualDateRangePicker } from '@/components/ui/dual-date-range-picker';
import type { DateRange } from 'react-day-picker';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DualCalendar } from '@/components/ui/dual-calendar';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
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
import { DEFAULT_COMPANY_PROFILE } from '@/lib/constants';

interface DraftEntry {
    id: string;
    type: 'Received' | 'Outflow';
    partyName: string;
    description: string;
    amount: string;
}

interface SummarizedVoucher {
    voucherNo: string;
    date: string;
    totalPayment: number;
    totalReceived: number;
    netAmount: number;
    entriesCount: number;
}

function VoucherReportView({ 
    voucherNo, 
    date, 
    entries, 
    companyProfile 
}: { 
    voucherNo: string, 
    date: string, 
    entries: PaymentTrackerEntry[], 
    companyProfile: CompanyProfile 
}) {
    const received = entries.filter(e => e.type === 'Received');
    const outflows = entries.filter(e => e.type === 'Outflow');
    
    const totalReceived = received.reduce((sum, e) => sum + e.amount, 0);
    const totalOutflow = outflows.reduce((sum, e) => sum + e.amount, 0);
    const netBalance = totalReceived - totalOutflow;

    return (
        <div className="po-report bg-white text-black p-10 font-sans min-h-[297mm] flex flex-col border">
            <header className="text-center border-b-2 border-black pb-4 mb-8">
                <h1 className="text-2xl font-black uppercase tracking-tight">{companyProfile.nameEn}</h1>
                {companyProfile.nameNp && <h2 className="text-lg font-semibold">{companyProfile.nameNp}</h2>}
                <p className="text-sm font-bold">{companyProfile.address}</p>
                <h2 className="text-lg font-black underline mt-4 uppercase tracking-[0.2em]">DAILY PAYMENT TRACKER LEDGER</h2>
            </header>

            <div className="grid grid-cols-2 mb-8 text-sm">
                <div className="space-y-1">
                    <p><span className="font-bold uppercase text-[10px] text-muted-foreground block">Voucher Number</span> <span className="font-black text-lg">{voucherNo}</span></p>
                </div>
                <div className="text-right space-y-1">
                    <p><span className="font-bold uppercase text-[10px] text-muted-foreground block">Date (BS)</span> <span className="font-black">{toNepaliDate(date)}</span></p>
                    <p><span className="text-[10px] text-muted-foreground">({format(new Date(date), 'PPP')})</span></p>
                </div>
            </div>

            <div className="space-y-10 flex-1">
                <section>
                    <h3 className="text-xs font-black uppercase tracking-widest mb-2 flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                        Received Payments (Inflow)
                    </h3>
                    <Table className="border border-black/10">
                        <TableHeader className="bg-muted/10 border-b border-black/10">
                            <TableRow className="hover:bg-transparent h-8">
                                <TableHead className="text-[10px] font-bold uppercase text-black w-10 text-center">S.N.</TableHead>
                                <TableHead className="text-[10px] font-bold uppercase text-black">Source / Party Name</TableHead>
                                <TableHead className="text-[10px] font-bold uppercase text-black">Narration</TableHead>
                                <TableHead className="text-[10px] font-bold uppercase text-black text-right pr-4">Amount (रु)</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {received.map((e, i) => (
                                <TableRow key={e.id} className="h-9 border-b border-black/5 hover:bg-transparent">
                                    <TableCell className="text-center font-bold text-muted-foreground">{i + 1}</TableCell>
                                    <TableCell className="font-black uppercase tracking-tight">{e.partyName}</TableCell>
                                    <TableCell className="italic text-muted-foreground">{e.description || '—'}</TableCell>
                                    <TableCell className="text-right font-black tabular-nums pr-4">{e.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                        <TableFooter className="bg-emerald-50/30 border-t border-black/10">
                            <TableRow className="h-10 hover:bg-transparent">
                                <TableCell colSpan={3} className="text-right text-[10px] font-black uppercase tracking-widest text-emerald-800">Section Subtotal</TableCell>
                                <TableCell className="text-right font-black text-emerald-700 pr-4">Rs. {totalReceived.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                            </TableRow>
                        </TableFooter>
                    </Table>
                </section>

                <section>
                    <h3 className="text-xs font-black uppercase tracking-widest mb-2 flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-red-600" />
                        Outflow Payments (Expenses)
                    </h3>
                    <Table className="border border-black/10">
                        <TableHeader className="bg-muted/10 border-b border-black/10">
                            <TableRow className="hover:bg-transparent h-8">
                                <TableHead className="text-[10px] font-bold uppercase text-black w-10 text-center">S.N.</TableHead>
                                <TableHead className="text-[10px] font-bold uppercase text-black">Beneficiary / Party Name</TableHead>
                                <TableHead className="text-[10px] font-bold uppercase text-black">Narration</TableHead>
                                <TableHead className="text-[10px] font-bold uppercase text-black text-right pr-4">Amount (रु)</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {outflows.map((e, i) => (
                                <TableRow key={e.id} className="h-9 border-b border-black/5 hover:bg-transparent">
                                    <TableCell className="text-center font-bold text-muted-foreground">{i + 1}</TableCell>
                                    <TableCell className="font-black uppercase tracking-tight">{e.partyName}</TableCell>
                                    <TableCell className="italic text-muted-foreground">{e.description || '—'}</TableCell>
                                    <TableCell className="text-right font-black tabular-nums pr-4">{e.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                        <TableFooter className="bg-red-50/30 border-t border-black/10">
                            <TableRow className="h-10 hover:bg-transparent">
                                <TableCell colSpan={3} className="text-right text-[10px] font-black uppercase tracking-widest text-red-800">Section Subtotal</TableCell>
                                <TableCell className="text-right font-black text-red-700 pr-4">Rs. {totalOutflow.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                            </TableRow>
                        </TableFooter>
                    </Table>
                </section>

                <div className="flex justify-end pt-4">
                    <div className={cn(
                        "border-2 px-8 py-4 text-right rounded-xl shadow-sm min-w-[250px]",
                        netBalance >= 0 ? "border-emerald-600 bg-emerald-50/20" : "border-red-600 bg-red-50/20"
                    )}>
                        <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mb-1">Final Net Balance</p>
                        <p className={cn("text-2xl font-black tabular-nums", netBalance >= 0 ? "text-emerald-800" : "text-red-800")}>
                            Rs. {netBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </p>
                    </div>
                </div>
            </div>

            <footer className="mt-20 pt-8 border-t border-dashed border-gray-200 text-center space-y-2">
                <p className="text-[9px] font-black uppercase tracking-[0.3em] text-muted-foreground">End of Record &bull; Verified via StarSutra Intelligence</p>
                <p className="text-[8px] italic text-muted-foreground">Computer-generated report for {companyProfile.nameEn}. Valid without manual signature.</p>
            </footer>
        </div>
    );
}

export default function PaymentTrackerPage() {
    const { user } = useAuth();
    const { toast } = useToast();
    const reportRef = useRef<HTMLDivElement>(null);
    
    const [activeTab, setActiveTab] = useState('tracker');
    const [savedEntries, setSavedEntries] = useState<PaymentTrackerEntry[]>([]);
    const [shivamProfile, setShivamProfile] = useState<CompanyProfile>(DEFAULT_COMPANY_PROFILE);
    const [isLoading, setIsLoading] = useState(true);
    const [isExporting, setIsExporting] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    
    const [voucherNo, setVoucherNo] = useState('');
    const [entryDate, setEntryDate] = useState<Date>(new Date());
    const [isEditing, setIsEditing] = useState(false);
    const [editingSourceVoucherNo, setEditingSourceVoucherNo] = useState<string | null>(null);
    
    const [draftEntries, setDraftEntries] = useState<DraftEntry[]>([
        { id: generateId(), type: 'Received', partyName: '', description: '', amount: '' },
        { id: generateId(), type: 'Outflow', partyName: '', description: '', amount: '' }
    ]);

    const [searchQuery, setSearchQuery] = useState('');
    const [historyDateRange, setHistoryDateRange] = useState<DateRange | undefined>(undefined);

    const [deletingVoucherNo, setDeletingVoucherNo] = useState<string | null>(null);
    const [pendingEditVoucherNo, setPendingEditVoucherNo] = useState<string | null>(null);
    const [isReportDialogOpen, setIsReportDialogOpen] = useState(false);
    const [reportingVoucherNo, setReportingVoucherNo] = useState<string | null>(null);

    useEffect(() => {
        const unsubs = [
            onPaymentEntriesUpdate((data) => {
                setSavedEntries(data);
                setIsLoading(false);
            }),
            onSettingUpdate('companyProfile', (s) => {
                if (s?.value) setShivamProfile(s.value);
            })
        ];
        return () => unsubs.forEach(u => u());
    }, []);

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

    const resetDraft = () => {
        setDraftEntries([
            { id: generateId(), type: 'Received', partyName: '', description: '', amount: '' },
            { id: generateId(), type: 'Outflow', partyName: '', description: '', amount: '' }
        ]);
        setIsEditing(false);
        setEditingSourceVoucherNo(null);
    };

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
            toast({ title: 'Validation Error', description: 'Enter at least one valid entry.', variant: 'destructive' });
            return;
        }

        setIsSaving(true);
        try {
            const payload = {
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
            };

            if (isEditing && editingSourceVoucherNo) {
                await replacePaymentVoucher(editingSourceVoucherNo, payload);
            } else {
                await savePaymentVoucher(payload);
            }

            toast({ title: isEditing ? 'Voucher Updated' : 'Voucher Saved', description: `Voucher ${voucherNo} archived.` });
            
            resetDraft();
            setActiveTab('history');
        } catch (error) {
            toast({ title: 'Error', description: 'Failed to save voucher.', variant: 'destructive' });
        } finally {
            setIsSaving(false);
        }
    };

    const summarizedHistory = useMemo(() => {
        let filtered = [...savedEntries];
        
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            filtered = filtered.filter(e => 
                e.partyName.toLowerCase().includes(q) || 
                (e.description || '').toLowerCase().includes(q) ||
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

        const groups = new Map<string, SummarizedVoucher>();
        
        filtered.forEach(e => {
            const key = e.voucherNo || 'N/A';
            const group = groups.get(key) || { 
                voucherNo: key, 
                date: e.date, 
                totalReceived: 0,
                totalPayment: 0,
                netAmount: 0,
                entriesCount: 0 
            };
            
            if (e.type === 'Received') {
                group.totalReceived += e.amount;
                group.netAmount += e.amount;
            } else {
                group.totalPayment += e.amount;
                group.netAmount -= e.amount;
            }
            
            group.entriesCount++;
            groups.set(key, group);
        });

        return Array.from(groups.values()).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [savedEntries, searchQuery, historyDateRange]);

    const loadVoucherForEdit = (vNo: string) => {
        const voucherEntries = savedEntries.filter(e => e.voucherNo === vNo);
        if (voucherEntries.length === 0) return;

        const drafts: DraftEntry[] = voucherEntries.map(e => ({
            id: e.id,
            type: e.type,
            partyName: e.partyName,
            description: e.description,
            amount: String(e.amount)
        }));

        setDraftEntries(drafts);
        setVoucherNo(vNo);
        setEntryDate(new Date(voucherEntries[0].date));
        setIsEditing(true);
        setEditingSourceVoucherNo(vNo);
        setActiveTab('tracker');
    };

    const handleEditHistorical = (vNo: string) => {
        if (isEditing && editingSourceVoucherNo && editingSourceVoucherNo !== vNo) {
            setPendingEditVoucherNo(vNo);
            return;
        }
        loadVoucherForEdit(vNo);
    };

    const handleDeleteHistorical = async () => {
        if (!deletingVoucherNo || deletingVoucherNo === 'N/A') {
            setDeletingVoucherNo(null);
            return;
        }
        try {
            await deletePaymentVoucher(deletingVoucherNo);
            toast({ title: 'Voucher Deleted' });
            setDeletingVoucherNo(null);
        } catch {
            toast({ title: 'Delete Failed', variant: 'destructive' });
        }
    };

    const handleExportVoucherPdf = async () => {
        if (!reportingVoucherNo) return;
        setIsExporting(true);
        try {
            const { jsPDF } = await import('jspdf');
            const { default: autoTable } = await import('jspdf-autotable');
            const voucherEntries = savedEntries.filter(e => e.voucherNo === reportingVoucherNo);
            const dateStr = voucherEntries[0]?.date ? toNepaliDate(voucherEntries[0].date) : 'N/A';
            
            const doc = new jsPDF();
            doc.setFontSize(16);
            doc.text(shivamProfile.nameEn.toUpperCase(), 14, 15);
            doc.setFontSize(10);
            doc.text(`DAILY PAYMENT TRACKER LEDGER: ${reportingVoucherNo}`, 14, 22);
            doc.text(`Date: ${dateStr} BS`, 14, 28);
            
            autoTable(doc, {
                startY: 35,
                head: [['Type', 'Party / Source', 'Description', 'Amount (रु)']],
                body: voucherEntries.map(e => [
                    e.type, 
                    e.partyName, 
                    e.description || '-', 
                    e.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })
                ])
            });

            doc.save(`Ledger-${reportingVoucherNo}.pdf`);
            toast({ title: 'PDF Downloaded' });
        } catch {
            toast({ title: 'PDF Export Failed', variant: 'destructive' });
        } finally {
            setIsExporting(false);
        }
    };

    const handleExportVoucherImage = async () => {
        if (!reportRef.current) return;
        setIsExporting(true);
        try {
            const html2canvas = (await import('html2canvas')).default;
            const canvas = await html2canvas(reportRef.current, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
            const link = document.createElement('a');
            link.download = `Ledger-${reportingVoucherNo}.jpg`;
            link.href = canvas.toDataURL('image/jpeg', 0.9);
            link.click();
            toast({ title: 'Image Exported' });
        } catch {
            toast({ title: 'Image Export Failed', variant: 'destructive' });
        } finally {
            setIsExporting(false);
        }
    };

    const executePrintVoucher = () => {
        const win = window.open('', '', 'height=800,width=1000');
        if (!win) {
            toast({ title: 'Popup Blocked', description: 'Allow popups for this site to print.', variant: 'destructive' });
            return;
        }
        
        const styleTags = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
            .map(node => node.outerHTML)
            .join('\n');

        win.document.write(`<!DOCTYPE html><html><head><title>Print Ledger</title>${styleTags}
            <style>
                @page { size: A4; margin: 0; }
                body { margin: 0; padding: 0; background: #fff; }
                .po-report { border: none !important; box-shadow: none !important; }
            </style>
        </head><body>${reportRef.current?.innerHTML}</body></html>`);
        win.document.close();
        win.focus();
        setTimeout(() => {
            win.print();
            win.close();
        }, 500);
    };

    const receivedDrafts = draftEntries.filter(e => e.type === 'Received');
    const outflowDrafts = draftEntries.filter(e => e.type === 'Outflow');

    return (
        <div className="flex flex-col gap-6">
            <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 print:hidden">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Payment Tracker</h1>
                    <p className="text-muted-foreground text-sm">Daily cash flow and voucher archiving</p>
                </div>
            </header>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="bg-muted/50 p-1 mb-4 h-10 border">
                    <TabsTrigger value="tracker" className="gap-2 px-6 text-[11px] font-black uppercase tracking-widest data-[state=active]:bg-white data-[state=active]:shadow-sm">
                        <Calculator className="h-4 w-4" />
                        Workspace {isEditing && <Badge className="ml-1 bg-amber-500 text-black border-none text-[9px] h-4">Editing</Badge>}
                    </TabsTrigger>
                    <TabsTrigger value="history" className="gap-2 px-6 text-[11px] font-black uppercase tracking-widest data-[state=active]:bg-white data-[state=active]:shadow-sm">
                        <History className="h-4 w-4" />
                        History
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="tracker" className="space-y-6 animate-in fade-in duration-300">
                    <div className="bg-white p-4 rounded-xl border shadow-sm flex flex-col md:flex-row gap-4 md:gap-6 md:items-center">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-muted/50 rounded-lg"><Hash className="h-4 w-4 text-primary"/></div>
                            <div className="space-y-0.5">
                                <Label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">Voucher No.</Label>
                                <p className="font-black text-[14px] text-gray-900 font-mono leading-none">{voucherNo}</p>
                            </div>
                        </div>
                        <Separator orientation="vertical" className="h-10 hidden md:block" />
                        <div className="flex items-center gap-3">
                            <div className="space-y-0.5">
                                <Label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">Date (BS)</Label>
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <Button variant="outline" className="w-[180px] justify-start text-left font-normal bg-white h-9">
                                            <CalendarIconLucide className="mr-2 h-4 w-4 opacity-50 text-primary" />
                                            <span className="font-black text-[14px] truncate leading-none">
                                                {toNepaliDate(entryDate.toISOString())}
                                            </span>
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0" align="start">
                                        <DualCalendar selected={entryDate} onSelect={d => d && setEntryDate(d)} />
                                    </PopoverContent>
                                </Popover>
                            </div>
                        </div>
                        <div className="flex-1 flex justify-end gap-2 flex-wrap">
                            {isEditing && (
                                <Button variant="ghost" size="sm" onClick={resetDraft} className="h-9 px-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:bg-muted">
                                    Discard Changes
                                </Button>
                            )}
                            <Button variant="outline" size="sm" onClick={() => { setReportingVoucherNo(voucherNo); setIsReportDialogOpen(true); }} className="h-9 px-4 text-[10px] font-black uppercase tracking-widest border-gray-300">
                                <Eye className="h-4 w-4 mr-2 text-primary" /> Preview
                            </Button>
                            <Button onClick={handleFinalizeVoucher} disabled={isSaving} className="h-9 px-6 text-[10px] font-black uppercase tracking-widest shadow-lg shadow-primary/20">
                                {isSaving ? <Loader2 className="animate-spin h-4 w-4 mr-2"/> : <Save className="mr-2 h-4 w-4" />} {isEditing ? 'Update Voucher' : 'Save Voucher'}
                            </Button>
                        </div>
                    </div>

                    <Card className="shadow-sm border-gray-200 bg-white overflow-hidden">
                        <CardContent className="p-0">
                            <ScrollArea className="w-full">
                                <Table className="border-collapse table-fixed w-full min-w-[800px]">
                                    <TableHeader>
                                        <TableRow className="bg-emerald-50/70 hover:bg-emerald-50/70 h-[24px] border-b">
                                            <TableHead colSpan={5} className="px-4 py-0 align-middle">
                                                <div className="flex items-center justify-between w-full">
                                                    <span className="text-[11px] font-black uppercase tracking-wider text-emerald-800 flex items-center gap-2">
                                                        <ArrowDownCircle className="h-4 w-4" /> Receipts (Inflow)
                                                    </span>
                                                    <Button variant="ghost" size="sm" onClick={() => handleAddLine('Received')} className="h-5 text-[9px] font-black uppercase tracking-widest text-emerald-700 hover:text-emerald-800 hover:bg-emerald-100/60 p-0 px-2">
                                                        <PlusCircle className="mr-1 h-3 w-3" /> Add Row
                                                    </Button>
                                                </div>
                                            </TableHead>
                                        </TableRow>
                                        <TableRow className="bg-muted/20 h-[18px]">
                                            <TableHead className="w-12 text-center border-r text-[9px] font-black uppercase text-muted-foreground px-2">S.N.</TableHead>
                                            <TableHead className="border-r text-[9px] font-black uppercase text-muted-foreground px-3">Party / Source</TableHead>
                                            <TableHead className="border-r text-[9px] font-black uppercase text-muted-foreground px-3">Description</TableHead>
                                            <TableHead className="text-right text-[9px] font-black uppercase text-muted-foreground px-4 w-[160px]">Amount (रु)</TableHead>
                                            <TableHead className="w-12 px-2 text-center"></TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {receivedDrafts.map((e, i) => (
                                            <TableRow key={e.id} className="h-[22px] border-b group transition-colors hover:bg-muted/10">
                                                <TableCell className="text-center border-r text-[11px] font-bold text-muted-foreground px-2 py-0 leading-none">{i + 1}</TableCell>
                                                <TableCell className="border-r p-0">
                                                    <Input 
                                                        value={e.partyName} 
                                                        onChange={v => handleUpdateLine(e.id, 'partyName', v.target.value)} 
                                                        className="h-full border-none rounded-none text-[14px] px-3 font-black uppercase bg-transparent focus-visible:bg-emerald-50/30 focus-visible:ring-0 leading-none" 
                                                        placeholder="..."
                                                    />
                                                </TableCell>
                                                <TableCell className="border-r p-0">
                                                    <Input 
                                                        value={e.description} 
                                                        onChange={v => handleUpdateLine(e.id, 'description', v.target.value)} 
                                                        className="h-full border-none rounded-none text-[14px] px-3 text-gray-600 bg-transparent focus-visible:bg-emerald-50/30 focus-visible:ring-0 leading-none" 
                                                        placeholder="..."
                                                    />
                                                </TableCell>
                                                <TableCell className="text-right border-r p-0">
                                                    <Input 
                                                        type="number" 
                                                        value={e.amount} 
                                                        onChange={v => handleUpdateLine(e.id, 'amount', v.target.value)} 
                                                        className="h-full border-none rounded-none text-right px-4 font-black text-[14px] tabular-nums bg-transparent focus-visible:bg-emerald-50/30 focus-visible:ring-0 leading-none" 
                                                        placeholder="0"
                                                    />
                                                </TableCell>
                                                <TableCell className="text-center p-0">
                                                    <Button variant="ghost" size="icon" className="h-full w-full rounded-none text-muted-foreground/30 hover:text-destructive" onClick={() => handleRemoveLine(e.id)}>
                                                        <Trash2 className="h-3.5 w-3.5"/>
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                        <TableRow className="bg-muted/10 h-[22px] border-b">
                                            <TableCell className="border-r px-2"></TableCell>
                                            <TableCell colSpan={2} className="text-[10px] font-black uppercase text-gray-500 border-r px-4 text-right align-middle leading-none">Subtotal Inflow</TableCell>
                                            <TableCell className="text-right tabular-nums text-[14px] font-black px-4 border-r align-middle text-emerald-700 leading-none">Rs. {totals.rec.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                            <TableCell />
                                        </TableRow>
                                    </TableBody>

                                    <TableHeader>
                                        <TableRow className="h-[12px] border-none hover:bg-transparent bg-transparent"><TableCell colSpan={5} className="p-0"></TableCell></TableRow>
                                        <TableRow className="bg-red-50/70 hover:bg-red-50/70 h-[24px] border-b">
                                            <TableHead colSpan={5} className="px-4 py-0 align-middle">
                                                <div className="flex items-center justify-between w-full">
                                                    <span className="text-[11px] font-black uppercase tracking-wider text-red-800 flex items-center gap-2">
                                                        <ArrowUpCircle className="h-4 w-4" /> Outflows (Payments)
                                                    </span>
                                                    <Button variant="ghost" size="sm" onClick={() => handleAddLine('Outflow')} className="h-5 text-[9px] font-black uppercase tracking-widest text-red-700 hover:text-red-800 hover:bg-red-100/60 p-0 px-2">
                                                        <PlusCircle className="mr-1 h-3 w-3" /> Add Row
                                                    </Button>
                                                </div>
                                            </TableHead>
                                        </TableRow>
                                        <TableRow className="bg-muted/20 h-[18px]">
                                            <TableHead className="w-12 text-center border-r text-[9px] font-black uppercase text-muted-foreground px-2">S.N.</TableHead>
                                            <TableHead className="border-r text-[9px] font-black uppercase text-muted-foreground px-3">Beneficiary</TableHead>
                                            <TableHead className="border-r text-[9px] font-black uppercase text-muted-foreground px-3">Description</TableHead>
                                            <TableHead className="text-right text-[9px] font-black uppercase text-muted-foreground px-4 w-[160px]">Amount (रु)</TableHead>
                                            <TableHead className="w-12 px-2 text-center"></TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {outflowDrafts.map((e, i) => (
                                            <TableRow key={e.id} className="h-[22px] border-b group transition-colors hover:bg-muted/10">
                                                <TableCell className="text-center border-r text-[11px] font-bold text-muted-foreground px-2 py-0 leading-none">{i + 1}</TableCell>
                                                <TableCell className="border-r p-0">
                                                    <Input 
                                                        value={e.partyName} 
                                                        onChange={v => handleUpdateLine(e.id, 'partyName', v.target.value)} 
                                                        className="h-full border-none rounded-none text-[14px] px-3 font-black uppercase bg-transparent focus-visible:bg-red-50/30 focus-visible:ring-0 leading-none" 
                                                        placeholder="..."
                                                    />
                                                </TableCell>
                                                <TableCell className="border-r p-0">
                                                    <Input 
                                                        value={e.description} 
                                                        onChange={v => handleUpdateLine(e.id, 'description', v.target.value)} 
                                                        className="h-full border-none rounded-none text-[14px] px-3 text-gray-600 bg-transparent focus-visible:bg-red-50/30 focus-visible:ring-0 leading-none" 
                                                        placeholder="..."
                                                    />
                                                </TableCell>
                                                <TableCell className="text-right border-r p-0">
                                                    <Input 
                                                        type="number" 
                                                        value={e.amount} 
                                                        onChange={v => handleUpdateLine(e.id, 'amount', v.target.value)} 
                                                        className="h-full border-none rounded-none text-right px-4 font-black text-[14px] tabular-nums bg-transparent focus-visible:bg-red-50/30 focus-visible:ring-0 leading-none" 
                                                        placeholder="0"
                                                    />
                                                </TableCell>
                                                <TableCell className="text-center p-0">
                                                    <Button variant="ghost" size="icon" className="h-full w-full rounded-none text-muted-foreground/30 hover:text-destructive" onClick={() => handleRemoveLine(e.id)}>
                                                        <Trash2 className="h-3.5 w-3.5"/>
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                        <TableRow className="bg-muted/10 h-[22px] border-b">
                                            <TableCell className="border-r px-2"></TableCell>
                                            <TableCell colSpan={2} className="text-[10px] font-black uppercase text-gray-500 border-r px-4 text-right align-middle leading-none">Subtotal Outflow</TableCell>
                                            <TableCell className="text-right tabular-nums text-[14px] font-black px-4 border-r align-middle text-red-700 leading-none">Rs. {totals.pay.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                            <TableCell />
                                        </TableRow>
                                    </TableBody>

                                    <TableFooter>
                                        <TableRow className="h-[12px] border-none hover:bg-transparent bg-transparent"><TableCell colSpan={5} className="p-0"></TableCell></TableRow>
                                        <TableRow className={cn(
                                            "h-[32px] border-t-2 hover:bg-transparent",
                                            totals.net >= 0 ? "bg-emerald-50/70 border-emerald-200" : "bg-amber-50/70 border-amber-200"
                                        )}>
                                            <TableCell className="border-r"></TableCell>
                                            <TableCell colSpan={2} className={cn(
                                                "text-[11px] font-black uppercase tracking-widest px-6 align-middle leading-none",
                                                totals.net >= 0 ? "text-emerald-800" : "text-amber-800"
                                            )}>Final Net Daily Balance</TableCell>
                                            <TableCell className={cn(
                                                "text-right tabular-nums text-[18px] px-4 font-black border-r align-middle leading-none",
                                                totals.net >= 0 ? "text-emerald-700" : "text-amber-700"
                                            )}>
                                                Rs. {totals.net.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                            </TableCell>
                                            <TableCell />
                                        </TableRow>
                                    </TableFooter>
                                </Table>
                                <ScrollBar orientation="horizontal" />
                            </ScrollArea>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="history" className="animate-in fade-in duration-300">
                    <div className="bg-white p-4 rounded-xl border shadow-sm mb-4 flex flex-col md:flex-row gap-4 md:gap-6 md:items-center">
                        <div className="flex items-center gap-3">
                            <Label className="text-[10px] font-black uppercase text-muted-foreground whitespace-nowrap">Audit Period</Label>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button variant="outline" className="w-[240px] justify-start text-left font-normal bg-white h-9">
                                        <CalendarIconLucide className="mr-2 h-4 w-4 opacity-50 text-primary" />
                                        <span className="font-black text-[12px] truncate uppercase leading-none">
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
                                    placeholder="Search voucher, party or note..." 
                                    className="pl-9 h-9 bg-white text-[12px] border-gray-200" 
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                />
                            </div>
                        </div>
                        {(searchQuery || historyDateRange) && (
                            <Button variant="ghost" size="sm" onClick={() => { setSearchQuery(''); setHistoryDateRange(undefined); }} className="h-9 text-muted-foreground text-[10px] font-black uppercase tracking-widest hover:bg-muted">
                                <FilterX className="mr-1.5 h-3.5 w-3.5" /> Clear
                            </Button>
                        )}
                    </div>

                    <Card className="shadow-sm border-gray-100 bg-white overflow-hidden">
                        <CardContent className="p-0">
                            <Table className="table-fixed w-full">
                                <TableHeader className="bg-muted/30 border-b">
                                    <TableRow className="h-[24px]">
                                        <TableHead className="pl-6 text-[10px] font-black uppercase text-muted-foreground tracking-widest w-[160px]">Date (BS)</TableHead>
                                        <TableHead className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Voucher Reference</TableHead>
                                        <TableHead className="text-right text-[10px] font-black uppercase text-muted-foreground tracking-widest w-[180px]">Total Payment</TableHead>
                                        <TableHead className="text-right pr-6 text-[10px] font-black uppercase text-muted-foreground tracking-widest w-[120px]">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {isLoading ? (
                                        <TableRow><TableCell colSpan={4} className="py-20 text-center"><Loader2 className="h-8 w-8 animate-spin mx-auto opacity-20" /></TableCell></TableRow>
                                    ) : summarizedHistory.map(v => (
                                        <TableRow key={v.voucherNo} className="h-[22px] border-b hover:bg-muted/10 transition-colors group">
                                            <TableCell className="pl-6 text-gray-500 font-mono text-[12px] font-bold">{toNepaliDate(v.date)}</TableCell>
                                            <TableCell className="font-black text-primary text-[14px] tracking-tight">{v.voucherNo}</TableCell>
                                            <TableCell className="text-right tabular-nums text-red-700 font-black text-[14px]">
                                                Rs. {v.totalPayment.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                            </TableCell>
                                            <TableCell className="text-right pr-6">
                                                <div className="flex justify-end gap-1 opacity-100 lg:opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-primary" onClick={() => { setReportingVoucherNo(v.voucherNo); setIsReportDialogOpen(true); }} title="Print Preview">
                                                        <FileText className="h-3.5 w-3.5" />
                                                    </Button>
                                                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-primary" onClick={() => handleEditHistorical(v.voucherNo)} title="Edit Document">
                                                        <Edit className="h-3.5 w-3.5" />
                                                    </Button>
                                                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => setDeletingVoucherNo(v.voucherNo)} title="Delete Ledger">
                                                        <Trash2 className="h-3.5 w-3.5" />
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {!isLoading && summarizedHistory.length === 0 && (
                                        <TableRow><TableCell colSpan={4} className="py-32 text-center text-muted-foreground uppercase font-black text-[10px] tracking-widest opacity-30 italic">No records found matching criteria.</TableCell></TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            <AlertDialog open={!!deletingVoucherNo} onOpenChange={(open) => !open && setDeletingVoucherNo(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle className="font-black uppercase tracking-tight">Delete Voucher?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will permanently remove voucher <span className="font-bold text-gray-900">{deletingVoucherNo}</span> and every associated transaction. This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel className="text-[10px] font-black uppercase tracking-widest">Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDeleteHistorical} className="bg-destructive text-destructive-foreground hover:bg-destructive/90 text-[10px] font-black uppercase tracking-widest">
                            Delete Voucher
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <AlertDialog open={!!pendingEditVoucherNo} onOpenChange={(open) => !open && setPendingEditVoucherNo(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle className="font-black uppercase tracking-tight">Discard Current Workspace?</AlertDialogTitle>
                        <AlertDialogDescription>
                            You are already editing <span className="font-bold text-gray-900">{editingSourceVoucherNo}</span> with unsaved changes. Loading <span className="font-bold text-gray-900">{pendingEditVoucherNo}</span> will discard your current draft.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel className="text-[10px] font-black uppercase tracking-widest">Stay Here</AlertDialogCancel>
                        <AlertDialogAction 
                            onClick={() => { if (pendingEditVoucherNo) loadVoucherForEdit(pendingEditVoucherNo); setPendingEditVoucherNo(null); }} 
                            className="text-[10px] font-black uppercase tracking-widest"
                        >
                            Discard & Load
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <Dialog open={isReportDialogOpen} onOpenChange={setIsReportDialogOpen}>
                <DialogContent className="max-w-[240mm] h-[95vh] flex flex-col p-0 border-none shadow-2xl overflow-hidden bg-neutral-100">
                    <DialogHeader className="p-6 border-b bg-white shrink-0">
                        <div className="flex items-center justify-between">
                            <div>
                                <DialogTitle className="text-xl font-black uppercase tracking-tight flex items-center gap-2">
                                    <FileText className="h-5 w-5 text-primary"/>
                                    Voucher Report Preview
                                </DialogTitle>
                                <DialogDescription className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                                    A4 Template &bull; {reportingVoucherNo}
                                </DialogDescription>
                            </div>
                            <Button variant="ghost" size="icon" onClick={() => setIsReportDialogOpen(false)}><X className="h-5 w-5"/></Button>
                        </div>
                    </DialogHeader>

                    <ScrollArea className="flex-1 p-10">
                        <div ref={reportRef} className="mx-auto shadow-[0_20px_50px_rgba(0,0,0,0.2)] ring-1 ring-black/10 bg-white">
                            {reportingVoucherNo && (
                                <VoucherReportView 
                                    voucherNo={reportingVoucherNo}
                                    date={activeTab === 'tracker' ? entryDate.toISOString() : (savedEntries.find(e => e.voucherNo === reportingVoucherNo)?.date || new Date().toISOString())}
                                    entries={activeTab === 'tracker' 
                                        ? draftEntries.filter(e => e.partyName.trim() !== '').map(e => ({ ...e, amount: parseFloat(e.amount) || 0 })) as any 
                                        : savedEntries.filter(e => e.voucherNo === reportingVoucherNo)
                                    }
                                    companyProfile={shivamProfile}
                                />
                            )}
                        </div>
                        <ScrollBar orientation="horizontal" />
                        <ScrollBar orientation="vertical" />
                    </ScrollArea>

                    <DialogFooter className="p-6 bg-white border-t shrink-0">
                        <div className="flex w-full justify-between items-center flex-wrap gap-3">
                            <div className="flex gap-2">
                                <Button variant="outline" onClick={handleExportVoucherImage} disabled={isExporting} className="h-10 px-6 font-black text-[10px] uppercase tracking-widest border-gray-300">
                                    {isExporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <ImageIcon className="mr-2 h-4 w-4 text-blue-600"/>}
                                    Save Image
                                </Button>
                                <Button variant="outline" onClick={handleExportVoucherPdf} disabled={isExporting} className="h-10 px-6 font-black text-[10px] uppercase tracking-widest border-gray-300">
                                    {isExporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <FileDown className="mr-2 h-4 w-4 text-red-600"/>}
                                    Save PDF
                                </Button>
                            </div>
                            <div className="flex gap-2">
                                <Button variant="secondary" onClick={() => setIsReportDialogOpen(false)} className="h-10 px-6 font-black text-[10px] uppercase tracking-widest">Close</Button>
                                <Button onClick={executePrintVoucher} className="h-10 px-10 font-black text-[10px] uppercase tracking-widest shadow-lg shadow-primary/20">
                                    <Printer className="mr-2 h-4 w-4" /> Direct Print
                                </Button>
                            </div>
                        </div>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
