'use client';

import React, { useState, useEffect, useMemo } from 'react';
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
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { Switch } from '@/components/ui/switch';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { useAuthService } from '@/firebase';
import { onSettingUpdate } from '@/services/settings-service';

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
        case 'filesystem': return 'File Manager';
        case 'notes': return 'Notes & Todos';
        case 'settings': return 'Settings';
        default: return m;
    }
};

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

  useEffect(() => {
    const unsubs = [
        onUsersUpdate(setUsers),
        onPageVisitsUpdate(setPageVisits),
        onLogsUpdate(setLogs),
        onSettingUpdate('ownership_categories', (s) => { 
            if (s?.value) {
                const normalized = s.value.map((cat: any) => {
                    if (typeof cat === 'string') return { name: cat, modules: Array.from(modules) };
                    return cat as OwnershipCategory;
                });
                setOwnershipCategories(normalized);
            }
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

            <TabsContent value="usage" className="animate-in fade-in slide-in-from-left-2">
                <Card>
                    <CardHeader><CardTitle className="text-sm font-black uppercase">Traffic Analysis</CardTitle></CardHeader>
                    <CardContent>
                        <div className="text-3xl font-black text-primary">{pageVisits.reduce((sum, v) => sum + (v.count || 0), 0).toLocaleString()} Total Views</div>
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
        </Tabs>

        {/* User Permission Dialog */}
        <Dialog open={isUserDialogOpen} onOpenChange={setIsUserDialogOpen}>
            <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0">
                <DialogHeader className="p-6 border-b"><DialogTitle>{editingUser ? 'Edit Permissions' : 'New User Access'}</DialogTitle></DialogHeader>
                <ScrollArea className="flex-1 p-6">
                    <div className="space-y-8">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5"><Label>Username</Label><Input value={userForm.username} onChange={e => setUserForm(p => ({...p, username: e.target.value}))} disabled={!!editingUser} /></div>
                            <div className="space-y-1.5"><Label>Password</Label><Input type="password" value={userForm.password} onChange={e => setUserForm(p => ({...p, password: e.target.value}))} placeholder={editingUser ? "Unchanged" : "New Password"} /></div>
                        </div>
                        <div className="flex gap-4 border-t pt-4">
                            <div className="flex items-center gap-2"><Switch checked={userForm.isAdmin} onCheckedChange={v => setUserForm(p => ({...p, isAdmin: v}))} /><Label>Global Admin</Label></div>
                            <div className="flex items-center gap-2"><Switch checked={userForm.isApproved} onCheckedChange={v => setUserForm(p => ({...p, isApproved: v}))} /><Label>Approved</Label></div>
                        </div>
                        
                        {!userForm.isAdmin && (
                            <Table className="text-[11px] border">
                                <TableHeader className="bg-muted/50"><TableRow><TableHead>Module</TableHead><TableHead className="text-center">Operations</TableHead><TableHead className="text-center">Ownership Scope</TableHead></TableRow></TableHeader>
                                <TableBody>{modules.map(m => {
                                    const curr = userForm.permissions[m] || { actions: [], ownerships: [] };
                                    return (
                                        <TableRow key={m}>
                                            <TableCell className="font-bold border-r">{getModuleDisplayName(m)}</TableCell>
                                            <TableCell className="border-r">
                                                <div className="flex justify-center gap-3">
                                                    {['view', 'add', 'edit', 'delete'].map(act => (
                                                        <div key={act} className="flex flex-col items-center gap-1">
                                                            <Checkbox checked={curr.actions.includes(act as any)} onCheckedChange={v => handlePermissionChange(m, act as any, !!v)} />
                                                            <span className="text-[8px] uppercase">{act}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex justify-center gap-3">
                                                    {ownershipCategories
                                                        .filter(cat => cat.modules?.includes(m))
                                                        .map(cat => (
                                                            <div key={cat.name} className="flex flex-col items-center gap-1">
                                                                <Checkbox 
                                                                    checked={curr.ownerships.includes(cat.name)} 
                                                                    onCheckedChange={v => handleOwnershipChange(m, cat.name, !!v)} 
                                                                />
                                                                <span className="text-[8px] uppercase">{cat.name}</span>
                                                            </div>
                                                        ))
                                                    }
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}</TableBody>
                            </Table>
                        )}
                    </div>
                </ScrollArea>
                <DialogFooter className="p-6 border-t"><Button onClick={handleUserSubmit} disabled={isSubmittingUser}>Save User Profile</Button></DialogFooter>
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
