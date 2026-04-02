'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import type { PolicyOrMembership, Vehicle, Driver, PartyType, PolicyStatus } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Plus, Edit, Trash2, MoreHorizontal, ArrowUpDown, Search, CalendarIcon, Check, ChevronsUpDown, User, RefreshCcw, Archive, AlertTriangle, Info, Loader2 } from 'lucide-react';
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
import { format, differenceInDays, startOfToday, addDays, isPast } from 'date-fns';
import { cn, toNepaliDate } from '@/lib/utils';
import { DualCalendar } from '@/components/ui/dual-calendar';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { onPoliciesUpdate, addPolicy, updatePolicy, deletePolicy } from '@/services/policy-service';
import { onVehiclesUpdate } from '@/services/vehicle-service';
import { onDriversUpdate } from '@/services/driver-service';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

type PolicySortKey = 'type' | 'provider' | 'policyNumber' | 'endDate' | 'memberName' | 'authorship' | 'status' | 'cost';
type SortDirection = 'asc' | 'desc';
type StatusFilter = 'All' | 'Active' | 'Expiring Soon' | 'Expired' | 'Archived';

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
    const [isTypePopoverOpen, setIsTypePopoverOpen] = useState(false);
    
    const [filterMemberType, setFilterMemberType] = useState<'All' | 'Vehicle' | 'Driver'>('All');
    const [filterMemberId, setFilterMemberId] = useState<string>('All');
    const [filterStatus, setFilterStatus] = useState<StatusFilter>('Active');


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
                 setEditingPolicy(null);
                 const startDate = addDays(new Date(policy.endDate), 1).toISOString();
                 const endDate = addDays(new Date(startDate), 365).toISOString();
                setFormState({
                    type: policy.type,
                    provider: policy.provider,
                    policyNumber: '',
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
                    renewedFromId: policy.renewedFromId || null,
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

    const handleTypeSelect = (type: string) => {
        setFormState(prev => ({ ...prev, type }));
        setIsTypePopoverOpen(false);
    };

    const handleSubmit = async () => {
        if (!user) return;
        if (!formState.type || !formState.provider || !formState.policyNumber || !formState.memberId) {
            toast({
                title: 'Error',
                description: 'Type, Provider, Policy Number, and associated Vehicle/Driver are required.',
                variant: 'destructive',
            });
            return;
        }
        const nowIso = new Date().toISOString();
        try {
            if (editingPolicy && !isRenewal) {
                const updatedData: Partial<Omit<PolicyOrMembership, 'id'>> = {
                    ...formState,
                    lastModifiedBy: user.username,
                    lastModifiedAt: nowIso,
                };
                await updatePolicy(editingPolicy.id, updatedData);
                toast({ title: 'Success', description: 'Record updated.' });
            } else {
                const newData: Omit<PolicyOrMembership, 'id' | 'createdAt' | 'lastModifiedAt'|'renewedToId'> = {
                    ...formState,
                    status: 'Active',
                    createdBy: user.username,
                };
                const newPolicyId = await addPolicy(newData);
                if (isRenewal && formState.renewedFromId) {
                    await updatePolicy(formState.renewedFromId, {
                        status: 'Renewed',
                        renewedToId: newPolicyId,
                        lastModifiedBy: user.username,
                        lastModifiedAt: nowIso,
                    });
                }
                toast({
                    title: 'Success',
                    description: `New record ${isRenewal ? 'for renewal ' : ''}added.`,
                });
            }
            setIsDialogOpen(false);
            resetForm();
        } catch (error) {
            console.error(error);
            toast({
                title: 'Error',
                description: 'Failed to save record.',
                variant: 'destructive',
            });
        }
    };
      
    const handleArchive = async (policy: PolicyOrMembership) => {
        if (!user) return;
        try {
          await updatePolicy(policy.id, {
            status: 'Archived',
            lastModifiedBy: user.username,
            lastModifiedAt: new Date().toISOString(),
          });
          toast({ title: 'Success', description: 'Policy moved to history.' });
        } catch (error) {
          toast({ title: 'Error', description: 'Failed to archive policy.', variant: 'destructive' });
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
    
     const requestSort = (key: PolicySortKey) => {
        let direction: SortDirection = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const sortedAndFilteredPolicies = useMemo(() => {
        const today = startOfToday();
        
        let augmentedPolicies = policies.map(p => {
            const daysRemaining = differenceInDays(new Date(p.endDate), today);
            
            let displayStatus: 'Active' | 'Expired' | 'Renewed' | 'Archived';
            if (p.status === 'Renewed') displayStatus = 'Renewed';
            else if (p.status === 'Archived') displayStatus = 'Archived';
            else if (isPast(new Date(p.endDate))) displayStatus = 'Expired';
            else displayStatus = 'Active';

            return {
                ...p,
                memberName: membersById.get(p.memberId)?.name || 'N/A',
                displayStatus,
                daysRemaining,
            }
        });

        // 1. Filter by Status
        if (filterStatus === 'Active') {
            augmentedPolicies = augmentedPolicies.filter(p => p.displayStatus === 'Active');
        } else if (filterStatus === 'Expiring Soon') {
            augmentedPolicies = augmentedPolicies.filter(p => p.displayStatus === 'Active' && p.daysRemaining >= 0 && p.daysRemaining <= 15);
        } else if (filterStatus === 'Expired') {
            augmentedPolicies = augmentedPolicies.filter(p => p.displayStatus === 'Expired');
        } else if (filterStatus === 'Archived') {
            augmentedPolicies = augmentedPolicies.filter(p => p.displayStatus === 'Archived' || p.displayStatus === 'Renewed');
        }

        // 2. Filter by Search Query
        if (searchQuery) {
            const lowercasedQuery = searchQuery.toLowerCase();
            augmentedPolicies = augmentedPolicies.filter(p =>
                p.provider.toLowerCase().includes(lowercasedQuery) ||
                p.policyNumber.toLowerCase().includes(lowercasedQuery) ||
                p.memberName.toLowerCase().includes(lowercasedQuery) ||
                p.type.toLowerCase().includes(lowercasedQuery)
            );
        }
        
        // 3. Filter by Member Type/Id
        if (filterMemberType !== 'All') {
            augmentedPolicies = augmentedPolicies.filter(p => p.memberType === filterMemberType);
             if (filterMemberId !== 'All') {
                augmentedPolicies = augmentedPolicies.filter(p => p.memberId === filterMemberId);
            }
        }

        // 4. Sort
        augmentedPolicies.sort((a, b) => {
            if (sortConfig.key === 'authorship') {
                const aDate = a.lastModifiedAt || a.createdAt;
                const bDate = b.lastModifiedAt || b.createdAt;
                if (!aDate || !bDate) return 0;
                if (aDate < bDate) return sortConfig.direction === 'asc' ? -1 : 1;
                if (aDate > bDate) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            }

            const aVal = a[sortConfig.key as keyof typeof a] ?? '';
            const bVal = b[sortConfig.key as keyof typeof b] ?? '';
            if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
        return augmentedPolicies;
    }, [policies, searchQuery, filterMemberType, filterMemberId, filterStatus, sortConfig, membersById]);

    const totalFilteredCost = useMemo(() => {
        return sortedAndFilteredPolicies.reduce((sum, p) => sum + (p.cost || 0), 0);
    }, [sortedAndFilteredPolicies]);

    const getStatusBadge = (policy: any) => {
        if (policy.status === 'Renewed') return <Badge variant="outline" className="text-muted-foreground border-muted-foreground">Renewed</Badge>;
        if (policy.status === 'Archived') return <Badge variant="outline" className="text-muted-foreground border-muted-foreground">Archived</Badge>;
        
        if (policy.daysRemaining < 0) return <Badge variant="destructive">Expired</Badge>;
        if (policy.daysRemaining <= 15) return <Badge variant="default" className="bg-amber-500 text-black hover:bg-amber-600">Soon</Badge>;
        return <Badge variant="default" className="bg-green-600 hover:bg-green-700">Active</Badge>;
    };


    const renderContent = () => {
        if (isLoading) {
            return (
                <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm py-24">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
            );
        }

        if (policies.length === 0) {
            return (
                <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm py-24">
                  <div className="flex flex-col items-center gap-1 text-center">
                    <h3 className="text-2xl font-bold tracking-tight">No records found</h3>
                    <p className="text-sm text-muted-foreground">Start by adding your first insurance policy or membership.</p>
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
                            <TableHead><Button variant="ghost" onClick={() => requestSort('type')} className="p-0">Type <ArrowUpDown className="ml-2 h-4 w-4" /></Button></TableHead>
                            <TableHead><Button variant="ghost" onClick={() => requestSort('policyNumber')} className="p-0">Policy # <ArrowUpDown className="ml-2 h-4 w-4" /></Button></TableHead>
                            <TableHead><Button variant="ghost" onClick={() => requestSort('memberName')} className="p-0">For <ArrowUpDown className="ml-2 h-4 w-4" /></Button></TableHead>
                            <TableHead><Button variant="ghost" onClick={() => requestSort('endDate')} className="p-0">Expiry Date <ArrowUpDown className="ml-2 h-4 w-4" /></Button></TableHead>
                            <TableHead><Button variant="ghost" onClick={() => requestSort('cost')} className="p-0 text-right w-full">Premium <ArrowUpDown className="ml-2 h-4 w-4" /></Button></TableHead>
                            <TableHead>Status</TableHead>
                             <TableHead><Button variant="ghost" onClick={() => requestSort('authorship')} className="p-0">Authorship <ArrowUpDown className="ml-2 h-4 w-4" /></Button></TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {sortedAndFilteredPolicies.map(policy => (
                            <TableRow key={policy.id} className={cn(
                                policy.displayStatus === 'Expired' && 'bg-red-50/50 hover:bg-red-100/50',
                                (policy.displayStatus === 'Active' && policy.daysRemaining <= 15) && 'bg-amber-50/50 hover:bg-amber-100/50'
                            )}>
                                <TableCell className="font-medium">{policy.type}</TableCell>
                                <TableCell>{policy.policyNumber}</TableCell>
                                <TableCell>{policy.memberName}</TableCell>
                                <TableCell>
                                    <div className="flex flex-col">
                                        <span className="text-sm">{toNepaliDate(policy.endDate)}</span>
                                        <span className={cn(
                                            "text-[10px] font-bold uppercase",
                                            policy.daysRemaining < 0 ? 'text-destructive' : (policy.daysRemaining <= 15 ? 'text-amber-600' : 'text-muted-foreground')
                                        )}>
                                            {policy.daysRemaining < 0 ? `${-policy.daysRemaining} days ago` : `${policy.daysRemaining} days left`}
                                        </span>
                                    </div>
                                </TableCell>
                                <TableCell className="text-right tabular-nums">Rs. {policy.cost.toLocaleString()}</TableCell>
                                <TableCell>{getStatusBadge(policy)}</TableCell>
                                <TableCell>
                                    <TooltipProvider>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <div className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-help">
                                                    <Info className="h-3 w-3" />
                                                    <span>{policy.lastModifiedBy || policy.createdBy}</span>
                                                </div>
                                            </TooltipTrigger>
                                            <TooltipContent>
                                                <div className="text-xs space-y-1">
                                                    <p><span className="font-semibold">Created:</span> {policy.createdBy} ({format(new Date(policy.createdAt), "PPp")})</p>
                                                    {policy.lastModifiedBy && (
                                                        <p><span className="font-semibold">Modified:</span> {policy.lastModifiedBy} ({format(new Date(policy.lastModifiedAt || policy.createdAt), "PPp")})</p>
                                                    )}
                                                </div>
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
                                                {policy.status !== 'Archived' && (
                                                    <DropdownMenuItem onSelect={() => handleArchive(policy)}>
                                                        <Archive className="mr-2 h-4 w-4" /> Move to History
                                                    </DropdownMenuItem>
                                                )}
                                                </>
                                            )}
                                            {hasPermission('fleet', 'delete') && <DropdownMenuSeparator />}
                                            {hasPermission('fleet', 'delete') && (
                                                <AlertDialog>
                                                    <AlertDialogTrigger asChild><DropdownMenuItem onSelect={e => e.preventDefault()} className="text-destructive"><Trash2 className="mr-2 h-4 w-4" /> Delete</DropdownMenuItem></AlertDialogTrigger>
                                                    <AlertDialogContent>
                                                        <AlertDialogHeader><AlertDialogTitle>Confirm Deletion</AlertDialogTitle><AlertDialogDescription>This will permanently remove this record from the database. This action cannot be reversed.</AlertDialogDescription></AlertDialogHeader>
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
        <div className="space-y-8">
            <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Policies & Memberships</h1>
                    <p className="text-muted-foreground">Tracking vehicle insurance, road tax, and fleet memberships.</p>
                </div>
                {hasPermission('fleet', 'create') && (
                    <Button onClick={() => handleOpenDialog()}>
                        <Plus className="mr-2 h-4 w-4" /> New Record
                    </Button>
                )}
            </header>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground uppercase">Summary</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{sortedAndFilteredPolicies.length} Records</div>
                        <p className="text-xs text-muted-foreground">Under current filters</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground uppercase">Total Cost</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">Rs. {totalFilteredCost.toLocaleString()}</div>
                        <p className="text-xs text-muted-foreground">Premium / Membership Total</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground uppercase">Urgency</CardTitle>
                    </CardHeader>
                    <CardContent className="flex gap-2">
                        <div className="flex flex-col">
                            <span className="text-xl font-bold text-destructive">{policies.filter(p => p.status === 'Active' && isPast(new Date(p.endDate))).length}</span>
                            <span className="text-[10px] uppercase text-muted-foreground">Expired</span>
                        </div>
                        <Separator orientation="vertical" className="h-10" />
                        <div className="flex flex-col">
                            <span className="text-xl font-bold text-amber-600">{policies.filter(p => p.status === 'Active' && !isPast(new Date(p.endDate)) && differenceInDays(new Date(p.endDate), startOfToday()) <= 15).length}</span>
                            <span className="text-[10px] uppercase text-muted-foreground">Soon</span>
                        </div>
                    </CardContent>
                </Card>
            </div>
            
            <div className="flex flex-col md:flex-row gap-4 items-start md:items-center">
                <div className="relative flex-1 w-full">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        type="search"
                        placeholder="Search by provider, policy # or vehicle..."
                        className="pl-8 w-full"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
                <div className="flex flex-wrap gap-2 w-full md:w-auto">
                    <Select value={filterStatus} onValueChange={(v: StatusFilter) => setFilterStatus(v)}>
                        <SelectTrigger className="w-[140px] h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="All">All Records</SelectItem>
                            <SelectItem value="Active">Active Only</SelectItem>
                            <SelectItem value="Expiring Soon">Expiring Soon</SelectItem>
                            <SelectItem value="Expired">Expired</SelectItem>
                            <SelectItem value="Archived">History</SelectItem>
                        </SelectContent>
                    </Select>
                    <Select value={filterMemberType} onValueChange={(value: 'All' | 'Vehicle' | 'Driver') => setFilterMemberType(value)}>
                        <SelectTrigger className="w-[120px] h-9"><SelectValue placeholder="For Type" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="All">Vehicles & Drivers</SelectItem>
                            <SelectItem value="Vehicle">Vehicles</SelectItem>
                            <SelectItem value="Driver">Drivers</SelectItem>
                        </SelectContent>
                    </Select>
                    <Select value={filterMemberId} onValueChange={setFilterMemberId} disabled={filterMemberType === 'All'}>
                        <SelectTrigger className="w-[180px] h-9"><SelectValue placeholder="All Members" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="All">All {filterMemberType}s</SelectItem>
                            {filterMemberType === 'Vehicle' && vehicles.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
                            {filterMemberType === 'Driver' && drivers.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {renderContent()}

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
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
                                                        <CommandItem key={type} value={type} onSelect={() => handleTypeSelect(type)}>
                                                            <Check className={cn("mr-2 h-4 w-4", formState.type.toLowerCase() === type.toLowerCase() ? "opacity-100" : "opacity-0")} />
                                                            {type}
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
                                                        <CommandItem key={provider} value={provider} onSelect={() => handleProviderSelect(provider)}>
                                                            <Check className={cn("mr-2 h-4 w-4", formState.provider.toLowerCase() === provider.toLowerCase() ? "opacity-100" : "opacity-0")} />
                                                            {provider}
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
                            <Label htmlFor="cost">Cost / Premium (NPR)</Label>
                            <Input id="cost" name="cost" type="number" value={formState.cost} onChange={handleFormChange} />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                        <Button onClick={handleSubmit}>{editingPolicy ? 'Save Changes' : (isRenewal ? 'Renew Record' : 'Add Record')}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
