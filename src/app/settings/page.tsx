
'use client';

import { useState, useEffect, useMemo } from 'react';
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
import { Plus, Edit, Trash2, MoreHorizontal, ShieldCheck } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/hooks/use-auth';
import { useRouter } from 'next/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';

const initialPermissions: Permissions = modules.reduce((acc, module) => {
    acc[module] = [];
    return acc;
}, {} as Permissions);

export default function SettingsPage() {
  const { user: currentUser, loading, hasPermission } = useAuth();
  const router = useRouter();
  const [users, setUsers] = useLocalStorage<User[]>('users', []);
  const [roles, setRoles] = useLocalStorage<Role[]>('roles', []);
  const { toast } = useToast();
  const [isClient, setIsClient] = useState(false);
  
  // User Dialog State
  const [isUserDialogOpen, setIsUserDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [userRoleId, setUserRoleId] = useState<string>('');
  
  // Role Dialog State
  const [isRoleDialogOpen, setIsRoleDialogOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [roleName, setRoleName] = useState('');
  const [permissions, setPermissions] = useState<Permissions>(initialPermissions);
  
  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (!loading && !hasPermission('settings', 'view')) {
      toast({ title: 'Access Denied', description: 'You do not have permission to view this page.', variant: 'destructive' });
      router.push('/dashboard');
    }
  }, [currentUser, loading, router, toast, hasPermission]);

  // --- User Management ---
  const resetUserForm = () => {
    setUsername('');
    setPassword('');
    setUserRoleId('');
    setEditingUser(null);
  };

  const openAddUserDialog = () => {
    resetUserForm();
    setIsUserDialogOpen(true);
  };

  const openEditUserDialog = (user: User) => {
    setEditingUser(user);
    setUsername(user.username);
    setPassword('');
    setUserRoleId(user.roleId);
    setIsUserDialogOpen(true);
  };

  const handleUserSubmit = () => {
    if (username.trim() === '' || userRoleId === '') {
      toast({ title: 'Error', description: 'Username and role are required.', variant: 'destructive' });
      return;
    }

    if (editingUser) {
      const updatedUser: User = {
        ...editingUser,
        username: username.trim(),
        roleId: userRoleId,
        ...(password.trim() !== '' && { password: password.trim() }),
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
  
  // --- Role Management ---
  const resetRoleForm = () => {
    setRoleName('');
    setPermissions(JSON.parse(JSON.stringify(initialPermissions)));
    setEditingRole(null);
  };

  const openAddRoleDialog = () => {
    resetRoleForm();
    setIsRoleDialogOpen(true);
  };

  const openEditRoleDialog = (role: Role) => {
    setEditingRole(role);
    setRoleName(role.name);
    // Deep copy to prevent state mutation issues
    const currentPermissions = JSON.parse(JSON.stringify(initialPermissions));
    for (const module of modules) {
        if(role.permissions[module]) {
            currentPermissions[module] = [...role.permissions[module]];
        }
    }
    setPermissions(currentPermissions);
    setIsRoleDialogOpen(true);
  };

  const handlePermissionChange = (module: Module, action: Action, checked: boolean) => {
      setPermissions(prev => {
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
      const updatedRole: Role = { ...editingRole, name: roleName.trim(), permissions };
      setRoles(roles.map(r => (r.id === editingRole.id ? updatedRole : r)));
      toast({ title: 'Success', description: 'Role updated.' });
    } else {
      const newRole: Role = { id: crypto.randomUUID(), name: roleName.trim(), permissions };
      setRoles([...roles, newRole]);
      toast({ title: 'Success', description: 'New role created.' });
    }
    resetRoleForm();
    setIsRoleDialogOpen(false);
  };

  const deleteRole = (id: string) => {
    if(users.some(u => u.roleId === id)) {
        toast({ title: 'Error', description: 'Cannot delete a role that is assigned to users.', variant: 'destructive'});
        return;
    }
    setRoles(roles.filter(r => r.id !== id));
    toast({ title: 'Role Deleted', description: 'The role has been successfully deleted.' });
  };

  if (loading || !currentUser) {
    return (
      <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm py-24">
        <div className="flex flex-col items-center gap-1 text-center"><h3 className="text-2xl font-bold tracking-tight">Loading...</h3></div>
      </div>
    );
  }

  const formatModuleName = (name: string) => name.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
  
  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">Manage users, roles, and application settings.</p>
      </header>

      <Tabs defaultValue="users">
        <TabsList>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="roles">Roles</TabsTrigger>
        </TabsList>
        <TabsContent value="users" className="mt-4">
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
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>{editingUser ? 'Edit User' : 'Add New User'}</DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                      <div className="space-y-2">
                        <Label htmlFor="username">Username</Label>
                        <Input id="username" value={username} onChange={e => setUsername(e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="password">Password</Label>
                        <Input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder={editingUser ? "Leave blank to keep current password" : ""}/>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="role">Role</Label>
                        <Select value={userRoleId} onValueChange={setUserRoleId}>
                          <SelectTrigger id="role"><SelectValue placeholder="Select a role" /></SelectTrigger>
                          <SelectContent>
                            {roles.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
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
                      <TableCell>{roles.find(r => r.id === user.roleId)?.name || 'N/A'}</TableCell>
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
                  {!isClient && <TableRow><TableCell colSpan={3} className="text-center">Loading users...</TableCell></TableRow>}
                  {isClient && users.length === 0 && <TableRow><TableCell colSpan={3} className="text-center h-24">No users found.</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="roles" className="mt-4">
           <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>Role Management</CardTitle>
                  <CardDescription>Define roles and their permissions.</CardDescription>
                </div>
                 <Dialog open={isRoleDialogOpen} onOpenChange={setIsRoleDialogOpen}>
                  <DialogTrigger asChild>
                    <Button onClick={openAddRoleDialog}><ShieldCheck className="mr-2 h-4 w-4" /> Add Role</Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-2xl">
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
                          <div className="space-y-4">
                            {modules.map(module => (
                              <div key={module}>
                                <h4 className="font-semibold mb-2">{formatModuleName(module)}</h4>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                                  {actions.map(action => (
                                    <div key={action} className="flex items-center space-x-2">
                                      <Checkbox
                                        id={`${module}-${action}`}
                                        checked={permissions[module]?.includes(action)}
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
                          </div>
                        </ScrollArea>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setIsRoleDialogOpen(false)}>Cancel</Button>
                      <Button onClick={handleRoleSubmit}>{editingRole ? 'Save Changes' : 'Create Role'}</Button>
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
                                <AlertDialogHeader><AlertDialogTitle>Are you sure?</AlertDialogTitle><AlertDialogDescription>This will permanently delete the role.</AlertDialogDescription></AlertDialogHeader>
                                <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => deleteRole(role.id)}>Delete</AlertDialogAction></AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                  {!isClient && <TableRow><TableCell colSpan={2} className="text-center">Loading roles...</TableCell></TableRow>}
                  {isClient && roles.length === 0 && <TableRow><TableCell colSpan={2} className="text-center h-24">No roles found.</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
