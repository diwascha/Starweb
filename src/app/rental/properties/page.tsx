'use client';

import { useState, useEffect, useMemo, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { 
    Building2, 
    Plus, 
    Search, 
    MoreHorizontal, 
    Edit, 
    Trash2, 
    Home, 
    MapPin, 
    Eye, 
    UserPlus, 
    Receipt, 
    Filter,
    LayoutGrid,
    List,
    Loader2,
    X
} from 'lucide-react';
import type { RentalProperty, RentalUnit } from '@/lib/types';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { onPropertiesUpdate, addProperty, updateProperty, deleteProperty } from '@/services/property-service';
import { onUnitsUpdate, addUnit, updateUnit, deleteUnit } from '@/services/unit-service';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import Link from 'next/link';

function AssetRegistryContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const { user, hasPermission } = useAuth();
    const { toast } = useToast();

    // Route State
    const propIdFilter = searchParams.get('propertyId');
    const initialTab = searchParams.get('tab') || (propIdFilter ? 'units' : 'properties');
    const [activeTab, setActiveTab] = useState(initialTab);

    // Data State
    const [properties, setProperties] = useState<RentalProperty[]>([]);
    const [units, setUnits] = useState<RentalUnit[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    
    // UI State
    const [searchQuery, setSearchQuery] = useState('');
    const [isPropDialogOpen, setIsPropDialogOpen] = useState(false);
    const [isUnitDialogOpen, setIsUnitDialogOpen] = useState(false);
    const [editingProperty, setEditingProperty] = useState<RentalProperty | null>(null);
    const [editingUnit, setEditingUnit] = useState<RentalUnit | null>(null);

    // Form States
    const [propForm, setPropForm] = useState({ name: '', address: '' });
    const [unitForm, setUnitForm] = useState<Partial<RentalUnit>>({ 
        unitNumber: '', propertyId: propIdFilter || '', type: 'Apartment', floor: 'Ground', monthlyRent: 0, status: 'Vacant' 
    });

    useEffect(() => {
        setIsLoading(true);
        const unsubs = [
            onPropertiesUpdate(setProperties),
            onUnitsUpdate((data) => {
                setUnits(data);
                setIsLoading(false);
            })
        ];
        return () => unsubs.forEach(u => u());
    }, []);

    // Filtered Data
    const propertyStats = useMemo(() => {
        return properties.map(p => {
            const propUnits = units.filter(u => u.propertyId === p.id);
            const occupied = propUnits.filter(u => u.status === 'Occupied').length;
            const vacant = propUnits.filter(u => u.status === 'Vacant').length;
            return {
                ...p,
                unitCount: propUnits.length,
                occupied,
                vacant,
                monthlyIncome: propUnits.filter(u => u.status === 'Occupied').reduce((sum, u) => sum + (u.monthlyRent || 0), 0)
            };
        });
    }, [properties, units]);

    const filteredProperties = propertyStats.filter(p => 
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
        p.address.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const filteredUnits = useMemo(() => {
        return units.filter(u => {
            const matchesSearch = u.unitNumber.toLowerCase().includes(searchQuery.toLowerCase()) || 
                                (u.propertyName || '').toLowerCase().includes(searchQuery.toLowerCase());
            const matchesProperty = !propIdFilter || u.propertyId === propIdFilter;
            return matchesSearch && matchesProperty;
        });
    }, [units, searchQuery, propIdFilter]);

    // Handlers
    const handleSaveProperty = async () => {
        if (!user || !propForm.name) return;
        try {
            if (editingProperty) {
                await updateProperty(editingProperty.id, { ...propForm, lastModifiedBy: user.username });
                toast({ title: 'Property Updated' });
            } else {
                await addProperty({ ...propForm, totalUnits: 0, createdBy: user.username });
                toast({ title: 'Property Created' });
            }
            setIsPropDialogOpen(false);
        } catch {
            toast({ title: 'Error', variant: 'destructive' });
        }
    };

    const handleSaveUnit = async () => {
        if (!user || !unitForm.unitNumber || !unitForm.propertyId) return;
        const property = properties.find(p => p.id === unitForm.propertyId);
        const payload = { ...unitForm, propertyName: property?.name } as any;

        try {
            if (editingUnit) {
                await updateUnit(editingUnit.id, { ...payload, lastModifiedBy: user.username });
                toast({ title: 'Unit Updated' });
            } else {
                await addUnit({ ...payload, outstandingBalance: 0, createdBy: user.username });
                toast({ title: 'Unit Created' });
            }
            setIsUnitDialogOpen(false);
        } catch {
            toast({ title: 'Error', variant: 'destructive' });
        }
    };

    const handleOpenUnitTab = (propertyId: string) => {
        const url = new URL(window.location.href);
        url.searchParams.set('tab', 'units');
        url.searchParams.set('propertyId', propertyId);
        router.push(url.pathname + url.search);
        setActiveTab('units');
    };

    const handleClearFilter = () => {
        const url = new URL(window.location.href);
        url.searchParams.delete('propertyId');
        router.push(url.pathname + url.search);
    };

    return (
        <div className="flex flex-col gap-8">
            <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Asset Registry</h1>
                    <p className="text-muted-foreground">Consolidated management of properties and unit inventory.</p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="relative">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input 
                            placeholder={activeTab === 'properties' ? "Search properties..." : "Search units..."} 
                            className="pl-8 w-[250px] bg-white h-10 border-gray-300 shadow-sm" 
                            value={searchQuery} 
                            onChange={e => setSearchQuery(e.target.value)} 
                        />
                    </div>
                    {hasPermission('rental', 'create') && (
                        activeTab === 'properties' ? (
                            <Button onClick={() => { setEditingProperty(null); setPropForm({name:'', address:''}); setIsPropDialogOpen(true); }} className="h-10">
                                <Plus className="mr-2 h-4 w-4" /> Add Property
                            </Button>
                        ) : (
                            <Button onClick={() => { setEditingUnit(null); setUnitForm({ unitNumber: '', propertyId: propIdFilter || '', type: 'Apartment', floor: 'Ground', monthlyRent: 0, status: 'Vacant' }); setIsUnitDialogOpen(true); }} className="h-10">
                                <Plus className="mr-2 h-4 w-4" /> Add Unit
                            </Button>
                        )
                    )}
                </div>
            </header>

            <Tabs value={activeTab} onValueChange={(v) => {
                setActiveTab(v);
                const url = new URL(window.location.href);
                url.searchParams.set('tab', v);
                if (v === 'properties') url.searchParams.delete('propertyId');
                router.push(url.pathname + url.search);
            }}>
                <TabsList className="bg-muted/50 p-1 mb-2">
                    <TabsTrigger value="properties" className="gap-2 px-8 py-2 font-bold text-xs uppercase tracking-widest">
                        <Building2 className="h-4 w-4"/>
                        Property Assets
                    </TabsTrigger>
                    <TabsTrigger value="units" className="gap-2 px-8 py-2 font-bold text-xs uppercase tracking-widest">
                        <Home className="h-4 w-4"/>
                        Unit Inventory
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="properties" className="space-y-6 pt-4 animate-in fade-in slide-in-from-left-2">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {filteredProperties.map(p => (
                            <Card key={p.id} className="hover:shadow-md transition-all border-gray-100 group">
                                <CardHeader className="pb-2">
                                    <div className="flex justify-between items-start">
                                        <Badge variant="secondary" className="mb-2 uppercase text-[10px] tracking-widest bg-blue-50 text-blue-700 border-blue-100">{p.unitCount} Units</Badge>
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"><MoreHorizontal className="h-4 w-4"/></Button></DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuItem onSelect={() => { setEditingProperty(p); setPropForm({name:p.name, address:p.address}); setIsPropDialogOpen(true); }}>
                                                    <Edit className="mr-2 h-4 w-4" /> Edit Details
                                                </DropdownMenuItem>
                                                <DropdownMenuSeparator />
                                                <DropdownMenuItem className="text-destructive" onSelect={() => deleteProperty(p.id)}>
                                                    <Trash2 className="mr-2 h-4 w-4" /> Delete Property
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>
                                    <CardTitle className="text-xl font-bold text-gray-900">{p.name}</CardTitle>
                                    <CardDescription className="flex items-center gap-1.5"><MapPin className="h-3 w-3 text-primary" /> {p.address}</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4 pt-4">
                                    <div className="grid grid-cols-2 gap-4 text-xs">
                                        <div className="p-3 rounded-xl bg-green-50 border border-green-100">
                                            <p className="text-green-600 font-bold uppercase text-[9px] mb-1">Occupied</p>
                                            <p className="text-xl font-black text-green-700">{p.occupied}</p>
                                        </div>
                                        <div className="p-3 rounded-xl bg-amber-50 border border-amber-100">
                                            <p className="text-amber-600 font-bold uppercase text-[9px] mb-1">Vacant</p>
                                            <p className="text-xl font-black text-amber-700">{p.vacant}</p>
                                        </div>
                                    </div>
                                    <div className="flex justify-between items-center pt-2 border-t border-dashed text-sm font-medium">
                                        <span className="text-muted-foreground">Exp. Monthly Income</span>
                                        <span className="font-bold text-gray-900">Rs. {p.monthlyIncome.toLocaleString()}</span>
                                    </div>
                                    <Button onClick={() => handleOpenUnitTab(p.id)} variant="outline" className="w-full h-10 font-bold text-xs uppercase tracking-widest border-gray-300">
                                        <Home className="mr-2 h-4 w-4" /> Manage Units
                                    </Button>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                </TabsContent>

                <TabsContent value="units" className="space-y-6 pt-4 animate-in fade-in slide-in-from-right-2">
                    {propIdFilter && (
                        <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-100 rounded-xl mb-4">
                            <Filter className="h-4 w-4 text-blue-600" />
                            <div className="flex-1 text-sm font-medium text-blue-800">
                                Viewing units for: <span className="font-black underline">{properties.find(p => p.id === propIdFilter)?.name}</span>
                            </div>
                            <Button variant="ghost" size="sm" onClick={handleClearFilter} className="h-7 text-[10px] uppercase font-black text-blue-700 hover:bg-blue-100">
                                <X className="mr-1 h-3 w-3" /> Clear Filter
                            </Button>
                        </div>
                    )}

                    <Card className="shadow-sm border-gray-100 bg-white">
                        <CardContent className="p-0">
                            <Table>
                                <TableHeader className="bg-muted/50">
                                    <TableRow className="hover:bg-transparent">
                                        <TableHead className="font-bold pl-6">Unit #</TableHead>
                                        {!propIdFilter && <TableHead className="font-bold">Property Asset</TableHead>}
                                        <TableHead className="font-bold">Type / Floor</TableHead>
                                        <TableHead className="font-bold">Monthly Rent</TableHead>
                                        <TableHead className="font-bold text-center">Status</TableHead>
                                        <TableHead className="font-bold">Current Tenant</TableHead>
                                        <TableHead className="text-right pr-6 font-bold">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredUnits.map(u => (
                                        <TableRow key={u.id} className="h-14 hover:bg-muted/30">
                                            <TableCell className="font-black text-gray-900 pl-6">{u.unitNumber}</TableCell>
                                            {!propIdFilter && <TableCell className="text-sm font-medium text-blue-800">{u.propertyName}</TableCell>}
                                            <TableCell className="text-xs text-muted-foreground uppercase font-bold">{u.type} • {u.floor}</TableCell>
                                            <TableCell className="font-mono font-bold text-xs">Rs. {u.monthlyRent.toLocaleString()}</TableCell>
                                            <TableCell className="text-center">
                                                <Badge variant="outline" className={cn(
                                                    "uppercase text-[9px] font-black h-5 shadow-sm px-2",
                                                    u.status === 'Occupied' ? "bg-green-50 text-green-700 border-green-200" :
                                                    u.status === 'Vacant' ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-gray-50 text-gray-600"
                                                )}>
                                                    {u.status}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-xs font-semibold text-gray-700">
                                                {u.tenantName ? (
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                                                        {u.tenantName}
                                                    </div>
                                                ) : (
                                                    <span className="text-muted-foreground italic font-normal">No active lease</span>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-right pr-6">
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4"/></Button></DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end" className="w-48">
                                                        <DropdownMenuItem onSelect={() => { setEditingUnit(u); setUnitForm(u); setIsUnitDialogOpen(true); }}>
                                                            <Edit className="mr-2 h-4 w-4"/> Edit Configuration
                                                        </DropdownMenuItem>
                                                        {u.status === 'Vacant' && (
                                                            <DropdownMenuItem asChild>
                                                                <Link href={`/rental/agreements/new?unitId=${u.id}`}>
                                                                    <UserPlus className="mr-2 h-4 w-4 text-blue-600"/> Assign New Tenant
                                                                </Link>
                                                            </DropdownMenuItem>
                                                        )}
                                                        {u.status === 'Occupied' && (
                                                            <DropdownMenuItem asChild>
                                                                <Link href={`/rental/payments?tenantId=${u.tenantId}`}>
                                                                    <Receipt className="mr-2 h-4 w-4 text-emerald-600"/> Collect Rent
                                                                </Link>
                                                            </DropdownMenuItem>
                                                        )}
                                                        <DropdownMenuSeparator />
                                                        <DropdownMenuItem className="text-destructive" onSelect={() => deleteUnit(u.id)}>
                                                            <Trash2 className="mr-2 h-4 w-4"/> Remove Unit
                                                        </DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {filteredUnits.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={7} className="h-40 text-center text-muted-foreground italic">
                                                No units found. Try expanding your search.
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            {/* Dialogs */}
            <Dialog open={isPropDialogOpen} onOpenChange={setIsPropDialogOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-black text-gray-900">{editingProperty ? 'Modify Property' : 'Add Property Asset'}</DialogTitle>
                        <DialogDescription>Define a new rental asset in your portfolio.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-5 py-4">
                        <div className="space-y-1.5">
                            <Label className="text-[10px] uppercase font-bold text-muted-foreground">Property Name</Label>
                            <Input value={propForm.name} onChange={e => setPropForm({...propForm, name: e.target.value})} placeholder="e.g. Shivam Heights" className="h-10" />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-[10px] uppercase font-bold text-muted-foreground">Location Address</Label>
                            <Input value={propForm.address} onChange={e => setPropForm({...propForm, address: e.target.value})} placeholder="Full location details" className="h-10" />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsPropDialogOpen(false)} className="font-bold text-xs uppercase h-10">Cancel</Button>
                        <Button onClick={handleSaveProperty} className="font-black text-xs uppercase h-10 px-8 shadow-lg shadow-primary/20">Commit Property</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={isUnitDialogOpen} onOpenChange={setIsUnitDialogOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-black text-gray-900">{editingUnit ? 'Modify Unit' : 'New Unit Entry'}</DialogTitle>
                        <DialogDescription>Configure details for an individual rental space.</DialogDescription>
                    </DialogHeader>
                    <div className="grid grid-cols-2 gap-5 py-4">
                        <div className="space-y-1.5 col-span-2">
                            <Label className="text-[10px] uppercase font-bold text-muted-foreground">Associated Property</Label>
                            <Select value={unitForm.propertyId} onValueChange={v => setUnitForm({...unitForm, propertyId: v})}>
                                <SelectTrigger className="h-10"><SelectValue placeholder="Select Property"/></SelectTrigger>
                                <SelectContent>{properties.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-[10px] uppercase font-bold text-muted-foreground">Unit Number / Code</Label>
                            <Input value={unitForm.unitNumber} onChange={e => setUnitForm({...unitForm, unitNumber: e.target.value})} placeholder="e.g. 101" className="h-10 font-bold" />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-[10px] uppercase font-bold text-muted-foreground">Monthly Rent (NPR)</Label>
                            <Input type="number" value={unitForm.monthlyRent} onChange={e => setUnitForm({...unitForm, monthlyRent: Number(e.target.value)})} className="h-10 font-black text-blue-900" />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-[10px] uppercase font-bold text-muted-foreground">Floor Level</Label>
                            <Input value={unitForm.floor} onChange={e => setUnitForm({...unitForm, floor: e.target.value})} placeholder="e.g. Ground" className="h-10" />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-[10px] uppercase font-bold text-muted-foreground">Space Category</Label>
                            <Input value={unitForm.type} onChange={e => setUnitForm({...unitForm, type: e.target.value})} placeholder="e.g. Shop" className="h-10" />
                        </div>
                        <div className="space-y-1.5 col-span-2">
                            <Label className="text-[10px] uppercase font-bold text-muted-foreground">Inventory Status</Label>
                            <Select value={unitForm.status} onValueChange={(v: any) => setUnitForm({...unitForm, status: v})}>
                                <SelectTrigger className="h-10"><SelectValue/></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Vacant">Vacant & Ready</SelectItem>
                                    <SelectItem value="Occupied">Occupied (Manual)</SelectItem>
                                    <SelectItem value="Under Maintenance">Maintenance Lock</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsUnitDialogOpen(false)} className="font-bold text-xs uppercase h-10">Cancel</Button>
                        <Button onClick={handleSaveUnit} className="font-black text-xs uppercase h-10 px-8 shadow-lg shadow-primary/20">Commit Unit</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

export default function AssetsAndUnitsPage() {
    return (
        <Suspense fallback={<div className="p-8 text-center"><Loader2 className="animate-spin h-8 w-8 mx-auto text-muted-foreground"/></div>}>
            <AssetRegistryContent/>
        </Suspense>
    );
}
