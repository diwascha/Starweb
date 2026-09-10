'use client';

import { useState, useEffect, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import {
    Plus,
    MoreHorizontal,
    Edit,
    Trash2,
    Check,
    X,
    ChevronsUpDown,
    Calendar,
    Target,
    Clock,
    AlertCircle,
    Loader2,
    Search,
    FilterX,
    Building2,
    History,
    ChevronDown,
    AlertTriangle,
    MessageSquareHeart
} from 'lucide-react';
import NepaliDate from 'nepali-date-converter';
import { format, isToday, isFuture, isPast, addDays, startOfDay } from 'date-fns';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import type { Deal, DealStage, Party, FollowUp, FollowUpStatus, InteractionLog } from '@/lib/types';
import { onDealsUpdate, addDeal, updateDeal, deleteDeal } from '@/services/deal-service';
import { onPartiesUpdate } from '@/services/party-service';
import { onFollowUpsUpdate, addFollowUp, updateFollowUp, deleteFollowUp, onInteractionsUpdate, addInteraction } from '@/services/crm-service';
import { Card, CardContent } from '@/components/ui/card';
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
import { cn, toNepaliDate } from '@/lib/utils';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

const STAGES: DealStage[] = ['Lead', 'Quoted', 'Negotiation', 'Won', 'Lost'];
const LOST_REASONS = ['Price', 'Competitor', 'Timing', 'No Response', 'Other'];

function ClientActivityPageContent() {
    const { user } = useAuth();
    const { toast } = useToast();
    const searchParams = useSearchParams();
    const initialTab = searchParams.get('tab') === 'followups' ? 'followups' : searchParams.get('tab') === 'log' ? 'log' : 'pipeline';

    const [deals, setDeals] = useState<Deal[]>([]);
    const [parties, setParties] = useState<Party[]>([]);
    const [followups, setFollowups] = useState<FollowUp[]>([]);
    const [interactions, setInteractions] = useState<InteractionLog[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        setIsLoading(true);
        const unsubs = [
            onDealsUpdate(setDeals),
            onFollowUpsUpdate(setFollowups),
            onInteractionsUpdate(setInteractions),
            onPartiesUpdate((data) => {
                setParties(data.filter(p => p.type === 'Customer' || p.type === 'Both')
                    .sort((a, b) => a.name.localeCompare(b.name)));
                setIsLoading(false);
            })
        ];
        return () => unsubs.forEach(u => u());
    }, []);

    /* ============ Pipeline (Deals) ============ */
    const [searchQuery, setSearchQuery] = useState('');
    const [stageFilter, setStageFilter] = useState<string>('All');
    const [sortConfig, setSortConfig] = useState<{ key: keyof Deal; direction: 'asc' | 'desc' }>({ key: 'createdAt', direction: 'desc' });

    const [isDealDialogOpen, setIsDealDialogOpen] = useState(false);
    const [editingDeal, setEditingDeal] = useState<Deal | null>(null);
    const [isCompanyPopoverOpen, setIsCompanyPopoverOpen] = useState(false);
    const [isLostDialogOpen, setIsLostDialogOpen] = useState(false);
    const [dealToLose, setDealToLose] = useState<Deal | null>(null);

    const [dealForm, setDealForm] = useState({
        title: '', partyId: '', value: 0, stage: 'Lead' as DealStage, expectedCloseDateBS: '', notes: ''
    });
    const [lostForm, setLostForm] = useState({ reason: '', otherText: '' });

    const filteredAndSortedDeals = useMemo(() => {
        let filtered = [...deals];
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            filtered = filtered.filter(d => d.title.toLowerCase().includes(q) || (d.partyName || '').toLowerCase().includes(q));
        }
        if (stageFilter !== 'All') filtered = filtered.filter(d => d.stage === stageFilter);
        filtered.sort((a, b) => {
            const aVal = a[sortConfig.key] || '';
            const bVal = b[sortConfig.key] || '';
            if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
        return filtered;
    }, [deals, searchQuery, stageFilter, sortConfig]);

    const handleOpenAddDeal = () => {
        setEditingDeal(null);
        setDealForm({ title: '', partyId: '', value: 0, stage: 'Lead', expectedCloseDateBS: '', notes: '' });
        setIsDealDialogOpen(true);
    };

    const handleOpenEditDeal = (deal: Deal) => {
        setEditingDeal(deal);
        setDealForm({
            title: deal.title, partyId: deal.partyId, value: deal.value, stage: deal.stage,
            expectedCloseDateBS: deal.expectedCloseDateBS || '', notes: deal.notes || ''
        });
        setIsDealDialogOpen(true);
    };

    const handleSaveDeal = async () => {
        if (!user || !dealForm.title || !dealForm.partyId) return;

        let expectedCloseDateAD = null;
        if (dealForm.expectedCloseDateBS) {
            const parts = dealForm.expectedCloseDateBS.split('/');
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

        const party = parties.find(p => p.id === dealForm.partyId);
        const data: any = { ...dealForm, partyName: party?.name, expectedCloseDate: expectedCloseDateAD, value: Number(dealForm.value) || 0, lastModifiedAt: new Date().toISOString() };

        try {
            if (editingDeal) {
                await updateDeal(editingDeal.id, { ...data, lastModifiedBy: user.username });
                toast({ title: 'Opportunity Updated' });
            } else {
                await addDeal({ ...data, createdBy: user.username, createdAt: new Date().toISOString() });
                toast({ title: 'Opportunity Created' });
            }
            setIsDealDialogOpen(false);
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
        const updates: Partial<Deal> = { stage: newStage, lastModifiedBy: user.username };
        if ((newStage as string) === 'Won' || (newStage as string) === 'Lost') updates.closedAt = new Date().toISOString();
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
            await updateDeal(dealToLose.id, { stage: 'Lost' as DealStage, lostReason: finalReason, closedAt: new Date().toISOString(), lastModifiedBy: user.username });
            setIsLostDialogOpen(false);
            setDealToLose(null);
            toast({ title: 'Deal marked as Lost' });
        } catch {
            toast({ title: 'Update failed', variant: 'destructive' });
        }
    };

    const handleDeleteDeal = async (id: string) => {
        try {
            await deleteDeal(id);
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

    /* ============ Follow-ups ============ */
    const [isFollowUpDialogOpen, setIsFollowUpDialogOpen] = useState(false);
    const [isFuCompanyPopoverOpen, setIsFuCompanyPopoverOpen] = useState(false);
    const [editingFollowUp, setEditingFollowUp] = useState<FollowUp | null>(null);
    const [isHistoryOpen, setIsHistoryOpen] = useState(false);

    const [followUpForm, setFollowUpForm] = useState({ partyId: '', dealId: '', action: '', dueDateBS: '' });

    const categorizedFollowups = useMemo(() => {
        const today = startOfDay(new Date());
        const next7Days = addDays(today, 7);
        return followups.reduce((acc, f) => {
            if (f.status !== 'Pending') { acc.history.push(f); return acc; }
            const dueDate = startOfDay(new Date(f.dueDate));
            if (isPast(dueDate) && !isToday(dueDate)) acc.overdue.push(f);
            else if (isToday(dueDate)) acc.today.push(f);
            else if (isFuture(dueDate) && dueDate <= next7Days) acc.upcoming.push(f);
            else acc.later.push(f);
            return acc;
        }, { overdue: [] as FollowUp[], today: [] as FollowUp[], upcoming: [] as FollowUp[], later: [] as FollowUp[], history: [] as FollowUp[] });
    }, [followups]);

    const sortedFollowupHistory = useMemo(() => {
        return [...categorizedFollowups.history]
            .sort((a, b) => new Date(b.completedAt || b.lastModifiedAt || b.createdAt).getTime() - new Date(a.completedAt || a.lastModifiedAt || a.createdAt).getTime())
            .slice(0, 20);
    }, [categorizedFollowups.history]);

    const handleOpenAddFollowUp = () => {
        setEditingFollowUp(null);
        setFollowUpForm({ partyId: '', dealId: '', action: '', dueDateBS: '' });
        setIsFollowUpDialogOpen(true);
    };

    const handleOpenEditFollowUp = (f: FollowUp) => {
        setEditingFollowUp(f);
        setFollowUpForm({ partyId: f.partyId, dealId: f.dealId || '', action: f.action, dueDateBS: f.dueDateBS });
        setIsFollowUpDialogOpen(true);
    };

    const handleSaveFollowUp = async () => {
        if (!user || !followUpForm.partyId || !followUpForm.action || !followUpForm.dueDateBS) return;
        let adDateISO = '';
        try {
            const parts = followUpForm.dueDateBS.split('/');
            if (parts.length !== 3) throw new Error();
            const nd = new NepaliDate(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
            adDateISO = nd.toJsDate().toISOString();
        } catch {
            toast({ title: 'Invalid Date', description: 'Use YYYY/MM/DD format.', variant: 'destructive' });
            return;
        }
        const party = parties.find(p => p.id === followUpForm.partyId);
        const payload: any = { ...followUpForm, partyName: party?.name, dueDate: adDateISO, status: editingFollowUp?.status || 'Pending' };
        try {
            if (editingFollowUp) {
                await updateFollowUp(editingFollowUp.id, { ...payload, lastModifiedBy: user.username });
                toast({ title: 'Follow-up Updated' });
            } else {
                await addFollowUp({ ...payload, createdBy: user.username });
                toast({ title: 'Follow-up Scheduled' });
            }
            setIsFollowUpDialogOpen(false);
        } catch {
            toast({ title: 'Error saving reminder', variant: 'destructive' });
        }
    };

    const handleQuickFollowUpStatus = async (f: FollowUp, status: FollowUpStatus) => {
        if (!user) return;
        try {
            await updateFollowUp(f.id, { status, completedAt: status === 'Done' ? new Date().toISOString() : undefined, lastModifiedBy: user.username });
            toast({ title: status === 'Done' ? 'Action Completed' : 'Follow-up Skipped' });
        } catch {
            toast({ title: 'Update failed', variant: 'destructive' });
        }
    };

    const handleDeleteFollowUp = async (id: string) => {
        try {
            await deleteFollowUp(id);
            toast({ title: 'Reminder Removed' });
        } catch {
            toast({ title: 'Delete failed', variant: 'destructive' });
        }
    };

    /* ============ Incidents & Feedback ============ */
    const [isLogDialogOpen, setIsLogDialogOpen] = useState(false);
    const [isLogCompanyPopoverOpen, setIsLogCompanyPopoverOpen] = useState(false);
    const [logForm, setLogForm] = useState({ partyId: '', type: 'Incident' as 'Incident' | 'Feedback', subject: '', description: '', severity: 'Medium' as any, sentiment: 'Neutral' as any });
    const [clientLogFilter, setClientLogFilter] = useState('All');

    const incidentsAndFeedback = useMemo(() => {
        return interactions
            .filter(i => i.type === 'Incident' || i.type === 'Feedback')
            .filter(i => clientLogFilter === 'All' || i.partyId === clientLogFilter)
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [interactions, clientLogFilter]);

    const handleOpenLogDialog = (type: 'Incident' | 'Feedback') => {
        setLogForm({ partyId: '', type, subject: '', description: '', severity: 'Medium', sentiment: 'Neutral' });
        setIsLogDialogOpen(true);
    };

    const handleSaveLog = async () => {
        if (!user || !logForm.partyId || !logForm.subject) return;
        const party = parties.find(p => p.id === logForm.partyId);
        try {
            await addInteraction({
                type: logForm.type,
                subject: logForm.subject,
                description: logForm.description,
                date: new Date().toISOString(),
                performer: user.username,
                partyId: logForm.partyId,
                severity: logForm.type === 'Incident' ? logForm.severity : undefined,
                sentiment: logForm.type === 'Feedback' ? logForm.sentiment : undefined,
                createdAt: new Date().toISOString()
            });
            toast({ title: logForm.type === 'Incident' ? 'Incident Logged' : 'Feedback Recorded' });
            setIsLogDialogOpen(false);
        } catch {
            toast({ title: 'Error logging activity', variant: 'destructive' });
        }
    };

    return (
        <div className="flex flex-col gap-8 pb-20">
            <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-black text-gray-900 tracking-tighter uppercase">Client Activity</h1>
                    <p className="text-muted-foreground text-sm font-medium">Pipeline, follow-ups, incidents and feedback for existing and prospect clients.</p>
                </div>
            </header>

            <Tabs defaultValue={initialTab} className="w-full">
                <TabsList className="h-11">
                    <TabsTrigger value="pipeline" className="text-xs font-black uppercase tracking-widest gap-2"><Target className="h-3.5 w-3.5"/> Pipeline</TabsTrigger>
                    <TabsTrigger value="followups" className="text-xs font-black uppercase tracking-widest gap-2"><Clock className="h-3.5 w-3.5"/> Follow-ups</TabsTrigger>
                    <TabsTrigger value="log" className="text-xs font-black uppercase tracking-widest gap-2"><AlertTriangle className="h-3.5 w-3.5"/> Incidents &amp; Feedback</TabsTrigger>
                </TabsList>

                {/* ============ PIPELINE TAB ============ */}
                <TabsContent value="pipeline" className="space-y-6 mt-6">
                    <div className="flex flex-col sm:flex-row gap-3 items-end bg-muted/20 p-4 rounded-xl border border-dashed">
                        <div className="space-y-1.5 flex-1 min-w-[200px]">
                            <Label className="text-[10px] font-black uppercase text-muted-foreground px-1">Quick Search</Label>
                            <div className="relative">
                                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input placeholder="Filter by title or client..." className="pl-8 h-9 text-xs bg-white" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
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
                        <Button onClick={handleOpenAddDeal} className="h-9 font-black text-xs uppercase tracking-widest shadow-lg shadow-primary/20 px-6 ml-auto">
                            <Plus className="mr-2 h-4 w-4" /> New Opportunity
                        </Button>
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
                                                        <DropdownMenuItem onSelect={() => handleOpenEditDeal(deal)}><Edit className="mr-2 h-4 w-4" /> Edit Details</DropdownMenuItem>
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
                                                                <AlertDialogHeader><AlertDialogTitle>Delete Opportunity?</AlertDialogTitle><AlertDialogDescription>This will permanently remove the opportunity and historical tracking.</AlertDialogDescription></AlertDialogHeader>
                                                                <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => handleDeleteDeal(deal.id)} className="bg-destructive text-white">Delete</AlertDialogAction></AlertDialogFooter>
                                                            </AlertDialogContent>
                                                        </AlertDialog>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {!isLoading && filteredAndSortedDeals.length === 0 && (
                                        <TableRow><TableCell colSpan={6} className="h-60 text-center text-muted-foreground italic uppercase font-black text-xs opacity-20">No matching opportunities.</TableCell></TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* ============ FOLLOW-UPS TAB ============ */}
                <TabsContent value="followups" className="space-y-6 mt-6">
                    <div className="flex justify-end">
                        <Button onClick={handleOpenAddFollowUp} className="h-9 font-black text-xs uppercase tracking-widest shadow-lg shadow-primary/20 px-6">
                            <Plus className="mr-2 h-4 w-4" /> Schedule Action
                        </Button>
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        <div className="space-y-6">
                            <SectionHeader title="Overdue Attention" count={categorizedFollowups.overdue.length} color="text-red-600" />
                            {categorizedFollowups.overdue.map(f => (
                                <FollowUpCard key={f.id} f={f} onStatus={handleQuickFollowUpStatus} onEdit={handleOpenEditFollowUp} onDelete={handleDeleteFollowUp} priority="High" />
                            ))}
                            {categorizedFollowups.overdue.length === 0 && <EmptyState text="No overdue items" />}

                            <SectionHeader title="Due Today" count={categorizedFollowups.today.length} color="text-amber-600" />
                            {categorizedFollowups.today.map(f => (
                                <FollowUpCard key={f.id} f={f} onStatus={handleQuickFollowUpStatus} onEdit={handleOpenEditFollowUp} onDelete={handleDeleteFollowUp} priority="Medium" />
                            ))}
                            {categorizedFollowups.today.length === 0 && <EmptyState text="Clear for today" />}
                        </div>
                        <div className="space-y-6">
                            <SectionHeader title="Upcoming (7 Days)" count={categorizedFollowups.upcoming.length} color="text-blue-600" />
                            {categorizedFollowups.upcoming.map(f => (
                                <FollowUpCard key={f.id} f={f} onStatus={handleQuickFollowUpStatus} onEdit={handleOpenEditFollowUp} onDelete={handleDeleteFollowUp} />
                            ))}
                            {categorizedFollowups.upcoming.length === 0 && <EmptyState text="No upcoming tasks" />}

                            <SectionHeader title="Scheduled Later" count={categorizedFollowups.later.length} color="text-gray-500" />
                            {categorizedFollowups.later.map(f => (
                                <FollowUpCard key={f.id} f={f} onStatus={handleQuickFollowUpStatus} onEdit={handleOpenEditFollowUp} onDelete={handleDeleteFollowUp} />
                            ))}
                        </div>
                    </div>

                    <Collapsible open={isHistoryOpen} onOpenChange={setIsHistoryOpen} className="w-full">
                        <Card className="border-dashed bg-muted/20">
                            <div className="py-3 px-4">
                                <CollapsibleTrigger asChild>
                                    <Button variant="ghost" className="w-full justify-between hover:bg-transparent">
                                        <div className="flex items-center gap-2">
                                            <History className="h-4 w-4 text-muted-foreground" />
                                            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Recent Activity (Last 20)</span>
                                        </div>
                                        <ChevronDown className={cn("h-4 w-4 transition-transform", isHistoryOpen && "rotate-180")} />
                                    </Button>
                                </CollapsibleTrigger>
                            </div>
                            <CollapsibleContent>
                                <CardContent className="p-0">
                                    <Table className="text-[11px]">
                                        <TableBody>
                                            {sortedFollowupHistory.map(f => (
                                                <TableRow key={f.id} className="h-10 hover:bg-transparent">
                                                    <TableCell className="pl-6 w-8"><Badge variant="outline" className={cn("text-[8px] uppercase font-black px-1.5 h-4", f.status === 'Done' ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-gray-50 text-gray-400 border-gray-200")}>{f.status}</Badge></TableCell>
                                                    <TableCell className="font-bold text-gray-700">{f.action}</TableCell>
                                                    <TableCell className="text-muted-foreground uppercase">{f.partyName}</TableCell>
                                                    <TableCell className="text-right pr-6 font-mono text-gray-400">{f.completedAt ? format(new Date(f.completedAt), "PP") : toNepaliDate(f.dueDate)}</TableCell>
                                                </TableRow>
                                            ))}
                                            {sortedFollowupHistory.length === 0 && <TableRow><TableCell className="text-center py-8 italic opacity-40">No historical data.</TableCell></TableRow>}
                                        </TableBody>
                                    </Table>
                                </CardContent>
                            </CollapsibleContent>
                        </Card>
                    </Collapsible>
                </TabsContent>

                {/* ============ INCIDENTS & FEEDBACK TAB ============ */}
                <TabsContent value="log" className="space-y-6 mt-6">
                    <div className="flex flex-col sm:flex-row gap-3 items-end bg-muted/20 p-4 rounded-xl border border-dashed">
                        <div className="space-y-1.5 w-[220px]">
                            <Label className="text-[10px] font-black uppercase text-muted-foreground px-1">Client</Label>
                            <Select value={clientLogFilter} onValueChange={setClientLogFilter}>
                                <SelectTrigger className="h-9 bg-white text-xs font-bold"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="All">All Clients</SelectItem>
                                    {parties.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="flex gap-2 ml-auto">
                            <Button variant="outline" onClick={() => handleOpenLogDialog('Feedback')} className="h-9 font-black text-xs uppercase tracking-widest gap-2 border-blue-200 text-blue-700 hover:bg-blue-50">
                                <MessageSquareHeart className="h-4 w-4" /> Log Feedback
                            </Button>
                            <Button onClick={() => handleOpenLogDialog('Incident')} className="h-9 font-black text-xs uppercase tracking-widest gap-2 bg-red-600 hover:bg-red-700 shadow-lg shadow-red-500/20">
                                <AlertTriangle className="h-4 w-4" /> Log Incident
                            </Button>
                        </div>
                    </div>

                    <div className="space-y-3">
                        {incidentsAndFeedback.map(log => (
                            <Card key={log.id} className={cn("shadow-sm border-gray-100", log.type === 'Incident' ? "border-l-4 border-l-red-500" : "border-l-4 border-l-blue-500")}>
                                <CardContent className="p-4">
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-2">
                                            <Badge className={cn("text-[8px] font-black uppercase h-4 px-1.5", log.type === 'Incident' ? "bg-red-600 text-white" : "bg-blue-600 text-white")}>{log.type}</Badge>
                                            {log.type === 'Incident' && log.severity && (
                                                <Badge variant="outline" className={cn("text-[8px] font-black uppercase h-4 px-1.5", log.severity === 'High' ? "bg-red-50 text-red-700 border-red-200" : log.severity === 'Medium' ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-gray-50 text-gray-600 border-gray-200")}>{log.severity}</Badge>
                                            )}
                                            {log.type === 'Feedback' && log.sentiment && (
                                                <Badge variant="outline" className={cn("text-[8px] font-black uppercase h-4 px-1.5", log.sentiment === 'Positive' ? "bg-emerald-50 text-emerald-700 border-emerald-200" : log.sentiment === 'Negative' ? "bg-red-50 text-red-700 border-red-200" : "bg-gray-50 text-gray-600 border-gray-200")}>{log.sentiment}</Badge>
                                            )}
                                            <span className="text-xs font-black text-gray-900">{log.subject}</span>
                                        </div>
                                        <span className="text-[9px] font-bold text-muted-foreground uppercase">{format(new Date(log.date), "PP")}</span>
                                    </div>
                                    <p className="text-[11px] text-gray-600 leading-relaxed italic border-l-2 border-primary/20 pl-3">{log.description}</p>
                                    <div className="mt-2 flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-muted-foreground/60">
                                        <Building2 className="h-2.5 w-2.5" /> {parties.find(p => p.id === log.partyId)?.name || 'Unknown Client'}
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                        {incidentsAndFeedback.length === 0 && (
                            <div className="py-20 text-center opacity-40 italic text-xs uppercase font-black">No incidents or feedback recorded{clientLogFilter !== 'All' ? ' for this client' : ''}.</div>
                        )}
                    </div>
                </TabsContent>
            </Tabs>

            {/* Opportunity Dialog */}
            <Dialog open={isDealDialogOpen} onOpenChange={setIsDealDialogOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-black text-gray-900 uppercase tracking-tight">{editingDeal ? 'Modify Opportunity' : 'New Opportunity'}</DialogTitle>
                        <DialogDescription>Define the scope and financial parameters of this deal.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-5 py-4">
                        <div className="space-y-1.5">
                            <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest px-1">Deal Title <span className="text-destructive">*</span></Label>
                            <Input value={dealForm.title} onChange={e => setDealForm({...dealForm, title: e.target.value})} placeholder="e.g. Bulk Supply Contract" className="h-10 font-bold" />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest px-1">Client Organization <span className="text-destructive">*</span></Label>
                            <Popover open={isCompanyPopoverOpen} onOpenChange={setIsCompanyPopoverOpen}>
                                <PopoverTrigger asChild>
                                    <Button variant="outline" role="combobox" className="w-full justify-between h-10 font-normal">
                                        {dealForm.partyId ? parties.find(p => p.id === dealForm.partyId)?.name : "Search company registry..."}
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
                                                    <CommandItem key={p.id} value={p.name} onSelect={() => { setDealForm({...dealForm, partyId: p.id}); setIsCompanyPopoverOpen(false); }} className="text-xs">
                                                        <Check className={cn("mr-2 h-4 w-4", dealForm.partyId === p.id ? "opacity-100" : "opacity-0")} />{p.name}
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
                                <Input type="number" value={dealForm.value} onChange={e => setDealForm({...dealForm, value: Number(e.target.value)})} className="h-10 font-black" />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest px-1">Close Date (BS)</Label>
                                <Input value={dealForm.expectedCloseDateBS} onChange={e => setDealForm({...dealForm, expectedCloseDateBS: e.target.value})} placeholder="YYYY/MM/DD" className="h-10 font-mono" />
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest px-1">Notes</Label>
                            <Textarea value={dealForm.notes} onChange={e => setDealForm({...dealForm, notes: e.target.value})} placeholder="..." className="min-h-[100px] text-sm resize-none" />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsDealDialogOpen(false)} className="h-11 font-bold text-xs uppercase tracking-widest">Cancel</Button>
                        <Button onClick={handleSaveDeal} disabled={!dealForm.title || !dealForm.partyId} className="h-11 px-8 font-black text-xs uppercase tracking-widest shadow-xl shadow-primary/20">Commit Opportunity</Button>
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

            {/* Follow-up Add/Edit Dialog */}
            <Dialog open={isFollowUpDialogOpen} onOpenChange={setIsFollowUpDialogOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-black text-gray-900 uppercase tracking-tight">
                            {editingFollowUp ? 'Modify Scheduled Action' : 'Plan Relationship Event'}
                        </DialogTitle>
                        <DialogDescription>Coordinate persistence for client engagement.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-5 py-4">
                        <div className="space-y-1.5">
                            <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Client Account <span className="text-destructive">*</span></Label>
                            <Popover open={isFuCompanyPopoverOpen} onOpenChange={setIsFuCompanyPopoverOpen}>
                                <PopoverTrigger asChild>
                                    <Button variant="outline" role="combobox" className="w-full justify-between h-10 font-normal text-xs">
                                        {followUpForm.partyId ? parties.find(p => p.id === followUpForm.partyId)?.name : "Search company registry..."}
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
                                                    <CommandItem key={p.id} value={p.name} onSelect={() => { setFollowUpForm({...followUpForm, partyId: p.id, dealId: ''}); setIsFuCompanyPopoverOpen(false); }} className="text-xs">
                                                        <Check className={cn("mr-2 h-4 w-4", followUpForm.partyId === p.id ? "opacity-100" : "opacity-0")} />
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
                                <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Target Date (BS) <span className="text-destructive">*</span></Label>
                                <div className="relative">
                                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground opacity-50" />
                                    <Input value={followUpForm.dueDateBS} onChange={e => setFollowUpForm({...followUpForm, dueDateBS: e.target.value})} placeholder="YYYY/MM/DD" className="pl-9 h-10 font-mono text-sm" />
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Linked Deal (Optional)</Label>
                                <Select value={followUpForm.dealId} onValueChange={v => setFollowUpForm({...followUpForm, dealId: v})}>
                                    <SelectTrigger className="h-10"><SelectValue placeholder="Select context..."/></SelectTrigger>
                                    <SelectContent>
                                        {deals.filter(d => d.partyId === followUpForm.partyId && d.stage !== 'Won' && d.stage !== 'Lost').map(d => (
                                            <SelectItem key={d.id} value={d.id} className="text-xs">{d.title}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Action Required <span className="text-destructive">*</span></Label>
                            <Input value={followUpForm.action} onChange={e => setFollowUpForm({...followUpForm, action: e.target.value})} placeholder="e.g. Discuss revised pricing terms" className="h-10 font-bold" />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsFollowUpDialogOpen(false)} className="h-11 font-bold text-xs uppercase tracking-widest">Cancel</Button>
                        <Button onClick={handleSaveFollowUp} disabled={!followUpForm.partyId || !followUpForm.action || !followUpForm.dueDateBS} className="h-11 px-8 font-black text-xs uppercase tracking-widest shadow-xl shadow-primary/20">Commit Reminder</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Incident / Feedback Log Dialog */}
            <Dialog open={isLogDialogOpen} onOpenChange={setIsLogDialogOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-black text-gray-900 uppercase tracking-tight">
                            {logForm.type === 'Incident' ? 'Log Incident' : 'Record Feedback'}
                        </DialogTitle>
                        <DialogDescription>{logForm.type === 'Incident' ? 'Track a problem or complaint for this client.' : 'Capture what the client said, good or bad.'}</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-5 py-4">
                        <div className="space-y-1.5">
                            <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Client Account <span className="text-destructive">*</span></Label>
                            <Popover open={isLogCompanyPopoverOpen} onOpenChange={setIsLogCompanyPopoverOpen}>
                                <PopoverTrigger asChild>
                                    <Button variant="outline" role="combobox" className="w-full justify-between h-10 font-normal text-xs">
                                        {logForm.partyId ? parties.find(p => p.id === logForm.partyId)?.name : "Search company registry..."}
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
                                                    <CommandItem key={p.id} value={p.name} onSelect={() => { setLogForm({...logForm, partyId: p.id}); setIsLogCompanyPopoverOpen(false); }} className="text-xs">
                                                        <Check className={cn("mr-2 h-4 w-4", logForm.partyId === p.id ? "opacity-100" : "opacity-0")} />
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
                            <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Subject <span className="text-destructive">*</span></Label>
                            <Input value={logForm.subject} onChange={e => setLogForm({...logForm, subject: e.target.value})} placeholder="Short headline" className="h-10 font-bold" />
                        </div>
                        {logForm.type === 'Incident' ? (
                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-black uppercase text-red-700">Severity</Label>
                                <Select value={logForm.severity} onValueChange={(v: any) => setLogForm({...logForm, severity: v})}>
                                    <SelectTrigger className="h-10"><SelectValue/></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="Low">Low</SelectItem>
                                        <SelectItem value="Medium">Medium</SelectItem>
                                        <SelectItem value="High">High</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        ) : (
                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-black uppercase text-blue-700">Sentiment</Label>
                                <Select value={logForm.sentiment} onValueChange={(v: any) => setLogForm({...logForm, sentiment: v})}>
                                    <SelectTrigger className="h-10"><SelectValue/></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="Positive">Positive</SelectItem>
                                        <SelectItem value="Neutral">Neutral</SelectItem>
                                        <SelectItem value="Negative">Negative</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        )}
                        <div className="space-y-1.5">
                            <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Details</Label>
                            <Textarea value={logForm.description} onChange={e => setLogForm({...logForm, description: e.target.value})} placeholder="What happened..." className="min-h-[100px] text-sm resize-none" />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsLogDialogOpen(false)} className="h-11 font-bold text-xs uppercase tracking-widest">Cancel</Button>
                        <Button onClick={handleSaveLog} disabled={!logForm.partyId || !logForm.subject} className={cn("h-11 px-8 font-black text-xs uppercase tracking-widest shadow-xl", logForm.type === 'Incident' ? "bg-red-600 hover:bg-red-700 shadow-red-500/20" : "shadow-primary/20")}>
                            {logForm.type === 'Incident' ? 'Log Incident' : 'Save Feedback'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

function SectionHeader({ title, count, color }: { title: string, count: number, color: string }) {
    return (
        <div className="flex items-center justify-between border-b pb-2 px-1">
            <h2 className={cn("text-[10px] font-black uppercase tracking-[0.2em]", color)}>{title}</h2>
            <Badge variant="outline" className="h-5 text-[9px] font-black">{count}</Badge>
        </div>
    );
}

function EmptyState({ text }: { text: string }) {
    return <div className="py-8 text-center text-[10px] font-black uppercase tracking-widest text-muted-foreground opacity-30 italic">{text}</div>;
}

function FollowUpCard({ f, onStatus, onEdit, onDelete, priority }: { f: FollowUp, onStatus: any, onEdit: any, onDelete: any, priority?: 'High' | 'Medium' }) {
    return (
        <Card className={cn(
            "shadow-sm border-gray-100 hover:shadow-md transition-all group",
            priority === 'High' && "border-l-4 border-l-red-600",
            priority === 'Medium' && "border-l-4 border-l-amber-500"
        )}>
            <CardContent className="p-4 space-y-4">
                <div className="flex justify-between items-start gap-4">
                    <div className="space-y-1 overflow-hidden">
                        <h4 className="font-black text-sm text-gray-900 leading-tight">{f.action}</h4>
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold text-blue-700 uppercase truncate">{f.partyName}</span>
                            <div className="w-1 h-1 rounded-full bg-gray-300" />
                            <span className="text-[10px] font-black text-muted-foreground uppercase">{f.dueDateBS}</span>
                        </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                        <Button size="icon" variant="outline" className="h-8 w-8 text-emerald-600 border-emerald-100 hover:bg-emerald-50" onClick={() => onStatus(f, 'Done')}>
                            <Check className="h-4 w-4"/>
                        </Button>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                    <MoreHorizontal className="h-4 w-4"/>
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                                <DropdownMenuItem onSelect={() => onEdit(f)}><Edit className="mr-2 h-4 w-4"/> Edit Schedule</DropdownMenuItem>
                                <DropdownMenuItem onSelect={() => onStatus(f, 'Skipped')}><X className="mr-2 h-4 w-4"/> Skip This Action</DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                        <DropdownMenuItem onSelect={(event) => event.preventDefault()} className="text-destructive"><Trash2 className="mr-2 h-4 w-4"/> Delete</DropdownMenuItem>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                        <AlertDialogHeader><AlertDialogTitle className="uppercase tracking-tight">Delete Reminder?</AlertDialogTitle><AlertDialogDescription>This action is irreversible.</AlertDialogDescription></AlertDialogHeader>
                                        <AlertDialogFooter>
                                            <AlertDialogCancel className="font-bold text-xs uppercase">Cancel</AlertDialogCancel>
                                            <AlertDialogAction onClick={() => onDelete(f.id)} className="bg-destructive text-white font-black text-xs uppercase h-11">Delete Permanently</AlertDialogAction>
                                        </AlertDialogFooter>
                                    </AlertDialogContent>
                                </AlertDialog>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

export default function ClientActivityPage() {
    return (
        <Suspense fallback={<div className="p-8 text-center"><Loader2 className="animate-spin h-8 w-8 mx-auto opacity-20" /></div>}>
            <ClientActivityPageContent />
        </Suspense>
    );
}
