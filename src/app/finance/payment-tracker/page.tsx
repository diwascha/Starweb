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
    Building2,
    Wallet
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
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

export default function PaymentTrackerPage() {
    const { user } = useAuth();
    const { toast } = useToast();
    const printableRef = useRef<HTMLDivElement>(null);
    
    const [entries, setEntries] = useState<PaymentTrackerEntry[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isExporting, setIsExporting] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [dateRange, setDateRange] = useState<DateRange | undefined>({ from: new Date(), to: new Date() });

    // Inline form states for new entries
    const [newReceived, setNewReceived] = useState({ partyName: '', description: '', amount: '' });
    const [newOutflow, setNewOutflow] = useState({ partyName: '', description: '', amount: '' });
    
    // State for which row is currently being edited inline
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
                e.description.toLowerCase().includes(q)
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

        const amountNum = parseFloat(form.amount);
        if (isNaN(amountNum)) {
            toast({ title: 'Invalid Amount', variant: 'destructive' });
            return;
        }

        try {
            const payload = {
                partyName: form.partyName,
                description: form.description,
                amount: amountNum,
                type,
                date: (dateRange?.from || new Date()).toISOString(),
                ownership: 'Both',
            };

            await addPaymentEntry({ ...payload, createdBy: user.username });
            toast({ title: 'Entry Added' });
            
            if (type === 'Received') setNewReceived({ partyName: '', description: '', amount: '' });
            else setNewOutflow({ partyName: '', description: '', amount: '' });
        } catch {
            toast({ title: 'Error adding entry', variant: 'destructive' });
        }
    };

    const startEditing = (entry: PaymentTrackerEntry) => {
        setEditingId(entry.id);
        setEditForm({
            partyName: entry.partyName,
            description: entry.description,
            amount: String(entry.amount)
        });
    };

    const handleUpdate = async (id: string) => {
        if (!user) return;
        const amountNum = parseFloat(editForm.amount);
        if (isNaN(amountNum)) {
            toast({ title: 'Invalid Amount', variant: 'destructive' });
            return;
        }

        try {
            await updatePaymentEntry(id, {
                partyName: editForm.partyName,
                description: editForm.description,
                amount: amountNum,
                lastModifiedBy: user.username
            });
            setEditingId(null);
            toast({ title: 'Entry Updated' });
        } catch {
            toast({ title: 'Error updating entry', variant: 'destructive' });
        }
    };

    const handlePrint = () => {
        window.print();
    };

    const handleExportPdf = async () => {
        setIsExporting(true);
        try {
            const { jsPDF } = await import('jspdf');
            const { default: autoTable } = await import('jspdf-autotable');
            const doc = new jsPDF();
            
            doc.setFontSize(18);
            doc.text("Daily Payment Tracker", 14, 15);
            doc.setFontSize(10);
            doc.text(`Period: ${dateRange?.from ? toNepaliDate(dateRange.from.toISOString()) : 'All Time'}`, 14, 22);
            
            autoTable(doc, {
                startY: 30,
                head: [['S.N.', 'Type', 'Party Name', 'Description', 'Amount (NPR)']],
                body: filteredEntries.map((e, i) => [
                    i + 1,
                    e.type,
                    e.partyName,
                    e.description || '-',
                    e.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })
                ]),
                theme: 'grid',
                headStyles: { fillColor: [41, 128, 185] }
            });
            
            const finalY = (doc as any).lastAutoTable.finalY + 10;
            doc.setFontSize(12);
            doc.text(`Total Received: Rs. ${totalReceived.toLocaleString()}`, 14, finalY);
            doc.text(`Total Outflow: Rs. ${totalOutflow.toLocaleString()}`, 14, finalY + 7);
            doc.setFont('helvetica', 'bold');
            doc.text(`Net Balance: Rs. ${netBalance.toLocaleString()}`, 14, finalY + 14);

            doc.save(`Payment_Tracker_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
            toast({ title: 'PDF Export Successful' });
        } catch (error) {
            toast({ title: 'PDF Export Failed', variant: 'destructive' });
        } finally {
            setIsExporting(false);
        }
    };

    const handleExportImage = async () => {
        if (!printableRef.current) return;
        setIsExporting(true);
        try {
            const html2canvas = (await import('html2canvas')).default;
            const canvas = await html2canvas(printableRef.current, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
            const link = document.createElement('a');
            link.download = `Payment_Tracker_${format(new Date(), 'yyyy-MM-dd')}.jpg`;
            link.href = canvas.toDataURL('image/jpeg', 0.9);
            link.click();
            toast({ title: 'Image Export Successful' });
        } catch (error) {
            toast({ title: 'Image Export Failed', variant: 'destructive' });
        } finally {
            setIsExporting(false);
        }
    };

    const handleExportExcel = async () => {
        try {
            const XLSX = await import('xlsx');
            const data = filteredEntries.map(e => ({
                'Date (BS)': toNepaliDate(e.date),
                'Date (AD)': format(new Date(e.date), 'yyyy-MM-dd'),
                'Type': e.type === 'Outflow' ? 'Payment' : 'Received',
                'Party Name': e.partyName,
                'Description': e.description,
                'Amount (NPR)': e.amount,
                'Recorded By': e.createdBy
            }));

            const worksheet = XLSX.utils.json_to_sheet(data);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "Payment Tracker");
            XLSX.writeFile(workbook, `Payment_Tracker_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
            toast({ title: 'Export Successful' });
        } catch {
            toast({ title: 'Export Failed', variant: 'destructive' });
        }
    };

    return (
        <div className="flex flex-col gap-4 max-w-6xl mx-auto pb-20">
            <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 print:hidden">
                <div>
                    <h1 className="text-2xl font-black text-gray-900 tracking-tighter uppercase leading-none">Payment Tracker</h1>
                    <p className="text-muted-foreground text-[10px] font-bold uppercase tracking-tight italic">Digital Daily Ledger</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <Button variant="outline" size="sm" onClick={handleExportImage} disabled={isExporting} className="h-8 text-[10px] font-bold uppercase tracking-widest gap-2">
                        {isExporting ? <Loader2 className="h-3 w-3 animate-spin"/> : <ImageIcon className="h-3.5 w-3.5" />} JPG
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleExportPdf} disabled={isExporting} className="h-8 text-[10px] font-bold uppercase tracking-widest gap-2">
                        {isExporting ? <Loader2 className="h-3 w-3 animate-spin"/> : <FileDown className="h-3.5 w-3.5" />} PDF
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleExportExcel} className="h-8 font-bold text-[10px] uppercase tracking-widest gap-2 border-gray-300">
                        <FileSpreadsheet className="h-4 w-4 text-emerald-600" /> XLSX
                    </Button>
                    <Button variant="outline" size="sm" onClick={handlePrint} className="h-8 font-bold text-[10px] uppercase tracking-widest gap-2">
                        <Printer className="h-3.5 w-3.5" /> Print
                    </Button>
                </div>
            </header>

            {/* Filter Toolbar */}
            <div className="flex flex-col md:flex-row gap-4 items-center bg-muted/20 p-2 rounded-xl border border-dashed print:hidden">
                <div className="flex items-center gap-3">
                    <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest whitespace-nowrap">Period (BS/AD)</Label>
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button variant="outline" className={cn("h-8 justify-start text-left font-normal bg-white text-xs px-3 w-[260px]", !dateRange && "text-muted-foreground")}>
                                <CalendarIconLucide className="mr-2 h-4 w-4 opacity-50" />
                                <span className="truncate">
                                    {dateRange?.from ? (
                                        dateRange.to ? `${toNepaliDate(dateRange.from.toISOString())} - ${toNepaliDate(dateRange.to.toISOString())}` : toNepaliDate(dateRange.from.toISOString())
                                    ) : 'Select Date'}
                                </span>
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                            <DualDateRangePicker selected={dateRange} onSelect={setDateRange} />
                        </PopoverContent>
                    </Popover>
                </div>
                <div className="flex items-center gap-3 flex-1 w-full">
                    <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest whitespace-nowrap">Search</Label>
                    <div className="relative flex-1">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input 
                            placeholder="Filter records..." 
                            className="pl-8 h-8 text-xs bg-white border-gray-200" 
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                        />
                    </div>
                </div>
                {(searchQuery || dateRange) && (
                    <Button variant="ghost" size="sm" onClick={handleClearFilters} className="h-8 px-3 font-black text-muted-foreground uppercase text-[10px] tracking-tighter">
                        <FilterX className="mr-1.5 h-4 w-4" /> Reset
                    </Button>
                )}
            </div>

            <div ref={printableRef} className="printable-container">
                {/* Header for print only */}
                <div className="hidden print:block text-center mb-6 space-y-1">
                    <h2 className="text-xl font-black uppercase">Daily Payment Ledger</h2>
                    <p className="text-xs font-bold text-muted-foreground uppercase">
                        Period: {dateRange?.from ? toNepaliDate(dateRange.from.toISOString()) : 'All Time'} 
                        {dateRange?.to ? ` to ${toNepaliDate(dateRange.to.toISOString())}` : ''}
                    </p>
                </div>

                <Card className="shadow-none border-gray-200 bg-white overflow-hidden">
                    <CardContent className="p-0">
                        <div className="overflow-x-auto">
                            <Table className="border-collapse table-fixed w-full">
                                {/* RECEIVED SECTION */}
                                <TableHeader>
                                    <TableRow className="bg-muted/40 hover:bg-muted/40 h-[24px] border-b">
                                        <TableHead colSpan={5} className="py-0 px-4 h-[24px] align-middle">
                                            <span className="text-[11px] font-black uppercase tracking-[0.2em] text-blue-800 leading-none">Received Payments</span>
                                        </TableHead>
                                    </TableRow>
                                    <TableRow className="bg-muted/10 h-[20px]">
                                        <TableHead className="w-12 text-center border-r font-black text-[10px] uppercase px-2 h-[20px]">S.N.</TableHead>
                                        <TableHead className="border-r font-black text-[10px] uppercase px-3 h-[20px]">Party Name</TableHead>
                                        <TableHead className="border-r font-black text-[10px] uppercase px-3 h-[20px]">Bill Description</TableHead>
                                        <TableHead className="text-right font-black text-[10px] uppercase px-4 w-[160px] h-[20px]">Amount</TableHead>
                                        <TableHead className="w-20 px-2 h-[20px] print:hidden"></TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {receivedEntries.map((e, i) => (
                                        <TableRow key={e.id} className="h-[16px] border-b group hover:bg-muted/5">
                                            <TableCell className="text-center border-r text-[10px] text-muted-foreground px-2 py-0 h-[16px] leading-none">{i + 1}</TableCell>
                                            <TableCell className="border-r p-0 h-[16px]">
                                                {editingId === e.id ? (
                                                    <Input value={editForm.partyName} onChange={val => setEditForm({...editForm, partyName: val.target.value})} className="h-full border-none rounded-none focus-visible:ring-1 focus-visible:ring-inset text-[12px] px-3 py-0 leading-none" />
                                                ) : (
                                                    <div className="px-3 py-0 text-[12px] font-bold uppercase truncate leading-none flex items-center h-full">{e.partyName}</div>
                                                )}
                                            </TableCell>
                                            <TableCell className="border-r p-0 h-[16px]">
                                                {editingId === e.id ? (
                                                    <Input value={editForm.description} onChange={val => setEditForm({...editForm, description: val.target.value})} className="h-full border-none rounded-none focus-visible:ring-1 focus-visible:ring-inset text-[12px] px-3 py-0 leading-none" />
                                                ) : (
                                                    <div className="px-3 py-0 text-[12px] text-gray-500 italic truncate leading-none flex items-center h-full">{e.description || '—'}</div>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-right border-r p-0 h-[16px]">
                                                {editingId === e.id ? (
                                                    <Input type="number" value={editForm.amount} onChange={val => setEditForm({...editForm, amount: val.target.value})} className="h-full border-none rounded-none text-right px-4 font-black text-[12px] py-0 leading-none" />
                                                ) : (
                                                    <div className="px-4 py-0 text-[12px] font-black tabular-nums leading-none flex items-center justify-end h-full">{e.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-center px-0 h-[16px] py-0 print:hidden">
                                                <div className="flex items-center justify-center h-full gap-2 opacity-100 lg:opacity-0 group-hover:opacity-100 transition-opacity">
                                                    {editingId === e.id ? (
                                                        <Button variant="ghost" size="icon" className="h-4 w-4 text-emerald-600 p-0" onClick={() => handleUpdate(e.id)}><Check className="h-3 w-3"/></Button>
                                                    ) : (
                                                        <Button variant="ghost" size="icon" className="h-4 w-4 p-0" onClick={() => startEditing(e)}><Edit className="h-3 w-3 text-muted-foreground"/></Button>
                                                    )}
                                                    <Button variant="ghost" size="icon" className="h-4 w-4 text-destructive p-0" onClick={() => deletePaymentEntry(e.id)}><Trash2 className="h-3.5 w-3.5"/></Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    
                                    {/* New Received Row */}
                                    <TableRow className="h-[24px] bg-primary/[0.03] border-b print:hidden">
                                        <TableCell className="text-center border-r text-[9px] font-black text-primary px-2 leading-none py-0 h-[24px]">NEW</TableCell>
                                        <TableCell className="border-r p-0 h-[24px]">
                                            <Input placeholder="Enter party..." value={newReceived.partyName} onChange={e => setNewReceived({...newReceived, partyName: e.target.value})} className="h-full border-none rounded-none focus-visible:ring-1 focus-visible:ring-inset font-bold text-[12px] uppercase px-3 py-0" />
                                        </TableCell>
                                        <TableCell className="border-r p-0 h-[24px]">
                                            <Input placeholder="Note..." value={newReceived.description} onChange={e => setNewReceived({...newReceived, description: e.target.value})} className="h-full border-none rounded-none focus-visible:ring-1 focus-visible:ring-inset text-[12px] italic px-3 py-0" />
                                        </TableCell>
                                        <TableCell className="border-r p-0 h-[24px]">
                                            <Input type="number" placeholder="0.00" value={newReceived.amount} onChange={e => setNewReceived({...newReceived, amount: e.target.value})} className="h-full border-none rounded-none text-right px-4 font-black text-[12px] py-0" />
                                        </TableCell>
                                        <TableCell className="text-center p-0 h-[24px]">
                                            <div className="flex items-center h-full">
                                                <Button size="icon" variant="ghost" onClick={() => handleAdd('Received')} className="h-full flex-1 rounded-none text-primary hover:bg-primary/10">
                                                    <Plus className="h-4 w-4"/>
                                                </Button>
                                                {(newReceived.partyName || newReceived.amount) && (
                                                    <Button size="icon" variant="ghost" onClick={() => setNewReceived({ partyName: '', description: '', amount: '' })} className="h-full w-8 rounded-none text-muted-foreground hover:bg-red-50 hover:text-red-600 border-l">
                                                        <X className="h-3 w-3"/>
                                                    </Button>
                                                )}
                                            </div>
                                        </TableCell>
                                    </TableRow>

                                    <TableRow className="bg-blue-50/50 font-black h-[22px] border-b-2 border-gray-400">
                                        <TableCell className="border-r px-2 h-[22px]"></TableCell>
                                        <TableCell colSpan={2} className="uppercase tracking-widest text-[10px] border-r px-4 text-right h-[22px] align-middle">Total Received</TableCell>
                                        <TableCell className="text-right tabular-nums text-[12px] px-4 border-r h-[22px] align-middle text-blue-900">{totalReceived.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                        <TableCell className="h-[22px] print:hidden" />
                                    </TableRow>
                                </TableBody>

                                {/* SPACER */}
                                <TableBody>
                                    <TableRow className="h-[8px] hover:bg-transparent border-none"><TableCell colSpan={5}></TableCell></TableRow>
                                </TableBody>

                                {/* PAYMENT SECTION */}
                                <TableHeader>
                                    <TableRow className="bg-muted/40 hover:bg-muted/40 h-[24px] border-b">
                                        <TableHead colSpan={5} className="py-0 px-4 h-[24px] align-middle">
                                            <span className="text-[11px] font-black uppercase tracking-[0.2em] text-red-800 leading-none">Payment Outflows</span>
                                        </TableHead>
                                    </TableRow>
                                    <TableRow className="bg-muted/10 h-[20px]">
                                        <TableHead className="w-12 text-center border-r font-black text-[10px] uppercase px-2 h-[20px]">S.N.</TableHead>
                                        <TableHead className="border-r font-black text-[10px] uppercase px-3 h-[20px]">Party Name</TableHead>
                                        <TableHead className="border-r font-black text-[10px] uppercase px-3 h-[20px]">Bill Description</TableHead>
                                        <TableHead className="text-right font-black text-[10px] uppercase px-4 w-[160px] h-[20px]">Amount</TableHead>
                                        <TableHead className="w-20 px-2 h-[20px] print:hidden"></TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {outflowEntries.map((e, i) => (
                                        <TableRow key={e.id} className="h-[16px] border-b group hover:bg-muted/5">
                                            <TableCell className="text-center border-r text-[10px] text-muted-foreground px-2 py-0 h-[16px] leading-none">{i + 1}</TableCell>
                                            <TableCell className="border-r p-0 h-[16px]">
                                                {editingId === e.id ? (
                                                    <Input value={editForm.partyName} onChange={val => setEditForm({...editForm, partyName: val.target.value})} className="h-full border-none rounded-none focus-visible:ring-1 focus-visible:ring-inset text-[12px] px-3 py-0 leading-none" />
                                                ) : (
                                                    <div className="px-3 py-0 text-[12px] font-bold uppercase truncate leading-none flex items-center h-full">{e.partyName}</div>
                                                )}
                                            </TableCell>
                                            <TableCell className="border-r p-0 h-[16px]">
                                                {editingId === e.id ? (
                                                    <Input value={editForm.description} onChange={val => setEditForm({...editForm, description: val.target.value})} className="h-full border-none rounded-none focus-visible:ring-1 focus-visible:ring-inset text-[12px] px-3 py-0 leading-none" />
                                                ) : (
                                                    <div className="px-3 py-0 text-[12px] text-gray-500 italic truncate leading-none flex items-center h-full">{e.description || '—'}</div>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-right border-r p-0 h-[16px]">
                                                {editingId === e.id ? (
                                                    <Input type="number" value={editForm.amount} onChange={val => setEditForm({...editForm, amount: val.target.value})} className="h-full border-none rounded-none text-right px-4 font-black text-[12px] py-0 leading-none" />
                                                ) : (
                                                    <div className="px-4 py-0 text-[12px] font-black tabular-nums leading-none flex items-center justify-end h-full">{e.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-center px-0 h-[16px] py-0 print:hidden">
                                                <div className="flex items-center justify-center h-full gap-2 opacity-100 lg:opacity-0 group-hover:opacity-100 transition-opacity">
                                                    {editingId === e.id ? (
                                                        <Button variant="ghost" size="icon" className="h-4 w-4 text-emerald-600 p-0" onClick={() => handleUpdate(e.id)}><Check className="h-3 w-3"/></Button>
                                                    ) : (
                                                        <Button variant="ghost" size="icon" className="h-4 w-4 p-0" onClick={() => startEditing(e)}><Edit className="h-3 w-3 text-muted-foreground"/></Button>
                                                    )}
                                                    <Button variant="ghost" size="icon" className="h-4 w-4 text-destructive p-0" onClick={() => deletePaymentEntry(e.id)}><Trash2 className="h-3.5 w-3.5"/></Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))}

                                    {/* New Outflow Row */}
                                    <TableRow className="h-[24px] bg-destructive/[0.03] border-b print:hidden">
                                        <TableCell className="text-center border-r text-[9px] font-black text-destructive px-2 leading-none py-0 h-[24px]">NEW</TableCell>
                                        <TableCell className="border-r p-0 h-[24px]">
                                            <Input placeholder="Enter party..." value={newOutflow.partyName} onChange={e => setNewOutflow({...newOutflow, partyName: e.target.value})} className="h-full border-none rounded-none focus-visible:ring-1 focus-visible:ring-inset font-bold text-[12px] uppercase px-3 py-0" />
                                        </TableCell>
                                        <TableCell className="border-r p-0 h-[24px]">
                                            <Input placeholder="Note..." value={newOutflow.description} onChange={e => setNewOutflow({...newOutflow, description: e.target.value})} className="h-full border-none rounded-none focus-visible:ring-1 focus-visible:ring-inset text-[12px] italic px-3 py-0" />
                                        </TableCell>
                                        <TableCell className="border-r p-0 h-[24px]">
                                            <Input type="number" placeholder="0.00" value={newOutflow.amount} onChange={e => setNewOutflow({...newOutflow, amount: e.target.value})} className="h-full border-none rounded-none text-right px-4 font-black text-[12px] py-0" />
                                        </TableCell>
                                        <TableCell className="text-center p-0 h-[24px]">
                                            <div className="flex items-center h-full">
                                                <Button size="icon" variant="ghost" onClick={() => handleAdd('Outflow')} className="h-full flex-1 rounded-none text-destructive hover:bg-destructive/10">
                                                    <Plus className="h-4 w-4"/>
                                                </Button>
                                                {(newOutflow.partyName || newOutflow.amount) && (
                                                    <Button size="icon" variant="ghost" onClick={() => setNewOutflow({ partyName: '', description: '', amount: '' })} className="h-full w-8 rounded-none text-muted-foreground hover:bg-red-50 hover:text-red-600 border-l">
                                                        <X className="h-3 w-3"/>
                                                    </Button>
                                                )}
                                            </div>
                                        </TableCell>
                                    </TableRow>

                                    <TableRow className="bg-red-50/50 font-black h-[22px] border-b-2 border-gray-400">
                                        <TableCell className="border-r px-2 h-[22px]"></TableCell>
                                        <TableCell colSpan={2} className="uppercase tracking-widest text-[10px] border-r px-4 text-right h-[22px] align-middle">Total Outflow</TableCell>
                                        <TableCell className="text-right tabular-nums text-[12px] px-4 border-r h-[22px] align-middle text-red-900">{totalOutflow.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                        <TableCell className="h-[22px] print:hidden" />
                                    </TableRow>
                                </TableBody>

                                {/* FINAL BALANCE FOOTER */}
                                <TableBody>
                                    <TableRow className="h-[4px] hover:bg-transparent border-none"><TableCell colSpan={5}></TableCell></TableRow>
                                    <TableRow className="bg-emerald-50/20 border-t-2 border-gray-900 h-[28px]">
                                        <TableCell className="text-center border-r px-2 h-[28px]"></TableCell>
                                        <TableCell colSpan={2} className="uppercase tracking-[0.4em] font-black text-[11px] text-gray-900 px-8 h-[28px] align-middle">Net Daily Balance</TableCell>
                                        <TableCell className={cn(
                                            "text-right tabular-nums text-[14px] px-4 font-black border-r h-[28px] align-middle",
                                            netBalance >= 0 ? "text-emerald-700" : "text-red-700"
                                        )}>
                                            {netBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        </TableCell>
                                        <TableCell className="h-[28px] print:hidden" />
                                    </TableRow>
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <div className="p-2 bg-muted/10 rounded-lg border border-dashed flex items-center gap-3 print:hidden">
                <Badge variant="outline" className="bg-white uppercase text-[8px] font-black tracking-widest px-1.5 h-4">System</Badge>
                <p className="text-[10px] text-muted-foreground font-black uppercase tracking-tight leading-none">
                    High-Density Operational Grid &middot; Real-time synchronization active &middot; BS/AD Dual Engine.
                </p>
            </div>

            <style jsx global>{`
                @media print {
                    @page { size: A4; margin: 10mm; }
                    body { background: white !important; }
                    aside, header, .sidebar, .sidebar-wrapper, [data-sidebar], button, .bg-muted\/20 { display: none !important; }
                    .main-content, main, .printable-container { display: block !important; width: 100% !important; margin: 0 !important; padding: 0 !important; }
                    .printable-container table { border: 1px solid #000 !important; }
                    .printable-container th, .printable-container td { border: 1px solid #000 !important; color: black !important; }
                    .print\\:hidden { display: none !important; }
                }
            `}</style>
        </div>
    );

    function handleClearFilters() {
        setSearchQuery('');
        setDateRange({ from: new Date(), to: new Date() });
    }
}
