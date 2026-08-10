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
    MoreHorizontal,
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
    addPaymentEntry, 
    updatePaymentEntry, 
    deletePaymentEntry,
    deletePaymentVoucher,
    savePaymentVoucher 
} from '@/services/payment-tracker-service';
import { onSettingUpdate } from '@/services/settings-service';
import type { PaymentTrackerEntry, CompanyProfile } from '@/lib/types';
import { cn, toNepaliDate, generateId, generateNextPaymentTrackerNumber, toWords } from '@/lib/utils';
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
import { DEFAULT_FLEET_PROFILE } from '@/lib/constants';

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
    totalPayment: number; // Sum of Outflow only
    totalReceived: number; // Sum of Received only
    netAmount: number; // Balance
    entriesCount: number;
}

/**
 * Formalized Report View Component for Vouchers
 */
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
                <p className="text-sm font-bold">{companyProfile.address}</p>
                {companyProfile.pan && <p className="text-[10px] font-mono mt-0.5">PAN: {companyProfile.pan}</p>}
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
                {/* Received Section */}
                <section>
                    <h3 className="text-xs font-black uppercase tracking-widest mb-2 flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                        Received Payments (Inflow)
                    </h3>
                    <Table className="border border-black/10">
                        <TableHeader className="bg-muted/10 border-b border-black/10">
                            <TableRow className="hover:bg-transparent h-8">
                                <TableHead className="text-[10px] font-black uppercase text-black w-10 text-center">S.N.</TableHead>
                                <TableHead className="text-[10px] font-black uppercase text-black">Source / Party Name</TableHead>
                                <TableHead className="text-[10px] font-black uppercase text-black">Narration</TableHead>
                                <TableHead className="text-[10px] font-black uppercase text-black text-right pr-4">Amount (रु)</TableHead>
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
                            {received.length === 0 && (
                                <TableRow><TableCell colSpan={4} className="h-10 text-center italic text-muted-foreground">No receipts recorded.</TableCell></TableRow>
                            )}
                        </TableBody>
                        <TableFooter className="bg-emerald-50/30 border-t border-black/10">
                            <TableRow className="h-10 hover:bg-transparent">
                                <TableCell colSpan={3} className="text-right text-[10px] font-black uppercase tracking-widest text-emerald-800">Section Subtotal</TableCell>
                                <TableCell className="text-right font-black text-emerald-700 pr-4">Rs. {totalReceived.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                            </TableRow>
                        </TableFooter>
                    </Table>
                </section>

                {/* Outflow Section */}
                <section>
                    <h3 className="text-xs font-black uppercase tracking-widest mb-2 flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-red-600" />
                        Outflow Payments (Expenses)
                    </h3>
                    <Table className="border border-black/10">
                        <TableHeader className="bg-muted/10 border-b border-black/10">
                            <TableRow className="hover:bg-transparent h-8">
                                <TableHead className="text-[10px] font-black uppercase text-black w-10 text-center">S.N.</TableHead>
                                <TableHead className="text-[10px] font-black uppercase text-black">Beneficiary / Party Name</TableHead>
                                <TableHead className="text-[10px] font-black uppercase text-black">Narration</TableHead>
                                <TableHead className="text-[10px] font-black uppercase text-black text-right pr-4">Amount (रु)</TableHead>
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
                            {outflows.length === 0 && (
                                <TableRow><TableCell colSpan={4} className="h-10 text-center italic text-muted-foreground">No outflows recorded.</TableCell></TableRow>
                            )}
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
                <p className="text-[8px] italic text-muted-foreground">Computer-generated report. Valid without manual signature.</p>
            </footer>
        </div>
    );
}

