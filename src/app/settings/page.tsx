
'use client';

import { useState, useEffect } from 'react';
import useLocalStorage from '@/hooks/use-local-storage';
import type { User, Permissions, Module, Action } from '@/lib/types';
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
import { Plus, Edit, Trash2, Eye, EyeOff } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/hooks/use-auth';
import { useRouter } from 'next/navigation';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { getAdminCredentials, setAdminPassword, validatePassword } from '@/lib/utils';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';

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

const passwordSchema = z.object({
    newPassword: z.string().refine(validatePassword, {
        message: "Password must be at least 8 characters long and include uppercase, lowercase, number, and special characters.",
    }),
    confirmPassword: z.string()
}).refine(data => data.newPassword === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
});

type PasswordFormValues = z.infer<typeof passwordSchema>;

export default function SettingsPage() {
  const { user: currentUser, loading, hasPermission, login } = useAuth();
  const router = useRouter();
  const [users, setUsers] = useLocalStorage<User[]>('users', []);
  const { toast } = useToast();
  const [isClient, setIsClient] = useState(false);
  
  // Dialog States
  const [isUserDialogOpen, setIsUserDialogOpen] = useState(false);
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);
  
  // User Form State
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [userPermissions, setUserPermissions] = useState<Permissions>(initialPermissions);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => { setIsClient(true) }, []);
  
  const { register, handleSubmit, formState: { errors }, reset } = useForm<PasswordFormValues>({
    resolver: zodResolver(passwordSchema)
  });

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

  // --- User Management ---
  const resetUserForm = () => {
    setUsername('');
    setPassword('');
    setUserPermissions(JSON.parse(JSON.stringify(initialPermissions)));
    setEditingUser(null);
  };

  const openAddUserDialog = () => {
    resetUserForm();
    setIsUserDialogOpen(true);
  };

  const openEditUserDialog = (user: User) => {
    setEditingUser(user);
    setUsername(user.username);
    setPassword(user.password || '');
    const currentPermissions = JSON.parse(JSON.stringify(initialPermissions));
     if (user.permissions) {
        for (const module of modules) {
            if(user.permissions[module]) {
                currentPermissions[module] = [...user.permissions[module]];
            }
        }
    }
    setUserPermissions(currentPermissions);
    setIsUserDialogOpen(true);
  };

  const handleUserSubmit = () => {
    if (username.trim() === '') {
      toast({ title: 'Error', description: 'Username is required.', variant: 'destructive' });
      return;
    }

    const isPasswordRequired = !editingUser; // Required for new user
    const { isValid, error } = validatePassword(password, isPasswordRequired);
    if(!isValid){
        toast({ title: 'Error', description: error, variant: 'destructive' });
        return;
    }

    const passwordLastUpdated = new Date().toISOString();

    if (editingUser) {
      const updatedUser: User = {
        ...editingUser,
        username: username.trim(),
        password: password.trim() || editingUser.password, // Keep old password if new one is empty
        passwordLastUpdated: password.trim() ? passwordLastUpdated : editingUser.passwordLastUpdated,
        permissions: userPermissions,
      };
      setUsers(users.map(u => (u.id === editingUser.id ? updatedUser : u)));
      toast({ title: 'Success', description: 'User updated successfully.' });
    } else {
      if (users.some(u => u.username.toLowerCase() === username.trim().toLowerCase())) {
        toast({ title: 'Error', description: 'Username already exists.', variant: 'destructive' });
        return;
      }

      const newUser: User = {
        id: crypto.randomUUID(),
        username: username.trim(),
        password: password.trim(),
        passwordLastUpdated,
        permissions: userPermissions,
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
  
   const handlePermissionChange = (module: Module, action: Action, checked: boolean) => {
      setUserPermissions(prev => {
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
  
  const handleAdminPasswordChange = (data: PasswordFormValues) => {
    const passwordLastUpdated = new Date().toISOString();
    setAdminPassword(data.newPassword, passwordLastUpdated);
    toast({ title: "Success", description: "Administrator password updated."});
    
    // Re-login to update session
    if (currentUser?.is_admin) {
        login({ id: 'admin', username: 'Administrator', permissions: {}, passwordLastUpdated });
    }
    
    setIsPasswordDialogOpen(false);
    reset();
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
            <p className="text-muted-foreground">Manage user accounts and system settings.</p>
        </header>
        
        <Card>
            <CardHeader>
                <CardTitle>Administrator Settings</CardTitle>
                <CardDescription>Manage administrator account.</CardDescription>
            </CardHeader>
            <CardContent>
                <Dialog open={isPasswordDialogOpen} onOpenChange={setIsPasswordDialogOpen}>
                    <DialogTrigger asChild>
                        <Button>Change Administrator Password</Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Change Administrator Password</DialogTitle>
                        </DialogHeader>
                        <form onSubmit={handleSubmit(handleAdminPasswordChange)}>
                            <div className="grid gap-4 py-4">
                                <div className="space-y-2">
                                    <Label htmlFor="newPassword">New Password</Label>
                                    <Input id="newPassword" type="password" {...register("newPassword")} />
                                    {errors.newPassword && <p className="text-sm text-destructive">{errors.newPassword.message}</p>}
                                </div>
                                 <div className="space-y-2">
                                    <Label htmlFor="confirmPassword">Confirm New Password</Label>
                                    <Input id="confirmPassword" type="password" {...register("confirmPassword")} />
                                    {errors.confirmPassword && <p className="text-sm text-destructive">{errors.confirmPassword.message}</p>}
                                </div>
                            </div>
                            <DialogFooter>
                                <Button type="button" variant="outline" onClick={() => setIsPasswordDialogOpen(false)}>Cancel</Button>
                                <Button type="submit">Save Changes</Button>
                            </DialogFooter>
                        </form>
                    </DialogContent>
                </Dialog>
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
                        <DialogContent className="sm:max-w-3xl">
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
                                        <div className="relative">
                                            <Input id="password" type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder={editingUser ? 'Leave blank to keep current' : ''} />
                                            <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7" onClick={() => setShowPassword(!showPassword)}>
                                                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                            </Button>
                                        </div>
                                    </div>
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
                                                            checked={userPermissions[module]?.includes(action)}
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
                                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditUserDialog(user)}>
                                        <Edit className="h-4 w-4" />
                                    </Button>
                                    <AlertDialog>
                                        <AlertDialogTrigger asChild>
                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive">
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </AlertDialogTrigger>
                                        <AlertDialogContent>
                                            <AlertDialogHeader><AlertDialogTitle>Are you sure?</AlertDialogTitle><AlertDialogDescription>This will permanently delete the user account.</AlertDialogDescription></AlertDialogHeader>
                                            <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => deleteUser(user.id)}>Delete</AlertDialogAction></AlertDialogFooter>
                                        </AlertDialogContent>
                                    </AlertDialog>
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
