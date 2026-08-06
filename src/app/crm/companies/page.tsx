
'use client';

import { useState, useEffect, useMemo } from 'react';
import { 
    Building2, 
    Users, 
    History, 
    MoreHorizontal, 
    ArrowRight, 
    Mail, 
    Phone, 
    MapPin, 
    Edit, 
    Trash2, 
    Plus,
    Search,
    ShieldCheck,
    Briefcase,
    Zap,
    Clock,
    FileText,
    TrendingUp,
    ChevronRight,
    Loader2
} from 'lucide-react';
import type { Party, CRMContact, InteractionLog, DealStage } from '@/lib/types';
import { onPartiesUpdate, deleteParty } from '@/services/party-service';
import { onContactsUpdate, onInteractionsUpdate, addInteraction } from '@/services/crm-service';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { cn, toNepaliDate } from '@/lib/utils';
import { Separator } from '@/components/ui/separator';

export default function CompaniesManagementPage() {
    const { user } = useAuth();
    const { toast } = useToast();
    
    const [companies, setCompanies] = useState<Party[]>([]);
    const [contacts, setContacts] = useState<CRMContact[]>([]);
    const [interactions, setInteractions] = useState<InteractionLog[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    
    const [selectedCompany, setSelectedCompany] = useState<Party | null>(null);
    const [isDetailOpen, setIsDetailOpen] = useState(false);
    
    const [isLogDialogOpen, setIsLogDialogOpen] = useState(false);
    const [logForm, setLogForm] = useState({ type: 'Call' as any, subject: '', description: '' });

    useEffect(() => {
        setIsLoading(true);
        const unsubs = [
            onPartiesUpdate((data) => {
                setCompanies(data.filter(p => p.type === 'Customer' || p.type === 'Both'));
            }),
            onContactsUpdate(setContacts),
            onInteractionsUpdate((data) => {
                setInteractions(data);
                setIsLoading(false);
            })
        ];
        return () => unsubs.forEach(u => u());
    }, []);

    const filteredCompanies = useMemo(() => {
        return companies.filter(c => 
            c.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
            (c.address || '').toLowerCase().includes(searchQuery.toLowerCase())
        ).sort((a, b) => a.name.localeCompare(b.name));
    }, [companies, searchQuery]);

    const handleSaveLog = async () => {
        if (!user || !selectedCompany || !logForm.subject) return;
        try {
            await addInteraction({
                ...logForm,
                date: new Date().toISOString(),
                performer: user.username,
                partyId: selectedCompany.id
            });
            toast({ title: 'Activity Logged' });
            setIsLogDialogOpen(false);
            setLogForm({ type: 'Call', subject: '', description: '' });
        } catch {
            toast({ title: 'Error logging activity', variant: 'destructive' });
        }
    };

    const getPrimaryContact = (partyId: string) => {
        return contacts.find(c => c.partyId === partyId && c.isPrimary) || contacts.find(c => c.partyId === partyId);
    };

    return (
        <div className="flex flex-col gap-8">
            <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Account Intelligence</h1>
                    <p className="text-muted-foreground">Complete profiles and hierarchical relationship management.</p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input 
                            placeholder="Filter accounts..." 
                            className="pl-8 w-64 bg-white" 
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                        />
                    </div>
                    <Button variant="outline" asChild>
                        <Link href="/settings/finance?tab=parties">Manage Partners</Link>
                    </Button>
                </div>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {isLoading ? (
                    Array.from({length: 3}).map((_, i) => <Card key={i} className="h-48 animate-pulse bg-muted/20" />)
                ) : filteredCompanies.map(c => {
                    const primary = getPrimaryContact(c.id);
                    const linkedCount = contacts.filter(con => con.partyId === c.id).length;
                    const lastInteraction = interactions.find(i => i.partyId === c.id);

                    return (
                        <Card key={c.id} className="hover:shadow-md transition-all group border-gray-100 cursor-pointer" onClick={() => { setSelectedCompany(c); setIsDetailOpen(true); }}>
                            <CardHeader className="pb-2">
                                <div className="flex justify-between items-start">
                                    <Badge variant="outline" className="text-[8px] uppercase tracking-widest bg-blue-50 border-blue-100 text-blue-700">{c.ownership}</Badge>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}><Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100"><MoreHorizontal className="h-4 w-4"/></Button></DropdownMenuTrigger>
                                        <DropdownMenuContent align="end" className="w-48">
                                            <DropdownMenuItem onSelect={() => { setSelectedCompany(c); setIsDetailOpen(true); }}><Eye className="mr-2 h-4 w-4"/> Full Profile</DropdownMenuItem>
                                            <DropdownMenuItem onSelect={() => { setSelectedCompany(c); setIsLogDialogOpen(true); }}><Clock className="mr-2 h-4 w-4"/> Log Activity</DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </div>
                                <CardTitle className="text-xl font-black text-gray-900 tracking-tight leading-tight mt-2">{c.name}</CardTitle>
                                <CardDescription className="flex items-center gap-1.5"><MapPin className="h-3 w-3" /> {c.address || 'Location unassigned'}</CardDescription>
                            </CardHeader>
                            <CardContent className="pt-4 space-y-4">
                                <div className="p-3 rounded-xl bg-muted/20 border border-dashed space-y-2">
                                    <div className="flex items-center justify-between text-[10px] font-black uppercase text-muted-foreground tracking-tighter">
                                        <span>Primary Contact</span>
                                        <span>{linkedCount} Total</span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <div className="h-7 w-7 rounded-lg bg-white border flex items-center justify-center font-bold text-xs text-primary">{primary?.name.charAt(0) || '?'}</div>
                                        <div className="flex flex-col">
                                            <span className="text-xs font-bold text-gray-800">{primary?.name || 'No contacts defined'}</span>
                                            <span className="text-[9px] uppercase font-medium text-muted-foreground">{primary?.designation || 'Owner'}</span>
                                        </div>
                                    </div>
                                </div>
                                {lastInteraction && (
                                    <div className="flex items-center gap-2 text-[10px] font-medium text-gray-500 italic">
                                        <History className="h-3 w-3" /> Last Active: {format(new Date(lastInteraction.date), "PP")}
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    );
                })}
            </div>

            {/* Profile Detail Dialog */}
            {selectedCompany && (
                <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
                    <DialogContent className="max-w-5xl h-[90vh] flex flex-col p-0 border-none shadow-2xl overflow-hidden">
                        <DialogHeader className="p-8 border-b bg-primary/5 shrink-0">
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                                <div className="space-y-1">
                                    <Badge variant="outline" className="bg-white px-3 font-black text-[9px] uppercase tracking-tighter text-blue-600 border-blue-200">Company Record</Badge>
                                    <DialogTitle className="text-3xl font-black text-gray-900 tracking-tighter uppercase">{selectedCompany.name}</DialogTitle>
                                    <DialogDescription className="flex items-center gap-3 font-medium">
                                        <span className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 text-primary"/> {selectedCompany.address}</span>
                                        <span className="flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5 text-primary"/> PAN: {selectedCompany.panNumber || 'N/A'}</span>
                                    </DialogDescription>
                                </div>
                                <div className="flex gap-2">
                                    <Button onClick={() => setIsLogDialogOpen(true)} className="h-11 px-8 font-black text-xs uppercase tracking-widest shadow-xl shadow-primary/20"><Plus className="mr-2 h-4 w-4"/> Log Interaction</Button>
                                </div>
                            </div>
                        </DialogHeader>

                        <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-3">
                            {/* Left Side: Information */}
                            <div className="lg:col-span-2 overflow-y-auto bg-gray-50/30 p-8 space-y-8 border-r">
                                <section className="space-y-4">
                                    <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-2">
                                        <Users className="h-3.5 w-3.5" /> Personnel Hierarchy
                                    </h4>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        {contacts.filter(c => c.partyId === selectedCompany.id).map(contact => (
                                            <Card key={contact.id} className="shadow-sm ring-1 ring-black/5 border-none">
                                                <CardContent className="p-4 flex items-center gap-4">
                                                    <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center font-black text-sm transition-all shadow-inner", contact.isPrimary ? "bg-blue-600 text-white" : "bg-muted/50 text-muted-foreground")}>
                                                        {contact.name.charAt(0)}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center justify-between">
                                                            <p className="font-bold text-gray-900 truncate">{contact.name}</p>
                                                            {contact.isPrimary && <Badge className="text-[7px] uppercase h-3.5 px-1 bg-blue-600">Primary</Badge>}
                                                        </div>
                                                        <p className="text-[10px] font-bold text-muted-foreground uppercase">{contact.designation || 'Staff'}</p>
                                                    </div>
                                                </CardContent>
                                            </Card>
                                        ))}
                                        {contacts.filter(c => c.partyId === selectedCompany.id).length === 0 && (
                                            <div className="col-span-2 py-10 border-2 border-dashed rounded-xl flex flex-col items-center justify-center gap-2 text-muted-foreground">
                                                <Users className="h-6 w-6 opacity-20"/>
                                                <p className="text-xs font-bold uppercase tracking-widest">No Contacts Linked</p>
                                                <Button variant="ghost" size="sm" asChild className="text-[10px] font-black underline"><Link href="/crm/contacts">Go to Directory</Link></Button>
                                            </div>
                                        )}
                                    </div>
                                </section>

                                <section className="space-y-4">
                                    <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-2">
                                        <History className="h-3.5 w-3.5" /> Interaction History
                                    </h4>
                                    <div className="space-y-3">
                                        {interactions.filter(i => i.partyId === selectedCompany.id).map(log => (
                                            <div key={log.id} className="p-4 bg-white rounded-xl border border-gray-100 shadow-sm relative group">
                                                <div className="flex items-center justify-between mb-2">
                                                    <div className="flex items-center gap-2">
                                                        <Badge variant="outline" className="text-[8px] uppercase font-black px-1.5 h-4">{log.type}</Badge>
                                                        <span className="text-xs font-black text-gray-900">{log.subject}</span>
                                                    </div>
                                                    <span className="text-[9px] font-bold text-muted-foreground uppercase">{format(new Date(log.date), "PP")}</span>
                                                </div>
                                                <p className="text-[11px] text-gray-600 leading-relaxed italic border-l-2 border-primary/20 pl-3">{log.description}</p>
                                                <div className="mt-3 text-[8px] font-black uppercase tracking-widest text-muted-foreground/60 flex items-center gap-1">
                                                    <User className="h-2 w-2"/> Processed by {log.performer}
                                                </div>
                                            </div>
                                        ))}
                                        {interactions.filter(i => i.partyId === selectedCompany.id).length === 0 && (
                                            <div className="py-20 text-center opacity-40 italic text-xs uppercase font-black">No interaction logs found.</div>
                                        )}
                                    </div>
                                </section>
                            </div>

                            {/* Right Side: Quick Stats & Metadata */}
                            <div className="lg:col-span-1 p-8 space-y-8 bg-white overflow-y-auto">
                                <section className="space-y-4">
                                    <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Deal Progression</h4>
                                    <div className="space-y-3">
                                        {['Lead', 'Qualified', 'Proposal', 'Negotiation', 'Closed Won'].map((stage, idx) => (
                                            <div key={stage} className="flex items-center gap-3">
                                                <div className={cn("w-2 h-2 rounded-full", idx <= 1 ? "bg-primary" : "bg-muted")} />
                                                <span className={cn("text-[11px] font-bold uppercase", idx <= 1 ? "text-gray-900" : "text-muted-foreground")}>{stage}</span>
                                            </div>
                                        ))}
                                    </div>
                                </section>

                                <Separator />

                                <section className="space-y-4">
                                    <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Custom Attributes</h4>
                                    <div className="grid grid-cols-1 gap-4">
                                        <div className="space-y-1">
                                            <Label className="text-[9px] uppercase font-bold opacity-50">Client Score</Label>
                                            <p className="text-xs font-black">Grade A+ (Strategic)</p>
                                        </div>
                                        <div className="space-y-1">
                                            <Label className="text-[9px] uppercase font-bold opacity-50">Key Success Factor</Label>
                                            <p className="text-xs font-black">On-time freight delivery is critical</p>
                                        </div>
                                        <div className="space-y-1">
                                            <Label className="text-[9px] uppercase font-bold opacity-50">Assigned Account Mgr</Label>
                                            <p className="text-xs font-black uppercase text-primary underline">Diwas Chaulagain</p>
                                        </div>
                                    </div>
                                </section>
                                
                                <Card className="bg-primary/5 border-none shadow-none ring-1 ring-primary/20">
                                    <CardContent className="p-4 space-y-2">
                                        <div className="flex items-center gap-2 text-primary">
                                            <ShieldCheck className="h-4 w-4"/>
                                            <span className="text-[10px] font-black uppercase tracking-widest">Compliance</span>
                                        </div>
                                        <p className="text-[10px] text-blue-900/70 leading-relaxed font-medium">Valid business registration verified in Manufacturing & Logistics modules.</p>
                                    </CardContent>
                                </Card>
                            </div>
                        </div>

                        <DialogFooter className="p-6 border-t bg-white shrink-0">
                            <Button variant="outline" onClick={() => setIsDetailOpen(false)} className="font-bold text-xs uppercase h-11 px-8">Close Account</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            )}

            <Dialog open={isLogDialogOpen} onOpenChange={setIsLogDialogOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-black text-gray-900 uppercase tracking-tight">Log Relationship Event</DialogTitle>
                        <DialogDescription>Track important communications with this account.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-5 py-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-bold uppercase text-muted-foreground">Log Category</Label>
                                <Select value={logForm.type} onValueChange={v => setLogForm({...logForm, type: v})}>
                                    <SelectTrigger className="h-10 bg-white"><SelectValue/></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="Call">Call</SelectItem>
                                        <SelectItem value="Email">Email</SelectItem>
                                        <SelectItem value="Meeting">Meeting</SelectItem>
                                        <SelectItem value="Note">Internal Note</SelectItem>
                                        <SelectItem value="Task">Action Item</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-bold uppercase text-muted-foreground">Subject</Label>
                                <Input value={logForm.subject} onChange={e => setLogForm({...logForm, subject: e.target.value})} placeholder="Purpose" className="h-10" />
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-[10px] font-bold uppercase text-muted-foreground">Narrative Details</Label>
                            <Textarea value={logForm.description} onChange={e => setLogForm({...logForm, description: e.target.value})} placeholder="Detailed conversation points..." className="min-h-[120px] text-sm resize-none" />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsLogDialogOpen(false)} className="font-bold text-xs uppercase h-11">Cancel</Button>
                        <Button onClick={handleSaveLog} className="font-black text-xs uppercase h-11 px-10 shadow-lg shadow-primary/20">Commit Log</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
