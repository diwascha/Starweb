'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import type { 
  User, 
  Permissions, 
  Module, 
  Action, 
  AccountOwnership,
  PageVisit,
  OwnershipCategory
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
  X
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/hooks/use-auth';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { onPageVisitsUpdate } from '@/services/usage-service';
import { onLogsUpdate, type SystemLog } from '@/services/log-service';
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
    adminCreateUserWithUsername 
} from '@/services/user-service';
import { modules, actions } from '@/lib/types';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { format, formatDistanceToNow } from 'date-fns';
import { cn, getNormalizedPath } from '@/lib/utils';
import { Switch } from '@/components/ui/switch';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { useAuthService } from '@/firebase';
import { onSettingUpdate } from '@/services/settings-service';
import { exportData, importData } from '@/services/backup-service';

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
  const [pageVisits, setPageVisits] = useState<PageVisit[]>([]);
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [ownershipCategories, setOwnershipCategories] = useState<OwnershipCategory[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

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

  const [trafficSortConfig, setTrafficSortConfig] = useState<{ key: 'path' | 'lastVisited' | 'count'; direction: 'asc' | 'desc' }>({
    key: 'count',
    direction: 'desc'
  });

  useEffect(() => {
    const unsubs = [
        onUsersUpdate(setUsers),
        onPageVisitsUpdate(setPageVisits),
        onLogsUpdate(setLogs),
        onSettingUpdate('ownership_categories', (s: any) => { 
            const defaults = ['Sijan', 'Shivam', 'Rental', 'Both'];
            let raw = s?.value || [];
            if (!Array.isArray(raw)) raw = [];

            const normalized = raw.map((item: any) => {
                if (typeof item === 'string') return { name: item, modules: Array.from(modules) };
                return item as OwnershipCategory;
            });

            // Ensure defaults are present for mapping permissions
            const existing = new Set(normalized.map((c: OwnershipCategory) => c.name));
            defaults.forEach(d => {
                if (!existing.has(d)) {
                    normalized.push({ name: d, modules: Array.from(modules) });
                }
            });

            setOwnershipCategories(normalized.sort((a: OwnershipCategory, b: OwnershipCategory) => a.name.localeCompare(b.name)));
        }),
    ];
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
        // Use the robust normalization to group paths like /dashboard and /dashboard/
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
            <TabsList className="bg-muted/50 p-1 mb-6">
                <TabsTrigger value="users" className="px-6 text-[10px] uppercase font-bold tracking-widest">Access Control</TabsTrigger>
                <TabsTrigger value="usage" className="px-6 text-[10px] uppercase font-bold tracking-widest">Usage Stats</TabsTrigger>
                <TabsTrigger value="logs" className="px-6 text-[10px] uppercase font-bold tracking-widest">Audit Logs</TabsTrigger>
                <TabsTrigger value="backup" className="px-6 text-[10px] uppercase font-bold tracking-widest">Backup & Recovery</TabsTrigger>
            </TabsList>

            <TabsContent value="users" className="space-y-6 animate-in fade-in slide-in-from-left-2">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <Card className="lg:col-span-1 shadow-sm border-gray-100 h-fit">
                        <CardHeader className="bg-muted/30 py-4 px-6 border-b"><CardTitle className="text-xs uppercase font-black">My Account</CardTitle></CardHeader>
                        <CardContent className="p-6 space-y-4">
                            <p className="font-black text-lg text-gray-900 uppercase">{user?.username}</p>
                            <Button onClick={() => setIsChangePasswordDialogOpen(true)} variant="outline" className="w-full h-10 text-xs font-bold"><KeyRound className="mr-2 h-4 w-4"/> Update Password</Button>
                        </CardContent>
                    </Card>
                    <Card className="lg:col-span-2 shadow-sm border-gray-100 bg-white overflow-hidden">
                        <CardHeader className="py-4 border-b bg-primary/5"><CardTitle className="text-sm font-black uppercase">User Directory</CardTitle></CardHeader>
                        <CardContent className="p-0">
                            <Table className="text-xs">
                                <TableHeader className="bg-muted/50"><TableRow><TableHead className="pl-6 font-bold">Username</TableHead><TableHead>Identifier</TableHead><TableHead className="text-center">Status</TableHead><TableHead className="text-right pr-6">Actions</TableHead></TableRow></TableHeader>
                                <TableBody>
                                    {users.filter(u => u.username.includes(searchQuery.toLowerCase())).map(u => (
                                        <TableRow key={u.id} className="h-14">
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

            <TabsContent value="logs" className="animate-in fade-in slide-in-from-left-2">
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
            <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0 overflow-hidden shadow-2xl border-none">
                <DialogHeader className="p-6 border-b bg-muted/5 shrink-0">
                    <DialogTitle className="text-xl font-black uppercase tracking-tight">{editingUser ? 'Edit Permissions' : 'New User Access'}</DialogTitle>
                    <DialogDescription className="text-xs uppercase font-bold text-muted-foreground">Define scope and operational limits.</DialogDescription>
                </DialogHeader>
                <ScrollArea className="flex-1 p-6">
                    <div className="space-y-8">
                        <div className="grid grid-cols-2 gap-6">
                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-black uppercase text-muted-foreground px-1">Login Username</Label>
                                <Input value={userForm.username} onChange={e => setUserForm(p => ({...p, username: e.target.value}))} disabled={!!editingUser} className="h-10 font-bold" />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-black uppercase text-muted-foreground px-1">Credential</Label>
                                <Input type="password" value={userForm.password} onChange={e => setUserForm(p => ({...p, password: e.target.value}))} placeholder={editingUser ? "Unchanged" : "Secure Password"} className="h-10 font-mono" />
                            </div>
                        </div>
                        <div className="flex gap-6 p-4 rounded-xl bg-gray-50 border border-gray-100">
                            <div className="flex items-center gap-3"><Switch checked={userForm.isAdmin} onCheckedChange={v => setUserForm(p => ({...p, isAdmin: v}))} /><Label className="font-bold text-xs uppercase">Administrative Access</Label></div>
                            <div className="flex items-center gap-3"><Switch checked={userForm.isApproved} onCheckedChange={v => setUserForm(p => ({...p, isApproved: v}))} /><Label className="font-bold text-xs uppercase">Account Active</Label></div>
                        </div>
                        
                        {!userForm.isAdmin && (
                            <div className="space-y-4">
                                <h3 className="text-xs font-black uppercase tracking-widest text-primary">Granular Capability Map</h3>
                                <Table className="text-[11px] border rounded-lg overflow-hidden">
                                    <TableHeader className="bg-muted/50">
                                        <TableRow className="hover:bg-transparent">
                                            <TableHead className="font-black uppercase">Functional Module</TableHead>
                                            <TableHead className="text-center font-black uppercase">Operational Rights</TableHead>
                                            <TableHead className="text-center font-black uppercase">Organizational Scope</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody className="bg-white">
                                        {modules.map(m => {
                                            const curr = userForm.permissions[m] || { actions: [], ownerships: [] };
                                            return (
                                                <TableRow key={m} className="border-b last:border-0 h-14">
                                                    <TableCell className="font-bold border-r text-gray-900">{getModuleDisplayName(m)}</TableCell>
                                                    <TableCell className="border-r">
                                                        <div className="flex justify-center gap-4">
                                                            {['view', 'add', 'edit', 'delete'].map(act => (
                                                                <div key={act} className="flex flex-col items-center gap-1.5">
                                                                    <Checkbox checked={curr.actions.includes(act as any)} onCheckedChange={v => handlePermissionChange(m, act as any, !!v)} />
                                                                    <span className="text-[8px] font-black uppercase text-muted-foreground">{act}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="flex justify-center gap-3 flex-wrap">
                                                            {ownershipCategories
                                                                .filter(cat => cat.modules?.includes(m))
                                                                .map(cat => (
                                                                    <div key={cat.name} className="flex flex-col items-center gap-1.5">
                                                                        <Checkbox 
                                                                            checked={curr.ownerships.includes(cat.name)} 
                                                                            onCheckedChange={v => handleOwnershipChange(m, cat.name, !!v)} 
                                                                        />
                                                                        <span className="text-[8px] font-black uppercase text-primary/70">{cat.name}</span>
                                                                    </div>
                                                                ))
                                                            }
                                                            {ownershipCategories.filter(cat => cat.modules?.includes(m)).length === 0 && (
                                                                <span className="text-[9px] text-muted-foreground italic uppercase">No sub-scope</span>
                                                            )}
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })}
                                    </TableBody>
                                </Table>
                            </div>
                        )}
                    </div>
                </ScrollArea>
                <DialogFooter className="p-6 border-t bg-white shrink-0">
                    <Button variant="outline" onClick={() => setIsUserDialogOpen(false)} className="font-bold text-xs uppercase h-11 px-8">Cancel</Button>
                    <Button onClick={handleUserSubmit} disabled={isSubmittingUser} className="font-black text-xs uppercase h-11 px-12 shadow-xl shadow-primary/20">
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
