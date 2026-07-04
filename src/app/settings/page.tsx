'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
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
  ShieldX,
  UserCheck,
  UserX,
  Mail,
  Lock,
  History,
  FileText,
  Calculator,
  Terminal,
  ChevronRight,
  User as UserIcon,
  Zap,
  Briefcase,
  Building2,
  Truck,
  Home,
  LayoutDashboard,
  Settings as SettingsIcon,
  Package,
  Wrench,
  Receipt,
  FileSpreadsheet,
  ShoppingCart
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
import { exportData, importData } from '@/services/backup-service';
import { useRouter } from 'next/navigation';
import NepaliDate from 'nepali-date-converter';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn, generateId } from '@/lib/utils';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Switch } from '@/components/ui/switch';
import logo from '@/app/signup/StarSutra.png';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAuthService } from '@/firebase';

const getModuleDisplayName = (m: Module): string => {
    switch (m) {
        case 'reports': return 'Quality Test Reports';
        case 'products': return 'QT Products Catalog';
        case 'purchaseOrders': return 'Purchase Orders';
        case 'rawMaterials': return 'Raw Materials Inventory';
        case 'settings': return 'System Settings & Users';
        case 'hr': return 'HRMS & Attendance';
        case 'fleet': return 'Fleet & Logistics';
        case 'finance': return 'Finance & Accounting';
        case 'crm': return 'Customer CRM';
        case 'rental': return 'Rental Management';
        case 'dashboard': return 'Executive Dashboard';
        default: return m.charAt(0).toUpperCase() + m.slice(1);
    }
};

