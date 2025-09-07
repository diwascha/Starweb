
'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import type { Driver } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Plus, Edit, Trash2, MoreHorizontal, ArrowUpDown, Search, CalendarIcon, User, Image as ImageIcon, X } from 'lucide-react';
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
import { DualCalendar } from '@/components/ui/dual-calendar';
import { onDriversUpdate, addDriver, updateDriver, deleteDriver } from '@/services/driver-service';
import { Tooltip, TooltipProvider, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { uploadFile } from '@/services/storage-service';
import Image from 'next/image';


type DriverSortKey = 'name' | 'nickname' | 'licenseNumber' | 'contactNumber' | 'dateOfBirth' | 'authorship';
type SortDirection = 'asc' | 'desc';

export default function DriversClientPage({ initialDrivers }: { initialDrivers: Driver[] }) {
    const [drivers, setDrivers] = useState<Driver[]>(initialDrivers);
    const [isLoading, setIsLoading] = useState(false);
    
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingDriver, setEditingDriver] = useState<Driver | null>(null);
    const [formState, setFormState] = useState<Omit<Driver, 'id' | 'createdBy' | 'lastModifiedBy' | 'createdAt' | 'lastModifiedAt'>>({
        name: '',
        nickname: '',
        licenseNumber: '',
        contactNumber: '',
        dateOfBirth: new Date().toISOString(),
        photoURL: '',
    });
    const [photoFile, setPhotoFile] = useState<File | null>(null);
    const [photoPreview, setPhotoPreview] = useState<string | null>(null);
    const photoInputRef = useRef<HTMLInputElement>(null);

    const [searchQuery, setSearchQuery] = useState('');
    const [sortConfig, setSortConfig] = useState<{ key: DriverSortKey; direction: SortDirection }>({ key: 'name', direction: 'asc' });

    const { toast } = useToast();
    const { hasPermission, user } = useAuth();

    useEffect(() => {
        const unsubscribe = onDriversUpdate(setDrivers);
        return () => unsubscribe();
    }, []);

    const resetForm = () => {
        setEditingDriver(null);
        setFormState({
            name: '',
            nickname: '',
            licenseNumber: '',
            contactNumber: '',
            dateOfBirth: new Date().toISOString(),
            photoURL: '',
        });
        setPhotoFile(null);
        setPhotoPreview(null);
        if (photoInputRef.current) {
            photoInputRef.current.value = '';
        }
    };
    
    const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setPhotoFile(file);
            setPhotoPreview(URL.createObjectURL(file));
        }
    };

    const removePhoto = () => {
        setPhotoFile(null);
        setPhotoPreview(null);
        setFormState(prev => ({...prev, photoURL: ''}));
        if (photoInputRef.current) {
            photoInputRef.current.value = '';
        }
    };

    const handleOpenDialog = (driver: Driver | null = null) => {
        if (driver) {
            setEditingDriver(driver);
            setFormState({ ...driver, nickname: driver.nickname || '', photoURL: driver.photoURL || '' });
            if (driver.photoURL) {
                setPhotoPreview(driver.photoURL);
            }
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

    const handleSubmit = async () => {
        if (!user) return;
        if (!formState.name || !formState.licenseNumber) {
            toast({ title: 'Error', description: 'Driver Name and License Number are required.', variant: 'destructive' });
            return;
        }

        try {
            let photoURL = editingDriver?.photoURL || '';
             if (photoFile) {
                const filePath = `driver-photos/${user.username}-${Date.now()}-${photoFile.name}`;
                photoURL = await uploadFile(photoFile, filePath);
            } else if (formState.photoURL === '') {
                photoURL = '';
            }
            
            if (editingDriver) {
                const updatedData: Partial<Omit<Driver, 'id'>> = { ...formState, photoURL, lastModifiedBy: user.username };
                await updateDriver(editingDriver.id, updatedData);
                toast({ title: 'Success', description: 'Driver updated.' });
            } else {
                const newData: Omit<Driver, 'id' | 'createdAt' | 'lastModifiedAt'> = { ...formState, photoURL, createdBy: user.username };
                await addDriver(newData);
                toast({ title: 'Success', description: 'New driver added.' });
            }
            setIsDialogOpen(false);
            resetForm();
        } catch (error) {
            toast({ title: 'Error', description: 'Failed to save driver.', variant: 'destructive' });
        }
    };

    const handleDelete = async (id: string, photoURL?: string) => {
        try {
            await deleteDriver(id, photoURL);
            toast({ title: 'Success', description: 'Driver deleted.' });
        } catch (error) {
            toast({ title: 'Error', description: 'Failed to delete driver.', variant: 'destructive' });
        }
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
            if (sortConfig.key === 'authorship') {
                const aDate = a.lastModifiedAt || a.createdAt;
                const bDate = b.lastModifiedAt || b.createdAt;
                if (!aDate || !bDate) return 0;
                if (aDate < bDate) return sortConfig.direction === 'asc' ? -1 : 1;
                if (aDate > bDate) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            }

            if (a[sortConfig.key] < b[sortConfig.key]) return sortConfig.direction === 'asc' ? -1 : 1;
            if (a[sortConfig.key] > b[sortConfig.key]) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
        return filtered;
    }, [drivers, searchQuery, sortConfig]);

    const renderContent = () => {
        if (isLoading) {
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
                             <TableHead><Button variant="ghost" onClick={() => requestSort('authorship')}>Authorship <ArrowUpDown className="ml-2 h-4 w-4" /></Button></TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {sortedAndFilteredDrivers.map(driver => (
                            <TableRow key={driver.id}>
                                <TableCell>
                                    <div className="flex items-center gap-3">
                                        <Avatar>
                                            <AvatarImage src={driver.photoURL} alt={driver.name} />
                                            <AvatarFallback>{driver.name.charAt(0)}</AvatarFallback>
                                        </Avatar>
                                        {driver.name}
                                    </div>
                                </TableCell>
                                <TableCell>{driver.nickname}</TableCell>
                                <TableCell>{driver.licenseNumber}</TableCell>
                                <TableCell>{driver.contactNumber}</TableCell>
                                <TableCell>{toNepaliDate(driver.dateOfBirth)}</TableCell>
                                <TableCell>
                                    <TooltipProvider>
                                        <Tooltip>
                                            <TooltipTrigger className="flex items-center gap-1.5 text-sm text-muted-foreground cursor-default">
                                                {driver.lastModifiedBy ? <Edit className="h-4 w-4" /> : <User className="h-4 w-4" />}
                                                <span>{driver.lastModifiedBy || driver.createdBy}</span>
                                            </TooltipTrigger>
                                            <TooltipContent>
                                                {driver.createdBy && (
                                                    <p>
                                                    Created by: {driver.createdBy}
                                                    {driver.createdAt ? ` on ${format(new Date(driver.createdAt), "PP")}` : ''}
                                                    </p>
                                                )}
                                                {driver.lastModifiedBy && driver.lastModifiedAt && (
                                                <p>
                                                    Modified by: {driver.lastModifiedBy}
                                                    {driver.lastModifiedAt ? ` on ${format(new Date(driver.lastModifiedAt), "PP")}` : ''}
                                                </p>
                                                )}
                                            </TooltipContent>
                                        </Tooltip>
                                    </TooltipProvider>
                                </TableCell>
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
                                                        <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => handleDelete(driver.id, driver.photoURL)}>Delete</AlertDialogAction></AlertDialogFooter>
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
                <header className="flex flex-col md:flex-row md:items-center md:justify-between">
                    <div className="mb-4 md:mb-0">
                        <h1 className="text-3xl font-bold tracking-tight">Drivers</h1>
                        <p className="text-muted-foreground">Manage your driver records.</p>
                    </div>
                    <div className="flex items-center gap-2">
                        {drivers.length > 0 && (
                            <div className="relative">
                                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    type="search"
                                    placeholder="Search drivers..."
                                    className="pl-8 sm:w-[200px] md:w-[300px]"
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
            <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>{editingDriver ? 'Edit Driver' : 'Add New Driver'}</DialogTitle>
                    <DialogDescription>{editingDriver ? 'Update the details for this driver.' : 'Enter the details for the new driver.'}</DialogDescription>
                </DialogHeader>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 py-4">
                    <div className="md:col-span-1 flex flex-col items-center gap-4">
                        <Label htmlFor="photo">Driver Photo</Label>
                        <div className="w-40 h-40 rounded-full border border-dashed flex items-center justify-center bg-muted/50 relative overflow-hidden">
                            {photoPreview ? (
                                <>
                                    <Image src={photoPreview} alt="Driver preview" layout="fill" objectFit="cover" />
                                    <Button variant="destructive" size="icon" className="absolute top-0 right-0 h-8 w-8 rounded-full" onClick={removePhoto}>
                                        <X className="h-4 w-4" />
                                    </Button>
                                </>

                            ) : (
                                <ImageIcon className="h-16 w-16 text-muted-foreground" />
                            )}
                        </div>
                         <Input id="photo" type="file" accept="image/*" onChange={handlePhotoChange} ref={photoInputRef} className="hidden" />
                        <Button type="button" variant="outline" onClick={() => photoInputRef.current?.click()}>
                            {photoPreview ? 'Change Photo' : 'Upload Photo'}
                        </Button>
                    </div>
                    <div className="md:col-span-2 grid gap-4">
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
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => { setIsDialogOpen(false); resetForm(); }}>Cancel</Button>
                    <Button onClick={handleSubmit}>{editingDriver ? 'Save Changes' : 'Add Driver'}</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
