
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
import { 
  Plus, 
  Edit, 
  Trash2, 
  MoreHorizontal, 
  Search, 
  KeyRound, 
  Loader2,
  ShieldCheck,
  History,
  Terminal,
  Download,
  RefreshCcw,
  BarChart3,
  MousePointer2,
  Clock,
  ArrowUpDown,
  X,
  Fingerprint,
  Mail,
  User as UserIcon,
  ShieldAlert,
  AlertTriangle,
  ListTree,
  Monitor,
  LogOut,
  Settings2,
  Save,
  Sparkles,
  Timer
} from 'lucide-react';
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
import { 
    DropdownMenu, 
    DropdownMenuContent, 
    DropdownMenuItem, 
    DropdownMenuTrigger, 
    DropdownMenuSeparator
} from '@/components/ui/dropdown-menu';
import { 
    onUsersUpdate,
    saveUser,
    deleteUser as deleteUserService,
    validatePassword, 
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
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { useAuthService } from '@/firebase';
import { exportData, importData } from '@/services/backup-service';
import { Separator } from '@/components/ui/separator';

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
  const restoreInputRef = useRef<HTMLInputElement>(null);
  const [isCleaningSessions, setIsCleaningSessions] = useState(false);

  const [localWorkstationName, setLocalWorkstationName] = useState('');
  const [isRenamingWorkstation, setIsRenamingWorkstation] = useState(false);

  const [trafficSortConfig, setTrafficSortConfig] = useState<{ key: 'path' | 'lastVisited' | 'count'; direction: 'asc' | 'desc' }>({
    key: 'count',
    direction: 'desc'
  });

  useEffect(() => {
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
  }, []);

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
        setUserForm({ username: '', email: '', isApproved: true, isAdmin: false, password: '', permissions: freshPermissions });
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

    const { isValid, error } = validatePassword(userForm.password, !isEditing);
    if (!isValid) { setPasswordError(error!); return; }
    
    setIsSubmittingUser(true);
    try {
        let finalUserId = editingUser?.id || '';
        if (!isEditing) {
            const authUser = await adminCreateUserWithUsername(auth, userForm.username, userForm.email, userForm.password);
            finalUserId = authUser.uid;
        }
        await saveUser({ id: finalUserId, username: userForm.username.toLowerCase().trim(), email: userForm.email.toLowerCase().trim(), isApproved: userForm.isApproved, isAdmin: userForm.isAdmin, permissions: userForm.permissions });
        toast({ title: 'User Account Updated' });
        setIsUserDialogOpen(false);
    } catch (e: any) {
        toast({ title: 'Error', description: e.message, variant: 'destructive' });
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
        const data = await exportData();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `starsutra-manual-backup-${new Date().toISOString()}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        toast({ title: 'Success', description: 'Backup file generated.' });
    } catch {
        toast({ title: 'Backup Failed', variant: 'destructive' });
    } finally {
        setIsExporting(false);
    }
  };

  const handleRestoreFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setRestoreFile(file);
  };

  const handleConfirmRestore = async () => {
    if (!restoreFile || !user) return;
    setIsRestoring(true);
    try {
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const content = e.target?.result as string;
                const data = JSON.parse(content);
                await importData(data);
                toast({ title: 'Restore Complete', description: 'The database has been updated.' });
                setRestoreFile(null);
                if (restoreInputRef.current) restoreInputRef.current.value = '';
            } catch (err) {
                toast({ title: 'Restore Failed', description: 'Invalid backup file format.', variant: 'destructive' });
            } finally {
                setIsRestoring(false);
            }
        };
        reader.readAsText(restoreFile);
    } catch {
        setIsRestoring(false);
        toast({ title: 'Error', description: 'Could not read restore file.', variant: 'destructive' });
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
        toast({ title: 'Session Revoked' });
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

  return (
    <div className="flex flex-col gap-8">
        <header className="flex items-center justify-between">
            <div>
                <h1 className="text-3xl font-bold tracking-tight text-gray-900">System & Security</h1>
                <p className="text-muted-foreground text-sm">RBAC, cloud logs, and usage analytics.</p>
            </div>
            <div className="flex gap-2">
                <Button size="sm" onClick={() => openUserDialog()} className="h-10 font-black text-xs uppercase tracking-widest"><Plus className="mr-2 h-4 w-4" /> Add User</Button>
            </div>
        </header>

        <Tabs defaultValue="users" className="w-full">
            <TabsList className="bg-muted/50 p-1 mb-6 h-auto flex-wrap">
                <TabsTrigger value="users" className="px-6 py-2 text-[10px] uppercase font-bold tracking-widest">Access Control</TabsTrigger>
                <TabsTrigger value="sessions" className="px-6 py-2 text-[10px] uppercase font-bold tracking-widest flex items-center gap-2">
                    <Monitor className="h-3.5 w-3.5" /> Sessions
                    <Badge variant="outline" className="h-4 px-1 text-[8px] bg-primary/10">{sessions.length}</Badge>
                </TabsTrigger>
                <TabsTrigger value="identities" className="px-6 py-2 text-[10px] uppercase font-bold tracking-widest flex items-center gap-2">
                    Identity Registry
                    {orphanedUsernames.length > 0 && <Badge className="bg-red-500 h-4 px-1 text-[8px]">{orphanedUsernames.length}</Badge>}
                </TabsTrigger>
                <TabsTrigger value="usage" className="px-6 py-2 text-[10px] uppercase font-bold tracking-widest">Usage Stats</TabsTrigger>
                <TabsTrigger value="logs" className="px-6 py-2 text-[10px] uppercase font-bold tracking-widest">Audit Logs</TabsTrigger>
                <TabsTrigger value="backup" className="px-6 py-2 text-[10px] uppercase font-bold tracking-widest">Backup & Recovery</TabsTrigger>
            </TabsList>

            <TabsContent value="users" className="space-y-6 animate-in fade-in slide-in-from-left-2">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-1 space-y-6">
                        <Card className="shadow-sm border-gray-100 h-fit">
                            <CardHeader className="bg-muted/30 py-4 px-6 border-b"><CardTitle className="text-xs uppercase font-black">My Account</CardTitle></CardHeader>
                            <CardContent className="p-6 space-y-6">
                                <p className="font-black text-lg text-gray-900 uppercase leading-none">{user?.username}</p>
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
                                        <p className="text-[9px] text-muted-foreground italic leading-relaxed">Assign a descriptive name to this computer for easier administrative identification.</p>
                                    </div>
                                    <Button onClick={() => setIsChangePasswordDialogOpen(true)} variant="outline" className="w-full h-10 text-xs font-bold"><KeyRound className="mr-2 h-4 w-4"/> Update Password</Button>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                    <Card className="lg:col-span-2 shadow-sm border-gray-100 bg-white overflow-hidden">
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
                                Maintenance Controls
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-6 pt-6">
                            <div className="space-y-2">
                                <Label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">Inactivity Timeout (Min)</Label>
                                <div className="flex gap-2">
                                    <Input type="number" value={sessionThreshold} onChange={e => setSessionThreshold(Number(e.target.value))} className="font-black h-9" />
                                    <Button size="icon" className="h-9 w-9" onClick={handleUpdateSessionConfig} title="Save Policy"><Save className="h-4 w-4" /></Button>
                                </div>
                                <p className="text-[9px] text-muted-foreground leading-relaxed italic">Sessions with no heartbeat for longer than this period will be marked as stale and require re-authentication.</p>
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

                    <Card className="lg:col-span-2 shadow-sm border-gray-100 bg-white overflow-hidden">
                        <CardHeader className="py-4 border-b bg-muted/5">
                            <CardTitle className="text-sm font-black uppercase tracking-tight">Active Workstations</CardTitle>
                            <CardDescription className="text-[10px] font-bold uppercase tracking-widest">Real-time monitoring of authenticated cloud sessions.</CardDescription>
                        </CardHeader>
                        <CardContent className="p-0">
                            <Table className="text-xs">
                                <TableHeader className="bg-muted/30">
                                    <TableRow className="h-10 hover:bg-transparent">
                                        <TableHead className="pl-6 font-bold uppercase text-[9px]">Workstation / Label</TableHead>
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
                                                        <span className="font-black text-gray-900 uppercase tracking-tighter">{s.deviceName || `WS-${s.deviceId.substring(0,4).toUpperCase()}`}</span>
                                                        <span className="text-[9px] text-muted-foreground italic truncate max-w-[120px]" title={s.userAgent}>{s.userAgent}</span>
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex flex-col">
                                                        <span className="font-bold text-gray-700 uppercase">{s.username}</span>
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
                <Card className="shadow-sm border-gray-100 bg-white overflow-hidden">
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
                                                    <span className="font-black text-gray-900 uppercase tracking-tighter">{entry.username}</span>
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
                                                                This will remove the reservation for username <span className="font-bold text-gray-900">"{entry.username}"</span>. 
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

            <TabsContent value="usage" className="space-y-6 animate-in fade-in slide-in-from-left-2">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <Card className="bg-primary/5 border-primary/20 border-l-4 border-l-primary shadow-none">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em] text-primary flex items-center gap-2">
                                <BarChart3 className="h-3 w-3" /> System Traffic
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-3xl font-black text-gray-900 tabular-nums">
                                {totalUsageViews.toLocaleString()}
                                <span className="text-xs font-bold text-muted-foreground ml-2 uppercase tracking-tighter">Total Views</span>
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="bg-muted/10 border-gray-200 shadow-none">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-2">
                                <MousePointer2 className="h-3 w-3" /> Unique Paths
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-3xl font-black text-gray-900 tabular-nums">
                                {aggregatedVisits.length.toLocaleString()}
                                <span className="text-xs font-bold text-muted-foreground ml-2 uppercase tracking-tighter">Mapped Routes</span>
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="bg-muted/10 border-gray-200 shadow-none">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-2">
                                <Clock className="h-3 w-3" /> Active Period
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-lg font-black text-gray-900 uppercase">
                                Real-time
                                <span className="text-xs font-bold text-emerald-600 ml-2 uppercase tracking-tighter animate-pulse">Monitoring Active</span>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                <Card className="shadow-sm border-gray-100 bg-white overflow-hidden">
                    <CardHeader className="border-b py-4 px-6 bg-muted/5">
                        <CardTitle className="text-sm font-black uppercase tracking-tight text-gray-900">Granular Route Analysis</CardTitle>
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
                                                <span className="font-black text-gray-900 font-mono tracking-tight text-[11px]">
                                                    {visit.path === '/' ? '/ROOT' : visit.path}
                                                </span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-center font-medium text-muted-foreground text-[10px]">
                                            {visit.lastVisited ? formatDistanceToNow(new Date(visit.lastVisited), { addSuffix: true }) : 'N/A'}
                                        </TableCell>
                                        <TableCell className="text-right pr-6">
                                            <div className="flex items-center justify-end gap-3">
                                                <div className="w-24 h-1.5 bg-gray-100 rounded-full overflow-hidden shrink-0 hidden sm:block">
                                                    <div 
                                                        className="h-full bg-primary" 
                                                        style={{ width: `${Math.min(100, (visit.count / totalUsageViews) * 500)}%` }} 
                                                    />
                                                </div>
                                                <span className="font-black tabular-nums text-blue-900">{visit.count.toLocaleString()}</span>
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
                <Card className="shadow-sm border-gray-100 bg-white overflow-hidden">
                    <CardHeader className="py-4 border-b bg-red-50/10"><CardTitle className="text-sm font-black uppercase">System Audit Log</CardTitle></CardHeader>
                    <CardContent className="p-0">
                        <Table className="text-[10px]"><TableHeader className="bg-muted/50"><TableRow><TableHead className="pl-6">Time</TableHead><TableHead>Scope</TableHead><TableHead>Message</TableHead></TableRow></TableHeader>
                        <TableBody>{logs.map((log: any, idx) => (
                            <TableRow key={log.id || idx} className="h-10 border-b">
                                <TableCell className="pl-6 font-mono text-gray-500">{log.timestamp ? format(new Date(log.timestamp), 'HH:mm:ss') : '-'}</TableCell>
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
                        <CardDescription>Download a full snapshot of the system database for local archiving.</CardDescription>
                    </CardHeader>
                    <CardContent>
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
                        <CardDescription>Upload a previously downloaded .json snapshot to restore system data. THIS WILL OVERWRITE ALL CURRENT DATA.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Select Snapshot File</Label>
                            <Input type="file" accept=".json" onChange={handleRestoreFileChange} ref={restoreInputRef} className="max-w-md h-10 border-destructive/20 bg-white" />
                        </div>
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button variant="destructive" disabled={!restoreFile || isRestoring} className="h-10 px-8 font-black text-xs uppercase tracking-widest">
                                    {isRestoring ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />}
                                    Execute Full Restore
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>CRITICAL: System Restore Initiated</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        This action is highly destructive. All current records in the database will be deleted and replaced with the contents of the uploaded snapshot.
                                        This cannot be undone. Are you absolutely certain?
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>Abort</AlertDialogCancel>
                                    <AlertDialogAction onClick={handleConfirmRestore} className="bg-destructive text-white hover:bg-destructive/90">Yes, Restore System</AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
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
                                    <Input type="password" value={userForm.password} onChange={e => { setUserForm(p => ({...p, password: e.target.value})); setPasswordError(null); }} placeholder={editingUser ? "Leave blank to keep" : "Minimum 6 chars"} className="h-10 font-mono" />
                                    {passwordError && <p className="text-[8px] font-black text-red-600 uppercase tracking-tighter mt-1">{passwordError}</p>}
                                </div>
                            </div>

                            <div className="flex flex-col sm:flex-row gap-6 p-4 rounded-xl bg-gray-50 border border-gray-200">
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
                                
                                <div className="border rounded-xl overflow-hidden shadow-sm bg-white">
                                    <div className="bg-muted/50 border-b px-4 py-2 flex items-center text-[10px] font-black uppercase text-muted-foreground tracking-widest">
                                        <div className="flex-1">Functional Module</div>
                                        <div className="w-[180px] text-center">Actions</div>
                                        <div className="w-[200px] text-center">Organization Scope</div>
                                    </div>
                                    
                                    <ScrollArea className="h-[400px]">
                                        <div className="divide-y">
                                            {modules.map(m => {
                                                const curr = userForm.permissions[m] || { actions: [], ownerships: [] };
                                                return (
                                                    <div key={m} className="flex items-center p-4 hover:bg-muted/5 transition-colors group">
                                                        <div className="flex-1">
                                                            <p className="font-black text-gray-900 uppercase tracking-tighter text-xs">{getModuleDisplayName(m)}</p>
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

                <DialogFooter className="p-6 border-t bg-white shrink-0">
                    <Button variant="outline" onClick={() => setIsUserDialogOpen(false)} className="font-bold uppercase text-[10px] tracking-widest h-11 px-8 border-gray-300">Cancel</Button>
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
