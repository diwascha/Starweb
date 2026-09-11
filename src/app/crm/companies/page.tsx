'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';

import { 
    Building2, 
    Users, 
    MoreHorizontal, 
    MapPin, 
    Plus,
    Search,
    Loader2,
    ChevronRight,
    Edit,
    Trash2,
    GitMerge,
    ChevronDown,
    FileSpreadsheet,
    Mail,
    Phone,
    Download,
    Upload
} from 'lucide-react';
import type { Party, CRMContact, CustomerClassification } from '@/lib/types';
import { onPartiesUpdate, updateParty, deleteParty, mergeParties, addParty } from '@/services/party-service';
import { getCostReports } from '@/services/cost-report-service';
import { onContactsUpdate, addContact, updateContact, deleteContact } from '@/services/crm-service';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';

import { 
    DropdownMenu, 
    DropdownMenuContent, 
    DropdownMenuItem, 
    DropdownMenuTrigger,
    DropdownMenuSeparator
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

import NepaliDate from 'nepali-date-converter';

export default function CompaniesManagementPage() {
    const { user } = useAuth();
    const { toast } = useToast();
    
    const [companies, setCompanies] = useState<Party[]>([]);
    const [contacts, setContacts] = useState<CRMContact[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    
    const [selectedCompany, setSelectedCompany] = useState<Party | null>(null);
    // Which company is expanded to show its people. One at a time keeps the
    // list scannable - a company usually has several contacts, and the row
    // itself could only ever show the primary one.
    const [expandedCompanyId, setExpandedCompanyId] = useState<string | null>(null);
    
    const [isAttributesDialogOpen, setIsAttributesDialogOpen] = useState(false);
    const [attributesForm, setAttributesForm] = useState({ clientScore: '', successFactor: '', accountMgr: '' });

    const [deletingCompany, setDeletingCompany] = useState<Party | null>(null);
    // Deleting a party only removes the party doc (party-service.ts
    // deleteParty), leaving any contacts/quotations that reference this
    // partyId orphaned - unlike Merge, which reassigns them. Surface what
    // would be left behind before letting the delete go through.
    const [deleteQuotationCount, setDeleteQuotationCount] = useState<number | null>(null);

    // Contact CRUD (folded in from the old standalone /crm/contacts page -
    // a company's contacts are now managed directly on its own record).
    const [isContactDialogOpen, setIsContactDialogOpen] = useState(false);
    const [editingContact, setEditingContact] = useState<CRMContact | null>(null);
    const [deletingContact, setDeletingContact] = useState<CRMContact | null>(null);
    const [contactForm, setContactForm] = useState({ name: '', email: '', phone: '', designation: '', isPrimary: false });
    const contactsFileInputRef = useRef<HTMLInputElement>(null);
    const [isImportingContacts, setIsImportingContacts] = useState(false);

    const [isMergeDialogOpen, setIsMergeDialogOpen] = useState(false);
    const [mergeSourceId, setMergeSourceId] = useState('');
    const [mergeDestId, setMergeDestId] = useState('');
    const [isMerging, setIsMerging] = useState(false);


    useEffect(() => {
        setIsLoading(true);
        const unsubs = [
            onPartiesUpdate((data) => {
                setCompanies(data.filter(p => p.type === 'Customer' || p.type === 'Both'));
            }),
            onContactsUpdate((data) => {
                setContacts(data);
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

    const openAddContact = () => {
        setEditingContact(null);
        setContactForm({ name: '', email: '', phone: '', designation: '', isPrimary: false });
        setIsContactDialogOpen(true);
    };

    const openEditContact = (c: CRMContact) => {
        setEditingContact(c);
        setContactForm({
            name: c.name || '',
            email: c.email || '',
            phone: c.phone || '',
            designation: c.designation || '',
            isPrimary: !!c.isPrimary
        });
        setIsContactDialogOpen(true);
    };

    const handleSaveContact = async () => {
        if (!user || !selectedCompany || !contactForm.name) return;
        try {
            if (editingContact) {
                await updateContact(editingContact.id, { ...contactForm, lastModifiedBy: user.username });
                toast({ title: 'Contact Updated' });
            } else {
                await addContact({
                    ...contactForm,
                    partyId: selectedCompany.id,
                    createdBy: user.username,
                    createdAt: new Date().toISOString()
                });
                toast({ title: 'Contact Added' });
            }
            setIsContactDialogOpen(false);
        } catch {
            toast({ title: 'Error saving contact', variant: 'destructive' });
        }
    };

    const handleConfirmDeleteContact = async () => {
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

    const handleExportContactsExcel = async () => {
        try {
            const XLSX = await import('xlsx');
            const data = contacts.map(c => ({
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
        } catch {
            toast({ title: 'Export Failed', variant: 'destructive' });
        }
    };

    const handleImportContactsExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !user) return;
        setIsImportingContacts(true);
        try {
            const XLSX = await import('xlsx');
            const reader = new FileReader();
            reader.onload = async (event) => {
                try {
                    const data = new Uint8Array(event.target?.result as ArrayBuffer);
                    const workbook = XLSX.read(data, { type: 'array' });
                    const sheet = workbook.Sheets[workbook.SheetNames[0]];
                    const json = XLSX.utils.sheet_to_json<any>(sheet);
                    const localCompanies = [...companies];

                    let count = 0, duplicates = 0, companiesCreated = 0, skippedNoCompany = 0;

                    for (const row of json) {
                        const name = String(row['Contact Name'] || row['Name'] || '').trim();
                        const companyName = String(row['Company'] || row['Organization'] || '').trim();
                        if (!name) continue;

                        let targetPartyId = '';
                        if (companyName) {
                            const matchedCompany = localCompanies.find(c => c.name.toLowerCase().trim() === companyName.toLowerCase().trim());
                            if (matchedCompany) {
                                targetPartyId = matchedCompany.id;
                            } else {
                                targetPartyId = await addParty({
                                    name: companyName,
                                    type: "Customer",
                                    ownership: "Both",
                                    address: "Auto-created via Contact Import",
                                    createdBy: user.username
                                } as any);
                                localCompanies.push({ id: targetPartyId, name: companyName } as Party);
                                companiesCreated++;
                            }
                        } else {
                            skippedNoCompany++;
                            continue;
                        }

                        const isDuplicate = contacts.some(c =>
                            c.name.toLowerCase().trim() === name.toLowerCase() &&
                            c.partyId === targetPartyId
                        );
                        if (isDuplicate) { duplicates++; continue; }

                        await addContact({
                            name,
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
                        description: `Processed ${count} new contacts. Found ${duplicates} duplicates. Created ${companiesCreated} new companies. Skipped ${skippedNoCompany} rows with missing company names.`
                    });
                } catch {
                    toast({ title: 'Import Failed', description: 'Failed to parse Excel data.', variant: 'destructive' });
                } finally {
                    setIsImportingContacts(false);
                }
            };
            reader.readAsArrayBuffer(file);
        } catch {
            setIsImportingContacts(false);
            toast({ title: 'Error', description: 'Failed to process file.', variant: 'destructive' });
        }
        if (contactsFileInputRef.current) contactsFileInputRef.current.value = '';
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

    const handleConfirmDelete = async () => {
        if (!deletingCompany) return;
        try {
            await deleteParty(deletingCompany.id);
            toast({ title: 'Account Purged', description: `${deletingCompany.name} has been removed.` });
        } catch {
            toast({ title: 'Error', variant: 'destructive' });
        } finally {
            setDeletingCompany(null);
        }
    };

    const handleExecuteMerge = async () => {
        if (!mergeSourceId || !mergeDestId) return;
        setIsMerging(true);
        try {
            await mergeParties(mergeSourceId, mergeDestId);
            toast({ title: 'Accounts Merged', description: 'Records consolidated successfully.' });
            setIsMergeDialogOpen(false);
            setMergeSourceId('');
            setMergeDestId('');
        } catch {
            toast({ title: 'Merge Failed', variant: 'destructive' });
        } finally {
            setIsMerging(false);
        }
    };

    const contactsByParty = (partyId: string) =>
        contacts
            .filter(c => c.partyId === partyId)
            // Primary first, then alphabetical - the person you most likely want is on top.
            .sort((a, b) => (b.isPrimary ? 1 : 0) - (a.isPrimary ? 1 : 0) || a.name.localeCompare(b.name));

    const openAttributes = (c: Party) => {
        setAttributesForm({
            clientScore: c.customFields?.clientScore || '',
            successFactor: c.customFields?.successFactor || '',
            accountMgr: c.customFields?.accountMgr || '',
        });
        setIsAttributesDialogOpen(true);
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
                    <h1 className="text-3xl font-black text-gray-900 tracking-tighter uppercase">Companies &amp; Contacts</h1>
                    <p className="text-muted-foreground text-sm font-medium">Account profiles with their people, activity, and quotation history in one place.</p>
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
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline" className="h-10 font-bold text-xs uppercase tracking-widest gap-2">
                                <FileSpreadsheet className="h-4 w-4" /> Contacts <ChevronDown className="h-3 w-3 opacity-50" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={handleExportContactsExcel}>
                                <Download className="mr-2 h-4 w-4" /> Export Contacts to Excel
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => contactsFileInputRef.current?.click()}>
                                <Upload className="mr-2 h-4 w-4" /> Import Contacts from Excel
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                    <input
                        type="file"
                        ref={contactsFileInputRef}
                        onChange={handleImportContactsExcel}
                        accept=".xlsx,.xls"
                        className="hidden"
                    />
                    <Button variant="outline" onClick={() => setIsMergeDialogOpen(true)} className="h-10 font-bold text-xs uppercase tracking-widest gap-2">
                        <GitMerge className="h-4 w-4" /> Merge
                    </Button>
                    <Button variant="outline" asChild className="h-10 font-bold text-xs uppercase tracking-widest">
                        <Link href="/settings/finance?tab=parties">Manage Partners</Link>
                    </Button>
                </div>
            </header>

            {isImportingContacts && (
                <div className="bg-primary/5 border border-primary/20 p-4 rounded-lg flex items-center gap-3 animate-pulse">
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    <span className="text-sm font-bold uppercase tracking-widest text-primary">Synchronizing Contacts...</span>
                </div>
            )}

            <Card className="shadow-sm border-gray-100 bg-white overflow-hidden">
                <CardContent className="p-0">
                    <Table>
                        <TableHeader className="bg-muted/50">
                            <TableRow className="hover:bg-transparent">
                                <TableHead className="w-10 pl-4"></TableHead>
                                <TableHead className="font-black uppercase text-[10px] tracking-widest h-11">Company</TableHead>
                                <TableHead className="font-black uppercase text-[10px] tracking-widest h-11">Primary Contact</TableHead>
                                <TableHead className="font-black uppercase text-[10px] tracking-widest h-11 text-center">People</TableHead>
                                <TableHead className="font-black uppercase text-[10px] tracking-widest h-11">Classification</TableHead>
                                <TableHead className="font-black uppercase text-[10px] tracking-widest h-11">Ownership</TableHead>
                                <TableHead className="text-right pr-6 font-black uppercase text-[10px] tracking-widest h-11">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableRow>
                                    <TableCell colSpan={7} className="text-center py-20">
                                        <Loader2 className="h-8 w-8 animate-spin mx-auto opacity-20"/>
                                    </TableCell>
                                </TableRow>
                            ) : filteredCompanies.map(c => {
                                const companyContacts = contactsByParty(c.id);
                                const primary = getPrimaryContact(c.id);
                                const isExpanded = expandedCompanyId === c.id;

                                return (
                                    <React.Fragment key={c.id}>
                                    <TableRow
                                        className={cn("hover:bg-muted/30 cursor-pointer h-16 group transition-colors", isExpanded && "bg-muted/20")}
                                        onClick={() => setExpandedCompanyId(isExpanded ? null : c.id)}
                                    >
                                        <TableCell className="pl-4">
                                            {isExpanded
                                                ? <ChevronDown className="h-4 w-4 text-primary" />
                                                : <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-primary transition-colors" />}
                                        </TableCell>
                                        <TableCell>
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
                                                    <div className="flex flex-col min-w-0">
                                                        <span className="text-xs font-black text-gray-800 uppercase tracking-tighter truncate">{primary.name}</span>
                                                        <span className="text-[9px] uppercase font-bold text-muted-foreground truncate">{primary.phone || primary.designation || 'Staff'}</span>
                                                    </div>
                                                </div>
                                            ) : (
                                                <span className="text-[10px] text-muted-foreground italic font-medium uppercase opacity-50">No contacts defined</span>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-center">
                                            <Badge variant="outline" className="text-[9px] font-black tabular-nums h-5 px-2">
                                                {companyContacts.length}
                                            </Badge>
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
                                        <TableCell className="text-right pr-6" onClick={e => e.stopPropagation()}>
                                            <div className="flex items-center justify-end gap-1">
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="h-8 text-[9px] font-black uppercase tracking-widest"
                                                    onClick={() => { setSelectedCompany(c); openAddContact(); }}
                                                >
                                                    <Plus className="mr-1 h-3.5 w-3.5" /> Contact
                                                </Button>
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button variant="ghost" size="icon" className="h-8 w-8">
                                                            <MoreHorizontal className="h-4 w-4"/>
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end" className="w-48">
                                                        <DropdownMenuItem onSelect={() => { setSelectedCompany(c); openAttributes(c); }}>
                                                            <Edit className="mr-2 h-4 w-4"/> Account Details
                                                        </DropdownMenuItem>
                                                        <DropdownMenuSeparator />
                                                        <DropdownMenuItem className="text-destructive" onSelect={() => {
                                                            setDeletingCompany(c);
                                                            setDeleteQuotationCount(null);
                                                            getCostReports().then(reports => {
                                                                setDeleteQuotationCount(reports.filter(r => r.partyId === c.id).length);
                                                            }).catch(() => setDeleteQuotationCount(null));
                                                        }}>
                                                            <Trash2 className="mr-2 h-4 w-4"/> Delete Account
                                                        </DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </div>
                                        </TableCell>
                                    </TableRow>

                                    {/* Expanded: the company's own details, then every person at
                                        it. One company routinely has several people, and the row
                                        could only ever show the primary one. */}
                                    {isExpanded && (
                                        <TableRow className="hover:bg-transparent bg-muted/10 border-b-2">
                                            <TableCell colSpan={7} className="p-0">
                                                <div className="px-6 py-4 space-y-4">
                                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-3">
                                                        {[
                                                            { label: 'Address', value: c.address },
                                                            { label: 'PAN / VAT', value: c.panNumber },
                                                            { label: 'Account Manager', value: c.customFields?.accountMgr },
                                                            { label: 'Client Score', value: c.customFields?.clientScore },
                                                        ].map(f => (
                                                            <div key={f.label}>
                                                                <div className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">{f.label}</div>
                                                                <div className="text-xs font-bold text-gray-800 break-words">{f.value || <span className="opacity-30">—</span>}</div>
                                                            </div>
                                                        ))}
                                                    </div>

                                                    <div>
                                                        <div className="flex items-center justify-between mb-2">
                                                            <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                                                                <Users className="h-3.5 w-3.5 text-primary" /> Contacts ({companyContacts.length})
                                                            </h4>
                                                            <Button
                                                                size="sm"
                                                                variant="outline"
                                                                className="h-7 text-[9px] font-black uppercase tracking-widest"
                                                                onClick={() => { setSelectedCompany(c); openAddContact(); }}
                                                            >
                                                                <Plus className="mr-1 h-3 w-3" /> Add Person
                                                            </Button>
                                                        </div>

                                                        {companyContacts.length === 0 ? (
                                                            <div className="border border-dashed rounded-lg py-6 text-center">
                                                                <p className="text-[10px] text-muted-foreground italic font-medium uppercase tracking-widest">No people recorded for this company.</p>
                                                            </div>
                                                        ) : (
                                                            <div className="border rounded-lg divide-y bg-white overflow-hidden">
                                                                {companyContacts.map((ct: CRMContact) => (
                                                                    <div key={ct.id} className="flex flex-col sm:flex-row sm:items-center gap-2 px-3 py-2 hover:bg-muted/20 transition-colors">
                                                                        <div className="flex items-center gap-2 min-w-0 sm:w-56 shrink-0">
                                                                            <div className="h-7 w-7 rounded-lg bg-primary/5 border border-primary/10 flex items-center justify-center font-black text-[10px] text-primary shrink-0">
                                                                                {ct.name.charAt(0)}
                                                                            </div>
                                                                            <div className="min-w-0">
                                                                                <div className="text-xs font-black text-gray-900 uppercase tracking-tight truncate flex items-center gap-1.5">
                                                                                    {ct.name}
                                                                                    {ct.isPrimary && <Badge variant="outline" className="text-[7px] h-3.5 px-1 font-black uppercase bg-primary/5 border-primary/20 text-primary">Primary</Badge>}
                                                                                </div>
                                                                                <div className="text-[9px] uppercase font-bold text-muted-foreground truncate">{ct.designation || 'Staff'}</div>
                                                                            </div>
                                                                        </div>
                                                                        <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-x-4 min-w-0">
                                                                            <div className="text-[11px] text-gray-700 truncate flex items-center gap-1.5">
                                                                                <Phone className="h-3 w-3 text-muted-foreground shrink-0" />
                                                                                {ct.phone ? <a href={`tel:${ct.phone}`} className="hover:underline">{ct.phone}</a> : <span className="opacity-30">—</span>}
                                                                            </div>
                                                                            <div className="text-[11px] text-gray-700 truncate flex items-center gap-1.5">
                                                                                <Mail className="h-3 w-3 text-muted-foreground shrink-0" />
                                                                                {ct.email ? <a href={`mailto:${ct.email}`} className="hover:underline truncate">{ct.email}</a> : <span className="opacity-30">—</span>}
                                                                            </div>
                                                                        </div>
                                                                        <div className="flex items-center gap-1 shrink-0">
                                                                            <Button variant="ghost" size="icon" className="h-7 w-7" title="Edit contact"
                                                                                onClick={() => { setSelectedCompany(c); openEditContact(ct); }}>
                                                                                <Edit className="h-3.5 w-3.5" />
                                                                            </Button>
                                                                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" title="Remove contact"
                                                                                onClick={() => setDeletingContact(ct)}>
                                                                                <Trash2 className="h-3.5 w-3.5" />
                                                                            </Button>
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    )}
                                    </React.Fragment>
                                );
                            })}
                            {!isLoading && filteredCompanies.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={7} className="h-60 text-center text-muted-foreground italic">
                                        <Building2 className="h-10 w-10 mx-auto opacity-10 mb-3"/>
                                        <p className="text-sm font-medium uppercase tracking-widest">No accounts found in registry.</p>
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            <AlertDialog open={!!deletingCompany} onOpenChange={(open) => !open && setDeletingCompany(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle className="uppercase tracking-tight">Delete Account?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will permanently remove <span className="font-bold text-gray-900">{deletingCompany?.name}</span> from the registry. This action cannot be undone.
                            {(() => {
                                const contactCount = deletingCompany ? contacts.filter(c => c.partyId === deletingCompany.id).length : 0;
                                if (contactCount === 0 && !deleteQuotationCount) return null;
                                return (
                                    <span className="block mt-2 font-bold text-destructive">
                                        {contactCount > 0 && `${contactCount} contact${contactCount > 1 ? 's' : ''}`}
                                        {contactCount > 0 && !!deleteQuotationCount && ' and '}
                                        {!!deleteQuotationCount && `${deleteQuotationCount} saved quotation${deleteQuotationCount > 1 ? 's' : ''}`}
                                        {' '}will be left pointing at a deleted account instead of being removed or reassigned. Use Merge instead if you want them moved to another account first.
                                    </span>
                                );
                            })()}
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

            <Dialog open={isMergeDialogOpen} onOpenChange={setIsMergeDialogOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-black text-gray-900 uppercase tracking-tight">Merge Accounts</DialogTitle>
                        <DialogDescription>Consolidate duplicate records. Data from the source will be moved to the destination, and the source will be deleted.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-6 py-4">
                        <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase text-muted-foreground">Source Account (TO BE DELETED)</Label>
                            <Select value={mergeSourceId} onValueChange={setMergeSourceId}>
                                <SelectTrigger className="h-10 bg-white">
                                    <SelectValue placeholder="Select account to remove..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {companies.filter(c => c.id !== mergeDestId).map(c => (
                                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="flex justify-center">
                            <div className="bg-muted p-2 rounded-full">
                                <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase text-muted-foreground">Destination Account (TO KEEP)</Label>
                            <Select value={mergeDestId} onValueChange={setMergeDestId}>
                                <SelectTrigger className="h-10 bg-white">
                                    <SelectValue placeholder="Select account to keep..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {companies.filter(c => c.id !== mergeSourceId).map(c => (
                                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <DialogFooter className="border-t pt-4">
                        <Button variant="outline" onClick={() => setIsMergeDialogOpen(false)} className="h-11 font-bold text-xs uppercase">Cancel</Button>
                        <Button 
                            onClick={handleExecuteMerge} 
                            disabled={!mergeSourceId || !mergeDestId || isMerging} 
                            className="h-11 px-8 font-black text-xs uppercase tracking-widest shadow-xl shadow-primary/20"
                        >
                            {isMerging ? <Loader2 className="animate-spin h-4 w-4 mr-2"/> : <GitMerge className="mr-2 h-4 w-4"/>}
                            Execute Merge
                        </Button>
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
                        <Button onClick={handleSaveAttributes} className="font-black text-xs uppercase h-11 px-8 shadow-lg shadow-primary/20">Update Attributes</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Add/Edit Contact Dialog */}
            <Dialog open={isContactDialogOpen} onOpenChange={setIsContactDialogOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-black text-gray-900 uppercase tracking-tight">{editingContact ? 'Edit Contact' : 'Add Contact'}</DialogTitle>
                        <DialogDescription>{editingContact ? 'Update this person\'s details.' : `Add a person at ${selectedCompany?.name || 'this account'}.`}</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-1.5">
                            <Label className="text-[10px] font-bold uppercase text-muted-foreground">Full Name</Label>
                            <Input value={contactForm.name} onChange={e => setContactForm({...contactForm, name: e.target.value})} className="h-10 font-bold" placeholder="e.g. John Doe" />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-bold uppercase text-muted-foreground">Designation</Label>
                                <Input value={contactForm.designation} onChange={e => setContactForm({...contactForm, designation: e.target.value})} placeholder="e.g. Purchase Head" className="h-9" />
                            </div>
                            <div className="space-y-1.5 flex flex-col justify-end">
                                <div className="flex items-center space-x-2 h-9">
                                    <Checkbox id="contact-primary" checked={contactForm.isPrimary} onCheckedChange={v => setContactForm({...contactForm, isPrimary: !!v})} />
                                    <Label htmlFor="contact-primary" className="text-xs font-bold uppercase cursor-pointer">Primary Contact</Label>
                                </div>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4 pt-2">
                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-bold uppercase text-muted-foreground">Email Address</Label>
                                <Input value={contactForm.email} onChange={e => setContactForm({...contactForm, email: e.target.value})} placeholder="office@client.com" className="h-9" />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-bold uppercase text-muted-foreground">Direct Line</Label>
                                <Input value={contactForm.phone} onChange={e => setContactForm({...contactForm, phone: e.target.value})} placeholder="+977-..." className="h-9" />
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsContactDialogOpen(false)} className="font-bold text-xs uppercase h-11">Cancel</Button>
                        <Button onClick={handleSaveContact} disabled={!contactForm.name} className="font-black text-xs uppercase h-11 px-8 shadow-lg shadow-primary/20">{editingContact ? 'Save Changes' : 'Add Contact'}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

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
                        <AlertDialogAction onClick={handleConfirmDeleteContact} className="bg-destructive text-destructive-foreground hover:bg-destructive/90 font-black text-xs uppercase">
                            Delete Permanently
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
