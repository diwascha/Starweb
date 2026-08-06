'use client';

import { useState, useEffect, useMemo } from 'react';
import { 
    Plus, 
    Search, 
    MoreHorizontal, 
    Edit, 
    Trash2, 
    FileText, 
    Check, 
    ChevronsUpDown,
    Calendar,
    Loader2,
    X,
    ShoppingCart
} from 'lucide-react';
import NepaliDate from 'nepali-date-converter';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import type { Quotation, QuotationItem, QuotationStatus, Party, Deal } from '@/lib/types';
import { onQuotationsUpdate, addQuotation, updateQuotation, deleteQuotation } from '@/services/quotation-service';
import { onPartiesUpdate } from '@/services/party-service';
import { onDealsUpdate, updateDeal } from '@/services/deal-service';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { 
    Dialog, 
    DialogContent, 
    DialogHeader, 
    DialogTitle, 
    DialogDescription,
    DialogFooter 
} from '@/components/ui/dialog';
import { 
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogDescription,
    AlertDialogFooter
} from '@/components/ui/alert-dialog';
import { 
    DropdownMenu, 
    DropdownMenuContent, 
    DropdownMenuItem, 
    DropdownMenuTrigger,
    DropdownMenuSeparator
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Textarea } from '@/components/ui/textarea';
import { cn, generateId } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';

