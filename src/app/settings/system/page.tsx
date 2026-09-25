
'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import type { 
  User, 
  Permissions, 
  Module, 
  Action, 
  AccountOwnership,
  PageVisit,
  OwnershipCategory,
  SessionRecord
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
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { Plus, Edit, Trash2, KeyRound, Loader2, ShieldCheck, Download, RefreshCcw, SearchCheck, BarChart3, MousePointer2, Clock, ArrowUpDown, Fingerprint, Mail, User as UserIcon, ShieldAlert, AlertTriangle, ListTree, Monitor, LogOut, Settings2, Save, Sparkles, Timer } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/hooks/use-auth';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { onPageVisitsUpdate } from '@/services/usage-service';
import { onLogsUpdate, type SystemLog } from '@/services/log-service';
import { onAllSessionsUpdate, revokeSession, cleanupStaleSessions, renameDevice } from '@/services/session-service';
import { onSettingUpdate, setSetting } from '@/services/settings-service';
import { useHrFeatureLocks, setHrFeatureLocks, type HrFeatureLocks } from '@/hooks/use-hr-feature-locks';
import { deleteAttendanceLogsForFiscalYear, getAttendanceLogsBsYears } from '@/services/attendance/data';
import { getFiscalYearStart, getFiscalYearMonths, getFiscalYearsForBsYears, formatFiscalYear } from '@/lib/fiscal-year';
import NepaliDate from 'nepali-date-converter';
import { Gauge, DatabaseZap } from 'lucide-react';

