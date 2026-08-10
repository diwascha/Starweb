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
    Check, 
    Calendar as CalendarIconLucide, 
    X,
    ChevronLeft,
    ChevronRight
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
    
    const [entries, setEntries] = useState<PaymentTrackerEntry[]>([]);
    const [isLoading, setIsLoading] = useState(true);
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
        <div className="flex flex-col gap-2 max-w-5xl mx-auto">
            <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-1">
                <div>
                    <h1 className="text-xl font-black text-gray-900 tracking-tighter uppercase leading-none">Payment Tracker</h1>
                    <p className="text-muted-foreground text-[9px] font-bold uppercase tracking-tight italic">Digital Daily Ledger</p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" onClick={handleExportExcel} className="h-7 font-bold text-[8px] uppercase tracking-widest gap-1 border-gray-300">
                        <FileSpreadsheet className="h-3 w-3 text-emerald-600" /> Export XLSX
                    </Button>
                </div>
            </header>

            {/* Filter Toolbar - Super Compact */}
            <div className="flex flex-col md:flex-row gap-2 items-center bg-muted/20 p-1.5 rounded-lg border border-dashed">
                <div className="flex items-center gap-2">
                    <Label className="text-[9px] font-black uppercase text-muted-foreground tracking-widest whitespace-nowrap">Date (AD)</Label>
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button variant="outline" className={cn("h-7 justify-start text-left font-normal bg-white text-[10px] px-2 w-[220px]", !dateRange && "text-muted-foreground")}>
                                <CalendarIconLucide className="mr-1.5 h-3 w-3 opacity-50" />
                                <span className="truncate">
                                    {dateRange?.from ? (
                                        dateRange.to ? `${format(dateRange.from, "PP")} - ${format(dateRange.to, "PP")}` : format(dateRange.from, "PP")
                                    ) : 'Select Date'}
                                </span>
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                            <DualDateRangePicker selected={dateRange} onSelect={setDateRange} />
                        </PopoverContent>
                    </Popover>
                </div>
                <div className="flex items-center gap-2 flex-1 w-full">
                    <Label className="text-[9px] font-black uppercase text-muted-foreground tracking-widest whitespace-nowrap">Search</Label>
                    <div className="relative flex-1">
                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                        <Input 
                            placeholder="Filter data..." 
                            className="pl-6 h-7 text-[10px] bg-white border-gray-200" 
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                        />
                    </div>
                </div>
                {(searchQuery || dateRange) && (
                    <Button variant="ghost" size="sm" onClick={() => { setSearchQuery(''); setDateRange({ from: new Date(), to: new Date() }); }} className="h-7 px-2 font-black text-muted-foreground uppercase text-[8px] tracking-tighter">
                        <FilterX className="mr-1 h-3 w-3" /> Reset
                    </Button>
                )}
            </div>

            <Card className="shadow-none border-gray-200 bg-white overflow-hidden">
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <Table className="border-collapse table-fixed w-full">
                            {/* RECEIVED SECTION */}
                            <TableHeader>
                                <TableRow className="bg-muted/40 hover:bg-muted/40 h-[16px] border-b">
                                    <TableHead colSpan={5} className="py-0 px-2 h-[16px] align-middle">
                                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-800 leading-none">Received Payments</span>
                                    </TableHead>
                                </TableRow>
                                <TableRow className="bg-muted/10 h-[14px]">
                                    <TableHead className="w-8 text-center border-r font-black text-[9px] uppercase px-1 h-[14px]">S.N.</TableHead>
                                    <TableHead className="border-r font-black text-[9px] uppercase px-2 h-[14px]">Party Name</TableHead>
                                    <TableHead className="border-r font-black text-[9px] uppercase px-2 h-[14px]">Bill Description</TableHead>
                                    <TableHead className="text-right font-black text-[9px] uppercase px-3 w-[120px] h-[14px]">Amount</TableHead>
                                    <TableHead className="w-12 px-1 h-[14px]"></TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {receivedEntries.map((e, i) => (
                                    <TableRow key={e.id} className="h-[14px] border-b group hover:bg-muted/5">
                                        <TableCell className="text-center border-r text-[9px] text-muted-foreground px-1 py-0 h-[14px] leading-none">{i + 1}</TableCell>
                                        <TableCell className="border-r p-0 h-[14px]">
                                            {editingId === e.id ? (
                                                <Input value={editForm.partyName} onChange={val => setEditForm({...editForm, partyName: val.target.value})} className="h-full border-none rounded-none focus-visible:ring-1 focus-visible:ring-inset text-[11px] px-2 py-0 leading-none" />
                                            ) : (
                                                <div className="px-2 py-0 text-[11px] font-bold uppercase truncate leading-none flex items-center h-full">{e.partyName}</div>
                                            )}
                                        </TableCell>
                                        <TableCell className="border-r p-0 h-[14px]">
                                            {editingId === e.id ? (
                                                <Input value={editForm.description} onChange={val => setEditForm({...editForm, description: val.target.value})} className="h-full border-none rounded-none focus-visible:ring-1 focus-visible:ring-inset text-[11px] px-2 py-0 leading-none" />
                                            ) : (
                                                <div className="px-2 py-0 text-[10px] text-gray-500 italic truncate leading-none flex items-center h-full">{e.description || '—'}</div>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-right border-r p-0 h-[14px]">
                                            {editingId === e.id ? (
                                                <Input type="number" value={editForm.amount} onChange={val => setEditForm({...editForm, amount: val.target.value})} className="h-full border-none rounded-none text-right px-3 font-black text-[11px] py-0 leading-none" />
                                            ) : (
                                                <div className="px-3 py-0 text-[11px] font-black tabular-nums leading-none flex items-center justify-end h-full">{e.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-center px-0 h-[14px] py-0">
                                            <div className="flex items-center justify-center h-full gap-0.5 opacity-100 lg:opacity-0 group-hover:opacity-100 transition-opacity">
                                                {editingId === e.id ? (
                                                    <Button variant="ghost" size="icon" className="h-3 w-3 text-emerald-600 p-0" onClick={() => handleUpdate(e.id)}><Check className="h-2.5 w-2.5"/></Button>
                                                ) : (
                                                    <Button variant="ghost" size="icon" className="h-3 w-3 p-0" onClick={() => startEditing(e)}><Edit className="h-2.5 w-2.5 text-muted-foreground"/></Button>
                                                )}
                                                <Button variant="ghost" size="icon" className="h-3 w-3 text-destructive p-0" onClick={() => deletePaymentEntry(e.id)}><Trash2 className="h-2.5 w-2.5"/></Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                                
                                {/* New Received Row */}
                                <TableRow className="h-[18px] bg-primary/[0.03] border-b">
                                    <TableCell className="text-center border-r text-[8px] font-black text-primary px-1 leading-none py-0 h-[18px]">NEW</TableCell>
                                    <TableCell className="border-r p-0 h-[18px]">
                                        <Input placeholder="Enter party..." value={newReceived.partyName} onChange={e => setNewReceived({...newReceived, partyName: e.target.value})} className="h-full border-none rounded-none focus-visible:ring-1 focus-visible:ring-inset font-bold text-[11px] uppercase px-2 py-0" />
                                    </TableCell>
                                    <TableCell className="border-r p-0 h-[18px]">
                                        <Input placeholder="Note..." value={newReceived.description} onChange={e => setNewReceived({...newReceived, description: e.target.value})} className="h-full border-none rounded-none focus-visible:ring-1 focus-visible:ring-inset text-[10px] italic px-2 py-0" />
                                    </TableCell>
                                    <TableCell className="border-r p-0 h-[18px]">
                                        <Input type="number" placeholder="0.00" value={newReceived.amount} onChange={e => setNewReceived({...newReceived, amount: e.target.value})} className="h-full border-none rounded-none text-right px-3 font-black text-[11px] py-0" />
                                    </TableCell>
                                    <TableCell className="text-center p-0 h-[18px]">
                                        <Button size="icon" variant="ghost" onClick={() => handleAdd('Received')} className="h-full w-full rounded-none text-primary hover:bg-primary/10">
                                            <Plus className="h-3.5 w-3.5"/>
                                        </Button>
                                    </TableCell>
                                </TableRow>

                                <TableRow className="bg-blue-50/50 font-black h-[18px] border-b-2 border-gray-400">
                                    <TableCell className="border-r px-1 h-[18px]"></TableCell>
                                    <TableCell colSpan={2} className="uppercase tracking-widest text-[9px] border-r px-3 text-right h-[18px] align-middle">Total Received</TableCell>
                                    <TableCell className="text-right tabular-nums text-[11px] px-3 border-r h-[18px] align-middle text-blue-900">{totalReceived.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                    <TableCell className="h-[18px]" />
                                </TableRow>
                            </TableBody>

                            {/* SPACER */}
                            <TableBody>
                                <TableRow className="h-[6px] hover:bg-transparent border-none"><TableCell colSpan={5}></TableCell></TableRow>
                            </TableBody>

                            {/* PAYMENT SECTION */}
                            <TableHeader>
                                <TableRow className="bg-muted/40 hover:bg-muted/40 h-[16px] border-b">
                                    <TableHead colSpan={5} className="py-0 px-2 h-[16px] align-middle">
                                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-red-800 leading-none">Payment Outflows</span>
                                    </TableHead>
                                </TableRow>
                                <TableRow className="bg-muted/10 h-[14px]">
                                    <TableHead className="w-8 text-center border-r font-black text-[9px] uppercase px-1 h-[14px]">S.N.</TableHead>
                                    <TableHead className="border-r font-black text-[9px] uppercase px-2 h-[14px]">Party Name</TableHead>
                                    <TableHead className="border-r font-black text-[9px] uppercase px-2 h-[14px]">Bill Description</TableHead>
                                    <TableHead className="text-right font-black text-[9px] uppercase px-3 w-[120px] h-[14px]">Amount</TableHead>
                                    <TableHead className="w-12 px-1 h-[14px]"></TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {outflowEntries.map((e, i) => (
                                    <TableRow key={e.id} className="h-[14px] border-b group hover:bg-muted/5">
                                        <TableCell className="text-center border-r text-[9px] text-muted-foreground px-1 py-0 h-[14px] leading-none">{i + 1}</TableCell>
                                        <TableCell className="border-r p-0 h-[14px]">
                                            {editingId === e.id ? (
                                                <Input value={editForm.partyName} onChange={val => setEditForm({...editForm, partyName: val.target.value})} className="h-full border-none rounded-none focus-visible:ring-1 focus-visible:ring-inset text-[11px] px-2 py-0 leading-none" />
                                            ) : (
                                                <div className="px-2 py-0 text-[11px] font-bold uppercase truncate leading-none flex items-center h-full">{e.partyName}</div>
                                            )}
                                        </TableCell>
                                        <TableCell className="border-r p-0 h-[14px]">
                                            {editingId === e.id ? (
                                                <Input value={editForm.description} onChange={val => setEditForm({...editForm, description: val.target.value})} className="h-full border-none rounded-none focus-visible:ring-1 focus-visible:ring-inset text-[11px] px-2 py-0 leading-none" />
                                            ) : (
                                                <div className="px-2 py-0 text-[10px] text-gray-500 italic truncate leading-none flex items-center h-full">{e.description || '—'}</div>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-right border-r p-0 h-[14px]">
                                            {editingId === e.id ? (
                                                <Input type="number" value={editForm.amount} onChange={val => setEditForm({...editForm, amount: val.target.value})} className="h-full border-none rounded-none text-right px-3 font-black text-[11px] py-0 leading-none" />
                                            ) : (
                                                <div className="px-3 py-0 text-[11px] font-black tabular-nums leading-none flex items-center justify-end h-full">{e.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-center px-0 h-[14px] py-0">
                                            <div className="flex items-center justify-center h-full gap-0.5 opacity-100 lg:opacity-0 group-hover:opacity-100 transition-opacity">
                                                {editingId === e.id ? (
                                                    <Button variant="ghost" size="icon" className="h-3 w-3 text-emerald-600 p-0" onClick={() => handleUpdate(e.id)}><Check className="h-2.5 w-2.5"/></Button>
                                                ) : (
                                                    <Button variant="ghost" size="icon" className="h-3 w-3 p-0" onClick={() => startEditing(e)}><Edit className="h-2.5 w-2.5 text-muted-foreground"/></Button>
                                                )}
                                                <Button variant="ghost" size="icon" className="h-3 w-3 text-destructive p-0" onClick={() => deletePaymentEntry(e.id)}><Trash2 className="h-2.5 w-2.5"/></Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}

                                {/* New Outflow Row */}
                                <TableRow className="h-[18px] bg-destructive/[0.03] border-b">
                                    <TableCell className="text-center border-r text-[8px] font-black text-destructive px-1 leading-none py-0 h-[18px]">NEW</TableCell>
                                    <TableCell className="border-r p-0 h-[18px]">
                                        <Input placeholder="Enter party..." value={newOutflow.partyName} onChange={e => setNewOutflow({...newOutflow, partyName: e.target.value})} className="h-full border-none rounded-none focus-visible:ring-1 focus-visible:ring-inset font-bold text-[11px] uppercase px-2 py-0" />
                                    </TableCell>
                                    <TableCell className="border-r p-0 h-[18px]">
                                        <Input placeholder="Note..." value={newOutflow.description} onChange={e => setNewOutflow({...newOutflow, description: e.target.value})} className="h-full border-none rounded-none focus-visible:ring-1 focus-visible:ring-inset text-[10px] italic px-2 py-0" />
                                    </TableCell>
                                    <TableCell className="border-r p-0 h-[18px]">
                                        <Input type="number" placeholder="0.00" value={newOutflow.amount} onChange={e => setNewOutflow({...newOutflow, amount: e.target.value})} className="h-full border-none rounded-none text-right px-3 font-black text-[11px] py-0" />
                                    </TableCell>
                                    <TableCell className="text-center p-0 h-[18px]">
                                        <Button size="icon" variant="ghost" onClick={() => handleAdd('Outflow')} className="h-full w-full rounded-none text-destructive hover:bg-destructive/10">
                                            <Plus className="h-3.5 w-3.5"/>
                                        </Button>
                                    </TableCell>
                                </TableRow>

                                <TableRow className="bg-red-50/50 font-black h-[18px] border-b-2 border-gray-400">
                                    <TableCell className="border-r px-1 h-[18px]"></TableCell>
                                    <TableCell colSpan={2} className="uppercase tracking-widest text-[9px] border-r px-3 text-right h-[18px] align-middle">Total Outflow</TableCell>
                                    <TableCell className="text-right tabular-nums text-[11px] px-3 border-r h-[18px] align-middle text-red-900">{totalOutflow.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                    <TableCell className="h-[18px]" />
                                </TableRow>
                            </TableBody>

                            {/* FINAL BALANCE FOOTER */}
                            <TableBody>
                                <TableRow className="h-[4px] hover:bg-transparent border-none"><TableCell colSpan={5}></TableCell></TableRow>
                                <TableRow className="bg-emerald-50/20 border-t-2 border-gray-900 h-[22px]">
                                    <TableCell className="text-center border-r px-1 h-[22px]"></TableCell>
                                    <TableCell colSpan={2} className="uppercase tracking-[0.4em] font-black text-[10px] text-gray-900 px-6 h-[22px] align-middle">Net Daily Balance</TableCell>
                                    <TableCell className={cn(
                                        "text-right tabular-nums text-xs px-3 font-black border-r h-[22px] align-middle",
                                        netBalance >= 0 ? "text-emerald-700" : "text-red-700"
                                    )}>
                                        {netBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </TableCell>
                                    <TableCell className="h-[22px]" />
                                </TableRow>
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>

            <div className="p-1 bg-muted/10 rounded-lg border border-dashed flex items-center gap-2">
                <Badge variant="outline" className="bg-white uppercase text-[7px] font-black tracking-widest px-1 h-3.5">System</Badge>
                <p className="text-[8px] text-muted-foreground font-black uppercase tracking-tight leading-none">
                    High-Density Operational Grid &middot; Real-time synchronization active.
                </p>
            </div>
        </div>
    );
}
