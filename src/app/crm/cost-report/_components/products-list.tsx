'use client';

import { useState, useMemo } from 'react';
import type { Product } from '@/lib/types';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Search, MoreHorizontal, Edit, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

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
    
    // Pagination State
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(10);
    
    const filtered = useMemo(() => {
        return products.filter(p => 
            p.name.toLowerCase().includes(search.toLowerCase()) || 
            (p.partyName || '').toLowerCase().includes(search.toLowerCase())
        ).sort((a,b) => a.name.localeCompare(b.name));
    }, [products, search]);

    const paginated = useMemo(() => {
        if (itemsPerPage === -1) return filtered;
        const start = (currentPage - 1) * itemsPerPage;
        return filtered.slice(start, start + itemsPerPage);
    }, [filtered, currentPage, itemsPerPage]);

    const totalPages = useMemo(() => {
        if (itemsPerPage === -1) return 1;
        return Math.ceil(filtered.length / itemsPerPage);
    }, [filtered, itemsPerPage]);

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
                        onChange={e => { setSearch(e.target.value); setCurrentPage(1); }} 
                    />
                </div>
            </CardHeader>
            <CardContent className="p-0">
                <Table>
                    <TableHeader className="bg-muted/50">
                        <TableRow>
                            <TableHead className="pl-6 font-bold uppercase text-[11px]">Product Name</TableHead>
                            <TableHead className="font-bold uppercase text-[11px]">Customer</TableHead>
                            <TableHead className="font-bold uppercase text-[11px]">Dimension (mm)</TableHead>
                            <TableHead className="font-bold uppercase text-[11px]">Ply</TableHead>
                            <TableHead className="font-bold uppercase text-[11px]">Composition (GSM)</TableHead>
                            <TableHead className="text-right pr-6 font-bold uppercase text-[11px]">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {paginated.length > 0 ? paginated.map(p => (
                            <TableRow key={p.id}>
                                <TableCell className="font-bold pl-6">{p.name}</TableCell>
                                <TableCell>{p.partyName}</TableCell>
                                <TableCell>{p.specification?.dimension || 'N/A'}</TableCell>
                                <TableCell>{p.specification?.ply} Ply</TableCell>
                                <TableCell className="text-xs text-muted-foreground">
                                    {getGsmDisplay(p.specification)}
                                </TableCell>
                                <TableCell className="text-right pr-6">
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
            {(totalPages > 1 || itemsPerPage !== -1) && (
                <CardFooter className="flex items-center justify-between py-4 border-t bg-muted/5">
                    <div className="text-xs text-muted-foreground font-medium">
                        {itemsPerPage === -1 ? (
                            <>Showing all <span className="font-bold text-foreground">{filtered.length}</span> products</>
                        ) : (
                            <>
                                Showing <span className="font-bold text-foreground">{(currentPage - 1) * itemsPerPage + 1}</span> to <span className="font-bold text-foreground">{Math.min(currentPage * itemsPerPage, filtered.length)}</span> of <span className="font-bold text-foreground">{filtered.length}</span> products
                            </>
                        )}
                    </div>
                    <div className="flex items-center gap-6">
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground whitespace-nowrap">Rows per page:</span>
                            <Select value={String(itemsPerPage)} onValueChange={(v) => {
                                setItemsPerPage(parseInt(v));
                                setCurrentPage(1);
                            }}>
                                <SelectTrigger className="h-8 w-[70px] bg-white border-gray-200">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="10">10</SelectItem>
                                    <SelectItem value="25">25</SelectItem>
                                    <SelectItem value="50">50</SelectItem>
                                    <SelectItem value="-1">All</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        {itemsPerPage !== -1 && (
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                    disabled={currentPage === 1}
                                    className="h-8 w-8 p-0"
                                >
                                    <ChevronLeft className="h-4 w-4" />
                                </Button>
                                <div className="text-xs font-bold px-2 whitespace-nowrap">Page {currentPage} of {totalPages}</div>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                    disabled={currentPage === totalPages}
                                    className="h-8 w-8 p-0"
                                >
                                    <ChevronRight className="h-4 w-4" />
                                </Button>
                            </div>
                        )}
                    </div>
                </CardFooter>
            )}
        </Card>
    );
}
