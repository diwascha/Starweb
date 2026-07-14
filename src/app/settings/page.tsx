'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import type { 
  Party, 
  Account, 
  PartyType, 
  AccountType, 
  UnitOfMeasurement, 
  User, 
  Permissions, 
  Module, 
  Action, 
  DocumentPrefixes, 
  BankAccountType, 
  PageVisit, 
  CompanyProfile,
  AccountOwnership,
  AppBranding
} from '@/lib/types';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { 
  Plus, 
  Edit, 
  Trash2, 
  MoreHorizontal, 
  Search, 
  Save, 
  KeyRound, 
  Download, 
  Upload, 
  ChevronDown, 
  GitMerge, 
  Check, 
  ArrowUpDown, 
  Loader2,
  ShieldCheck,
  ShieldAlert,
  UserCheck,
  UserX,
  History,
  FileText,
  Calculator,
  Terminal,
  User as UserIcon,
  Briefcase,
  Building2,
  Truck,
  Home,
  LayoutDashboard,
  Settings as SettingsIcon,
  ShoppingCart,
  StickyNote,
  Crown,
  Eye,
  PlusCircle,
  Pencil,
  AlertTriangle,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/hooks/use-auth';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { onPartiesUpdate, addParty, updateParty, deleteParty, mergeParties } from '@/services/party-service';
import { onAccountsUpdate, addAccount, updateAccount, deleteAccount } from '@/services/account-service';
import { onUomsUpdate, addUom, updateUom, deleteUom } from '@/services/uom-service';
import { onSettingUpdate, setSetting } from '@/services/settings-service';
import { onPageVisitsUpdate } from '@/services/usage-service';
import { onLogsUpdate, type SystemLog } from '@/services/log-service';
import { Separator } from '@/components/ui/separator';
import { 
    DropdownMenu, 
    DropdownMenuContent, 
    DropdownMenuItem, 
    DropdownMenuTrigger, 
    DropdownMenuSeparator, 
    DropdownMenuRadioGroup, 
    DropdownMenuRadioItem 
} from '@/components/ui/dropdown-menu';
import { 
    onUsersUpdate,
    saveUser,
    deleteUser as deleteUserService,
    validatePassword, 
    setAdminPassword,
    adminCreateUserWithUsername 
} from '@/services/user-service';
import { modules, actions, documentTypes, getDocumentName } from '@/lib/types';
import { NEPALI_MONTHS, DEFAULT_COMPANY_PROFILE, DEFAULT_FLEET_PROFILE } from '@/lib/constants';
import { Checkbox } from '@/components/ui/checkbox';
import { useRouter } from 'next/navigation';
import NepaliDate from 'nepali-date-converter';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn, generateId } from '@/lib/utils';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAuthService } from '@/firebase';
import { exportData, importData } from '@/services/backup-service';

const getModuleDisplayName = (m: Module): string => {
    switch (m) {
        case 'dashboard': return 'Executive Dashboard';
        case 'finance': return 'Finance (Invoice, TDS, Cheque)';
        case 'reports': return 'Test Report Management';
        case 'purchaseOrders': return 'Purchase Management';
        case 'crm': return 'CRM';
        case 'hr': return 'HRMS (Payroll, Attendance)';
        case 'fleet': return 'Fleet Management';
        case 'rental': return 'Rental Management';
        case 'notes': return 'Notes & To-Do';
        case 'settings': return 'Settings Page';
        default: return (m as string).charAt(0).toUpperCase() + (m as string).slice(1);
    }
};

const getModuleIcon = (m: Module) => {
    switch (m) {
        case 'reports': return <FileText className="h-4 w-4" />;
        case 'purchaseOrders': return <ShoppingCart className="h-4 w-4" />;
        case 'settings': return <SettingsIcon className="h-4 w-4" />;
        case 'hr': return <Building2 className="h-4 w-4" />;
        case 'fleet': return <Truck className="h-4 w-4" />;
        case 'finance': return <Calculator className="h-4 w-4" />;
        case 'crm': return <Briefcase className="h-4 w-4" />;
        case 'rental': return <Home className="h-4 w-4" />;
        case 'dashboard': return <LayoutDashboard className="h-4 w-4" />;
        case 'notes': return <StickyNote className="h-4 w-4" />;
        default: return <Terminal className="h-4 w-4" />;
    }
};

const MODULE_GROUPS = [
    {
        name: 'Shivam Manufacturing',
        modules: ['dashboard', 'finance', 'reports', 'purchaseOrders', 'crm', 'hr'] as Module[]
    },
    {
        name: 'Sijan Logistics',
        modules: ['fleet'] as Module[]
    },
    {
        name: 'General Tools',
        modules: ['rental', 'notes', 'settings'] as Module[]
    }
];

function ConnectionIndicator() {
    return (
        <div className="flex items-center gap-1.5 text-[9px] font-black uppercase text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full border border-emerald-100 shadow-sm">
            <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            Real-Time Cloud Sync
        </div>
    );
}

