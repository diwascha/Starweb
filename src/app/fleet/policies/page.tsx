
'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import type { PolicyOrMembership, Vehicle, Driver, PartyType, PolicyStatus } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Plus, Edit, Trash2, MoreHorizontal, ArrowUpDown, Search, CalendarIcon, Check, ChevronsUpDown, User, RefreshCcw, History, Archive } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/use-auth';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { format, differenceInDays, startOfToday, addDays } from 'date-fns';
import { cn, toNepaliDate } from '@/lib/utils';
import { DualCalendar } from '@/components/ui/dual-calendar';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { onPoliciesUpdate, addPolicy, updatePolicy, deletePolicy } from '@/services/policy-service';
import { onVehiclesUpdate } from '@/services/vehicle-service';
import { onDriversUpdate } from '@/services/driver-service';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';


type PolicySortKey = 'type' | 'provider' | 'policyNumber' | 'endDate' | 'memberName' | 'authorship';
type SortDirection = 'asc' | 'desc';

export default function PoliciesPage() {
    const [policies, setPolicies] = useState<PolicyOrMembership[]>([]);
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [drivers, setDrivers] = useState<Driver[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingPolicy, setEditingPolicy] = useState<PolicyOrMembership | null>(null);
    const [isRenewal, setIsRenewal] = useState(false);
    const [formState, setFormState] = useState<Omit<PolicyOrMembership, 'id' | 'createdBy' | 'lastModifiedBy' | 'createdAt' | 'lastModifiedAt'>>({
        type: 'Insurance',
        provider: '',
        policyNumber: '',
        startDate: new Date().toISOString(),
        endDate: new Date().toISOString(),
        cost: 0,
        memberId: '',
        memberType: 'Vehicle',
        renewedFromId: undefined,
        status: 'Active',
    });
    
    const [searchQuery, setSearchQuery] = useState('');
    const [sortConfig, setSortConfig] = useState<{ key: PolicySortKey; direction: SortDirection }>({ key: 'endDate', direction: 'asc' });
    
    const [isProviderPopoverOpen, setIsProviderPopoverOpen] = useState(false);
    const [editingProvider, setEditingProvider] = useState<{ oldName: string; newName: string } | null>(null);
    const [isTypePopoverOpen, setIsTypePopoverOpen] = useState(false);
    const [editingType, setEditingType] = useState<{ oldName: string; newName: string } | null>(null);
    
    const [filterMemberType, setFilterMemberType] = useState<'All' | 'Vehicle' | 'Driver'>('All');
    const [filterMemberId, setFilterMemberId] = useState<string>('All');
    const [activeTab, setActiveTab] = useState('current');


    const { toast } = useToast();
    const { hasPermission, user } = useAuth();
    
    const membersById = useMemo(() => {
        const map = new Map<string, { name: string, type: 'Vehicle' | 'Driver' }>();
        vehicles.forEach(v => map.set(v.id, { name: v.name, type: 'Vehicle' }));
        drivers.forEach(d => map.set(d.id, { name: d.name, type: 'Driver' }));
        return map;
    }, [vehicles, drivers]);

    useEffect(() => {
        setIsLoading(true);
        const unsubPolicies = onPoliciesUpdate(setPolicies);
        const unsubVehicles = onVehiclesUpdate(setVehicles);
        const unsubDrivers = onDriversUpdate(setDrivers);
        setIsLoading(false);

        return () => {
            unsubPolicies();
            unsubVehicles();
            unsubDrivers();
        }
    }, []);
    
    useEffect(() => {
        setFilterMemberId('All');
    }, [filterMemberType]);

    const providers = useMemo(() => Array.from(new Set(policies.map(p => p.provider))).sort(), [policies]);
    const policyTypes = useMemo(() => Array.from(new Set(policies.map(p => p.type))).sort(), [policies]);

    const resetForm = () => {
        setEditingPolicy(null);
        setIsRenewal(false);
        setFormState({
            type: 'Insurance',
            provider: '',
            policyNumber: '',
            startDate: new Date().toISOString(),
            endDate: new Date().toISOString(),
            cost: 0,
            memberId: '',
            memberType: 'Vehicle',
            status: 'Active',
        });
    };

    const handleOpenDialog = (policy: PolicyOrMembership | null = null, renew = false) => {
        setIsRenewal(renew);
        if (policy) {
            if (renew) {
                setEditingPolicy(null); // It's a new record, not editing the old one
                 const startDate = addDays(new Date(policy.endDate), 1).toISOString();
                 const endDate = addDays(new Date(startDate), 365).toISOString();
                setFormState({
                    type: policy.type,
                    provider: policy.provider,
                    policyNumber: '', // Clear policy number for new entry
                    startDate,
                    endDate,
                    cost: policy.cost,
                    memberId: policy.memberId,
                    memberType: policy.memberType,
                    renewedFromId: policy.id,
                    status: 'Active',
                });
            } else {
                setEditingPolicy(policy);
                setFormState({
                    type: policy.type,
                    provider: policy.provider,
                    policyNumber: policy.policyNumber,
                    startDate: policy.startDate,
                    endDate: policy.endDate,
                    cost: policy.cost,
                    memberId: policy.memberId,
                    memberType: policy.memberType,
                    renewedFromId: policy.renewedFromId,
                    status: policy.status || 'Active',
                });
            }
        } else {
            resetForm();
        }
        setIsDialogOpen(true);
    };

    const handleFormChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormState(prev => ({ ...prev, [name]: name === 'cost' ? parseFloat(value) || 0 : value }));
    };
    
    const handleSelectChange = (name: keyof typeof formState, value: string) => {
        setFormState(prev => ({ ...prev, [name]: value }));
        if (name === 'memberType') {
            setFormState(prev => ({ ...prev, memberId: '' }));
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

    const handleUpdateProvider = async () => {
        if (!editingProvider) return;
        const { oldName, newName } = editingProvider;

        if (!newName.trim()) {
            toast({ title: 'Error', description: 'Provider name cannot be empty.', variant: 'destructive' });
            return;
        }
        
        const updates = policies
            .filter(p => p.provider === oldName)
            .map(p => updatePolicy(p.id, { provider: newName }));
        
        try {
            await Promise.all(updates);
            if (formState.provider === oldName) {
                setFormState(prev => ({ ...prev, provider: newName }));
            }
            toast({ title: 'Success', description: `Provider "${oldName}" updated to "${newName}".` });
            setEditingProvider(null);
        } catch {
            toast({ title: 'Error', description: 'Failed to update providers.', variant: 'destructive' });
        }
    };
    
    const handleTypeSelect = (type: string) => {
        setFormState(prev => ({ ...prev, type }));
        setIsTypePopoverOpen(false);
    };

    const handleEditType = (typeName: string) => {
        setEditingType({ oldName: typeName, newName: typeName });
    };

    const handleUpdateType = async () => {
        if (!editingType) return;
        const { oldName, newName } = editingType;

        if (!newName.trim()) {
            toast({ title: 'Error', description: 'Type name cannot be empty.', variant: 'destructive' });
            return;
        }

        const updates = policies
            .filter(p => p.type === oldName)
            .map(p => updatePolicy(p.id, { type: newName }));
        
        try {
            await Promise.all(updates);
            if (formState.type === oldName) {
                setFormState(prev => ({ ...prev, type: newName }));
            }
            toast({ title: 'Success', description: `Type "${oldName}" updated to "${newName}".` });
            setEditingType(null);
        } catch {
             toast({ title: 'Error', description: 'Failed to update types.', variant: 'destructive' });
        }
    };


    const handleSubmit = async () => {
        if (!user) return;
        if (!formState.type || !formState.provider || !formState.policyNumber || !formState.memberId) {
            toast({ title: 'Error', description: 'Type, Provider, Policy Number, and associated Vehicle/Driver are required.', variant: 'destructive' });
            return;
        }

        try {
            if (isRenewal && !editingPolicy) {
                const oldPolicyId = formState.renewedFromId;
                if (oldPolicyId) {
                    await updatePolicy(oldPolicyId, { status: 'Renewed', lastModifiedBy: user.username });
                }
            }

            if (editingPolicy) {
                const updatedData: Partial<Omit<PolicyOrMembership, 'id'>> = { ...formState, lastModifiedBy: user.username };
                await updatePolicy(editingPolicy.id, updatedData);
                toast({ title: 'Success', description: 'Record updated.' });
            } else {
                const newData: Omit<PolicyOrMembership, 'id' | 'createdAt' | 'lastModifiedAt'> = { ...formState, createdBy: user.username };
                await addPolicy(newData);
                toast({ title: 'Success', description: `New record ${isRenewal ? 'for renewal ' : ''}added.` });
            }
            setIsDialogOpen(false);
            resetForm();
        } catch (error) {
            toast({ title: 'Error', description: 'Failed to save record.', variant: 'destructive' });
        }
    };

    const handleDelete = async (id: string) => {
        try {
            await deletePolicy(id);
            toast({ title: 'Success', description: 'Record deleted.' });
        } catch (error) {
            toast({ title: 'Error', description: 'Failed to delete record.', variant: 'destructive' });
        }
    };

    const handleArchive = async (policy: PolicyOrMembership) => {
        if (!user) return;
        try {
            await updatePolicy(policy.id, { status: 'Archived', lastModifiedBy: user.username });
            toast({ title: 'Success', description: 'Policy moved to history.' });
        } catch (error) {
            toast({ title: 'Error', description: 'Failed to archive policy.', variant: 'destructive' });
        }
    };
    
     const requestSort = (key: PolicySortKey) => {
        let direction: SortDirection = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };
    
    const getExpiryStatus = (endDate: string) => {
        const today = startOfToday();
        const expiryDate = new Date(endDate);
        const daysRemaining = differenceInDays(expiryDate, today);

        if (daysRemaining < 0) {
            return { text: `Expired ${-daysRemaining} days ago`, color: 'bg-red-500', days: daysRemaining };
        }
        if (daysRemaining <= 7) {
            return { text: `Expires in ${daysRemaining} days`, color: 'bg-orange-500', days: daysRemaining };
        }
        if (daysRemaining <= 30) {
            return { text: `Expires in ${daysRemaining} days`, color: 'bg-yellow-500', days: daysRemaining };
        }
        return { text: `Expires in ${daysRemaining} days`, color: 'bg-green-500', days: daysRemaining };
    };


    const sortedAndFilteredPolicies = useMemo(() => {
        const renewedPolicyIds = new Set(policies.map(p => p.renewedFromId).filter(Boolean));

        let augmentedPolicies = policies.map(p => ({
            ...p,
            memberName: membersById.get(p.memberId)?.name || 'N/A',
            expiryStatus: getExpiryStatus(p.endDate),
            isRenewed: renewedPolicyIds.has(p.id)
        }));

        if (searchQuery) {
            const lowercasedQuery = searchQuery.toLowerCase();
            augmentedPolicies = augmentedPolicies.filter(p =>
                p.provider.toLowerCase().includes(lowercasedQuery) ||
                p.policyNumber.toLowerCase().includes(lowercasedQuery) ||
                p.memberName.toLowerCase().includes(lowercasedQuery) ||
                p.type.toLowerCase().includes(lowercasedQuery)
            );
        }
        
        if (filterMemberType !== 'All') {
            augmentedPolicies = augmentedPolicies.filter(p => p.memberType === filterMemberType);
             if (filterMemberId !== 'All') {
                augmentedPolicies = augmentedPolicies.filter(p => p.memberId === filterMemberId);
            }
        }
        
        if (activeTab === 'history') {
            augmentedPolicies = augmentedPolicies.filter(p => p.status === 'Renewed' || p.status === 'Archived');
        } else { // 'current' tab
            augmentedPolicies = augmentedPolicies.filter(p => p.status !== 'Renewed' && p.status !== 'Archived');
        }

        augmentedPolicies.sort((a, b) => {
            if (sortConfig.key === 'authorship') {
                const aDate = a.lastModifiedAt || a.createdAt;
                const bDate = b.lastModifiedAt || b.createdAt;
                if (!aDate || !bDate) return 0;
                if (aDate < bDate) return sortConfig.direction === 'asc' ? -1 : 1;
                if (aDate > bDate) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            }

            if (sortConfig.key === 'endDate') {
                const aDays = a.expiryStatus.days;
                const bDays = b.expiryStatus.days;
                if (aDays < bDays) return sortConfig.direction === 'asc' ? -1 : 1;
                if (aDays > bDays) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            }

            const aVal = a[sortConfig.key as keyof typeof a] ?? '';
            const bVal = b[sortConfig.key as keyof typeof b] ?? '';
            if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
        return augmentedPolicies;
    }, [policies, searchQuery, sortConfig, membersById, filterMemberType, filterMemberId, activeTab]);


    const renderContent = () => {
        if (isLoading) {
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
                            <TableHead>Status</TableHead>
                             <TableHead><Button variant="ghost" onClick={() => requestSort('authorship')}>Authorship <ArrowUpDown className="ml-2 h-4 w-4" /></Button></TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {sortedAndFilteredPolicies.map(policy => (
                            <TableRow key={policy.id}>
                                <TableCell>{policy.type}</TableCell>
                                <TableCell>{policy.provider}</TableCell>
                                <TableCell>{policy.policyNumber}</TableCell>
                                <TableCell>{policy.memberName}</TableCell>
                                <TableCell>{toNepaliDate(policy.endDate)}</TableCell>
                                <TableCell>
                                     <TooltipProvider>
                                        <Tooltip>
                                            <TooltipTrigger>
                                                <div className="flex items-center gap-2">
                                                    <span className={cn("h-2 w-2 rounded-full", policy.expiryStatus.days < 0 && 'bg-red-500', policy.expiryStatus.days >= 0 && policy.expiryStatus.days <= 30 && 'bg-yellow-500', policy.expiryStatus.days > 30 && 'bg-green-500' )}></span>
                                                    <span>{policy.expiryStatus.text}</span>
                                                </div>
                                            </TooltipTrigger>
                                            <TooltipContent>
                                                <p>Expires on {format(new Date(policy.endDate), "PPP")}</p>
                                            </TooltipContent>
                                        </Tooltip>
                                     </TooltipProvider>
                                </TableCell>
                                <TableCell>
                                    <TooltipProvider>
                                        <Tooltip>
                                            <TooltipTrigger className="flex items-center gap-1.5 text-sm text-muted-foreground cursor-default">
                                                {policy.lastModifiedBy ? <Edit className="h-4 w-4" /> : <User className="h-4 w-4" />}
                                                <span>{policy.lastModifiedBy || policy.createdBy}</span>
                                            </TooltipTrigger>
                                            <TooltipContent>
                                                {policy.createdBy && (
                                                    <p>
                                                    Created by: {policy.createdBy}
                                                    {policy.createdAt ? ` on ${format(new Date(policy.createdAt), "PP")}` : ''}
                                                    </p>
                                                )}
                                                {policy.lastModifiedBy && policy.lastModifiedAt && (
                                                <p>
                                                    Modified by: {policy.lastModifiedBy}
                                                    {policy.lastModifiedAt ? ` on ${format(new Date(policy.lastModifiedAt), "PP")}` : ''}
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
                                            {hasPermission('fleet', 'edit') && (
                                                <>
                                                 <DropdownMenuItem onSelect={() => handleOpenDialog(policy, true)}>
                                                    <RefreshCcw className="mr-2 h-4 w-4" /> Renew
                                                </DropdownMenuItem>
                                                <DropdownMenuItem onSelect={() => handleOpenDialog(policy)}>
                                                    <Edit className="mr-2 h-4 w-4" /> Edit
                                                </DropdownMenuItem>
                                                {policy.status === 'Active' && (
                                                    <DropdownMenuItem onSelect={() => handleArchive(policy)}>
                                                        <Archive className="mr-2 h-4 w-4" /> Move to History
                                                    </DropdownMenuItem>
                                                )}
                                                </>
                                            )}
                                            {hasPermission('fleet', 'delete') && hasPermission('fleet', 'edit') && <DropdownMenuSeparator />}
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
                            {hasPermission('fleet', 'create') && (
                                <DialogTrigger asChild>
                                    <Button onClick={() => handleOpenDialog()}>
                                        <Plus className="mr-2 h-4 w-4" /> Add Record
                                    </Button>
                                </DialogTrigger>
                            )}
                        </div>
                    </header>
                    
                    <Tabs value={activeTab} onValueChange={setActiveTab}>
                        <TabsList>
                            <TabsTrigger value="current">Current Policies</TabsTrigger>
                            <TabsTrigger value="history">Renewal History</TabsTrigger>
                        </TabsList>
                        
                         {policies.length > 0 && (
                            <div className="flex flex-col md:flex-row gap-2 mt-4">
                                <div className="relative flex-1">
                                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        type="search"
                                        placeholder="Search records..."
                                        className="pl-8 w-full"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                    />
                                </div>
                                <div className="flex gap-2">
                                    <Select value={filterMemberType} onValueChange={(value: 'All' | 'Vehicle' | 'Driver') => setFilterMemberType(value)}>
                                        <SelectTrigger className="w-full md:w-[150px]">
                                            <SelectValue placeholder="Filter by type..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="All">All Types</SelectItem>
                                            <SelectItem value="Vehicle">Vehicles</SelectItem>
                                            <SelectItem value="Driver">Drivers</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <Select value={filterMemberId} onValueChange={setFilterMemberId} disabled={filterMemberType === 'All'}>
                                        <SelectTrigger className="w-full md:w-[200px]">
                                            <SelectValue placeholder={`Filter ${filterMemberType}...`} />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="All">All {filterMemberType}s</SelectItem>
                                            {filterMemberType === 'Vehicle' && vehicles.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
                                            {filterMemberType === 'Driver' && drivers.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                        )}

                        <TabsContent value="current" className="mt-4">
                            {renderContent()}
                        </TabsContent>
                        <TabsContent value="history" className="mt-4">
                            {renderContent()}
                        </TabsContent>
                    </Tabs>

                </div>
                <DialogContent className="sm:max-w-xl">
                    <DialogHeader>
                        <DialogTitle>{editingPolicy ? (isRenewal ? 'Renew Record' : 'Edit Record') : 'Add New Record'}</DialogTitle>
                        <DialogDescription>{editingPolicy ? (isRenewal ? 'Enter the details for the renewal.' : 'Update the details for this record.') : 'Enter the details for the new policy or membership.'}</DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-6 py-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                             <div className="space-y-2">
                                <Label htmlFor="type">Type</Label>
                                 <Popover open={isTypePopoverOpen} onOpenChange={setIsTypePopoverOpen}>
                                    <PopoverTrigger asChild>
                                        <Button variant="outline" role="combobox" className="w-full justify-between">
                                            {formState.type || "Select or type..."}
                                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="p-0">
                                        <Command>
                                            <CommandInput 
                                                placeholder="Search or add type..."
                                                value={formState.type}
                                                onValueChange={(value) => setFormState(prev => ({...prev, type: value}))}
                                            />
                                            <CommandList>
                                                <CommandEmpty>
                                                    <button type="button" className="w-full text-left p-2 text-sm" onClick={() => handleTypeSelect(formState.type)}>
                                                        Add "{formState.type}"
                                                    </button>
                                                </CommandEmpty>
                                                <CommandGroup>
                                                    {policyTypes.map((type) => (
                                                        <CommandItem key={type} value={type} onSelect={() => handleTypeSelect(type)} className="flex justify-between items-center">
                                                            <div className="flex items-center">
                                                                <Check className={cn("mr-2 h-4 w-4", formState.type.toLowerCase() === type.toLowerCase() ? "opacity-100" : "opacity-0")} />
                                                                {type}
                                                            </div>
                                                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); handleEditType(type); }}>
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
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                        <Button onClick={handleSubmit}>{editingPolicy ? 'Save Changes' : (isRenewal ? 'Renew Record' : 'Add Record')}</Button>
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
            
            <Dialog open={!!editingType} onOpenChange={() => setEditingType(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Edit Type</DialogTitle>
                    </DialogHeader>
                    {editingType && (
                        <div className="grid gap-4 py-4">
                            <div className="space-y-2">
                                <Label htmlFor="type-name-edit">Type Name</Label>
                                <Input
                                    id="type-name-edit"
                                    value={editingType.newName}
                                    onChange={(e) => setEditingType(prev => prev ? { ...prev, newName: e.target.value } : null)}
                                />
                            </div>
                        </div>
                    )}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setEditingType(null)}>Cancel</Button>
                        <Button onClick={handleUpdateType}>Save Changes</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}

