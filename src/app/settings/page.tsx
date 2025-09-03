
'use client';

import { useState, useEffect } from 'react';
import useLocalStorage from '@/hooks/use-local-storage';
import type { User, UserRole } from '@/lib/types';
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
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { Plus, Edit, Trash2, MoreHorizontal } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/hooks/use-auth';
import { useRouter } from 'next/navigation';

export default function SettingsPage() {
  const { user: currentUser, loading } = useAuth();
  const router = useRouter();
  const [users, setUsers] = useLocalStorage<User[]>('users', []);
  const { toast } = useToast();
  const [isClient, setIsClient] = useState(false);
  
  const [isUserDialogOpen, setIsUserDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('User');
  
  useEffect(() => {
    setIsClient(true);
  }, []);

  // Redirect if not admin
  useEffect(() => {
    if (!loading && (!currentUser || currentUser.role !== 'Admin')) {
      toast({ title: 'Access Denied', description: 'You do not have permission to view this page.', variant: 'destructive' });
      router.push('/dashboard');
    }
  }, [currentUser, loading, router, toast]);

  const resetForm = () => {
    setUsername('');
    setPassword('');
    setRole('User');
    setEditingUser(null);
  };

  const openAddUserDialog = () => {
    resetForm();
    setIsUserDialogOpen(true);
  };

  const openEditUserDialog = (user: User) => {
    setEditingUser(user);
    setUsername(user.username);
    setPassword(''); // Don't pre-fill password for security
    setRole(user.role);
    setIsUserDialogOpen(true);
  };

  const handleUserSubmit = () => {
    if (username.trim() === '') {
      toast({ title: 'Error', description: 'Username is required.', variant: 'destructive' });
      return;
    }

    if (editingUser) {
      // Edit existing user
      if (password.trim() !== '' && password.length < 6) {
        toast({ title: 'Error', description: 'Password must be at least 6 characters long.', variant: 'destructive' });
        return;
      }
      
      const updatedUser: User = {
        ...editingUser,
        username: username.trim(),
        role,
        // Only update password if a new one is provided
        ...(password.trim() !== '' && { password: password.trim() }),
      };
      setUsers(users.map(u => (u.id === editingUser.id ? updatedUser : u)));
      toast({ title: 'Success', description: 'User updated successfully.' });
    } else {
      // Add new user
      if (password.trim() === '' || password.length < 6) {
        toast({ title: 'Error', description: 'A password of at least 6 characters is required.', variant: 'destructive' });
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
        role,
      };
      setUsers([...users, newUser]);
      toast({ title: 'Success', description: 'New user added successfully.' });
    }

    resetForm();
    setIsUserDialogOpen(false);
  };

  const deleteUser = (id: string) => {
    setUsers(users.filter(user => user.id !== id));
    toast({ title: 'User Deleted', description: 'The user has been successfully deleted.' });
  };

  const dialogTitle = editingUser ? 'Edit User' : 'Add New User';
  const dialogDescription = editingUser ? 'Update the details for this user.' : 'Enter the details for the new user.';
  const dialogButtonText = editingUser ? 'Save Changes' : 'Add User';
  
  if (loading || !currentUser || currentUser.role !== 'Admin') {
    return (
        <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm py-24">
          <div className="flex flex-col items-center gap-1 text-center">
            <h3 className="text-2xl font-bold tracking-tight">Loading...</h3>
          </div>
        </div>
      );
  }

  return (
    <div className="flex flex-col gap-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
          <p className="text-muted-foreground">Manage users and application settings.</p>
        </div>
        <Dialog open={isUserDialogOpen} onOpenChange={setIsUserDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openAddUserDialog}>
              <Plus className="mr-2 h-4 w-4" /> Add User
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{dialogTitle}</DialogTitle>
              <DialogDescription>{dialogDescription}</DialogDescription>
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
                <Select value={role} onValueChange={(value: UserRole) => setRole(value)}>
                  <SelectTrigger id="role">
                    <SelectValue placeholder="Select a role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Admin">Admin</SelectItem>
                    <SelectItem value="User">User</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsUserDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleUserSubmit}>{dialogButtonText}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </header>

      <Card>
        <CardHeader>
            <CardTitle>User Management</CardTitle>
            <CardDescription>A list of all users in the system.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Username</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isClient && users.map(user => (
                <TableRow key={user.id}>
                  <TableCell>{user.username}</TableCell>
                  <TableCell>{user.role}</TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEditUserDialog(user)}>
                          <Edit className="mr-2 h-4 w-4" /> Edit
                        </DropdownMenuItem>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <DropdownMenuItem onSelect={e => e.preventDefault()} className="text-destructive">
                                <Trash2 className="mr-2 h-4 w-4" /> Delete
                            </DropdownMenuItem>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This action cannot be undone. This will permanently delete the user account.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => deleteUser(user.id)}>Delete</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
               {!isClient && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center">Loading users...</TableCell>
                  </TableRow>
                )}
                {isClient && users.length === 0 && (
                    <TableRow>
                        <TableCell colSpan={3} className="text-center h-24">No users found.</TableCell>
                    </TableRow>
                )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
