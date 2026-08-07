'use client';

import { useState, useEffect, useMemo } from 'react';
import { 
    Plus, 
    MoreHorizontal, 
    Edit, 
    Trash2, 
    Check, 
    ChevronsUpDown,
    Calendar,
    Target,
    Clock,
    AlertCircle,
    Loader2,
    Search,
    FilterX,
    Building2,
    ArrowUpDown
} from 'lucide-react';
import NepaliDate from 'nepali-date-converter';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import type { Deal, DealStage, Party } from '@/lib/types';
import { onDealsUpdate, addDeal, updateDeal, deleteDeal } from '@/services/deal-service';
import { onPartiesUpdate } from '@/services/party-service';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
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
    AlertDialogFooter,
    AlertDialogTrigger
} from '@/components/ui/alert-dialog';
import { 
    DropdownMenu, 
    DropdownMenuContent, 
    DropdownMenuItem, 
    DropdownMenuTrigger,
    DropdownMenuSeparator,
    DropdownMenuLabel
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format } from 'date-fns';

const STAGES: DealStage[] = ['Lead', 'Quoted', 'Negotiation', 'Won', 'Lost'];
const LOST_REASONS = ['Price', 'Competitor', 'Timing', 'No Response', 'Other'];

export default function DealsPipelinePage() {
    const { user } = useAuth();
    const { toast } = useToast();
    
    const [deals, setDeals] = useState<Deal[]>([]);
    const [parties, setParties] = useState<Party[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    
    const [searchQuery, setSearchQuery] = useState('');
    const [stageFilter, setStageFilter] = useState<string>('All');
    const [sortConfig, setSortConfig] = useState<{ key: keyof Deal; direction: 'asc' | 'desc' }>({ key: 'createdAt', direction: 'desc' });

    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingDeal, setEditingDeal] = useState<Deal | null>(null);
    const [isCompanyPopoverOpen, setIsCompanyPopoverOpen] = useState(false);
    const [isLostDialogOpen, setIsLostDialogOpen] = useState(false);
    const [dealToLose, setDealToLose] = useState<Deal | null>(null);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [dealToDelete, setDealToDelete] = useState<string | null>(null);

    const [form, setForm] = useState({
        title: '',
        partyId: '',
        value: 0,
        stage: 'Lead' as DealStage,
        expectedCloseDateBS: '',
        notes: ''
    });

    const [lostForm, setLostForm] = useState({ reason: '', otherText: '' });

    useEffect(() => {
        setIsLoading(true);
        const unsubs = [
            onDealsUpdate(setDeals),
            onPartiesUpdate((data) => {
                setParties(data.filter(p => p.type === 'Customer' || p.type === 'Both')
                    .sort((a, b) => a.name.localeCompare(b.name)));
                setIsLoading(false);
            })
        ];
        return () => unsubs.forEach(u => u());
    }, []);

    const filteredAndSortedDeals = useMemo(() => {
        let filtered = [...deals];

        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            filtered = filtered.filter(d => 
                d.title.toLowerCase().includes(q) || 
                (d.partyName || '').toLowerCase().includes(q)
            );
        }

        if (stageFilter !== 'All') {
            filtered = filtered.filter(d => d.stage === stageFilter);
        }

        filtered.sort((a, b) => {
            const aVal = a[sortConfig.key] || '';
            const bVal = b[sortConfig.key] || '';
            if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });

        return filtered;
    }, [deals, searchQuery, stageFilter, sortConfig]);

    const handleOpenAddDialog = () => {
        setEditingDeal(null);
        setForm({
            title: '',
            partyId: '',
            value: 0,
            stage: 'Lead',
            expectedCloseDateBS: '',
            notes: ''
        });
        setIsDialogOpen(true);
    };

    const handleOpenEditDialog = (deal: Deal) => {
        setEditingDeal(deal);
        setForm({
            title: deal.title,
            partyId: deal.partyId,
            value: deal.value,
            stage: deal.stage,
            expectedCloseDateBS: deal.expectedCloseDateBS || '',
            notes: deal.notes || ''
        });
        setIsDialogOpen(true);
    };

    const handleSave = async () => {
        if (!user || !form.title || !form.partyId) return;
        
        let expectedCloseDateAD = null;
        if (form.expectedCloseDateBS) {
            const parts = form.expectedCloseDateBS.split('/');
            if (parts.length === 3) {
                try {
                    const nd = new NepaliDate(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
                    expectedCloseDateAD = nd.toJsDate().toISOString();
                } catch {
                    toast({ title: 'Invalid Date', description: 'Please use YYYY/MM/DD format.', variant: 'destructive' });
                    return;
                }
            }
        }

        const party = parties.find(p => p.id === form.partyId);
        const data: any = {
            ...form,
            partyName: party?.name,
            expectedCloseDate: expectedCloseDateAD,
            value: Number(form.value) || 0,
            lastModifiedAt: new Date().toISOString()
        };

        try {
            if (editingDeal) {
                await updateDeal(editingDeal.id, { ...data, lastModifiedBy: user.username });
                toast({ title: 'Opportunity Updated' });
            } else {
                await addDeal({ 
                    ...data, 
                    createdBy: user.username,
                    createdAt: new Date().toISOString()
                });
                toast({ title: 'Opportunity Created' });
            }
            setIsDialogOpen(false);
        } catch {
            toast({ title: 'Error saving opportunity', variant: 'destructive' });
        }
    };

    const handleMoveStage = async (deal: Deal, newStage: DealStage) => {
        if (!user) return;
        if ((newStage as string) === 'Lost') {
            setDealToLose(deal);
            setLostForm({ reason: '', otherText: '' });
            setIsLostDialogOpen(true);
            return;
        }

        const updates: Partial<Deal> = { 
            stage: newStage,
            lastModifiedBy: user.username 
        };
        
        if ((newStage as string) === 'Won' || (newStage as string) === 'Lost') {
            updates.closedAt = new Date().toISOString();
        }

        try {
            await updateDeal(deal.id, updates);
            toast({ title: `Moved to ${newStage}` });
        } catch {
            toast({ title: 'Update failed', variant: 'destructive' });
        }
    };

    const handleConfirmLost = async () => {
        if (!user || !dealToLose || !lostForm.reason) return;
        const finalReason = lostForm.reason === 'Other' ? `Other: ${lostForm.otherText}` : lostForm.reason;
        try {
            await updateDeal(dealToLose.id, {
                stage: 'Lost' as DealStage,
                lostReason: finalReason,
                closedAt: new Date().toISOString(),
                lastModifiedBy: user.username
            });
            setIsLostDialogOpen(false);
            setDealToLose(null);
            toast({ title: 'Deal marked as Lost' });
        } catch {
            toast({ title: 'Update failed', variant: 'destructive' });
        }
    };

    const handleDelete = async () => {
        if (!dealToDelete) return;
        try {
            await deleteDeal(dealToDelete);
            setIsDeleteDialogOpen(false);
            setDealToDelete(null);
            toast({ title: 'Opportunity Removed' });
        } catch {
            toast({ title: 'Delete failed', variant: 'destructive' });
        }
    };

    const getStageBadge = (stage: DealStage) => {
        const variants: Record<DealStage, string> = {
            'Lead': 'bg-blue-50 text-blue-700 border-blue-200',
            'Quoted': 'bg-indigo-50 text-indigo-700 border-indigo-200',
            'Negotiation': 'bg-amber-50 text-amber-700 border-amber-200',
            'Won': 'bg-emerald-50 text-emerald-700 border-emerald-200',
            'Lost': 'bg-red-50 text-red-700 border-red-200'
        };
        return <Badge variant="outline" className={cn("text-[9px] font-black uppercase tracking-widest px-2 h-5 shadow-none", variants[stage])}>{stage}</Badge>;
    };

    return (
        <div className="flex flex-col gap-8">
            <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-black text-gray-900 tracking-tighter uppercase">Opportunity Ledger</h1>
                    <p className="text-muted-foreground text-sm font-medium">Quantifiable sales funnel and active relationship pipeline.</p>
                </div>
                <Button onClick={handleOpenAddDialog} className="h-10 font-black text-xs uppercase tracking-widest shadow-lg shadow-primary/20 px-6">
                    <Plus className="mr-2 h-4 w-4" /> New Opportunity
                </Button>
            </header>

            <div className="flex flex-col sm:flex-row gap-3 items-end bg-muted/20 p-4 rounded-xl border border-dashed">
                <div className="space-y-1.5 flex-1 min-w-[200px]">
                    <Label className="text-[10px] font-black uppercase text-muted-foreground px-1">Quick Search</Label>
                    <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input 
                            placeholder="Filter by title or client..." 
                            className="pl-8 h-9 text-xs bg-white" 
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                        />
                    </div>
                </div>
                <div className="space-y-1.5 w-[160px]">
                    <Label className="text-[10px] font-black uppercase text-muted-foreground px-1">Pipeline Stage</Label>
                    <Select value={stageFilter} onValueChange={setStageFilter}>
                        <SelectTrigger className="h-9 bg-white text-xs font-bold uppercase"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="All">All Stages</SelectItem>
                            {STAGES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>
                {(searchQuery || stageFilter !== 'All') && (
                    <Button variant="ghost" size="sm" onClick={() => { setSearchQuery(''); setStageFilter('All'); }} className="h-9 text-muted-foreground font-black text-[9px] uppercase">
                        <FilterX className="mr-1.5 h-3.5 w-3.5" /> Clear Filters
                    </Button>
                )}
            </div>

            <Card className="shadow-sm border-gray-100 bg-white overflow-hidden">
                <CardContent className="p-0">
                    <Table>
                        <TableHeader className="bg-muted/50">
                            <TableRow className="hover:bg-transparent h-11 border-b">
                                <TableHead className="pl-6 font-black uppercase text-[10px] tracking-widest">Opportunity Title</TableHead>
                                <TableHead className="font-black uppercase text-[10px] tracking-widest">Client Organization</TableHead>
                                <TableHead className="font-black uppercase text-[10px] tracking-widest text-center">Stage</TableHead>
                                <TableHead className="font-black uppercase text-[10px] tracking-widest text-right">Value (NPR)</TableHead>
                                <TableHead className="font-black uppercase text-[10px] tracking-widest text-center">Exp. Close</TableHead>
                                <TableHead className="text-right pr-6 font-black uppercase text-[10px] tracking-widest">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableRow><TableCell colSpan={6} className="py-20 text-center"><Loader2 className="h-8 w-8 animate-spin mx-auto opacity-20"/></TableCell></TableRow>
                            ) : filteredAndSortedDeals.map((deal) => (
                                <TableRow key={deal.id} className="hover:bg-muted/10 h-14 transition-colors">
                                    <TableCell className="pl-6">
                                        <div className="flex flex-col">
                                            <span className="font-black text-gray-900 leading-tight uppercase tracking-tight">{deal.title}</span>
                                            <span className="text-[10px] text-muted-foreground font-bold">{format(new Date(deal.createdAt), "PP")}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-2">
                                            <Building2 className="h-3 w-3 text-primary opacity-50"/>
                                            <span className="text-xs font-bold text-gray-700 uppercase">{deal.partyName || 'Unlinked'}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-center">{getStageBadge(deal.stage)}</TableCell>
                                    <TableCell className="text-right font-black tabular-nums text-blue-700">Rs. {deal.value?.toLocaleString('en-IN')}</TableCell>
                                    <TableCell className="text-center font-mono text-[11px] text-muted-foreground">{deal.expectedCloseDateBS || '—'}</TableCell>
                                    <TableCell className="text-right pr-6">
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4"/></Button></DropdownMenuTrigger>
                                            <DropdownMenuContent align="end" className="w-56">
                                                <DropdownMenuLabel className="text-[9px] uppercase font-black tracking-widest text-muted-foreground">Manage Deal</DropdownMenuLabel>
                                                <DropdownMenuItem onSelect={() => handleOpenEditDialog(deal)}><Edit className="mr-2 h-4 w-4" /> Edit Details</DropdownMenuItem>
                                                <DropdownMenuSeparator />
                                                <DropdownMenuLabel className="text-[9px] uppercase font-black tracking-widest text-muted-foreground">Move Stage</DropdownMenuLabel>
                                                {STAGES.filter(s => s !== deal.stage).map(s => (
                                                    <DropdownMenuItem key={s} onSelect={() => handleMoveStage(deal, s)} className="capitalize">{s}</DropdownMenuItem>
                                                ))}
                                                <DropdownMenuSeparator />
                                                <AlertDialog>
                                                    <AlertDialogTrigger asChild>
                                                        <DropdownMenuItem onSelect={e => e.preventDefault()} className="text-destructive"><Trash2 className="mr-2 h-4 w-4" /> Delete Opportunity</DropdownMenuItem>
                                                    </AlertDialogTrigger>
                                                    <AlertDialogContent>
                                                        <AlertDialogHeader><AlertDialogTitle>Purge Record?</AlertDialogTitle><AlertDialogDescription>This will permanently remove the opportunity and historical tracking.</AlertDialogDescription></AlertDialogHeader>
                                                        <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => { setDealToDelete(deal.id); handleDelete(); }} className="bg-destructive text-white">Delete</AlertDialogAction></AlertDialogFooter>
                                                    </AlertDialogContent>
                                                </AlertDialog>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </TableCell>
                                </TableRow>
                            ))}
                            {!isLoading && filteredAndSortedDeals.length === 0 && (
                                <TableRow><TableCell colSpan={6} className="h-60 text-center text-muted-foreground italic uppercase font-black text-xs opacity-20">No matching opportunities in ledger.</TableCell></TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            {/* Opportunity Dialog */}
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-black text-gray-900 uppercase tracking-tight">{editingDeal ? 'Modify Opportunity' : 'New Opportunity'}</DialogTitle>
                        <DialogDescription>Define the scope and financial parameters of this deal.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-5 py-4">
                        <div className="space-y-1.5">
                            <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest px-1">Deal Title <span className="text-destructive">*</span></Label>
                            <Input value={form.title} onChange={e => setForm({...form, title: e.target.value})} placeholder="e.g. Bulk Supply Contract" className="h-10 font-bold" />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest px-1">Client Organization <span className="text-destructive">*</span></Label>
                            <Popover open={isCompanyPopoverOpen} onOpenChange={setIsCompanyPopoverOpen}>
                                <PopoverTrigger asChild>
                                    <Button variant="outline" role="combobox" className="w-full justify-between h-10 font-normal">
                                        {form.partyId ? parties.find(p => p.id === form.partyId)?.name : "Search company registry..."}
                                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="p-0 w-[--radix-popover-trigger-width]">
                                    <Command>
                                        <CommandInput placeholder="Filter companies..." className="h-9" />
                                        <CommandList>
                                            <CommandEmpty>No companies found.</CommandEmpty>
                                            <CommandGroup>
                                                {parties.map(p => (
                                                    <CommandItem key={p.id} value={p.name} onSelect={() => { setForm({...form, partyId: p.id}); setIsCompanyPopoverOpen(false); }} className="text-xs">
                                                        <Check className={cn("mr-2 h-4 w-4", form.partyId === p.id ? "opacity-100" : "opacity-0")} />{p.name}
                                                    </CommandItem>
                                                ))}
                                            </CommandGroup>
                                        </CommandList>
                                    </Command>
                                </PopoverContent>
                            </Popover>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest px-1">Value (रु)</Label>
                                <Input type="number" value={form.value} onChange={e => setForm({...form, value: Number(e.target.value)})} className="h-10 font-black" />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest px-1">Close Date (BS)</Label>
                                <Input value={form.expectedCloseDateBS} onChange={e => setForm({...form, expectedCloseDateBS: e.target.value})} placeholder="YYYY/MM/DD" className="h-10 font-mono" />
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest px-1">Notes</Label>
                            <Textarea value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} placeholder="..." className="min-h-[100px] text-sm resize-none" />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsDialogOpen(false)} className="h-11 font-bold text-xs uppercase tracking-widest">Cancel</Button>
                        <Button onClick={handleSave} disabled={!form.title || !form.partyId} className="h-11 px-8 font-black text-xs uppercase tracking-widest shadow-xl shadow-primary/20">Commit Opportunity</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Lost Reason Dialog */}
            <Dialog open={isLostDialogOpen} onOpenChange={setIsLostDialogOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-black text-gray-900 uppercase tracking-tight flex items-center gap-2">
                            <AlertCircle className="h-5 w-5 text-red-600"/> Mark as Lost
                        </DialogTitle>
                        <DialogDescription>Identify why this opportunity failed to convert.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-5 py-4">
                        <div className="space-y-1.5">
                            <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Primary Reason</Label>
                            <Select value={lostForm.reason} onValueChange={v => setLostForm({...lostForm, reason: v})}>
                                <SelectTrigger className="h-10"><SelectValue placeholder="Select reason..."/></SelectTrigger>
                                <SelectContent>{LOST_REASONS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                            </Select>
                        </div>
                        {lostForm.reason === 'Other' && (
                            <div className="space-y-1.5 animate-in slide-in-from-top-2"><Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Detail</Label><Input value={lostForm.otherText} onChange={e => setLostForm({...lostForm, otherText: e.target.value})} className="h-10" /></div>
                        )}
                    </div>
                    <DialogFooter><Button variant="destructive" onClick={handleConfirmLost} disabled={!lostForm.reason} className="w-full h-11 font-black text-xs uppercase shadow-xl shadow-red-500/20">Close as Lost</Button></DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
