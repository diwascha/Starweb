'use client';

import { useState, useEffect, useMemo } from 'react';
import { 
    Plus, 
    Search, 
    Edit, 
    Trash2, 
    FileSpreadsheet, 
    FilterX,
    Loader2,
    Save,
    Calendar as CalendarIconLucide,
    X,
    MoreHorizontal
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { 
    Dialog, 
    DialogContent, 
    DialogHeader, 
    DialogTitle, 
    DialogDescription,
    DialogFooter 
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { 
    DropdownMenu, 
    DropdownMenuContent, 
    DropdownMenuItem, 
    DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DualCalendar } from '@/components/ui/dual-calendar';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { onPaymentEntriesUpdate, addPaymentEntry, updatePaymentEntry, deletePaymentEntry } from '@/services/payment-tracker-service';
import type { PaymentTrackerEntry } from '@/lib/types';
import { cn, toNepaliDate } from '@/lib/utils';
import { format, startOfDay, endOfDay, isWithinInterval } from 'date-fns';
import { DualDateRangePicker } from '@/components/ui/dual-date-range-picker';
import type { DateRange } from 'react-day-picker';
import { Textarea } from '@/components/ui/textarea';

export default function PaymentTrackerPage() {
    const { user } = useAuth();
    const { toast } = useToast();
    
    const [entries, setEntries] = useState<PaymentTrackerEntry[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [dateRange, setDateRange] = useState<DateRange | undefined>({ from: new Date(), to: new Date() });

    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingEntry, setEditingEntry] = useState<PaymentTrackerEntry | null>(null);
    const [form, setForm] = useState({
        partyName: '',
        description: '',
        amount: '',
        type: 'Received' as 'Received' | 'Outflow',
        date: new Date(),
    });

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

    const handleOpenAddDialog = (type: 'Received' | 'Outflow') => {
        setEditingEntry(null);
        setForm({
            partyName: '',
            description: '',
            amount: '',
            type,
            date: dateRange?.from || new Date(),
        });
        setIsDialogOpen(true);
    };

    const handleOpenEditDialog = (entry: PaymentTrackerEntry) => {
        setEditingEntry(entry);
        setForm({
            partyName: entry.partyName,
            description: entry.description,
            amount: String(entry.amount),
            type: entry.type,
            date: new Date(entry.date),
        });
        setIsDialogOpen(true);
    };

    const handleSave = async () => {
        if (!user || !form.partyName || !form.amount) return;
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
                type: form.type,
                date: form.date.toISOString(),
                ownership: 'Both',
            };

            if (editingEntry) {
                await updatePaymentEntry(editingEntry.id, { ...payload, lastModifiedBy: user.username });
                toast({ title: 'Entry Updated' });
            } else {
                await addPaymentEntry({ ...payload, createdBy: user.username });
                toast({ title: 'Entry Recorded' });
            }
            setIsDialogOpen(false);
        } catch {
            toast({ title: 'Error saving entry', variant: 'destructive' });
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
        <div className="flex flex-col gap-6 max-w-5xl mx-auto">
            <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-black text-gray-900 tracking-tighter uppercase">Payment Tracker</h1>
                    <p className="text-muted-foreground text-sm font-medium italic">Digital replacement for daily ledger spreadsheet.</p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" onClick={handleExportExcel} className="h-9 font-bold text-[10px] uppercase tracking-widest gap-2 border-gray-300">
                        <FileSpreadsheet className="h-4 w-4 text-emerald-600" /> Export XLSX
                    </Button>
                </div>
            </header>

            {/* Filter Toolbar */}
            <div className="flex flex-col md:flex-row gap-3 items-end bg-muted/20 p-4 rounded-xl border border-dashed mb-4">
                <div className="space-y-1.5 w-full md:w-[260px]">
                    <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest px-1">Active Period (AD)</Label>
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button variant="outline" className={cn("w-full h-9 justify-start text-left font-normal bg-white text-xs", !dateRange && "text-muted-foreground")}>
                                <CalendarIconLucide className="mr-2 h-4 w-4 opacity-50" />
                                <span className="truncate">
                                    {dateRange?.from ? (
                                        dateRange.to ? `${format(dateRange.from, "PPP")} - ${format(dateRange.to, "PPP")}` : format(dateRange.from, "PPP")
                                    ) : 'Select Period'}
                                </span>
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                            <DualDateRangePicker selected={dateRange} onSelect={setDateRange} />
                        </PopoverContent>
                    </Popover>
                </div>
                <div className="space-y-1.5 flex-1">
                    <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest px-1">Quick Filter</Label>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <Input 
                            placeholder="Filter by party or description..." 
                            className="pl-9 h-9 text-xs bg-white" 
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                        />
                    </div>
                </div>
                {(searchQuery || dateRange) && (
                    <Button variant="ghost" size="sm" onClick={() => { setSearchQuery(''); setDateRange({ from: new Date(), to: new Date() }); }} className="h-9 px-3 font-bold text-muted-foreground uppercase text-[9px]">
                        <FilterX className="mr-1.5 h-3.5 w-3.5" /> Clear All
                    </Button>
                )}
            </div>

            <Card className="shadow-2xl border-none ring-1 ring-black/5 bg-white overflow-hidden">
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <Table className="border-collapse">
                            {/* RECEIVED SECTION */}
                            <TableHeader>
                                <TableRow className="bg-primary/5 hover:bg-primary/5">
                                    <TableHead colSpan={4} className="h-12 py-0">
                                        <div className="flex items-center justify-between">
                                            <span className="text-sm font-black uppercase tracking-widest text-primary">Received Payments</span>
                                            <Button size="sm" variant="ghost" onClick={() => handleOpenAddDialog('Received')} className="h-8 text-[9px] font-black uppercase text-primary hover:bg-primary/10">
                                                <Plus className="mr-1 h-3 w-3"/> Add Received
                                            </Button>
                                        </div>
                                    </TableHead>
                                    <TableHead className="w-10 bg-primary/5"></TableHead>
                                </TableRow>
                                <TableRow className="bg-muted/30 hover:bg-muted/30">
                                    <TableHead className="w-12 text-center border-r border-b font-bold text-[10px] uppercase">S.N.</TableHead>
                                    <TableHead className="border-r border-b font-bold text-[10px] uppercase">Party Name</TableHead>
                                    <TableHead className="border-r border-b font-bold text-[10px] uppercase">Bill Description</TableHead>
                                    <TableHead className="text-right border-r border-b font-bold text-[10px] uppercase px-6 w-[180px]">Amount</TableHead>
                                    <TableHead className="w-10 border-b"></TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {receivedEntries.length > 0 ? receivedEntries.map((e, i) => (
                                    <TableRow key={e.id} className="hover:bg-muted/10 h-10 border-b group">
                                        <TableCell className="text-center border-r font-medium text-muted-foreground text-[10px]">{i + 1}</TableCell>
                                        <TableCell className="border-r font-black text-gray-900 uppercase tracking-tighter text-xs">{e.partyName}</TableCell>
                                        <TableCell className="border-r text-gray-600 text-xs italic">{e.description || '—'}</TableCell>
                                        <TableCell className="text-right border-r font-black tabular-nums text-xs px-6 text-blue-800">{e.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                        <TableCell className="text-center">
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100"><MoreHorizontal className="h-3 w-3"/></Button></DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    <DropdownMenuItem onSelect={() => handleOpenEditDialog(e)}><Edit className="mr-2 h-4 w-4" /> Edit</DropdownMenuItem>
                                                    <DropdownMenuItem className="text-destructive" onSelect={() => deletePaymentEntry(e.id)}><Trash2 className="mr-2 h-4 w-4" /> Delete</DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </TableCell>
                                    </TableRow>
                                )) : (
                                    <TableRow className="h-20"><TableCell colSpan={5} className="text-center italic text-muted-foreground text-xs opacity-40">No receipts logged for this period.</TableCell></TableRow>
                                )}
                                <TableRow className="bg-blue-600 text-white font-black hover:bg-blue-600 h-12">
                                    <TableCell className="text-center border-r border-blue-500"></TableCell>
                                    <TableCell colSpan={2} className="uppercase tracking-[0.2em] text-xs border-r border-blue-500 px-6">Total Received</TableCell>
                                    <TableCell className="text-right tabular-nums text-base px-6 border-r border-blue-500">{totalReceived.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                    <TableCell />
                                </TableRow>
                            </TableBody>

                            {/* SPACER */}
                            <TableBody>
                                <TableRow className="h-8 hover:bg-transparent"><TableCell colSpan={5}></TableCell></TableRow>
                            </TableBody>

                            {/* PAYMENT SECTION */}
                            <TableHeader>
                                <TableRow className="bg-red-500/10 hover:bg-red-500/10">
                                    <TableHead colSpan={4} className="h-12 py-0">
                                        <div className="flex items-center justify-between">
                                            <span className="text-sm font-black uppercase tracking-widest text-red-600">Payment Party</span>
                                            <Button size="sm" variant="ghost" onClick={() => handleOpenAddDialog('Outflow')} className="h-8 text-[9px] font-black uppercase text-red-600 hover:bg-red-500/10">
                                                <Plus className="mr-1 h-3 w-3"/> Add Payment
                                            </Button>
                                        </div>
                                    </TableHead>
                                    <TableHead className="w-10 bg-red-500/10"></TableHead>
                                </TableRow>
                                <TableRow className="bg-muted/30 hover:bg-muted/30">
                                    <TableHead className="w-12 text-center border-r border-b font-bold text-[10px] uppercase">S.N.</TableHead>
                                    <TableHead className="border-r border-b font-bold text-[10px] uppercase">Party Name</TableHead>
                                    <TableHead className="border-r border-b font-bold text-[10px] uppercase">Bill Description</TableHead>
                                    <TableHead className="text-right border-r border-b font-bold text-[10px] uppercase px-6 w-[180px]">Amount</TableHead>
                                    <TableHead className="w-10 border-b"></TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {outflowEntries.length > 0 ? outflowEntries.map((e, i) => (
                                    <TableRow key={e.id} className="hover:bg-muted/10 h-10 border-b group">
                                        <TableCell className="text-center border-r font-medium text-muted-foreground text-[10px]">{i + 1}</TableCell>
                                        <TableCell className="border-r font-black text-gray-900 uppercase tracking-tighter text-xs">{e.partyName}</TableCell>
                                        <TableCell className="border-r text-gray-600 text-xs italic">{e.description || '—'}</TableCell>
                                        <TableCell className="text-right border-r font-black tabular-nums text-xs px-6 text-red-700">{e.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                        <TableCell className="text-center">
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100"><MoreHorizontal className="h-3 w-3"/></Button></DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    <DropdownMenuItem onSelect={() => handleOpenEditDialog(e)}><Edit className="mr-2 h-4 w-4" /> Edit</DropdownMenuItem>
                                                    <DropdownMenuItem className="text-destructive" onSelect={() => deletePaymentEntry(e.id)}><Trash2 className="mr-2 h-4 w-4" /> Delete</DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </TableCell>
                                    </TableRow>
                                )) : (
                                    <TableRow className="h-20"><TableCell colSpan={5} className="text-center italic text-muted-foreground text-xs opacity-40">No payments logged for this period.</TableCell></TableRow>
                                )}
                                <TableRow className="bg-red-100 text-red-900 font-black hover:bg-red-100 h-12">
                                    <TableCell className="text-center border-r border-red-200"></TableCell>
                                    <TableCell colSpan={2} className="uppercase tracking-[0.2em] text-xs border-r border-red-200 px-6">Total Payment</TableCell>
                                    <TableCell className="text-right tabular-nums text-base px-6 border-r border-red-200">{totalOutflow.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                    <TableCell />
                                </TableRow>
                            </TableBody>

                            {/* FINAL BALANCE FOOTER */}
                            <TableBody>
                                <TableRow className="h-6 hover:bg-transparent"><TableCell colSpan={5}></TableCell></TableRow>
                                <TableRow className="bg-emerald-500/10 hover:bg-emerald-500/10 border-t-4 border-emerald-500 h-16">
                                    <TableCell className="text-center border-r border-emerald-100"></TableCell>
                                    <TableCell colSpan={2} className="uppercase tracking-[0.3em] font-black text-sm text-emerald-800 px-6">Net Balance</TableCell>
                                    <TableCell className={cn(
                                        "text-right tabular-nums text-2xl px-6 font-black border-r border-emerald-100",
                                        netBalance >= 0 ? "text-emerald-700" : "text-red-700"
                                    )}>
                                        {netBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </TableCell>
                                    <TableCell />
                                </TableRow>
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>

            {/* Entry Dialog */}
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="sm:max-w-md border-none shadow-2xl">
                    <DialogHeader className="p-2">
                        <DialogTitle className="text-xl font-black uppercase tracking-tight flex items-center gap-2">
                            {form.type === 'Received' ? <Badge className="bg-emerald-600">IN</Badge> : <Badge variant="destructive">OUT</Badge>}
                            {editingEntry ? 'Modify Entry' : `Record ${form.type}`}
                        </DialogTitle>
                        <DialogDescription className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Synchronized daily ledger entry.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-5 py-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-black uppercase text-muted-foreground px-1">Entry Date</Label>
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <Button variant="outline" className="w-full justify-start h-10 bg-gray-50 font-bold text-xs">
                                            <CalendarIconLucide className="mr-2 h-4 w-4 opacity-50" />
                                            {toNepaliDate(form.date.toISOString())}
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0" align="start">
                                        <DualCalendar selected={form.date} onSelect={d => d && setForm({...form, date: d})} />
                                    </PopoverContent>
                                </Popover>
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-black uppercase text-muted-foreground px-1">Amount (रु)</Label>
                                <Input type="number" step="0.01" value={form.amount} onChange={e => setForm({...form, amount: e.target.value})} className="h-10 font-black text-lg bg-gray-50" placeholder="0.00" />
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-[10px] font-black uppercase text-muted-foreground px-1">Party Name</Label>
                            <Input value={form.partyName} onChange={e => setPartyName(e.target.value)} placeholder="Beneficiary or source name" className="h-10 font-bold" />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-[10px] font-black uppercase text-muted-foreground px-1">Bill Description / Note</Label>
                            <Textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})} placeholder="Bill #, reference notes, etc." className="min-h-[100px] text-sm resize-none bg-gray-50" />
                        </div>
                    </div>
                    <DialogFooter className="border-t pt-4">
                        <Button variant="outline" onClick={() => setIsDialogOpen(false)} className="h-11 font-bold text-xs uppercase tracking-widest">Cancel</Button>
                        <Button onClick={handleSave} disabled={!form.partyName || !form.amount} className="h-11 px-8 font-black text-xs uppercase tracking-widest shadow-xl shadow-primary/20">
                            <Save className="mr-2 h-4 w-4"/> Commit Entry
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}