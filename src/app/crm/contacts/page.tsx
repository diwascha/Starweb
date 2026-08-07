'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
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
    FilterX,
    ChevronsUpDown,
    Check,
    Download,
    Upload,
    FileSpreadsheet,
    ChevronDown
} from 'lucide-react';
import type { CRMContact, Party } from '@/lib/types';
import { onContactsUpdate, addContact, updateContact, deleteContact } from '@/services/crm-service';
import { onPartiesUpdate, addParty } from '@/services/party-service';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
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
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
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
    const fileInputRef = useRef<HTMLInputElement>(null);
    
    const [contacts, setContacts] = useState<CRMContact[]>([]);
    const [companies, setCompanies] = useState<Party[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isImporting, setIsImporting] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [isCompanyPopoverOpen, setIsCompanyPopoverOpen] = useState(false);
    const [editingContact, setEditingContact] = useState<CRMContact | null>(null);
    const [deletingContact, setDeletingContact] = useState<CRMContact | null>(null);
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
                setCompanies(
                    data.filter(p => p.type === 'Customer' || p.type === 'Both' || p.type === 'Tenant')
                        .sort((a, b) => a.name.localeCompare(b.name))
                );
                setIsLoading(false);
            })
        ];
        return () => unsubs.forEach(u => u());
    }, []);

    const filteredContacts = useMemo(() => {
        return contacts.filter(c => {
            const companyName = companies.find(p => p.id === c.partyId)?.name || '';
            const q = searchQuery.toLowerCase();
            return c.name.toLowerCase().includes(q) || 
                   (c.email || '').toLowerCase().includes(q) ||
                   companyName.toLowerCase().includes(q);
        }).sort((a, b) => a.name.localeCompare(b.name));
    }, [contacts, searchQuery, companies]);

    const openEditDialog = (c: CRMContact) => {
        setEditingContact(c);
        setForm({
            name: c.name || '',
            partyId: c.partyId || '',
            email: c.email || '',
            phone: c.phone || '',
            designation: c.designation || '',
            isPrimary: !!c.isPrimary
        });
        setIsDialogOpen(true);
    };

    const handleSave = async () => {
        if (!user || !form.name || !form.partyId) return;
        try {
            if (editingContact) {
                await updateContact(editingContact.id, { ...form, lastModifiedBy: user.username });
                toast({ title: 'Contact Updated' });
            } else {
                await addContact({ 
                    ...form, 
                    createdBy: user.username,
                    createdAt: new Date().toISOString()
                });
                toast({ title: 'Contact Added' });
            }
            setIsDialogOpen(false);
        } catch {
            toast({ title: 'Error saving contact', variant: 'destructive' });
        }
    };

    const handleConfirmDelete = async () => {
        if (!deletingContact) return;
        try {
            await deleteContact(deletingContact.id);
            toast({ title: 'Contact Removed' });
        } catch {
            toast({ title: 'Error', variant: 'destructive' });
        } finally {
            setDeletingContact(null);
        }
    };

    const handleExportExcel = async () => {
        try {
            const XLSX = await import('xlsx');
            const data = filteredContacts.map(c => ({
                'Contact Name': c.name,
                'Company': companies.find(p => p.id === c.partyId)?.name || 'Unlinked',
                'Designation': c.designation || '',
                'Email': c.email || '',
                'Phone': c.phone || '',
                'Is Primary': c.isPrimary ? 'Yes' : 'No'
            }));

            const worksheet = XLSX.utils.json_to_sheet(data);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "Contacts");
            XLSX.writeFile(workbook, `CRM_Contacts_${new Date().toISOString().split('T')[0]}.xlsx`);
            toast({ title: 'Export Successful' });
        } catch (error) {
            toast({ title: 'Export Failed', variant: 'destructive' });
        }
    };

    const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !user) return;

        setIsImporting(true);
        try {
            const XLSX = await import('xlsx');
            const reader = new FileReader();
            reader.onload = async (event) => {
                try {
                    const data = new Uint8Array(event.target?.result as ArrayBuffer);
                    const workbook = XLSX.read(data, { type: 'array' });
                    const sheet = workbook.Sheets[workbook.SheetNames[0]];
                    const json = XLSX.utils.sheet_to_json<any>(sheet);

                    // Local cache of company mapping to avoid redundant API hits/lookups
                    const localCompanies = [...companies];
                    let individualCompany = localCompanies.find(c => c.name === "Individual / Personal");
                    let individualCompanyId = individualCompany?.id;

                    if (!individualCompanyId) {
                        individualCompanyId = await addParty({
                            name: "Individual / Personal",
                            type: "Customer",
                            ownership: "Rental",
                            address: "System Generated for Individual Contacts",
                            createdBy: user.username,
                        } as any);
                    }

                    let count = 0;
                    let duplicates = 0;
                    let companiesCreated = 0;

                    for (const row of json) {
                        const name = String(row['Contact Name'] || row['Name'] || '').trim();
                        const companyName = String(row['Company'] || row['Organization'] || '').trim();
                        
                        if (!name) continue;

                        let targetPartyId = individualCompanyId;
                        
                        if (companyName) {
                            const matchedCompany = localCompanies.find(c => c.name.toLowerCase().trim() === companyName.toLowerCase().trim());
                            
                            if (matchedCompany) {
                                targetPartyId = matchedCompany.id;
                            } else {
                                // Create the missing company automatically
                                targetPartyId = await addParty({
                                    name: companyName,
                                    type: "Customer",
                                    ownership: "Rental",
                                    address: "Auto-created via Contact Import",
                                    createdBy: user.username
                                } as any);
                                // Add to local cache to match subsequent rows for same company
                                localCompanies.push({ id: targetPartyId, name: companyName } as Party);
                                companiesCreated++;
                            }
                        }

                        // DE-DUPLICATION LOGIC: 
                        // Check if this contact (same name) already exists for this specific company
                        const isDuplicate = contacts.some(c => 
                            c.name.toLowerCase().trim() === name.toLowerCase() && 
                            c.partyId === targetPartyId
                        );

                        if (isDuplicate) {
                            duplicates++;
                            continue;
                        }

                        await addContact({
                            name: name,
                            partyId: targetPartyId,
                            email: String(row['Email'] || ''),
                            phone: String(row['Phone'] || row['Mobile'] || ''),
                            designation: String(row['Designation'] || 'Staff'),
                            isPrimary: String(row['Is Primary'] || '').toLowerCase() === 'yes',
                            createdBy: user.username,
                            createdAt: new Date().toISOString()
                        });
                        count++;
                    }

                    toast({ 
                        title: 'Import Successful', 
                        description: `Processed ${count} new contacts. Found ${duplicates} duplicates. Created ${companiesCreated} new companies.` 
                    });
                } catch (err) {
                    console.error(err);
                    toast({ title: 'Import Failed', description: 'Failed to parse Excel data.', variant: 'destructive' });
                } finally {
                    setIsImporting(false);
                }
            };
            reader.readAsArrayBuffer(file);
        } catch (err) {
            setIsImporting(false);
            toast({ title: 'Error', description: 'Failed to process file.', variant: 'destructive' });
        }
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    return (
        <div className="flex flex-col gap-8">
            <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Contact Database</h1>
                    <p className="text-muted-foreground">Centralized directory of individual client personnel.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input 
                            placeholder="Search contacts..." 
                            className="pl-8 w-64 bg-white" 
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                        />
                    </div>
                    
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline" className="gap-2">
                                <FileSpreadsheet className="h-4 w-4" />
                                Data Actions
                                <ChevronDown className="h-3 w-3 opacity-50" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={handleExportExcel}>
                                <Download className="mr-2 h-4 w-4" /> Export to Excel
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => fileInputRef.current?.click()}>
                                <Upload className="mr-2 h-4 w-4" /> Import from Excel
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>

                    <input 
                        type="file" 
                        ref={fileInputRef} 
                        onChange={handleImportExcel} 
                        accept=".xlsx,.xls" 
                        className="hidden" 
                    />

                    <Button onClick={() => { setEditingContact(null); setForm({name:'', partyId:'', email:'', phone:'', designation:'', isPrimary: false}); setIsDialogOpen(true); }}>
                        <Plus className="mr-2 h-4 w-4" /> Add Contact
                    </Button>
                </div>
            </header>

            {isImporting && (
                <div className="bg-primary/5 border border-primary/20 p-4 rounded-lg flex items-center gap-3 animate-pulse">
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    <span className="text-sm font-bold uppercase tracking-widest text-primary">Synchronizing Contacts...</span>
                </div>
            )}

            <Card className="shadow-sm border-gray-100 bg-white">
                <CardContent className="p-0">
                    <Table>
                        <TableHeader className="bg-muted/50">
                            <TableRow>
                                <TableHead className="pl-6 font-bold text-[11px] uppercase tracking-wider">Contact Name</TableHead>
                                <TableHead className="font-bold text-[11px] uppercase tracking-wider">Company / Organization</TableHead>
                                <TableHead className="font-bold text-[11px] uppercase tracking-wider">Contact Info</TableHead>
                                <TableHead className="font-bold text-[11px] uppercase tracking-wider">Role</TableHead>
                                <TableHead className="text-right pr-6 font-bold text-[11px] uppercase tracking-wider">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableRow><TableCell colSpan={5} className="text-center py-10"><Loader2 className="h-8 w-8 animate-spin mx-auto opacity-20"/></TableCell></TableRow>
                            ) : filteredContacts.map(c => (
                                <TableRow key={c.id} className="hover:bg-muted/30 h-14 transition-colors">
                                    <TableCell className="pl-6">
                                        <div className="flex items-center gap-3">
                                            <Avatar className="h-8 w-8 border shadow-sm rounded-xl">
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
                                                <DropdownMenuItem onSelect={() => openEditDialog(c)}>
                                                    <Edit className="mr-2 h-4 w-4"/> Edit Details
                                                </DropdownMenuItem>
                                                <DropdownMenuSeparator />
                                                <DropdownMenuItem className="text-destructive" onSelect={() => setDeletingContact(c)}>
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

            <AlertDialog open={!!deletingContact} onOpenChange={(open) => !open && setDeletingContact(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle className="uppercase tracking-tight">Delete Contact?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will permanently remove <span className="font-bold text-gray-900">{deletingContact?.name}</span> from the directory. This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel className="font-bold text-xs uppercase">Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleConfirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90 font-black text-xs uppercase">
                            Delete Permanently
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-black text-gray-900 uppercase tracking-tight">{editingContact ? 'Modify Individual' : 'Add New Contact'}</DialogTitle>
                        <DialogDescription>Define a persona within a client organization.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-1.5">
                            <Label className="text-[10px] font-bold uppercase text-muted-foreground">Full Name</Label>
                            <Input value={form.name} onChange={e => setForm({...form, name: e.target.value})} className="h-10 font-bold" placeholder="e.g. John Doe" />
                        </div>
                        
                        <div className="space-y-1.5">
                            <Label className="text-[10px] font-bold uppercase text-muted-foreground">Parent Company</Label>
                            <Popover open={isCompanyPopoverOpen} onOpenChange={setIsCompanyPopoverOpen}>
                                <PopoverTrigger asChild>
                                    <Button
                                        variant="outline"
                                        role="combobox"
                                        aria-expanded={isCompanyPopoverOpen}
                                        className="w-full justify-between h-10 bg-white font-normal"
                                    >
                                        {form.partyId
                                            ? companies.find((company) => company.id === form.partyId)?.name
                                            : "Select or search company..."}
                                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                                    <Command>
                                        <CommandInput placeholder="Search company registry..." className="h-9" />
                                        <CommandList>
                                            <CommandEmpty>No companies found.</CommandEmpty>
                                            <CommandGroup>
                                                {companies.map((company) => (
                                                    <CommandItem
                                                        key={company.id}
                                                        value={company.name}
                                                        onSelect={() => {
                                                            setForm({ ...form, partyId: company.id });
                                                            setIsCompanyPopoverOpen(false);
                                                        }}
                                                        className="text-xs"
                                                    >
                                                        <Check
                                                            className={cn(
                                                                "mr-2 h-4 w-4",
                                                                form.partyId === company.id ? "opacity-100" : "opacity-0"
                                                            )}
                                                        />
                                                        {company.name}
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
                                <Label className="text-[10px] font-bold uppercase text-muted-foreground">Email Address</Label>
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