import { 
    onUsersUpdate,
    saveUser,
    deleteUser as deleteUserService,
    validatePassword, 
    MIN_PASSWORD_LENGTH, 
    setAdminPassword,
    adminCreateUserWithUsername,
    onUsernamesUpdate,
    deleteUsernameRecord
} from '@/services/user-service';
import { modules, actions } from '@/lib/types';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { format, formatDistanceToNow, differenceInMinutes } from 'date-fns';
import { cn, getNormalizedPath } from '@/lib/utils';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { useAuthService } from '@/firebase';
import { exportData, RAW_LOGS_COLLECTION, compressBackup, readBackupFile, planRestore, applyRestore, type RestorePlan } from '@/services/backup-service';
import { Separator } from '@/components/ui/separator';
import { EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { logAudit } from '@/services/log-service';

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

export default function SystemSettingsPage() {
  const { user, logout } = useAuth();
  // This screen creates users, grants administrator rights, deletes accounts
  // and reads every session and log. It was reachable by anyone with
  // `settings: view` - the rules blocked the damage, but a non-admin still saw
  // the whole administration surface and a wall of permission errors from the
  // admin-only listeners below.
  const isAdministrator = !!user?.isAdmin;
  const auth = useAuthService();
  const { toast } = useToast();
  
  const [users, setUsers] = useState<User[]>([]);
  const [usernames, setUsernames] = useState<{username: string, email: string}[]>([]);
  const [pageVisits, setPageVisits] = useState<PageVisit[]>([]);
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [ownershipCategories, setOwnershipCategories] = useState<OwnershipCategory[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [sessionThreshold, setSessionThreshold] = useState<number>(30);

  const [isUserDialogOpen, setIsUserDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [userForm, setUserForm] = useState({ username: '', email: '', isApproved: true, isAdmin: false, password: '', permissions: {} as Permissions });
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [isSubmittingUser, setIsSubmittingUser] = useState(false);

  const [isChangePasswordDialogOpen, setIsChangePasswordDialogOpen] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changePasswordError, setChangePasswordError] = useState<string | null>(null);

  const [isExporting, setIsExporting] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [restorePassword, setRestorePassword] = useState('');
  const [backupIncludeRawLogs, setBackupIncludeRawLogs] = useState(false);
  const [restorePlan, setRestorePlan] = useState<RestorePlan | null>(null);
  const [isPlanningRestore, setIsPlanningRestore] = useState(false);
  const [restoreDeleteExtra, setRestoreDeleteExtra] = useState(false);
  const restoreInputRef = useRef<HTMLInputElement>(null);
  const [isCleaningSessions, setIsCleaningSessions] = useState(false);

  const [localWorkstationName, setLocalWorkstationName] = useState('');
  const [isRenamingWorkstation, setIsRenamingWorkstation] = useState(false);

  const [trafficSortConfig, setTrafficSortConfig] = useState<{ key: 'path' | 'lastVisited' | 'count'; direction: 'asc' | 'desc' }>({
    key: 'count',
    direction: 'desc'
  });

  const { locks: hrFeatureLocks } = useHrFeatureLocks();
  const [isSavingHrLock, setIsSavingHrLock] = useState<keyof HrFeatureLocks | null>(null);
  const currentFyStart = getFiscalYearStart(new NepaliDate().getYear(), new NepaliDate().getMonth());
  const [activeTab, setActiveTab] = useState('users');
  const [purgeableFiscalYears, setPurgeableFiscalYears] = useState<number[] | null>(null);
  const [isLoadingPurgeYears, setIsLoadingPurgeYears] = useState(false);
  const [manualFyEntry, setManualFyEntry] = useState(false);
  const [purgeFiscalYear, setPurgeFiscalYear] = useState<number>(currentFyStart);
  const [isPurgingAttendance, setIsPurgingAttendance] = useState(false);

  const loadPurgeableFiscalYears = () => {
    setIsLoadingPurgeYears(true);
    getAttendanceLogsBsYears().then(bsYears => {
        const years = getFiscalYearsForBsYears(bsYears);
        setPurgeableFiscalYears(years);
        // Detected years are a convenience, not a gate: if the probe finds
        // nothing (empty database, or the probe itself failed under a
        // permission or quota hiccup - it fires ~30 reads), fall back to
        // manual entry rather than leaving the purge unusable. A previous
        // version disabled the delete button whenever this came back empty,
        // which broke the purge entirely whenever the probe failed.
        setManualFyEntry(years.length === 0);
        if (years.length > 0 && !years.includes(purgeFiscalYear)) {
            setPurgeFiscalYear(years[0]);
        }
    }).finally(() => setIsLoadingPurgeYears(false));
  };

  useEffect(() => {
    // Loaded lazily, only once the HR Quota tab is actually opened - not on
    // every visit to Settings > System - since the probe itself costs ~30
    // reads (candidate BS years x 2 collections).
    if (!isAdministrator || activeTab !== 'hr-quota' || purgeableFiscalYears !== null) return;
    loadPurgeableFiscalYears();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdministrator, activeTab, purgeableFiscalYears]);

  useEffect(() => {
    if (!isAdministrator) return;
    const unsubs = [
        onUsersUpdate(setUsers),
        onUsernamesUpdate(setUsernames),
        onPageVisitsUpdate(setPageVisits),
        onLogsUpdate(setLogs),
        onAllSessionsUpdate(setSessions),
        onSettingUpdate('session_config', (s: any) => {
            if (s?.value?.inactivityThresholdMinutes) {
                setSessionThreshold(s.value.inactivityThresholdMinutes);
            }
        }),
        onSettingUpdate('ownership_categories', (s: any) => { 
            const defaults = ['Sijan', 'Shivam', 'Rental', 'Both'];
            let raw = s?.value || [];
            if (!Array.isArray(raw)) raw = [];

            const normalized = raw.map((item: any) => {
                if (typeof item === 'string') return { name: item, modules: Array.from(modules) };
                return item as OwnershipCategory;
            });

            const existing = new Set(normalized.map((c: OwnershipCategory) => c.name));
            defaults.forEach(d => {
                if (!existing.has(d)) {
                    normalized.push({ name: d, modules: Array.from(modules) });
                }
            });

            setOwnershipCategories(normalized.sort((a: OwnershipCategory, b: OwnershipCategory) => a.name.localeCompare(b.name)));
        }),
    ];

    // Load local workstation name
    const storedName = localStorage.getItem('ss_device_name');
    if (storedName) setLocalWorkstationName(storedName);

    return () => unsubs.forEach(u => u());
  }, [isAdministrator]);

  const openUserDialog = (userToEdit: User | null = null) => {
    const freshPermissions: Permissions = {};
    modules.forEach(m => {
        const existing = userToEdit?.permissions?.[m];
        if (existing) {
            freshPermissions[m] = Array.isArray(existing) ? { actions: [...existing], ownerships: [] } : { actions: [...existing.actions], ownerships: [...existing.ownerships] };
        } else {
            freshPermissions[m] = { actions: [], ownerships: [] };
        }
    });

    if (userToEdit) {
        setEditingUser(userToEdit);
        setUserForm({ username: userToEdit.username, email: userToEdit.email || '', isApproved: userToEdit.isApproved !== false, isAdmin: !!userToEdit.isAdmin, password: '', permissions: freshPermissions });
    } else {
        setEditingUser(null);
        // New accounts start UNAPPROVED. Defaulting to approved made the
        // administrator's approval an opt-out rather than a step - and since
        // an approved account is what the security rules key on, ticking
        // nothing used to hand out a working login.
        setUserForm({ username: '', email: '', isApproved: false, isAdmin: false, password: '', permissions: freshPermissions });
    }
    setIsUserDialogOpen(true);
  };

  const handlePermissionChange = (module: Module, action: Action, checked: boolean) => {
    setUserForm(prev => {
        const perms = { ...prev.permissions };
        const current = perms[module] || { actions: [], ownerships: [] };
        perms[module] = { ...current, actions: checked ? Array.from(new Set([...current.actions, action])) : current.actions.filter(a => a !== action) };
        return { ...prev, permissions: perms };
    });
  };

  const handleOwnershipChange = (module: Module, ownership: AccountOwnership, checked: boolean) => {
    setUserForm(prev => {
        const perms = { ...prev.permissions };
        const current = perms[module] || { actions: [], ownerships: [] };
        perms[module] = { ...current, ownerships: checked ? Array.from(new Set([...current.ownerships, ownership])) : current.ownerships.filter(o => o !== ownership) };
        return { ...prev, permissions: perms };
    });
  };

  const handleUserSubmit = async () => {
    if (!user) return;
    const isEditing = !!editingUser;
    
    if (!isEditing && !userForm.email) {
        toast({ title: 'Validation Error', description: 'Email address is required for new users.', variant: 'destructive' });
        return;
    }

    const { isValid, error } = validatePassword(userForm.password, !isEditing, userForm.username);
    if (!isValid) { setPasswordError(error!); return; }
    
    setIsSubmittingUser(true);
    try {
        let finalUserId = editingUser?.id || '';
        if (!isEditing) {
            const authUser = await adminCreateUserWithUsername(auth, userForm.username, userForm.email, userForm.password);
            finalUserId = authUser.uid;
        }

        try {
            await saveUser({ id: finalUserId, username: userForm.username.toLowerCase().trim(), email: userForm.email.toLowerCase().trim(), isApproved: userForm.isApproved, isAdmin: userForm.isAdmin, permissions: userForm.permissions });
        } catch (saveError: any) {
            // The sign-in account already exists at this point but has no
            // profile, so the person cannot sign in. Say so plainly rather
            // than leaving the admin to discover it when the user complains.
            if (!isEditing) {
                throw new Error(
                    `The sign-in account for "${userForm.username}" was created, but its profile could not be saved, ` +
                    `so they cannot sign in yet. ${saveError.message} Re-open this dialog and save again to finish setting them up.`
                );
            }
            throw saveError;
        }

        toast({
            title: isEditing ? 'User account updated' : 'User account created',
            description: userForm.isApproved
                ? `${userForm.username} can sign in now.`
                : `${userForm.username} cannot sign in until you approve the account.`,
        });
        setIsUserDialogOpen(false);
    } catch (e: any) {
        toast({ title: 'Could not save the account', description: e.message, variant: 'destructive' });
    } finally {
        setIsSubmittingUser(false);
    }
  };

  const handleChangePassword = async () => {
    if (newPassword !== confirmPassword) { setChangePasswordError("Passwords mismatch."); return; }
    try {
        const now = new Date().toISOString();
        if (user?.isAdmin) await setAdminPassword(newPassword, now);
        toast({ title: 'Secure Key Updated' });
        setIsChangePasswordDialogOpen(false);
        await logout();
    } catch(e: any) { setChangePasswordError(e.message); }
  };

  const handleUpdateWorkstationName = async () => {
    if (!localWorkstationName.trim() || !user) return;
    setIsRenamingWorkstation(true);
    try {
        localStorage.setItem('ss_device_name', localWorkstationName.trim());
        // Find current session and update cloud record
        const deviceId = localStorage.getItem('ss_device_id');
        const sessionId = `${user.id}_${deviceId}`;
        await renameDevice(sessionId, localWorkstationName.trim());
        toast({ title: 'Workstation Labeled', description: `This device is now known as "${localWorkstationName}".` });
    } catch (error) {
        toast({ title: 'Rename Failed', variant: 'destructive' });
    } finally {
        setIsRenamingWorkstation(false);
    }
  };

  const handleManualBackup = async () => {
    setIsExporting(true);
    try {
        const data = await exportData({ exclude: backupIncludeRawLogs ? [] : [RAW_LOGS_COLLECTION] });
        const { blob, gzipped } = await compressBackup(data);
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `starsutra-manual-backup-${new Date().toISOString()}.json${gzipped ? '.gz' : ''}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        const skipped: { collection: string; reason: string }[] = data?._meta?.skipped || [];
        if (skipped.length > 0) {
            toast({
                title: 'Backup incomplete',
                description: `Saved, but ${skipped.length} collection(s) could not be read: ${skipped.map(s => s.collection).join(', ')}. A restore from this file leaves those collections as they are.`,
                variant: 'destructive',
            });
        } else {
            toast({ title: 'Success', description: `Backup file generated${gzipped ? ' (compressed)' : ''}.` });
        }
    } catch {
        toast({ title: 'Backup Failed', variant: 'destructive' });
    } finally {
        setIsExporting(false);
    }
  };

  const handleRestoreFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setRestoreFile(file || null);
    setRestorePlan(null);
    setRestoreDeleteExtra(false);
  };

  // Step 1: compare the file with the database and show what would change.
  // Reads the collections in the file once; writes nothing.
  const handleCheckRestore = async () => {
    if (!restoreFile) return;
    setIsPlanningRestore(true);
    try {
        const data = await readBackupFile(restoreFile);
        setRestorePlan(await planRestore(data));
    } catch (err: any) {
        toast({ title: 'Cannot use this file', description: err?.message || 'Invalid backup file format.', variant: 'destructive' });
    } finally {
        setIsPlanningRestore(false);
    }
  };

  const restoreTotals = useMemo(() => {
    const cols = restorePlan?.collections || [];
    const sum = (f: (c: RestorePlan['collections'][number]) => number) => cols.reduce((n, c) => n + f(c), 0);
    return {
        add: sum(c => c.add.length),
        update: sum(c => c.update.length),
        extra: sum(c => c.extra.length),
        locked: sum(c => c.lockedSkipped),
    };
  }, [restorePlan]);

  const handleConfirmRestore = async () => {
    if (!restoreFile || !restorePlan || !user) return;
    if (!user.isAdmin) {
        toast({ title: 'Access Denied', description: 'Only administrators can restore the database.', variant: 'destructive' });
        return;
    }
    if (!restorePassword) {
        toast({ title: 'Password Required', description: 'Enter your administrator password to confirm this action.', variant: 'destructive' });
        return;
    }
    setIsRestoring(true);
    try {
        const currentUser = auth.currentUser;
        if (!currentUser || !currentUser.email) {
            throw new Error('No authenticated session found. Please sign out and sign back in.');
        }
        // Re-verify identity right before the destructive operation, even
        // though this user is already logged in as an admin - a fresh
        // password confirms it's really them at the keyboard right now.
        const credential = EmailAuthProvider.credential(currentUser.email, restorePassword);
        await reauthenticateWithCredential(currentUser, credential);

        const results = await applyRestore(restorePlan, restoreDeleteExtra);
        const written = results.reduce((n, r) => n + r.written, 0);
        const deleted = results.reduce((n, r) => n + r.deleted, 0);
        const failed = results.filter(r => r.error);
        await logAudit(`Database restored from "${restoreFile.name}": ${written} written, ${deleted} deleted${failed.length ? `, failed: ${failed.map(f => f.collection).join(', ')}` : ''}`, 'Security');
        if (failed.length > 0) {
            toast({
                title: 'Restore partly done',
                description: `${written} records written, ${deleted} deleted. Failed: ${failed.map(f => `${f.collection} (${f.error})`).join(', ')}. Check the file again and re-run to finish - records already restored are skipped.`,
                variant: 'destructive',
            });
        } else {
            toast({ title: 'Restore Complete', description: `${written} records written, ${deleted} deleted.` });
        }
        setRestoreFile(null);
        setRestorePlan(null);
        setRestoreDeleteExtra(false);
        setRestorePassword('');
        if (restoreInputRef.current) restoreInputRef.current.value = '';
    } catch (err: any) {
        const message = err?.code === 'auth/wrong-password' || err?.code === 'auth/invalid-credential'
            ? 'Incorrect password. Restore cancelled.'
            : (err?.message || 'Invalid backup file format.');
        toast({ title: 'Restore Failed', description: message, variant: 'destructive' });
    } finally {
        setIsRestoring(false);
    }
  };

  const requestTrafficSort = (key: 'path' | 'lastVisited' | 'count') => {
    setTrafficSortConfig(prev => ({
        key,
        direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const aggregatedVisits = useMemo(() => {
    const map = new Map<string, PageVisit>();
    
    pageVisits.forEach(v => {
        const norm = getNormalizedPath(v.path);
        const existing = map.get(norm);
        
        if (existing) {
            existing.count += v.count;
            if (new Date(v.lastVisited) > new Date(existing.lastVisited)) {
                existing.lastVisited = v.lastVisited;
            }
        } else {
            map.set(norm, { ...v, path: norm });
        }
    });

    const result = Array.from(map.values());

    result.sort((a, b) => {
        let aVal: any = a[trafficSortConfig.key];
        let bVal: any = b[trafficSortConfig.key];
        
        if (trafficSortConfig.key === 'path') {
            aVal = aVal.toLowerCase();
            bVal = bVal.toLowerCase();
        } else if (trafficSortConfig.key === 'lastVisited') {
            aVal = new Date(aVal).getTime();
            bVal = new Date(bVal).getTime();
        }

        if (aVal < bVal) return trafficSortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return trafficSortConfig.direction === 'asc' ? 1 : -1;
        return 0;
    });

    return result;
  }, [pageVisits, trafficSortConfig]);

  const totalUsageViews = useMemo(() => {
    return aggregatedVisits.reduce((sum, v) => sum + (v.count || 0), 0);
  }, [aggregatedVisits]);

  const orphanedUsernames = useMemo(() => {
    const activeUsernames = new Set(users.map(u => u.username.toLowerCase().trim()));
    return usernames.filter(un => !activeUsernames.has(un.username.toLowerCase().trim()));
  }, [usernames, users]);

  const handleUpdateSessionConfig = async () => {
    try {
        await setSetting('session_config', { inactivityThresholdMinutes: sessionThreshold });
        toast({ title: 'Config Updated', description: `Inactivity threshold set to ${sessionThreshold} minutes.` });
    } catch {
        toast({ title: 'Error', variant: 'destructive' });
    }
  };

  const handleRevoke = async (id: string) => {
    try {
        await revokeSession(id);
        // Revoking signs the app out on that device; the person's sign-in
        // itself stays valid. Unapproving the account is what the security
        // rules act on, so say so rather than imply access is gone.
        toast({
            title: 'Session Revoked',
            description: 'That device is signed out of the app. To stop this person using the app at all, set their account to Pending in Access Control.',
        });
    } catch {
        toast({ title: 'Error', variant: 'destructive' });
    }
  };

  const handleCleanupSessions = async () => {
    setIsCleaningSessions(true);
    try {
        const count = await cleanupStaleSessions(sessionThreshold);
        toast({ title: 'Cleanup Complete', description: `Removed ${count} stale session records.` });
    } catch {
        toast({ title: 'Error', variant: 'destructive' });
    } finally {
        setIsCleaningSessions(false);
    }
  };

  const handleToggleHrLock = async (key: keyof HrFeatureLocks, value: boolean) => {
    if (!user) return;
    setIsSavingHrLock(key);
    try {
        await setHrFeatureLocks({ ...hrFeatureLocks, [key]: value }, user.username);
        toast({
            title: value ? 'Feature Re-enabled' : 'Feature Locked',
            description: value
                ? 'This will resume streaming attendance data and consume Firestore reads. Switch it off again once you are done.'
                : 'This feature is now hidden and its Firestore listeners are closed.',
        });
    } catch {
        toast({ title: 'Error', description: 'Could not update the feature lock.', variant: 'destructive' });
    } finally {
        setIsSavingHrLock(null);
    }
  };

  const handlePurgeAttendanceLogs = async () => {
    setIsPurgingAttendance(true);
    try {
        // force: true - this is an explicit admin action from Settings, so a
        // month locked against normal recalculation/re-sync is still cleared.
        const result = await deleteAttendanceLogsForFiscalYear(getFiscalYearMonths(purgeFiscalYear), true);
        await logAudit(`Purged attendance logs for FY ${formatFiscalYear(purgeFiscalYear)} (${result.recordsDeleted} records, ${result.monthsCleared} months cleared, including locked months)`, 'HR');
        toast({
            title: 'Attendance Logs Purged',
            description: `${result.recordsDeleted} records removed across ${result.monthsCleared} months, including any locked months. Payroll data was not touched.`,
        });
        loadPurgeableFiscalYears();
    } catch {
        toast({ title: 'Purge Failed', description: 'Could not delete attendance logs for this fiscal year.', variant: 'destructive' });
    } finally {
        setIsPurgingAttendance(false);
    }
  };

  if (!isAdministrator) {
    return (
      <div className="flex flex-col gap-8">
        <header>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">System &amp; Security</h1>
          <p className="text-muted-foreground text-sm">Administrator access required.</p>
        </header>
        <Card className="border-2">
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            <ShieldAlert className="h-8 w-8 text-muted-foreground" />
            <p className="max-w-sm text-sm font-semibold text-muted-foreground">
              This page manages user accounts, permissions and sessions. Only an
              administrator can open it. Ask one of yours if you need something
              changed here.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
        <header className="flex items-center justify-between">
            <div>
                <h1 className="text-3xl font-bold tracking-tight text-foreground">System & Security</h1>
                <p className="text-muted-foreground text-sm">RBAC, cloud logs, and usage analytics.</p>
            </div>
            <div className="flex gap-2">
                <Button size="sm" onClick={() => openUserDialog()} className="h-10 font-black text-xs uppercase tracking-widest"><Plus className="mr-2 h-4 w-4" /> Add User</Button>
            </div>
        </header>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="bg-muted/50 p-1 mb-6 h-auto flex-wrap">
                <TabsTrigger value="users" className="px-6 py-2 text-[10px] uppercase font-bold tracking-widest">Access Control</TabsTrigger>
                <TabsTrigger value="sessions" className="px-6 py-2 text-[10px] uppercase font-bold tracking-widest flex items-center gap-2">
                    <Monitor className="h-3.5 w-3.5" /> Active Sessions
                    <Badge variant="outline" className="h-4 px-1 text-[8px] bg-primary/10">{sessions.length}</Badge>
                </TabsTrigger>
                <TabsTrigger value="identities" className="px-6 py-2 text-[10px] uppercase font-bold tracking-widest flex items-center gap-2">
                    Identity Registry
                    {orphanedUsernames.length > 0 && <Badge className="bg-red-500 h-4 px-1 text-[8px]">{orphanedUsernames.length}</Badge>}
                </TabsTrigger>
                <TabsTrigger value="hr-quota" className="px-6 py-2 text-[10px] uppercase font-bold tracking-widest flex items-center gap-2">
                    <Gauge className="h-3.5 w-3.5" /> HR Quota
                </TabsTrigger>
                <TabsTrigger value="usage" className="px-6 py-2 text-[10px] uppercase font-bold tracking-widest">Usage Stats</TabsTrigger>
                <TabsTrigger value="logs" className="px-6 py-2 text-[10px] uppercase font-bold tracking-widest">Audit Logs</TabsTrigger>
                <TabsTrigger value="backup" className="px-6 py-2 text-[10px] uppercase font-bold tracking-widest">Backup & Recovery</TabsTrigger>
            </TabsList>

            <TabsContent value="users" className="space-y-6 animate-in fade-in slide-in-from-left-2">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-1 space-y-6">
                        <Card className="shadow-sm border-border h-fit">
                            <CardHeader className="bg-muted/30 py-4 px-6 border-b"><CardTitle className="text-xs uppercase font-black">My Account</CardTitle></CardHeader>
                            <CardContent className="p-6 space-y-6">
                                <p className="font-black text-lg text-foreground uppercase leading-none">{user?.username}</p>
                                <Separator className="border-dashed" />
                                <div className="space-y-4">
                                    <div className="space-y-1.5">
                                        <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Label This Workstation</Label>
                                        <div className="flex gap-2">
                                            <Input 
                                                value={localWorkstationName} 
                                                onChange={e => setLocalWorkstationName(e.target.value)} 
                                                placeholder="e.g. Finance PC-1"
                                                className="h-9 font-bold"
                                            />
                                            <Button 
                                                size="icon" 
                                                variant="outline" 
                                                className="h-9 w-9 shrink-0 border-primary/20 text-primary hover:bg-primary/5"
                                                onClick={handleUpdateWorkstationName}
                                                disabled={isRenamingWorkstation}
                                            >
                                                {isRenamingWorkstation ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                                            </Button>
                                        </div>
                                        <p className="text-[9px] text-muted-foreground italic leading-relaxed">Assign a descriptive name to this environment for easier administrative identification.</p>
                                    </div>
                                    <Button onClick={() => setIsChangePasswordDialogOpen(true)} variant="outline" className="w-full h-10 text-xs font-bold"><KeyRound className="mr-2 h-4 w-4"/> Update Password</Button>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                    <Card className="lg:col-span-2 shadow-sm border-border bg-card overflow-hidden">
                        <CardHeader className="py-4 border-b bg-primary/5"><CardTitle className="text-sm font-black uppercase">User Directory</CardTitle></CardHeader>
                        <CardContent className="p-0">
                            <Table className="text-xs">
                                <TableHeader className="bg-muted/50"><TableRow><TableHead className="pl-6 font-bold">Username</TableHead><TableHead>Identifier</TableHead><TableHead className="text-center">Status</TableHead><TableHead className="text-right pr-6">Actions</TableHead></TableRow></TableHeader>
                                <TableBody>
                                    {users.map(u => (
                                        <TableRow key={u.id} className="h-14 hover:bg-muted/10 transition-colors group">
                                            <TableCell className="font-black pl-6 uppercase">{u.username}</TableCell>
                                            <TableCell className="text-muted-foreground">{u.email || '-'}</TableCell>
                                            <TableCell className="text-center">
                                                {u.isApproved !== false ? <Badge className="bg-green-600">Approved</Badge> : <Badge variant="destructive">Pending</Badge>}
                                            </TableCell>
                                            <TableCell className="text-right pr-6">
                                                <Button variant="ghost" size="icon" onClick={() => openUserDialog(u)}><Edit className="h-4 w-4"/></Button>
                                                {!u.isAdmin && <Button variant="ghost" size="icon" className="text-destructive" onClick={() => deleteUserService(u.id, u.username)}><Trash2 className="h-4 w-4"/></Button>}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </div>
            </TabsContent>

            <TabsContent value="sessions" className="space-y-6 animate-in fade-in slide-in-from-left-2">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <Card className="lg:col-span-1 border-dashed bg-muted/5">
                        <CardHeader className="pb-3 border-b">
                            <CardTitle className="text-xs font-black uppercase flex items-center gap-2">
                                <Settings2 className="h-4 w-4 text-primary" />
                                Session Policy
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-6 pt-6">
                            <div className="space-y-2">
                                <Label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">Inactivity Timeout (Min)</Label>
                                <div className="flex gap-2">
                                    <Input type="number" value={sessionThreshold} onChange={e => setSessionThreshold(Number(e.target.value))} className="font-black h-9" />
                                    <Button size="icon" className="h-9 w-9" onClick={handleUpdateSessionConfig} title="Save Policy"><Save className="h-4 w-4" /></Button>
                                </div>
                                <p className="text-[9px] text-muted-foreground leading-relaxed italic">Sessions are isolated per browser profile. If a user logs in on Chrome and Firefox, two sessions will appear.</p>
                            </div>

                            <Separator className="border-dashed" />

                            <div className="space-y-2">
                                <Label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">Database Maintenance</Label>
                                <Button 
                                    variant="outline" 
                                    className="w-full h-9 text-[10px] font-black uppercase tracking-widest text-primary border-primary/20 hover:bg-primary/5"
                                    disabled={isCleaningSessions}
                                    onClick={handleCleanupSessions}
                                >
                                    {isCleaningSessions ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-2 h-3.5 w-3.5" />}
                                    Purge Stale Records
                                </Button>
                                <p className="text-[9px] text-muted-foreground leading-relaxed italic">Deletes inactive session documents from the registry to optimize performance.</p>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="lg:col-span-2 shadow-sm border-border bg-card overflow-hidden">
                        <CardHeader className="py-4 border-b bg-muted/5">
                            <CardTitle className="text-sm font-black uppercase tracking-tight">Active Workstations & Profiles</CardTitle>
                            <CardDescription className="text-[10px] font-bold uppercase tracking-widest">Real-time monitoring of authenticated cloud sessions.</CardDescription>
                        </CardHeader>
                        <CardContent className="p-0">
                            <Table className="text-xs">
                                <TableHeader className="bg-muted/30">
                                    <TableRow className="h-10 hover:bg-transparent">
                                        <TableHead className="pl-6 font-bold uppercase text-[9px]">Environment / App</TableHead>
                                        <TableHead className="font-bold uppercase text-[9px]">User Identity</TableHead>
                                        <TableHead className="font-bold uppercase text-[9px] text-center">Status</TableHead>
                                        <TableHead className="text-right pr-6 font-bold uppercase text-[9px]">Security</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {sessions.map(s => {
                                        const minsInactive = differenceInMinutes(new Date(), new Date(s.lastActive));
                                        const isStale = minsInactive > sessionThreshold;
                                        
                                        return (
                                            <TableRow key={s.id} className={cn("h-14 border-b transition-colors", isStale ? "bg-red-50/30" : "hover:bg-muted/10")}>
                                                <TableCell className="pl-6">
                                                    <div className="flex flex-col">
                                                        <span className="font-black text-foreground uppercase tracking-tighter">{s.deviceName || `WS-${s.deviceId.substring(0,4).toUpperCase()}`}</span>
                                                        <span className="text-[8px] text-muted-foreground font-mono truncate max-w-[180px]" title={s.userAgent}>{s.userAgent}</span>
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex flex-col">
                                                        <span className="font-bold text-foreground uppercase">{s.username}</span>
                                                        <div className="flex items-center gap-1.5 text-[8px] text-muted-foreground uppercase">
                                                            <Timer className="h-2.5 w-2.5" />
                                                            <span>Online {formatDistanceToNow(new Date(s.loginAt))}</span>
                                                        </div>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-center">
                                                    <div className="flex flex-col items-center">
                                                        <Badge variant="outline" className={cn(
                                                            "text-[8px] font-black uppercase px-2 h-4 border-none shadow-none",
                                                            isStale ? "text-red-600 bg-red-50" : "text-emerald-600 bg-emerald-50"
                                                        )}>
                                                            {isStale ? 'STALE' : 'CONNECTED'}
                                                        </Badge>
                                                        <span className="text-[8px] text-muted-foreground uppercase mt-1">Pulse: {minsInactive}m ago</span>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-right pr-6">
                                                    <Button 
                                                        variant="ghost" 
                                                        size="sm" 
                                                        className="text-destructive h-8 px-3 font-black text-[9px] uppercase tracking-widest hover:bg-red-50"
                                                        onClick={() => handleRevoke(s.id)}
                                                    >
                                                        <LogOut className="h-3 w-3 mr-1.5" /> Revoke Access
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                    {sessions.length === 0 && (
                                        <TableRow><TableCell colSpan={4} className="h-40 text-center text-muted-foreground italic">No active sessions tracked.</TableCell></TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </div>
            </TabsContent>

            <TabsContent value="identities" className="space-y-6 animate-in fade-in slide-in-from-left-2">
                <Card className="shadow-sm border-border bg-card overflow-hidden">
                    <CardHeader className="py-4 border-b bg-muted/5">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-muted/50 rounded-xl"><Fingerprint className="h-5 w-5 text-primary"/></div>
                            <div>
                                <CardTitle className="text-sm font-black uppercase tracking-tight">Reserved Login Mapping</CardTitle>
                                <CardDescription className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Internal registry used for username-to-email resolution during authentication.</CardDescription>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="p-0">
                        <Table className="text-xs">
                            <TableHeader className="bg-muted/30">
                                <TableRow className="hover:bg-transparent h-10">
                                    <TableHead className="pl-6 font-bold uppercase text-[9px]">Username (Login Key)</TableHead>
                                    <TableHead className="font-bold uppercase text-[9px]">Linked Email Identifier</TableHead>
                                    <TableHead className="text-center font-bold uppercase text-[9px]">State</TableHead>
                                    <TableHead className="text-right pr-6 font-bold uppercase text-[9px]">Maintenance</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {usernames.map((entry) => {
                                    const isOrphaned = orphanedUsernames.some(o => o.username === entry.username);
                                    return (
                                        <TableRow key={entry.username} className={cn("h-12 border-b transition-colors", isOrphaned ? "bg-red-50/50" : "hover:bg-muted/10")}>
                                            <TableCell className="pl-6">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-black text-foreground uppercase tracking-tighter">{entry.username}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="font-mono text-muted-foreground">{entry.email}</TableCell>
                                            <TableCell className="text-center">
                                                {isOrphaned ? (
                                                    <Badge variant="destructive" className="text-[8px] uppercase font-black px-1.5 h-4 flex items-center gap-1 mx-auto w-fit">
                                                        <ShieldAlert className="h-2.5 w-2.5"/> Orphaned Entry
                                                    </Badge>
                                                ) : (
                                                    <Badge variant="outline" className="text-[8px] uppercase font-black px-1.5 h-4 text-emerald-600 border-emerald-200 mx-auto w-fit">
                                                        Linked Account
                                                    </Badge>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-right pr-6">
                                                <AlertDialog>
                                                    <AlertDialogTrigger asChild>
                                                        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive transition-colors">
                                                            <Trash2 className="h-3.5 w-3.5" />
                                                        </Button>
                                                    </AlertDialogTrigger>
                                                    <AlertDialogContent>
                                                        <AlertDialogHeader>
                                                            <AlertDialogTitle className="font-black uppercase tracking-tight">Delete Identity Mapping?</AlertDialogTitle>
                                                            <AlertDialogDescription>
                                                                This will remove the reservation for username <span className="font-bold text-foreground">"{entry.username}"</span>. 
                                                                If a user profile exists, they will no longer be able to log in with this username.
                                                            </AlertDialogDescription>
                                                        </AlertDialogHeader>
                                                        <AlertDialogFooter>
                                                            <AlertDialogCancel className="text-[10px] font-bold uppercase">Cancel</AlertDialogCancel>
                                                            <AlertDialogAction onClick={() => deleteUsernameRecord(entry.username)} className="bg-destructive text-white uppercase text-[10px] font-black">Confirm Purge</AlertDialogAction>
                                                        </AlertDialogFooter>
                                                    </AlertDialogContent>
                                                </AlertDialog>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                                {usernames.length === 0 && (
                                    <TableRow><TableCell colSpan={4} className="h-40 text-center text-muted-foreground italic">Identity registry is empty.</TableCell></TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
                {orphanedUsernames.length > 0 && (
                    <div className="p-4 rounded-xl bg-amber-50 border-2 border-amber-200 flex gap-4 animate-in slide-in-from-top-2">
                        <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
                        <div className="space-y-1">
                            <p className="text-[10px] font-black uppercase text-amber-900">System Integrity Warning</p>
                            <p className="text-[11px] text-amber-800 leading-relaxed font-medium">
                                We detected <span className="font-black underline">{orphanedUsernames.length} reserved usernames</span> that do not have matching active user profiles. 
                                This usually happens when a creation attempt was interrupted. You should delete these orphaned records to allow the usernames to be registered again.
                            </p>
                        </div>
                    </div>
                )}
            </TabsContent>

            <TabsContent value="hr-quota" className="space-y-6 animate-in fade-in slide-in-from-left-2">
                <div className="p-4 rounded-xl bg-amber-50 border-2 border-amber-200 flex gap-4">
                    <Gauge className="h-5 w-5 text-amber-600 shrink-0" />
                    <div className="space-y-1">
                        <p className="text-[10px] font-black uppercase text-amber-900">Free-Tier Firestore Quota Guard</p>
                        <p className="text-[11px] text-amber-800 leading-relaxed font-medium">
                            These HR pages each stream a full fiscal year of attendance data on every visit, which previously exceeded Firestore's free-plan daily read limit and blocked writes across the whole app.
                            They are locked by default. Switching one on resumes its Firestore listeners and consumes reads again &mdash; switch it back off once you are done. No data or code is deleted by locking a feature.
                        </p>
                    </div>
                </div>

                <Card className="shadow-sm border-border bg-card overflow-hidden">
                    <CardHeader className="py-4 border-b bg-muted/5">
                        <CardTitle className="text-sm font-black uppercase tracking-tight">HR Feature Locks</CardTitle>
                        <CardDescription className="text-[10px] font-bold uppercase tracking-widest">Per-feature switches, each independent.</CardDescription>
                    </CardHeader>
                    <CardContent className="p-0 divide-y">
                        {([
                            { key: 'attendanceLogsEnabled', label: 'Attendance Logs', cost: '~17,000 reads per visit' },
                            { key: 'dataImportEnabled', label: 'Data Import (Machine Logs & Ledger)', cost: '~8,600 reads per visit' },
                            { key: 'benchmarkEnabled', label: 'Performance Benchmark', cost: '~8,600 reads per visit' },
                            { key: 'payrollAnalyticsEnabled', label: 'Payroll Analytics (Recalculate / Sync / Analytics tab)', cost: '~8,400 reads per visit' },
                        ] as { key: keyof HrFeatureLocks; label: string; cost: string }[]).map(({ key, label, cost }) => (
                            <div key={key} className="flex items-center justify-between p-4">
                                <div className="space-y-0.5">
                                    <Label className="font-bold text-xs uppercase cursor-pointer">{label}</Label>
                                    <p className="text-[9px] text-muted-foreground uppercase font-medium">{cost}</p>
                                </div>
                                <div className="flex items-center gap-2">
                                    {isSavingHrLock === key && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                                    <Switch
                                        checked={hrFeatureLocks[key]}
                                        disabled={isSavingHrLock !== null}
                                        onCheckedChange={(v) => handleToggleHrLock(key, v)}
                                    />
                                </div>
                            </div>
                        ))}
                    </CardContent>
                </Card>

                <Card className="border-destructive/20 bg-destructive/[0.02]">
                    <CardHeader>
                        <CardTitle className="text-sm font-black uppercase flex items-center gap-2 text-destructive">
                            <DatabaseZap className="h-4 w-4" />
                            Purge Attendance Logs (One-Time)
                        </CardTitle>
                        <CardDescription>
                            Permanently deletes stored attendance and raw machine-log records for a fiscal year, so you don't have to keep them around or re-import later.
                            Payroll, bonus, and behavior data on the Payroll page are never touched. This deliberately clears locked/finalized months too, since this is an explicit admin action.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2 max-w-xs">
                            <div className="flex items-center justify-between">
                                <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Fiscal Year</Label>
                                {isLoadingPurgeYears ? (
                                    <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                                ) : (
                                    <button
                                        type="button"
                                        onClick={() => (purgeableFiscalYears && purgeableFiscalYears.length > 0) ? setManualFyEntry(v => !v) : loadPurgeableFiscalYears()}
                                        className="text-[9px] font-bold uppercase text-primary hover:underline"
                                    >
                                        {manualFyEntry && purgeableFiscalYears && purgeableFiscalYears.length > 0 ? 'Choose detected year' : (purgeableFiscalYears && purgeableFiscalYears.length > 0 ? 'Enter manually' : 'Retry detection')}
                                    </button>
                                )}
                            </div>
                            {!manualFyEntry && purgeableFiscalYears && purgeableFiscalYears.length > 0 ? (
                                <Select value={String(purgeFiscalYear)} onValueChange={(v) => setPurgeFiscalYear(Number(v))}>
                                    <SelectTrigger className="h-10 font-bold border-destructive/20">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {purgeableFiscalYears.map(fy => (
                                            <SelectItem key={fy} value={String(fy)}>FY {formatFiscalYear(fy)}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            ) : (
                                <Input
                                    type="number"
                                    value={purgeFiscalYear}
                                    onChange={(e) => setPurgeFiscalYear(Number(e.target.value))}
                                    className="h-10 font-bold border-destructive/20"
                                />
                            )}
                            {purgeableFiscalYears && purgeableFiscalYears.length === 0 && !isLoadingPurgeYears && (
                                <p className="text-[9px] text-muted-foreground italic">No fiscal years with attendance data were detected - enter one manually, or retry detection above.</p>
                            )}
                            <p className="text-[9px] text-muted-foreground italic">FY {formatFiscalYear(purgeFiscalYear)} (Shrawan {purgeFiscalYear} &ndash; Ashadh {purgeFiscalYear + 1})</p>
                        </div>
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button variant="destructive" disabled={isPurgingAttendance} className="h-10 px-8 font-black text-xs uppercase tracking-widest">
                                    {isPurgingAttendance ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                                    Delete Attendance Logs for FY {formatFiscalYear(purgeFiscalYear)}
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>Delete Attendance Logs for FY {formatFiscalYear(purgeFiscalYear)}?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        This permanently deletes every <span className="font-bold text-foreground">attendance</span> and <span className="font-bold text-foreground">raw machine log</span> record for FY {formatFiscalYear(purgeFiscalYear)}, including any locked/finalized months.
                                        Payroll, bonus, and behavior records for this fiscal year are not affected. This cannot be undone.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction onClick={handlePurgeAttendanceLogs} className="bg-destructive text-white hover:bg-destructive/90">Yes, Delete Attendance Logs</AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    </CardContent>
                </Card>
            </TabsContent>

            <TabsContent value="usage" className="space-y-6 animate-in fade-in slide-in-from-left-2">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <Card className="bg-primary/5 border-primary/20 border-l-4 border-l-primary shadow-none">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em] text-primary flex items-center gap-2">
                                <BarChart3 className="h-3 w-3" /> System Traffic
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-3xl font-black text-foreground tabular-nums">
                                {totalUsageViews.toLocaleString('en-IN')}
                                <span className="text-xs font-bold text-muted-foreground ml-2 uppercase tracking-tighter">Total Views</span>
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="bg-muted/10 border-border shadow-none">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-2">
                                <MousePointer2 className="h-3 w-3" /> Unique Paths
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-3xl font-black text-foreground tabular-nums">
                                {aggregatedVisits.length.toLocaleString('en-IN')}
                                <span className="text-xs font-bold text-muted-foreground ml-2 uppercase tracking-tighter">Mapped Routes</span>
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="bg-muted/10 border-border shadow-none">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-2">
                                <Clock className="h-3 w-3" /> Active Period
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-lg font-black text-foreground uppercase">
                                Real-time
                                <span className="text-xs font-bold text-emerald-600 ml-2 uppercase tracking-tighter animate-pulse">Monitoring Active</span>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                <Card className="shadow-sm border-border bg-card overflow-hidden">
                    <CardHeader className="border-b py-4 px-6 bg-muted/5">
                        <CardTitle className="text-sm font-black uppercase tracking-tight text-foreground">Granular Route Analysis</CardTitle>
                        <CardDescription className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Identified modules for development focus. Grouped by canonical normalized path.</CardDescription>
                    </CardHeader>
                    <CardContent className="p-0">
                        <Table className="text-xs">
                            <TableHeader className="bg-muted/30">
                                <TableRow className="hover:bg-transparent h-10">
                                    <TableHead className="pl-6 font-bold uppercase text-[9px]">
                                        <Button variant="ghost" onClick={() => requestTrafficSort('path')} className="-ml-4 h-8 px-2 text-[9px] font-black uppercase tracking-widest text-foreground hover:bg-transparent">
                                            Module / Route Path <ArrowUpDown className={cn("ml-1.5 h-3 w-3", trafficSortConfig.key === 'path' ? "opacity-100 text-primary" : "opacity-30")} />
                                        </Button>
                                    </TableHead>
                                    <TableHead className="font-bold uppercase text-[9px] text-center">
                                        <Button variant="ghost" onClick={() => requestTrafficSort('lastVisited')} className="h-8 px-2 text-[9px] font-black uppercase tracking-widest text-foreground hover:bg-transparent mx-auto">
                                            Last Active <ArrowUpDown className={cn("ml-1.5 h-3 w-3", trafficSortConfig.key === 'lastVisited' ? "opacity-100 text-primary" : "opacity-30")} />
                                        </Button>
                                    </TableHead>
                                    <TableHead className="text-right pr-6 font-bold uppercase text-[9px]">
                                        <Button variant="ghost" onClick={() => requestTrafficSort('count')} className="-mr-4 h-8 px-2 text-[9px] font-black uppercase tracking-widest text-foreground hover:bg-transparent ml-auto">
                                            Total Engagement (Hits) <ArrowUpDown className={cn("ml-1.5 h-3 w-3", trafficSortConfig.key === 'count' ? "opacity-100 text-primary" : "opacity-30")} />
                                        </Button>
                                    </TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {aggregatedVisits.length > 0 ? aggregatedVisits.map((visit) => (
                                    <TableRow key={visit.path} className="h-12 border-b transition-colors hover:bg-muted/20 group">
                                        <TableCell className="pl-6">
                                            <div className="flex items-center gap-3">
                                                <div className="w-1.5 h-1.5 rounded-full bg-primary/40 group-hover:bg-primary transition-colors" />
                                                <span className="font-black text-foreground font-mono tracking-tight text-[11px]">
                                                    {visit.path === '/' ? '/ROOT' : visit.path}
                                                </span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-center font-medium text-muted-foreground text-[10px]">
                                            {visit.lastVisited ? formatDistanceToNow(new Date(visit.lastVisited), { addSuffix: true }) : 'N/A'}
                                        </TableCell>
                                        <TableCell className="text-right pr-6">
                                            <div className="flex items-center justify-end gap-3">
                                                <div className="w-24 h-1.5 bg-muted rounded-full overflow-hidden shrink-0 hidden sm:block">
                                                    <div 
                                                        className="h-full bg-primary" 
                                                        style={{ width: `${Math.min(100, (visit.count / totalUsageViews) * 500)}%` }} 
                                                    />
                                                </div>
                                                <span className="font-black tabular-nums text-blue-900">{visit.count.toLocaleString('en-IN')}</span>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                )) : (
                                    <TableRow>
                                        <TableCell colSpan={3} className="h-40 text-center text-muted-foreground italic uppercase text-[10px] font-black tracking-widest">
                                            Waiting for data sync...
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            </TabsContent>

            <TabsContent value="logs" className="space-y-6 animate-in fade-in slide-in-from-left-2">
                <Card className="shadow-sm border-border bg-card overflow-hidden">
                    <CardHeader className="py-4 border-b bg-red-50/10"><CardTitle className="text-sm font-black uppercase">System Audit Log</CardTitle></CardHeader>
                    <CardContent className="p-0">
                        <Table className="text-[10px]"><TableHeader className="bg-muted/50"><TableRow><TableHead className="pl-6">Time</TableHead><TableHead>Scope</TableHead><TableHead>Message</TableHead></TableRow></TableHeader>
                        <TableBody>{logs.map((log: any, idx) => (
                            <TableRow key={log.id || idx} className="h-10 border-b">
                                <TableCell className="pl-6 font-mono text-muted-foreground">{log.timestamp ? format(new Date(log.timestamp), 'HH:mm:ss') : '-'}</TableCell>
                                <TableCell><Badge variant="outline" className="text-[8px] uppercase">{log.module || 'Global'}</Badge></TableCell>
                                <TableCell className="font-medium">{log.message}</TableCell>
                            </TableRow>
                        ))}</TableBody></Table>
                    </CardContent>
                </Card>
            </TabsContent>

            <TabsContent value="backup" className="space-y-6 animate-in fade-in slide-in-from-left-2">
                <Card className="border-dashed border-primary/20 bg-primary/[0.02]">
                    <CardHeader>
                        <CardTitle className="text-sm font-black uppercase flex items-center gap-2">
                            <Download className="h-4 w-4 text-primary" />
                            Data Preservation
                        </CardTitle>
                        <CardDescription>Download a snapshot of the database for local archiving. Only administrators get the automatic weekly copy; this button is for any time.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <label className="flex items-start gap-2 text-xs">
                            <Checkbox checked={backupIncludeRawLogs} onCheckedChange={(v) => setBackupIncludeRawLogs(v === true)} className="mt-0.5" />
                            <span>Include raw machine logs (fingerprint punches). This is the largest collection and uses many of the free daily reads; attendance already calculated from them is always included.</span>
                        </label>
                        <Button onClick={handleManualBackup} disabled={isExporting} className="h-10 px-8 font-black text-xs uppercase tracking-widest shadow-lg">
                            {isExporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                            Download System Snapshot
                        </Button>
                    </CardContent>
                </Card>

                <Card className="border-destructive/20 bg-destructive/[0.02]">
                    <CardHeader>
                        <CardTitle className="text-sm font-black uppercase flex items-center gap-2 text-destructive">
                            <RefreshCcw className="h-4 w-4" />
                            Database Restoration
                        </CardTitle>
                        <CardDescription>Upload a snapshot, check what it would change, then restore. Records in the file are added or brought back to their backed-up version first; nothing is deleted unless you tick the option below. User accounts and logs are never touched.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Select Snapshot File</Label>
                            <Input type="file" accept=".json,.gz" onChange={handleRestoreFileChange} ref={restoreInputRef} className="max-w-md h-10 border-destructive/20 bg-card" />
                        </div>
                        {!restorePlan && (
                            <Button variant="outline" onClick={handleCheckRestore} disabled={!restoreFile || isPlanningRestore} className="h-10 px-8 font-black text-xs uppercase tracking-widest">
                                {isPlanningRestore ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <SearchCheck className="mr-2 h-4 w-4" />}
                                Check Backup
                            </Button>
                        )}
                        {restorePlan && (
                            <div className="space-y-3">
                                <p className="text-xs text-muted-foreground">
                                    Backup taken {restorePlan.createdAt ? new Date(restorePlan.createdAt).toLocaleString() : 'at an unknown date'}.
                                    Restoring writes {(restoreTotals.add + restoreTotals.update).toLocaleString('en-IN')} records
                                    {restoreDeleteExtra ? ` and deletes ${restoreTotals.extra.toLocaleString('en-IN')}` : ''}.
                                </p>
                                <div className="max-h-72 overflow-auto border rounded-md">
                                    <Table className="text-[11px]">
                                        <TableHeader className="bg-muted/50"><TableRow>
                                            <TableHead>Collection</TableHead><TableHead className="text-right">Add</TableHead><TableHead className="text-right">Update</TableHead>
                                            <TableHead className="text-right">Unchanged</TableHead><TableHead className="text-right">Not in backup</TableHead><TableHead className="text-right">Locked, skipped</TableHead>
                                        </TableRow></TableHeader>
                                        <TableBody>
                                            {restorePlan.collections.filter(c => c.add.length || c.update.length || c.extra.length || c.lockedSkipped).map(c => (
                                                <TableRow key={c.collection}>
                                                    <TableCell className="font-mono">{c.collection}</TableCell>
                                                    <TableCell className="text-right">{c.add.length}</TableCell>
                                                    <TableCell className="text-right">{c.update.length}</TableCell>
                                                    <TableCell className="text-right text-muted-foreground">{c.unchanged}</TableCell>
                                                    <TableCell className="text-right">{c.extra.length}</TableCell>
                                                    <TableCell className="text-right">{c.lockedSkipped}</TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                                {restoreTotals.locked > 0 && (
                                    <p className="text-xs text-amber-600">{restoreTotals.locked} changed payroll/attendance records are in locked months and will be left as they are. Unlock those months first if they must be restored.</p>
                                )}
                                {restorePlan.ignored.length > 0 && (
                                    <p className="text-xs text-muted-foreground">Not restored: {restorePlan.ignored.map(i => `${i.collection} (${i.reason})`).join('; ')}.</p>
                                )}
                                {restoreTotals.extra > 0 && (
                                    <label className="flex items-start gap-2 text-xs">
                                        <Checkbox checked={restoreDeleteExtra} onCheckedChange={(v) => setRestoreDeleteExtra(v === true)} className="mt-0.5" />
                                        <span>Also delete the {restoreTotals.extra.toLocaleString('en-IN')} records that are not in the backup (anything created after it was taken). Deletion runs only after every write has finished.</span>
                                    </label>
                                )}
                                {restoreTotals.add + restoreTotals.update + restoreTotals.extra > 15000 && (
                                    <p className="text-xs text-destructive">This is more than most of the free daily write limit (20,000). It may stop part-way; running the check and restore again the next day finishes it.</p>
                                )}
                            </div>
                        )}
                        {restorePlan && (
                        <AlertDialog onOpenChange={(open) => { if (!open) setRestorePassword(''); }}>
                            <AlertDialogTrigger asChild>
                                <Button variant="destructive" disabled={isRestoring || (restoreTotals.add + restoreTotals.update + (restoreDeleteExtra ? restoreTotals.extra : 0)) === 0} className="h-10 px-8 font-black text-xs uppercase tracking-widest">
                                    {isRestoring ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />}
                                    Restore
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>Restore from backup?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        {(restoreTotals.add + restoreTotals.update).toLocaleString('en-IN')} records will be written back to their backed-up version
                                        {restoreDeleteExtra ? `, then ${restoreTotals.extra.toLocaleString('en-IN')} records not in the backup will be deleted` : ''}.
                                        Changes made since the backup to those records will be lost. Download a fresh snapshot first if you may need them.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <div className="space-y-2 py-2">
                                    <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Confirm Administrator Password</Label>
                                    <Input
                                        type="password"
                                        autoComplete="current-password"
                                        placeholder="Enter your password to authorize this restore"
                                        value={restorePassword}
                                        onChange={(e) => setRestorePassword(e.target.value)}
                                        className="h-10 border-destructive/20"
                                    />
                                </div>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>Abort</AlertDialogCancel>
                                    <AlertDialogAction onClick={handleConfirmRestore} disabled={!restorePassword || isRestoring} className="bg-destructive text-white hover:bg-destructive/90">Yes, Restore</AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                        )}
                    </CardContent>
                </Card>
            </TabsContent>
        </Tabs>

        {/* User Permission Dialog */}
        <Dialog open={isUserDialogOpen} onOpenChange={setIsUserDialogOpen}>
            <DialogContent className="sm:max-w-4xl max-h-[90vh] flex flex-col p-0 overflow-hidden shadow-2xl border-none">
                <DialogHeader className="p-6 border-b bg-muted/5 shrink-0">
                    <DialogTitle className="text-xl font-black uppercase tracking-tight">{editingUser ? 'Edit User Access' : 'New User Onboarding'}</DialogTitle>
                    <DialogDescription className="text-xs uppercase font-bold text-muted-foreground">Define identity, security profile, and operational boundaries.</DialogDescription>
                </DialogHeader>
                
                <ScrollArea className="flex-1">
                    <div className="p-8 space-y-10">
                        {/* 1. Identity Grid */}
                        <section className="space-y-4">
                            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-primary flex items-center gap-2">
                                <Fingerprint className="h-3.5 w-3.5" />
                                Authentication Profile
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <div className="space-y-1.5">
                                    <Label className="text-[10px] font-black uppercase text-muted-foreground px-1">Login Username</Label>
                                    <div className="relative">
                                        <UserIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground"/>
                                        <Input value={userForm.username} onChange={e => setUserForm(p => ({...p, username: e.target.value}))} disabled={!!editingUser} placeholder="e.g. jdoe" className="h-10 pl-8 font-bold" />
                                    </div>
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-[10px] font-black uppercase text-muted-foreground px-1">Email Identifier</Label>
                                    <div className="relative">
                                        <Mail className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground"/>
                                        <Input value={userForm.email} onChange={e => setUserForm(p => ({...p, email: e.target.value}))} placeholder="user@example.com" className="h-10 pl-8" />
                                    </div>
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-[10px] font-black uppercase text-muted-foreground px-1">Access Credential</Label>
                                    <Input type="password" value={userForm.password} onChange={e => { setUserForm(p => ({...p, password: e.target.value})); setPasswordError(null); }} placeholder={editingUser ? "Leave blank to keep" : `${MIN_PASSWORD_LENGTH}+ chars, mixed case, a number`} className="h-10 font-mono" />
                                    {passwordError && <p className="text-[8px] font-black text-red-600 uppercase tracking-tighter mt-1">{passwordError}</p>}
                                </div>
                            </div>

                            <div className="flex flex-col sm:flex-row gap-6 p-4 rounded-xl bg-muted border border-border">
                                <div className="flex items-center gap-3">
                                    <Switch checked={userForm.isAdmin} onCheckedChange={v => setUserForm(p => ({...p, isAdmin: v}))} />
                                    <div className="space-y-0.5">
                                        <Label className="font-bold text-xs uppercase cursor-pointer">Administrative Access</Label>
                                        <p className="text-[9px] text-muted-foreground uppercase font-medium">Bypass all modular permission checks.</p>
                                    </div>
                                </div>
                                <Separator orientation="vertical" className="h-8 hidden sm:block" />
                                <div className="flex items-center gap-3">
                                    <Switch checked={userForm.isApproved} onCheckedChange={v => setUserForm(p => ({...p, isApproved: v}))} />
                                    <div className="space-y-0.5">
                                        <Label className="font-bold text-xs uppercase cursor-pointer">Account Active</Label>
                                        <p className="text-[9px] text-muted-foreground uppercase font-medium">Toggle login access without deleting record.</p>
                                    </div>
                                </div>
                            </div>
                        </section>

                        {/* 2. Capability Map with Internal Scroll */}
                        {!userForm.isAdmin && (
                            <section className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-primary flex items-center gap-2">
                                        <ListTree className="h-3.5 w-3.5" />
                                        Granular Capability Map
                                    </h3>
                                    <Badge variant="outline" className="text-[8px] font-black uppercase bg-primary/5">Module Control</Badge>
                                </div>
                                
                                <div className="border rounded-xl overflow-hidden shadow-sm bg-card">
                                    <div className="bg-muted/50 border-b px-4 py-2 flex items-center text-[10px] font-black uppercase text-muted-foreground tracking-widest">
                                        <div className="flex-1">Functional Module</div>
                                        <div className="w-[180px] text-center">Operational Rights</div>
                                        <div className="w-[200px] text-center">Organizational Scope</div>
                                    </div>
                                    
                                    <ScrollArea className="h-[400px]">
                                        <div className="divide-y">
                                            {modules.map(m => {
                                                const curr = userForm.permissions[m] || { actions: [], ownerships: [] };
                                                return (
                                                    <div key={m} className="flex items-center p-4 hover:bg-muted/5 transition-colors group">
                                                        <div className="flex-1">
                                                            <p className="font-black text-foreground uppercase tracking-tighter text-xs">{getModuleDisplayName(m)}</p>
                                                            <p className="text-[9px] text-muted-foreground uppercase font-bold">{m}</p>
                                                        </div>
                                                        
                                                        <div className="w-[180px] flex justify-center gap-3">
                                                            {['view', 'add', 'edit', 'delete'].map(act => (
                                                                <div key={act} className="flex flex-col items-center gap-1">
                                                                    <Checkbox 
                                                                        checked={curr.actions.includes(act as any)} 
                                                                        onCheckedChange={v => handlePermissionChange(m, act as any, !!v)} 
                                                                    />
                                                                    <span className="text-[7px] font-black uppercase text-muted-foreground/60">{act}</span>
                                                                </div>
                                                            ))}
                                                        </div>

                                                        <div className="w-[200px]">
                                                            <div className="flex justify-center gap-2 flex-wrap px-2">
                                                                {ownershipCategories
                                                                    .filter(cat => cat.modules?.includes(m))
                                                                    .map(cat => (
                                                                        <div key={cat.name} className="flex flex-col items-center gap-1">
                                                                            <Checkbox 
                                                                                checked={curr.ownerships.includes(cat.name)} 
                                                                                onCheckedChange={v => handleOwnershipChange(m, cat.name, !!v)} 
                                                                                className="h-3.5 w-3.5"
                                                                            />
                                                                            <span className="text-[7px] font-black uppercase text-primary/70">{cat.name}</span>
                                                                        </div>
                                                                    ))
                                                                }
                                                                {ownershipCategories.filter(cat => cat.modules?.includes(m)).length === 0 && (
                                                                    <span className="text-[8px] text-muted-foreground italic uppercase">Global Only</span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                        <ScrollBar orientation="vertical" />
                                    </ScrollArea>
                                </div>
                            </section>
                        )}
                    </div>
                </ScrollArea>

                <DialogFooter className="p-6 border-t bg-card shrink-0">
                    <Button variant="outline" onClick={() => setIsUserDialogOpen(false)} className="font-bold uppercase text-[10px] tracking-widest h-11 px-8 border-border">Cancel</Button>
                    <Button onClick={handleUserSubmit} disabled={isSubmittingUser} className="font-black uppercase text-[10px] tracking-widest h-11 px-12 shadow-xl shadow-primary/20">
                        {isSubmittingUser ? <Loader2 className="animate-spin mr-2 h-4 w-4"/> : <ShieldCheck className="mr-2 h-4 w-4"/>}
                        Authorize & Commit Profile
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>

        {/* Password Update Dialog */}
        <Dialog open={isChangePasswordDialogOpen} onOpenChange={setIsChangePasswordDialogOpen}>
            <DialogContent>
                <DialogHeader><DialogTitle>Update Security Key</DialogTitle></DialogHeader>
                <div className="space-y-4 py-4">
                    <div className="space-y-2"><Label>New Password</Label><Input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} /></div>
                    <div className="space-y-2"><Label>Verify Password</Label><Input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} /></div>
                    {changePasswordError && <p className="text-red-600 text-xs font-bold uppercase">{changePasswordError}</p>}
                </div>
                <DialogFooter><Button onClick={handleChangePassword} className="w-full">Update & Re-authenticate</Button></DialogFooter>
            </DialogContent>
        </Dialog>
    </div>
  );
}
