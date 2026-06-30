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
  Lock, 
  Unlock, 
  GitMerge, 
  Check, 
  ArrowUpDown, 
  TrendingDown, 
  TrendingUp,
  Loader2,
  Eye,
  AlertCircle,
  X,
  ImageIcon,
  Link as LinkIcon
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
import { onLogsUpdate, type SystemLog, logError } from '@/services/log-service';
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
    getUsers, 
    setUsers, 
    validatePassword, 
    setAdminPassword, 
    updateUserPassword 
} from '@/services/user-service';
import { modules, actions, documentTypes, getDocumentName } from '@/lib/types';
import { Checkbox } from '@/components/ui/checkbox';
import { exportData, importData } from '@/services/backup-service';
import { useRouter } from 'next/navigation';
import { getPayrollYears } from '@/services/payroll-service';
import NepaliDate from 'nepali-date-converter';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn, toNepaliDate } from '@/lib/utils';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { NEPALI_MONTHS, DEFAULT_COMPANY_PROFILE, DEFAULT_FLEET_PROFILE } from '@/lib/constants';
import { uploadFile } from '@/services/storage-service';

function MergePartiesDialog({ open, onOpenChange, parties, onMerge }: { open: boolean, onOpenChange: (open: boolean) => void, parties: Party[], onMerge: (sourceId: string, destinationId: string) => void }) {
    const [sourceId, setSourceId] = useState<string>('');
    const [destinationId, setDestinationId] = useState<string>('');
    const [isMerging, setIsMerging] = useState(false);
    
    const sourceParty = parties.find(p => p.id === sourceId);
    const destinationParty = parties.find(p => p.id === destinationId);

    const handleMergeClick = async () => {
        setIsMerging(true);
        await onMerge(sourceId, destinationId);
        setIsMerging(false);
        onOpenChange(false);
        setSourceId('');
        setDestinationId('');
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Merge Duplicate Parties</DialogTitle>
                    <DialogDescription>
                        Select a party to merge and a party to merge into. The first party will be deleted, and all its associated records will be reassigned to the second party. This action cannot be undone.
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
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  
  const [parties, setParties] = useState<Party[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [uoms, setUoms] = useState<UnitOfMeasurement[]>([]);
  const [users, setUsersState] = useState<User[]>([]);
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
  const mainLogoInputRef = useRef<HTMLInputElement>(null);

  // Fleet Profile States
  const [fleetProfile, setFleetProfile] = useState<CompanyProfile>(DEFAULT_FLEET_PROFILE);
  const [isSavingFleetProfile, setIsSavingFleetProfile] = useState(false);
  const fleetLogoInputRef = useRef<HTMLInputElement>(null);

  // App Branding States
  const [appBranding, setAppBranding] = useState<AppBranding>({ appName: 'StarSutra', appMotto: '', appLogoURL: '' });
  const [isSavingBranding, setIsSavingBranding] = useState(false);
  const appLogoInputRef = useRef<HTMLInputElement>(null);

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
  const [userForm, setUserForm] = useState({ username: '', password: '', permissions: {} as Permissions });
  const [passwordError, setPasswordError] = useState<string | null>(null);
  
  // Change Password State
  const [isChangePasswordDialogOpen, setIsChangePasswordDialogOpen] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changePasswordError, setChangePasswordError] = useState<string | null>(null);

  useEffect(() => {
    setIsLoading(true);
    const unsubParties = onPartiesUpdate(setParties);
    const unsubAccounts = onAccountsUpdate(setAccounts);
    const unsubUoms = onUomsUpdate(setUoms);
    const unsubPrefixes = onSettingUpdate('documentPrefixes', (setting) => setPrefixes(setting?.value || {}));
    const unsubPayrollLocks = onSettingUpdate('payrollLocks', (setting) => setPayrollLocks(setting?.value || {}));
    const unsubCompanyProfile = onSettingUpdate('companyProfile', (setting) => setCompanyProfile(setting?.value || DEFAULT_COMPANY_PROFILE));
    const unsubFleetProfile = onSettingUpdate('fleetCompanyProfile', (setting) => setFleetProfile(setting?.value || DEFAULT_FLEET_PROFILE));
    const unsubAppBranding = onSettingUpdate('appBranding', (setting) => setAppBranding(setting?.value || { appName: 'StarSutra', appMotto: '', appLogoURL: '' }));
    const unsubUsage = onPageVisitsUpdate(setPageVisits);
    const unsubLogs = onLogsUpdate(setLogs);
    
    getPayrollYears().then(years => {
        const currentYear = new NepaliDate().getYear();
        const allYears = Array.from(new Set([...years, currentYear])).sort((a,b) => b-a);
        setBsYears(allYears);
        setSelectedLockYear(String(allYears[0] || currentYear));
        setSelectedLockMonth(String(new NepaliDate().getMonth()));
    });

    const handleStorageChange = () => setUsersState(getUsers());
    window.addEventListener('storage', handleStorageChange);
    handleStorageChange();

    setIsLoading(false);
    return () => {
        unsubParties();
        unsubAccounts();
        unsubUoms();
        unsubPrefixes();
        unsubPayrollLocks();
        unsubCompanyProfile();
        unsubFleetProfile();
        unsubAppBranding();
        unsubUsage();
        unsubLogs();
        window.removeEventListener('storage', handleStorageChange);
    }
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

  const handleLogoUpload = async (file: File, type: 'main' | 'fleet' | 'app') => {
      if (!user) return;
      try {
          const timestamp = Date.now();
          const path = `branding/${type}-logo-${timestamp}`;
          const url = await uploadFile(file, path);
          
          const finalUrl = url.includes('?') ? `${url}&t=${timestamp}` : `${url}?t=${timestamp}`;
          
          if (type === 'main') {
              const updated = { ...companyProfile, logoURL: finalUrl };
              setCompanyProfile(updated);
              await setSetting('companyProfile', updated);
          } else if (type === 'fleet') {
              const updated = { ...fleetProfile, logoURL: finalUrl };
              setFleetProfile(updated);
              await setSetting('fleetCompanyProfile', updated);
          } else if (type === 'app') {
              const updated = { ...appBranding, appLogoURL: finalUrl };
              setAppBranding(updated);
              await setSetting('appBranding', updated);
          }
          
          toast({ title: "Logo Updated", description: "The branding has been successfully updated." });
      } catch (error: any) {
          console.error("Logo upload error:", error);
          logError(error, "Settings - Logo Upload");
          toast({ title: "Upload Failed", description: "Try using the URL input instead if Storage is restricted.", variant: 'destructive' });
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

  const handleMergeParties = async (sourceId: string, destinationId: string) => {
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
        setUserForm({ username: userToEdit.username, password: '', permissions: userToEdit.permissions || {} });
    } else {
        setEditingUser(null);
        setUserForm({ username: '', password: '', permissions: {} });
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

  const handleUserSubmit = () => {
    const isEditing = !!editingUser;
    const { isValid, error } = validatePassword(userForm.password, !isEditing);
    if (!isValid) {
        setPasswordError(error!);
        return;
    }
    setPasswordError(null);

    const allUsers = getUsers();
    if (!isEditing && allUsers.some(u => u.username.toLowerCase() === userForm.username.toLowerCase())) {
        toast({ title: 'Error', description: 'Username already exists.', variant: 'destructive' });
        return;
    }

    let updatedUsers: User[];
    if (isEditing) {
        updatedUsers = allUsers.map(u => {
            if (u.id === editingUser.id) {
                const updatedUser: User = { ...u, username: userForm.username, permissions: userForm.permissions };
                if (userForm.password) {
                    updatedUser.password = userForm.password;
                    updatedUser.passwordLastUpdated = new Date().toISOString();
                }
                return updatedUser;
            }
            return u;
        });
    } else {
        const newUser: User = {
            id: Date.now().toString(),
            username: userForm.username,
            password: userForm.password,
            permissions: userForm.permissions,
            passwordLastUpdated: new Date().toISOString(),
        };
        updatedUsers = [...allUsers, newUser];
    }
    
    setUsers(updatedUsers);
    toast({ title: 'Success', description: `User ${isEditing ? 'updated' : 'created'}.` });
    setIsUserDialogOpen(false);
  };

  const filteredUsers = useMemo(() => {
    const allUsers = getUsers();
    return allUsers.filter(u => u.username.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [users, searchQuery]);

  const handleDeleteUser = (id: string) => {
      const updatedUsers = getUsers().filter(u => u.id !== id);
      setUsers(updatedUsers);
      toast({ title: 'Success', description: 'User deleted.' });
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
            setAdminPassword(newPassword, new Date().toISOString());
        } else {
            const currentUser = getUsers().find(u => u.username === user.username);
            if (currentUser) {
                updateUserPassword(currentUser.id, newPassword);
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

  const usageYears = useMemo(() => {
    const years = new Set(pageVisits.map(v => new Date(v.lastVisited).getFullYear()));
    return ['All', ...Array.from(years).sort((a, b) => b - a).map(String)];
  }, [pageVisits]);

  const handleUsageSort = (key: 'count' | 'path' | 'lastVisited') => {
    setUsageSortConfig(prev => ({ key, dir: prev.key === key && prev.dir === 'desc' ? 'asc' : 'desc' }));
  };

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
        <header className="flex items-center justify-between">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">General Settings</h1>
                <p className="text-muted-foreground">Manage your application's master data and security.</p>
            </div>
            <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input type="search" placeholder="Search..." className="pl-8 sm:w-[300px]" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            </div>
        </header>
        
        <Tabs value={activeTab} onValueChange={setActiveTab}>
             <TabsList>
                <TabsTrigger value="users-security">Users & Security</TabsTrigger>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="flex items-center gap-1">
                            More Settings
                            <ChevronDown className="h-4 w-4" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                        <DropdownMenuRadioGroup value={activeTab} onValueChange={setActiveTab}>
                        {otherTabs.map(tab => (
                            <DropdownMenuRadioItem key={tab.value} value={tab.value}>
                                {tab.label}
                            </DropdownMenuRadioItem>
                        ))}
                        </DropdownMenuRadioGroup>
                    </DropdownMenuContent>
                </DropdownMenu>
            </TabsList>
            <TabsContent value="users-security">
                <div className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>My Account</CardTitle>
                            <CardDescription>Manage your account settings.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="flex items-center gap-4">
                                <p className="font-medium">User: {user?.username}</p>
                                <Button onClick={() => setIsChangePasswordDialogOpen(true)}><KeyRound className="mr-2 h-4 w-4"/> Change Password</Button>
                            </div>
                        </CardContent>
                    </Card>
                    {user?.is_admin && (
                        <>
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between">
                                <div>
                                    <CardTitle>User Management</CardTitle>
                                    <CardDescription>Manage users and their permissions.</CardDescription>
                                </div>
                                <Button onClick={() => openUserDialog()}><Plus className="mr-2 h-4 w-4" /> Add User</Button>
                            </CardHeader>
                            <CardContent>
                                <Table><TableHeader><TableRow>
                                    <TableHead>Username</TableHead>
                                    <TableHead>Permissions</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow></TableHeader><TableBody>
                                {filteredUsers.map(u => (
                                    <TableRow key={u.id}>
                                        <TableCell>{u.username}</TableCell>
                                        <TableCell className="max-w-md">
                                            <div className="flex flex-wrap gap-1">
                                            {Object.entries(u.permissions).flatMap(([module, actions]) => 
                                                (actions || []).map(action => <Badge key={`${module}-${action}`} variant="secondary">{`${module}: ${action}`}</Badge>)
                                            )}
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuItem onSelect={() => openUserDialog(u)}><Edit className="mr-2 h-4 w-4" /> Edit</DropdownMenuItem>
                                                <DropdownMenuSeparator />
                                                <AlertDialog><AlertDialogTrigger asChild><DropdownMenuItem onSelect={e => e.preventDefault()}><Trash2 className="mr-2 h-4 w-4 text-destructive" /> <span className="text-destructive">Delete</span></DropdownMenuItem></AlertDialogTrigger>
                                                <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Are you sure?</AlertDialogTitle><AlertDialogDescription>This will permanently delete the user account.</AlertDialogDescription></AlertDialogHeader>
                                                <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => handleDeleteUser(u.id)}>Delete</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
                                            </DropdownMenuContent></DropdownMenu>
                                        </TableCell>
                                    </TableRow>
                                ))}
                                </TableBody></Table>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader>
                                <CardTitle>Backup & Restore</CardTitle>
                                <CardDescription>Export your data or restore from a JSON file.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <Button onClick={handleExportData} disabled={isExporting} className="gap-2">
                                    {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                                    Export All Data
                                </Button>
                                <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                        <Button variant="destructive-outline" disabled={isImporting} className="ml-2 gap-2">
                                            {isImporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                                            Import from Backup
                                        </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                        <AlertDialogHeader><AlertDialogTitle>Confirm Overwrite</AlertDialogTitle><AlertDialogDescription>Importing will overwrite all existing data. This cannot be reversed.</AlertDialogDescription></AlertDialogHeader>
                                        <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => importFileRef.current?.click()}>Continue</AlertDialogAction></AlertDialogFooter>
                                    </AlertDialogContent>
                                </AlertDialog>
                                <input type="file" ref={importFileRef} className="hidden" accept=".json" onChange={handleImportFileSelect} />
                            </CardContent>
                        </Card>
                        </>
                    )}
                </div>
            </TabsContent>
            <TabsContent value="app-branding">
                 <Card>
                    <CardHeader className="flex flex-row items-center justify-between">
                        <div className="space-y-1">
                            <CardTitle>System Identity</CardTitle>
                            <CardDescription>Configure core branding using URLs or direct uploads.</CardDescription>
                        </div>
                        <Button onClick={handleSaveAppBranding} disabled={isSavingBranding}>
                            {isSavingBranding ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                            Save Branding
                        </Button>
                    </CardHeader>
                    <CardContent className="space-y-8">
                        <div className="flex flex-col md:flex-row gap-8 items-start">
                             <div className="space-y-4">
                                <Label>Application Logo</Label>
                                <div className="w-32 h-32 rounded-xl border border-dashed flex items-center justify-center bg-muted/30 overflow-hidden group relative">
                                    {appBranding.appLogoURL ? (
                                        <img src={appBranding.appLogoURL} alt="App Logo" className="w-full h-full object-contain" crossOrigin="anonymous" />
                                    ) : (
                                        <ImageIcon className="h-12 w-12 text-muted-foreground opacity-20" />
                                    )}
                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                        <Button variant="secondary" size="sm" className="h-8 text-[10px]" onClick={() => appLogoInputRef.current?.click()}>Upload File</Button>
                                    </div>
                                </div>
                                <input type="file" ref={appLogoInputRef} className="hidden" accept="image/*" onChange={e => e.target.files?.[0] && handleLogoUpload(e.target.files[0], 'app')} />
                                <div className="space-y-1">
                                    <Label className="text-[10px] uppercase text-muted-foreground">Or Direct URL</Label>
                                    <Input 
                                        placeholder="https://..." 
                                        className="h-8 text-[10px]" 
                                        value={appBranding.appLogoURL} 
                                        onChange={e => setAppBranding(prev => ({...prev, appLogoURL: e.target.value}))} 
                                    />
                                </div>
                            </div>
                            <div className="flex-1 space-y-6 w-full">
                                <div className="space-y-2">
                                    <Label htmlFor="app-name">Application Name</Label>
                                    <Input id="app-name" value={appBranding.appName} onChange={e => setAppBranding(prev => ({ ...prev, appName: e.target.value }))} className="h-12 text-lg font-bold" />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="app-motto">App Tagline / Motto</Label>
                                    <Input id="app-motto" value={appBranding.appMotto} onChange={e => setAppBranding(prev => ({ ...prev, appMotto: e.target.value }))} />
                                </div>
                            </div>
                        </div>
                    </CardContent>
                 </Card>
            </TabsContent>
            <TabsContent value="company-details">
                <div className="space-y-8">
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between">
                            <div className="space-y-1"><CardTitle>Production Company Profile</CardTitle><CardDescription>Branding for Reports, Payslips and CRM.</CardDescription></div>
                            <Button onClick={handleSaveCompanyProfile} disabled={isSavingProfile}>
                                {isSavingProfile ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                                Save Profile
                            </Button>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="flex flex-col md:flex-row gap-8">
                                <div className="space-y-4">
                                    <Label>Shivam Logo</Label>
                                    <div className="w-40 h-40 rounded-lg border border-dashed flex items-center justify-center bg-muted/30 overflow-hidden group relative">
                                        {companyProfile.logoURL ? (
                                            <img src={companyProfile.logoURL} alt="Shivam Logo" className="w-full h-full object-contain" crossOrigin="anonymous" />
                                        ) : (
                                            <ImageIcon className="h-16 w-16 text-muted-foreground opacity-20" />
                                        )}
                                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                            <Button variant="secondary" size="sm" onClick={() => mainLogoInputRef.current?.click()}>Upload File</Button>
                                        </div>
                                    </div>
                                    <input type="file" ref={mainLogoInputRef} className="hidden" accept="image/*" onChange={e => e.target.files?.[0] && handleLogoUpload(e.target.files[0], 'main')} />
                                    <div className="space-y-1">
                                        <Label className="text-[10px] uppercase text-muted-foreground">Or Direct URL</Label>
                                        <Input 
                                            placeholder="https://..." 
                                            className="h-8 text-[10px]" 
                                            value={companyProfile.logoURL || ''} 
                                            onChange={e => setCompanyProfile(prev => ({...prev, logoURL: e.target.value}))} 
                                        />
                                    </div>
                                </div>
                                <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-2"><Label>Name (EN)</Label><Input value={companyProfile.nameEn} onChange={e => setCompanyProfile(prev => ({...prev, nameEn: e.target.value}))} /></div>
                                    <div className="space-y-2"><Label>Name (NP)</Label><Input value={companyProfile.nameNp} onChange={e => setCompanyProfile(prev => ({...prev, nameNp: e.target.value}))} className="font-body" /></div>
                                    <div className="space-y-2 md:col-span-2"><Label>Address</Label><Input value={companyProfile.address} onChange={e => setCompanyProfile(prev => ({...prev, address: e.target.value}))} /></div>
                                    <div className="space-y-2"><Label>PAN</Label><Input value={companyProfile.pan} onChange={e => setCompanyProfile(prev => ({...prev, pan: e.target.value}))} /></div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="border-l-4 border-l-blue-500">
                        <CardHeader className="flex flex-row items-center justify-between">
                            <div className="space-y-1"><CardTitle>Fleet Company Profile</CardTitle><CardDescription>Branding for Sijan Dhuwani.</CardDescription></div>
                            <Button onClick={handleSaveFleetProfile} disabled={isSavingFleetProfile}>
                                {isSavingFleetProfile ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                                Save Fleet Profile
                            </Button>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="flex flex-col md:flex-row gap-8">
                                <div className="space-y-4">
                                    <Label>Sijan Logo</Label>
                                    <div className="w-40 h-40 rounded-lg border border-dashed flex items-center justify-center bg-muted/30 overflow-hidden group relative">
                                        {fleetProfile.logoURL ? (
                                            <img src={fleetProfile.logoURL} alt="Sijan Logo" className="w-full h-full object-contain" crossOrigin="anonymous" />
                                        ) : (
                                            <ImageIcon className="h-16 w-16 text-muted-foreground opacity-20" />
                                        )}
                                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                            <Button variant="secondary" size="sm" onClick={() => fleetLogoInputRef.current?.click()}>Upload File</Button>
                                        </div>
                                    </div>
                                    <input type="file" ref={fleetLogoInputRef} className="hidden" accept="image/*" onChange={e => e.target.files?.[0] && handleLogoUpload(e.target.files[0], 'fleet')} />
                                    <div className="space-y-1">
                                        <Label className="text-[10px] uppercase text-muted-foreground">Or Direct URL</Label>
                                        <Input 
                                            placeholder="https://..." 
                                            className="h-8 text-[10px]" 
                                            value={fleetProfile.logoURL || ''} 
                                            onChange={e => setFleetProfile(prev => ({...prev, logoURL: e.target.value}))} 
                                        />
                                    </div>
                                </div>
                                <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-2"><Label>Name (EN)</Label><Input value={fleetProfile.nameEn} onChange={e => setFleetProfile(prev => ({...prev, nameEn: e.target.value}))} /></div>
                                    <div className="space-y-2"><Label>Name (NP)</Label><Input value={fleetProfile.nameNp} onChange={e => setFleetProfile(prev => ({...prev, nameNp: e.target.value}))} className="font-body" /></div>
                                    <div className="space-y-2 md:col-span-2"><Label>Address</Label><Input value={fleetProfile.address} onChange={e => setFleetProfile(prev => ({...prev, address: e.target.value}))} /></div>
                                    <div className="space-y-2"><Label>PAN</Label><Input value={fleetProfile.pan} onChange={e => setFleetProfile(prev => ({...prev, pan: e.target.value}))} /></div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </TabsContent>
            <TabsContent value="parties">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between">
                        <div><CardTitle>Vendors & Suppliers</CardTitle><CardDescription>Master list of partners.</CardDescription></div>
                        <div className="flex gap-2">
                            <Button variant="outline" onClick={() => setIsMergeDialogOpen(true)}><GitMerge className="mr-2 h-4 w-4"/> Merge</Button>
                            <Button onClick={() => openPartyDialog()}><Plus className="mr-2 h-4 w-4" /> Add</Button>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <Table><TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Type</TableHead><TableHead>Ownership</TableHead><TableHead>Address</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader><TableBody>
                        {filteredParties.map(party => (
                            <TableRow key={party.id}><TableCell>{party.name}</TableCell><TableCell><Badge variant="outline">{party.type}</Badge></TableCell><TableCell><Badge>{party.ownership}</Badge></TableCell><TableCell>{party.address}</TableCell><TableCell className="text-right">
                                <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    <DropdownMenuItem onSelect={() => openPartyDialog(party)}>Edit</DropdownMenuItem>
                                    <AlertDialog><AlertDialogTrigger asChild><DropdownMenuItem onSelect={e => e.preventDefault()} className="text-destructive">Delete</DropdownMenuItem></AlertDialogTrigger><AlertDialogContent>
                                        <AlertDialogHeader><AlertDialogTitle>Delete party?</AlertDialogTitle><AlertDialogDescription>This removes the record permanently.</AlertDialogDescription></AlertDialogHeader>
                                        <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => handleDeleteParty(party.id)}>Delete</AlertDialogAction></AlertDialogFooter>
                                    </AlertDialogContent></AlertDialog>
                                </DropdownMenuContent></DropdownMenu>
                            </TableCell></TableRow>
                        ))}</TableBody></Table>
                    </CardContent>
                </Card>
            </TabsContent>
            <TabsContent value="accounts">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between">
                        <div><CardTitle>Accounts</CardTitle><CardDescription>Manage banking details.</CardDescription></div>
                        <Button onClick={() => openAccountDialog()}><Plus className="mr-2 h-4 w-4" /> Add</Button>
                    </CardHeader>
                    <CardContent>
                        <Table><TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Type</TableHead><TableHead>Ownership</TableHead><TableHead>Account #</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader><TableBody>
                        {filteredAccounts.map(acc => (
                            <TableRow key={acc.id}><TableCell>{acc.name}</TableCell><TableCell>{acc.type}</TableCell><TableCell><Badge>{acc.ownership}</Badge></TableCell><TableCell>{acc.accountNumber || '-'}</TableCell><TableCell className="text-right">
                                <Button variant="ghost" size="icon" onClick={() => openAccountDialog(acc)}><Edit className="h-4 w-4" /></Button>
                                <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDeleteAccount(acc.id)}><Trash2 className="h-4 w-4" /></Button>
                            </TableCell></TableRow>
                        ))}</TableBody></Table>
                    </CardContent>
                </Card>
            </TabsContent>
            <TabsContent value="uom"><Card><CardHeader className="flex flex-row items-center justify-between"><div><CardTitle>Units</CardTitle><CardDescription>UoM master list.</CardDescription></div><Button onClick={() => openUomDialog()}><Plus className="mr-2 h-4 w-4" /> Add</Button></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Abbr.</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader><TableBody>{filteredUoms.map(u => (<TableRow key={u.id}><TableCell>{u.name}</TableCell><TableCell>{u.abbreviation}</TableCell><TableCell className="text-right"><Button variant="ghost" size="icon" onClick={() => openUomDialog(u)}><Edit className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDeleteUom(u.id)}><Trash2 className="h-4 w-4" /></TableCell></TableRow>))}</TableBody></Table></CardContent></Card></TabsContent>
            <TabsContent value="document-numbering">
                <Card>
                    <CardHeader><CardTitle>Document Prefixes</CardTitle></CardHeader>
                    <CardContent><Table><TableHeader><TableRow><TableHead>Document</TableHead><TableHead>Prefix</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader><TableBody>
                        {documentTypes.map(t => (<TableRow key={t}><TableCell>{getDocumentName(t)}</TableCell><TableCell>{prefixes[t] || '-'}</TableCell><TableCell className="text-right"><Button variant="outline" size="sm" onClick={() => handleOpenPrefixDialog(t)}>Edit</Button></TableCell></TableRow>))}
                    </TableBody></Table></CardContent>
                </Card>
            </TabsContent>
            <TabsContent value="payroll-settings">
                <Card>
                    <CardHeader><CardTitle>Lock Control</CardTitle><CardDescription>Prevent edits to closed periods.</CardDescription></CardHeader>
                    <CardContent>
                        <div className="flex gap-2">
                            <Select value={selectedLockYear} onValueChange={setSelectedLockYear}><SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger><SelectContent>{bsYears.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent></Select>
                            <Select value={selectedLockMonth} onValueChange={setSelectedLockMonth}><SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger><SelectContent>{NEPALI_MONTHS.map(m => <SelectItem key={m.value} value={String(m.value)}>{m.name}</SelectItem>)}</SelectContent></Select>
                            <Button onClick={handleTogglePayrollLock} variant={isCurrentPeriodLocked ? 'destructive' : 'default'}>{isCurrentPeriodLocked ? 'Unlock' : 'Lock'}</Button>
                        </div>
                    </CardContent>
                </Card>
            </TabsContent>
            <TabsContent value="usage-analytics">
                <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Total Visits</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{usageStats.total}</div></CardContent></Card>
                        <Card className="md:col-span-2">
                            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Detailed Engagement</CardTitle></CardHeader>
                            <CardContent className="p-0">
                                <Table className="text-[10px]"><TableHeader><TableRow><TableHead onClick={() => handleUsageSort('path')} className="cursor-pointer">Path</TableHead><TableHead onClick={() => handleUsageSort('count')} className="cursor-pointer text-right">Visits</TableHead><TableHead onClick={() => handleUsageSort('lastVisited')} className="cursor-pointer text-right">Last Visit</TableHead></TableRow></TableHeader><TableBody>
                                    {filteredDetailedUsage.map(v => (<TableRow key={v.id}><TableCell className="font-mono">{v.path}</TableCell><TableCell className="text-right">{v.count}</TableCell><TableCell className="text-right">{format(new Date(v.lastVisited), 'MMM d, p')}</TableCell></TableRow>))}
                                </TableBody></Table>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </TabsContent>
            <TabsContent value="system-logs">
                <Card>
                    <CardHeader><CardTitle>Error Logs</CardTitle></CardHeader>
                    <CardContent>
                        <Table><TableHeader><TableRow><TableHead>Time</TableHead><TableHead>Module</TableHead><TableHead>Error</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader><TableBody>
                        {logs.map(log => (<TableRow key={log.id}><TableCell className="text-xs">{format(new Date(log.timestamp), 'p')}</TableCell><TableCell><Badge variant="outline">{log.module}</Badge></TableCell><TableCell className="text-xs truncate max-w-xs">{log.message}</TableCell><TableCell className="text-right">
                            <Dialog><DialogTrigger asChild><Button variant="ghost" size="sm">View</Button></DialogTrigger><DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>Error Details</DialogTitle></DialogHeader><div className="space-y-4 py-4"><pre className="text-[10px] bg-muted p-4 rounded overflow-auto max-h-96">{log.stack || log.message}</pre></div></DialogContent></Dialog>
                        </TableCell></TableRow>))}
                        </TableBody></Table>
                    </CardContent>
                </Card>
            </TabsContent>
        </Tabs>
        
        <Dialog open={isPartyDialogOpen} onOpenChange={setIsPartyDialogOpen}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader><DialogTitle>{editingParty ? 'Edit Party' : 'Add New Party'}</DialogTitle></DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="space-y-2"><Label>Name</Label><Input value={partyForm.name} onChange={e => setPartyForm(p => ({...p, name: e.target.value}))} /></div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2"><Label>Type</Label><Select value={partyForm.type} onValueChange={(v: PartyType) => setPartyForm(p => ({...p, type: v}))}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="Vendor">Vendor</SelectItem><SelectItem value="Customer">Customer</SelectItem><SelectItem value="Both">Both</SelectItem></SelectContent></Select></div>
                        <div className="space-y-2"><Label>Ownership</Label><Select value={partyForm.ownership} onValueChange={(v: AccountOwnership) => setPartyForm(p => ({...p, ownership: v}))}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="Sijan">Sijan</SelectItem><SelectItem value="Shivam">Shivam</SelectItem><SelectItem value="Both">Both</SelectItem></SelectContent></Select></div>
                    </div>
                    <div className="space-y-2"><Label>Address</Label><Textarea value={partyForm.address} onChange={e => setPartyForm(p => ({...p, address: e.target.value}))} /></div>
                </div>
                <DialogFooter><Button onClick={handlePartySubmit}>Save</Button></DialogFooter>
            </DialogContent>
        </Dialog>

        <MergePartiesDialog open={isMergeDialogOpen} onOpenChange={setIsMergeDialogOpen} parties={parties} onMerge={handleMergeParties} />
        
        <Dialog open={isAccountDialogOpen} onOpenChange={setIsAccountDialogOpen}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader><DialogTitle>{editingAccount ? 'Edit Account' : 'Add New Account'}</DialogTitle></DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2"><Label>Type</Label><Select value={accountForm.type} onValueChange={(v: AccountType) => setAccountForm(p => ({...p, type: v}))}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="Cash">Cash</SelectItem><SelectItem value="Bank">Bank</SelectItem></SelectContent></Select></div>
                        <div className="space-y-2"><Label>Ownership</Label><Select value={accountForm.ownership} onValueChange={(v: AccountOwnership) => setAccountForm(p => ({...p, ownership: v}))}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="Sijan">Sijan</SelectItem><SelectItem value="Shivam">Shivam</SelectItem><SelectItem value="Both">Both</SelectItem></SelectContent></Select></div>
                    </div>
                    <div className="space-y-2"><Label>Name</Label><Input value={accountForm.name} onChange={e => setAccountForm(p => ({...p, name: e.target.value}))} /></div>
                    {accountForm.type === 'Bank' && (<><div className="space-y-2"><Label>Bank</Label><Input value={accountForm.bankName} onChange={e => setAccountForm(p => ({...p, bankName: e.target.value}))} /></div><div className="space-y-2"><Label>Account #</Label><Input value={accountForm.accountNumber} onChange={e => setAccountForm(p => ({...p, accountNumber: e.target.value}))} /></div></>)}
                </div>
                <DialogFooter><Button onClick={handleAccountSubmit}>Save</Button></DialogFooter>
            </DialogContent>
        </Dialog>

        <Dialog open={isUserDialogOpen} onOpenChange={setIsUserDialogOpen}><DialogContent className="sm:max-w-2xl"><DialogHeader><DialogTitle>User Detail</DialogTitle></DialogHeader><div className="space-y-4"><div className="space-y-2"><Label>Username</Label><Input value={userForm.username} onChange={e => setUserForm(p => ({...p, username: e.target.value}))} disabled={!!editingUser} /></div><div className="space-y-2"><Label>Password</Label><Input type="password" value={userForm.password} onChange={e => setUserForm(p => ({...p, password: e.target.value}))} />{passwordError && <p className="text-xs text-destructive">{passwordError}</p>}</div>{modules.filter(m => m !== 'dashboard').map(m => (<div key={m} className="p-2 border rounded"><Label className="capitalize">{m}</Label><div className="flex gap-4 mt-2">{actions.map(a => (<div key={a} className="flex items-center gap-1"><Checkbox id={`${m}-${a}`} checked={userForm.permissions[m]?.includes(a)} onCheckedChange={v => handlePermissionChange(m, a, !!v)} /><label htmlFor={`${m}-${a}`} className="text-xs capitalize">{a}</label></div>))}</div></div>))}</div><DialogFooter><Button onClick={handleUserSubmit}>Save User</Button></DialogFooter></DialogContent></Dialog>
        <Dialog open={isChangePasswordDialogOpen} onOpenChange={setIsChangePasswordDialogOpen}><DialogContent><DialogHeader><DialogTitle>Change Password</DialogTitle></DialogHeader><div className="space-y-4"><div className="space-y-2"><Label>New Password</Label><Input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} /></div><div className="space-y-2"><Label>Confirm</Label><Input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} /></div>{changePasswordError && <p className="text-xs text-destructive">{changePasswordError}</p>}</div><DialogFooter><Button onClick={handleChangePassword}>Update & Sign Out</Button></DialogFooter></DialogContent></Dialog>
        <Dialog open={isPrefixDialogOpen} onOpenChange={setIsPrefixDialogOpen}><DialogContent><DialogHeader><DialogTitle>Prefix Control</DialogTitle></DialogHeader><div className="py-4"><Label>Prefix</Label><Input value={editingPrefix?.value || ''} onChange={e => setEditingPrefix(p => p ? {...p, value: e.target.value} : null)} /></div><DialogFooter><Button onClick={handleSavePrefix}>Apply</Button></DialogFooter></DialogContent></Dialog>
    </div>
  );
}