export default function PaymentTrackerPage() {
    const { user } = useAuth();
    const { toast } = useToast();
    const printableRef = useRef<HTMLDivElement>(null);
    const reportRef = useRef<HTMLDivElement>(null);
    
    const [activeTab, setActiveTab] = useState('tracker');
    const [savedEntries, setSavedEntries] = useState<PaymentTrackerEntry[]>([]);
    const [fleetProfile, setFleetProfile] = useState<CompanyProfile>(DEFAULT_FLEET_PROFILE);
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
    const [deletingVoucherNo, setDeletingVoucherNo] = useState<string | null>(null);
    const [isReportDialogOpen, setIsReportDialogOpen] = useState(false);
    const [reportingVoucherNo, setReportingVoucherNo] = useState<string | null>(null);

    useEffect(() => {
        const unsubs = [
            onPaymentEntriesUpdate((data) => {
                setSavedEntries(data);
                setIsLoading(false);
            }),
            onSettingUpdate('fleetCompanyProfile', (s) => {
                if (s?.value) setFleetProfile(s.value);
            })
        ];
        return () => unsubs.forEach(u => u());
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
            if (isEditing) {
                await deletePaymentVoucher(voucherNo);
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

    const summarizedHistory = useMemo(() => {
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

    const handleEditHistorical = (voucherNo: string) => {
        const voucherEntries = savedEntries.filter(e => e.voucherNo === voucherNo);
        if (voucherEntries.length === 0) return;

        const drafts: DraftEntry[] = voucherEntries.map(e => ({
            id: e.id,
            type: e.type,
            partyName: e.partyName,
            description: e.description,
            amount: String(e.amount)
        }));

        setDraftEntries(drafts);
        setVoucherNo(voucherNo);
        setEntryDate(new Date(voucherEntries[0].date));
        setIsEditing(true);
        setActiveTab('tracker');
        toast({ title: 'Workspace Loaded', description: `Voucher ${voucherNo} is ready for modifications.` });
    };

    const handleDeleteHistorical = async () => {
        if (!deletingVoucherNo) return;
        try {
            await deletePaymentVoucher(deletingVoucherNo);
            toast({ title: 'Voucher Deleted', description: `All entries for ${deletingVoucherNo} removed.` });
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
            doc.text(fleetProfile.nameEn.toUpperCase(), 14, 15);
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
        if (!win) return;
        
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

    const handleClearFilters = () => {
        setSearchQuery('');
        setHistoryDateRange(undefined);
    };

    const receivedDrafts = draftEntries.filter(e => e.type === 'Received');
    const outflowDrafts = draftEntries.filter(e => e.type === 'Outflow');

    return (
        <div className="flex flex-col gap-6">
            <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 print:hidden">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 tracking-tight uppercase">Payment Tracker</h1>
                    <p className="text-muted-foreground text-sm font-medium italic">High-density daily cash flow and ledger archiving.</p>
                </div>
            </header>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="bg-muted/50 p-1 mb-4 h-11 border">
                    <TabsTrigger value="tracker" className="gap-2 px-8 py-2 font-bold text-[10px] uppercase tracking-widest data-[state=active]:bg-white data-[state=active]:shadow-sm">
                        <Calculator className="h-4 w-4" />
                        Live Workspace {isEditing && <Badge className="ml-2 bg-amber-500 text-black border-none text-[8px] h-4 uppercase font-black">Edit Mode</Badge>}
                    </TabsTrigger>
                    <TabsTrigger value="history" className="gap-2 px-8 py-2 font-bold text-[10px] uppercase tracking-widest data-[state=active]:bg-white data-[state=active]:shadow-sm">
                        <History className="h-4 w-4" />
                        Historical Registry
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="tracker" className="space-y-6 animate-in fade-in slide-in-from-left-2 duration-300">
                    <div className="bg-white p-4 rounded-xl border shadow-sm flex flex-col md:flex-row gap-4 md:gap-6 md:items-center">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-muted/50 rounded-lg"><Hash className="h-4 w-4 text-primary"/></div>
                            <div className="space-y-0.5">
                                <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest px-1">Tracking ID</Label>
                                <p className="font-black text-sm text-gray-900 font-mono pl-1">{voucherNo}</p>
                            </div>
                        </div>
                        <Separator orientation="vertical" className="h-10 hidden md:block" />
                        <div className="flex items-center gap-3">
                            <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Period (BS)</Label>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button variant="outline" className="w-[200px] justify-start text-left font-normal bg-white h-10 border-2">
                                        <CalendarIconLucide className="mr-2 h-4 w-4 opacity-50 text-primary" />
                                        <span className="font-bold text-xs truncate">
                                            {toNepaliDate(entryDate.toISOString())}
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
                                <Button variant="ghost" size="sm" onClick={() => { setIsEditing(false); setDraftEntries([{ id: generateId(), type: 'Received', partyName: '', description: '', amount: '' }, { id: generateId(), type: 'Outflow', partyName: '', description: '', amount: '' }]); }} className="h-10 px-4 text-xs font-black uppercase text-muted-foreground hover:bg-muted">
                                    Discard Changes
                                </Button>
                            )}
                            <Button variant="outline" size="sm" onClick={() => { setReportingVoucherNo(voucherNo); setIsReportDialogOpen(true); }} className="h-10 px-6 text-xs font-bold uppercase border-2">
                                <Eye className="h-4 w-4 mr-2 text-primary" /> Preview Report
                            </Button>
                            <Button onClick={handleFinalizeVoucher} disabled={isSaving} className="h-10 px-8 text-xs font-black uppercase tracking-widest shadow-xl shadow-primary/20">
                                {isSaving ? <Loader2 className="animate-spin h-4 w-4 mr-2"/> : <Save className="mr-2 h-4 w-4" />} {isEditing ? 'Sync Changes' : 'Commit to Registry'}
                            </Button>
                        </div>
                    </div>

                    <div ref={printableRef} className="space-y-4">
                        <Card className="shadow-sm border-gray-200 bg-white overflow-hidden">
                            <CardContent className="p-0">
                                <ScrollArea className="w-full">
                                    <Table className="border-collapse table-fixed w-full min-w-[800px]">
                                        <TableHeader>
                                            <TableRow className="bg-muted/10 hover:bg-muted/10 h-10 border-b">
                                                <TableHead colSpan={5} className="px-4 align-middle">
                                                    <div className="flex items-center justify-between w-full">
                                                        <span className="text-[10px] font-black uppercase tracking-widest text-emerald-800 flex items-center gap-2">
                                                            <ArrowDownCircle className="h-3.5 w-3.5" /> Received Entry (Inflow)
                                                        </span>
                                                        <Button variant="ghost" size="sm" onClick={() => handleAddLine('Received')} className="h-7 text-[9px] font-black uppercase text-emerald-700 tracking-widest hover:bg-emerald-100/60 border border-emerald-200 bg-white shadow-sm px-3">
                                                            <PlusCircle className="mr-1.5 h-3 w-3" /> Append Receipt
                                                        </Button>
                                                    </div>
                                                </TableHead>
                                            </TableRow>
                                            <TableRow className="bg-muted/20 h-[18px]">
                                                <TableHead className="w-12 text-center border-r text-[9px] font-black uppercase px-2">#</TableHead>
                                                <TableHead className="border-r text-[9px] font-black uppercase px-3">Party / Cash Source</TableHead>
                                                <TableHead className="border-r text-[9px] font-black uppercase px-3">Description / Note</TableHead>
                                                <TableHead className="text-right text-[9px] font-black uppercase px-4 w-[180px]">Amount (NPR)</TableHead>
                                                <TableHead className="w-10 px-2 text-center"></TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {receivedDrafts.map((e, i) => (
                                                <TableRow key={e.id} className="h-[18px] border-b group transition-colors hover:bg-muted/10">
                                                    <TableCell className="text-center border-r text-[14px] font-black text-muted-foreground px-2 py-0 leading-none">{i + 1}</TableCell>
                                                    <TableCell className="border-r p-0">
                                                        <Input 
                                                            value={e.partyName} 
                                                            onChange={v => handleUpdateLine(e.id, 'partyName', v.target.value)} 
                                                            className="h-[24px] border-none rounded-none text-[14px] px-3 font-bold bg-transparent focus-visible:bg-blue-50/30 focus-visible:ring-1 focus-visible:ring-inset" 
                                                            placeholder="Entity name"
                                                        />
                                                    </TableCell>
                                                    <TableCell className="border-r p-0">
                                                        <Input 
                                                            value={e.description} 
                                                            onChange={v => handleUpdateLine(e.id, 'description', v.target.value)} 
                                                            className="h-[24px] border-none rounded-none text-[14px] px-3 text-gray-600 bg-transparent focus-visible:bg-blue-50/30 focus-visible:ring-1 focus-visible:ring-inset" 
                                                            placeholder="..."
                                                        />
                                                    </TableCell>
                                                    <TableCell className="text-right border-r p-0">
                                                        <Input 
                                                            type="number" 
                                                            value={e.amount} 
                                                            onChange={v => handleUpdateLine(e.id, 'amount', v.target.value)} 
                                                            className="h-[24px] border-none rounded-none text-right px-4 font-black text-[14px] tabular-nums bg-transparent focus-visible:bg-blue-50/30 focus-visible:ring-1 focus-visible:ring-inset" 
                                                            placeholder="0"
                                                        />
                                                    </TableCell>
                                                    <TableCell className="text-center p-0">
                                                        <Button variant="ghost" size="icon" className="h-[24px] w-full rounded-none text-muted-foreground/30 hover:text-destructive" onClick={() => handleRemoveLine(e.id)}>
                                                            <Trash2 className="h-3 w-3"/>
                                                        </Button>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                            <TableRow className="bg-emerald-50/50 h-[18px] border-b">
                                                <TableCell className="border-r px-2"></TableCell>
                                                <TableCell colSpan={2} className="text-[9px] font-black uppercase text-emerald-900 border-r px-4 text-right align-middle leading-none tracking-widest">Total Receipts</TableCell>
                                                <TableCell className="text-right tabular-nums text-[14px] font-black px-4 border-r align-middle text-emerald-700 leading-none">Rs. {totals.rec.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                                <TableCell />
                                            </TableRow>
                                        </TableBody>

                                        <TableHeader>
                                            <TableRow className="h-6 border-none hover:bg-transparent bg-transparent"><TableCell colSpan={5} className="p-0"></TableCell></TableRow>
                                            <TableRow className="bg-muted/10 hover:bg-muted/10 h-10 border-b">
                                                <TableHead colSpan={5} className="px-4 align-middle">
                                                    <div className="flex items-center justify-between w-full">
                                                        <span className="text-[10px] font-black uppercase tracking-widest text-red-800 flex items-center gap-2">
                                                            <ArrowUpCircle className="h-3.5 w-3.5" /> Outflow Entry (Payments)
                                                        </span>
                                                        <Button variant="ghost" size="sm" onClick={() => handleAddLine('Outflow')} className="h-7 text-[9px] font-black uppercase text-red-700 tracking-widest hover:bg-red-100/60 border border-red-200 bg-white shadow-sm px-3">
                                                            <PlusCircle className="mr-1.5 h-3 w-3" /> Append Payment
                                                        </Button>
                                                    </div>
                                                </TableHead>
                                            </TableRow>
                                            <TableRow className="bg-muted/20 h-[18px]">
                                                <TableHead className="w-12 text-center border-r text-[9px] font-black uppercase px-2">#</TableHead>
                                                <TableHead className="border-r text-[9px] font-black uppercase px-3">Beneficiary / Party</TableHead>
                                                <TableHead className="border-r text-[9px] font-black uppercase px-3">Narration / Remarks</TableHead>
                                                <TableHead className="text-right text-[9px] font-black uppercase px-4 w-[180px]">Amount (NPR)</TableHead>
                                                <TableHead className="w-10 px-2 text-center"></TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {outflowDrafts.map((e, i) => (
                                                <TableRow key={e.id} className="h-[18px] border-b group transition-colors hover:bg-muted/10">
                                                    <TableCell className="text-center border-r text-[14px] font-black text-muted-foreground px-2 py-0 leading-none">{i + 1}</TableCell>
                                                    <TableCell className="border-r p-0">
                                                        <Input 
                                                            value={e.partyName} 
                                                            onChange={v => handleUpdateLine(e.id, 'partyName', v.target.value)} 
                                                            className="h-[24px] border-none rounded-none text-[14px] px-3 font-bold bg-transparent focus-visible:bg-blue-50/30 focus-visible:ring-1 focus-visible:ring-inset" 
                                                            placeholder="Entity name"
                                                        />
                                                    </TableCell>
                                                    <TableCell className="border-r p-0">
                                                        <Input 
                                                            value={e.description} 
                                                            onChange={v => handleUpdateLine(e.id, 'description', v.target.value)} 
                                                            className="h-[24px] border-none rounded-none text-[14px] px-3 text-gray-600 bg-transparent focus-visible:bg-blue-50/30 focus-visible:ring-1 focus-visible:ring-inset" 
                                                            placeholder="..."
                                                        />
                                                    </TableCell>
                                                    <TableCell className="text-right border-r p-0">
                                                        <Input 
                                                            type="number" 
                                                            value={e.amount} 
                                                            onChange={v => handleUpdateLine(e.id, 'amount', v.target.value)} 
                                                            className="h-[24px] border-none rounded-none text-right px-4 font-black text-[14px] tabular-nums bg-transparent focus-visible:bg-blue-50/30 focus-visible:ring-1 focus-visible:ring-inset" 
                                                            placeholder="0"
                                                        />
                                                    </TableCell>
                                                    <TableCell className="text-center p-0">
                                                        <Button variant="ghost" size="icon" className="h-[24px] w-full rounded-none text-muted-foreground/30 hover:text-destructive" onClick={() => handleRemoveLine(e.id)}>
                                                            <Trash2 className="h-3 w-3"/>
                                                        </Button>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                            <TableRow className="bg-red-50/50 h-[18px] border-b">
                                                <TableCell className="border-r px-2"></TableCell>
                                                <TableCell colSpan={2} className="text-[9px] font-black uppercase text-red-900 border-r px-4 text-right align-middle leading-none tracking-widest">Total Payments</TableCell>
                                                <TableCell className="text-right tabular-nums text-[14px] font-black px-4 border-r align-middle text-red-700 leading-none">Rs. {totals.pay.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                                <TableCell />
                                            </TableRow>
                                        </TableBody>

                                        <TableFooter>
                                            <TableRow className="h-4 border-none hover:bg-transparent bg-transparent"><TableCell colSpan={5} className="p-0"></TableCell></TableRow>
                                            <TableRow className={cn(
                                                "h-12 border-t-2 hover:bg-transparent",
                                                totals.net >= 0 ? "bg-emerald-50/50 border-emerald-200" : "bg-red-50/50 border-red-200"
                                            )}>
                                                <TableCell className="border-r"></TableCell>
                                                <TableCell colSpan={2} className={cn(
                                                    "text-[10px] font-black uppercase tracking-[0.3em] px-6 align-middle",
                                                    totals.net >= 0 ? "text-emerald-800" : "text-red-800"
                                                )}>Final Document Balance</TableCell>
                                                <TableCell className={cn(
                                                    "text-right tabular-nums text-[20px] px-4 font-black border-r align-middle",
                                                    totals.net >= 0 ? "text-emerald-700" : "text-red-700"
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
                    </div>
                </TabsContent>

                <TabsContent value="history" className="animate-in fade-in slide-in-from-right-2 duration-300">
                    <div className="bg-white p-4 rounded-xl border shadow-sm mb-6 flex flex-col md:flex-row gap-4 md:gap-6 md:items-center">
                        <div className="flex items-center gap-3">
                            <Label className="text-[10px] font-black uppercase text-muted-foreground whitespace-nowrap px-1">Filter Period</Label>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button variant="outline" className="w-[240px] justify-start text-left font-normal bg-white h-9 border-2">
                                        <CalendarIconLucide className="mr-2 h-4 w-4 opacity-50 text-primary" />
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
                            <div className="relative flex-1">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input 
                                    placeholder="Search by ID or keywords..." 
                                    className="pl-9 h-9 bg-white border-2" 
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                />
                            </div>
                        </div>
                        {(searchQuery || historyDateRange) && (
                            <Button variant="ghost" size="sm" onClick={handleClearFilters} className="h-9 text-muted-foreground font-black text-[10px] uppercase">
                                <FilterX className="mr-1.5 h-3.5 w-3.5" /> Clear Filters
                            </Button>
                        )}
                    </div>

                    <Card className="shadow-sm border-gray-100 bg-white overflow-hidden">
                        <CardContent className="p-0">
                            <Table className="text-[13px]">
                                <TableHeader className="bg-muted/30 border-b">
                                    <TableRow className="h-10">
                                        <TableHead className="pl-6 text-[10px] font-black uppercase text-muted-foreground tracking-widest">Date (BS)</TableHead>
                                        <TableHead className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Voucher Number</TableHead>
                                        <TableHead className="text-right text-[10px] font-black uppercase text-muted-foreground tracking-widest">Total Outflow</TableHead>
                                        <TableHead className="text-right pr-6 text-[10px] font-black uppercase text-muted-foreground tracking-widest">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {summarizedHistory.map(v => (
                                        <TableRow key={v.voucherNo} className="h-[18px] border-b hover:bg-muted/10 transition-colors group">
                                            <TableCell className="pl-6 text-gray-500 font-mono text-[14px] leading-none">{toNepaliDate(v.date)}</TableCell>
                                            <TableCell className="font-black text-blue-900 text-[14px] leading-none uppercase">{v.voucherNo}</TableCell>
                                            <TableCell className="text-right font-black tabular-nums text-[14px] leading-none text-red-700">
                                                Rs. {v.totalPayment.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                            </TableCell>
                                            <TableCell className="text-right pr-6">
                                                <div className="flex justify-end gap-1 opacity-100 lg:opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <Button variant="ghost" size="icon" className="h-[24px] w-8 text-primary" onClick={() => { setReportingVoucherNo(v.voucherNo); setIsReportDialogOpen(true); }}>
                                                        <Eye className="h-4 w-4" />
                                                    </Button>
                                                    <Button variant="ghost" size="icon" className="h-[24px] w-8 text-primary" onClick={() => handleEditHistorical(v.voucherNo)}>
                                                        <Edit className="h-4 w-4" />
                                                    </Button>
                                                    <Button variant="ghost" size="icon" className="h-[24px] w-8 text-destructive" onClick={() => setDeletingVoucherNo(v.voucherNo)}>
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {summarizedHistory.length === 0 && (
                                        <TableRow><TableCell colSpan={4} className="py-20 text-center text-muted-foreground italic uppercase font-black text-[10px] tracking-[0.2em] opacity-30">Registry Empty</TableCell></TableRow>
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
                        <AlertDialogTitle>Delete Entire Voucher?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will permanently remove voucher <span className="font-bold text-gray-900">{deletingVoucherNo}</span> and all associated transactions from the historical registry.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel className="text-[10px] font-black uppercase">Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDeleteHistorical} className="bg-destructive text-destructive-foreground hover:bg-destructive/90 text-[10px] font-black uppercase">
                            Purge Records
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Report Preview Dialog */}
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
                                    Standard A4 Template &bull; {reportingVoucherNo}
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
                                    companyProfile={fleetProfile}
                                />
                            )}
                        </div>
                        <ScrollBar orientation="horizontal" />
                        <ScrollBar orientation="vertical" />
                    </ScrollArea>

                    <DialogFooter className="p-6 bg-white border-t shrink-0">
                        <div className="flex w-full justify-between items-center">
                            <div className="flex gap-3">
                                <Button variant="outline" onClick={handleExportVoucherImage} disabled={isExporting} className="h-11 px-6 font-bold text-[10px] uppercase tracking-widest">
                                    {isExporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <ImageIcon className="mr-2 h-4 w-4 text-blue-600"/>}
                                    Save as Image
                                </Button>
                                <Button variant="outline" onClick={handleExportVoucherPdf} disabled={isExporting} className="h-11 px-6 font-bold text-[10px] uppercase tracking-widest">
                                    {isExporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <FileDown className="mr-2 h-4 w-4 text-red-600"/>}
                                    Save as PDF
                                </Button>
                            </div>
                            <div className="flex gap-3">
                                <Button variant="secondary" onClick={() => setIsReportDialogOpen(false)} className="h-11 px-8 font-black text-[10px] uppercase">Close Preview</Button>
                                <Button onClick={executePrintVoucher} className="h-11 px-12 font-black text-[10px] uppercase tracking-widest shadow-xl shadow-primary/20">
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