function MergePartiesDialog({ open, onOpenChange, parties, onMerge }: { open: boolean, onOpenChange: (open: boolean) => void, parties: Party[], onMerge: (sourceId: string, destinationId: string) => void }) {
    const [sourceId, setSourceId] = useState<string>('');
    const [destinationId, setDestinationId] = useState<string>('');
    const [isMerging, setIsMerging] = useState(false);
    
    const sourceParty = parties.find(p => p.id === sourceId);
    const destinationParty = parties.find(p => p.id === destinationId);

    const handleMergeClick = async () => {
        setIsMerging(true);
        try {
            await onMerge(sourceId, destinationId);
            onOpenChange(false);
            setSourceId('');
            setDestinationId('');
        } catch (e) {
            console.error(e);
        } finally {
            setIsMerging(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Merge Duplicate Parties</DialogTitle>
                    <DialogDescription>
                        Select a party to merge and a party to merge into. The first party will be deleted, and all its associated records will be reassigned to the second party.
                    </DialogDescription>
                </DialogHeader>
                <div className="py-4 space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="source-party">Merge this party...</Label>
                        <Select value={sourceId} onValueChange={setSourceId}>
                            <SelectTrigger id="source-party"><SelectValue placeholder="Select party to remove..." /></SelectTrigger>
                            <SelectContent>
                                {parties.filter(p => p.id !== destinationId).map(p => (
                                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="destination-party">...into this party</Label>
                         <Select value={destinationId} onValueChange={setDestinationId}>
                            <SelectTrigger id="destination-party"><SelectValue placeholder="Select party to keep..." /></SelectTrigger>
                            <SelectContent>
                                {parties.filter(p => p.id !== sourceId).map(p => (
                                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button variant="destructive" disabled={!sourceId || !destinationId || isMerging}>
                                {isMerging && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Merge
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                                <AlertDialogDescription>
                                    You are about to merge <span className="font-bold text-destructive">{sourceParty?.name}</span> into <span className="font-bold">{destinationParty?.name}</span>. All records associated with the first party will be transferred, and the first party will be permanently deleted.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={handleMergeClick}>Yes, merge them</AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export default function SettingsPage() {
  const { user, logout, hasPermission } = useAuth();
  const auth = useAuthService();
  const { toast } = useToast();
  const router = useRouter();
  
  const [parties, setParties] = useState<Party[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [uoms, setUoms] = useState<UnitOfMeasurement[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState("users-security");
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const importFileRef = useRef<HTMLInputElement>(null);

  const [pageVisits, setPageVisits] = useState<PageVisit[]>([]);
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [prefixes, setPrefixes] = useState<DocumentPrefixes>({});
  const [isPrefixDialogOpen, setIsPrefixDialogOpen] = useState(false);
  const [editingPrefix, setEditingPrefix] = useState<{ key: keyof DocumentPrefixes; value: string } | null>(null);
  const [companyProfile, setCompanyProfile] = useState<CompanyProfile>(DEFAULT_COMPANY_PROFILE);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [fleetProfile, setFleetProfile] = useState<CompanyProfile>(DEFAULT_FLEET_PROFILE);
  const [isSavingFleetProfile, setIsSavingFleetProfile] = useState(false);
  const [appBranding, setAppBranding] = useState<AppBranding>({ appName: 'StarSutra', appMotto: '' });
  const [isSavingBranding, setIsSavingBranding] = useState(false);
  const [payrollLocks, setPayrollLocks] = useState<Record<string, boolean>>({});
  const [bsYears, setBsYears] = useState<number[]>([]);
  const [selectedLockYear, setSelectedLockYear] = useState<string>('');
  const [selectedLockMonth, setSelectedLockMonth] = useState<string>('');
  const [isPartyDialogOpen, setIsPartyDialogOpen] = useState(false);
  const [isMergeDialogOpen, setIsMergeDialogOpen] = useState(false);
  const [editingParty, setEditingParty] = useState<Party | null>(null);
  const [partyForm, setPartyForm] = useState<{name: string, type: PartyType, ownership: AccountOwnership, address?: string, panNumber?: string}>({name: '', type: 'Vendor', ownership: 'Both', address: '', panNumber: ''});
  const [isAccountDialogOpen, setIsAccountDialogOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [accountForm, setAccountForm] = useState({ name: '', type: 'Cash' as AccountType, ownership: 'Both' as AccountOwnership, accountNumber: '', bankName: '', branch: '', bankAccountType: 'Saving' as BankAccountType | undefined });
  const [isUomDialogOpen, setIsUomDialogOpen] = useState(false);
  const [editingUom, setEditingUom] = useState<UnitOfMeasurement | null>(null);
  const [uomForm, setUomForm] = useState({ name: '', abbreviation: '' });
  const [isUserDialogOpen, setIsUserDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [userForm, setUserForm] = useState({ username: '', email: '', isApproved: true, password: '', permissions: {} as Permissions });
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [isSubmittingUser, setIsSubmittingUser] = useState(false);
  const [moduleSearch, setModuleSearch] = useState('');
  const [isChangePasswordDialogOpen, setIsChangePasswordDialogOpen] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changePasswordError, setChangePasswordError] = useState<string | null>(null);

  useEffect(() => {
    setIsLoading(true);
    const unsubs = [
        onPartiesUpdate(setParties),
        onAccountsUpdate(setAccounts),
        onUomsUpdate(setUoms),
        onUsersUpdate(setUsers),
        onSettingUpdate('documentPrefixes', (setting) => setPrefixes(setting?.value || {})),
        onSettingUpdate('payrollLocks', (setting) => setPayrollLocks(setting?.value || {})),
        onSettingUpdate('companyProfile', (setting) => setCompanyProfile(setting?.value || DEFAULT_COMPANY_PROFILE)),
        onSettingUpdate('fleetCompanyProfile', (setting) => setFleetProfile(setting?.value || DEFAULT_FLEET_PROFILE)),
        onSettingUpdate('appBranding', (setting) => setAppBranding(setting?.value || { appName: 'StarSutra', appMotto: '' })),
        onPageVisitsUpdate(setPageVisits),
        onLogsUpdate(setLogs),
    ];
    
    import('@/services/payroll-service').then(m => {
        if (typeof m?.getPayrollYears === 'function') {
            m.getPayrollYears().then(years => {
                const currentYear = new NepaliDate().getYear();
                const allYears = Array.from(new Set([...(years || []), currentYear])).sort((a,b) => b-a);
                setBsYears(allYears);
                setSelectedLockYear(String(allYears[0] || currentYear));
                setSelectedLockMonth(String(new NepaliDate().getMonth()));
            });
        }
    });

    setIsLoading(false);
    return () => unsubs.forEach(u => u());
  }, []);

  const handleSaveCompanyProfile = async () => {
    if (!user) return;
    setIsSavingProfile(true);
    try {
        const updatedProfile = { ...companyProfile, lastModifiedBy: user.username, lastModifiedAt: new Date().toISOString() };
        await setSetting('companyProfile', updatedProfile);
        toast({ title: 'Success', description: 'Main Company details updated.' });
    } catch {
        toast({ title: 'Error', description: 'Failed to update company details.', variant: 'destructive' });
    } finally {
        setIsSavingProfile(false);
    }
  };

  const handleSaveFleetProfile = async () => {
    if (!user) return;
    setIsSavingFleetProfile(true);
    try {
        const updatedProfile = { ...fleetProfile, lastModifiedBy: user.username, lastModifiedAt: new Date().toISOString() };
        await setSetting('fleetCompanyProfile', updatedProfile);
        toast({ title: 'Success', description: 'Fleet Company details updated.' });
    } catch {
        toast({ title: 'Error', description: 'Failed to update fleet details.', variant: 'destructive' });
    } finally {
        setIsSavingFleetProfile(false);
    }
  };

  const handleSaveAppBranding = async () => {
    if (!user) return;
    setIsSavingBranding(true);
    try {
        await setSetting('appBranding', appBranding);
        toast({ title: 'Success', description: 'Application branding updated.' });
    } catch {
        toast({ title: 'Error', description: 'Failed to update branding.', variant: 'destructive' });
    } finally {
        setIsSavingBranding(false);
    }
  };

  const handleOpenPrefixDialog = (key: keyof DocumentPrefixes) => {
    setEditingPrefix({ key, value: prefixes[key] || '' });
    setIsPrefixDialogOpen(true);
  };
  
  const handleSavePrefix = async () => {
    if (!editingPrefix) return;
    const newPrefixes = { ...prefixes, [editingPrefix.key]: editingPrefix.value };
    try {
        await setSetting('documentPrefixes', newPrefixes);
        toast({ title: 'Success', description: 'Prefix updated successfully.' });
        setIsPrefixDialogOpen(false);
        setEditingPrefix(null);
    } catch {
        toast({ title: 'Error', description: 'Failed to save prefix.', variant: 'destructive' });
    }
  };

  const handleExportData = async () => {
    setIsExporting(true);
    try {
        const data = await exportData();
        const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(JSON.stringify(data, null, 2))}`;
        const link = document.createElement("a");
        link.href = jsonString;
        link.download = `starsutra-backup-${new Date().toISOString()}.json`;
        link.click();
        toast({ title: 'Export Successful', description: 'Your data has been downloaded.' });
    } catch (error) {
        console.error("Export failed:", error);
        toast({ title: 'Export Failed', description: 'Could not export data.', variant: 'destructive' });
    } finally {
        setIsExporting(false);
    }
  };

  const handleImportFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const content = e.target?.result as string;
            const data = JSON.parse(content);
            if (!data) throw new Error("File content is empty or invalid JSON.");
            setIsImporting(true);
            await importData(data);
            toast({ title: 'Import Successful', description: 'Data has been restored from backup. The application will now reload.' });
            setTimeout(() => window.location.reload(), 2000);
        } catch (error) {
            console.error("Import failed:", error);
            toast({ title: 'Import Failed', description: 'Could not restore data from the selected file.', variant: 'destructive' });
            setIsImporting(false);
        }
    };
    reader.readAsText(file);
    if(importFileRef.current) importFileRef.current.value = '';
};

  const handleTogglePayrollLock = async () => {
    if (!selectedLockYear || !selectedLockMonth) {
        toast({ title: 'Error', description: 'Please select a year and month.', variant: 'destructive' });
        return;
    }
    const lockKey = `${selectedLockYear}-${selectedLockMonth}`;
    const newLocks = { ...payrollLocks, [lockKey]: !payrollLocks[lockKey] };
    try {
        await setSetting('payrollLocks', newLocks);
        toast({ title: 'Success', description: `Payroll for ${NEPALI_MONTHS.find(m => m.value.toString() === selectedLockMonth)?.name} ${selectedLockYear} has been ${newLocks[lockKey] ? 'locked' : 'unlocked'}.` });
    } catch {
        toast({ title: 'Error', description: 'Failed to update lock status.', variant: 'destructive' });
    }
  };
  
  const isCurrentPeriodLocked = useMemo(() => {
      if (!selectedLockYear || !selectedLockMonth) return false;
      const lockKey = `${selectedLockYear}-${selectedLockMonth}`;
      return payrollLocks[lockKey] || false;
  }, [payrollLocks, selectedLockYear, selectedLockMonth]);

  const openPartyDialog = (party: Party | null = null) => {
    if (party) {
        setEditingParty(party);
        setPartyForm({ name: party.name, type: party.type, ownership: party.ownership || 'Both', address: party.address || '', panNumber: party.panNumber || '' });
    } else {
        setEditingParty(null);
        setPartyForm({ name: '', type: 'Vendor', ownership: 'Both', address: '', panNumber: '' });
    }
    setIsPartyDialogOpen(true);
  };
  
  const handlePartySubmit = async () => {
    if(!user) return;
    if(!partyForm.name || !partyForm.type || !partyForm.ownership) {
        toast({title: 'Error', description: 'Name, Type, and Ownership are mandatory.', variant: 'destructive'});
        return;
    }
    try {
        if (editingParty) {
            await updateParty(editingParty.id, { ...partyForm, lastModifiedBy: user.username });
            toast({title: 'Success', description: 'Party updated.'});
        } else {
            await addParty({...partyForm, createdBy: user.username });
            toast({title: 'Success', description: 'New party added.'});
        }
        setIsPartyDialogOpen(false);
    } catch {
         toast({title: 'Error', description: 'Failed to save party.', variant: 'destructive'});
    }
  };

  const handleDeleteParty = async (id: string) => {
      try {
          await deleteParty(id);
          toast({ title: 'Success', description: 'Party deleted.' });
      } catch {
          toast({ title: 'Error', description: 'Failed to delete party.', variant: 'destructive' });
      }
  };

  const handleMergePartiesInternal = async (sourceId: string, destinationId: string) => {
      try {
          await mergeParties(sourceId, destinationId);
          toast({ title: "Merge Successful" });
      } catch (error: any) {
          toast({ title: "Merge Failed", description: error.message, variant: "destructive" });
      }
  };
  
  const filteredParties = parties.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase())).sort((a, b) => a.name.localeCompare(b.name));

  const openAccountDialog = (account: Account | null = null) => {
    if (account) {
        setEditingAccount(account);
        setAccountForm({ name: account.name, type: account.type, ownership: account.ownership || 'Both', accountNumber: account.accountNumber || '', bankName: account.bankName || '', branch: account.branch || '', bankAccountType: account.bankAccountType || 'Saving' });
    } else {
        setEditingAccount(null);
        setAccountForm({ name: '', type: 'Cash' as AccountType, ownership: 'Both', accountNumber: '', bankName: '', branch: '', bankAccountType: 'Saving' });
    }
    setIsAccountDialogOpen(true);
  };
  
  const handleAccountSubmit = async () => {
      if(!user) return;
      if(!accountForm.name || !accountForm.type || !accountForm.ownership) {
          toast({title: 'Error', description: 'Name, Type, and Ownership are mandatory.', variant: 'destructive'});
          return;
      }
      try {
          if (editingAccount) {
              await updateAccount(editingAccount.id, { ...accountForm, lastModifiedBy: user.username });
              toast({ title: 'Success', description: 'Account updated.' });
          } else {
              await addAccount({ ...accountForm, createdAt: new Date().toISOString(), createdBy: user.username });
              toast({title: 'Success', description: 'New account added.'});
          }
          setIsAccountDialogOpen(true);
      } catch {
           toast({title: 'Error', description: 'Failed to add account.', variant: 'destructive'});
      }
  };
  
  const handleDeleteAccount = async (id: string) => {
      try {
          await deleteAccount(id);
          toast({ title: 'Success', description: 'Account deleted.' });
      } catch {
          toast({ title: 'Error', description: 'Failed to delete account.', variant: 'destructive' });
      }
  };
  
  const filteredAccounts = accounts.filter(a => a.name.toLowerCase().includes(searchQuery.toLowerCase()) || (a.bankName || '').toLowerCase().includes(searchQuery.toLowerCase()));
  
  const openUomDialog = (uom: UnitOfMeasurement | null = null) => {
    if (uom) {
        setEditingUom(uom);
        setUomForm({ name: uom.name, abbreviation: uom.abbreviation });
    } else {
        setEditingUom(null);
        setUomForm({ name: '', abbreviation: '' });
    }
    setIsUomDialogOpen(true);
  };
  
  const handleUomSubmit = async () => {
    if (!user) return;
    if (!uomForm.name || !uomForm.abbreviation) {
        toast({ title: 'Error', description: 'Name and abbreviation are required.', variant: 'destructive' });
        return;
    }
    try {
        if (editingUom) {
            await updateUom(editingUom.id, { ...uomForm, lastModifiedBy: user.username });
            toast({ title: 'Success', description: 'Unit updated.' });
        } else {
            await addUom({ ...uomForm, createdBy: user.username, createdAt: new Date().toISOString() });
            toast({ title: 'Success', description: 'New unit added.' });
        }
        setIsUomDialogOpen(false);
    } catch {
        toast({ title: 'Error', description: 'Failed to save unit.', variant: 'destructive' });
    }
  };
  
  const handleDeleteUom = async (id: string) => {
      try {
          await deleteUom(id);
          toast({ title: 'Success', description: 'Unit deleted.' });
      } catch {
          toast({ title: 'Error', description: 'Failed to delete unit.', variant: 'destructive' });
      }
  };
  
  const filteredUoms = uoms.filter(u => u.name.toLowerCase().includes(searchQuery.toLowerCase()) || u.abbreviation.toLowerCase().includes(searchQuery.toLowerCase()));

  const openUserDialog = (userToEdit: User | null = null) => {
    const freshPermissions: Permissions = {};
    modules.forEach(m => {
        freshPermissions[m] = userToEdit?.permissions?.[m] ? [...userToEdit.permissions[m]!] : [];
    });

    if (userToEdit) {
        setEditingUser(userToEdit);
        setUserForm({ 
            username: userToEdit.username, 
            email: userToEdit.email || '', 
            isApproved: userToEdit.isApproved !== false, 
            password: '', 
            permissions: freshPermissions
        });
    } else {
        setEditingUser(null);
        setUserForm({ username: '', email: '', isApproved: true, password: '', permissions: freshPermissions });
    }
    setPasswordError(null);
    setIsUserDialogOpen(true);
  };
  
  const handlePermissionChange = (module: Module, action: Action, checked: boolean) => {
    setUserForm(prev => {
        const newPermissions = { ...prev.permissions };
        const currentModulePerms = newPermissions[module] ? [...newPermissions[module]!] : [];
        if (checked) {
            newPermissions[module] = Array.from(new Set([...currentModulePerms, action]));
        } else {
            newPermissions[module] = currentModulePerms.filter(a => a !== action);
        }
        return { ...prev, permissions: newPermissions };
    });
  };

  const handleUserSubmit = async () => {
    if (!user) return;
    const isEditing = !!editingUser;
    const { isValid, error } = validatePassword(userForm.password, !isEditing);
    if (!isValid) { setPasswordError(error!); return; }
    setPasswordError(null);
    setIsSubmittingUser(true);
    try {
        let finalUserId = editingUser?.id || Date.now().toString();
        if (!isEditing) {
            const authUser = await adminCreateUserWithUsername(auth, userForm.username, userForm.email, userForm.password);
            finalUserId = authUser.uid;
        }
        await saveUser({ id: finalUserId, username: userForm.username.toLowerCase().trim(), email: userForm.email.toLowerCase().trim(), isApproved: userForm.isApproved, permissions: userForm.permissions });
        toast({ title: 'Success', description: `User ${isEditing ? 'updated' : 'onboarded'}.` });
        setIsUserDialogOpen(false);
    } catch (e: any) {
        toast({ title: 'User Setup Failed', description: e.message, variant: 'destructive' });
    } finally {
        setIsUserDialogOpen(false);
        setIsSubmittingUser(false);
    }
  };

  const filteredUsers = useMemo(() => {
    return users.filter(u => (u.username || '').toLowerCase().includes(searchQuery.toLowerCase()));
  }, [users, searchQuery]);

  const handleDeleteUser = async (id: string, username?: string) => {
      try {
          await deleteUserService(id, username);
          toast({ title: 'Success', description: 'User deleted.' });
      } catch (e: any) {
          toast({ title: 'Error', description: 'Failed to delete user.', variant: 'destructive' });
      }
  };
  
  const handleChangePassword = async () => {
    if (!user) return;
    if (newPassword !== confirmPassword) { setChangePasswordError("New passwords do not match."); return; }
    const { isValid, error } = validatePassword(newPassword);
    if (!isValid) { setChangePasswordError(error!); return; }
    setChangePasswordError(null);
    try {
        if (user.isAdmin) { await setAdminPassword(newPassword, new Date().toISOString()); }
        else { const currentUser = users.find(u => u.username === user.username); if (currentUser) { await saveUser({ ...currentUser, passwordLastUpdated: new Date().toISOString(), permissions: currentUser.permissions }); } }
        toast({ title: 'Success', description: 'Password updated. Please log in again.' });
        setIsChangePasswordDialogOpen(false);
        await logout();
    } catch(e: any) { setChangePasswordError(e.message); }
  };
  
  const otherTabs = [
    { value: "app-branding", label: "App Customization" },
    { value: "company-details", label: "Company Profile" },
    { value: "parties", label: "Vendors & Suppliers" },
    { value: "accounts", label: "Accounts" },
    { value: "uom", label: "Units of Measurement" },
    { value: "document-numbering", label: "Document Numbering" },
    { value: "payroll-settings", label: "Payroll Settings" },
    { value: "usage-analytics", label: "System Usage" },
    { value: "system-logs", label: "System Logs" },
  ];

  const usageStats = useMemo(() => {
    const total = pageVisits.reduce((sum, v) => sum + (v.count || 0), 0);
    const sorted = [...pageVisits].sort((a, b) => (b.count || 0) - (a.count || 0));
    return { total, top5: sorted.slice(0, 5) };
  }, [pageVisits]);

  return (
    <div className="flex flex-col gap-8">
        <header className="flex items-center justify-between">
            <div>
                <h1 className="text-3xl font-bold tracking-tight text-gray-900">General Settings</h1>
                <p className="text-muted-foreground text-sm font-medium">Manage your application's master data and cloud security.</p>
            </div>
            <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input type="search" placeholder="Filter settings..." className="pl-8 sm:w-[300px] h-10 border-gray-300" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            </div>
        </header>
        
        <Tabs value={activeTab} onValueChange={setActiveTab}>
             <div className="flex items-center justify-between border-b pb-1">
                <TabsList className="bg-transparent h-auto p-0 gap-2">
                    <TabsTrigger value="users-security" className="data-[state=active]:bg-primary/5 data-[state=active]:text-primary h-9 rounded-lg px-4 font-bold text-xs uppercase tracking-widest transition-all">Users & Security</TabsTrigger>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="flex items-center gap-1.5 h-9 font-bold text-xs uppercase tracking-widest text-muted-foreground">
                                Detailed Management
                                <ChevronDown className="h-3.5 w-3.5 opacity-50" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-56">
                            <DropdownMenuRadioGroup value={activeTab} onValueChange={setActiveTab}>
                            {otherTabs.map(tab => (
                                <DropdownMenuRadioItem key={tab.value} value={tab.value} className="text-xs">
                                    {tab.label}
                                </DropdownMenuRadioItem>
                            ))}
                            </DropdownMenuRadioGroup>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </TabsList>
                
                <div className="flex items-center gap-2">
                    {activeTab === 'users-security' && hasPermission('settings', 'create') && (
                        <Button size="sm" onClick={() => openUserDialog()} className="h-8 shadow-sm">
                            <Plus className="mr-2 h-4 w-4" /> Add User
                        </Button>
                    )}
                    <Button variant="outline" size="sm" className="h-8 gap-2" onClick={handleExportData} disabled={isExporting}>
                        {isExporting ? <Loader2 className="animate-spin h-3.5 w-3.5" /> : <Download className="h-3.5 w-3.5" />}
                        Backup
                    </Button>
                    <div className="relative">
                        <Input type="file" ref={importFileRef} onChange={handleImportFileSelect} accept=".json" className="hidden" />
                        <Button variant="outline" size="sm" className="h-8 gap-2" onClick={() => importFileRef.current?.click()} disabled={isImporting}>
                            {isImporting ? <Loader2 className="animate-spin h-3.5 w-3.5" /> : <Upload className="h-3.5 w-3.5" />}
                            Restore
                        </Button>
                    </div>
                </div>
             </div>

            <TabsContent value="users-security" className="mt-6 space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <Card className="lg:col-span-1 shadow-sm border-gray-100 h-fit">
                        <CardHeader className="bg-muted/30 py-4 px-6 border-b">
                            <CardTitle className="text-sm font-black uppercase text-gray-900 tracking-wider flex items-center gap-2">
                                <KeyRound className="h-4 w-4 text-primary"/>
                                My Account
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-6 space-y-4">
                            <div className="flex flex-col gap-1">
                                <span className="text-[10px] uppercase font-bold text-muted-foreground">Current Operator</span>
                                <p className="font-black text-lg text-gray-900">{user?.username}</p>
                            </div>
                            <Button onClick={() => setIsChangePasswordDialogOpen(true)} variant="outline" className="w-full h-10 border-gray-300 font-bold text-xs text-primary">
                                <KeyRound className="mr-2 h-4 w-4"/> Update Secure Password
                            </Button>
                            
                            <Separator className="my-2" />
                            <div className="p-4 rounded-xl bg-amber-50 border-2 border-dashed border-amber-200">
                                <div className="flex items-center gap-2 mb-2 text-amber-700">
                                    <AlertTriangle className="h-4 w-4" />
                                    <span className="text-[10px] font-black uppercase tracking-widest">Incident Response</span>
                                </div>
                                <p className="text-[10px] text-amber-800 leading-relaxed font-medium">
                                    In case of suspected compromise, review the **Security Runbook** in your documentation and use the **Purge User** or **IsApproved** toggle to contain threats.
                                </p>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="lg:col-span-2 shadow-sm border-gray-100 bg-white overflow-hidden">
                        <CardHeader className="py-4 px-6 border-b bg-primary/5">
                            <div className="flex items-center justify-between">
                                <div>
                                    <CardTitle className="text-sm font-black uppercase text-gray-900 tracking-wider">Cloud User Directory</CardTitle>
                                    <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-tight">Active accounts and assigned role privileges.</p>
                                </div>
                                <ConnectionIndicator />
                            </div>
                        </CardHeader>
                        <CardContent className="p-0">
                            <Table>
                                <TableHeader className="bg-muted/50">
                                    <TableRow className="hover:bg-transparent">
                                        <TableHead className="w-[150px] font-bold pl-6">Username</TableHead>
                                        <TableHead className="font-bold">Email / Identifier</TableHead>
                                        <TableHead className="text-center font-bold">Status</TableHead>
                                        <TableHead className="text-right pr-6 font-bold">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredUsers.map(u => (
                                        <TableRow key={u.id} className="group hover:bg-muted/30 transition-colors h-14">
                                            <TableCell className="font-black text-gray-900 pl-6">{u.username}</TableCell>
                                            <TableCell className="text-xs text-muted-foreground">{u.email || `${u.username}@starsutra.com`}</TableCell>
                                            <TableCell className="text-center">
                                                {u.isApproved !== false ? (
                                                    <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[9px] font-black uppercase h-5">
                                                        <UserCheck className="mr-1 h-3 w-3"/> Approved
                                                    </Badge>
                                                ) : (
                                                    <Badge variant="outline" className="bg-red-50 text-red-600 border-red-200 text-[9px] font-black uppercase h-5">
                                                        <UserX className="mr-1 h-3 w-3"/> Pending
                                                    </Badge>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-right pr-6">
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"><MoreHorizontal className="h-4 w-4"/></Button></DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end" className="w-48">
                                                        <DropdownMenuItem onSelect={() => openUserDialog(u)} className="text-xs">
                                                            <Edit className="mr-2 h-3 w-3" /> Edit Access
                                                        </DropdownMenuItem>
                                                        <DropdownMenuSeparator />
                                                        <AlertDialog>
                                                            <AlertDialogTrigger asChild>
                                                                <DropdownMenuItem onSelect={e => e.preventDefault()} className="text-destructive"><Trash2 className="mr-2 h-4 w-4" /> Purge User</DropdownMenuItem>
                                                            </AlertDialogTrigger>
                                                            <AlertDialogContent>
                                                                <AlertDialogHeader><AlertDialogTitle>Delete user "{u.username}"?</AlertDialogTitle><AlertDialogDescription>This will immediately terminate all active sessions for this user and remove their username mapping. This action is permanent.</AlertDialogDescription></AlertDialogHeader>
                                                                <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => handleDeleteUser(u.id, u.username)} className="bg-destructive text-destructive-foreground">Yes, Delete</AlertDialogAction></AlertDialogFooter>
                                                            </AlertDialogContent>
                                                        </AlertDialog>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </div>
            </TabsContent>

            <TabsContent value="app-branding">
                 <Card className="shadow-sm border-gray-100 bg-white">
                    <CardHeader className="flex flex-row items-center justify-between py-6 px-8 border-b bg-primary/5">
                        <div className="space-y-1">
                            <CardTitle className="text-xl font-black text-gray-900 tracking-tight">System Identity</CardTitle>
                            <CardDescription className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Configure core application naming and brand personality.</CardDescription>
                        </div>
                        <Button onClick={handleSaveAppBranding} disabled={isSavingBranding} className="h-10 px-8 font-black text-[10px] uppercase tracking-widest shadow-lg shadow-primary/20">
                            {isSavingBranding ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                            Apply Branding
                        </Button>
                    </CardHeader>
                    <CardContent className="p-8">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                            <div className="space-y-6">
                                <div className="space-y-2">
                                    <Label htmlFor="app-name" className="text-xs font-black uppercase text-muted-foreground tracking-widest">Master Application Name</Label>
                                    <Input id="app-name" value={appBranding.appName || ''} onChange={e => setAppBranding(prev => ({ ...prev, appName: e.target.value }))} className="h-12 text-lg font-bold border-gray-300 focus-visible:border-primary shadow-sm" placeholder="e.g. StarSutra" />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="app-motto" className="text-xs font-black uppercase text-muted-foreground tracking-widest">Mission Statement / Tagline</Label>
                                    <Input id="app-motto" value={appBranding.appMotto || ''} onChange={e => setAppBranding(prev => ({ ...prev, appMotto: e.target.value }))} className="h-10 border-gray-300" placeholder="e.g. Operational Intelligence Simplified" />
                                </div>
                            </div>
                        </div>
                    </CardContent>
                 </Card>
            </TabsContent>

            <TabsContent value="company-details" className="mt-6 space-y-8">
                <Card className="shadow-sm border-gray-100 overflow-hidden">
                    <CardHeader className="flex flex-row items-center justify-between bg-primary/5 py-4 px-6 border-b">
                        <div className="space-y-1">
                            <CardTitle className="text-lg font-black tracking-tight">Main (Manufacturing) Profile</CardTitle>
                        </div>
                        <Button onClick={handleSaveCompanyProfile} disabled={isSavingProfile} className="h-9 px-6 font-bold text-xs uppercase tracking-widest">
                            {isSavingProfile ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                            Update
                        </Button>
                    </CardHeader>
                    <CardContent className="p-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-1.5"><Label className="text-[10px] uppercase font-bold text-muted-foreground">Company Name (English)</Label><Input value={companyProfile.nameEn || ''} onChange={e => setCompanyProfile(prev => ({...prev, nameEn: e.target.value}))} className="h-9" /></div>
                            <div className="space-y-1.5"><Label className="text-[10px] uppercase font-bold text-muted-foreground">कम्पनीको नाम (Nepali)</Label><Input value={companyProfile.nameNp || ''} onChange={e => setCompanyProfile(prev => ({...prev, nameNp: e.target.value}))} className="h-9 font-medium" /></div>
                            <div className="space-y-1.5 md:col-span-2"><Label className="text-[10px] uppercase font-bold text-muted-foreground">Full Registered Address</Label><Input value={companyProfile.address || ''} onChange={e => setCompanyProfile(prev => ({...prev, address: e.target.value}))} className="h-9" /></div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="shadow-sm border-gray-100 overflow-hidden">
                    <CardHeader className="flex flex-row items-center justify-between bg-muted/20 py-4 px-6 border-b">
                        <div className="space-y-1">
                            <CardTitle className="text-lg font-black tracking-tight">Sijan Fleet (Logistics) Profile</CardTitle>
                        </div>
                        <Button onClick={handleSaveFleetProfile} disabled={isSavingFleetProfile} className="h-9 px-6 font-bold text-xs uppercase tracking-widest">
                            {isSavingFleetProfile ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                            Update
                        </Button>
                    </CardHeader>
                    <CardContent className="p-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-1.5"><Label className="text-[10px] uppercase font-bold text-muted-foreground">Fleet Name (English)</Label><Input value={fleetProfile.nameEn || ''} onChange={e => setFleetProfile(prev => ({...prev, nameEn: e.target.value}))} className="h-9" /></div>
                            <div className="space-y-1.5"><Label className="text-[10px] uppercase font-bold text-muted-foreground">फ्लीटको नाम (Nepali)</Label><Input value={fleetProfile.nameNp || ''} onChange={e => setFleetProfile(prev => ({...prev, nameNp: e.target.value}))} className="h-9 font-medium" /></div>
                            <div className="space-y-1.5"><Label className="text-[10px] uppercase font-bold text-muted-foreground">PAN/VAT Number</Label><Input value={fleetProfile.pan || ''} onChange={e => setFleetProfile(prev => ({...prev, pan: e.target.value}))} className="h-9 font-mono" /></div>
                            <div className="space-y-1.5"><Label className="text-[10px] uppercase font-bold text-muted-foreground">Fleet Office Address</Label><Input value={fleetProfile.address || ''} onChange={e => setFleetProfile(prev => ({...prev, address: e.target.value}))} className="h-9" /></div>
                        </div>
                    </CardContent>
                </Card>
            </TabsContent>
            
            <TabsContent value="parties">
                <Card className="shadow-sm border-gray-100 bg-white">
                    <CardHeader className="flex flex-row items-center justify-between py-4 border-b">
                        <div><CardTitle className="text-base font-black uppercase">Vendor & Supplier Ledger</CardTitle></div>
                        <div className="flex gap-2">
                            <Button variant="outline" size="sm" onClick={() => setIsMergeDialogOpen(true)} className="h-8 uppercase font-black text-[10px] tracking-widest"><GitMerge className="mr-2 h-3.5 w-3.5"/> Merge Duplicates</Button>
                            <Button size="sm" onClick={() => openPartyDialog()} className="h-8 uppercase font-black text-[10px] tracking-widest"><Plus className="mr-2 h-3.5 w-3.5" /> Add Partner</Button>
                        </div>
                    </CardHeader>
                    <CardContent className="p-0">
                        <Table className="text-xs">
                            <TableHeader className="bg-muted/50">
                                <TableRow className="hover:bg-transparent">
                                    <TableHead className="pl-6">Entity Name</TableHead>
                                    <TableHead>Category</TableHead>
                                    <TableHead>Ownership</TableHead>
                                    <TableHead className="text-right pr-6">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                            {filteredParties.map(party => (
                                <TableRow key={party.id} className="h-12 border-b-gray-100">
                                    <TableCell className="font-bold pl-6 text-gray-900">{party.name}</TableCell>
                                    <TableCell><Badge variant="secondary" className="text-[9px] uppercase font-black">{party.type}</Badge></TableCell>
                                    <TableCell><Badge variant="outline" className="text-[9px] uppercase font-black">{party.ownership}</Badge></TableCell>
                                    <TableCell className="text-right pr-6">
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                                            <DropdownMenuContent align="end" className="w-48">
                                                <DropdownMenuItem onSelect={() => openPartyDialog(party)} className="text-xs">Edit Detail</DropdownMenuItem>
                                                <DropdownMenuSeparator />
                                                <DropdownMenuItem onSelect={() => handleDeleteParty(party.id)} className="text-destructive text-xs">Purge Partner</DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </TableCell>
                                </TableRow>
                            ))}</TableBody>
                        </Table>
                    </CardContent>
                </Card>
            </TabsContent>

            <TabsContent value="accounts">
                <Card className="shadow-sm border-gray-100 bg-white">
                    <CardHeader className="flex flex-row items-center justify-between py-4 border-b">
                        <div><CardTitle className="text-base font-black uppercase">Financial Accounts</CardTitle></div>
                        <Button size="sm" onClick={() => openAccountDialog()} className="h-8 uppercase font-black text-[10px] tracking-widest"><Plus className="mr-2 h-4 w-4" /> Add Account</Button>
                    </CardHeader>
                    <CardContent className="p-0">
                        <Table className="text-xs"><TableHeader className="bg-muted/50"><TableRow><TableHead className="pl-6">Account Name</TableHead><TableHead>Type</TableHead><TableHead className="text-right pr-6">Actions</TableHead></TableRow></TableHeader><TableBody>
                        {filteredAccounts.map(acc => (
                            <TableRow key={acc.id} className="h-12 border-b-gray-100"><TableCell className="font-bold pl-6 text-gray-900">{acc.name}</TableCell><TableCell><Badge variant="outline" className="text-[9px] uppercase font-bold">{acc.type}</Badge></TableCell><TableCell className="text-right pr-6 space-x-1">
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openAccountDialog(acc)}><Edit className="h-3.5 w-3.5" /></Button>
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDeleteAccount(acc.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                            </TableCell></TableRow>
                        ))}</TableBody></Table>
                    </CardContent>
                </Card>
            </TabsContent>

            <TabsContent value="uom">
                <Card className="shadow-sm border-gray-100 bg-white">
                    <CardHeader className="flex flex-row items-center justify-between py-4 border-b">
                        <div><CardTitle className="text-base font-black uppercase">Units of Measurement</CardTitle></div>
                        <Button size="sm" onClick={() => openUomDialog()} className="h-8 uppercase font-black text-[10px] tracking-widest"><Plus className="mr-2 h-4 w-4" /> New Unit</Button>
                    </CardHeader>
                    <CardContent className="p-0">
                        <Table className="text-xs"><TableHeader className="bg-muted/50"><TableRow><TableHead className="pl-6">Description</TableHead><TableHead>Code</TableHead><TableHead className="text-right pr-6">Actions</TableHead></TableRow></TableHeader><TableBody>
                        {filteredUoms.map(u => (
                            <TableRow key={u.id} className="h-12 border-b-gray-100"><TableCell className="font-bold pl-6">{u.name}</TableCell><TableCell className="font-black text-primary">{u.abbreviation}</TableCell><TableCell className="text-right pr-6 space-x-1">
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openUomDialog(u)}><Edit className="h-3.5 w-3.5" /></Button>
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDeleteUom(u.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                            </TableCell></TableRow>
                        ))}</TableBody></Table>
                    </CardContent>
                </Card>
            </TabsContent>

            <TabsContent value="document-numbering">
                <Card className="shadow-sm border-gray-100 bg-white">
                    <CardHeader className="bg-muted/10 border-b py-4 px-6"><CardTitle className="text-sm font-black uppercase">Prefix Configuration</CardTitle></CardHeader>
                    <CardContent className="p-0">
                        <Table className="text-xs"><TableHeader className="bg-muted/50"><TableRow><TableHead className="pl-6">Document Class</TableHead><TableHead>System Prefix</TableHead><TableHead className="text-right pr-6">Actions</TableHead></TableRow></TableHeader><TableBody>
                        {documentTypes.map(t => (<TableRow key={t} className="h-12"><TableCell className="font-bold pl-6">{getDocumentName(t)}</TableCell><TableCell className="font-mono text-blue-600 font-black">{prefixes[t] || '(Default)'}</TableCell><TableCell className="text-right pr-6"><Button variant="outline" size="sm" className="h-7 text-[10px] uppercase font-black" onClick={() => handleOpenPrefixDialog(t)}>Configure</Button></TableCell></TableRow>))}
                    </TableBody></Table></CardContent>
                </Card>
            </TabsContent>

            <TabsContent value="payroll-settings">
                <Card className="shadow-sm border-gray-100 border-l-4 border-l-amber-500 overflow-hidden">
                    <CardHeader className="bg-amber-50/50 py-4 px-6 border-b">
                        <div className="flex items-center gap-3">
                            <ShieldAlert className="h-5 w-5 text-amber-600"/>
                            <div><CardTitle className="text-sm font-black uppercase">Payroll Guardrails</CardTitle></div>
                        </div>
                    </CardHeader>
                    <CardContent className="p-6">
                        <div className="flex flex-wrap gap-4 items-end bg-white p-4 rounded-xl border-2 border-dashed border-amber-200">
                            <div className="space-y-1.5"><Label className="text-[10px] uppercase font-bold text-muted-foreground">Target BS Year</Label><Select value={selectedLockYear} onValueChange={setSelectedLockYear}><SelectTrigger className="w-[120px] h-9"><SelectValue /></SelectTrigger><SelectContent>{bsYears.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent></Select></div>
                            <div className="space-y-1.5"><Label className="text-[10px] uppercase font-bold text-muted-foreground">Target BS Month</Label><Select value={selectedLockMonth} onValueChange={setSelectedLockMonth}><SelectTrigger className="w-[150px] h-9"><SelectValue /></SelectTrigger><SelectContent>{NEPALI_MONTHS.map(m => <SelectItem key={m.value} value={String(m.value)}>{m.name}</SelectItem>)}</SelectContent></Select></div>
                            <Button onClick={handleTogglePayrollLock} variant={isCurrentPeriodLocked ? 'destructive' : 'default'} className="h-9 px-8 font-black text-xs uppercase">
                                {isCurrentPeriodLocked ? 'Unlock Period' : 'Lock Cycle'}
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </TabsContent>

            <TabsContent value="usage-analytics">
                <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <Card className="bg-primary text-primary-foreground shadow-lg"><CardHeader className="pb-2"><CardTitle className="text-[10px] uppercase font-black tracking-widest opacity-70">Total Interactions</CardTitle></CardHeader><CardContent><div className="text-3xl font-black">{(usageStats.total || 0).toLocaleString()}</div></CardContent></Card>
                    </div>
                </div>
            </TabsContent>

            <TabsContent value="system-logs">
                <Card className="shadow-sm border-gray-100 bg-white overflow-hidden">
                    <CardHeader className="py-4 px-6 border-b bg-red-50/10 flex flex-row items-center justify-between"><div><CardTitle className="text-sm font-black uppercase text-gray-900">Incident Audit Log</CardTitle></div></CardHeader>
                    <CardContent className="p-0">
                        <Table className="text-[10px]"><TableHeader className="bg-muted/50"><TableRow><TableHead className="pl-6 font-bold">Time</TableHead><TableHead className="font-bold">Module Scope</TableHead><TableHead className="font-bold">Exception Message</TableHead></TableRow></TableHeader><TableBody>
                        {logs.map((log: any) => (<TableRow key={log?.id || generateId()} className="h-12 border-b-gray-50"><TableCell className="text-gray-500 pl-6 font-mono">{log?.timestamp ? format(new Date(log.timestamp), 'HH:mm:ss') : '-'}</TableCell><TableCell><Badge variant="outline" className="text-[9px] font-black uppercase text-red-600">{log?.module || 'Global'}</Badge></TableCell><TableCell className="font-medium text-gray-900 truncate max-w-sm">{log?.message || 'Undefined Exception'}</TableCell></TableRow>))}
                        </TableBody></Table>
                    </CardContent>
                </Card>
            </TabsContent>
        </Tabs>
        
        <Dialog open={isUserDialogOpen} onOpenChange={setIsUserDialogOpen}>
          <DialogContent className="sm:max-w-5xl h-[95vh] flex flex-col p-0 overflow-hidden shadow-2xl border-none">
            <DialogHeader className="p-6 pb-2 border-b bg-muted/5 shrink-0">
                <div className="flex items-center gap-3">
                    <UserIcon className="h-6 w-6 text-primary"/>
                    <DialogTitle className="text-2xl font-black text-gray-900 tracking-tight">{editingUser ? 'Account Configuration' : 'Cloud Onboarding'}</DialogTitle>
                </div>
            </DialogHeader>

            <ScrollArea className="flex-1 p-0 bg-gray-50/30">
                <div className="p-6 space-y-8">
                    <section className="space-y-4">
                        <h3 className="text-[10px] font-black uppercase text-muted-foreground tracking-[0.2em] border-b pb-2">User Identity</h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="space-y-1.5">
                                <Label className="text-[10px] uppercase font-bold text-muted-foreground">Unique Username</Label>
                                <Input value={userForm.username || ''} onChange={e => setUserForm(p => ({...p, username: e.target.value}))} disabled={!!editingUser} className="h-10 bg-white" placeholder="e.g. diwas" />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-[10px] uppercase font-bold text-muted-foreground">Master Email</Label>
                                <Input value={userForm.email || ''} onChange={e => setUserForm(p => ({...p, email: e.target.value}))} className="h-10 bg-white" placeholder="e.g. diwas@starsutra.com" />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-[10px] uppercase font-bold text-muted-foreground">Cloud Password</Label>
                                <Input type="password" value={userForm.password || ''} onChange={e => setUserForm(p => ({...p, password: e.target.value}))} className="h-10 bg-white" placeholder={editingUser ? "••••••••" : "Min 8 chars"} />
                                {passwordError && <p className="text-[9px] text-red-600 font-black uppercase mt-1">{passwordError}</p>}
                            </div>
                        </div>
                        <div className="flex items-center gap-2 pt-2">
                             <Switch id="user-approved" checked={userForm.isApproved} onCheckedChange={v => setUserForm(p => ({...p, isApproved: v}))} />
                             <Label htmlFor="user-approved" className="text-xs font-bold uppercase text-gray-700">Administrator Approved (Enable cloud login)</Label>
                        </div>
                    </section>

                    <section className="space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-2">
                            <h3 className="text-[10px] font-black uppercase text-muted-foreground tracking-[0.2em]">Module-Based Access Control</h3>
                            <div className="flex items-center gap-2">
                                <div className="relative">
                                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground"/>
                                    <Input 
                                        placeholder="Search modules..." 
                                        value={moduleSearch} 
                                        onChange={e => setModuleSearch(e.target.value)} 
                                        className="h-8 w-48 text-[10px] pl-7 bg-white"
                                    />
                                </div>
                                <Button variant="outline" size="sm" className="h-8 text-[9px] font-black uppercase tracking-widest px-4" onClick={() => {
                                    const freshPermissions: Permissions = {};
                                    modules.forEach(m => freshPermissions[m] = []);
                                    setUserForm(p => ({...p, permissions: freshPermissions}))
                                }}>Clear All</Button>
                            </div>
                        </div>

                        <div className="border rounded-xl bg-white overflow-hidden shadow-sm">
                            <Table className="text-[11px]">
                                <TableHeader className="bg-muted/30">
                                    <TableRow className="hover:bg-transparent">
                                        <TableHead className="w-[300px] font-black uppercase text-gray-900">Module</TableHead>
                                        <TableHead className="text-center w-[120px] font-black uppercase text-blue-600">
                                            <div className="flex flex-col items-center gap-1">
                                                <Crown className="h-3 w-3"/>
                                                <span>Full Access</span>
                                            </div>
                                        </TableHead>
                                        <TableHead className="text-center w-[80px] font-black uppercase">
                                            <div className="flex flex-col items-center gap-1">
                                                <Eye className="h-3 w-3 opacity-60"/>
                                                <span>View</span>
                                            </div>
                                        </TableHead>
                                        <TableHead className="text-center w-[80px] font-black uppercase">
                                            <div className="flex flex-col items-center gap-1">
                                                <PlusCircle className="h-3 w-3 opacity-60"/>
                                                <span>Add</span>
                                            </div>
                                        </TableHead>
                                        <TableHead className="text-center w-[80px] font-black uppercase">
                                            <div className="flex flex-col items-center gap-1">
                                                <Pencil className="h-3 w-3 opacity-60"/>
                                                <span>Edit</span>
                                            </div>
                                        </TableHead>
                                        <TableHead className="text-center w-[80px] font-black uppercase">
                                            <div className="flex flex-col items-center gap-1">
                                                <Trash2 className="h-3 w-3 opacity-60"/>
                                                <span>Delete</span>
                                            </div>
                                        </TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {MODULE_GROUPS.map((group) => {
                                        const visibleModules = group.modules.filter(m => getModuleDisplayName(m).toLowerCase().includes(moduleSearch.toLowerCase()));
                                        if (visibleModules.length === 0) return null;

                                        return (
                                            <React.Fragment key={group.name}>
                                                <TableRow className="bg-muted/10 hover:bg-muted/10 border-b-2">
                                                    <TableCell colSpan={6} className="py-2.5 px-4">
                                                        <div className="flex items-center gap-2 text-primary font-black text-[10px] uppercase tracking-widest">
                                                            <ChevronDown className="h-3.5 w-3.5"/>
                                                            {group.name}
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                                {visibleModules.map(m => {
                                                    const currentPerms = userForm.permissions[m] || [];
                                                    const isAll = currentPerms.includes('all');
                                                    
                                                    return (
                                                        <TableRow key={m} className={cn("group h-12 transition-colors", isAll && "bg-blue-50/20")}>
                                                            <TableCell className="pl-6">
                                                                <div className="flex items-center gap-3">
                                                                    <div className="p-1.5 bg-gray-50 rounded-lg group-hover:bg-white transition-colors">
                                                                        {getModuleIcon(m)}
                                                                    </div>
                                                                    <span className="font-bold text-gray-900">{getModuleDisplayName(m)}</span>
                                                                </div>
                                                            </TableCell>
                                                            <TableCell className="text-center">
                                                                <div className="flex justify-center">
                                                                    <Checkbox 
                                                                        checked={isAll} 
                                                                        onCheckedChange={v => handlePermissionChange(m, 'all', !!v)}
                                                                        className="h-5 w-5 rounded border-2 border-primary/30"
                                                                    />
                                                                </div>
                                                            </TableCell>
                                                            {['view', 'add', 'edit', 'delete'].map((act) => (
                                                                <TableCell key={act} className="text-center">
                                                                    <div className="flex justify-center">
                                                                        <Checkbox 
                                                                            disabled={isAll}
                                                                            checked={isAll || currentPerms.includes(act as any)} 
                                                                            onCheckedChange={v => handlePermissionChange(m, act as any, !!v)}
                                                                            className={cn(
                                                                                "h-4 w-4 rounded",
                                                                                isAll && "opacity-30 cursor-not-allowed"
                                                                            )}
                                                                        />
                                                                    </div>
                                                                </TableCell>
                                                            ))}
                                                        </TableRow>
                                                    );
                                                })}
                                            </React.Fragment>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </div>
                    </section>
                </div>
            </ScrollArea>

            <DialogFooter className="p-6 bg-white border-t">
                <Button variant="outline" onClick={() => setIsUserDialogOpen(false)} className="h-11 px-8 font-bold text-xs uppercase">Cancel</Button>
                <Button onClick={handleUserSubmit} disabled={isSubmittingUser} className="h-11 px-12 font-black text-xs uppercase tracking-widest shadow-xl shadow-primary/20">
                    {isSubmittingUser ? <Loader2 className="animate-spin h-4 w-4 mr-2"/> : <Save className="mr-2 h-4 w-4"/>}
                    Save Permissions
                </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={isChangePasswordDialogOpen} onOpenChange={setIsChangePasswordDialogOpen}>
            <DialogContent>
                <DialogHeader><DialogTitle>Update Master Access Key</DialogTitle></DialogHeader>
                <div className="space-y-4 py-4">
                    <div className="space-y-2"><Label className="text-[10px] uppercase font-bold text-muted-foreground">New Secure Password</Label><Input type="password" value={newPassword || ''} onChange={e => setNewPassword(e.target.value)} className="h-10" /></div>
                    <div className="space-y-2"><Label className="text-[10px] uppercase font-bold text-muted-foreground">Verify Entry</Label><Input type="password" value={confirmPassword || ''} onChange={e => setConfirmPassword(e.target.value)} className="h-10" /></div>
                    {changePasswordError && <p className="text-[10px] text-red-600 font-black uppercase">{changePasswordError}</p>}
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => setIsChangePasswordDialogOpen(false)}>Cancel</Button>
                    <Button onClick={handleChangePassword} className="h-11 font-black text-xs uppercase tracking-widest w-full">Commit & Terminate Active Sessions</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
        
        <Dialog open={isPrefixDialogOpen} onOpenChange={setIsPrefixDialogOpen}>
            <DialogContent>
                <DialogHeader><DialogTitle className="text-lg font-black uppercase">Prefix Configuration</DialogTitle></DialogHeader>
                <div className="py-6 space-y-4">
                    <div className="space-y-2"><Label className="text-[10px] uppercase font-bold text-muted-foreground">System Prefix String</Label><Input value={editingPrefix?.value || ''} onChange={e => setEditingPrefix(p => p ? {...p, value: e.target.value} : null)} className="h-12 text-lg font-mono font-bold text-blue-700" placeholder="e.g. INV-" /></div>
                </div>
                <DialogFooter><Button variant="outline" onClick={() => setIsPrefixDialogOpen(false)}>Cancel</Button><Button onClick={handleSavePrefix}>Save Change</Button></DialogFooter>
            </DialogContent>
        </Dialog>

        <MergePartiesDialog open={isMergeDialogOpen} onOpenChange={setIsMergeDialogOpen} parties={parties} onMerge={handleMergePartiesInternal} />

        <Dialog open={isPartyDialogOpen} onOpenChange={setIsPartyDialogOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>{editingParty ? 'Edit Party' : 'Add Party'}</DialogTitle></DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label>Party Name</Label>
                <Input value={partyForm.name} onChange={e => setPartyForm({...partyForm, name: e.target.value})} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Select value={partyForm.type} onValueChange={(v: PartyType) => setPartyForm({...partyForm, type: v})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Vendor">Vendor</SelectItem>
                      <SelectItem value="Customer">Customer</SelectItem>
                      <SelectItem value="Tenant">Tenant</SelectItem>
                      <SelectItem value="Both">Both</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Ownership</Label>
                  <Select value={partyForm.ownership} onValueChange={(v: AccountOwnership) => setPartyForm({...partyForm, ownership: v})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Sijan">Sijan</SelectItem>
                      <SelectItem value="Shivam">Shivam</SelectItem>
                      <SelectItem value="Rental">Rental</SelectItem>
                      <SelectItem value="Both">Both</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <DialogFooter><Button onClick={handlePartySubmit}>Save Partner</Button></DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={isAccountDialogOpen} onOpenChange={setIsAccountDialogOpen}>
            <DialogContent>
                <DialogHeader><DialogTitle>{editingAccount ? 'Edit Account' : 'Add Account'}</DialogTitle></DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="space-y-2"><Label>Account Name</Label><Input value={accountForm.name} onChange={e => setAccountForm({...accountForm, name: e.target.value})} /></div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2"><Label>Type</Label>
                            <Select value={accountForm.type} onValueChange={(v: any) => setAccountForm({...accountForm, type: v})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="Cash">Cash</SelectItem><SelectItem value="Bank">Bank</SelectItem></SelectContent></Select>
                        </div>
                        <div className="space-y-2"><Label>Ownership</Label>
                            <Select value={accountForm.ownership} onValueChange={(v: any) => setAccountForm({...accountForm, ownership: v})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="Sijan">Sijan</SelectItem><SelectItem value="Shivam">Shivam</SelectItem><SelectItem value="Rental">Rental</SelectItem><SelectItem value="Both">Both</SelectItem></SelectContent></Select>
                        </div>
                    </div>
                </div>
                <DialogFooter><Button onClick={handleAccountSubmit}>Save Account</Button></DialogFooter>
            </DialogContent>
        </Dialog>

        <Dialog open={isUomDialogOpen} onOpenChange={setIsUomDialogOpen}>
            <DialogContent>
                <DialogHeader><DialogTitle>{editingUom ? 'Edit Unit' : 'New Unit'}</DialogTitle></DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="space-y-2"><Label>Unit Name</Label><Input value={uomForm.name} onChange={e => setUomForm({...uomForm, name: e.target.value})} /></div>
                    <div className="space-y-2"><Label>Code / Abbreviation</Label><Input value={uomForm.abbreviation} onChange={e => setUomForm({...uomForm, abbreviation: e.target.value})} /></div>
                </div>
                <DialogFooter><Button onClick={handleUomSubmit}>Save Unit</Button></DialogFooter>
            </DialogContent>
        </Dialog>
    </div>
  );
}