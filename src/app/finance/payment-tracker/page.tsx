
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
    ClipboardList
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { onPaymentEntriesUpdate, addPaymentEntry, updatePaymentEntry, deletePaymentEntry } from '@/services/payment-tracker-service';
import type { PaymentTrackerEntry } from '@/lib/types';
import { cn, toNepaliDate } from '@/lib/utils';
import { format, startOfDay, endOfDay, isWithinInterval } from 'date-fns';
import { DualDateRangePicker } from '@/components/ui/dual-date-range-picker';
import type { DateRange } from 'react-day-picker';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DualCalendar } from '@/components/ui/dual-calendar';

export default function PaymentTrackerPage() {
    const { user } = useAuth();
    const { toast } = useToast();
    const printableRef = useRef<HTMLDivElement>(null);
    
    const [activeTab, setActiveTab] = useState('tracker');
    const [entries, setEntries] = useState<PaymentTrackerEntry[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isExporting, setIsExporting] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [dateRange, setDateRange] = useState<DateRange | undefined>({ from: new Date(), to: new Date() });

    // Inline form states
    const [newReceived, setNewReceived] = useState({ partyName: '', description: '', amount: '' });
    const [newOutflow, setNewOutflow] = useState({ partyName: '', description: '', amount: '' });
    
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState({ partyName: '', description: '', amount: '' });

    useEffect(() => {
        const unsub = onPaymentEntriesUpdate((data) => {
            setEntries(data);
            setIsLoading(false);
        });
        return () => unsub();
    }, []);

    const filteredEntries = useMemo(() => {
        let filtered = [...entries];
        
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            filtered = filtered.filter(e => 
                e.partyName.toLowerCase().includes(q) || 
                e.description.toLowerCase().includes(q) ||
                (e.voucherNo || '').toLowerCase().includes(q)
            );
        }

        if (dateRange?.from) {
            const start = startOfDay(dateRange.from);
            const end = endOfDay(dateRange.to || dateRange.from);
            filtered = filtered.filter(e => {
                const d = new Date(e.date);
                return isWithinInterval(d, { start, end });
            });
        }

        return filtered.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    }, [entries, searchQuery, dateRange]);

    const receivedEntries = useMemo(() => filteredEntries.filter(e => e.type === 'Received'), [filteredEntries]);
    const outflowEntries = useMemo(() => filteredEntries.filter(e => e.type === 'Outflow'), [filteredEntries]);

    const totalReceived = useMemo(() => receivedEntries.reduce((sum, e) => sum + e.amount, 0), [receivedEntries]);
    const totalOutflow = useMemo(() => outflowEntries.reduce((sum, e) => sum + e.amount, 0), [outflowEntries]);
    const netBalance = totalReceived - totalOutflow;

    const handleAdd = async (type: 'Received' | 'Outflow') => {
        if (!user) return;
        const form = type === 'Received' ? newReceived : newOutflow;
        
        if (!form.partyName.trim() || !form.amount) {
            toast({ title: 'Missing Info', description: 'Party and Amount are required.', variant: 'destructive' });
            return;
        }

        try {
            await addPaymentEntry({
                partyName: form.partyName,
                description: form.description,
                amount: parseFloat(form.amount) || 0,
                type,
                date: (dateRange?.from || new Date()).toISOString(),
                ownership: 'Both',
                createdBy: user.username
            });
            toast({ title: 'Entry Saved' });
            if (type === 'Received') setNewReceived({ partyName: '', description: '', amount: '' });
            else setNewOutflow({ partyName: '', description: '', amount: '' });
        } catch {
            toast({ title: 'Error', variant: 'destructive' });
        }
    };

    const handleUpdate = async (id: string) => {
        if (!user) return;
        try {
            await updatePaymentEntry(id, {
                partyName: editForm.partyName,
                description: editForm.description,
                amount: parseFloat(editForm.amount) || 0,
                lastModifiedBy: user.username
            });
            setEditingId(null);
            toast({ title: 'Record Updated' });
        } catch {
            toast({ title: 'Error', variant: 'destructive' });
        }
    };

    const handleExportPdf = async () => {
        setIsExporting(true);
        try {
            const { jsPDF } = await import('jspdf');
            const { default: autoTable } = await import('jspdf-autotable');
            const doc = new jsPDF();
            doc.text("Payment Tracker Ledger", 14, 15);
            autoTable(doc, {
                startY: 25,
                head: [['Ref #', 'Party', 'Description', 'Amount']],
                body: filteredEntries.map(e => [e.voucherNo, e.partyName, e.description, e.amount.toLocaleString()])
            });
            doc.save(`Ledger-${format(new Date(), 'yyyyMMdd')}.pdf`);
        } finally {
            setIsExporting(false);
        }
    };

    return (
        <div className="flex flex-col gap-6">
            <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 print:hidden">
                <div>
                    <h1 className="text-3xl font-black text-gray-900 tracking-tighter uppercase leading-none">High-Density Ledger</h1>
                    <p className="text-muted-foreground text-[11px] font-black uppercase tracking-widest mt-1 italic">Professional Financial Tracking • 14pt Grid</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={handleExportPdf} disabled={isExporting} className="h-9 px-4 font-black text-[10px] uppercase tracking-widest">
                        {isExporting ? <Loader2 className="animate-spin h-4 w-4"/> : <FileDown className="h-4 w-4" />} Export PDF
                    </Button>
                    <Button size="sm" onClick={() => window.print()} className="h-9 px-6 font-black text-[10px] uppercase tracking-widest">
                        <Printer className="mr-2 h-4 w-4" /> Print View
                    </Button>
                </div>
            </header>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="bg-muted/50 p-1 mb-4 h-11">
                    <TabsTrigger value="tracker" className="gap-2 px-8 font-black text-[10px] uppercase tracking-widest">
                        <Calculator className="h-4 w-4" />
                        Live Tracker
                    </TabsTrigger>
                    <TabsTrigger value="history" className="gap-2 px-8 font-black text-[10px] uppercase tracking-widest">
                        <History className="h-4 w-4" />
                        History Logs
                    </TabsTrigger>
                </TabsList>

                <div className="bg-muted/20 p-4 rounded-xl border border-dashed mb-6 flex flex-col md:flex-row gap-6 items-center print:hidden">
                    <div className="flex items-center gap-3">
                        <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Entry Date</Label>
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button variant="outline" className="w-[240px] justify-start text-left font-normal bg-white h-10 border-gray-300">
                                    <CalendarIconLucide className="mr-2 h-4 w-4 opacity-50" />
                                    <span className="font-bold text-xs truncate">
                                        {dateRange?.from ? toNepaliDate(dateRange.from.toISOString()) : 'Select Day'}
                                    </span>
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                                <DualCalendar selected={dateRange?.from} onSelect={d => setDateRange({ from: d || new Date(), to: d || new Date() })} />
                            </PopoverContent>
                        </Popover>
                    </div>
                    <div className="flex items-center gap-3 flex-1">
                        <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Quick Search</Label>
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input 
                                placeholder="Filter records..." 
                                className="pl-9 h-10 bg-white" 
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                            />
                        </div>
                    </div>
                </div>

                <TabsContent value="tracker" className="animate-in fade-in slide-in-from-left-2">
                    <div ref={printableRef} className="space-y-4">
                        <Card className="shadow-sm border-gray-200 bg-white overflow-hidden">
                            <CardContent className="p-0">
                                <Table className="border-collapse table-fixed w-full">
                                    {/* RECEIVED */}
                                    <TableHeader>
                                        <TableRow className="bg-muted/40 hover:bg-muted/40 h-[32px] border-b">
                                            <TableHead colSpan={6} className="px-4 h-[32px] align-middle">
                                                <span className="text-[12px] font-black uppercase tracking-[0.3em] text-blue-900 leading-none">1. Cash/Bank Inflow (Receipts)</span>
                                            </TableHead>
                                        </TableRow>
                                        <TableRow className="bg-muted/10 h-[24px]">
                                            <TableHead className="w-12 text-center border-r font-black text-[10px] uppercase px-2">S.N.</TableHead>
                                            <TableHead className="w-[110px] border-r font-black text-[10px] uppercase px-3">Ref #</TableHead>
                                            <TableHead className="border-r font-black text-[10px] uppercase px-3">Party Name</TableHead>
                                            <TableHead className="border-r font-black text-[10px] uppercase px-3">Narration</TableHead>
                                            <TableHead className="text-right font-black text-[10px] uppercase px-4 w-[160px]">Amount</TableHead>
                                            <TableHead className="w-20 px-2 print:hidden"></TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {receivedEntries.map((e, i) => (
                                            <TableRow key={e.id} className="h-[18px] border-b group hover:bg-muted/5 transition-colors">
                                                <TableCell className="text-center border-r text-[11px] text-muted-foreground px-2 py-0 h-[18px] leading-none">{i + 1}</TableCell>
                                                <TableCell className="border-r px-3 py-0 text-[11px] font-mono font-bold text-blue-600 leading-none h-[18px]">{e.voucherNo}</TableCell>
                                                <TableCell className="border-r p-0 h-[18px]">
                                                    {editingId === e.id ? (
                                                        <Input value={editForm.partyName} onChange={v => setEditForm({...editForm, partyName: v.target.value})} className="h-full border-none rounded-none text-[14px] px-3 py-0 leading-none" />
                                                    ) : (
                                                        <div className="px-3 py-0 text-[14px] font-black uppercase truncate leading-none flex items-center h-full text-gray-900">{e.partyName}</div>
                                                    )}
                                                </TableCell>
                                                <TableCell className="border-r p-0 h-[18px]">
                                                    {editingId === e.id ? (
                                                        <Input value={editForm.description} onChange={v => setEditForm({...editForm, description: v.target.value})} className="h-full border-none rounded-none text-[14px] px-3 py-0 leading-none" />
                                                    ) : (
                                                        <div className="px-3 py-0 text-[14px] text-gray-500 italic truncate leading-none flex items-center h-full">{e.description}</div>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-right border-r p-0 h-[18px]">
                                                    {editingId === e.id ? (
                                                        <Input type="number" value={editForm.amount} onChange={v => setEditForm({...editForm, amount: v.target.value})} className="h-full border-none rounded-none text-right px-4 font-black text-[14px] py-0 leading-none" />
                                                    ) : (
                                                        <div className="px-4 py-0 text-[14px] font-black tabular-nums leading-none flex items-center justify-end h-full text-blue-900">{e.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-center px-0 h-[18px] py-0 print:hidden">
                                                    <div className="flex items-center justify-center h-full gap-1 opacity-100 lg:opacity-0 group-hover:opacity-100 transition-opacity">
                                                        {editingId === e.id ? (
                                                            <Button variant="ghost" size="icon" className="h-4 w-4 text-emerald-600" onClick={() => handleUpdate(e.id)}><Check className="h-3 w-3"/></Button>
                                                        ) : (
                                                            <Button variant="ghost" size="icon" className="h-4 w-4" onClick={() => { setEditingId(e.id); setEditForm({partyName: e.partyName, description: e.description, amount: String(e.amount)}); }}><Edit className="h-3 w-3 text-muted-foreground"/></Button>
                                                        )}
                                                        <Button variant="ghost" size="icon" className="h-4 w-4 text-destructive" onClick={() => deletePaymentEntry(e.id)}><Trash2 className="h-3 w-3"/></Button>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                        
                                        <TableRow className="h-[28px] bg-primary/[0.04] border-b print:hidden">
                                            <TableCell className="text-center border-r text-[9px] font-black text-primary px-2 uppercase h-[28px] leading-none">New In</TableCell>
                                            <TableCell className="border-r h-[28px] px-3 font-mono text-[10px] text-muted-foreground italic align-middle">Auto #</TableCell>
                                            <TableCell className="border-r p-0 h-[28px]"><Input placeholder="Enter source..." value={newReceived.partyName} onChange={e => setNewReceived({...newReceived, partyName: e.target.value})} className="h-full border-none rounded-none font-bold text-[14px] px-3" /></TableCell>
                                            <TableCell className="border-r p-0 h-[28px]"><Input placeholder="Narration..." value={newReceived.description} onChange={e => setNewReceived({...newReceived, description: e.target.value})} className="h-full border-none rounded-none text-[14px] px-3 italic" /></TableCell>
                                            <TableCell className="border-r p-0 h-[28px]"><Input type="number" placeholder="0.00" value={newReceived.amount} onChange={e => setNewReceived({...newReceived, amount: e.target.value})} className="h-full border-none rounded-none text-right px-4 font-black text-[14px]" /></TableCell>
                                            <TableCell className="text-center p-0 h-[28px]">
                                                <div className="flex items-center h-full"><Button size="icon" variant="ghost" onClick={() => handleAdd('Received')} className="h-full flex-1 text-primary hover:bg-primary/10"><Plus className="h-4 w-4"/></Button></div>
                                            </TableCell>
                                        </TableRow>

                                        <TableRow className="bg-blue-50 font-black h-[28px] border-b-2 border-gray-400">
                                            <TableCell className="border-r px-2 h-[28px]"></TableCell>
                                            <TableCell colSpan={3} className="uppercase tracking-[0.2em] text-[10px] border-r px-4 text-right h-[28px] align-middle">Aggregate Daily Received</TableCell>
                                            <TableCell className="text-right tabular-nums text-[14px] px-4 border-r h-[28px] align-middle text-blue-900">{totalReceived.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                            <TableCell className="h-[28px] print:hidden" />
                                        </TableRow>
                                    </TableBody>

                                    {/* OUTFLOW */}
                                    <TableHeader>
                                        <TableRow className="h-4"><TableCell colSpan={6}></TableCell></TableRow>
                                        <TableRow className="bg-muted/40 hover:bg-muted/40 h-[32px] border-b">
                                            <TableHead colSpan={6} className="px-4 h-[32px] align-middle">
                                                <span className="text-[12px] font-black uppercase tracking-[0.3em] text-red-900 leading-none">2. Cash/Bank Outflow (Payments)</span>
                                            </TableHead>
                                        </TableRow>
                                        <TableRow className="bg-muted/10 h-[24px]">
                                            <TableHead className="w-12 text-center border-r font-black text-[10px] uppercase px-2">S.N.</TableHead>
                                            <TableHead className="w-[110px] border-r font-black text-[10px] uppercase px-3">Ref #</TableHead>
                                            <TableHead className="border-r font-black text-[10px] uppercase px-3">Beneficiary</TableHead>
                                            <TableHead className="border-r font-black text-[10px] uppercase px-3">Narration</TableHead>
                                            <TableHead className="text-right font-black text-[10px] uppercase px-4 w-[160px]">Amount</TableHead>
                                            <TableHead className="w-20 px-2 print:hidden"></TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {outflowEntries.map((e, i) => (
                                            <TableRow key={e.id} className="h-[18px] border-b group hover:bg-muted/5 transition-colors">
                                                <TableCell className="text-center border-r text-[11px] text-muted-foreground px-2 py-0 h-[18px] leading-none">{i + 1}</TableCell>
                                                <TableCell className="border-r px-3 py-0 text-[11px] font-mono font-bold text-red-600 leading-none h-[18px]">{e.voucherNo}</TableCell>
                                                <TableCell className="border-r p-0 h-[18px]">
                                                    {editingId === e.id ? (
                                                        <Input value={editForm.partyName} onChange={v => setEditForm({...editForm, partyName: v.target.value})} className="h-full border-none rounded-none text-[14px] px-3 py-0 leading-none" />
                                                    ) : (
                                                        <div className="px-3 py-0 text-[14px] font-black uppercase truncate leading-none flex items-center h-full text-gray-900">{e.partyName}</div>
                                                    )}
                                                </TableCell>
                                                <TableCell className="border-r p-0 h-[18px]">
                                                    {editingId === e.id ? (
                                                        <Input value={editForm.description} onChange={v => setEditForm({...editForm, description: v.target.value})} className="h-full border-none rounded-none text-[14px] px-3 py-0 leading-none" />
                                                    ) : (
                                                        <div className="px-3 py-0 text-[14px] text-gray-500 italic truncate leading-none flex items-center h-full">{e.description}</div>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-right border-r p-0 h-[18px]">
                                                    {editingId === e.id ? (
                                                        <Input type="number" value={editForm.amount} onChange={v => setEditForm({...editForm, amount: v.target.value})} className="h-full border-none rounded-none text-right px-4 font-black text-[14px] py-0 leading-none" />
                                                    ) : (
                                                        <div className="px-4 py-0 text-[14px] font-black tabular-nums leading-none flex items-center justify-end h-full text-red-900">{e.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-center px-0 h-[18px] py-0 print:hidden">
                                                    <div className="flex items-center justify-center h-full gap-1 opacity-100 lg:opacity-0 group-hover:opacity-100 transition-opacity">
                                                        {editingId === e.id ? (
                                                            <Button variant="ghost" size="icon" className="h-4 w-4 text-emerald-600" onClick={() => handleUpdate(e.id)}><Check className="h-3 w-3"/></Button>
                                                        ) : (
                                                            <Button variant="ghost" size="icon" className="h-4 w-4" onClick={() => { setEditingId(e.id); setEditForm({partyName: e.partyName, description: e.description, amount: String(e.amount)}); }}><Edit className="h-3 w-3 text-muted-foreground"/></Button>
                                                        )}
                                                        <Button variant="ghost" size="icon" className="h-4 w-4 text-destructive" onClick={() => deletePaymentEntry(e.id)}><Trash2 className="h-3 w-3"/></Button>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        ))}

                                        <TableRow className="h-[28px] bg-red-50/[0.04] border-b print:hidden">
                                            <TableCell className="text-center border-r text-[9px] font-black text-red-600 px-2 uppercase h-[28px] leading-none">New Out</TableCell>
                                            <TableCell className="border-r h-[28px] px-3 font-mono text-[10px] text-muted-foreground italic align-middle">Auto #</TableCell>
                                            <TableCell className="border-r p-0 h-[28px]"><Input placeholder="Enter destination..." value={newOutflow.partyName} onChange={e => setNewOutflow({...newOutflow, partyName: e.target.value})} className="h-full border-none rounded-none font-bold text-[14px] px-3" /></TableCell>
                                            <TableCell className="border-r p-0 h-[28px]"><Input placeholder="Narration..." value={newOutflow.description} onChange={e => setNewOutflow({...newOutflow, description: e.target.value})} className="h-full border-none rounded-none text-[14px] px-3 italic" /></TableCell>
                                            <TableCell className="border-r p-0 h-[28px]"><Input type="number" placeholder="0.00" value={newOutflow.amount} onChange={e => setNewOutflow({...newOutflow, amount: e.target.value})} className="h-full border-none rounded-none text-right px-4 font-black text-[14px]" /></TableCell>
                                            <TableCell className="text-center p-0 h-[28px]">
                                                <div className="flex items-center h-full"><Button size="icon" variant="ghost" onClick={() => handleAdd('Outflow')} className="h-full flex-1 text-red-600 hover:bg-red-50"><Plus className="h-4 w-4"/></Button></div>
                                            </TableCell>
                                        </TableRow>

                                        <TableRow className="bg-red-50 font-black h-[28px] border-b-2 border-gray-400">
                                            <TableCell className="border-r px-2 h-[28px]"></TableCell>
                                            <TableCell colSpan={3} className="uppercase tracking-[0.2em] text-[10px] border-r px-4 text-right h-[28px] align-middle">Aggregate Daily Outflow</TableCell>
                                            <TableCell className="text-right tabular-nums text-[14px] px-4 border-r h-[28px] align-middle text-red-900">{totalOutflow.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                            <TableCell className="h-[28px] print:hidden" />
                                        </TableRow>

                                        {/* SUMMARY BALANCE */}
                                        <TableRow className="h-2 border-none"><TableCell colSpan={6}></TableCell></TableRow>
                                        <TableRow className="bg-emerald-50 border-t-2 border-gray-900 h-[36px]">
                                            <TableCell className="border-r h-[36px]"></TableCell>
                                            <TableCell colSpan={3} className="uppercase tracking-[0.4em] font-black text-[12px] text-gray-900 px-8 h-[36px] align-middle">Net Operational Balance</TableCell>
                                            <TableCell className={cn(
                                                "text-right tabular-nums text-[18px] px-4 font-black border-r h-[36px] align-middle",
                                                netBalance >= 0 ? "text-emerald-700" : "text-red-700"
                                            )}>
                                                {netBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                            </TableCell>
                                            <TableCell className="h-[36px] print:hidden" />
                                        </TableRow>
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>

                <TabsContent value="history" className="animate-in fade-in slide-in-from-right-2">
                    <Card className="shadow-sm border-gray-100 bg-white overflow-hidden">
                        <CardHeader className="py-3 px-6 bg-muted/20 border-b flex flex-row items-center justify-between">
                            <div>
                                <CardTitle className="text-base font-black uppercase">Historical Registry</CardTitle>
                                <CardDescription className="text-[10px] font-bold uppercase text-muted-foreground">Full archive of past entries with reference numbers.</CardDescription>
                            </div>
                        </CardHeader>
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
                                    {entries.map(e => (
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
                                    {entries.length === 0 && (
                                        <TableRow><TableCell colSpan={5} className="py-20 text-center text-muted-foreground italic">No historical records found.</TableCell></TableRow>
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

    function handleClearFilters() {
        setSearchQuery('');
        setDateRange({ from: new Date(), to: new Date() });
    }
}
