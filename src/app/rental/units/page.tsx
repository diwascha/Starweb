'use client';

import { useState, useEffect, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Home, Plus, Search, MoreHorizontal, Edit, Trash2, UserPlus, Receipt, Filter } from 'lucide-react';
import type { RentalUnit, RentalProperty } from '@/lib/types';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { onUnitsUpdate, addUnit, updateUnit, deleteUnit } from '@/services/unit-service';
import { onPropertiesUpdate } from '@/services/property-service';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import Link from 'next/link';

function UnitsContent() {
    const searchParams = useSearchParams();
    const propertyIdFilter = searchParams.get('propertyId');
    
    const { user, hasPermission } = useAuth();
    const { toast } = useToast();
    const [units, setUnits] = useState<RentalUnit[]>([]);
    const [properties, setProperties] = useState<RentalProperty[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingUnit, setEditingUnit] = useState<RentalUnit | null>(null);
    const [form, setForm] = useState<Partial<RentalUnit>>({ 
        unitNumber: '', propertyId: propertyIdFilter || '', type: 'Apartment', floor: 'Ground', monthlyRent: 0, status: 'Vacant' 
    });

    useEffect(() => {
        const unsubs = [
            onUnitsUpdate(setUnits),
            onPropertiesUpdate(setProperties)
        ];
        return () => unsubs.forEach(u => u());
    }, []);

    const filtered = useMemo(() => {
        return units.filter(u => {
            const matchesSearch = u.unitNumber.toLowerCase().includes(searchQuery.toLowerCase()) || 
                                (u.propertyName || '').toLowerCase().includes(searchQuery.toLowerCase());
            const matchesProperty = !propertyIdFilter || u.propertyId === propertyIdFilter;
            return matchesSearch && matchesProperty;
        });
    }, [units, searchQuery, propertyIdFilter]);

    const handleSave = async () => {
        if (!user || !form.unitNumber || !form.propertyId) return;
        const property = properties.find(p => p.id === form.propertyId);
        const payload = { ...form, propertyName: property?.name } as any;

        try {
            if (editingUnit) {
                await updateUnit(editingUnit.id, { ...payload, lastModifiedBy: user.username });
                toast({ title: 'Unit Updated' });
            } else {
                await addUnit({ ...payload, outstandingBalance: 0, createdBy: user.username });
                toast({ title: 'Unit Created' });
            }
            setIsDialogOpen(false);
        } catch {
            toast({ title: 'Error', variant: 'destructive' });
        }
    };

    return (
        <div className="flex flex-col gap-8">
            <header className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Units</h1>
                    <p className="text-muted-foreground">Manage individual rental spaces.</p>
                </div>
                <div className="flex gap-4">
                    <div className="relative">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input placeholder="Search unit #..." className="pl-8 w-[250px]" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
                    </div>
                    {hasPermission('rental', 'create') && (
                        <Button onClick={() => { setEditingUnit(null); setForm({ unitNumber: '', propertyId: propertyIdFilter || '', type: 'Apartment', floor: 'Ground', monthlyRent: 0, status: 'Vacant' }); setIsDialogOpen(true); }}>
                            <Plus className="mr-2 h-4 w-4" /> Add Unit
                        </Button>
                    )}
                </div>
            </header>

            <Card>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Unit #</TableHead>
                            <TableHead>Property</TableHead>
                            <TableHead>Type / Floor</TableHead>
                            <TableHead>Rent</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Current Tenant</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filtered.map(u => (
                            <TableRow key={u.id}>
                                <TableCell className="font-bold">{u.unitNumber}</TableCell>
                                <TableCell>{u.propertyName}</TableCell>
                                <TableCell className="text-xs">{u.type} • {u.floor}</TableCell>
                                <TableCell className="font-mono">Rs. {u.monthlyRent.toLocaleString()}</TableCell>
                                <TableCell>
                                    <Badge variant="outline" className={cn(
                                        u.status === 'Occupied' ? "bg-green-50 text-green-700 border-green-200" :
                                        u.status === 'Vacant' ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-muted"
                                    )}>
                                        {u.status}
                                    </Badge>
                                </TableCell>
                                <TableCell className="text-xs">{u.tenantName || 'None'}</TableCell>
                                <TableCell className="text-right">
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4"/></Button></DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            <DropdownMenuItem onSelect={() => { setEditingUnit(u); setForm(u); setIsDialogOpen(true); }}><Edit className="mr-2 h-4 w-4"/> Edit</DropdownMenuItem>
                                            {u.status === 'Vacant' && (
                                                <DropdownMenuItem asChild>
                                                    <Link href={`/rental/agreements/new?unitId=${u.id}`}>
                                                        <UserPlus className="mr-2 h-4 w-4"/> Assign Tenant
                                                    </Link>
                                                </DropdownMenuItem>
                                            )}
                                            {u.status === 'Occupied' && (
                                                <DropdownMenuItem asChild>
                                                    <Link href={`/rental/payments?tenantId=${u.tenantId}`}>
                                                        <Receipt className="mr-2 h-4 w-4"/> Collect Payment
                                                    </Link>
                                                </DropdownMenuItem>
                                            )}
                                            <DropdownMenuItem className="text-destructive" onSelect={() => deleteUnit(u.id)}><Trash2 className="mr-2 h-4 w-4"/> Delete</DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </Card>

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader><DialogTitle>{editingUnit ? 'Edit Unit' : 'New Unit'}</DialogTitle></DialogHeader>
                    <div className="grid grid-cols-2 gap-4 py-4">
                        <div className="space-y-2 col-span-2">
                            <Label>Property</Label>
                            <Select value={form.propertyId} onValueChange={v => setForm({...form, propertyId: v})}>
                                <SelectTrigger><SelectValue placeholder="Select Property"/></SelectTrigger>
                                <SelectContent>{properties.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2"><Label>Unit Number</Label><Input value={form.unitNumber} onChange={e => setForm({...form, unitNumber: e.target.value})} placeholder="e.g. 101" /></div>
                        <div className="space-y-2"><Label>Monthly Rent</Label><Input type="number" value={form.monthlyRent} onChange={e => setForm({...form, monthlyRent: Number(e.target.value)})} /></div>
                        <div className="space-y-2"><Label>Floor</Label><Input value={form.floor} onChange={e => setForm({...form, floor: e.target.value})} placeholder="e.g. 1st Floor" /></div>
                        <div className="space-y-2"><Label>Space Type</Label><Input value={form.type} onChange={e => setForm({...form, type: e.target.value})} placeholder="e.g. Shop" /></div>
                        <div className="space-y-2 col-span-2"><Label>Status</Label>
                            <Select value={form.status} onValueChange={(v: any) => setForm({...form, status: v})}>
                                <SelectTrigger><SelectValue/></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Vacant">Vacant</SelectItem>
                                    <SelectItem value="Occupied">Occupied (Manual override)</SelectItem>
                                    <SelectItem value="Under Maintenance">Under Maintenance</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <DialogFooter><Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button><Button onClick={handleSave}>Save Unit</Button></DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

export default function UnitsPage() {
    return <Suspense><UnitsContent/></Suspense>;
}
