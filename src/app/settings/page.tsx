
'use client';

import { useState, useEffect } from 'react';
import useLocalStorage from '@/hooks/use-local-storage';
import type { User, Role, Permissions, Module, Action } from '@/lib/types';
import { modules, actions } from '@/lib/types';
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
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { Plus, Edit, Trash2, MoreHorizontal } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/hooks/use-auth';
import { useRouter } from 'next/navigation';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const initialPermissions: Permissions = modules.reduce((acc, module) => {
    acc[module] = [];
    return acc;
}, {} as Permissions);

const permissionGroups: { name: string; modules: Module[] }[] = [
    { name: 'System Management', modules: ['dashboard', 'settings'] },
    { name: 'Test Report Management', modules: ['reports', 'products'] },
    { name: 'Purchase Order Management', modules: ['purchaseOrders', 'rawMaterials'] },
    { name: 'HR Management', modules: ['hr'] },
    { name: 'Fleet Management', modules: ['fleet'] },
];

export default function SettingsPage() {
  const { user: currentUser, loading, hasPermission } = useAuth();
  const router = useRouter();
  const [roles, setRoles] = useLocalStorage<Role[]>('roles', []);
  const [users, setUsers] = useLocalStorage<User[]>('users', []);
  const { toast } = useToast();
  const [isClient, setIsClient] = useState(false);
  
  // Dialog States
  const [isUserDialogOpen, setIsUserDialogOpen] = useState(false);
  const [isRoleDialogOpen, setIsRoleDialogOpen] = useState(false);
  
  // User Form State
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [userRoleId, setUserRoleId] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  // Role Form State
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [roleName, setRoleName] = useState('');
  const [rolePermissions, setRolePermissions] = useState<Permissions>(initialPermissions);
  
  useEffect(() => { setIsClient(true) }, []);

  useEffect(() => {
    if (!loading && !currentUser) {
      router.push('/login');
      return;
    }
    if (!loading && currentUser && !hasPermission('settings', 'view')) {
      toast({ title: 'Access Denied', description: 'You do not have permission to view this page.', variant: 'destructive' });
      router.push('/dashboard');
    }
  }, [currentUser, loading, router, toast, hasPermission]);
  
  const formatModuleName = (name: string) => name.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());

  // --- Role Management ---
  const resetRoleForm = () => {
    setRoleName('');
    setRolePermissions(JSON.parse(JSON.stringify(initialPermissions)));
    setEditingRole(null);
  };

  const openAddRoleDialog = () => {
    resetRoleForm();
    setIsRoleDialogOpen(true);
  };
  
  const openEditRoleDialog = (role: Role) => {
    setEditingRole(role);
    setRoleName(role.name);
    const currentPermissions = JSON.parse(JSON.stringify(initialPermissions));
     if (role.permissions) {
        for (const module of modules) {
            if(role.permissions[module]) {
                currentPermissions[module] = [...role.permissions[module]];
            }
        }
    }
    setRolePermissions(currentPermissions);
    setIsRoleDialogOpen(true);
  };
  
  const handlePermissionChange = (module: Module, action: Action, checked: boolean) => {
      setRolePermissions(prev => {
          const newPermissions = { ...prev };
          const moduleActions = newPermissions[module] ? [...newPermissions[module]] : [];
          if (checked) {
              if (!moduleActions.includes(action)) moduleActions.push(action);
          } else {
              const index = moduleActions.indexOf(action);
              if (index > -1) moduleActions.splice(index, 1);
          }
          newPermissions[module] = moduleActions;
          return newPermissions;
      });
  };

  const handleRoleSubmit = () => {
    if (roleName.trim() === '') {
      toast({ title: 'Error', description: 'Role name is required.', variant: 'destructive' });
      return;
    }

    if (editingRole) {
      const updatedRole: Role = { ...editingRole, name: roleName.trim(), permissions: rolePermissions };
      setRoles(roles.map(r => (r.id === editingRole.id ? updatedRole : r)));
      toast({ title: 'Success', description: 'Role updated successfully.' });
    } else {
      const newRole: Role = { id: crypto.randomUUID(), name: roleName.trim(), permissions: rolePermissions };
      setRoles([...roles, newRole]);
      toast({ title: 'Success', description: 'New role added successfully.' });
    }
    resetRoleForm();
    setIsRoleDialogOpen(false);
  };

  const deleteRole = (id: string) => {
    // Also need to handle users assigned to this role, maybe unassign them?
    setRoles(roles.filter(role => role.id !== id));
    setUsers(users.map(u => u.roleId === id ? {...u, roleId: ''} : u));
    toast({ title: 'Role Deleted', description: 'The role has been deleted.' });
  };
  

  // --- User Management ---
  const resetUserForm = () => {
    setUsername('');
    setPassword('');
    setUserRoleId('');
    setEditingUser(null);
    setIsChangingPassword(false);
  };

  const openAddUserDialog = () => {
    resetUserForm();
    setIsChangingPassword(true);
    setIsUserDialogOpen(true);
  };

  const openEditUserDialog = (user: User) => {
    setEditingUser(user);
    setUsername(user.username);
    setUserRoleId(user.roleId);
    setPassword('');
    setIsChangingPassword(false);
    setIsUserDialogOpen(true);
  };

  const handleUserSubmit = () => {
    if (username.trim() === '' || userRoleId === '') {
      toast({ title: 'Error', description: 'Username and Role are required.', variant: 'destructive' });
      return;
    }

    if (editingUser) {
      const updatedUser: User = {
        ...editingUser,
        username: username.trim(),
        roleId: userRoleId,
        ...(isChangingPassword && password.trim() !== '' && { password: password.trim() }),
      };
      setUsers(users.map(u => (u.id === editingUser.id ? updatedUser : u)));
      toast({ title: 'Success', description: 'User updated successfully.' });
    } else {
      if (password.trim() === '') {
        toast({ title: 'Error', description: 'Password is required for new users.', variant: 'destructive' });
        return;
      }
      if (users.some(u => u.username.toLowerCase() === username.trim().toLowerCase())) {
        toast({ title: 'Error', description: 'Username already exists.', variant: 'destructive' });
        return;
      }

      const newUser: User = {
        id: crypto.randomUUID(),
        username: username.trim(),
        password: password.trim(),
        roleId: userRoleId,
      };
      setUsers([...users, newUser]);
      toast({ title: 'Success', description: 'New user added successfully.' });
    }
    resetUserForm();
    setIsUserDialogOpen(false);
  };

  const deleteUser = (id: string) => {
    setUsers(users.filter(user => user.id !== id));
    toast({ title: 'User Deleted', description: 'The user has been successfully deleted.' });
  };
  
  if (loading || !currentUser || !isClient) {
    return (
      <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm py-24">
        <div className="flex flex-col items-center gap-1 text-center"><h3 className="text-2xl font-bold tracking-tight">Loading...</h3></div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
        <header>
            <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
            <p className="text-muted-foreground">Manage user roles and accounts.</p>
        </header>

        {/* Roles Section */}
        <Card>
            <CardHeader>
                <div className="flex justify-between items-center">
                    <div>
                        <CardTitle>Role Management</CardTitle>
                        <CardDescription>Define roles and assign permissions to them.</CardDescription>
                    </div>
                    <Dialog open={isRoleDialogOpen} onOpenChange={setIsRoleDialogOpen}>
                        <DialogTrigger asChild>
                            <Button onClick={openAddRoleDialog}><Plus className="mr-2 h-4 w-4" /> Add Role</Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-3xl">
                            <DialogHeader>
                                <DialogTitle>{editingRole ? 'Edit Role' : 'Add New Role'}</DialogTitle>
                            </DialogHeader>
                            <div className="grid gap-4 py-4">
                                <div className="space-y-2">
                                    <Label htmlFor="roleName">Role Name</Label>
                                    <Input id="roleName" value={roleName} onChange={e => setRoleName(e.target.value)} />
                                </div>
                                <div className="space-y-2">
                                    <Label>Permissions</Label>
                                    <ScrollArea className="h-72 w-full rounded-md border p-4">
                                    <div className="space-y-6">
                                        {permissionGroups.map((group, groupIndex) => (
                                            <div key={group.name} className="space-y-4">
                                                <h3 className="text-lg font-semibold">{group.name}</h3>
                                                {group.modules.map(module => (
                                                <div key={module}>
                                                    <h4 className="font-medium mb-2">{formatModuleName(module)}</h4>
                                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2">
                                                    {actions.map(action => (
                                                        <div key={action} className="flex items-center space-x-2">
                                                        <Checkbox
                                                            id={`${module}-${action}`}
                                                            checked={rolePermissions[module]?.includes(action)}
                                                            onCheckedChange={(checked) => handlePermissionChange(module, action, !!checked)}
                                                        />
                                                        <label htmlFor={`${module}-${action}`} className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                                            {action.charAt(0).toUpperCase() + action.slice(1)}
                                                        </label>
                                                        </div>
                                                    ))}
                                                    </div>
                                                </div>
                                                ))}
                                                {groupIndex < permissionGroups.length -1 && <Separator className="mt-6"/>}
                                            </div>
                                        ))}
                                    </div>
                                    </ScrollArea>
                                </div>
                            </div>
                            <DialogFooter>
                                <Button variant="outline" onClick={() => setIsRoleDialogOpen(false)}>Cancel</Button>
                                <Button onClick={handleRoleSubmit}>{editingRole ? 'Save Changes' : 'Add Role'}</Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                </div>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader><TableRow><TableHead>Role Name</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
                    <TableBody>
                        {isClient && roles.map(role => (
                            <TableRow key={role.id}>
                                <TableCell>{role.name}</TableCell>
                                <TableCell className="text-right">
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            <DropdownMenuItem onClick={() => openEditRoleDialog(role)}><Edit className="mr-2 h-4 w-4" /> Edit</DropdownMenuItem>
                                            <AlertDialog>
                                                <AlertDialogTrigger asChild><DropdownMenuItem onSelect={e => e.preventDefault()} className="text-destructive"><Trash2 className="mr-2 h-4 w-4" /> Delete</DropdownMenuItem></AlertDialogTrigger>
                                                <AlertDialogContent>
                                                    <AlertDialogHeader><AlertDialogTitle>Are you sure?</AlertDialogTitle><AlertDialogDescription>This will permanently delete the role. Users with this role will have no permissions until assigned a new one.</AlertDialogDescription></AlertDialogHeader>
                                                    <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => deleteRole(role.id)}>Delete</AlertDialogAction></AlertDialogFooter>
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

        {/* Users Section */}
        <Card>
            <CardHeader>
                <div className="flex justify-between items-center">
                    <div>
                        <CardTitle>User Management</CardTitle>
                        <CardDescription>A list of all users in the system.</CardDescription>
                    </div>
                    <Dialog open={isUserDialogOpen} onOpenChange={setIsUserDialogOpen}>
                        <DialogTrigger asChild>
                            <Button onClick={openAddUserDialog}><Plus className="mr-2 h-4 w-4" /> Add User</Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-md">
                            <DialogHeader>
                                <DialogTitle>{editingUser ? 'Edit User' : 'Add New User'}</DialogTitle>
                            </DialogHeader>
                            <div className="grid gap-4 py-4">
                                <div className="space-y-2">
                                    <Label htmlFor="username">Username</Label>
                                    <Input id="username" value={username} onChange={e => setUsername(e.target.value)} />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="roleId">Role</Label>
                                    <Select value={userRoleId} onValueChange={setUserRoleId}>
                                        <SelectTrigger><SelectValue placeholder="Select a role" /></SelectTrigger>
                                        <SelectContent>
                                            {roles.map(role => <SelectItem key={role.id} value={role.id}>{role.name}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                </div>
                                {editingUser && !isChangingPassword && (
                                    <Button variant="outline" onClick={() => setIsChangingPassword(true)}>Change Password</Button>
                                )}
                                {isChangingPassword && (
                                     <div className="space-y-2">
                                        <Label htmlFor="password">Password</Label>
                                        <Input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder={editingUser ? "Enter new password" : ""} />
                                    </div>
                                )}
                            </div>
                            <DialogFooter>
                                <Button variant="outline" onClick={() => setIsUserDialogOpen(false)}>Cancel</Button>
                                <Button onClick={handleUserSubmit}>{editingUser ? 'Save Changes' : 'Add User'}</Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                </div>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader><TableRow><TableHead>Username</TableHead><TableHead>Role</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
                    <TableBody>
                        {isClient && users.map(user => (
                            <TableRow key={user.id}>
                                <TableCell>{user.username}</TableCell>
                                <TableCell>{roles.find(r => r.id === user.roleId)?.name || 'No Role'}</TableCell>
                                <TableCell className="text-right">
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            <DropdownMenuItem onClick={() => openEditUserDialog(user)}><Edit className="mr-2 h-4 w-4" /> Edit</DropdownMenuItem>
                                            <AlertDialog>
                                                <AlertDialogTrigger asChild><DropdownMenuItem onSelect={e => e.preventDefault()} className="text-destructive"><Trash2 className="mr-2 h-4 w-4" /> Delete</DropdownMenuItem></AlertDialogTrigger>
                                                <AlertDialogContent>
                                                    <AlertDialogHeader><AlertDialogTitle>Are you sure?</AlertDialogTitle><AlertDialogDescription>This will permanently delete the user account.</AlertDialogDescription></AlertDialogHeader>
                                                    <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => deleteUser(user.id)}>Delete</AlertDialogAction></AlertDialogFooter>
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
  );
}
