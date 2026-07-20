'use client';

import React, { useState, useEffect, useMemo } from 'react';
import type { 
  UnitOfMeasurement, 
  DocumentPrefixes, 
  CompanyProfile,
  AppBranding,
  Module,
  OwnershipCategory,
  DocumentType,
  NumberingRule
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { 
  Plus, 
  Edit, 
  Trash2, 
  Save, 
  Loader2,
  Settings2,
  CalendarIcon,
  Hash,
  RefreshCcw,
  History,
  X,
  Info,
  ChevronRight
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
    getDocumentName,
    modules 
} from '@/lib/types';
import { DEFAULT_COMPANY_PROFILE, DEFAULT_FLEET_PROFILE } from '@/lib/constants';
import { cn, toNepaliDate } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';

const getModuleDisplayName = (m: Module): string => {
    switch (m) {
        case 'dashboard': return 'Dashboard';
        case 'finance': return 'Finance';
        case 'reports': return 'Test Report Management';
        case 'purchaseOrders': return 'Purchase Order Management';
        case 'crm': return 'CRM';
        case 'hr': return 'HRMS';
        case 'fleet': return 'Fleet Management';
        case 'rental': return 'Rental Management';
        case 'notes': return 'Notes & Todos';
        case 'settings': return 'Settings';
        default: return m;
    }
};

const CORE_MODULES: string[] = ['dashboard', 'settings', 'notes'];

export default function GeneralSettingsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [uoms, setUoms] = useState<UnitOfMeasurement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [prefixes, setPrefixes] = useState<DocumentPrefixes>({});
  
  const [isNumberingDialogOpen, setIsNumberingDialogOpen] = useState(false);
  const [activeNumberingKey, setActiveNumberingKey] = useState<DocumentType | null>(null);
  const [numberingForm, setNumberingForm] = useState({
      prefix: '',
      effectiveFrom: new Date().toISOString().split('T')[0],
      effectiveTo: '',
      startingNumber: 1
  });

  const [isHistoryDialogOpen, setIsHistoryDialogOpen] = useState(false);
  const [historyKey, setHistoryKey] = useState<DocumentType | null>(null);
  
  const [isEditRuleDialogOpen, setIsEditRuleDialogOpen] = useState(false);
  const [editingRuleIndex, setEditingRuleIndex] = useState<number | null>(null);
  const [editRuleForm, setEditRuleForm] = useState<NumberingRule & { originalIndex?: number }>({
      prefix: '',
      effectiveFrom: '',
      effectiveTo: null,
      startingNumber: 1,
      status: 'Archived'
  });

  const [companyProfile, setCompanyProfile] = useState<CompanyProfile>(DEFAULT_COMPANY_PROFILE);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [fleetProfile, setFleetProfile] = useState<CompanyProfile>(DEFAULT_FLEET_PROFILE);
  const [isSavingFleetProfile, setIsSavingFleetProfile] = useState(false);
  const [appBranding, setAppBranding] = useState<AppBranding>({ appName: 'StarSutra', appMotto: '' });
  const [isSavingBranding, setIsSavingBranding] = useState(false);
  
  const [ownershipCategories, setOwnershipCategories] = useState<OwnershipCategory[]>([]);
  const [isOwnershipDialogOpen, setIsOwnershipDialogOpen] = useState(false);
  const [editingOwnership, setEditingOwnership] = useState<OwnershipCategory | null>(null);
  const [ownershipForm, setOwnershipForm] = useState<OwnershipCategory>({ name: '', modules: [] });

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
        onSettingUpdate('ownership_categories', (s: any) => { 
            const defaults = ['Sijan', 'Shivam', 'Rental', 'Both'];
            let raw = s?.value || [];
            if (!Array.isArray(raw)) raw = [];

            const normalized = raw.map((item: any) => {
                if (typeof item === 'string') return { name: item, modules: Array.from(modules) };
                return item as OwnershipCategory;
            });

            // Ensure defaults are present in the list for configuration
            const existing = new Set(normalized.map((c: OwnershipCategory) => c.name));
            defaults.forEach(d => {
                if (!existing.has(d)) {
                    normalized.push({ name: d, modules: Array.from(modules) });
                }
            });

            setOwnershipCategories(normalized.sort((a: OwnershipCategory, b: OwnershipCategory) => a.name.localeCompare(b.name)));
        }),
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

  const openOwnershipDialog = (cat: OwnershipCategory | null = null) => {
    if (cat) {
        setEditingOwnership(cat);
        setOwnershipForm({ ...cat });
    } else {
        setEditingOwnership(null);
        setOwnershipForm({ name: '', modules: [...CORE_MODULES] });
    }
    setIsOwnershipDialogOpen(true);
  };

  const handleSaveOwnership = async () => {
    if (!ownershipForm.name.trim()) return;
    
    const finalModules = Array.from(new Set([...ownershipForm.modules, ...CORE_MODULES]));
    const updatedForm = { ...ownershipForm, modules: finalModules };

    let next;
    if (editingOwnership) {
        next = ownershipCategories.map(c => c.name === editingOwnership.name ? updatedForm : c);
    } else {
        if (ownershipCategories.some(c => c.name.toLowerCase() === updatedForm.name.toLowerCase())) {
            toast({ title: 'Name Conflict', description: 'Ownership category already exists.', variant: 'destructive' });
            return;
        }
        next = [...ownershipCategories, updatedForm];
    }

    try {
        await setSetting('ownership_categories', next);
        setIsOwnershipDialogOpen(false);
        toast({ title: editingOwnership ? 'Category Updated' : 'Category Added' });
    } catch {
        toast({ title: 'Error', variant: 'destructive' });
    }
  };

  const handleRemoveOwnership = async (name: string) => {
    const next = ownershipCategories.filter(c => c.name !== name);
    try {
        await setSetting('ownership_categories', next);
        toast({ title: 'Category Removed' });
    } catch {
        toast({ title: 'Error', variant: 'destructive' });
    }
  };

  const openNumberingDialog = (key: DocumentType) => {
    setActiveNumberingKey(key);
    const rawRules = prefixes[key];
    const rules = Array.isArray(rawRules) ? (rawRules as any) : [];
    const active = rules.find((r: any) => r.status === 'Active');
    
    setNumberingForm({
        prefix: active?.prefix || (typeof rawRules === 'string' ? rawRules : ''),
        effectiveFrom: new Date().toISOString().split('T')[0],
        effectiveTo: '',
        startingNumber: active ? active.startingNumber : 1
    });
    setIsNumberingDialogOpen(true);
  };

  const handleSaveNumbering = async () => {
    if (!activeNumberingKey || !numberingForm.prefix) return;
    
    const rawRules = prefixes[activeNumberingKey];
    const rules = Array.isArray(rawRules) ? [...rawRules] : [];
    const activeIndex = rules.findIndex(r => r.status === 'Active');
    
    const newFromDate = new Date(numberingForm.effectiveFrom);
    const newToDate = numberingForm.effectiveTo ? new Date(numberingForm.effectiveTo) : null;
    
    if (activeIndex !== -1) {
        const oldRule = { ...rules[activeIndex] };
        oldRule.status = 'Archived';
        // Auto-terminate the old rule if no specific "To" was provided by the user for it,
        // using the new start date as anchor
        if (!oldRule.effectiveTo) {
            const toDate = new Date(newFromDate);
            toDate.setDate(toDate.getDate() - 1);
            oldRule.effectiveTo = toDate.toISOString();
        }
        rules[activeIndex] = oldRule;
    }
    
    const newRule: NumberingRule = {
        prefix: numberingForm.prefix,
        effectiveFrom: newFromDate.toISOString(),
        effectiveTo: newToDate ? newToDate.toISOString() : null,
        startingNumber: Number(numberingForm.startingNumber) || 1,
        status: 'Active',
    };
    
    rules.push(newRule);
    
    const newConfig = { ...prefixes, [activeNumberingKey]: rules };
    
    try {
        await setSetting('documentPrefixes', newConfig);
        setIsNumberingDialogOpen(false);
        toast({ title: 'Numbering Rule Updated' });
    } catch {
        toast({ title: 'Error', variant: 'destructive' });
    }
  };

  const openEditRuleDialog = (idx: number) => {
    if (!historyKey) return;
    const raw = prefixes[historyKey];

    if (idx === -99) {
        setEditingRuleIndex(-99);
        setEditRuleForm({
            prefix: typeof raw === 'string' ? raw : '',
            effectiveFrom: new Date().toISOString().split('T')[0],
            effectiveTo: null,
            startingNumber: 1,
            status: 'Active'
        });
        setIsEditRuleDialogOpen(true);
        return;
    }

    if (!Array.isArray(raw) || !raw[idx]) return;
    
    const rule = raw[idx];
    setEditingRuleIndex(idx);
    setEditRuleForm({
        ...rule,
        effectiveFrom: rule.effectiveFrom.split('T')[0],
        effectiveTo: rule.effectiveTo ? rule.effectiveTo.split('T')[0] : null
    });
    setIsEditRuleDialogOpen(true);
  };

  const handleSaveEditRule = async () => {
    if (!historyKey || editingRuleIndex === null) return;
    
    const rawRules = prefixes[historyKey];
    let updatedRules: NumberingRule[];
    
    const newRuleBase = {
        ...editRuleForm,
        effectiveFrom: new Date(editRuleForm.effectiveFrom).toISOString(),
        effectiveTo: editRuleForm.effectiveTo ? new Date(editRuleForm.effectiveTo).toISOString() : null
    };

    if (editingRuleIndex === -99) {
        updatedRules = [newRuleBase];
    } else {
        if (!Array.isArray(rawRules)) return;
        updatedRules = [...rawRules];
        updatedRules[editingRuleIndex] = newRuleBase;
    }
    
    const newConfig = { ...prefixes, [historyKey]: updatedRules };
    
    try {
        await setSetting('documentPrefixes', newConfig);
        setIsEditRuleDialogOpen(false);
        toast({ title: 'Record Updated' });
    } catch {
        toast({ title: 'Update Failed', variant: 'destructive' });
    }
  };

  const handleDeleteRule = async (idx: number) => {
    if (!historyKey) return;
    const rawRules = prefixes[historyKey];
    if (!Array.isArray(rawRules)) return;
    
    const updatedRules = rawRules.filter((_, i) => i !== idx);
    const newConfig = { ...prefixes, [historyKey]: updatedRules };
    
    try {
        await setSetting('documentPrefixes', newConfig);
        toast({ title: 'Record Deleted' });
    } catch {
        toast({ title: 'Delete Failed', variant: 'destructive' });
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

  const numberingHistory = useMemo(() => {
      if (!historyKey) return [];
      const raw = prefixes[historyKey];
      
      // Support legacy string prefixes in history
      if (typeof raw === 'string') {
          return [{
              prefix: raw,
              effectiveFrom: '2000-01-01T00:00:00.000Z',
              effectiveTo: null,
              startingNumber: 1,
              status: 'Active' as const,
              originalIndex: -99 // Marker for legacy
          }];
      }

      if (!Array.isArray(raw)) return [];
      return raw.map((r, i) => ({ ...r, originalIndex: i })).reverse();
  }, [historyKey, prefixes]);

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
                            {isSavingBranding ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-2 h-3.5 w-3.5" />}
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
                            {isSavingProfile ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-3.5" />}
                            Update
                        </Button>
                    </CardHeader>
                    <CardContent className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-1.5"><Label className="text-[10px] uppercase font-bold text-muted-foreground">Name (EN)</Label><Input value={companyProfile.nameEn || ''} onChange={e => setCompanyProfile(p => ({...p, nameEn: e.target.value}))} /></div>
                        <div className="space-y-1.5"><Label className="text-[10px] uppercase font-bold text-muted-foreground">कम्पनी (NP)</Label><Input value={companyProfile.nameNp || ''} onChange={e => setCompanyProfile(p => ({...p, nameNp: e.target.value}))} /></div>
                        <div className="space-y-1.5"><Label className="text-[10px] uppercase font-bold text-muted-foreground">PAN/VAT Number</Label><Input value={companyProfile.pan || ''} onChange={e => setCompanyProfile(p => ({...p, pan: e.target.value}))} /></div>
                        <div className="space-y-1.5"><Label className="text-[10px] uppercase font-bold text-muted-foreground">Phone Number</Label><Input value={companyProfile.phone || ''} onChange={e => setCompanyProfile(p => ({...p, phone: e.target.value}))} /></div>
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
                            <CardDescription className="text-[10px] uppercase font-bold text-muted-foreground">Manage organizational units and their module scope.</CardDescription>
                        </div>
                        <Button size="sm" onClick={() => openOwnershipDialog()} className="h-9 uppercase font-black text-[10px] tracking-widest"><Plus className="mr-2 h-4 w-4" /> Add Category</Button>
                    </CardHeader>
                    <CardContent className="p-0">
                        <Table className="text-xs">
                            <TableHeader className="bg-muted/50">
                                <TableRow className="hover:bg-transparent">
                                    <TableHead className="pl-6 font-bold uppercase text-[10px]">Category Name</TableHead>
                                    <TableHead className="font-bold uppercase text-[10px]">Associated Modules</TableHead>
                                    <TableHead className="text-right pr-6 font-bold uppercase text-[10px]">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {ownershipCategories.map(cat => (
                                    <TableRow key={cat.name} className="h-14 border-b group">
                                        <TableCell className="font-black pl-6 text-gray-900 uppercase tracking-tighter">{cat.name}</TableCell>
                                        <TableCell>
                                            <div className="flex flex-wrap gap-1 max-w-md">
                                                {cat.modules?.length === modules.length ? (
                                                    <Badge variant="outline" className="text-[8px] uppercase bg-primary/5 text-primary border-primary/20">All System Modules</Badge>
                                                ) : (
                                                    cat.modules?.map(m => (
                                                        <Badge key={m} variant="secondary" className="text-[8px] uppercase">{getModuleDisplayName(m as Module)}</Badge>
                                                    ))
                                                )}
                                                {(!cat.modules || cat.modules.length === 0) && (
                                                    <span className="text-muted-foreground italic text-[10px]">No modules assigned</span>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-right pr-6 space-x-1">
                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-primary" onClick={() => openOwnershipDialog(cat)}><Edit className="h-4 w-4" /></Button>
                                            <AlertDialog>
                                                <AlertDialogTrigger asChild>
                                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive"><Trash2 className="h-4 w-4" /></Button>
                                                </AlertDialogTrigger>
                                                <AlertDialogContent>
                                                    <AlertDialogHeader>
                                                        <AlertDialogTitle>Delete Ownership Category?</AlertDialogTitle>
                                                        <AlertDialogDescription>
                                                            This will remove the "{cat.name}" category from the system. 
                                                            Existing records using this category will remain, but this category 
                                                            will no longer be available for selection in forms or filters.
                                                        </AlertDialogDescription>
                                                    </AlertDialogHeader>
                                                    <AlertDialogFooter>
                                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                        <AlertDialogAction onClick={() => handleRemoveOwnership(cat.name)} className="bg-destructive text-white">Delete</AlertDialogAction>
                                                    </AlertDialogFooter>
                                                </AlertDialogContent>
                                            </AlertDialog>
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
                                <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive"><Trash2 className="h-3.5 w-3.5"/></Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                        <AlertDialogHeader>
                                            <AlertDialogTitle>Delete Unit of Measurement?</AlertDialogTitle>
                                            <AlertDialogDescription>
                                                This will remove "{u.name}" ({u.abbreviation}) from the registry.
                                            </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                                            <AlertDialogAction onClick={() => deleteUom(u.id)} className="bg-destructive text-white">Delete</AlertDialogAction>
                                        </AlertDialogFooter>
                                    </AlertDialogContent>
                                </AlertDialog>
                            </TableCell></TableRow>
                        ))}</TableBody></Table>
                    </CardContent>
                </Card>
            </TabsContent>

            <TabsContent value="numbering" className="animate-in fade-in slide-in-from-left-2">
                <Card className="shadow-sm border-gray-100 bg-white overflow-hidden">
                    <CardHeader className="bg-muted/10 border-b py-4 px-6">
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-sm font-black uppercase">Master Document Numbering</CardTitle>
                        </div>
                    </CardHeader>
                    <CardContent className="p-0">
                        <Table className="text-xs">
                            <TableHeader className="bg-muted/50">
                                <TableRow className="hover:bg-transparent">
                                    <TableHead className="pl-6 font-bold uppercase">Document Class</TableHead>
                                    <TableHead className="font-bold uppercase">Active Prefix</TableHead>
                                    <TableHead className="font-bold uppercase text-center">Start #</TableHead>
                                    <TableHead className="font-bold uppercase">Period (BS)</TableHead>
                                    <TableHead className="text-right pr-6 font-bold uppercase">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {documentTypes.map(t => {
                                    const rawRules = prefixes[t];
                                    const rules = Array.isArray(rawRules) ? (rawRules as any) : [];
                                    const active = rules.find((r: any) => r.status === 'Active');
                                    
                                    return (
                                        <TableRow key={t} className="h-14 border-b">
                                            <TableCell className="font-black pl-6 text-gray-900 uppercase tracking-tighter">{getDocumentName(t)}</TableCell>
                                            <TableCell className="font-mono text-blue-600 font-black">{active?.prefix || (typeof rawRules === 'string' ? rawRules : '(System Default)')}</TableCell>
                                            <TableCell className="text-center font-bold">{active?.startingNumber.toString().padStart(3, '0') || '001'}</TableCell>
                                            <TableCell className="text-muted-foreground italic">
                                                {active ? (
                                                    <>
                                                        {toNepaliDate(active.effectiveFrom)} 
                                                        {active.effectiveTo ? ` — ${toNepaliDate(active.effectiveTo)}` : ' — Open'}
                                                    </>
                                                ) : typeof rawRules === 'string' ? (
                                                    <span className="text-[10px] font-black uppercase text-amber-600">Legacy String</span>
                                                ) : 'N/A'}
                                            </TableCell>
                                            <TableCell className="text-right pr-6 space-x-1">
                                                <Button 
                                                    variant="ghost" 
                                                    size="sm" 
                                                    className="h-8 text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-primary" 
                                                    onClick={() => { setHistoryKey(t); setIsHistoryDialogOpen(true); }}
                                                >
                                                    <History className="mr-1.5 h-3.5 w-3.5" />
                                                    View History
                                                </Button>
                                                <Button 
                                                    variant="outline" 
                                                    size="sm" 
                                                    className="h-8 text-[10px] font-black uppercase tracking-widest border-primary/30 text-primary hover:bg-primary/5" 
                                                    onClick={() => openNumberingDialog(t)}
                                                >
                                                    <RefreshCcw className="mr-1.5 h-3.5 w-3.5" />
                                                    Change Rule
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
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

        <Dialog open={isNumberingDialogOpen} onOpenChange={setIsNumberingDialogOpen}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="text-xl font-black uppercase tracking-tight">Update Numbering Rule</DialogTitle>
                    <DialogDescription className="text-xs uppercase font-bold text-muted-foreground">Change the sequence rule for {activeNumberingKey ? getDocumentName(activeNumberingKey) : 'document'}.</DialogDescription>
                </DialogHeader>
                <div className="space-y-6 py-4">
                    <div className="space-y-2">
                        <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest px-1">New Prefix</Label>
                        <Input 
                            value={numberingForm.prefix} 
                            onChange={e => setNumberingForm(p => ({...p, prefix: e.target.value}))} 
                            className="h-10 font-mono text-blue-600 font-black border-2" 
                            placeholder="e.g. SPI-2024-"
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest px-1">Effective From (AD)</Label>
                            <div className="relative">
                                <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                                <Input 
                                    type="date" 
                                    value={numberingForm.effectiveFrom} 
                                    onChange={e => setNumberingForm(p => ({...p, effectiveFrom: e.target.value}))} 
                                    className="h-10 pl-9 font-bold text-xs"
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest px-1">Effective To (AD/Optional)</Label>
                            <div className="relative">
                                <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                                <Input 
                                    type="date" 
                                    value={numberingForm.effectiveTo} 
                                    onChange={e => setNumberingForm(p => ({...p, effectiveTo: e.target.value}))} 
                                    className="h-10 pl-9 font-bold text-xs"
                                />
                            </div>
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest px-1">Starting Sequence #</Label>
                        <div className="relative">
                            <Hash className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                            <Input 
                                type="number" 
                                value={numberingForm.startingNumber} 
                                onChange={e => setNumberingForm(p => ({...p, startingNumber: parseInt(e.target.value) || 1}))} 
                                className="h-10 pl-9 font-black text-sm"
                            />
                        </div>
                    </div>
                </div>
                <DialogFooter className="border-t pt-4">
                    <Button variant="outline" onClick={() => setIsNumberingDialogOpen(false)} className="h-11 font-bold text-xs uppercase tracking-widest">Cancel</Button>
                    <Button onClick={handleSaveNumbering} className="h-11 px-8 font-black text-xs uppercase tracking-widest shadow-xl shadow-primary/20">Apply New Sequence</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>

        <Dialog open={isHistoryDialogOpen} onOpenChange={setIsHistoryDialogOpen}>
            <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col p-0">
                <DialogHeader className="p-6 border-b bg-muted/5 shrink-0">
                    <div className="flex items-center justify-between">
                        <div>
                            <DialogTitle className="text-xl font-black uppercase tracking-tight">Numbering History</DialogTitle>
                            <DialogDescription className="text-xs uppercase font-bold text-muted-foreground">{historyKey ? getDocumentName(historyKey) : ''}</DialogDescription>
                        </div>
                        <Button variant="ghost" size="icon" onClick={() => setIsHistoryDialogOpen(false)}><X className="h-4 w-4"/></Button>
                    </div>
                </DialogHeader>
                <ScrollArea className="flex-1">
                    <div className="p-6">
                        <Table className="text-xs border">
                            <TableHeader className="bg-muted/50">
                                <TableRow className="hover:bg-transparent">
                                    <TableHead className="font-bold uppercase text-[9px]">Status</TableHead>
                                    <TableHead className="font-bold uppercase text-[9px]">Prefix</TableHead>
                                    <TableHead className="text-center font-bold uppercase text-[9px]">Start #</TableHead>
                                    <TableHead className="font-bold uppercase text-[9px]">Effective From (BS)</TableHead>
                                    <TableHead className="font-bold uppercase text-[9px]">Effective To (BS)</TableHead>
                                    <TableHead className="text-right pr-4 font-bold uppercase text-[9px]">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {numberingHistory.map((rule) => (
                                    <TableRow key={rule.originalIndex} className={cn("h-12 border-b", rule.status === 'Active' ? "bg-primary/5 font-bold" : "text-muted-foreground opacity-70")}>
                                        <TableCell>
                                            <Badge variant={rule.status === 'Active' ? 'default' : 'outline'} className="text-[8px] uppercase px-1.5 h-4">
                                                {rule.status}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="font-mono text-blue-600 font-black">{rule.prefix}</TableCell>
                                        <TableCell className="text-center font-bold">{rule.startingNumber.toString().padStart(3, '0')}</TableCell>
                                        <TableCell>{toNepaliDate(rule.effectiveFrom)}</TableCell>
                                        <TableCell>{rule.effectiveTo ? toNepaliDate(rule.effectiveTo) : <span className="italic text-[9px]">Currently Active</span>}</TableCell>
                                        <TableCell className="text-right pr-4">
                                            <div className="flex justify-end gap-1 items-center">
                                                {rule.originalIndex === -99 && (
                                                    <Badge variant="outline" className="text-[8px] uppercase bg-amber-50 text-amber-700 border-amber-200 mr-2">Upgrade Required</Badge>
                                                )}
                                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditRuleDialog(rule.originalIndex)}>
                                                    <Edit className="h-3.5 w-3.5" />
                                                </Button>
                                                {rule.originalIndex !== -99 && (
                                                    <AlertDialog>
                                                        <AlertDialogTrigger asChild>
                                                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive">
                                                                <Trash2 className="h-3.5 w-3.5" />
                                                            </Button>
                                                        </AlertDialogTrigger>
                                                        <AlertDialogContent>
                                                            <AlertDialogHeader>
                                                                <AlertDialogTitle>Delete History Record?</AlertDialogTitle>
                                                                <AlertDialogDescription>
                                                                    This will permanently remove this numbering rule from the log. This action cannot be undone.
                                                                </AlertDialogDescription>
                                                            </AlertDialogHeader>
                                                            <AlertDialogFooter>
                                                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                                <AlertDialogAction onClick={() => handleDeleteRule(rule.originalIndex)} className="bg-destructive text-white">Delete</AlertDialogAction>
                                                            </AlertDialogFooter>
                                                        </AlertDialogContent>
                                                    </AlertDialog>
                                                )}
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {numberingHistory.length === 0 && (
                                    <TableRow><TableCell colSpan={6} className="py-12 text-center italic">No rule history found.</TableCell></TableRow>
                                )}
                            </TableBody>
                        </Table>
                        
                        <div className="mt-6 p-4 bg-blue-50/50 rounded-xl border border-blue-100 flex gap-4">
                            <Info className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
                            <div className="space-y-1">
                                <p className="text-[10px] font-black uppercase text-blue-900">Historical Logic active</p>
                                <p className="text-[10px] text-blue-800 leading-relaxed font-medium">
                                    The system automatically selects the correct prefix based on the document date. Back-dated entries will respect the "Archived" rules if they fall within the historical date range.
                                </p>
                            </div>
                        </div>
                    </div>
                </ScrollArea>
                <DialogFooter className="p-4 border-t bg-muted/5 shrink-0">
                    <Button variant="outline" onClick={() => setIsHistoryDialogOpen(false)} className="w-full font-bold uppercase text-[10px] tracking-widest h-10">Close Audit Log</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>

        {/* Edit Historical Rule Dialog */}
        <Dialog open={isEditRuleDialogOpen} onOpenChange={setIsEditRuleDialogOpen}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="text-xl font-black uppercase tracking-tight">Edit Sequence Record</DialogTitle>
                    <DialogDescription className="text-xs uppercase font-bold text-muted-foreground">Modify an existing numbering rule in the history.</DialogDescription>
                </DialogHeader>
                <div className="space-y-6 py-4">
                    <div className="space-y-2">
                        <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest px-1">Rule Prefix</Label>
                        <Input 
                            value={editRuleForm.prefix} 
                            onChange={e => setEditRuleForm(p => ({...p, prefix: e.target.value}))} 
                            className="h-10 font-mono text-blue-600 font-black border-2" 
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest px-1">Effective From (AD)</Label>
                            <Input 
                                type="date" 
                                value={editRuleForm.effectiveFrom} 
                                onChange={e => setEditRuleForm(p => ({...p, effectiveFrom: e.target.value}))} 
                                className="h-10 font-bold text-xs"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest px-1">Effective To (AD/Optional)</Label>
                            <Input 
                                type="date" 
                                value={editRuleForm.effectiveTo || ''} 
                                onChange={e => setEditRuleForm(p => ({...p, effectiveTo: e.target.value || null}))} 
                                className="h-10 font-bold text-xs"
                            />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest px-1">Starting Sequence #</Label>
                        <Input 
                            type="number" 
                            value={editRuleForm.startingNumber} 
                            onChange={e => setEditRuleForm(p => ({...p, startingNumber: parseInt(e.target.value) || 1}))} 
                            className="h-10 font-black text-sm"
                        />
                    </div>
                </div>
                <DialogFooter className="border-t pt-4">
                    <Button variant="outline" onClick={() => setIsEditRuleDialogOpen(false)} className="h-11 font-bold text-xs uppercase tracking-widest">Cancel</Button>
                    <Button onClick={handleSaveEditRule} className="h-11 px-8 font-black text-xs uppercase tracking-widest shadow-xl shadow-primary/20">Commit Changes</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>

        <Dialog open={isOwnershipDialogOpen} onOpenChange={setIsOwnershipDialogOpen}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{editingOwnership ? 'Edit Category' : 'Add Ownership Category'}</DialogTitle>
                    <DialogDescription>Define a category and associate it with specific system modules.</DialogDescription>
                </DialogHeader>
                <div className="space-y-5 py-4">
                    <div className="space-y-1.5">
                        <Label className="text-[10px] uppercase font-bold text-muted-foreground">Category Name</Label>
                        <Input 
                            value={ownershipForm.name} 
                            onChange={e => setOwnershipForm({...ownershipForm, name: e.target.value})} 
                            placeholder="e.g. Sijan Dhuwani" 
                            className="h-10 font-bold"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <div className="flex items-center justify-between px-1">
                            <Label className="text-[10px] uppercase font-bold text-muted-foreground">Module Association</Label>
                            <div className="flex gap-2">
                                <Button variant="ghost" size="sm" onClick={() => setOwnershipForm({...ownershipForm, modules: Array.from(modules)})} className="h-5 px-1.5 text-[8px] uppercase font-black">All</Button>
                                <Button variant="ghost" size="sm" onClick={() => setOwnershipForm({...ownershipForm, modules: [...CORE_MODULES]})} className="h-5 px-1.5 text-[8px] uppercase font-black">Clear Functional</Button>
                            </div>
                        </div>
                        <ScrollArea className="h-[250px] border rounded-lg bg-gray-50/30 p-2">
                            <div className="grid grid-cols-1 gap-1">
                                {modules.map(m => {
                                    const isCore = CORE_MODULES.includes(m);
                                    return (
                                        <div key={m} className={cn(
                                            "flex items-center space-x-3 p-2 rounded-md transition-colors",
                                            (isCore || ownershipForm.modules.includes(m)) ? "bg-primary/5" : "hover:bg-muted/50",
                                            isCore && "opacity-60"
                                        )}>
                                            <Checkbox 
                                                id={`check-${m}`} 
                                                checked={isCore || ownershipForm.modules.includes(m)} 
                                                disabled={isCore}
                                                onCheckedChange={(v) => {
                                                    if (isCore) return;
                                                    const next = !!v 
                                                        ? [...ownershipForm.modules, m]
                                                        : ownershipForm.modules.filter(x => x !== m);
                                                    setOwnershipForm({...ownershipForm, modules: next});
                                                }}
                                            />
                                            <Label htmlFor={`check-${m}`} className="text-xs font-medium cursor-pointer flex-1">
                                                {getModuleDisplayName(m as Module)} {isCore && <span className="text-[8px] font-black text-primary ml-2">(SYSTEM CORE)</span>}
                                            </Label>
                                        </div>
                                    )
                                })}
                            </div>
                            <ScrollBar orientation="vertical" />
                        </ScrollArea>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => setIsOwnershipDialogOpen(false)} className="font-bold text-xs uppercase h-11">Cancel</Button>
                    <Button onClick={handleSaveOwnership} className="font-black text-xs uppercase h-11 px-8 shadow-lg shadow-primary/20">Commit Category</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    </div>
  );
}
