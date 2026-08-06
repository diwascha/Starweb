'use client';

import { useState, useEffect, useMemo } from 'react';
import { 
    Bell, 
    Plus, 
    Check, 
    X, 
    Clock, 
    Calendar, 
    User, 
    MoreHorizontal, 
    Edit, 
    Trash2, 
    History,
    ChevronsUpDown,
    Building2,
    Briefcase,
    CheckCircle2,
    Loader2,
    ChevronDown
} from 'lucide-react';
import NepaliDate from 'nepali-date-converter';
import { format, isToday, isFuture, isPast, addDays, startOfDay } from 'date-fns';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import type { FollowUp, Party, Deal, FollowUpStatus } from '@/lib/types';
import { onFollowUpsUpdate, addFollowUp, updateFollowUp, deleteFollowUp } from '@/services/crm-service';
import { onPartiesUpdate } from '@/services/party-service';
import { onDealsUpdate } from '@/services/deal-service';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
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
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

export default function FollowUpsPage() {
    const { user } = useAuth();
    const { toast } = useToast();
    
    const [followups, setFollowups] = useState<FollowUp[]>([]);
    const [parties, setParties] = useState<Party[]>([]);
    const [deals, setDeals] = useState<Deal[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [isCompanyPopoverOpen, setIsCompanyPopoverOpen] = useState(false);
    const [editingFollowUp, setEditingFollowUp] = useState<FollowUp | null>(null);
    const [isHistoryOpen, setIsHistoryOpen] = useState(false);
    
    const [form, setForm] = useState({
        partyId: '',
        dealId: '',
        action: '',
        dueDateBS: '',
    });

    useEffect(() => {
        setIsLoading(true);
        const unsubs = [
            onFollowUpsUpdate(setFollowups),
            onPartiesUpdate((data) => {
                setParties(data.filter(p => p.type === 'Customer' || p.type === 'Both')
                    .sort((a, b) => a.name.localeCompare(b.name)));
            }),
            onDealsUpdate(setDeals),
        ];
        setIsLoading(false);
        return () => unsubs.forEach(u => u());
    }, []);

    const categorizedData = useMemo(() => {
        const today = startOfDay(new Date());
        const next7Days = addDays(today, 7);
        
        return followups.reduce((acc, f) => {
            if (f.status !== 'Pending') {
                acc.history.push(f);
                return acc;
            }
            
            const dueDate = startOfDay(new Date(f.dueDate));
            if (isPast(dueDate) && !isToday(dueDate)) {
                acc.overdue.push(f);
            } else if (isToday(dueDate)) {
                acc.today.push(f);
            } else if (isFuture(dueDate) && dueDate <= next7Days) {
                acc.upcoming.push(f);
            } else {
                acc.later.push(f);
            }
            return acc;
        }, {
            overdue: [] as FollowUp[],
            today: [] as FollowUp[],
            upcoming: [] as FollowUp[],
            later: [] as FollowUp[],
            history: [] as FollowUp[]
        });
    }, [followups]);

    const handleOpenAddDialog = () => {
        setEditingFollowUp(null);
        setForm({ partyId: '', dealId: '', action: '', dueDateBS: '' });
        setIsDialogOpen(true);
    };

    const handleOpenEditDialog = (f: FollowUp) => {
        setEditingFollowUp(f);
        setForm({
            partyId: f.partyId,
            dealId: f.dealId || '',
            action: f.action,
            dueDateBS: f.dueDateBS,
        });
        setIsDialogOpen(true);
    };

    const handleSave = async () => {
        if (!user || !form.partyId || !form.action || !form.dueDateBS) return;

        let adDateISO = '';
        try {
            const parts = form.dueDateBS.split('/');
            if (parts.length !== 3) throw new Error();
            const nd = new NepaliDate(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
            adDateISO = nd.toJsDate().toISOString();
        } catch (error) {
            toast({ title: 'Invalid Date', description: 'Use YYYY/MM/DD format.', variant: 'destructive' });
            return;
        }

        const party = parties.find(p => p.id === form.partyId);
        const payload: any = {
            ...form,
            partyName: party?.name,
            dueDate: adDateISO,
            status: editingFollowUp?.status || 'Pending'
        };

        try {
            if (editingFollowUp) {
                await updateFollowUp(editingFollowUp.id, { ...payload, lastModifiedBy: user.username });
                toast({ title: 'Follow-up Updated' });
            } else {
                await addFollowUp({ ...payload, createdBy: user.username });
                toast({ title: 'Follow-up Scheduled' });
            }
            setIsDialogOpen(false);
        } catch (error) {
            toast({ title: 'Error saving reminder', variant: 'destructive' });
        }
    };

    const handleQuickStatus = async (f: FollowUp, status: FollowUpStatus) => {
        if (!user) return;
        try {
            await updateFollowUp(f.id, { 
                status, 
                completedAt: status === 'Done' ? new Date().toISOString() : undefined,
                lastModifiedBy: user.username 
            });
            toast({ title: status === 'Done' ? 'Action Completed' : 'Follow-up Skipped' });
        } catch (error) {
            toast({ title: 'Update failed', variant: 'destructive' });
        }
    };

    const handleDelete = async (id: string) => {
        try {
            await deleteFollowUp(id);
            toast({ title: 'Reminder Purged' });
        } catch (error) {
            toast({ title: 'Delete failed', variant: 'destructive' });
        }
    };

    const sortedHistory = useMemo(() => {
        return [...categorizedData.history]
            .sort((a, b) => new Date(b.completedAt || b.lastModifiedAt || b.createdAt).getTime() - new Date(a.completedAt || a.lastModifiedAt || a.createdAt).getTime())
            .slice(0, 20);
    }, [categorizedData.history]);

    return (
        <div className="flex flex-col gap-8 pb-20">
            <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-black text-gray-900 tracking-tighter uppercase">Follow-up Intelligence</h1>
                    <p className="text-muted-foreground text-sm font-medium">Strategic persistence and relationship maintenance.</p>
                </div>
                <Button onClick={handleOpenAddDialog} className="h-10 font-black text-xs uppercase tracking-widest shadow-lg shadow-primary/20 px-6">
                    <Plus className="mr-2 h-4 w-4" /> Schedule Action
                </Button>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Column 1: Priority Tasks */}
                <div className="space-y-6">
                    <SectionHeader title="Overdue Attention" count={categorizedData.overdue.length} color="text-red-600" />
                    {categorizedData.overdue.map(f => (
                        <FollowUpCard key={f.id} f={f} onStatus={handleQuickStatus} onEdit={handleOpenEditDialog} onDelete={handleDelete} priority="High" />
                    ))}
                    {categorizedData.overdue.length === 0 && <EmptyState text="No overdue items" />}

                    <SectionHeader title="Due Today" count={categorizedData.today.length} color="text-amber-600" />
                    {categorizedData.today.map(f => (
                        <FollowUpCard key={f.id} f={f} onStatus={handleQuickStatus} onEdit={handleOpenEditDialog} onDelete={handleDelete} priority="Medium" />
                    ))}
                    {categorizedData.today.length === 0 && <EmptyState text="Clear for today" />}
                </div>

                {/* Column 2: Upcoming & Later */}
                <div className="space-y-6">
                    <SectionHeader title="Upcoming (7 Days)" count={categorizedData.upcoming.length} color="text-blue-600" />
                    {categorizedData.upcoming.map(f => (
                        <FollowUpCard key={f.id} f={f} onStatus={handleQuickStatus} onEdit={handleOpenEditDialog} onDelete={handleDelete} />
                    ))}
                    {categorizedData.upcoming.length === 0 && <EmptyState text="No upcoming tasks" />}

                    <SectionHeader title="Scheduled Later" count={categorizedData.later.length} color="text-gray-500" />
                    {categorizedData.later.map(f => (
                        <FollowUpCard key={f.id} f={f} onStatus={handleQuickStatus} onEdit={handleOpenEditDialog} onDelete={handleDelete} />
                    ))}
                </div>
            </div>

            {/* History Section */}
            <Collapsible open={isHistoryOpen} onOpenChange={setIsHistoryOpen} className="w-full">
                <Card className="border-dashed bg-muted/20">
                    <CardHeader className="py-3">
                        <CollapsibleTrigger asChild>
                            <Button variant="ghost" className="w-full justify-between hover:bg-transparent">
                                <div className="flex items-center gap-2">
                                    <History className="h-4 w-4 text-muted-foreground" />
                                    <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Recent Activity (Last 20)</span>
                                </div>
                                <ChevronDown className={cn("h-4 w-4 transition-transform", isHistoryOpen && "rotate-180")} />
                            </Button>
                        </CollapsibleTrigger>
                    </CardHeader>
                    <CollapsibleContent>
                        <CardContent className="p-0">
                            <Table className="text-[11px]">
                                <TableBody>
                                    {sortedHistory.map(f => (
                                        <TableRow key={f.id} className="h-10 hover:bg-transparent">
                                            <TableCell className="pl-6 w-8"><Badge variant="outline" className={cn("text-[8px] uppercase font-black px-1.5 h-4", f.status === 'Done' ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-gray-50 text-gray-400 border-gray-200")}>{f.status}</Badge></TableCell>
                                            <TableCell className="font-bold text-gray-700">{f.action}</TableCell>
                                            <TableCell className="text-muted-foreground uppercase">{f.partyName}</TableCell>
                                            <TableCell className="text-right pr-6 font-mono text-gray-400">{f.completedAt ? format(new Date(f.completedAt), "PP") : toNepaliDate(f.dueDate)}</TableCell>
                                        </TableRow>
                                    ))}
                                    {sortedHistory.length === 0 && <TableRow><TableCell className="text-center py-8 italic opacity-40">No historical data.</TableCell></TableRow>}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </CollapsibleContent>
                </Card>
            </Collapsible>

            {/* Add/Edit Dialog */}
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
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
                            <Popover open={isCompanyPopoverOpen} onOpenChange={setIsCompanyPopoverOpen}>
                                <PopoverTrigger asChild>
                                    <Button variant="outline" role="combobox" className="w-full justify-between h-10 font-normal text-xs">
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

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Target Date (BS) <span className="text-destructive">*</span></Label>
                                <div className="relative">
                                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground opacity-50" />
                                    <Input value={form.dueDateBS} onChange={e => setForm({...form, dueDateBS: e.target.value})} placeholder="YYYY/MM/DD" className="pl-9 h-10 font-mono text-sm" />
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Linked Deal (Optional)</Label>
                                <Select value={form.dealId} onValueChange={v => setForm({...form, dealId: v})}>
                                    <SelectTrigger className="h-10"><SelectValue placeholder="Select context..."/></SelectTrigger>
                                    <SelectContent>
                                        {deals.filter(d => d.partyId === form.partyId && d.stage !== 'Won' && d.stage !== 'Lost').map(d => (
                                            <SelectItem key={d.id} value={d.id} className="text-xs">{d.title}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Action Required <span className="text-destructive">*</span></Label>
                            <Input value={form.action} onChange={e => setForm({...form, action: e.target.value})} placeholder="e.g. Discuss revised pricing terms" className="h-10 font-bold" />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsDialogOpen(false)} className="h-11 font-bold text-xs uppercase tracking-widest">Cancel</Button>
                        <Button onClick={handleSave} disabled={!form.partyId || !form.action || !form.dueDateBS} className="h-11 px-8 font-black text-xs uppercase tracking-widest shadow-xl shadow-primary/20">Commit Reminder</Button>
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
                                        <DropdownMenuItem onSelect={e => e.preventDefault()} className="text-destructive"><Trash2 className="mr-2 h-4 w-4"/> Delete</DropdownMenuItem>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                        <AlertDialogHeader><AlertDialogTitle className="uppercase tracking-tight">Purge Reminder?</AlertDialogTitle><AlertDialogDescription>This action is irreversible.</AlertDialogDescription></AlertDialogHeader>
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
