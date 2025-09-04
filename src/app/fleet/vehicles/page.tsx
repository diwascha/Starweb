
'use client';

import { useState, useEffect, useMemo } from 'react';
import useLocalStorage from '@/hooks/use-local-storage';
import type { Vehicle, VehicleStatus, Driver } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Plus, Edit, Trash2, MoreHorizontal, ArrowUpDown, Search } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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

const vehicleStatuses: VehicleStatus[] = ['Active', 'In Maintenance', 'Decommissioned'];

type VehicleSortKey = 'name' | 'make' | 'model' | 'status' | 'driverName';
type SortDirection = 'asc' | 'desc';

export default function VehiclesPage() {
    const [vehicles, setVehicles] = useLocalStorage<Vehicle[]>('vehicles', []);
    const [drivers] = useLocalStorage<Driver[]>('drivers', []);
    const [isClient, setIsClient] = useState(false);
    
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
    const [formState, setFormState] = useState<Omit<Vehicle, 'id'>>({
        name: '',
        make: '',
        model: '',
        year: new Date().getFullYear(),
        vin: '',
        status: 'Active',
        driverId: undefined,
    });
    
    const [searchQuery, setSearchQuery] = useState('');
    const [sortConfig, setSortConfig] = useState<{ key: VehicleSortKey; direction: SortDirection }>({ key: 'name', direction: 'asc' });

    const { toast } = useToast();
    const { hasPermission } = useAuth();
    
    const driversById = useMemo(() => new Map(drivers.map(d => [d.id, d.name])), [drivers]);

    useEffect(() => {
        setIsClient(true);
    }, []);

    const resetForm = () => {
        setEditingVehicle(null);
        setFormState({
            name: '',
            make: '',
            model: '',
            year: new Date().getFullYear(),
            vin: '',
            status: 'Active',
            driverId: undefined,
        });
    };

    const handleOpenDialog = (vehicle: Vehicle | null = null) => {
        if (vehicle) {
            setEditingVehicle(vehicle);
            setFormState(vehicle);
        } else {
            resetForm();
        }
        setIsDialogOpen(true);
    };

    const handleFormChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormState(prev => ({ ...prev, [name]: value }));
    };
    
    const handleSelectChange = (name: keyof Omit<Vehicle, 'id'>, value: string) => {
        setFormState(prev => ({ ...prev, [name]: value === 'unassigned' ? undefined : value }));
    };

    const handleSubmit = () => {
        if (!formState.name) {
            toast({ title: 'Error', description: 'Vehicle Name / Number is required.', variant: 'destructive' });
            return;
        }

        if (editingVehicle) {
            const updatedVehicle = { ...editingVehicle, ...formState };
            setVehicles(vehicles.map(v => v.id === editingVehicle.id ? updatedVehicle : v));
            toast({ title: 'Success', description: 'Vehicle updated.' });
        } else {
            const newVehicle: Vehicle = { id: crypto.randomUUID(), ...formState };
            setVehicles([...vehicles, newVehicle]);
            toast({ title: 'Success', description: 'New vehicle added.' });
        }
        setIsDialogOpen(false);
        resetForm();
    };

    const handleDelete = (id: string) => {
        setVehicles(vehicles.filter(v => v.id !== id));
        toast({ title: 'Success', description: 'Vehicle deleted.' });
    };
    
     const requestSort = (key: VehicleSortKey) => {
        let direction: SortDirection = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const sortedAndFilteredVehicles = useMemo(() => {
        let augmentedVehicles = vehicles.map(v => ({
            ...v,
            driverName: v.driverId ? (driversById.get(v.driverId) || 'Unassigned') : 'Unassigned'
        }));

        if (searchQuery) {
            const lowercasedQuery = searchQuery.toLowerCase();
            augmentedVehicles = augmentedVehicles.filter(v =>
                v.name.toLowerCase().includes(lowercasedQuery) ||
                v.make.toLowerCase().includes(lowercasedQuery) ||
                v.model.toLowerCase().includes(lowercasedQuery) ||
                v.driverName.toLowerCase().includes(lowercasedQuery)
            );
        }

        augmentedVehicles.sort((a, b) => {
            const aVal = a[sortConfig.key];
            const bVal = b[sortConfig.key];
            if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
        return augmentedVehicles;
    }, [vehicles, searchQuery, sortConfig, driversById]);


    const renderContent = () => {
        if (!isClient) {
            return (
                <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm py-24">
                  <h3 className="text-2xl font-bold tracking-tight">Loading...</h3>
                </div>
            );
        }

        if (vehicles.length === 0) {
            return (
                <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm py-24">
                  <div className="flex flex-col items-center gap-1 text-center">
                    <h3 className="text-2xl font-bold tracking-tight">No vehicles found</h3>
                    <p className="text-sm text-muted-foreground">Get started by adding a new vehicle.</p>
                    {hasPermission('fleet', 'create') && (
                        <Button className="mt-4" onClick={() => handleOpenDialog()}>
                            <Plus className="mr-2 h-4 w-4" /> Add Vehicle
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
                            <TableHead><Button variant="ghost" onClick={() => requestSort('name')}>Name / Number <ArrowUpDown className="ml-2 h-4 w-4" /></Button></TableHead>
                            <TableHead><Button variant="ghost" onClick={() => requestSort('make')}>Make <ArrowUpDown className="ml-2 h-4 w-4" /></Button></TableHead>
                            <TableHead><Button variant="ghost" onClick={() => requestSort('model')}>Model <ArrowUpDown className="ml-2 h-4 w-4" /></Button></TableHead>
                            <TableHead><Button variant="ghost" onClick={() => requestSort('driverName')}>Assigned Driver <ArrowUpDown className="ml-2 h-4 w-4" /></Button></TableHead>
                            <TableHead><Button variant="ghost" onClick={() => requestSort('status')}>Status <ArrowUpDown className="ml-2 h-4 w-4" /></Button></TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {sortedAndFilteredVehicles.map(vehicle => (
                            <TableRow key={vehicle.id}>
                                <TableCell>{vehicle.name}</TableCell>
                                <TableCell>{vehicle.make}</TableCell>
                                <TableCell>{vehicle.model}</TableCell>
                                <TableCell>{vehicle.driverName}</TableCell>
                                <TableCell>{vehicle.status}</TableCell>
                                <TableCell className="text-right">
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            {hasPermission('fleet', 'edit') && <DropdownMenuItem onSelect={() => handleOpenDialog(vehicle)}><Edit className="mr-2 h-4 w-4" /> Edit</DropdownMenuItem>}
                                            {hasPermission('fleet', 'delete') && <DropdownMenuSeparator />}
                                            {hasPermission('fleet', 'delete') && (
                                                <AlertDialog>
                                                    <AlertDialogTrigger asChild><DropdownMenuItem onSelect={e => e.preventDefault()}><Trash2 className="mr-2 h-4 w-4 text-destructive" /> <span className="text-destructive">Delete</span></DropdownMenuItem></AlertDialogTrigger>
                                                    <AlertDialogContent>
                                                        <AlertDialogHeader><AlertDialogTitle>Are you sure?</AlertDialogTitle><AlertDialogDescription>This will permanently delete the vehicle record.</AlertDialogDescription></AlertDialogHeader>
                                                        <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => handleDelete(vehicle.id)}>Delete</AlertDialogAction></AlertDialogFooter>
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
                        <h1 className="text-3xl font-bold tracking-tight">Vehicles</h1>
                        <p className="text-muted-foreground">Manage your fleet of vehicles and driver assignments.</p>
                    </div>
                    <div className="flex items-center gap-2">
                        {isClient && vehicles.length > 0 && (
                            <div className="relative">
                                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    type="search"
                                    placeholder="Search vehicles..."
                                    className="pl-8 sm:w-[300px]"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                />
                            </div>
                        )}
                        {hasPermission('fleet', 'create') && (
                            <DialogTrigger asChild>
                                <Button onClick={() => handleOpenDialog()}>
                                    <Plus className="mr-2 h-4 w-4" /> Add Vehicle
                                </Button>
                            </DialogTrigger>
                        )}
                    </div>
                </header>
                {renderContent()}
            </div>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>{editingVehicle ? 'Edit Vehicle' : 'Add New Vehicle'}</DialogTitle>
                    <DialogDescription>{editingVehicle ? 'Update the details for this vehicle.' : 'Enter the details for the new vehicle.'}</DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="name">Vehicle Name / Number</Label>
                        <Input id="name" name="name" value={formState.name} onChange={handleFormChange} />
                    </div>
                     <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="make">Make</Label>
                            <Input id="make" name="make" value={formState.make} onChange={handleFormChange} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="model">Model</Label>
                            <Input id="model" name="model" value={formState.model} onChange={handleFormChange} />
                        </div>
                    </div>
                     <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="year">Year</Label>
                            <Input id="year" name="year" type="number" value={formState.year} onChange={handleFormChange} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="vin">VIN</Label>
                            <Input id="vin" name="vin" value={formState.vin} onChange={handleFormChange} />
                        </div>
                    </div>
                     <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="driverId">Assigned Driver</Label>
                            <Select value={formState.driverId || 'unassigned'} onValueChange={(value) => handleSelectChange('driverId', value)}>
                                <SelectTrigger id="driverId"><SelectValue placeholder="Select a driver" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="unassigned">Unassigned</SelectItem>
                                    {drivers.map(driver => <SelectItem key={driver.id} value={driver.id}>{driver.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="status">Status</Label>
                            <Select value={formState.status} onValueChange={(value: VehicleStatus) => handleSelectChange('status', value)}>
                                <SelectTrigger id="status"><SelectValue placeholder="Select status" /></SelectTrigger>
                                <SelectContent>
                                    {vehicleStatuses.map(status => <SelectItem key={status} value={status}>{status}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                     </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                    <Button onClick={handleSubmit}>{editingVehicle ? 'Save Changes' : 'Add Vehicle'}</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
