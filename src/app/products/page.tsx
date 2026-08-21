'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { 
    Package, 
    Plus, 
    Search, 
    MoreHorizontal, 
    Edit, 
    Trash2, 
    Layers, 
    ShieldCheck, 
    Loader2, 
    FilterX,
    ChevronLeft,
    ChevronRight,
    ArrowLeft
} from 'lucide-react';
import type { Product } from '@/lib/types';
import { onProductsUpdate, deleteProduct } from '@/services/product-service';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
    DropdownMenu, 
    DropdownMenuContent, 
    DropdownMenuItem, 
    DropdownMenuTrigger, 
    DropdownMenuSeparator 
} from '@/components/ui/dropdown-menu';
import { 
    AlertDialog, 
    AlertDialogAction, 
    AlertDialogCancel, 
    AlertDialogContent, 
    AlertDialogDescription, 
    AlertDialogFooter, 
    AlertDialogHeader, 
    AlertDialogTitle, 
    AlertDialogTrigger 
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';

export default function ProductsPage() {
    const [products, setProducts] = useState<Product[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    
    // Pagination
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 15;

    const { toast } = useToast();
    const router = useRouter();
    const { hasPermission } = useAuth();

    useEffect(() => {
        setIsLoading(true);
        const unsub = onProductsUpdate((data) => {
            setProducts(data);
            setIsLoading(false);
        });
        return () => unsub();
    }, []);

    const filteredProducts = useMemo(() => {
        return products.filter(p => 
            p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
            (p.materialCode || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
            (p.partyName || '').toLowerCase().includes(searchQuery.toLowerCase())
        ).sort((a, b) => a.name.localeCompare(b.name));
    }, [products, searchQuery]);

    const paginatedProducts = filteredProducts.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
    const totalPages = Math.ceil(filteredProducts.length / itemsPerPage);

    const handleDelete = async (id: string) => {
        try {
            await deleteProduct(id);
            toast({ title: 'Product Deleted', description: 'Item removed from manufacturing catalog.' });
        } catch {
            toast({ title: 'Error', variant: 'destructive' });
        }
    };

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

    return (
        <div className="flex flex-col gap-8">
            <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={() => router.push('/reports')} className="h-10 w-10 border shadow-sm">
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <div>
                        <h1 className="text-3xl font-black text-gray-900 tracking-tighter uppercase">QT Catalog</h1>
                        <p className="text-muted-foreground text-sm font-medium italic">Technical standards for manufactured product variants.</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input 
                            placeholder="Search catalog..." 
                            className="pl-8 w-full md:w-[250px] h-9 bg-white" 
                            value={searchQuery} 
                            onChange={e => setSearchQuery(e.target.value)} 
                        />
                    </div>
                    {hasPermission('reports', 'create') && (
                        <Button size="sm" asChild>
                            <Link href="/crm/pack-spec"><Plus className="mr-2 h-4 w-4" /> Add Product</Link>
                        </Button>
                    )}
                </div>
            </header>

            <Card className="shadow-sm border-gray-100 bg-white overflow-hidden">
                <CardContent className="p-0">
                    <Table className="text-xs">
                        <TableHeader className="bg-muted/50 border-b">
                            <TableRow className="hover:bg-transparent h-11">
                                <TableHead className="pl-6 font-black uppercase text-[10px] tracking-widest text-muted-foreground">Material / Product Name</TableHead>
                                <TableHead className="font-black uppercase text-[10px] tracking-widest text-muted-foreground">Dimensions (mm)</TableHead>
                                <TableHead className="font-black uppercase text-[10px] tracking-widest text-muted-foreground">Construction</TableHead>
                                <TableHead className="font-black uppercase text-[10px] tracking-widest text-muted-foreground">GSM Composition</TableHead>
                                <TableHead className="font-black uppercase text-[10px] tracking-widest text-muted-foreground">Client Entity</TableHead>
                                <TableHead className="text-right pr-6 font-black uppercase text-[10px] tracking-widest text-muted-foreground">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableRow><TableCell colSpan={6} className="py-20 text-center"><Loader2 className="h-8 w-8 animate-spin mx-auto opacity-20" /></TableCell></TableRow>
                            ) : paginatedProducts.map(product => (
                                <TableRow key={product.id} className="h-14 hover:bg-muted/10 transition-colors border-b last:border-0 group">
                                    <TableCell className="pl-6">
                                        <div className="flex flex-col">
                                            <span className="font-black text-gray-900 leading-tight uppercase tracking-tight group-hover:text-primary transition-colors">{product.name}</span>
                                            <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-tighter">Code: {product.materialCode || 'N/A'}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell className="font-mono text-gray-600 font-bold">{product.specification?.dimension || '—'}</TableCell>
                                    <TableCell>
                                        <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-[9px] font-black uppercase h-5 px-2">
                                            {product.specification?.ply} Ply
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-muted-foreground font-mono text-[10px]">{getGsmDisplay(product.specification)}</TableCell>
                                    <TableCell className="text-[10px] font-bold text-gray-700 uppercase">{product.partyName || '—'}</TableCell>
                                    <TableCell className="text-right pr-6">
                                        <div className="flex justify-end gap-1">
                                            <Button variant="ghost" size="icon" asChild className="h-8 w-8">
                                                <Link href="/crm/pack-spec"><Edit className="h-4 w-4"/></Link>
                                            </Button>
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4"/></Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end" className="w-48">
                                                    <DropdownMenuItem asChild>
                                                        <Link href="/crm/pack-spec" className="flex items-center">
                                                            <Edit className="mr-2 h-4 w-4" /> Edit Specs
                                                        </Link>
                                                    </DropdownMenuItem>
                                                    <DropdownMenuSeparator />
                                                    <AlertDialog>
                                                        <AlertDialogTrigger asChild>
                                                            <DropdownMenuItem onSelect={e => e.preventDefault()} className="text-destructive"><Trash2 className="mr-2 h-4 w-4"/> Delete Variant</DropdownMenuItem>
                                                        </AlertDialogTrigger>
                                                        <AlertDialogContent>
                                                            <AlertDialogHeader>
                                                                <AlertDialogTitle className="font-black uppercase tracking-tight">Purge Product?</AlertDialogTitle>
                                                                <AlertDialogDescription>This will permanently remove the product specification from the QT catalog. Existing reports will maintain their frozen data but won't be linked to this catalog item.</AlertDialogDescription>
                                                            </AlertDialogHeader>
                                                            <AlertDialogFooter>
                                                                <AlertDialogCancel className="font-bold text-xs uppercase h-10">Cancel</AlertDialogCancel>
                                                                <AlertDialogAction onClick={() => handleDelete(product.id)} className="bg-destructive text-white font-black text-xs uppercase h-10 shadow-lg">Delete Variant</AlertDialogAction>
                                                            </AlertDialogFooter>
                                                        </AlertDialogContent>
                                                    </AlertDialog>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                            {!isLoading && filteredProducts.length === 0 && (
                                <TableRow><TableCell colSpan={6} className="h-60 text-center text-muted-foreground italic uppercase font-black text-[10px] tracking-widest opacity-20">Catalog is empty.</TableCell></TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
                {totalPages > 1 && (
                    <CardFooter className="py-3 border-t bg-muted/5 flex justify-between items-center px-6">
                        <span className="text-[10px] font-bold text-muted-foreground uppercase">Page {currentPage} of {totalPages}</span>
                        <div className="flex gap-2">
                            <Button variant="outline" size="sm" className="h-7 w-7 p-0" disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)}><ChevronLeft className="h-4 w-4"/></Button>
                            <Button variant="outline" size="sm" className="h-7 w-7 p-0" disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)}><ChevronRight className="h-4 w-4"/></Button>
                        </div>
                    </CardFooter>
                )}
            </Card>
        </div>
    );
}
