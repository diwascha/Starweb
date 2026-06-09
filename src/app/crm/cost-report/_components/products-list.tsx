'use client';

import { useState, useMemo } from 'react';
import type { Product } from '@/lib/types';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Search, MoreHorizontal, Edit, Trash2 } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';

interface ProductsListProps {
    products: Product[];
    onEdit: (p: Product) => void;
    onDelete: (id: string) => void;
}

const getGsmDisplay = (spec: any) => {
    if (!spec) return 'N/A';
    const p = parseInt(spec.ply || '3', 10);
    let layers: (string | undefined)[] = [];
    if (p === 3) layers = [spec.topGsm, spec.flute1Gsm, spec.bottomGsm];
    else if (p === 5) layers = [spec.topGsm, spec.flute1Gsm, spec.middleGsm, spec.flute2Gsm, spec.bottomGsm];
    else if (p === 7) layers = [spec.topGsm, spec.flute1Gsm, spec.middleGsm, spec.flute2Gsm, spec.liner2Gsm, spec.flute3Gsm, spec.bottomGsm];
    else if (p === 9) layers = [spec.topGsm, spec.flute1Gsm, spec.middleGsm, spec.flute2Gsm, spec.liner2Gsm, spec.flute3Gsm, spec.liner3Gsm, spec.flute4Gsm, spec.bottomGsm];
    return layers.filter(l => l !== undefined && l !== null && String(l).trim() !== '').join('/');
};

export function ProductsList({ products, onEdit, onDelete }: ProductsListProps) {
    const [search, setSearch] = useState('');
    
    const filtered = useMemo(() => {
        return products.filter(p => 
            p.name.toLowerCase().includes(search.toLowerCase()) || 
            (p.partyName || '').toLowerCase().includes(search.toLowerCase())
        ).sort((a,b) => a.name.localeCompare(b.name));
    }, [products, search]);

    return (
        <Card>
            <CardHeader className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <div>
                    <CardTitle>Product Specification Catalog</CardTitle>
                    <CardDescription>Manage saved board compositions and dimensions.</CardDescription>
                </div>
                <div className="relative w-full sm:w-72">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input 
                        placeholder="Search products or customers..." 
                        className="pl-8" 
                        value={search ?? ''} 
                        onChange={e => setSearch(e.target.value)} 
                    />
                </div>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Product Name</TableHead>
                            <TableHead>Customer</TableHead>
                            <TableHead>Dimension (mm)</TableHead>
                            <TableHead>Ply</TableHead>
                            <TableHead>Composition (GSM)</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filtered.length > 0 ? filtered.map(p => (
                            <TableRow key={p.id}>
                                <TableCell className="font-bold">{p.name}</TableCell>
                                <TableCell>{p.partyName}</TableCell>
                                <TableCell>{p.specification?.dimension || 'N/A'}</TableCell>
                                <TableCell>{p.specification?.ply} Ply</TableCell>
                                <TableCell className="text-xs text-muted-foreground">
                                    {getGsmDisplay(p.specification)}
                                </TableCell>
                                <TableCell className="text-right">
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4"/></Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            <DropdownMenuItem onSelect={() => onEdit(p)}><Edit className="mr-2 h-4 w-4"/> Edit Specs</DropdownMenuItem>
                                            <DropdownMenuSeparator />
                                            <AlertDialog>
                                                <AlertDialogTrigger asChild>
                                                    <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-destructive"><Trash2 className="mr-2 h-4 w-4"/> Delete Product</DropdownMenuItem>
                                                </AlertDialogTrigger>
                                                <AlertDialogContent>
                                                    <AlertDialogHeader>
                                                        <AlertDialogTitle>Delete this product?</AlertDialogTitle>
                                                        <AlertDialogDescription>This will permanently remove the product and its specification from the catalog.</AlertDialogDescription>
                                                    </AlertDialogHeader>
                                                    <AlertDialogFooter>
                                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                        <AlertDialogAction onClick={() => onDelete(p.id)}>Confirm Delete</AlertDialogAction>
                                                    </AlertDialogFooter>
                                                </AlertDialogContent>
                                            </AlertDialog>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </TableCell>
                            </TableRow>
                        )) : (
                            <TableRow>
                                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No products found.</TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    );
}
