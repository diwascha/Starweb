'use client';

import React, { useState, useEffect, useMemo } from 'react';
import type { 
  UnitOfMeasurement, 
  DocumentPrefixes, 
  CompanyProfile,
  AppBranding
} from '@/lib/types';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { 
  Plus, 
  Edit, 
  Trash2, 
  Save, 
  Settings as SettingsIcon,
  Loader2,
  FileText,
  Building2,
  Settings2,
  PlusCircle,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/hooks/use-auth';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { onUomsUpdate, addUom, updateUom, deleteUom } from '@/services/uom-service';
import { onSettingUpdate, setSetting } from '@/services/settings-service';
import { 
    documentTypes, 
    getDocumentName 
} from '@/lib/types';
import { DEFAULT_COMPANY_PROFILE, DEFAULT_FLEET_PROFILE } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { 
    AlertDialog, 
    AlertDialogAction, 
    AlertDialogCancel, 
    AlertDialogContent, 
    AlertDialogDescription, 
    AlertDialogFooter, 
    AlertDialogHeader, 
    AlertDialogTitle, 
    AlertDialogTrigger 
} from '@/components/ui/alert-dialog';

export default function GeneralSettingsPage() {
  const { user, hasPermission } = useAuth();
  const { toast } = useToast();
  
  const [uoms, setUoms] = useState<UnitOfMeasurement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [prefixes, setPrefixes] = useState<DocumentPrefixes>({});
  const [isPrefixDialogOpen, setIsPrefixDialogOpen] = useState(false);
  const [editingPrefix, setEditingPrefix] = useState<{ key: keyof DocumentPrefixes; value: string } | null>(null);
  const [companyProfile, setCompanyProfile] = useState<CompanyProfile>(DEFAULT_COMPANY_PROFILE);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [fleetProfile, setFleetProfile] = useState<CompanyProfile>(DEFAULT_FLEET_PROFILE);
  const [isSavingFleetProfile, setIsSavingFleetProfile] = useState(false);
  const [appBranding, setAppBranding] = useState<AppBranding>({ appName: 'StarSutra', appMotto: '' });
  const [isSavingBranding, setIsSavingBranding] = useState(false);
  
  const [ownershipCategories, setOwnershipCategories] = useState<string[]>(['Sijan', 'Shivam', 'Rental', 'Both']);
  const [newOwnershipName, setNewOwnershipName] = useState('');
  const [isEditOwnershipDialogOpen, setIsEditOwnershipDialogOpen] = useState(false);
  const [oldOwnershipName, setOldOwnershipName] = useState('');
  const [updatedOwnershipName, setUpdatedOwnershipName] = useState('');

  const [isUomDialogOpen, setIsUomDialogOpen] = useState(false);
  const [editingUom, setEditingUom] = useState<UnitOfMeasurement | null>(null);
  const [uomForm, setUomForm] = useState({ name: '', abbreviation: '' });

  useEffect(() => {
    setIsLoading(true);
    const unsubs = [
        onUomsUpdate(setUoms),
        onSettingUpdate('documentPrefixes', (setting) => setPrefixes(setting?.value || {})),
        onSettingUpdate('companyProfile', (setting) => setCompanyProfile(setting?.value || DEFAULT_COMPANY_PROFILE)),
        onSettingUpdate('fleetCompanyProfile', (setting) => setFleetProfile(setting?.value || DEFAULT_FLEET_PROFILE)),
        onSettingUpdate('appBranding', (setting) => setAppBranding(setting?.value || { appName: 'StarSutra', appMotto: '' })),
        onSettingUpdate('ownership_categories', (s) => { if (s?.value) setOwnershipCategories(s.value); }),
    ];
    setIsLoading(false);
    return () => unsubs.forEach(u => u());
  }, []);

  const handleSaveCompanyProfile = async () => {
    if (!user) return;
    setIsSavingProfile(true);
    try {
        await setSetting('companyProfile', { ...companyProfile, lastModifiedBy: user.username, lastModifiedAt: new Date().toISOString() });
        toast({ title: 'Success', description: 'Main Company profile updated.' });
    } catch {
        toast({ title: 'Error', variant: 'destructive' });
    } finally {
        setIsSavingProfile(false);
    }
  };

  const handleSaveFleetProfile = async () => {
    if (!user) return;
    setIsSavingFleetProfile(true);
    try {
        await setSetting('fleetCompanyProfile', { ...fleetProfile, lastModifiedBy: user.username, lastModifiedAt: new Date().toISOString() });
        toast({ title: 'Success', description: 'Fleet profile updated.' });
    } catch {
        toast({ title: 'Error', variant: 'destructive' });
    } finally {
        setIsSavingFleetProfile(false);
    }
  };

  const handleSaveAppBranding = async () => {
    if (!user) return;
    setIsSavingBranding(true);
    try {
        await setSetting('appBranding', appBranding);
        toast({ title: 'Success', description: 'Branding updated.' });
    } catch {
        toast({ title: 'Error', variant: 'destructive' });
    } finally {
        setIsSavingBranding(false);
    }
  };

  const handleAddOwnership = async () => {
    if (!newOwnershipName.trim()) return;
    const next = [...ownershipCategories, newOwnershipName.trim()];
    try {
        await setSetting('ownership_categories', next);
        setNewOwnershipName('');
        toast({ title: 'Category Added' });
    } catch {
        toast({ title: 'Error', variant: 'destructive' });
    }
  };

  const handleUpdateOwnership = async () => {
    if (!updatedOwnershipName.trim() || !oldOwnershipName) return;
    const next = ownershipCategories.map(c => c === oldOwnershipName ? updatedOwnershipName.trim() : c);
    try {
        await setSetting('ownership_categories', next);
        setIsEditOwnershipDialogOpen(false);
        toast({ title: 'Category Renamed' });
    } catch {
        toast({ title: 'Error', variant: 'destructive' });
    }
  };

  const handleRemoveOwnership = async (name: string) => {
    const next = ownershipCategories.filter(c => c !== name);
    try {
        await setSetting('ownership_categories', next);
        toast({ title: 'Category Removed' });
    } catch {
        toast({ title: 'Error', variant: 'destructive' });
    }
  };

  const handleSavePrefix = async () => {
    if (!editingPrefix) return;
    const newPrefixes = { ...prefixes, [editingPrefix.key]: editingPrefix.value };
    try {
        await setSetting('documentPrefixes', newPrefixes);
        setIsPrefixDialogOpen(false);
        toast({ title: 'Prefix Saved' });
    } catch {
        toast({ title: 'Error', variant: 'destructive' });
    }
  };

  const handleUomSubmit = async () => {
    if (!user) return;
    try {
        if (editingUom) await updateUom(editingUom.id, { ...uomForm, lastModifiedBy: user.username });
        else await addUom({ ...uomForm, createdBy: user.username, createdAt: new Date().toISOString() });
        setIsUomDialogOpen(false);
        toast({ title: 'UOM Saved' });
    } catch {
        toast({ title: 'Error', variant: 'destructive' });
    }
  };

  return (
    <div className="flex flex-col gap-8">
        <header>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">General Configuration</h1>
            <p className="text-muted-foreground text-sm">Identity, branding, and system-wide standards.</p>
        </header>

        <Tabs defaultValue="branding" className="w-full">
            <TabsList className="bg-muted/50 p-1 mb-6">
                <TabsTrigger value="branding" className="px-6 text-[10px] uppercase font-bold tracking-widest">App Branding</TabsTrigger>
                <TabsTrigger value="profile" className="px-6 text-[10px] uppercase font-bold tracking-widest">Company Profile</TabsTrigger>
                <TabsTrigger value="ownership" className="px-6 text-[10px] uppercase font-bold tracking-widest">Ownerships</TabsTrigger>
                <TabsTrigger value="uom" className="px-6 text-[10px] uppercase font-bold tracking-widest">Units (UOM)</TabsTrigger>
                <TabsTrigger value="numbering" className="px-6 text-[10px] uppercase font-bold tracking-widest">Numbering</TabsTrigger>
            </TabsList>

            <TabsContent value="branding" className="animate-in fade-in slide-in-from-left-2">
                 <Card className="shadow-sm border-gray-100 bg-white">
                    <CardHeader className="flex flex-row items-center justify-between py-6 px-8 border-b bg-primary/5">
                        <div className="space-y-1">
                            <CardTitle className="text-xl font-black text-gray-900 tracking-tight">System Identity</CardTitle>
                            <CardDescription className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Application naming and persona.</CardDescription>
                        </div>
                        <Button onClick={handleSaveAppBranding} disabled={isSavingBranding} className="h-10 px-8 font-black text-[10px] uppercase tracking-widest shadow-lg">
                            {isSavingBranding ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                            Apply Branding
                        </Button>
                    </CardHeader>
                    <CardContent className="p-8 space-y-6">
                        <div className="space-y-2 max-w-md">
                            <Label className="text-xs font-black uppercase text-muted-foreground tracking-widest">Master App Name</Label>
                            <Input value={appBranding.appName || ''} onChange={e => setAppBranding(p => ({ ...p, appName: e.target.value }))} className="h-12 text-lg font-bold" />
                        </div>
                        <div className="space-y-2 max-w-md">
                            <Label className="text-xs font-black uppercase text-muted-foreground tracking-widest">Tagline</Label>
                            <Input value={appBranding.appMotto || ''} onChange={e => setAppBranding(p => ({ ...p, appMotto: e.target.value }))} className="h-10" />
                        </div>
                    </CardContent>
                 </Card>
            </TabsContent>

            <TabsContent value="profile" className="space-y-8 animate-in fade-in slide-in-from-left-2">
                <Card className="shadow-sm border-gray-100 overflow-hidden">
                    <CardHeader className="flex flex-row items-center justify-between bg-primary/5 py-4 px-6 border-b">
                        <CardTitle className="text-lg font-black tracking-tight">Main Manufacturing Profile</CardTitle>
                        <Button onClick={handleSaveCompanyProfile} disabled={isSavingProfile} className="h-9 px-6 font-bold text-xs uppercase tracking-widest">
                            {isSavingProfile ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                            Update
                        </Button>
                    </CardHeader>
                    <CardContent className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-1.5"><Label className="text-[10px] uppercase font-bold text-muted-foreground">Name (EN)</Label><Input value={companyProfile.nameEn || ''} onChange={e => setCompanyProfile(p => ({...p, nameEn: e.target.value}))} /></div>
                        <div className="space-y-1.5"><Label className="text-[10px] uppercase font-bold text-muted-foreground">कम्पनी (NP)</Label><Input value={companyProfile.nameNp || ''} onChange={e => setCompanyProfile(p => ({...p, nameNp: e.target.value}))} /></div>
                        <div className="space-y-1.5 md:col-span-2"><Label className="text-[10px] uppercase font-bold text-muted-foreground">Address</Label><Input value={companyProfile.address || ''} onChange={e => setCompanyProfile(p => ({...p, address: e.target.value}))} /></div>
                    </CardContent>
                </Card>
                <Card className="shadow-sm border-gray-100 overflow-hidden">
                    <CardHeader className="flex flex-row items-center justify-between bg-muted/20 py-4 px-6 border-b">
                        <CardTitle className="text-lg font-black tracking-tight">Sijan Logistics Profile</CardTitle>
                        <Button onClick={handleSaveFleetProfile} disabled={isSavingFleetProfile} className="h-9 px-6 font-bold text-xs uppercase tracking-widest">
                            {isSavingFleetProfile ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                            Update
                        </Button>
                    </CardHeader>
                    <CardContent className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-1.5"><Label className="text-[10px] uppercase font-bold text-muted-foreground">Name (EN)</Label><Input value={fleetProfile.nameEn || ''} onChange={e => setFleetProfile(p => ({...p, nameEn: e.target.value}))} /></div>
                        <div className="space-y-1.5"><Label className="text-[10px] uppercase font-bold text-muted-foreground">PAN/VAT</Label><Input value={fleetProfile.pan || ''} onChange={e => setFleetProfile(p => ({...p, pan: e.target.value}))} /></div>
                        <div className="space-y-1.5 md:col-span-2"><Label className="text-[10px] uppercase font-bold text-muted-foreground">Address</Label><Input value={fleetProfile.address || ''} onChange={e => setFleetProfile(p => ({...p, address: e.target.value}))} /></div>
                    </CardContent>
                </Card>
            </TabsContent>

            <TabsContent value="ownership" className="animate-in fade-in slide-in-from-left-2">
                <Card className="shadow-sm border-gray-100 bg-white overflow-hidden">
                    <CardHeader className="flex flex-row items-center justify-between py-4 border-b bg-muted/5">
                        <div>
                            <CardTitle className="text-base font-black uppercase">Ownership Categories</CardTitle>
                        </div>
                        <div className="flex gap-2">
                            <Input placeholder="New..." className="h-9 w-40 text-xs" value={newOwnershipName} onChange={e => setNewOwnershipName(e.target.value)} />
                            <Button size="sm" onClick={handleAddOwnership} className="h-9 uppercase font-black text-[10px] tracking-widest"><Plus className="mr-2 h-4 w-4" /> Add</Button>
                        </div>
                    </CardHeader>
                    <CardContent className="p-0">
                        <Table className="text-xs">
                            <TableHeader className="bg-muted/50"><TableRow><TableHead className="pl-6 font-bold uppercase text-[10px]">Category Name</TableHead><TableHead className="text-right pr-6 font-bold uppercase text-[10px]">Actions</TableHead></TableRow></TableHeader>
                            <TableBody>
                                {ownershipCategories.map(cat => (
                                    <TableRow key={cat} className="h-12 border-b group">
                                        <TableCell className="font-bold pl-6">{cat}</TableCell>
                                        <TableCell className="text-right pr-6 space-x-1">
                                            {!['Sijan', 'Shivam', 'Rental', 'Both'].includes(cat) && (
                                                <>
                                                    <Button variant="ghost" size="icon" className="h-7 w-7 text-primary" onClick={() => { setOldOwnershipName(cat); setUpdatedOwnershipName(cat); setIsEditOwnershipDialogOpen(true); }}><Edit className="h-3.5 w-3.5" /></Button>
                                                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleRemoveOwnership(cat)}><Trash2 className="h-3.5 w-3.5" /></Button>
                                                </>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            </TabsContent>

            <TabsContent value="uom" className="animate-in fade-in slide-in-from-left-2">
                <Card className="shadow-sm border-gray-100 bg-white overflow-hidden">
                    <CardHeader className="flex flex-row items-center justify-between py-4 border-b">
                        <CardTitle className="text-base font-black uppercase">Units of Measurement</CardTitle>
                        <Button size="sm" onClick={() => { setEditingUom(null); setUomForm({name:'', abbreviation:''}); setIsUomDialogOpen(true); }} className="h-8 uppercase font-black text-[10px] tracking-widest"><Plus className="mr-2 h-4 w-4" /> New Unit</Button>
                    </CardHeader>
                    <CardContent className="p-0">
                        <Table className="text-xs"><TableHeader className="bg-muted/50"><TableRow><TableHead className="pl-6">Unit Name</TableHead><TableHead>Code</TableHead><TableHead className="text-right pr-6">Actions</TableHead></TableRow></TableHeader>
                        <TableBody>
                        {uoms.map(u => (
                            <TableRow key={u.id} className="h-12 border-b"><TableCell className="font-bold pl-6">{u.name}</TableCell><TableCell className="font-black text-primary">{u.abbreviation}</TableCell><TableCell className="text-right pr-6 space-x-1">
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditingUom(u); setUomForm({name:u.name, abbreviation:u.abbreviation}); setIsUomDialogOpen(true); }}><Edit className="h-3.5 w-3.5" /></Button>
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteUom(u.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                            </TableCell></TableRow>
                        ))}</TableBody></Table>
                    </CardContent>
                </Card>
            </TabsContent>

            <TabsContent value="numbering" className="animate-in fade-in slide-in-from-left-2">
                <Card className="shadow-sm border-gray-100 bg-white overflow-hidden">
                    <CardHeader className="bg-muted/10 border-b py-4 px-6"><CardTitle className="text-sm font-black uppercase">Prefix Configuration</CardTitle></CardHeader>
                    <CardContent className="p-0">
                        <Table className="text-xs"><TableHeader className="bg-muted/50"><TableRow><TableHead className="pl-6">Document Class</TableHead><TableHead>Prefix</TableHead><TableHead className="text-right pr-6">Actions</TableHead></TableRow></TableHeader>
                        <TableBody>
                        {documentTypes.map(t => (
                            <TableRow key={t} className="h-12 border-b">
                                <TableCell className="font-bold pl-6">{getDocumentName(t)}</TableCell>
                                <TableCell className="font-mono text-blue-600 font-bold">{prefixes[t] || '(Default)'}</TableCell>
                                <TableCell className="text-right pr-6"><Button variant="outline" size="sm" className="h-7 text-[10px] font-black uppercase" onClick={() => { setEditingPrefix({key:t, value:prefixes[t]||''}); setIsPrefixDialogOpen(true); }}>Edit</Button></TableCell>
                            </TableRow>
                        ))}</TableBody></Table>
                    </CardContent>
                </Card>
            </TabsContent>
        </Tabs>

        {/* Dialogs */}
        <Dialog open={isUomDialogOpen} onOpenChange={setIsUomDialogOpen}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader><DialogTitle>{editingUom ? 'Edit Unit' : 'New Unit'}</DialogTitle></DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="space-y-2"><Label>Full Description</Label><Input value={uomForm.name} onChange={e => setUomForm({...uomForm, name: e.target.value})} placeholder="e.g. Kilogram" /></div>
                    <div className="space-y-2"><Label>Unit Code</Label><Input value={uomForm.abbreviation} onChange={e => setUomForm({...uomForm, abbreviation: e.target.value})} placeholder="e.g. Kg" /></div>
                </div>
                <DialogFooter><Button onClick={handleUomSubmit} className="w-full">Save Unit</Button></DialogFooter>
            </DialogContent>
        </Dialog>

        <Dialog open={isPrefixDialogOpen} onOpenChange={setIsPrefixDialogOpen}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader><DialogTitle>Update Numbering Prefix</DialogTitle></DialogHeader>
                <div className="py-4 space-y-4">
                    <div className="space-y-2">
                        <Label className="text-xs uppercase font-bold text-muted-foreground">New Prefix</Label>
                        <Input value={editingPrefix?.value || ''} onChange={e => setEditingPrefix(p => p ? {...p, value: e.target.value} : null)} className="h-10 font-mono text-blue-600 font-black" />
                    </div>
                </div>
                <DialogFooter><Button onClick={handleSavePrefix} className="w-full">Update System Rule</Button></DialogFooter>
            </DialogContent>
        </Dialog>

        <Dialog open={isEditOwnershipDialogOpen} onOpenChange={setIsEditOwnershipDialogOpen}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader><DialogTitle>Rename Category</DialogTitle></DialogHeader>
                <div className="py-4 space-y-4">
                    <div className="space-y-2">
                        <Label>Category Name</Label>
                        <Input value={updatedOwnershipName} onChange={e => setUpdatedOwnershipName(e.target.value)} />
                    </div>
                </div>
                <DialogFooter><Button onClick={handleUpdateOwnership} className="w-full">Save Changes</Button></DialogFooter>
            </DialogContent>
        </Dialog>
    </div>
  );
}