export default function QuotationsPage() {
    const { user } = useAuth();
    const { toast } = useToast();
    
    const [quotations, setQuotations] = useState<Quotation[]>([]);
    const [parties, setParties] = useState<Party[]>([]);
    const [deals, setDeals] = useState<Deal[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingQuotation, setEditingQuotation] = useState<Quotation | null>(null);
    const [isCompanyPopoverOpen, setIsCompanyPopoverOpen] = useState(false);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [quotationToDelete, setQuotationToDelete] = useState<string | null>(null);

    const [form, setForm] = useState({
        quotationNumber: '',
        partyId: '',
        dealId: '',
        dateBS: new NepaliDate().format('YYYY/MM/DD'),
        validUntilBS: '',
        status: 'Draft' as QuotationStatus,
        remarks: '',
        items: [] as QuotationItem[]
    });

    useEffect(() => {
        setIsLoading(true);
        const unsubs = [
            onQuotationsUpdate(setQuotations),
            onPartiesUpdate((data) => {
                setParties(data.filter(p => p.type === 'Customer' || p.type === 'Both')
                    .sort((a, b) => a.name.localeCompare(b.name)));
            }),
            onDealsUpdate(setDeals),
        ];
        setIsLoading(false);
        return () => unsubs.forEach(u => u());
    }, []);

    const filteredQuotations = useMemo(() => {
        return quotations.filter(q => 
            q.quotationNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (q.partyName || '').toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [quotations, searchQuery]);

    const handleOpenAddDialog = () => {
        setEditingQuotation(null);
        setForm({
            quotationNumber: `QT-${Date.now().toString().slice(-6)}`,
            partyId: '',
            dealId: '',
            dateBS: new NepaliDate().format('YYYY/MM/DD'),
            validUntilBS: '',
            status: 'Draft',
            remarks: '',
            items: [{ id: generateId(), productName: '', quantity: 1, rate: 0, amount: 0 }]
        });
        setIsDialogOpen(true);
    };

    const handleOpenEditDialog = (q: Quotation) => {
        setEditingQuotation(q);
        setForm({
            quotationNumber: q.quotationNumber,
            partyId: q.partyId,
            dealId: q.dealId || '',
            dateBS: q.dateBS,
            validUntilBS: q.validUntilBS || '',
            status: q.status,
            remarks: q.remarks || '',
            items: q.items.length > 0 ? q.items : [{ id: generateId(), productName: '', quantity: 1, rate: 0, amount: 0 }]
        });
        setIsDialogOpen(true);
    };

    const handleItemChange = (id: string, field: keyof QuotationItem, value: any) => {
        setForm(prev => ({
            ...prev,
            items: prev.items.map(item => {
                if (item.id === id) {
                    const updated = { ...item, [field]: value };
                    if (field === 'quantity' || field === 'rate') {
                        updated.amount = (Number(updated.quantity) || 0) * (Number(updated.rate) || 0);
                    }
                    return updated;
                }
                return item;
            })
        }));
    };

    const addItem = () => {
        setForm(prev => ({
            ...prev,
            items: [...prev.items, { id: generateId(), productName: '', quantity: 1, rate: 0, amount: 0 }]
        }));
    };

    const removeItem = (id: string) => {
        if (form.items.length <= 1) return;
        setForm(prev => ({
            ...prev,
            items: prev.items.filter(item => item.id !== id)
        }));
    };

    const totalAmount = useMemo(() => {
        return form.items.reduce((sum, item) => sum + item.amount, 0);
    }, [form.items]);

    const handleSave = async () => {
        if (!user || !form.quotationNumber || !form.partyId || form.items.length === 0) return;
        
        let dateAD = '';
        try {
            const parts = form.dateBS.split('/');
            const nd = new NepaliDate(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
            dateAD = nd.toJsDate().toISOString();
        } catch {
            toast({ title: 'Invalid Date', description: 'Please use YYYY/MM/DD format.', variant: 'destructive' });
            return;
        }

        const party = parties.find(p => p.id === form.partyId);
        const data: Omit<Quotation, 'id' | 'createdAt'> = {
            ...form,
            partyName: party?.name,
            date: dateAD,
            total: totalAmount,
            createdBy: editingQuotation?.createdBy || user.username
        };

        try {
            if (editingQuotation) {
                await updateQuotation(editingQuotation.id, { ...data, lastModifiedBy: user.username });
                
                // Deal Sync Logic
                if (data.status === 'Sent' && data.dealId) {
                    const deal = deals.find(d => d.id === data.dealId);
                    if (deal && deal.stage === 'Lead') {
                        await updateDeal(deal.id, { stage: 'Quoted', lastModifiedBy: user.username });
                    }
                }
                
                toast({ title: 'Quotation Updated' });
            } else {
                await addQuotation(data);
                toast({ title: 'Quotation Recorded' });
            }
            setIsDialogOpen(false);
        } catch {
            toast({ title: 'Error saving record', variant: 'destructive' });
        }
    };

    const handleUpdateStatus = async (q: Quotation, status: QuotationStatus) => {
        if (!user) return;
        try {
            await updateQuotation(q.id, { status, lastModifiedBy: user.username });
            
            if (status === 'Sent' && q.dealId) {
                const deal = deals.find(d => d.id === q.dealId);
                if (deal && deal.stage === 'Lead') {
                    await updateDeal(deal.id, { stage: 'Quoted', lastModifiedBy: user.username });
                }
            }
            
            toast({ title: `Status updated to ${status}` });
        } catch {
            toast({ title: 'Update failed', variant: 'destructive' });
        }
    };

    const handleDelete = async () => {
        if (!quotationToDelete) return;
        try {
            await deleteQuotation(quotationToDelete);
            setIsDeleteDialogOpen(false);
            setQuotationToDelete(null);
            toast({ title: 'Quotation Removed' });
        } catch {
            toast({ title: 'Delete failed', variant: 'destructive' });
        }
    };

    const getStatusBadge = (status: QuotationStatus) => {
        const variants: Record<QuotationStatus, string> = {
            'Draft': 'bg-gray-100 text-gray-700 border-gray-200',
            'Sent': 'bg-blue-50 text-blue-700 border-blue-200',
            'Accepted': 'bg-emerald-50 text-emerald-700 border-emerald-200',
            'Rejected': 'bg-red-50 text-red-700 border-red-200',
            'Expired': 'bg-amber-50 text-amber-700 border-amber-200'
        };
        return (
            <Badge variant="outline" className={cn("text-[10px] font-black uppercase tracking-widest px-2 h-5", variants[status])}>
                {status}
            </Badge>
        );
    };

    return (
        <div className="flex flex-col gap-8">
            <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-black text-gray-900 tracking-tighter uppercase">Quotation Registry</h1>
                    <p className="text-muted-foreground text-sm font-medium">Issue and track commercial estimates.</p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input 
                            placeholder="Filter quotations..." 
                            className="pl-8 w-64 bg-white h-10 border-gray-300" 
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                        />
                    </div>
                    <Button onClick={handleOpenAddDialog} className="h-10 font-black text-xs uppercase tracking-widest shadow-lg shadow-primary/20 px-6">
                        <Plus className="mr-2 h-4 w-4" /> New Quotation
                    </Button>
                </div>
            </header>

            <Card className="shadow-sm border-gray-100 bg-white overflow-hidden">
                <CardContent className="p-0">
                    <Table>
                        <TableHeader className="bg-muted/50">
                            <TableRow className="hover:bg-transparent">
                                <TableHead className="pl-6 font-black uppercase text-[10px] tracking-widest h-11">Ref #</TableHead>
                                <TableHead className="font-black uppercase text-[10px] tracking-widest h-11">Client Account</TableHead>
                                <TableHead className="font-black uppercase text-[10px] tracking-widest h-11">Date (BS)</TableHead>
                                <TableHead className="font-black uppercase text-[10px] tracking-widest h-11">Total Amount</TableHead>
                                <TableHead className="font-black uppercase text-[10px] tracking-widest h-11 text-center">Status</TableHead>
                                <TableHead className="text-right pr-6 font-black uppercase text-[10px] tracking-widest h-11">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableRow><TableCell colSpan={6} className="text-center py-20"><Loader2 className="h-8 w-8 animate-spin mx-auto opacity-20"/></TableCell></TableRow>
                            ) : filteredQuotations.map(q => (
                                <TableRow key={q.id} className="hover:bg-muted/30 h-14">
                                    <TableCell className="pl-6 font-black text-blue-700 uppercase tracking-tighter">{q.quotationNumber}</TableCell>
                                    <TableCell className="font-bold text-gray-900">{q.partyName}</TableCell>
                                    <TableCell className="font-mono text-xs text-gray-500">{q.dateBS}</TableCell>
                                    <TableCell className="font-black text-gray-900">Rs. {q.total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</TableCell>
                                    <TableCell className="text-center">{getStatusBadge(q.status)}</TableCell>
                                    <TableCell className="text-right pr-6">
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4"/></Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end" className="w-48">
                                                <DropdownMenuItem onSelect={() => handleOpenEditDialog(q)}><Edit className="mr-2 h-4 w-4"/> Edit Details</DropdownMenuItem>
                                                <DropdownMenuSeparator />
                                                <DropdownMenuLabel className="text-[9px] uppercase font-black px-2 py-1 text-muted-foreground">Change Status</DropdownMenuLabel>
                                                {(['Draft', 'Sent', 'Accepted', 'Rejected', 'Expired'] as QuotationStatus[]).filter(s => s !== q.status).map(s => (
                                                    <DropdownMenuItem key={s} onSelect={() => handleUpdateStatus(q, s)}>{s}</DropdownMenuItem>
                                                ))}
                                                <DropdownMenuSeparator />
                                                <DropdownMenuItem className="text-destructive" onSelect={() => { setQuotationToDelete(q.id); setIsDeleteDialogOpen(true); }}>
                                                    <Trash2 className="mr-2 h-4 w-4"/> Delete
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </TableCell>
                                </TableRow>
                            ))}
                            {!isLoading && filteredQuotations.length === 0 && (
                                <TableRow><TableCell colSpan={6} className="h-40 text-center text-muted-foreground italic uppercase text-xs font-black opacity-30 tracking-widest">No quotations issued.</TableCell></TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="sm:max-w-4xl max-h-[95vh] flex flex-col p-0 border-none shadow-2xl overflow-hidden">
                    <DialogHeader className="p-6 border-b bg-muted/5 shrink-0">
                        <DialogTitle className="text-xl font-black text-gray-900 uppercase tracking-tight">
                            {editingQuotation ? 'Amend Quotation' : 'New Estimate Request'}
                        </DialogTitle>
                        <DialogDescription>Draft formal commercial terms and pricing.</DialogDescription>
                    </DialogHeader>

                    <ScrollArea className="flex-1">
                        <div className="p-6 space-y-8">
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                                <div className="space-y-1.5">
                                    <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Reference #</Label>
                                    <Input value={form.quotationNumber} onChange={e => setForm({...form, quotationNumber: e.target.value})} className="h-9 font-bold" />
                                </div>
                                <div className="space-y-1.5 lg:col-span-2">
                                    <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Client Account</Label>
                                    <Popover open={isCompanyPopoverOpen} onOpenChange={setIsCompanyPopoverOpen}>
                                        <PopoverTrigger asChild>
                                            <Button variant="outline" role="combobox" className="w-full justify-between h-9 text-xs font-normal">
                                                {form.partyId ? parties.find(p => p.id === form.partyId)?.name : "Search company registry..."}
                                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="p-0 w-[--radix-popover-trigger-width]">
                                            <Command>
                                                <CommandInput placeholder="Filter clients..." className="h-9" />
                                                <CommandList>
                                                    <CommandEmpty>No accounts found.</CommandEmpty>
                                                    <CommandGroup>
                                                        {parties.map(p => (
                                                            <CommandItem key={p.id} value={p.name} onSelect={() => { setForm({...form, partyId: p.id, dealId: ''}); setIsCompanyPopoverOpen(false); }} className="text-xs">
                                                                <Check className={cn("mr-2 h-4 w-4", form.partyId === p.id ? "opacity-100" : "opacity-0")} />
                                                                {p.name}
                                                            </CommandItem>
                                                        ))}
                                                    </CommandGroup>
                                                </CommandList>
                                            </Command>
                                        </PopoverContent>
                                    </Popover>
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Issue Date (BS)</Label>
                                    <div className="relative">
                                        <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                                        <Input value={form.dateBS} onChange={e => setForm({...form, dateBS: e.target.value})} placeholder="YYYY/MM/DD" className="pl-8 h-9 font-mono text-xs" />
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                <div className="space-y-1.5">
                                    <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Linked Deal Context</Label>
                                    <Select value={form.dealId} onValueChange={v => setForm({...form, dealId: v})}>
                                        <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Associate with opportunity..."/></SelectTrigger>
                                        <SelectContent>
                                            {deals.filter(d => d.partyId === form.partyId).map(d => (
                                                <SelectItem key={d.id} value={d.id} className="text-xs">{d.title} (Rs. {d.value?.toLocaleString()})</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Valid Until (BS)</Label>
                                    <Input value={form.validUntilBS} onChange={e => setForm({...form, validUntilBS: e.target.value})} placeholder="YYYY/MM/DD" className="h-9 font-mono text-xs" />
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Document Status</Label>
                                    <Select value={form.status} onValueChange={v => setForm({...form, status: v as any})}>
                                        <SelectTrigger className="h-9 text-xs font-black uppercase tracking-tight"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="Draft">Draft</SelectItem>
                                            <SelectItem value="Sent">Sent to Client</SelectItem>
                                            <SelectItem value="Accepted">Accepted</SelectItem>
                                            <SelectItem value="Rejected">Rejected</SelectItem>
                                            <SelectItem value="Expired">Expired</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div className="flex items-center justify-between border-b pb-2">
                                    <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-primary flex items-center gap-2">
                                        <ShoppingCart className="h-4 w-4"/> Line Items Breakdown
                                    </h3>
                                    <Button type="button" variant="outline" size="sm" onClick={addItem} className="h-8 text-[10px] font-black uppercase tracking-widest">
                                        <Plus className="mr-1.5 h-3 w-3"/> Add Item
                                    </Button>
                                </div>
                                
                                <div className="space-y-3">
                                    {form.items.map((item, idx) => (
                                        <div key={item.id} className="grid grid-cols-1 md:grid-cols-[2fr_1fr_1.5fr_1.2fr_40px] gap-3 items-end group">
                                            <div className="space-y-1">
                                                {idx === 0 && <Label className="text-[8px] uppercase font-black opacity-50">Particulars</Label>}
                                                <Input value={item.productName} onChange={e => handleItemChange(item.id, 'productName', e.target.value)} placeholder="Description..." className="h-9 text-xs" />
                                            </div>
                                            <div className="space-y-1">
                                                {idx === 0 && <Label className="text-[8px] uppercase font-black opacity-50 text-center">Qty</Label>}
                                                <Input type="number" value={item.quantity} onChange={e => handleItemChange(item.id, 'quantity', e.target.value)} className="h-9 text-xs text-center font-bold" />
                                            </div>
                                            <div className="space-y-1">
                                                {idx === 0 && <Label className="text-[8px] uppercase font-black opacity-50 text-right">Unit Rate (रु)</Label>}
                                                <div className="relative">
                                                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[9px] font-bold opacity-30">Rs.</span>
                                                    <Input type="number" value={item.rate} onChange={e => handleItemChange(item.id, 'rate', e.target.value)} className="h-9 text-xs text-right font-black pl-7" />
                                                </div>
                                            </div>
                                            <div className="space-y-1">
                                                {idx === 0 && <Label className="text-[8px] uppercase font-black opacity-50 text-right">Row Total</Label>}
                                                <Input readOnly value={item.amount.toLocaleString()} className="h-9 text-xs text-right bg-muted/30 border-none font-black tabular-nums" />
                                            </div>
                                            <Button type="button" variant="ghost" size="icon" onClick={() => removeItem(item.id)} disabled={form.items.length === 1} className="h-9 w-9 text-destructive hover:bg-red-50">
                                                <X className="h-4 w-4"/>
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-8 border-t">
                                <div className="space-y-1.5">
                                    <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Internal Narrative</Label>
                                    <Textarea value={form.remarks} onChange={e => setForm({...form, remarks: e.target.value})} placeholder="Payment terms, logistics notes, or special discounts..." className="min-h-[100px] text-xs resize-none" />
                                </div>
                                <div className="flex flex-col justify-center items-end bg-muted/10 p-6 rounded-2xl border-2 border-dashed border-muted-foreground/10">
                                    <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest mb-1">Grand Total Estimate</p>
                                    <h4 className="text-3xl font-black text-gray-900 tabular-nums tracking-tighter">
                                        Rs. {totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                    </h4>
                                    <p className="text-[9px] font-bold text-primary uppercase mt-2 italic">Excluding Applicable Taxes</p>
                                </div>
                            </div>
                        </div>
                    </ScrollArea>

                    <DialogFooter className="p-6 border-t bg-white shrink-0">
                        <Button variant="outline" onClick={() => setIsDialogOpen(false)} className="h-11 font-bold text-xs uppercase tracking-widest px-8">Discard</Button>
                        <Button onClick={handleSave} className="h-11 px-12 font-black text-xs uppercase tracking-[0.2em] shadow-xl shadow-primary/20">
                            Commit Record
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-xl font-black text-gray-900 uppercase tracking-tight">Purge Quotation?</AlertDialogTitle>
                        <AlertDialogDescription>This will permanently remove the commercial estimate. Historical data linked to the deal pipeline will be disconnected.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel className="font-bold text-xs uppercase">Keep Record</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground font-black text-xs uppercase shadow-xl shadow-destructive/20">Purge Data</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}

function DropdownMenuLabel({ className, children }: { className?: string, children: React.ReactNode }) {
    return <div className={cn("px-2 py-1.5 text-sm font-semibold", className)}>{children}</div>;
}
