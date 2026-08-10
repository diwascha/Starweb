
'use client';

import { useState, useEffect, useMemo } from 'react';
import { 
    Plus, 
    ArrowDownLeft, 
    ArrowUpRight, 
    MoreHorizontal, 
    Edit, 
    Trash2, 
    Search, 
    CalendarIcon, 
    FileSpreadsheet, 
    FilterX,
    TrendingUp,
    TrendingDown,
    Scale,
    Loader2,
    History,
    Save,
    Calendar as CalendarIconLucide
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { 
    Dialog, 
    DialogContent, 
    DialogHeader, 
    DialogTitle, 
    DialogDescription,
    DialogFooter 
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
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

        return filtered;
    }, [entries, searchQuery, dateRange]);

    const stats = useMemo(() => {
        const received = filteredEntries.filter(e => e.type === 'Received');
        const outflows = filteredEntries.filter(e => e.type === 'Outflow');
        
        const totalReceived = received.reduce((sum, e) => sum + e.amount, 0);
        const totalOutflow = outflows.reduce((sum, e) => sum + e.amount, 0);
        
        return {
            received,
            outflows,
            totalReceived,
            totalOutflow,
            netBalance: totalReceived - totalOutflow
        };
    }, [filteredEntries]);

    const handleOpenAddDialog = (type: 'Received' | 'Outflow') => {
        setEditingEntry(null);
        setForm({
            partyName: '',
            description: '',
            amount: '',
            type,
            date: new Date(),
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
                'Type': e.type,
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
        <div className="flex flex-col gap-8">
            <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-black text-gray-900 tracking-tighter uppercase">Payment Intelligence</h1>
                    <p className="text-muted-foreground text-sm font-medium">Daily ledger tracking for real-time liquidity analysis.</p>
                </div>
                <div className="flex items-center gap-3">
                    <Button variant="outline" onClick={handleExportExcel} className="h-10 font-bold text-xs uppercase tracking-widest gap-2 border-gray-300">
                        <FileSpreadsheet className="h-4 w-4 text-emerald-600" /> Export XLSX
                    </Button>
                    <div className="flex gap-1 bg-muted/50 p-1 rounded-lg border">
                        <Button size="sm" onClick={() => handleOpenAddDialog('Received')} className="h-8 bg-emerald-600 hover:bg-emerald-700 font-black text-[10px] uppercase tracking-widest">
                            <Plus className="mr-1 h-3.5 w-3.5"/> Received
                        </Button>
                        <Button size="sm" onClick={() => handleOpenAddDialog('Outflow')} className="h-8 bg-red-600 hover:bg-red-700 font-black text-[10px] uppercase tracking-widest">
                            <Plus className="mr-1 h-3.5 w-3.5"/> Outflow
                        </Button>
                    </div>
                </div>
            </header>

            {/* Top Summary Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <SummaryCard title="Total Received" value={stats.totalReceived} icon={TrendingUp} color="emerald" />
                <SummaryCard title="Total Outflow" value={stats.totalOutflow} icon={TrendingDown} color="red" />
                <Card className="border-2 border-primary/20 bg-primary/[0.03] shadow-lg shadow-primary/5">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-[10px] font-black uppercase text-primary tracking-widest flex items-center gap-2">
                            <Scale className="h-3.5 w-3.5" /> Net Daily Balance
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className={cn(
                            "text-3xl font-black tabular-nums tracking-tighter",
                            stats.netBalance >= 0 ? "text-emerald-700" : "text-red-700"
                        )}>
                            Rs. {stats.netBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Filter Toolbar */}
            <div className="flex flex-col md:flex-row gap-4 items-end bg-muted/20 p-4 rounded-xl border border-dashed">
                <div className="space-y-1.5 w-full md:w-[300px]">
                    <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest px-1">Period Selection (AD)</Label>
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button variant="outline" className={cn("w-full h-10 justify-start text-left font-normal bg-white", !dateRange && "text-muted-foreground")}>
                                <CalendarIconLucide className="mr-2 h-4 w-4 opacity-50" />
                                <span className="truncate">
                                    {dateRange?.from ? (
                                        dateRange.to ? `${format(dateRange.from, "PPP")} - ${format(dateRange.to, "PPP")}` : format(dateRange.from, "PPP")
                                    ) : 'Select Date Range'}
                                </span>
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                            <DualDateRangePicker selected={dateRange} onSelect={setDateRange} />
                        </PopoverContent>
                    </Popover>
                </div>
                <div className="space-y-1.5 flex-1">
                    <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest px-1">Content Filter</Label>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input 
                            placeholder="Filter by party or description..." 
                            className="pl-10 h-10 bg-white" 
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                        />
                    </div>
                </div>
                { (searchQuery || dateRange) && (
                    <Button variant="ghost" size="sm" onClick={() => { setSearchQuery(''); setDateRange({ from: new Date(), to: new Date() }); }} className="h-10 px-4 font-bold text-muted-foreground uppercase text-[10px]">
                        <FilterX className="mr-1.5 h-4 w-4" /> Reset Filters
                    </Button>
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* 1. Received Section */}
                <Card className="shadow-sm border-emerald-100 bg-white overflow-hidden">
                    <CardHeader className="bg-emerald-50/50 border-b border-emerald-100 py-3">
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-xs font-black uppercase text-emerald-700 tracking-[0.2em] flex items-center gap-2">
                                <ArrowDownLeft className="h-4 w-4" /> Received Payments
                            </CardTitle>
                            <Badge variant="outline" className="bg-white border-emerald-200 text-emerald-700 text-[10px] font-black h-5">
                                {stats.received.length} entries
                            </Badge>
                        </div>
                    </CardHeader>
                    <CardContent className="p-0">
                        <Table className="text-xs">
                            <TableHeader>
                                <TableRow className="hover:bg-transparent">
                                    <TableHead className="pl-6 font-bold uppercase text-[9px]">Date (BS)</TableHead>
                                    <TableHead className="font-bold uppercase text-[9px]">Party / Description</TableHead>
                                    <TableHead className="text-right font-bold uppercase text-[9px]">Amount</TableHead>
                                    <TableHead className="w-10 pr-4"></TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {stats.received.map(e => (
                                    <TableRow key={e.id} className="h-12 hover:bg-emerald-50/20 group">
                                        <TableCell className="pl-6 text-muted-foreground font-mono">{toNepaliDate(e.date)}</TableCell>
                                        <TableCell>
                                            <div className="flex flex-col">
                                                <span className="font-black text-gray-900 uppercase tracking-tighter">{e.partyName}</span>
                                                <span className="text-[10px] text-muted-foreground italic truncate max-w-[200px]">{e.description || 'No notes'}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-right font-black text-emerald-700 tabular-nums">Rs. {e.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                        <TableCell className="pr-4 text-right">
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"><MoreHorizontal className="h-3.5 w-3.5"/></Button></DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    <DropdownMenuItem onSelect={() => handleOpenEditDialog(e)}><Edit className="mr-2 h-4 w-4" /> Edit</DropdownMenuItem>
                                                    <DropdownMenuItem className="text-destructive" onSelect={() => deletePaymentEntry(e.id)}><Trash2 className="mr-2 h-4 w-4" /> Delete</DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {stats.received.length === 0 && <TableRow><TableCell colSpan={4} className="h-32 text-center text-muted-foreground italic">No receipts logged.</TableCell></TableRow>}
                            </TableBody>
                            <TableFooter className="bg-emerald-50/30 font-black">
                                <TableRow>
                                    <TableCell colSpan={2} className="pl-6 text-right uppercase text-[9px] tracking-widest">Total Receipts</TableCell>
                                    <TableCell className="text-right text-emerald-800 text-sm tabular-nums">Rs. {stats.totalReceived.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                    <TableCell />
                                </TableRow>
                            </TableFooter>
                        </Table>
                    </CardContent>
                </Card>

                {/* 2. Outflow Section */}
                <Card className="shadow-sm border-red-100 bg-white overflow-hidden">
                    <CardHeader className="bg-red-50/50 border-b border-red-100 py-3">
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-xs font-black uppercase text-red-700 tracking-[0.2em] flex items-center gap-2">
                                <ArrowUpRight className="h-4 w-4" /> Payment Outflows
                            </CardTitle>
                            <Badge variant="outline" className="bg-white border-red-200 text-red-700 text-[10px] font-black h-5">
                                {stats.outflows.length} entries
                            </Badge>
                        </div>
                    </CardHeader>
                    <CardContent className="p-0">
                        <Table className="text-xs">
                            <TableHeader>
                                <TableRow className="hover:bg-transparent">
                                    <TableHead className="pl-6 font-bold uppercase text-[9px]">Date (BS)</TableHead>
                                    <TableHead className="font-bold uppercase text-[9px]">Party / Description</TableHead>
                                    <TableHead className="text-right font-bold uppercase text-[9px]">Amount</TableHead>
                                    <TableHead className="w-10 pr-4"></TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {stats.outflows.map(e => (
                                    <TableRow key={e.id} className="h-12 hover:bg-red-50/20 group">
                                        <TableCell className="pl-6 text-muted-foreground font-mono">{toNepaliDate(e.date)}</TableCell>
                                        <TableCell>
                                            <div className="flex flex-col">
                                                <span className="font-black text-gray-900 uppercase tracking-tighter">{e.partyName}</span>
                                                <span className="text-[10px] text-muted-foreground italic truncate max-w-[200px]">{e.description || 'No notes'}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-right font-black text-red-700 tabular-nums">Rs. {e.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                        <TableCell className="pr-4 text-right">
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"><MoreHorizontal className="h-3.5 w-3.5"/></Button></DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    <DropdownMenuItem onSelect={() => handleOpenEditDialog(e)}><Edit className="mr-2 h-4 w-4" /> Edit</DropdownMenuItem>
                                                    <DropdownMenuItem className="text-destructive" onSelect={() => deletePaymentEntry(e.id)}><Trash2 className="mr-2 h-4 w-4" /> Delete</DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {stats.outflows.length === 0 && <TableRow><TableCell colSpan={4} className="h-32 text-center text-muted-foreground italic">No outflows logged.</TableCell></TableRow>}
                            </TableBody>
                            <TableFooter className="bg-red-50/30 font-black">
                                <TableRow>
                                    <TableCell colSpan={2} className="pl-6 text-right uppercase text-[9px] tracking-widest">Total Payments</TableCell>
                                    <TableCell className="text-right text-red-800 text-sm tabular-nums">Rs. {stats.totalOutflow.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                    <TableCell />
                                </TableRow>
                            </TableFooter>
                        </Table>
                    </CardContent>
                </Card>
            </div>

            {/* Entry Dialog */}
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-black uppercase tracking-tight flex items-center gap-2">
                            {form.type === 'Received' ? <TrendingUp className="text-emerald-600" /> : <TrendingDown className="text-red-600" />}
                            {editingEntry ? 'Modify Ledger Entry' : `Record ${form.type}`}
                        </DialogTitle>
                        <DialogDescription>Input the payment details for accurate tracking.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-5 py-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-black uppercase text-muted-foreground">Entry Date</Label>
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <Button variant="outline" className="w-full justify-start h-10 bg-white font-bold text-xs">
                                            <CalendarIcon className="mr-2 h-4 w-4 opacity-50" />
                                            {toNepaliDate(form.date.toISOString())}
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0" align="start">
                                        <DualCalendar selected={form.date} onSelect={d => d && setForm({...form, date: d})} />
                                    </PopoverContent>
                                </Popover>
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-black uppercase text-muted-foreground">Amount (NPR)</Label>
                                <Input type="number" step="0.01" value={form.amount} onChange={e => setForm({...form, amount: e.target.value})} className="h-10 font-black text-lg" placeholder="0.00" />
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-[10px] font-black uppercase text-muted-foreground">Party Name</Label>
                            <Input value={form.partyName} onChange={e => setForm({...form, partyName: e.target.value})} placeholder="Full name of beneficiary/source" className="h-10 font-bold" />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-[10px] font-black uppercase text-muted-foreground">Bill Description / Note</Label>
                            <Textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})} placeholder="Bill number, project reference, etc." className="min-h-[80px] text-sm resize-none" />
                        </div>
                    </div>
                    <DialogFooter>
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

function SummaryCard({ title, value, icon: Icon, color }: any) {
    const colors: any = {
        emerald: "border-l-emerald-600 bg-emerald-50/50 text-emerald-700",
        red: "border-l-red-600 bg-red-50/50 text-red-700",
    };
    return (
        <Card className={cn("border-l-4 shadow-sm h-full", colors[color])}>
            <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                    <div className="space-y-1">
                        <p className="text-[10px] font-black uppercase tracking-widest opacity-70">{title}</p>
                        <p className="text-2xl font-black tabular-nums">Rs. {value.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                    </div>
                    <div className="p-3 rounded-xl bg-white shadow-inner">
                        <Icon className="h-5 w-5 opacity-80" />
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
