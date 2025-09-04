
'use client';

import { useState, useEffect, useMemo } from 'react';
import useLocalStorage from '@/hooks/use-local-storage';
import type { Driver } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Plus, Edit, Trash2, MoreHorizontal, ArrowUpDown, Search, CalendarIcon } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/use-auth';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { format } from 'date-fns';
import { cn, toNepaliDate } from '@/lib/utils';
import NepaliDate from 'nepali-date-converter';
import { DualCalendar } from '@/components/ui/dual-calendar';


type DriverSortKey = 'name' | 'nickname' | 'licenseNumber' | 'contactNumber' | 'dateOfBirth';
type SortDirection = 'asc' | 'desc';

export default function DriversPage() {
    const [drivers, setDrivers] = useLocalStorage<Driver[]>('drivers', []);
    const [isClient, setIsClient] = useState(false);
    
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingDriver, setEditingDriver] = useState<Driver | null>(null);
    const [formState, setFormState] = useState<Omit<Driver, 'id'>>({
        name: '',
        nickname: '',
        licenseNumber: '',
        contactNumber: '',
        dateOfBirth: new Date().toISOString(),
    });
    
    const [searchQuery, setSearchQuery] = useState('');
    const [sortConfig, setSortConfig] = useState<{ key: DriverSortKey; direction: SortDirection }>({ key: 'name', direction: 'asc' });

    const { toast } = useToast();
    const { hasPermission } = useAuth();

    useEffect(() => {
        setIsClient(true);
    }, []);

    const resetForm = () => {
        setEditingDriver(null);
        setFormState({
            name: '',
            nickname: '',
            licenseNumber: '',
            contactNumber: '',
            dateOfBirth: new Date().toISOString(),
        });
    };

    const handleOpenDialog = (driver: Driver | null = null) => {
        if (driver) {
            setEditingDriver(driver);
            setFormState({ ...driver, nickname: driver.nickname || '' });
        } else {
            resetForm();
        }
        setIsDialogOpen(true);
    };

    const handleFormChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormState(prev => ({ ...prev, [name]: value }));
    };
    
    const handleDateChange = (date: Date | undefined) => {
        if (date) {
            setFormState(prev => ({ ...prev, dateOfBirth: date.toISOString() }));
        }
    };


    const handleSubmit = () => {
        if (!formState.name || !formState.licenseNumber) {
            toast({ title: 'Error', description: 'Driver Name and License Number are required.', variant: 'destructive' });
            return;
        }

        if (editingDriver) {
            const updatedDriver = { ...editingDriver, ...formState };
            setDrivers(drivers.map(d => d.id === editingDriver.id ? updatedDriver : d));
            toast({ title: 'Success', description: 'Driver updated.' });
        } else {
            const newDriver: Driver = { id: crypto.randomUUID(), ...formState };
            setDrivers([...drivers, newDriver]);
            toast({ title: 'Success', description: 'New driver added.' });
        }
        setIsDialogOpen(false);
        resetForm();
    };

    const handleDelete = (id: string) => {
        setDrivers(drivers.filter(d => d.id !== id));
        toast({ title: 'Success', description: 'Driver deleted.' });
    };
    
    const requestSort = (key: DriverSortKey) => {
        let direction: SortDirection = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const sortedAndFilteredDrivers = useMemo(() => {
        let filtered = [...drivers];
        if (searchQuery) {
            const lowercasedQuery = searchQuery.toLowerCase();
            filtered = filtered.filter(d =>
                d.name.toLowerCase().includes(lowercasedQuery) ||
                (d.nickname || '').toLowerCase().includes(lowercasedQuery) ||
                d.licenseNumber.toLowerCase().includes(lowercasedQuery) ||
                d.contactNumber.toLowerCase().includes(lowercasedQuery) ||
                toNepaliDate(d.dateOfBirth).toLowerCase().includes(lowercasedQuery) ||
                format(new Date(d.dateOfBirth), 'PPP').toLowerCase().includes(lowercasedQuery)
            );
        }
        filtered.sort((a, b) => {
            if (a[sortConfig.key] < b[sortConfig.key]) return sortConfig.direction === 'asc' ? -1 : 1;
            if (a[sortConfig.key] > b[sortConfig.key]) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
        return filtered;
    }, [drivers, searchQuery, sortConfig]);

    const renderContent = () => {
        if (!isClient) {
            return (
                <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm py-24">
                  <h3 className="text-2xl font-bold tracking-tight">Loading...</h3>
                </div>
            );
        }

        if (drivers.length === 0) {
            return (
                <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm py-24">
                  <div className="flex flex-col items-center gap-1 text-center">
                    <h3 className="text-2xl font-bold tracking-tight">No drivers found</h3>
                    <p className="text-sm text-muted-foreground">Get started by adding a new driver.</p>
                    {hasPermission('fleet', 'create') && (
                        <Button className="mt-4" onClick={() => handleOpenDialog()}>
                            <Plus className="mr-2 h-4 w-4" /> Add Driver
                        </Button>
                    )}
                  </div>
                </div>
            );
        }

        return (
            <Card>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead><Button variant="ghost" onClick={() => requestSort('name')}>Name <ArrowUpDown className="ml-2 h-4 w-4" /></Button></TableHead>
                            <TableHead><Button variant="ghost" onClick={() => requestSort('nickname')}>Nickname <ArrowUpDown className="ml-2 h-4 w-4" /></Button></TableHead>
                            <TableHead><Button variant="ghost" onClick={() => requestSort('licenseNumber')}>License Number <ArrowUpDown className="ml-2 h-4 w-4" /></Button></TableHead>
                            <TableHead><Button variant="ghost" onClick={() => requestSort('contactNumber')}>Contact Number <ArrowUpDown className="ml-2 h-4 w-4" /></Button></TableHead>
                             <TableHead><Button variant="ghost" onClick={() => requestSort('dateOfBirth')}>Date of Birth (BS) <ArrowUpDown className="ml-2 h-4 w-4" /></Button></TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {sortedAndFilteredDrivers.map(driver => (
                            <TableRow key={driver.id}>
                                <TableCell>{driver.name}</TableCell>
                                <TableCell>{driver.nickname}</TableCell>
                                <TableCell>{driver.licenseNumber}</TableCell>
                                <TableCell>{driver.contactNumber}</TableCell>
                                <TableCell>{toNepaliDate(driver.dateOfBirth)}</TableCell>
                                <TableCell className="text-right">
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            {hasPermission('fleet', 'edit') && <DropdownMenuItem onSelect={() => handleOpenDialog(driver)}><Edit className="mr-2 h-4 w-4" /> Edit</DropdownMenuItem>}
                                            {hasPermission('fleet', 'delete') && <DropdownMenuSeparator />}
                                            {hasPermission('fleet', 'delete') && (
                                                <AlertDialog>
                                                    <AlertDialogTrigger asChild><DropdownMenuItem onSelect={e => e.preventDefault()}><Trash2 className="mr-2 h-4 w-4 text-destructive" /> <span className="text-destructive">Delete</span></DropdownMenuItem></AlertDialogTrigger>
                                                    <AlertDialogContent>
                                                        <AlertDialogHeader><AlertDialogTitle>Are you sure?</AlertDialogTitle><AlertDialogDescription>This will permanently delete the driver record.</AlertDialogDescription></AlertDialogHeader>
                                                        <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => handleDelete(driver.id)}>Delete</AlertDialogAction></AlertDialogFooter>
                                                    </AlertDialogContent>
                                                </AlertDialog>
                                            )}
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </Card>
        );
    };

    return (
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <div className="flex flex-col gap-8">
                <header className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">Drivers</h1>
                        <p className="text-muted-foreground">Manage your driver records.</p>
                    </div>
                    <div className="flex items-center gap-2">
                        {isClient && drivers.length > 0 && (
                            <div className="relative">
                                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    type="search"
                                    placeholder="Search drivers..."
                                    className="pl-8 sm:w-[300px]"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                />
                            </div>
                        )}
                        {hasPermission('fleet', 'create') && (
                            <DialogTrigger asChild>
                                <Button onClick={() => handleOpenDialog()}>
                                    <Plus className="mr-2 h-4 w-4" /> Add Driver
                                </Button>
                            </DialogTrigger>
                        )}
                    </div>
                </header>
                {renderContent()}
            </div>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{editingDriver ? 'Edit Driver' : 'Add New Driver'}</DialogTitle>
                    <DialogDescription>{editingDriver ? 'Update the details for this driver.' : 'Enter the details for the new driver.'}</DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="name">Driver Name</Label>
                            <Input id="name" name="name" value={formState.name} onChange={handleFormChange} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="nickname">Nickname</Label>
                            <Input id="nickname" name="nickname" value={formState.nickname} onChange={handleFormChange} />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="licenseNumber">License Number</Label>
                        <Input id="licenseNumber" name="licenseNumber" value={formState.licenseNumber} onChange={handleFormChange} />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="contactNumber">Contact Number</Label>
                        <Input id="contactNumber" name="contactNumber" value={formState.contactNumber} onChange={handleFormChange} />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="dateOfBirth">Date of Birth</Label>
                         <Popover>
                            <PopoverTrigger asChild>
                                <Button
                                variant={"outline"}
                                className={cn(
                                    "w-full justify-start text-left font-normal",
                                    !formState.dateOfBirth && "text-muted-foreground"
                                )}
                                >
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {formState.dateOfBirth ? `${toNepaliDate(formState.dateOfBirth)} BS (${format(new Date(formState.dateOfBirth), "PPP")})` : <span>Pick a date</span>}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0">
                                <DualCalendar
                                    selected={new Date(formState.dateOfBirth)}
                                    onSelect={handleDateChange}
                                />
                            </PopoverContent>
                        </Popover>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                    <Button onClick={handleSubmit}>{editingDriver ? 'Save Changes' : 'Add Driver'}</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
