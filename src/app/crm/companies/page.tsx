'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { 
    Building2, 
    Users, 
    History, 
    MoreHorizontal, 
    MapPin, 
    Plus,
    Search,
    ShieldCheck,
    Clock,
    Loader2,
    Eye,
    User,
    ChevronRight,
    Target,
    Edit,
    Bell,
    Check,
    TrendingUp,
    Receipt,
    Wallet
} from 'lucide-react';
import type { Party, CRMContact, InteractionLog, CustomerClassification, FollowUp, Transaction } from '@/lib/types';
import { onPartiesUpdate, updateParty } from '@/services/party-service';
import { onContactsUpdate, onInteractionsUpdate, addInteraction, onFollowUpsUpdate, addFollowUp } from '@/services/crm-service';
import { getTransactionsByParty } from '@/services/transaction-service';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { 
    DropdownMenu, 
    DropdownMenuContent, 
    DropdownMenuItem, 
    DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import { 
    Table, 
    TableBody, 
    TableCell, 
    TableHead, 
    TableHeader, 
    TableRow 
} from '@/components/ui/table';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Separator } from '@/components/ui/separator';
import NepaliDate from 'nepali-date-converter';

export default function CompaniesManagementPage() {
    const { user } = useAuth();
    const { toast } = useToast();
    
    const [companies, setCompanies] = useState<Party[]>([]);
    const [contacts, setContacts] = useState<CRMContact[]>([]);
    const [interactions, setInteractions] = useState<InteractionLog[]>([]);
    const [followups, setFollowups] = useState<FollowUp[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    
    const [selectedCompany, setSelectedCompany] = useState<Party | null>(null);
    const [isDetailOpen, setIsDetailOpen] = useState(false);
    
    const [isLogDialogOpen, setIsLogDialogOpen] = useState(false);
    const [logForm, setLogForm] = useState({ type: 'Call' as any, subject: '', description: '' });

    const [isAttributesDialogOpen, setIsAttributesDialogOpen] = useState(false);
    const [attributesForm, setAttributesForm] = useState({ clientScore: '', successFactor: '', accountMgr: '' });

    const [isFollowUpDialogOpen, setIsFollowUpDialogOpen] = useState(false);
    const [followUpForm, setFollowUpForm] = useState({ action: '', dueDateBS: '' });

    // Financial cache per partyId
    const [partyTransactions, setPartyTransactions] = useState<Record<string, Transaction[]>>({});
    const [isLoadingFinancials, setIsLoadingFinancials] = useState(false);

    useEffect(() => {
        setIsLoading(true);
        const unsubs = [
            onPartiesUpdate((data) => {
                setCompanies(data.filter(p => p.type === 'Customer' || p.type === 'Both'));
            }),
            onContactsUpdate(setContacts),
            onInteractionsUpdate((data) => {
                setInteractions(data);
            }),
            onFollowUpsUpdate((data) => {
                setFollowups(data);
                setIsLoading(false);
            })
        ];
        return () => unsubs.forEach(u => u());
    }, []);

    const sortedInteractions = useMemo(() => {
        return [...interactions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [interactions]);

    const filteredCompanies = useMemo(() => {
        return companies.filter(c => 
            c.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
            (c.address || '').toLowerCase().includes(searchQuery.toLowerCase())
        ).sort((a, b) => a.name.localeCompare(b.name));
    }, [companies, searchQuery]);

    const nextFollowUp = useMemo(() => {
        if (!selectedCompany) return null;
        return followups
            .filter(f => f.partyId === selectedCompany.id && f.status === 'Pending')
            .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())[0];
    }, [selectedCompany, followups]);

    const handleOpenDetail = async (company: Party) => {
        setSelectedCompany(company);
        setIsDetailOpen(true);
        
        // Fetch financial data if not in cache
        if (!partyTransactions[company.id]) {
            setIsLoadingFinancials(true);
            try {
                const txns = await getTransactionsByParty(company.id);
                setPartyTransactions(prev => ({ ...prev, [company.id]: txns }));
            } catch (err) {
                console.error("Financial fetch failed", err);
            } finally {
                setIsLoadingFinancials(false);
            }
        }
    };

    const financialData = useMemo(() => {
        if (!selectedCompany || !partyTransactions[selectedCompany.id]) return null;
        
        const txns = partyTransactions[selectedCompany.id];
        const today = new Date();
        const todayBS = new NepaliDate(today);
        // Fiscal Year starts at Shrawan (Month 3 in 0-indexed)
        const currentFiscalYear = todayBS.getMonth() >= 3 ? todayBS.getYear() : todayBS.getYear() - 1;

        let fiscalYearSales = 0;
        let totalSales = 0;
        let totalReceipts = 0;

        txns.forEach(t => {
            const tDate = new Date(t.date);
            const tBS = new NepaliDate(tDate);
            const tFiscalYear = tBS.getMonth() >= 3 ? tBS.getYear() : tBS.getYear() - 1;

            if (t.type === 'Sales') {
                totalSales += t.amount;
                if (tFiscalYear === currentFiscalYear) {
                    fiscalYearSales += t.amount;
                }
            } else if (t.type === 'Receipt') {
                totalReceipts += t.amount;
            }
        });

        const last5 = txns.slice(0, 5);

        return {
            fiscalYearSales,
            indicativeBalance: totalSales - totalReceipts,
            last5,
            hasData: txns.length > 0
        };
    }, [selectedCompany, partyTransactions]);

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

    const handleSaveFollowUp = async () => {
        if (!user || !selectedCompany || !followUpForm.action || !followUpForm.dueDateBS) return;
        
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

        try {
            await addFollowUp({
                partyId: selectedCompany.id,
                partyName: selectedCompany.name,
                action: followUpForm.action,
                dueDateBS: followUpForm.dueDateBS,
                dueDate: adDateISO,
                status: 'Pending',
                createdBy: user.username
            });
            toast({ title: 'Follow-up Scheduled' });
            setIsFollowUpDialogOpen(false);
            setFollowUpForm({ action: '', dueDateBS: '' });
        } catch {
            toast({ title: 'Error scheduling reminder', variant: 'destructive' });
        }
    };

    const handleSaveAttributes = async () => {
        if (!selectedCompany || !user) return;
        try {
            const updatedCustomFields = {
                ...(selectedCompany.customFields || {}),
                ...attributesForm
            };
            await updateParty(selectedCompany.id, { 
                customFields: updatedCustomFields,
                lastModifiedBy: user.username 
            });
            toast({ title: 'Attributes Updated' });
            setSelectedCompany(prev => prev ? { ...prev, customFields: updatedCustomFields } : null);
            setIsAttributesDialogOpen(false);
        } catch {
            toast({ title: 'Update Failed', variant: 'destructive' });
        }
    };

    const handleUpdateClassification = async (newClassification: CustomerClassification) => {
        if (!selectedCompany || !user) return;
        try {
            await updateParty(selectedCompany.id, { 
                classification: newClassification,
                lastModifiedBy: user.username 
            });
            toast({ title: 'Lifecycle Updated', description: `Status changed to ${newClassification}` });
            setSelectedCompany(prev => prev ? { ...prev, classification: newClassification } : null);
        } catch {
            toast({ title: 'Update Failed', variant: 'destructive' });
        }
    };

    const getPrimaryContact = (partyId: string) => {
        return contacts.find(c => c.partyId === partyId && c.isPrimary) || contacts.find(c => c.partyId === partyId);
    };

    const getClassificationBadge = (classification?: CustomerClassification) => {
        if (!classification) return null;
        const variants: Record<CustomerClassification, string> = {
            'Prospect': 'bg-blue-50 text-blue-700 border-blue-100',
            'Negotiation': 'bg-amber-50 text-amber-700 border-amber-100',
            'Customer': 'bg-emerald-50 text-emerald-700 border-emerald-100',
            'Past Client': 'bg-gray-50 text-gray-700 border-gray-100'
        };
        return (
            <Badge variant="outline" className={cn("text-[8px] font-black uppercase tracking-widest px-1.5 h-4 shadow-none", variants[classification])}>
                {classification}
            </Badge>
        );
    };

    return (
        <div className="flex flex-col gap-8">
            <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-black text-gray-900 tracking-tighter uppercase">Account Intelligence</h1>
                    <p className="text-muted-foreground text-sm font-medium">Complete profiles and hierarchical relationship management.</p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input 
                            placeholder="Filter accounts..." 
                            className="pl-8 w-64 bg-white h-10 border-gray-300 shadow-sm" 
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                        />
                    </div>
                    <Button variant="outline" asChild className="h-10 font-bold text-xs uppercase tracking-widest">
                        <Link href="/settings/finance?tab=parties">Manage Partners</Link>
                    </Button>
                </div>
            </header>

            <Card className="shadow-sm border-gray-100 bg-white overflow-hidden">
                <CardContent className="p-0">
                    <Table>
                        <TableHeader className="bg-muted/50">
                            <TableRow className="hover:bg-transparent">
                                <TableHead className="pl-6 font-black uppercase text-[10px] tracking-widest h-11">Company Name</TableHead>
                                <TableHead className="font-black uppercase text-[10px] tracking-widest h-11">Primary Contact</TableHead>
                                <TableHead className="font-black uppercase text-[10px] tracking-widest h-11">Classification</TableHead>
                                <TableHead className="font-black uppercase text-[10px] tracking-widest h-11">Ownership</TableHead>
                                <TableHead className="font-black uppercase text-[10px] tracking-widest h-11">Last Activity</TableHead>
                                <TableHead className="text-right pr-6 font-black uppercase text-[10px] tracking-widest h-11">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center py-20">
                                        <Loader2 className="h-8 w-8 animate-spin mx-auto opacity-20"/>
                                    </TableCell>
                                </TableRow>
                            ) : filteredCompanies.map(c => {
                                const primary = getPrimaryContact(c.id);
                                const lastInteraction = sortedInteractions.find(i => i.partyId === c.id);

                                return (
                                    <TableRow 
                                        key={c.id} 
                                        className="hover:bg-muted/30 cursor-pointer h-16 group transition-colors" 
                                        onClick={() => handleOpenDetail(c)}
                                    >
                                        <TableCell className="pl-6">
                                            <div className="flex flex-col">
                                                <span className="font-black text-gray-900 leading-tight uppercase tracking-tight group-hover:text-primary transition-colors">{c.name}</span>
                                                <span className="text-[10px] text-muted-foreground uppercase flex items-center gap-1">
                                                    <MapPin className="h-2.5 w-2.5 text-primary opacity-50"/> {c.address || 'Location unassigned'}
                                                </span>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            {primary ? (
                                                <div className="flex items-center gap-3">
                                                    <div className="h-8 w-8 rounded-xl bg-primary/5 border border-primary/10 flex items-center justify-center font-black text-xs text-primary shadow-inner">
                                                        {primary.name.charAt(0)}
                                                    </div>
                                                    <div className="flex flex-col">
                                                        <span className="text-xs font-black text-gray-800 uppercase tracking-tighter">{primary.name}</span>
                                                        <span className="text-[9px] uppercase font-bold text-muted-foreground">{primary.designation || 'Staff'}</span>
                                                    </div>
                                                </div>
                                            ) : (
                                                <span className="text-[10px] text-muted-foreground italic font-medium uppercase opacity-50">No contacts defined</span>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            {getClassificationBadge(c.classification) || (
                                                <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground opacity-30">Unset</span>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant="outline" className="text-[8px] font-black uppercase tracking-[0.15em] bg-blue-50 border-blue-100 text-blue-700 px-2 h-5">
                                                {c.ownership}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            {lastInteraction ? (
                                                <div className="flex items-center gap-2 text-[10px] font-bold text-gray-500 uppercase tracking-tight">
                                                    <History className="h-3 w-3" /> {format(new Date(lastInteraction.date), "PP")}
                                                </div>
                                            ) : (
                                                <span className="text-[10px] text-muted-foreground opacity-30 uppercase font-black">—</span>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-right pr-6" onClick={e => e.stopPropagation()}>
                                            <div className="flex items-center justify-end gap-1">
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button variant="ghost" size="icon" className="h-8 w-8 opacity-100 lg:opacity-0 group-hover:opacity-100 transition-opacity">
                                                            <MoreHorizontal className="h-4 w-4"/>
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end" className="w-48">
                                                        <DropdownMenuItem onSelect={() => handleOpenDetail(c)}>
                                                            <Eye className="mr-2 h-4 w-4"/> Full Profile
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem onSelect={() => { setSelectedCompany(c); setIsLogDialogOpen(true); }}>
                                                            <Clock className="mr-2 h-4 w-4"/> Log Activity
                                                        </DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                                <ChevronRight className="h-4 w-4 text-muted-foreground/30 group-hover:translate-x-1 transition-transform" />
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                            {!isLoading && filteredCompanies.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={6} className="h-60 text-center text-muted-foreground italic">
                                        <Building2 className="h-10 w-10 mx-auto opacity-10 mb-3"/>
                                        <p className="text-sm font-medium uppercase tracking-widest">No accounts found in registry.</p>
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            {/* Profile Detail Dialog */}
            {selectedCompany && (
                <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
                    <DialogContent className="max-w-5xl h-[90vh] flex flex-col p-0 border-none shadow-2xl overflow-hidden">
                        <DialogHeader className="p-8 border-b bg-primary/5 shrink-0">
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2 mb-1">
                                        <Badge variant="outline" className="bg-white px-3 font-black text-[9px] uppercase tracking-tighter text-blue-600 border-blue-200">Company Record</Badge>
                                        {getClassificationBadge(selectedCompany.classification)}
                                    </div>
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
                                        {sortedInteractions.filter(i => i.partyId === selectedCompany.id).map(log => (
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
                                        {sortedInteractions.filter(i => i.partyId === selectedCompany.id).length === 0 && (
                                            <div className="py-20 text-center opacity-40 italic text-xs uppercase font-black">No interaction logs found.</div>
                                        )}
                                    </div>
                                </section>
                            </div>

                            {/* Right Side: Quick Stats & Metadata */}
                            <div className="lg:col-span-1 p-8 space-y-8 bg-white overflow-y-auto">
                                <section className="space-y-4">
                                    <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                                        <Bell className="h-3.5 w-3.5 text-primary" /> Next Follow-up
                                    </h4>
                                    {nextFollowUp ? (
                                        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 space-y-3">
                                            <div className="flex justify-between items-start">
                                                <span className="text-[10px] font-black uppercase text-amber-700">{nextFollowUp.dueDateBS}</span>
                                                <Clock className="h-3 w-3 text-amber-600" />
                                            </div>
                                            <p className="text-xs font-black text-gray-900 leading-tight">{nextFollowUp.action}</p>
                                            <Button variant="link" asChild className="h-auto p-0 text-[10px] font-black uppercase underline text-amber-700">
                                                <Link href="/crm/followups">Manage Reminders</Link>
                                            </Button>
                                        </div>
                                    ) : (
                                        <div className="p-4 rounded-xl border border-dashed text-center space-y-3">
                                            <p className="text-[10px] text-muted-foreground italic font-medium">No scheduled actions.</p>
                                            <Button size="sm" variant="outline" onClick={() => setIsFollowUpDialogOpen(true)} className="h-8 font-black text-[9px] uppercase tracking-widest">
                                                <Plus className="mr-1.5 h-3 w-3" /> Schedule New
                                            </Button>
                                        </div>
                                    )}
                                </section>

                                <Separator />

                                {/* NEW: Financial Snapshot Section */}
                                <section className="space-y-4">
                                    <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                                        <TrendingUp className="h-3.5 w-3.5 text-primary" /> Financial Snapshot
                                    </h4>
                                    {isLoadingFinancials ? (
                                        <div className="py-10 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto opacity-20"/></div>
                                    ) : financialData?.hasData ? (
                                        <div className="space-y-4">
                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="p-3 rounded-xl bg-blue-50/50 border border-blue-100">
                                                    <p className="text-[8px] font-black uppercase text-blue-600 mb-1">Fiscal Year Sales</p>
                                                    <p className="text-xs font-black text-gray-900 tabular-nums">Rs. {financialData.fiscalYearSales.toLocaleString('en-IN')}</p>
                                                </div>
                                                <div className={cn(
                                                    "p-3 rounded-xl border",
                                                    financialData.indicativeBalance > 0 ? "bg-red-50/50 border-red-100" : "bg-emerald-50/50 border-emerald-100"
                                                )}>
                                                    <p className={cn("text-[8px] font-black uppercase mb-1", financialData.indicativeBalance > 0 ? "text-red-600" : "text-emerald-600")}>Indicative Balance</p>
                                                    <p className={cn("text-xs font-black tabular-nums", financialData.indicativeBalance > 0 ? "text-red-700" : "text-emerald-700")}>
                                                        Rs. {Math.abs(financialData.indicativeBalance).toLocaleString('en-IN')}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="space-y-2">
                                                <p className="text-[9px] font-black uppercase text-muted-foreground px-1">Recent Transactions</p>
                                                <div className="divide-y border rounded-xl bg-gray-50/50">
                                                    {financialData.last5.map(t => (
                                                        <div key={t.id} className="p-2 flex items-center justify-between">
                                                            <div className="flex flex-col">
                                                                <span className="text-[9px] font-bold text-gray-500 uppercase">{format(new Date(t.date), "MMM d, yyyy")}</span>
                                                                <Badge variant="outline" className="text-[7px] h-3 px-1 w-fit uppercase font-black bg-white">{t.type}</Badge>
                                                            </div>
                                                            <span className={cn("text-[10px] font-black tabular-nums", t.type === 'Sales' ? "text-blue-700" : "text-emerald-700")}>
                                                                {t.type === 'Sales' ? '+' : '-'} {t.amount.toLocaleString('en-IN')}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="p-6 rounded-xl border border-dashed text-center">
                                            <p className="text-[10px] text-muted-foreground italic font-medium">No financial records.</p>
                                        </div>
                                    )}
                                </section>

                                <Separator />

                                <section className="space-y-4">
                                    <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                                        <Target className="h-3 w-3"/> Lifecycle Classification
                                    </h4>
                                    <div className="flex flex-col gap-2">
                                        {(['Prospect', 'Negotiation', 'Customer', 'Past Client'] as CustomerClassification[]).map((stage) => (
                                            <Button
                                                key={stage}
                                                variant={selectedCompany.classification === stage ? "default" : "outline"}
                                                size="sm"
                                                className="justify-start h-9 text-[10px] font-black uppercase tracking-widest group"
                                                onClick={() => handleUpdateClassification(stage)}
                                            >
                                                <div className={cn(
                                                    "w-2 h-2 rounded-full mr-3 border shadow-sm transition-transform group-hover:scale-125",
                                                    selectedCompany.classification === stage ? "bg-white border-white" : 
                                                    stage === 'Prospect' ? "bg-blue-400 border-blue-200" :
                                                    stage === 'Negotiation' ? "bg-amber-400 border-amber-200" :
                                                    stage === 'Customer' ? "bg-emerald-500 border-emerald-200" : "bg-gray-400 border-gray-200"
                                                )} />
                                                {stage}
                                            </Button>
                                        ))}
                                    </div>
                                </section>

                                <Separator />

                                <section className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Custom Attributes</h4>
                                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => {
                                            setAttributesForm({
                                                clientScore: selectedCompany.customFields?.clientScore || '',
                                                successFactor: selectedCompany.customFields?.successFactor || '',
                                                accountMgr: selectedCompany.customFields?.accountMgr || ''
                                            });
                                            setIsAttributesDialogOpen(true);
                                        }}>
                                            <Edit className="h-3 w-3" />
                                        </Button>
                                    </div>
                                    <div className="grid grid-cols-1 gap-4">
                                        <div className="space-y-1">
                                            <Label className="text-[9px] uppercase font-bold opacity-50">Client Score</Label>
                                            <p className="text-xs font-black">{selectedCompany.customFields?.clientScore || 'Not Assigned'}</p>
                                        </div>
                                        <div className="space-y-1">
                                            <Label className="text-[9px] uppercase font-bold opacity-50">Key Success Factor</Label>
                                            <p className="text-xs font-black">{selectedCompany.customFields?.successFactor || 'Not Defined'}</p>
                                        </div>
                                        <div className="space-y-1">
                                            <Label className="text-[9px] uppercase font-bold opacity-50">Assigned Account Mgr</Label>
                                            <p className="text-xs font-black uppercase text-primary underline">{selectedCompany.customFields?.accountMgr || 'None'}</p>
                                        </div>
                                    </div>
                                </section>
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

            <Dialog open={isFollowUpDialogOpen} onOpenChange={setIsFollowUpDialogOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-black text-gray-900 uppercase tracking-tight">Schedule Persistence</DialogTitle>
                        <DialogDescription>Plan a future action for {selectedCompany?.name}.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-5 py-4">
                        <div className="space-y-1.5">
                            <Label className="text-[10px] font-bold uppercase text-muted-foreground">Target Date (BS)</Label>
                            <Input value={followUpForm.dueDateBS} onChange={e => setFollowUpForm({...followUpForm, dueDateBS: e.target.value})} placeholder="YYYY/MM/DD" className="h-10 font-mono" />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-[10px] font-bold uppercase text-muted-foreground">Action Required</Label>
                            <Input value={followUpForm.action} onChange={e => setFollowUpForm({...followUpForm, action: e.target.value})} placeholder="e.g. Call regarding bulk contract" className="h-10 font-bold" />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsFollowUpDialogOpen(false)} className="font-bold text-xs uppercase h-11">Cancel</Button>
                        <Button onClick={handleSaveFollowUp} className="font-black text-xs uppercase h-11 px-10 shadow-lg shadow-primary/20">Schedule Action</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={isAttributesDialogOpen} onOpenChange={setIsAttributesDialogOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-black text-gray-900 uppercase tracking-tight">Edit Custom Attributes</DialogTitle>
                        <DialogDescription>Define strategic metadata for this client account.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-5 py-4">
                        <div className="space-y-1.5">
                            <Label className="text-[10px] font-bold uppercase text-muted-foreground">Client Score</Label>
                            <Select value={attributesForm.clientScore} onValueChange={v => setAttributesForm({...attributesForm, clientScore: v})}>
                                <SelectTrigger className="h-10 bg-white">
                                    <SelectValue placeholder="Select score category..." />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Grade A+ (Strategic)">Grade A+ (Strategic)</SelectItem>
                                    <SelectItem value="Grade A (Valued)">Grade A (Valued)</SelectItem>
                                    <SelectItem value="Grade B (Growth)">Grade B (Growth)</SelectItem>
                                    <SelectItem value="Grade C (Standard)">Grade C (Standard)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-[10px] font-bold uppercase text-muted-foreground">Key Success Factor</Label>
                            <Input value={attributesForm.successFactor} onChange={e => setAttributesForm({...attributesForm, successFactor: e.target.value})} placeholder="e.g. On-time delivery" className="h-10" />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-[10px] font-bold uppercase text-muted-foreground">Assigned Account Mgr</Label>
                            <Input value={attributesForm.accountMgr} onChange={e => setAttributesForm({...attributesForm, accountMgr: e.target.value})} placeholder="Manager Name" className="h-10" />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsAttributesDialogOpen(false)} className="font-bold text-xs uppercase h-11">Cancel</Button>
                        <Button onClick={handleSaveAttributes} className="font-black text-xs uppercase h-11 px-10 shadow-lg shadow-primary/20">Update Attributes</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
