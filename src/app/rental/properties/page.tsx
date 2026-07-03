'use client';

import { useState, useEffect, useMemo } from 'react';
import { Building2, Plus, Search, MoreHorizontal, Edit, Trash2, Home, MapPin, Eye } from 'lucide-react';
import type { RentalProperty, RentalUnit } from '@/lib/types';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { onPropertiesUpdate, addProperty, updateProperty, deleteProperty } from '@/services/property-service';
import { onUnitsUpdate } from '@/services/unit-service';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';

export default function PropertiesPage() {
    const { user, hasPermission } = useAuth();
    const { toast } = useToast();
    const [properties, setProperties] = useState<RentalProperty[]>([]);
    const [units, setUnits] = useState<RentalUnit[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingProperty, setEditingProperty] = useState<RentalProperty | null>(null);
    const [form, setForm] = useState({ name: '', address: '' });

    useEffect(() => {
        const unsubs = [
            onPropertiesUpdate(setProperties),
            onUnitsUpdate(setUnits)
        ];
        return () => unsubs.forEach(u => u());
    }, []);

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

    const filtered = propertyStats.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()) || p.address.toLowerCase().includes(searchQuery.toLowerCase()));

    const handleSave = async () => {
        if (!user || !form.name) return;
        try {
            if (editingProperty) {
                await updateProperty(editingProperty.id, { ...form, lastModifiedBy: user.username });
                toast({ title: 'Property Updated' });
            } else {
                await addProperty({ ...form, totalUnits: 0, createdBy: user.username });
                toast({ title: 'Property Created' });
            }
            setIsDialogOpen(false);
            setForm({ name: '', address: '' });
        } catch {
            toast({ title: 'Error', variant: 'destructive' });
        }
    };

    return (
        <div className="flex flex-col gap-8">
            <header className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Properties</h1>
                    <p className="text-muted-foreground">Manage your real estate portfolio assets.</p>
                </div>
                <div className="flex gap-4">
                    <div className="relative">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input placeholder="Search..." className="pl-8 w-[250px]" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
                    </div>
                    {hasPermission('rental', 'create') && (
                        <Button onClick={() => { setEditingProperty(null); setForm({name:'', address:''}); setIsDialogOpen(true); }}>
                            <Plus className="mr-2 h-4 w-4" /> Add Property
                        </Button>
                    )}
                </div>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filtered.map(p => (
                    <Card key={p.id} className="hover:shadow-md transition-shadow">
                        <CardHeader className="pb-2">
                            <div className="flex justify-between items-start">
                                <Badge variant="secondary" className="mb-2 uppercase text-[10px] tracking-widest">{p.unitCount} Units</Badge>
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4"/></Button></DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                        <DropdownMenuItem onSelect={() => { setEditingProperty(p); setForm({name:p.name, address:p.address}); setIsDialogOpen(true); }}>
                                            <Edit className="mr-2 h-4 w-4" /> Edit Details
                                        </DropdownMenuItem>
                                        <DropdownMenuItem className="text-destructive" onSelect={() => deleteProperty(p.id)}>
                                            <Trash2 className="mr-2 h-4 w-4" /> Delete
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>
                            <CardTitle>{p.name}</CardTitle>
                            <CardDescription className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {p.address}</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4 pt-4">
                            <div className="grid grid-cols-2 gap-4 text-xs">
                                <div className="p-3 rounded-lg bg-green-50 border border-green-100">
                                    <p className="text-green-600 font-bold uppercase text-[9px] mb-1">Occupied</p>
                                    <p className="text-lg font-black text-green-700">{p.occupied}</p>
                                </div>
                                <div className="p-3 rounded-lg bg-amber-50 border border-amber-100">
                                    <p className="text-amber-600 font-bold uppercase text-[9px] mb-1">Vacant</p>
                                    <p className="text-lg font-black text-amber-700">{p.vacant}</p>
                                </div>
                            </div>
                            <div className="flex justify-between items-center pt-2 border-t text-sm font-medium">
                                <span className="text-muted-foreground">Income /Mo</span>
                                <span>Rs. {p.monthlyIncome.toLocaleString()}</span>
                            </div>
                            <Button asChild variant="outline" className="w-full">
                                <Link href={`/rental/units?propertyId=${p.id}`}>
                                    <Home className="mr-2 h-4 w-4" /> Manage Units
                                </Link>
                            </Button>
                        </CardContent>
                    </Card>
                ))}
            </div>

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{editingProperty ? 'Edit Property' : 'Add New Property'}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label>Property Name</Label>
                            <Input value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="e.g. Shivam Heights" />
                        </div>
                        <div className="space-y-2">
                            <Label>Address</Label>
                            <Input value={form.address} onChange={e => setForm({...form, address: e.target.value})} placeholder="Full location details" />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                        <Button onClick={handleSave}>Save Property</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
