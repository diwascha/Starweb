'use client';

import { useState, useEffect, useMemo } from 'react';
import { 
    Plus, 
    MoreHorizontal, 
    Edit, 
    Trash2, 
    ChevronRight, 
    Check, 
    ChevronsUpDown,
    Calendar,
    DollarSign,
    Target,
    Clock,
    AlertCircle,
    ArrowRightLeft,
    Loader2
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';

const STAGES: DealStage[] = ['Lead', 'Quoted', 'Negotiation', 'Won', 'Lost'];

const LOST_REASONS = ['Price', 'Competitor', 'Timing', 'No Response', 'Other'];

export default function DealsPipelinePage() {
    const { user } = useAuth();
    const { toast } = useToast();
    
    const [deals, setDeals] = useState<Deal[]>([]);
    const [parties, setParties] = useState<Party[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    
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

    const kanbanData = useMemo(() => {
        return STAGES.reduce((acc, stage) => {
            const stageDeals = deals.filter(d => d.stage === stage);
            acc[stage] = {
                deals: stageDeals,
                count: stageDeals.length,
                totalValue: stageDeals.reduce((sum, d) => sum + (d.value || 0), 0)
            };
            return acc;
        }, {} as Record<DealStage, { deals: Deal[], count: number, totalValue: number }>);
    }, [deals]);

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
                const y = parseInt(parts[0]);
                const m = parseInt(parts[1]);
                const d = parseInt(parts[2]);
                try {
                    const nd = new NepaliDate(y, m - 1, d);
                    expectedCloseDateAD = nd.toJsDate().toISOString();
                } catch {
                    toast({ title: 'Invalid Date', description: 'Please use YYYY/MM/DD format.', variant: 'destructive' });
                    return;
                }
            } else {
                toast({ title: 'Invalid Date', description: 'Please use YYYY/MM/DD format.', variant: 'destructive' });
                return;
            }
        }

        const party = parties.find(p => p.id === form.partyId);
        const data: any = {
            ...form,
            partyName: party?.name,
            expectedCloseDate: expectedCloseDateAD,
            value: Number(form.value) || 0
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
        if (newStage === 'Lost') {
            setDealToLose(deal);
            setLostForm({ reason: '', otherText: '' });
            setIsLostDialogOpen(true);
            return;
        }

        const updates: Partial<Deal> = { 
            stage: newStage,
            lastModifiedBy: user.username 
        };
        
        if (newStage === 'Won' || newStage === 'Lost') {
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
                stage: 'Lost',
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

    return (
        <div className="flex flex-col h-full gap-8">
            <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-black text-gray-900 tracking-tighter uppercase">Deal Pipeline</h1>
                    <p className="text-muted-foreground text-sm font-medium">Quantifiable opportunities and revenue forecasting.</p>
                </div>
                <Button onClick={handleOpenAddDialog} className="h-10 font-black text-xs uppercase tracking-widest shadow-lg shadow-primary/20 px-6">
                    <Plus className="mr-2 h-4 w-4" /> New Opportunity
                </Button>
            </header>

            <ScrollArea className="flex-1 w-full whitespace-nowrap rounded-xl">
                <div className="flex gap-4 min-w-max pb-6 h-full">
                    {STAGES.map(stage => {
                        const { deals: stageDeals, count, totalValue } = kanbanData[stage];
                        return (
                            <div key={stage} className="w-[300px] flex flex-col bg-muted/30 rounded-xl border border-muted-foreground/10 overflow-hidden">
                                <div className="p-4 border-b bg-white/50 space-y-1 shrink-0">
                                    <div className="flex items-center justify-between">
                                        <Badge variant="outline" className={cn(
                                            "text-[10px] font-black uppercase tracking-widest px-2 h-5",
                                            stage === 'Won' ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                                            stage === 'Lost' ? "bg-red-50 text-red-700 border-red-200" :
                                            "bg-blue-50 text-blue-700 border-blue-200"
                                        )}>
                                            {stage}
                                        </Badge>
                                        <span className="text-[10px] font-black text-muted-foreground opacity-60 uppercase">{count} deals</span>
                                    </div>
                                    <p className="text-xs font-black text-gray-900 tabular-nums">
                                        Rs. {totalValue.toLocaleString('en-IN', { minimumFractionDigits: 0 })}
                                    </p>
                                </div>

                                <div className="flex-1 p-3 space-y-3 overflow-y-auto">
                                    {stageDeals.map(deal => (
                                        <Card key={deal.id} className="shadow-sm border-gray-100 hover:shadow-md hover:border-primary/20 transition-all cursor-default group">
                                            <CardContent className="p-4 space-y-3">
                                                <div className="flex justify-between items-start gap-2">
                                                    <div className="space-y-1 overflow-hidden">
                                                        <h4 className="font-black text-xs text-gray-900 uppercase tracking-tight truncate leading-tight" title={deal.title}>
                                                            {deal.title}
                                                        </h4>
                                                        <p className="text-[10px] font-bold text-muted-foreground truncate uppercase opacity-70">
                                                            {deal.partyName}
                                                        </p>
                                                    </div>
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                <MoreHorizontal className="h-4 w-4"/>
                                                            </Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end" className="w-48">
                                                            <DropdownMenuItem onSelect={() => handleOpenEditDialog(deal)}>
                                                                <Edit className="mr-2 h-4 w-4"/> Edit Details
                                                            </DropdownMenuItem>
                                                            <DropdownMenuSeparator />
                                                            <DropdownMenuLabel className="text-[9px] uppercase font-black px-2 py-1 text-muted-foreground">Transition Stage</DropdownMenuLabel>
                                                            {(STAGES as string[]).filter(s => (s as string) !== (deal.stage as string)).map(s => (
                                                                <DropdownMenuItem key={s} onSelect={() => handleMoveStage(deal, s as DealStage)}>
                                                                    <ArrowRightLeft className="mr-2 h-4 w-4 opacity-50"/> {s}
                                                                </DropdownMenuItem>
                                                            ))}
                                                            <DropdownMenuSeparator />
                                                            <DropdownMenuItem className="text-destructive" onSelect={() => { setDealToDelete(deal.id); setIsDeleteDialogOpen(true); }}>
                                                                <Trash2 className="mr-2 h-4 w-4"/> Delete
                                                            </DropdownMenuItem>
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                </div>

                                                <div className="flex items-center justify-between pt-2 border-t border-dashed">
                                                    <span className="font-black text-[11px] text-blue-700 tabular-nums">
                                                        Rs. {deal.value?.toLocaleString('en-IN')}
                                                    </span>
                                                    {deal.expectedCloseDateBS && (
                                                        <div className="flex items-center gap-1 text-[9px] font-bold text-muted-foreground uppercase">
                                                            <Clock className="h-2.5 w-2.5"/> {deal.expectedCloseDateBS}
                                                        </div>
                                                    )}
                                                </div>
                                            </CardContent>
                                        </Card>
                                    ))}
                                    {stageDeals.length === 0 && (
                                        <div className="flex flex-col items-center justify-center py-10 opacity-20 border-2 border-dashed rounded-xl grayscale">
                                            <Target className="h-8 w-8 mb-2"/>
                                            <span className="text-[10px] font-black uppercase tracking-widest">No deals</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
                <ScrollBar orientation="horizontal" />
            </ScrollArea>

            {/* Add / Edit Dialog */}
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-black text-gray-900 uppercase tracking-tight">
                            {editingDeal ? 'Modify Opportunity' : 'New Opportunity'}
                        </DialogTitle>
                        <DialogDescription>Define the scope and financial parameters of this deal.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-5 py-4">
                        <div className="space-y-1.5">
                            <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Deal Title <span className="text-destructive">*</span></Label>
                            <Input value={form.title} onChange={e => setForm({...form, title: e.target.value})} placeholder="e.g. Bulk Corrugated Supply Q3" className="h-10 font-bold" />
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Client Organization <span className="text-destructive">*</span></Label>
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

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Expected Value (रु)</Label>
                                <Input type="number" value={form.value} onChange={e => setForm({...form, value: Number(e.target.value)})} className="h-10 font-black" />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Close Date (BS)</Label>
                                <div className="relative">
                                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground opacity-50" />
                                    <Input value={form.expectedCloseDateBS} onChange={e => setForm({...form, expectedCloseDateBS: e.target.value})} placeholder="YYYY/MM/DD" className="pl-9 h-10 font-mono" />
                                </div>
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Strategic Notes</Label>
                            <Textarea value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} placeholder="Key decision makers, requirements, risks..." className="min-h-[100px] text-sm resize-none" />
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
                                <SelectTrigger className="h-10"><SelectValue placeholder="Select outcome category..."/></SelectTrigger>
                                <SelectContent>
                                    {LOST_REASONS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        {lostForm.reason === 'Other' && (
                            <div className="space-y-1.5 animate-in slide-in-from-top-2">
                                <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Additional Detail</Label>
                                <Input value={lostForm.otherText} onChange={e => setLostForm({...lostForm, otherText: e.target.value})} placeholder="Explain reason..." className="h-10" />
                            </div>
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsLostDialogOpen(false)} className="h-11 font-bold text-xs uppercase tracking-widest">Back</Button>
                        <Button variant="destructive" onClick={handleConfirmLost} disabled={!lostForm.reason} className="h-11 px-8 font-black text-xs uppercase tracking-widest">Close as Lost</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation */}
            <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-xl font-black text-gray-900 uppercase tracking-tight">Delete Opportunity?</AlertDialogTitle>
                        <AlertDialogDescription>This action is permanent and will remove the record from the pipeline. Historical forecasting data will be lost.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel className="font-bold text-xs uppercase h-11 px-6">Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground font-black text-xs uppercase h-11 px-8 shadow-xl shadow-destructive/20">Purge Record</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}

function DropdownMenuLabel({ className, children }: { className?: string, children: React.ReactNode }) {
    return <div className={cn("px-2 py-1.5 text-sm font-semibold", className)}>{children}</div>;
}
