
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

const initialPermissions: Permissions = modules.reduce((acc, module) => {
    acc[module] = [];
    return acc;
}, {} as Permissions);

export default function SettingsPage() {
  const { user: currentUser, loading, hasPermission } = useAuth();
  const router = useRouter();
  const [users, setUsers] = useLocalStorage<User[]>('users', []);
  const { toast } = useToast();
  const [isClient, setIsClient] = useState(false);
  
  // User Dialog State
  const [isUserDialogOpen, setIsUserDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [permissions, setPermissions] = useState<Permissions>(initialPermissions);
  
  useEffect(() => {
    setIsClient(true);
  }, []);

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

  // --- User Management ---
  const resetUserForm = () => {
    setUsername('');
    setPassword('');
    setPermissions(JSON.parse(JSON.stringify(initialPermissions)));
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
    
    // Deep copy to prevent state mutation issues
    const currentPermissions = JSON.parse(JSON.stringify(initialPermissions));
     if (user.permissions) {
        for (const module of modules) {
            if(user.permissions[module]) {
                currentPermissions[module] = [...user.permissions[module]];
            }
        }
    }
    setPermissions(currentPermissions);
    setIsUserDialogOpen(true);
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

  const handleUserSubmit = () => {
    if (username.trim() === '') {
      toast({ title: 'Error', description: 'Username is required.', variant: 'destructive' });
      return;
    }

    if (editingUser) {
      const updatedUser: User = {
        ...editingUser,
        username: username.trim(),
        permissions,
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
        roleId: 'user', // Simplified roleId
        permissions,
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

  const formatModuleName = (name: string) => name.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
  
  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">Manage users and their permissions.</p>
      </header>
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
                <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>{editingUser ? 'Edit User' : 'Add New User'}</DialogTitle>
                </DialogHeader>
                 <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="username">Username</Label>
                            <Input id="username" value={username} onChange={e => setUsername(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="password">Password</Label>
                            <Input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder={editingUser ? "Leave blank to keep current" : ""}/>
                        </div>
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
                    <Button variant="outline" onClick={() => setIsUserDialogOpen(false)}>Cancel</Button>
                    <Button onClick={handleUserSubmit}>{editingUser ? 'Save Changes' : 'Add User'}</Button>
                </DialogFooter>
                </DialogContent>
            </Dialog>
            </div>
        </CardHeader>
        <CardContent>
            <Table>
            <TableHeader><TableRow><TableHead>Username</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
            <TableBody>
                {isClient && users.map(user => (
                <TableRow key={user.id}>
                    <TableCell>{user.username}</TableCell>
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
                {!isClient && <TableRow><TableCell colSpan={2} className="text-center">Loading users...</TableCell></TableRow>}
                {isClient && users.length === 0 && <TableRow><TableCell colSpan={2} className="text-center h-24">No users found.</TableCell></TableRow>}
            </TableBody>
            </Table>
        </CardContent>
        </Card>
    </div>
  );
}

    