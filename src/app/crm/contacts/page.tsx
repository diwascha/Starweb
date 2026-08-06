
'use client';

import { useState, useEffect, useMemo } from 'react';
import { 
    Users, 
    Plus, 
    Search, 
    Mail, 
    Phone, 
    Building2, 
    MoreHorizontal, 
    Edit, 
    Trash2, 
    Loader2, 
    ShieldCheck,
    CheckCircle2,
    X,
    FilterX
} from 'lucide-react';
import type { CRMContact, Party } from '@/lib/types';
import { onContactsUpdate, addContact, updateContact, deleteContact } from '@/services/crm-service';
import { onPartiesUpdate } from '@/services/party-service';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { 
    DropdownMenu, 
    DropdownMenuContent, 
    DropdownMenuItem, 
    DropdownMenuSeparator,
    DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

export default function ContactsDirectoryPage() {
    const { user } = useAuth();
    const { toast } = useToast();
    
    const [contacts, setContacts] = useState<CRMContact[]>([]);
    const [companies, setCompanies] = useState<Party[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingContact, setEditingContact] = useState<CRMContact | null>(null);
    const [form, setForm] = useState({
        name: '',
        partyId: '',
        email: '',
        phone: '',
        designation: '',
        isPrimary: false
    });

    useEffect(() => {
        setIsLoading(true);
        const unsubs = [
            onContactsUpdate(setContacts),
            onPartiesUpdate((data) => {
                setCompanies(data.filter(p => p.type === 'Customer' || p.type === 'Both'));
                setIsLoading(false);
            })
        ];
        return () => unsubs.forEach(u => u());
    }, []);

    const filteredContacts = useMemo(() => {
        return contacts.filter(c => 
            c.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
            (c.email || '').toLowerCase().includes(searchQuery.toLowerCase())
        ).sort((a, b) => a.name.localeCompare(b.name));
    }, [contacts, searchQuery]);

    const handleSave = async () => {
        if (!user || !form.name || !form.partyId) return;
        try {
            const payload = { ...form, createdBy: user.username };
            if (editingContact) {
                await updateContact(editingContact.id, { ...payload, lastModifiedBy: user.username });
                toast({ title: 'Contact Updated' });
            } else {
                await addContact(payload);
                toast({ title: 'Contact Added' });
            }
            setIsDialogOpen(false);
        } catch {
            toast({ title: 'Error saving contact', variant: 'destructive' });
        }
    };

    const handleDelete = async (id: string) => {
        try {
            await deleteContact(id);
            toast({ title: 'Contact Removed' });
        } catch {
            toast({ title: 'Error', variant: 'destructive' });
        }
    };

    return (
        <div className="flex flex-col gap-8">
            <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Contact Database</h1>
                    <p className="text-muted-foreground">Centralized directory of individual client personnel.</p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input 
                            placeholder="Search contacts..." 
                            className="pl-8 w-64 bg-white" 
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                        />
                    </div>
                    <Button onClick={() => { setEditingContact(null); setForm({name:'', partyId:'', email:'', phone:'', designation:'', isPrimary: false}); setIsDialogOpen(true); }}>
                        <Plus className="mr-2 h-4 w-4" /> Add Contact
                    </Button>
                </div>
            </header>

            <Card className="shadow-sm border-gray-100 bg-white">
                <CardContent className="p-0">
                    <Table>
                        <TableHeader className="bg-muted/50">
                            <TableRow>
                                <TableHead className="pl-6 font-bold">Contact Name</TableHead>
                                <TableHead className="font-bold">Company / Organization</TableHead>
                                <TableHead className="font-bold">Contact Info</TableHead>
                                <TableHead className="font-bold">Role</TableHead>
                                <TableHead className="text-right pr-6">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableRow><TableCell colSpan={5} className="text-center py-10"><Loader2 className="h-8 w-8 animate-spin mx-auto opacity-20"/></TableCell></TableRow>
                            ) : filteredContacts.map(c => (
                                <TableRow key={c.id} className="hover:bg-muted/30 h-14 transition-colors">
                                    <TableCell className="pl-6">
                                        <div className="flex items-center gap-3">
                                            <Avatar className="h-8 w-8 border">
                                                <AvatarFallback className="text-[10px] font-bold bg-primary/5 text-primary">{c.name.charAt(0)}</AvatarFallback>
                                            </Avatar>
                                            <div className="flex items-center gap-2">
                                                <span className="font-bold text-gray-900">{c.name}</span>
                                                {c.isPrimary && <Badge variant="secondary" className="text-[8px] uppercase tracking-tighter bg-blue-50 text-blue-700">Primary</Badge>}
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-sm font-medium text-blue-800">
                                        <div className="flex items-center gap-2">
                                            <Building2 className="h-3 w-3 opacity-40" />
                                            {companies.find(p => p.id === c.partyId)?.name || 'Unlinked'}
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex flex-col gap-0.5">
                                            {c.email && <div className="text-[11px] flex items-center gap-1.5"><Mail className="h-2.5 w-2.5 opacity-40"/> {c.email}</div>}
                                            {c.phone && <div className="text-[11px] flex items-center gap-1.5"><Phone className="h-2.5 w-2.5 opacity-40"/> {c.phone}</div>}
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-xs uppercase font-bold text-muted-foreground tracking-widest">{c.designation || 'Staff'}</TableCell>
                                    <TableCell className="text-right pr-6">
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4"/></Button></DropdownMenuTrigger>
                                            <DropdownMenuContent align="end" className="w-48">
                                                <DropdownMenuItem onSelect={() => { setEditingContact(c); setForm(c as any); setIsDialogOpen(true); }}>
                                                    <Edit className="mr-2 h-4 w-4"/> Edit Details
                                                </DropdownMenuItem>
                                                <DropdownMenuSeparator />
                                                <DropdownMenuItem className="text-destructive" onSelect={() => handleDelete(c.id)}>
                                                    <Trash2 className="mr-2 h-4 w-4"/> Delete Contact
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </TableCell>
                                </TableRow>
                            ))}
                            {!isLoading && filteredContacts.length === 0 && (
                                <TableRow><TableCell colSpan={5} className="text-center py-20 text-muted-foreground italic">No contacts found in the registry.</TableCell></TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-black text-gray-900">{editingContact ? 'Edit Individual' : 'Add New Contact'}</DialogTitle>
                        <DialogDescription>Define a persona within a client organization.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-1.5">
                            <Label className="text-[10px] font-bold uppercase text-muted-foreground">Full Name</Label>
                            <Input value={form.name} onChange={e => setForm({...form, name: e.target.value})} className="h-10 font-bold" />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-[10px] font-bold uppercase text-muted-foreground">Parent Company</Label>
                            <Select value={form.partyId} onValueChange={v => setForm({...form, partyId: v})}>
                                <SelectTrigger className="h-10 bg-white"><SelectValue placeholder="Select Company"/></SelectTrigger>
                                <SelectContent>{companies.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                            </Select>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-bold uppercase text-muted-foreground">Designation</Label>
                                <Input value={form.designation} onChange={e => setForm({...form, designation: e.target.value})} placeholder="e.g. Purchase Head" className="h-9" />
                            </div>
                            <div className="space-y-1.5 flex flex-col justify-end">
                                <div className="flex items-center space-x-2 h-9">
                                    <Checkbox id="primary" checked={form.isPrimary} onCheckedChange={v => setForm({...form, isPrimary: !!v})} />
                                    <Label htmlFor="primary" className="text-xs font-bold uppercase cursor-pointer">Primary Account Owner</Label>
                                </div>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4 pt-2">
                             <div className="space-y-1.5">
                                <Label className="text-[10px] font-bold uppercase text-muted-foreground">Email</Label>
                                <Input value={form.email} onChange={e => setForm({...form, email: e.target.value})} placeholder="office@client.com" className="h-9" />
                            </div>
                             <div className="space-y-1.5">
                                <Label className="text-[10px] font-bold uppercase text-muted-foreground">Direct Line</Label>
                                <Input value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} placeholder="+977-..." className="h-9" />
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsDialogOpen(false)} className="font-bold text-xs uppercase h-11">Cancel</Button>
                        <Button onClick={handleSave} className="font-black text-xs uppercase h-11 px-8 shadow-lg shadow-primary/20">Commit Contact</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
