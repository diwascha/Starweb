
'use client';

import { useState, useEffect, useMemo } from 'react';
import useLocalStorage from '@/hooks/use-local-storage';
import type { PolicyOrMembership, PolicyType, Vehicle, Driver } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Plus, Edit, Trash2, MoreHorizontal, ArrowUpDown, Search, CalendarIcon, Check, ChevronsUpDown } from 'lucide-react';
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { format } from 'date-fns';
import { cn, toNepaliDate } from '@/lib/utils';
import { Textarea } from '@/components/ui/textarea';
import { DualCalendar } from '@/components/ui/dual-calendar';

const policyTypes: PolicyType[] = ['Insurance', 'Membership', 'Other'];

type PolicySortKey = 'type' | 'provider' | 'policyNumber' | 'endDate' | 'memberName';
type SortDirection = 'asc' | 'desc';

export default function PoliciesPage() {
    const [policies, setPolicies] = useLocalStorage<PolicyOrMembership[]>('policies', []);
    const [vehicles] = useLocalStorage<Vehicle[]>('vehicles', []);
    const [drivers] = useLocalStorage<Driver[]>('drivers', []);
    const [isClient, setIsClient] = useState(false);
    
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingPolicy, setEditingPolicy] = useState<PolicyOrMembership | null>(null);
    const [formState, setFormState] = useState<Omit<PolicyOrMembership, 'id'>>({
        type: 'Insurance',
        otherTypeDescription: '',
        provider: '',
        policyNumber: '',
        startDate: new Date().toISOString(),
        endDate: new Date().toISOString(),
        cost: 0,
        memberId: '',
        memberType: 'Vehicle',
    });
    
    const [searchQuery, setSearchQuery] = useState('');
    const [sortConfig, setSortConfig] = useState<{ key: PolicySortKey; direction: SortDirection }>({ key: 'endDate', direction: 'asc' });
    const [isProviderPopoverOpen, setIsProviderPopoverOpen] = useState(false);
    const [editingProvider, setEditingProvider] = useState<{ oldName: string; newName: string } | null>(null);

    const { toast } = useToast();
    const { hasPermission } = useAuth();
    
    const membersById = useMemo(() => {
        const map = new Map<string, string>();
        vehicles.forEach(v => map.set(`Vehicle-${v.id}`, v.name));
        drivers.forEach(d => map.set(`Driver-${d.id}`, d.name));
        return map;
    }, [vehicles, drivers]);

    useEffect(() => {
        setIsClient(true);
    }, []);

    const providers = useMemo(() => {
        const providerSet = new Set<string>();
        policies.forEach(p => providerSet.add(p.provider));
        return Array.from(providerSet).sort();
    }, [policies]);

    const resetForm = () => {
        setEditingPolicy(null);
        setFormState({
            type: 'Insurance',
            otherTypeDescription: '',
            provider: '',
            policyNumber: '',
            startDate: new Date().toISOString(),
            endDate: new Date().toISOString(),
            cost: 0,
            memberId: '',
            memberType: 'Vehicle',
        });
    };

    const handleOpenDialog = (policy: PolicyOrMembership | null = null) => {
        if (policy) {
            setEditingPolicy(policy);
            setFormState({
                ...policy,
                otherTypeDescription: policy.otherTypeDescription || '',
            });
        } else {
            resetForm();
        }
        setIsDialogOpen(true);
    };

    const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormState(prev => ({ ...prev, [name]: name === 'cost' ? parseFloat(value) || 0 : value }));
    };
    
    const handleSelectChange = (name: keyof Omit<PolicyOrMembership, 'id'>, value: string) => {
        setFormState(prev => ({ ...prev, [name]: value }));
        if (name === 'memberType') {
            setFormState(prev => ({ ...prev, memberId: '' })); // Reset member when type changes
        }
    };

     const handleDateChange = (name: 'startDate' | 'endDate', date: Date | undefined) => {
        if (date) {
            setFormState(prev => ({ ...prev, [name]: date.toISOString() }));
        }
    };
    
    const handleProviderSelect = (provider: string) => {
        setFormState(prev => ({ ...prev, provider }));
        setIsProviderPopoverOpen(false);
    };

    const handleEditProvider = (providerName: string) => {
        setEditingProvider({ oldName: providerName, newName: providerName });
    };

    const handleUpdateProvider = () => {
        if (!editingProvider) return;
        const { oldName, newName } = editingProvider;

        if (!newName.trim()) {
            toast({ title: 'Error', description: 'Provider name cannot be empty.', variant: 'destructive' });
            return;
        }

        setPolicies(prevPolicies =>
            prevPolicies.map(p => (p.provider === oldName ? { ...p, provider: newName } : p))
        );
        
        if (formState.provider === oldName) {
            setFormState(prev => ({ ...prev, provider: newName }));
        }

        toast({ title: 'Success', description: `Provider "${oldName}" updated to "${newName}".` });
        setEditingProvider(null);
    };

    const handleSubmit = () => {
        const isOtherAndEmpty = formState.type === 'Other' && !formState.otherTypeDescription?.trim();
        if (!formState.provider || !formState.policyNumber || !formState.memberId || isOtherAndEmpty) {
            toast({ title: 'Error', description: 'Provider, Policy Number, associated Vehicle/Driver, and a description for "Other" type are required.', variant: 'destructive' });
            return;
        }

        if (editingPolicy) {
            const updatedPolicy = { ...editingPolicy, ...formState };
            setPolicies(policies.map(p => p.id === editingPolicy.id ? updatedPolicy : p));
            toast({ title: 'Success', description: 'Record updated.' });
        } else {
            const newPolicy: PolicyOrMembership = { id: crypto.randomUUID(), ...formState };
            setPolicies([...policies, newPolicy]);
            toast({ title: 'Success', description: 'New record added.' });
        }
        setIsDialogOpen(false);
        resetForm();
    };

    const handleDelete = (id: string) => {
        setPolicies(policies.filter(p => p.id !== id));
        toast({ title: 'Success', description: 'Record deleted.' });
    };
    
     const requestSort = (key: PolicySortKey) => {
        let direction: SortDirection = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const sortedAndFilteredPolicies = useMemo(() => {
        let augmentedPolicies = policies.map(p => ({
            ...p,
            displayType: p.type === 'Other' ? p.otherTypeDescription || 'Other' : p.type,
            memberName: membersById.get(`${p.memberType}-${p.memberId}`) || 'N/A'
        }));

        if (searchQuery) {
            const lowercasedQuery = searchQuery.toLowerCase();
            augmentedPolicies = augmentedPolicies.filter(p =>
                p.provider.toLowerCase().includes(lowercasedQuery) ||
                p.policyNumber.toLowerCase().includes(lowercasedQuery) ||
                p.memberName.toLowerCase().includes(lowercasedQuery) ||
                (p.displayType || '').toLowerCase().includes(lowercasedQuery)
            );
        }

        augmentedPolicies.sort((a, b) => {
            const aVal = a[sortConfig.key];
            const bVal = b[sortConfig.key];
            if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
        return augmentedPolicies;
    }, [policies, searchQuery, sortConfig, membersById]);


    const renderContent = () => {
        if (!isClient) {
            return (
                <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm py-24">
                  <h3 className="text-2xl font-bold tracking-tight">Loading...</h3>
                </div>
            );
        }

        if (policies.length === 0) {
            return (
                <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm py-24">
                  <div className="flex flex-col items-center gap-1 text-center">
                    <h3 className="text-2xl font-bold tracking-tight">No policies or memberships found</h3>
                    <p className="text-sm text-muted-foreground">Get started by adding a new record.</p>
                    {hasPermission('fleet', 'create') && (
                        <Button className="mt-4" onClick={() => handleOpenDialog()}>
                            <Plus className="mr-2 h-4 w-4" /> Add Record
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
                            <TableHead><Button variant="ghost" onClick={() => requestSort('type')}>Type <ArrowUpDown className="ml-2 h-4 w-4" /></Button></TableHead>
                            <TableHead><Button variant="ghost" onClick={() => requestSort('provider')}>Provider <ArrowUpDown className="ml-2 h-4 w-4" /></Button></TableHead>
                            <TableHead><Button variant="ghost" onClick={() => requestSort('policyNumber')}>Policy/ID Number <ArrowUpDown className="ml-2 h-4 w-4" /></Button></TableHead>
                            <TableHead><Button variant="ghost" onClick={() => requestSort('memberName')}>For <ArrowUpDown className="ml-2 h-4 w-4" /></Button></TableHead>
                            <TableHead><Button variant="ghost" onClick={() => requestSort('endDate')}>Expiry Date (BS) <ArrowUpDown className="ml-2 h-4 w-4" /></Button></TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {sortedAndFilteredPolicies.map(policy => (
                            <TableRow key={policy.id}>
                                <TableCell>{policy.displayType}</TableCell>
                                <TableCell>{policy.provider}</TableCell>
                                <TableCell>{policy.policyNumber}</TableCell>
                                <TableCell>{policy.memberName}</TableCell>
                                <TableCell>{toNepaliDate(policy.endDate)}</TableCell>
                                <TableCell className="text-right">
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            {hasPermission('fleet', 'edit') && <DropdownMenuItem onSelect={() => handleOpenDialog(policy)}><Edit className="mr-2 h-4 w-4" /> Edit</DropdownMenuItem>}
                                            {hasPermission('fleet', 'delete') && <DropdownMenuSeparator />}
                                            {hasPermission('fleet', 'delete') && (
                                                <AlertDialog>
                                                    <AlertDialogTrigger asChild><DropdownMenuItem onSelect={e => e.preventDefault()}><Trash2 className="mr-2 h-4 w-4 text-destructive" /> <span className="text-destructive">Delete</span></DropdownMenuItem></AlertDialogTrigger>
                                                    <AlertDialogContent>
                                                        <AlertDialogHeader><AlertDialogTitle>Are you sure?</AlertDialogTitle><AlertDialogDescription>This will permanently delete the record.</AlertDialogDescription></AlertDialogHeader>
                                                        <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => handleDelete(policy.id)}>Delete</AlertDialogAction></AlertDialogFooter>
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
        <>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <div className="flex flex-col gap-8">
                    <header className="flex items-center justify-between">
                        <div>
                            <h1 className="text-3xl font-bold tracking-tight">Policies & Memberships</h1>
                            <p className="text-muted-foreground">Manage your vehicle insurance and fleet memberships.</p>
                        </div>
                        <div className="flex items-center gap-2">
                            {isClient && policies.length > 0 && (
                                <div className="relative">
                                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        type="search"
                                        placeholder="Search records..."
                                        className="pl-8 sm:w-[300px]"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                    />
                                </div>
                            )}
                            {hasPermission('fleet', 'create') && (
                                <DialogTrigger asChild>
                                    <Button onClick={() => handleOpenDialog()}>
                                        <Plus className="mr-2 h-4 w-4" /> Add Record
                                    </Button>
                                </DialogTrigger>
                            )}
                        </div>
                    </header>
                    {renderContent()}
                </div>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>{editingPolicy ? 'Edit Record' : 'Add New Record'}</DialogTitle>
                        <DialogDescription>{editingPolicy ? 'Update the details for this record.' : 'Enter the details for the new policy or membership.'}</DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="type">Type</Label>
                                <Select value={formState.type} onValueChange={(value: PolicyType) => handleSelectChange('type', value)}>
                                    <SelectTrigger id="type"><SelectValue placeholder="Select type" /></SelectTrigger>
                                    <SelectContent>
                                        {policyTypes.map(type => <SelectItem key={type} value={type}>{type}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                            {formState.type === 'Other' && (
                                <div className="space-y-2">
                                    <Label htmlFor="otherTypeDescription">Description for "Other"</Label>
                                    <Input id="otherTypeDescription" name="otherTypeDescription" value={formState.otherTypeDescription} onChange={handleFormChange} />
                                </div>
                            )}
                            <div className="space-y-2">
                                <Label htmlFor="provider">Provider</Label>
                                 <Popover open={isProviderPopoverOpen} onOpenChange={setIsProviderPopoverOpen}>
                                    <PopoverTrigger asChild>
                                        <Button variant="outline" role="combobox" className="w-full justify-between">
                                            {formState.provider || "Select or type..."}
                                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="p-0">
                                        <Command>
                                            <CommandInput 
                                                placeholder="Search or add provider..."
                                                value={formState.provider}
                                                onValueChange={(value) => setFormState(prev => ({...prev, provider: value}))}
                                            />
                                            <CommandList>
                                                <CommandEmpty>
                                                    <button type="button" className="w-full text-left p-2 text-sm" onClick={() => handleProviderSelect(formState.provider)}>
                                                        Add "{formState.provider}"
                                                    </button>
                                                </CommandEmpty>
                                                <CommandGroup>
                                                    {providers.map((provider) => (
                                                        <CommandItem key={provider} value={provider} onSelect={() => handleProviderSelect(provider)} className="flex justify-between items-center">
                                                            <div className="flex items-center">
                                                                <Check className={cn("mr-2 h-4 w-4", formState.provider.toLowerCase() === provider.toLowerCase() ? "opacity-100" : "opacity-0")} />
                                                                {provider}
                                                            </div>
                                                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); handleEditProvider(provider); }}>
                                                                <Edit className="h-4 w-4"/>
                                                            </Button>
                                                        </CommandItem>
                                                    ))}
                                                </CommandGroup>
                                            </CommandList>
                                        </Command>
                                    </PopoverContent>
                                </Popover>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="policyNumber">Policy / ID Number</Label>
                            <Input id="policyNumber" name="policyNumber" value={formState.policyNumber} onChange={handleFormChange} />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="memberType">For</Label>
                                <Select value={formState.memberType} onValueChange={(value: 'Vehicle' | 'Driver') => handleSelectChange('memberType', value)}>
                                    <SelectTrigger id="memberType"><SelectValue placeholder="Select one" /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="Vehicle">Vehicle</SelectItem>
                                        <SelectItem value="Driver">Driver</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="memberId">{formState.memberType}</Label>
                                <Select value={formState.memberId} onValueChange={(value) => handleSelectChange('memberId', value)} disabled={!formState.memberType}>
                                    <SelectTrigger id="memberId"><SelectValue placeholder={`Select a ${formState.memberType.toLowerCase()}`} /></SelectTrigger>
                                    <SelectContent>
                                        {formState.memberType === 'Vehicle' ? (
                                            vehicles.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)
                                        ) : (
                                            drivers.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)
                                        )}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="startDate">Start Date</Label>
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <Button variant={"outline"} className={cn("w-full justify-start text-left font-normal", !formState.startDate && "text-muted-foreground")}>
                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                        {formState.startDate ? `${toNepaliDate(formState.startDate)} BS (${format(new Date(formState.startDate), "PPP")})` : <span>Pick a date</span>}
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0">
                                        <DualCalendar selected={new Date(formState.startDate)} onSelect={(d) => handleDateChange('startDate', d)} />
                                    </PopoverContent>
                                </Popover>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="endDate">End Date</Label>
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <Button variant={"outline"} className={cn("w-full justify-start text-left font-normal", !formState.endDate && "text-muted-foreground")}>
                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                        {formState.endDate ? `${toNepaliDate(formState.endDate)} BS (${format(new Date(formState.endDate), "PPP")})` : <span>Pick a date</span>}
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0">
                                        <DualCalendar selected={new Date(formState.endDate)} onSelect={(d) => handleDateChange('endDate', d)} />
                                    </PopoverContent>
                                </Popover>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="cost">Cost / Premium</Label>
                            <Input id="cost" name="cost" type="number" value={formState.cost} onChange={handleFormChange} />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                        <Button onClick={handleSubmit}>{editingPolicy ? 'Save Changes' : 'Add Record'}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={!!editingProvider} onOpenChange={() => setEditingProvider(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Edit Provider</DialogTitle>
                    </DialogHeader>
                    {editingProvider && (
                        <div className="grid gap-4 py-4">
                            <div className="space-y-2">
                                <Label htmlFor="provider-name-edit">Provider Name</Label>
                                <Input
                                    id="provider-name-edit"
                                    value={editingProvider.newName}
                                    onChange={(e) => setEditingProvider(prev => prev ? { ...prev, newName: e.target.value } : null)}
                                />
                            </div>
                        </div>
                    )}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setEditingProvider(null)}>Cancel</Button>
                        <Button onClick={handleUpdateProvider}>Save Changes</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