const getModuleIcon = (m: Module) => {
    switch (m) {
        case 'reports': return <FileText className="h-4 w-4" />;
        case 'products': return <Package className="h-4 w-4" />;
        case 'purchaseOrders': return <ShoppingCart className="h-4 w-4" />;
        case 'rawMaterials': return <Wrench className="h-4 w-4" />;
        case 'settings': return <SettingsIcon className="h-4 w-4" />;
        case 'hr': return <Building2 className="h-4 w-4" />;
        case 'fleet': return <Truck className="h-4 w-4" />;
        case 'finance': return <Calculator className="h-4 w-4" />;
        case 'crm': return <Briefcase className="h-4 w-4" />;
        case 'rental': return <Home className="h-4 w-4" />;
        case 'dashboard': return <LayoutDashboard className="h-4 w-4" />;
        default: return <Terminal className="h-4 w-4" />;
    }
};

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

  // Usage & Log Analytics State
  const [pageVisits, setPageVisits] = useState<PageVisit[]>([]);
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [usageSearch, setUsageSearch] = useState('');
  const [usageSortConfig, setUsageSortConfig] = useState<{ key: 'count' | 'path' | 'lastVisited', dir: 'asc' | 'desc' }>({ key: 'count', dir: 'desc' });
  const [usageFilterMonth, setUsageFilterMonth] = useState<string>('All');
  const [usageFilterYear, setUsageFilterYear] = useState<string>('All');

  // Prefixes State
  const [prefixes, setPrefixes] = useState<DocumentPrefixes>({});
  const [isPrefixDialogOpen, setIsPrefixDialogOpen] = useState(false);
  const [editingPrefix, setEditingPrefix] = useState<{ key: keyof DocumentPrefixes; value: string } | null>(null);
  
  // Company Profile States
  const [companyProfile, setCompanyProfile] = useState<CompanyProfile>(DEFAULT_COMPANY_PROFILE);
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Fleet Profile States
  const [fleetProfile, setFleetProfile] = useState<CompanyProfile>(DEFAULT_FLEET_PROFILE);
  const [isSavingFleetProfile, setIsSavingFleetProfile] = useState(false);

  // App Branding States
  const [appBranding, setAppBranding] = useState<AppBranding>({ appName: 'StarSutra', appMotto: '' });
  const [isSavingBranding, setIsSavingBranding] = useState(false);

  // Payroll Lock State
  const [payrollLocks, setPayrollLocks] = useState<Record<string, boolean>>({});
  const [bsYears, setBsYears] = useState<number[]>([]);
  const [selectedLockYear, setSelectedLockYear] = useState<string>('');
  const [selectedLockMonth, setSelectedLockMonth] = useState<string>('');

  // Party Dialog State
  const [isPartyDialogOpen, setIsPartyDialogOpen] = useState(false);
  const [isMergeDialogOpen, setIsMergeDialogOpen] = useState(false);
  const [editingParty, setEditingParty] = useState<Party | null>(null);
  const [partyForm, setPartyForm] = useState<{name: string, type: PartyType, ownership: AccountOwnership, address?: string, panNumber?: string}>({name: '', type: 'Vendor', ownership: 'Both', address: '', panNumber: ''});

  // Account Dialog State
  const [isAccountDialogOpen, setIsAccountDialogOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [accountForm, setAccountForm] = useState({ 
    name: '', 
    type: 'Cash' as AccountType, 
    ownership: 'Both' as AccountOwnership, 
    accountNumber: '', 
    bankName: '', 
    branch: '', 
    bankAccountType: 'Saving' as BankAccountType | undefined
  });
  
  // UoM Dialog State
  const [isUomDialogOpen, setIsUomDialogOpen] = useState(false);
  const [editingUom, setEditingUom] = useState<UnitOfMeasurement | null>(null);
  const [uomForm, setUomForm] = useState({ name: '', abbreviation: '' });
  
  // User Dialog State
  const [isUserDialogOpen, setIsUserDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [userForm, setUserForm] = useState({ username: '', email: '', isApproved: true, password: '', permissions: {} as Permissions });
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [isSubmittingUser, setIsSubmittingUser] = useState(false);
  
  // Change Password State
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
    
    import('@/services/payroll-service').then(m => m.getPayrollYears().then(years => {
        const currentYear = new NepaliDate().getYear();
        const allYears = Array.from(new Set([...years, currentYear])).sort((a,b) => b-a);
        setBsYears(allYears);
        setSelectedLockYear(String(allYears[0] || currentYear));
        setSelectedLockMonth(String(new NepaliDate().getMonth()));
    }));

    setIsLoading(false);
    return () => unsubs.forEach(u => u());
  }, []);

  const handleSaveCompanyProfile = async () => {
    if (!user) return;
    setIsSavingProfile(true);
    try {
        const updatedProfile = {
            ...companyProfile,
            lastModifiedBy: user.username,
            lastModifiedAt: new Date().toISOString()
        };
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
        const updatedProfile = {
            ...fleetProfile,
            lastModifiedBy: user.username,
            lastModifiedAt: new Date().toISOString()
        };
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
            
            setIsImporting(true);
            await importData(data);
            
            toast({
                title: 'Import Successful',
                description: 'Data has been restored from backup. The application will now reload.',
            });

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
            await addParty({...partyForm, createdBy: user.username});
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
        setAccountForm({ 
            name: account.name, 
            type: account.type, 
            ownership: account.ownership || 'Both',
            accountNumber: account.accountNumber || '', 
            bankName: account.bankName || '', 
            branch: account.branch || '', 
            bankAccountType: account.bankAccountType || 'Saving' 
        });
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
       if (accountForm.type === 'Bank' && (!accountForm.bankName || !accountForm.accountNumber)) {
          toast({ title: 'Error', description: 'Bank Name and Account Number are required.', variant: 'destructive' });
          return;
      }
      try {
          if (editingAccount) {
              await updateAccount(editingAccount.id, { ...accountForm, lastModifiedBy: user.username });
              toast({ title: 'Success', description: 'Account updated.' });
          } else {
              await addAccount({ ...accountForm, createdBy: user.username });
              toast({title: 'Success', description: 'New account added.'});
          }
          setIsAccountDialogOpen(false);
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
    if (userToEdit) {
        setEditingUser(userToEdit);
        setUserForm({ 
            username: userToEdit.username, 
            email: userToEdit.email || '', 
            isApproved: userToEdit.isApproved !== false, 
            password: '', 
            permissions: userToEdit.permissions || {} 
        });
    } else {
        setEditingUser(null);
        setUserForm({ username: '', email: '', isApproved: true, password: '', permissions: {} });
    }
    setPasswordError(null);
    setIsUserDialogOpen(true);
  };
  
  const handlePermissionChange = (module: Module, action: Action, checked: boolean) => {
    setUserForm(prev => {
        const newPermissions = { ...prev.permissions };
        if (checked) {
            newPermissions[module] = [...(newPermissions[module] || []), action];
        } else {
            newPermissions[module] = (newPermissions[module] || []).filter(a => a !== action);
        }
        return { ...prev, permissions: newPermissions };
    });
  };

  const handleUserSubmit = async () => {
    if (!user) return;
    const isEditing = !!editingUser;
    
    const { isValid, error } = validatePassword(userForm.password, !isEditing);
    if (!isValid) {
        setPasswordError(error!);
        return;
    }
    setPasswordError(null);
    setIsSubmittingUser(true);

    try {
        let finalUserId = editingUser?.id || Date.now().toString();
        
        // Use mapping-based creation for new users
        if (!isEditing) {
            const authUser = await adminCreateUserWithUsername(auth, userForm.username, userForm.email, userForm.password);
            finalUserId = authUser.uid;
        }

        const userData: User = {
            id: finalUserId,
            username: userForm.username.toLowerCase().trim(),
            email: userForm.email.toLowerCase().trim(),
            isApproved: userForm.isApproved,
            permissions: userForm.permissions,
            passwordLastUpdated: new Date().toISOString(),
        };

        if (isEditing && userForm.password) {
            // Note: Cloud password updates would typically require re-authentication 
            // or an Admin SDK. For prototype purposes, we log the intent.
            userData.password = userForm.password;
        }

        await saveUser(userData);
        toast({ title: 'Success', description: `User ${isEditing ? 'updated' : 'onboarded'}.` });
        setIsUserDialogOpen(false);
    } catch (e: any) {
        toast({ title: 'User Setup Failed', description: e.message, variant: 'destructive' });
    } finally {
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
    if (newPassword !== confirmPassword) {
        setChangePasswordError("New passwords do not match.");
        return;
    }
    const { isValid, error } = validatePassword(newPassword);
    if (!isValid) {
        setChangePasswordError(error!);
        return;
    }
    setChangePasswordError(null);

    try {
        if (user.is_admin) {
            await setAdminPassword(newPassword, new Date().toISOString());
        } else {
            const currentUser = users.find(u => u.username === user.username);
            if (currentUser) {
                await saveUser({ ...currentUser, password: newPassword, passwordLastUpdated: new Date().toISOString() });
            }
        }
        toast({ title: 'Success', description: 'Password updated. Please log in again.' });
        setIsChangePasswordDialogOpen(false);
        await logout();

    } catch(e: any) {
        setChangePasswordError(e.message);
    }
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
    const total = pageVisits.reduce((sum, v) => sum + v.count, 0);
    const sorted = [...pageVisits].sort((a, b) => b.count - a.count);
    const top5 = sorted.slice(0, 5);
    return { total, top5 };
  }, [pageVisits]);

  const filteredDetailedUsage = useMemo(() => {
    let filtered = [...pageVisits];
    if (usageSearch) filtered = filtered.filter(v => v.path.toLowerCase().includes(usageSearch.toLowerCase()));
    if (usageFilterYear !== 'All') filtered = filtered.filter(v => new Date(v.lastVisited).getFullYear() === parseInt(usageFilterYear));
    if (usageFilterMonth !== 'All') filtered = filtered.filter(v => new Date(v.lastVisited).getMonth() === parseInt(usageFilterMonth));
    filtered.sort((a, b) => {
        const aVal = a[usageSortConfig.key];
        const bVal = b[usageSortConfig.key];
        if (aVal < bVal) return usageSortConfig.dir === 'asc' ? -1 : 1;
        if (aVal > bVal) return usageSortConfig.dir === 'asc' ? 1 : -1;
        return 0;
    });
    return filtered;
  }, [pageVisits, usageSearch, usageSortConfig, usageFilterYear, usageFilterMonth]);

  const handleUsageSort = (key: 'count' | 'path' | 'lastVisited') => {
    setUsageSortConfig(prev => ({ key, dir: prev.key === key && prev.dir === 'desc' ? 'asc' : 'desc' }));
  };

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
                                                        <DropdownMenuItem onSelect={() => openUserDialog(u)}><Edit className="mr-2 h-4 w-4" /> Edit Access</DropdownMenuItem>
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
                                    <p className="text-[10px] text-muted-foreground italic">Displayed in the sidebar, browser tab, and login screen.</p>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="app-motto" className="text-xs font-black uppercase text-muted-foreground tracking-widest">Mission Statement / Tagline</Label>
                                    <Input id="app-motto" value={appBranding.appMotto || ''} onChange={e => setAppBranding(prev => ({ ...prev, appMotto: e.target.value }))} className="h-10 border-gray-300" placeholder="e.g. Operational Intelligence Simplified" />
                                </div>
                            </div>
                            <div className="p-8 rounded-2xl bg-muted/20 border-2 border-dashed border-gray-200 flex flex-col items-center justify-center text-center space-y-4">
                                <div className="p-4 bg-white rounded-2xl shadow-sm border border-gray-100">
                                    <img src={logo.src} className="w-16 h-16 object-contain opacity-50 grayscale" alt="Preview"/>
                                </div>
                                <div>
                                    <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Logo Placeholder</p>
                                    <p className="text-xs text-muted-foreground max-w-[200px] mt-1">Application logo is currently hardcoded for system stability.</p>
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
                            <CardDescription className="text-[10px] font-bold uppercase text-muted-foreground">Identity for Production Reports, Payslips, and Finance.</CardDescription>
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
                            <div className="grid grid-cols-2 gap-4 col-span-2">
                                <div className="space-y-1.5"><Label className="text-[10px] uppercase font-bold text-muted-foreground">PAN / VAT Number</Label><Input value={companyProfile.pan || ''} onChange={e => setCompanyProfile(prev => ({...prev, pan: e.target.value}))} className="h-9 font-mono" /></div>
                                <div className="space-y-1.5"><Label className="text-[10px] uppercase font-bold text-muted-foreground">Contact Phone</Label><Input value={companyProfile.phone || ''} onChange={e => setCompanyProfile(prev => ({...prev, phone: e.target.value}))} className="h-9" /></div>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="shadow-sm border-gray-100 overflow-hidden border-l-4 border-l-blue-600">
                    <CardHeader className="flex flex-row items-center justify-between bg-blue-50/10 py-4 px-6 border-b">
                        <div className="space-y-1">
                            <CardTitle className="text-lg font-black tracking-tight">Fleet (Logistics) Profile</CardTitle>
                            <CardDescription className="text-[10px] font-bold uppercase text-muted-foreground">Identity for Sijan Dhuwani Reports and Vouchers.</CardDescription>
                        </div>
                        <Button onClick={handleSaveFleetProfile} disabled={isSavingFleetProfile} variant="outline" className="h-9 px-6 font-bold text-xs uppercase tracking-widest border-blue-200 hover:bg-blue-50">
                            {isSavingFleetProfile ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                            Update
                        </Button>
                    </CardHeader>
                    <CardContent className="p-6">
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-1.5"><Label className="text-[10px] uppercase font-bold text-muted-foreground">Fleet Name (English)</Label><Input value={fleetProfile.nameEn || ''} onChange={e => setFleetProfile(prev => ({...prev, nameEn: e.target.value}))} className="h-9" /></div>
                            <div className="space-y-1.5"><Label className="text-[10px] uppercase font-bold text-muted-foreground">सिजन ढुवानी (Nepali)</Label><Input value={fleetProfile.nameNp || ''} onChange={e => setFleetProfile(prev => ({...prev, nameNp: e.target.value}))} className="h-9 font-medium" /></div>
                            <div className="space-y-1.5 md:col-span-2"><Label className="text-[10px] uppercase font-bold text-muted-foreground">Logistics Address</Label><Input value={fleetProfile.address || ''} onChange={e => setFleetProfile(prev => ({...prev, address: e.target.value}))} className="h-9" /></div>
                            <div className="grid grid-cols-2 gap-4 col-span-2">
                                <div className="space-y-1.5"><Label className="text-[10px] uppercase font-bold text-muted-foreground">Fleet PAN</Label><Input value={fleetProfile.pan || ''} onChange={e => setFleetProfile(prev => ({...prev, pan: e.target.value}))} className="h-9 font-mono" /></div>
                                <div className="space-y-1.5"><Label className="text-[10px] uppercase font-bold text-muted-foreground">Support Line</Label><Input value={fleetProfile.phone || ''} onChange={e => setFleetProfile(prev => ({...prev, phone: e.target.value}))} className="h-9" /></div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </TabsContent>
            
            <TabsContent value="parties">
                <Card className="shadow-sm border-gray-100 bg-white">
                    <CardHeader className="flex flex-row items-center justify-between py-4 border-b">
                        <div><CardTitle className="text-base font-black uppercase">Vendor & Supplier Ledger</CardTitle><CardDescription className="text-xs">Master database for all trading partners.</CardDescription></div>
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
                                    <TableHead>Account Category</TableHead>
                                    <TableHead>System Group</TableHead>
                                    <TableHead>Address</TableHead>
                                    <TableHead className="text-right pr-6">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                            {filteredParties.map(party => (
                                <TableRow key={party.id} className="h-12 border-b-gray-100">
                                    <TableCell className="font-bold pl-6 text-gray-900">{party.name}</TableCell>
                                    <TableCell><Badge variant="secondary" className="text-[9px] uppercase font-black">{party.type}</Badge></TableCell>
                                    <TableCell><Badge variant="outline" className="text-[9px] uppercase font-black border-blue-200 text-blue-700 bg-blue-50/50">{party.ownership}</Badge></TableCell>
                                    <TableCell className="text-muted-foreground max-w-[200px] truncate">{party.address}</TableCell>
                                    <TableCell className="text-right pr-6">
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                                            <DropdownMenuContent align="end" className="w-48">
                                                <DropdownMenuItem onSelect={() => openPartyDialog(party)} className="text-xs">Edit Detail</DropdownMenuItem>
                                                <DropdownMenuSeparator />
                                                <AlertDialog>
                                                    <AlertDialogTrigger asChild>
                                                        <DropdownMenuItem onSelect={e => e.preventDefault()} className="text-destructive text-xs">Purge Partner</DropdownMenuItem>
                                                    </AlertDialogTrigger>
                                                    <AlertDialogContent>
                                                        <AlertDialogHeader>
                                                            <AlertDialogTitle>Confirm Purge</AlertDialogTitle>
                                                            <AlertDialogDescription>This removes the record permanently. Historical ledger entries may lose link integrity.</AlertDialogDescription>
                                                        </AlertDialogHeader>
                                                        <AlertDialogFooter>
                                                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                            <AlertDialogAction onClick={() => handleDeleteParty(party.id)} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction>
                                                        </AlertDialogFooter>
                                                    </AlertDialogContent>
                                                </AlertDialog>
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
                        <div><CardTitle className="text-base font-black uppercase">Financial Accounts</CardTitle><CardDescription className="text-xs">Manage cash and bank repositories.</CardDescription></div>
                        <Button size="sm" onClick={() => openAccountDialog()} className="h-8 uppercase font-black text-[10px] tracking-widest"><Plus className="mr-2 h-3.5 w-3.5" /> Add Account</Button>
                    </CardHeader>
                    <CardContent className="p-0">
                        <Table className="text-xs"><TableHeader className="bg-muted/50"><TableRow><TableHead className="pl-6">Account Identity</TableHead><TableHead>Type</TableHead><TableHead>System Group</TableHead><TableHead>Account # / Bank</TableHead><TableHead className="text-right pr-6">Actions</TableHead></TableRow></TableHeader><TableBody>
                        {filteredAccounts.map(acc => (
                            <TableRow key={acc.id} className="h-12 border-b-gray-100"><TableCell className="font-bold pl-6 text-gray-900">{acc.name}</TableCell><TableCell><Badge variant="outline" className="text-[9px] uppercase font-bold">{acc.type}</Badge></TableCell><TableCell><Badge className="text-[9px] uppercase font-bold">{acc.ownership}</Badge></TableCell><TableCell className="font-mono text-[10px]">{acc.accountNumber || (acc.type === 'Cash' ? 'Physical Safe' : '-')}</TableCell><TableCell className="text-right pr-6 space-x-1">
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
                        <div><CardTitle className="text-base font-black uppercase">Units of Measurement</CardTitle><CardDescription className="text-xs">Master list for stock and sales quantities.</CardDescription></div>
                        <Button size="sm" onClick={() => openUomDialog()} className="h-8 uppercase font-black text-[10px] tracking-widest"><Plus className="mr-2 h-3.5 w-3.5" /> New Unit</Button>
                    </CardHeader>
                    <CardContent className="p-0">
                        <Table className="text-xs"><TableHeader className="bg-muted/50"><TableRow><TableHead className="pl-6">Description</TableHead><TableHead>Code / Abbreviation</TableHead><TableHead className="text-right pr-6">Actions</TableHead></TableRow></TableHeader><TableBody>
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
                    <CardHeader className="bg-muted/10 border-b py-4 px-6"><CardTitle className="text-sm font-black uppercase">ERP Logic Prefixes</CardTitle><CardDescription className="text-xs">Control automatic sequence numbering per document type.</CardDescription></CardHeader>
                    <CardContent className="p-0">
                        <Table className="text-xs"><TableHeader className="bg-muted/50"><TableRow><TableHead className="pl-6">Document Class</TableHead><TableHead>System Prefix</TableHead><TableHead className="text-right pr-6">Actions</TableHead></TableRow></TableHeader><TableBody>
                        {documentTypes.map(t => (<TableRow key={t} className="h-12"><TableCell className="font-bold pl-6">{getDocumentName(t)}</TableCell><TableCell className="font-mono text-blue-600 font-black">{prefixes[t] || '(Not Set - Using Defaults)'}</TableCell><TableCell className="text-right pr-6"><Button variant="outline" size="sm" className="h-7 text-[10px] uppercase font-black" onClick={() => handleOpenPrefixDialog(t)}>Configure</Button></TableCell></TableRow>))}
                    </TableBody></Table></CardContent>
                </Card>
            </TabsContent>

            <TabsContent value="payroll-settings">
                <Card className="shadow-sm border-gray-100 border-l-4 border-l-amber-500 overflow-hidden">
                    <CardHeader className="bg-amber-50/50 py-4 px-6 border-b">
                        <div className="flex items-center gap-3">
                            <ShieldAlert className="h-5 w-5 text-amber-600"/>
                            <div><CardTitle className="text-sm font-black uppercase">Payroll Guardrails</CardTitle><CardDescription className="text-xs">Lock finalized monthly cycles to prevent accidental data manipulation.</CardDescription></div>
                        </div>
                    </CardHeader>
                    <CardContent className="p-6">
                        <div className="flex flex-wrap gap-4 items-end bg-white p-4 rounded-xl border-2 border-dashed border-amber-200">
                            <div className="space-y-1.5"><Label className="text-[10px] uppercase font-bold text-muted-foreground">Target BS Year</Label><Select value={selectedLockYear} onValueChange={setSelectedLockYear}><SelectTrigger className="w-[120px] h-9"><SelectValue /></SelectTrigger><SelectContent>{bsYears.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent></Select></div>
                            <div className="space-y-1.5"><Label className="text-[10px] uppercase font-bold text-muted-foreground">Target BS Month</Label><Select value={selectedLockMonth} onValueChange={setSelectedLockMonth}><SelectTrigger className="w-[150px] h-9"><SelectValue /></SelectTrigger><SelectContent>{NEPALI_MONTHS.map(m => <SelectItem key={m.value} value={String(m.value)}>{m.name}</SelectItem>)}</SelectContent></Select></div>
                            <Button onClick={handleTogglePayrollLock} variant={isCurrentPeriodLocked ? 'destructive' : 'default'} className="h-9 px-8 font-black text-xs uppercase">
                                {isCurrentPeriodLocked ? <Lock className="mr-2 h-4 w-4"/> : <ShieldCheck className="mr-2 h-4 w-4"/>}
                                {isCurrentPeriodLocked ? 'Unlock Period' : 'Freeze & Lock Cycle'}
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </TabsContent>

            <TabsContent value="usage-analytics">
                <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <Card className="bg-primary shadow-lg border-none text-primary-foreground"><CardHeader className="pb-2"><CardTitle className="text-[10px] uppercase font-black tracking-widest opacity-70">Total System Interactions</CardTitle></CardHeader><CardContent><div className="text-3xl font-black">{usageStats.total.toLocaleString()}</div><p className="text-[10px] font-bold mt-2 uppercase">Aggregated page loads</p></CardContent></Card>
                        <Card className="md:col-span-2 shadow-sm border-gray-100 bg-white overflow-hidden">
                            <CardHeader className="py-3 px-6 border-b bg-muted/30"><CardTitle className="text-xs font-black uppercase text-gray-900 tracking-wider">Module Traffic Hierarchy</CardTitle></CardHeader>
                            <CardContent className="p-0">
                                <Table className="text-[10px]"><TableHeader className="bg-muted/50"><TableRow className="hover:bg-transparent"><TableHead onClick={() => handleUsageSort('path')} className="cursor-pointer font-bold pl-6">Relative Path</TableHead><TableHead onClick={() => handleUsageSort('count')} className="cursor-pointer text-center font-bold">Frequency</TableHead><TableHead onClick={() => handleUsageSort('lastVisited')} className="cursor-pointer text-right pr-6 font-bold">Last Accessed</TableHead></TableRow></TableHeader><TableBody>
                                    {filteredDetailedUsage.map(v => (<TableRow key={v.id} className="h-10 transition-colors hover:bg-gray-50"><TableCell className="font-mono text-[11px] font-bold text-blue-900 pl-6">{v.path}</TableCell><TableCell className="text-center font-black">{v.count}</TableCell><TableCell className="text-right text-[10px] text-muted-foreground pr-6">{format(new Date(v.lastVisited), "PPp")}</TableCell></TableRow>))}
                                </TableBody></Table>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </TabsContent>

            <TabsContent value="system-logs">
                <Card className="shadow-sm border-gray-100 bg-white overflow-hidden">
                    <CardHeader className="py-4 px-6 border-b bg-red-50/10 flex flex-row items-center justify-between"><div className="space-y-1"><CardTitle className="text-sm font-black uppercase text-gray-900">Incident Audit Log</CardTitle><CardDescription className="text-xs font-medium">Real-time capturing of application exceptions and fault events.</CardDescription></div><Badge variant="destructive" className="h-5 uppercase text-[9px] font-black">{logs.length} Recent Events</Badge></CardHeader>
                    <CardContent className="p-0">
                        <Table className="text-[10px]"><TableHeader className="bg-muted/50"><TableRow className="hover:bg-transparent"><TableHead className="pl-6 font-bold">Time</TableHead><TableHead className="font-bold">Module Scope</TableHead><TableHead className="font-bold">Exception Message</TableHead><TableHead className="text-right pr-6 font-bold">Diagnostics</TableHead></TableRow></TableHeader><TableBody>
                        {logs.map(log => (<TableRow key={log?.id || generateId()} className="h-12 border-b-gray-50"><TableCell className="text-gray-500 pl-6 font-mono">{log?.timestamp ? format(new Date(log.timestamp), 'HH:mm:ss') : '-'}</TableCell><TableCell><Badge variant="outline" className="text-[9px] font-black uppercase border-red-100 text-red-600 bg-red-50/50">{log?.module || 'Global'}</Badge></TableCell><TableCell className="font-medium text-gray-900 truncate max-w-sm">{log?.message || 'Undefined Exception'}</TableCell><TableCell className="text-right pr-6">
                            <Dialog><DialogTrigger asChild><Button variant="ghost" size="sm" className="h-7 text-[9px] uppercase font-black text-blue-600">Inspect Stack</Button></DialogTrigger><DialogContent className="max-w-3xl overflow-hidden flex flex-col h-[70vh]"><DialogHeader><DialogTitle className="text-red-600">Exception Data Dump</DialogTitle></DialogHeader><div className="flex-1 overflow-auto bg-slate-950 p-6 rounded-xl border border-white/5"><pre className="text-[10px] text-green-400 font-mono leading-relaxed">{log?.stack || log?.message || 'No stack trace available for this event.'}</pre></div><DialogFooter><div className="text-[10px] text-muted-foreground mr-auto">Event ID: {log.id}</div><Button variant="outline" onClick={() => {}} className="h-9 px-6 text-xs font-bold">Acknowledge</Button></DialogFooter></DialogContent></Dialog>
                        </TableCell></TableRow>))}
                        {logs.length === 0 && <TableRow><TableCell colSpan={4} className="h-40 text-center text-muted-foreground italic">System health stable. No recent exceptions found.</TableCell></TableRow>}
                        </TableBody></Table>
                    </CardContent>
                </Card>
            </TabsContent>
        </Tabs>
        
        {/* Core Settings Dialogs */}
        <Dialog open={isUserDialogOpen} onOpenChange={setIsUserDialogOpen}>
          <DialogContent className="sm:max-w-4xl max-h-[95vh] flex flex-col p-0 overflow-hidden shadow-2xl border-none">
            <DialogHeader className="p-6 pb-2 border-b bg-muted/5 shrink-0">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary/10 rounded-xl">
                        <UserIcon className="h-6 w-6 text-primary"/>
                    </div>
                    <div>
                        <DialogTitle className="text-2xl font-black text-gray-900 tracking-tight">{editingUser ? 'Account Configuration' : 'Cloud Onboarding'}</DialogTitle>
                        <DialogDescription className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Manage system credentials and assigned access privileges.</DialogDescription>
                    </div>
                </div>
            </DialogHeader>

            <ScrollArea className="flex-1 p-6 bg-gray-50/30">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* User Identity Column */}
                    <div className="lg:col-span-1 space-y-6">
                        <div className="space-y-4">
                            <h3 className="text-[10px] font-black uppercase text-muted-foreground tracking-[0.2em] border-b pb-2">User Identity</h3>
                            <div className="space-y-4 p-5 rounded-2xl bg-white border shadow-sm">
                                <div className="space-y-1.5">
                                    <Label className="text-[10px] uppercase font-bold text-muted-foreground">Unique Username</Label>
                                    <div className="relative">
                                        <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                        <Input value={userForm.username || ''} onChange={e => setUserForm(p => ({...p, username: e.target.value}))} disabled={!!editingUser} className="h-10 bg-white pl-10 font-bold" placeholder="e.g. diwas" />
                                    </div>
                                    {!editingUser && <p className="text-[9px] text-muted-foreground italic">Once set, usernames cannot be changed.</p>}
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-[10px] uppercase font-bold text-muted-foreground">Master Email</Label>
                                    <div className="relative">
                                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                        <Input value={userForm.email || ''} onChange={e => setUserForm(p => ({...p, email: e.target.value}))} className="h-10 bg-white pl-10" placeholder="e.g. diwas@starsutra.com" />
                                    </div>
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-[10px] uppercase font-bold text-muted-foreground">Cloud Password</Label>
                                    <div className="relative">
                                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                        <Input type="password" value={userForm.password || ''} onChange={e => setUserForm(p => ({...p, password: e.target.value}))} className="h-10 bg-white pl-10" placeholder={editingUser ? "••••••••" : "Min 8 chars"} />
                                    </div>
                                    {passwordError && <p className="text-[9px] text-red-600 font-black uppercase mt-1 animate-pulse">{passwordError}</p>}
                                </div>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <h3 className="text-[10px] font-black uppercase text-muted-foreground tracking-[0.2em] border-b pb-2">Status & Verification</h3>
                            <div className="flex items-center justify-between bg-white p-5 rounded-2xl border shadow-sm">
                                <div className="space-y-0.5">
                                    <p className="text-xs font-black text-gray-900 uppercase">Administrator Approved</p>
                                    <p className="text-[9px] text-muted-foreground font-bold uppercase">Enable cloud login</p>
                                </div>
                                <Switch checked={userForm.isApproved} onCheckedChange={v => setUserForm(p => ({...p, isApproved: v}))} />
                            </div>
                        </div>
                    </div>

                    {/* Access Control Column */}
                    <div className="lg:col-span-2 space-y-4">
                        <div className="flex items-center justify-between border-b pb-2">
                            <h3 className="text-[10px] font-black uppercase text-muted-foreground tracking-[0.2em]">Module-Based Access Control</h3>
                            <div className="flex gap-2">
                                <Button variant="ghost" size="sm" onClick={() => {
                                    const allPerms: Permissions = {};
                                    modules.filter(m => m !== 'dashboard').forEach(m => { allPerms[m] = [...actions]; });
                                    setUserForm(p => ({...p, permissions: allPerms}));
                                }} className="h-6 text-[9px] font-black uppercase bg-primary/10 text-primary">Grant Total Access</Button>
                                <Button variant="ghost" size="sm" onClick={() => setUserForm(p => ({...p, permissions: {}}))} className="h-6 text-[9px] font-black uppercase bg-red-50 text-red-600">Clear All</Button>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {modules.filter(m => m !== 'dashboard').map(m => (
                                <div key={m} className={cn(
                                    "p-4 rounded-2xl border-2 transition-all duration-300",
                                    (userForm.permissions[m]?.length || 0) > 0 
                                        ? "border-primary/40 bg-white shadow-md ring-1 ring-primary/10" 
                                        : "border-gray-100 bg-gray-50/50 opacity-60"
                                )}>
                                    <div className="flex items-center justify-between mb-4">
                                        <div className="flex items-center gap-2">
                                            <div className="p-1.5 bg-muted rounded-lg">{getModuleIcon(m)}</div>
                                            <div className="space-y-0.5">
                                                <Label className="font-black text-xs uppercase tracking-tight text-gray-900">{getModuleDisplayName(m)}</Label>
                                                <p className="text-[9px] text-muted-foreground font-bold uppercase tracking-widest opacity-50">{m}</p>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                                        {actions.map(a => (
                                            <div key={a} className="flex items-center space-x-2.5 group/act">
                                                <Checkbox 
                                                    id={`${m}-${a}`} 
                                                    checked={userForm.permissions[m]?.includes(a)} 
                                                    onCheckedChange={v => handlePermissionChange(m, a, !!v)} 
                                                    className="h-4 w-4 rounded-md border-gray-300"
                                                />
                                                <label 
                                                    htmlFor={`${m}-${a}`} 
                                                    className="text-[11px] font-bold capitalize text-gray-600 cursor-pointer group-hover/act:text-primary transition-colors"
                                                >
                                                    {a}
                                                </label>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </ScrollArea>

            <DialogFooter className="p-6 bg-white border-t shrink-0 shadow-2xl">
                <Button variant="outline" onClick={() => setIsUserDialogOpen(false)} className="h-10 px-8 font-bold text-xs uppercase border-gray-300">Cancel</Button>
                <Button onClick={handleUserSubmit} disabled={isSubmittingUser || !userForm.username} className="h-10 px-10 font-black text-xs uppercase tracking-widest shadow-xl shadow-primary/20">
                    {isSubmittingUser ? <Loader2 className="animate-spin h-4 w-4 mr-2"/> : <Save className="mr-2 h-4 w-4"/>}
                    Finalize Account Access
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
                <DialogHeader><DialogTitle className="text-lg font-black uppercase">Prefix Configuration</DialogTitle><DialogDescription className="text-xs">Configure the prefix for {editingPrefix ? getDocumentName(editingPrefix.key) : ''} sequence.</DialogDescription></DialogHeader>
                <div className="py-6 space-y-4">
                    <div className="space-y-2"><Label className="text-[10px] uppercase font-bold text-muted-foreground">System Prefix String</Label><Input value={editingPrefix?.value || ''} onChange={e => setEditingPrefix(p => p ? {...p, value: e.target.value} : null)} className="h-12 text-lg font-mono font-bold text-blue-700" placeholder="e.g. INV-" /></div>
                    <p className="text-[10px] text-muted-foreground bg-muted/50 p-3 rounded-lg leading-relaxed">Sequence changes apply only to **newly created** documents. Audit trail integrity is maintained for existing records.</p>
                </div>
                <DialogFooter><Button variant="outline" onClick={() => setIsPrefixDialogOpen(false)} className="h-10">Cancel</Button><Button onClick={handleSavePrefix} className="h-10 font-bold px-8">Save Change</Button></DialogFooter>
            </DialogContent>
        </Dialog>

        <Dialog open={isPartyDialogOpen} onOpenChange={setIsPartyDialogOpen}>
            <DialogContent>
                <DialogHeader><DialogTitle>{editingParty ? 'Edit Partner Detail' : 'Onboard Trading Partner'}</DialogTitle></DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="space-y-2"><Label>Entity Name</Label><Input value={partyForm.name} onChange={e => setPartyForm({...partyForm, name: e.target.value})} /></div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2"><Label>Account Category</Label>
                            <Select value={partyForm.type} onValueChange={(v: PartyType) => setPartyForm({...partyForm, type: v})}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent><SelectItem value="Vendor">Vendor / Service Provider</SelectItem><SelectItem value="Customer">Customer / Client</SelectItem><SelectItem value="Both">Strategic Partner (Both)</SelectItem><SelectItem value="Tenant">Real Estate Tenant</SelectItem></SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2"><Label>System Group</Label>
                            <Select value={partyForm.ownership} onValueChange={(v: AccountOwnership) => setPartyForm({...partyForm, ownership: v})}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent><SelectItem value="Sijan">Sijan Dhuwani</SelectItem><SelectItem value="Shivam">Shivam Packaging</SelectItem><SelectItem value="Rental">Rental Assets</SelectItem><SelectItem value="Both">Shared / General</SelectItem></SelectContent>
                            </Select>
                        </div>
                    </div>
                    <div className="space-y-2"><Label>PAN / VAT #</Label><Input value={partyForm.panNumber || ''} onChange={e => setPartyForm({...partyForm, panNumber: e.target.value})} /></div>
                    <div className="space-y-2"><Label>Address</Label><Textarea value={partyForm.address || ''} onChange={e => setPartyForm({...partyForm, address: e.target.value})} className="min-h-[60px]" /></div>
                </div>
                <DialogFooter><Button onClick={handlePartySubmit} className="w-full">Finalize Partner Record</Button></DialogFooter>
            </DialogContent>
        </Dialog>

        <Dialog open={isAccountDialogOpen} onOpenChange={setIsAccountDialogOpen}>
            <DialogContent>
                <DialogHeader><DialogTitle>{editingAccount ? 'Edit Account Repository' : 'Define New Account'}</DialogTitle></DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="space-y-2"><Label>Account Description</Label><Input value={accountForm.name} onChange={e => setAccountForm({...accountForm, name: e.target.value})} placeholder="e.g. Main Checking" /></div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2"><Label>Class</Label>
                            <Select value={accountForm.type} onValueChange={(v: AccountType) => setAccountForm({...accountForm, type: v})}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent><SelectItem value="Cash">Physical Cash</SelectItem><SelectItem value="Bank">Bank Deposit</SelectItem></SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2"><Label>System Scope</Label>
                            <Select value={accountForm.ownership} onValueChange={(v: AccountOwnership) => setAccountForm({...accountForm, ownership: v})}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent><SelectItem value="Sijan">Logistics</SelectItem><SelectItem value="Shivam">Manufacturing</SelectItem><SelectItem value="Rental">Rental Operations</SelectItem><SelectItem value="Both">General / Group</SelectItem></SelectContent>
                            </Select>
                        </div>
                    </div>
                    {accountForm.type === 'Bank' && (
                        <div className="grid grid-cols-1 gap-4 animate-in slide-in-from-top-2">
                            <div className="space-y-2"><Label>Financial Institution</Label><Input value={accountForm.bankName || ''} onChange={e => setAccountForm({...accountForm, bankName: e.target.value})} /></div>
                            <div className="space-y-2"><Label>Account Serial Number</Label><Input value={accountForm.accountNumber || ''} onChange={e => setAccountForm({...accountForm, accountNumber: e.target.value})} className="font-mono" /></div>
                        </div>
                    )}
                </div>
                <DialogFooter><Button onClick={handleAccountSubmit} className="w-full">Commit Account Configuration</Button></DialogFooter>
            </DialogContent>
        </Dialog>

        <Dialog open={isUomDialogOpen} onOpenChange={setIsUomDialogOpen}>
            <DialogContent>
                <DialogHeader><DialogTitle>Unit Measurement Configuration</DialogTitle></DialogHeader>
                <div className="space-y-4 py-4">
                    <div className="space-y-2"><Label>Unit Full Name</Label><Input value={uomForm.name} onChange={e => setUomForm({...uomForm, name: e.target.value})} placeholder="e.g. Kilograms" /></div>
                    <div className="space-y-2"><Label>ERP Abbreviation</Label><Input value={uomForm.abbreviation} onChange={e => setUomForm({...uomForm, abbreviation: e.target.value})} placeholder="e.g. KG" /></div>
                </div>
                <DialogFooter><Button onClick={handleUomSubmit} className="w-full">Save Unit</Button></DialogFooter>
            </DialogContent>
        </Dialog>

        <MergePartiesDialog open={isMergeDialogOpen} onOpenChange={setIsMergeDialogOpen} parties={parties} onMerge={handleMergePartiesInternal} />
    </div>
  );
}
