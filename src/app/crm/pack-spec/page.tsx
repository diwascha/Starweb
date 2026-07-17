'use client';

import { useState, useEffect, useMemo } from 'react';
import { 
  Package, 
  Search, 
  FileText, 
  Printer, 
  Layers, 
  Box, 
  PrinterIcon, 
  ArrowRight,
  Info,
  ChevronRight,
  ChevronLeft,
  Loader2,
  Plus,
  Edit,
  Trash2,
  MoreHorizontal,
  Eye
} from 'lucide-react';
import type { Product, ProductSpecification } from '@/lib/types';
import { onProductsUpdate, addProduct as addProductService, updateProduct, deleteProduct } from '@/services/product-service';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { ProductForm } from '../cost-report/_components/product-form';

const formatLabel = (key: string) => {
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
};

const gsmFields: (keyof ProductSpecification)[] = [
  'topGsm', 'flute1Gsm', 'middleGsm', 'flute2Gsm', 'liner2Gsm', 'flute3Gsm', 'liner3Gsm', 'flute4Gsm', 'liner4Gsm', 'bottomGsm'
];

export default function PackSpecPage() {
  const { user, hasPermission } = useAuth();
  const { toast } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  
  // Management State
  const [productToEdit, setProductToEdit] = useState<Product | null>(null);
  const [isProductEditorOpen, setIsProductEditorOpen] = useState(false);

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(12);

  useEffect(() => {
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

  const paginatedProducts = useMemo(() => {
    if (itemsPerPage === -1) return filteredProducts;
    const start = (currentPage - 1) * itemsPerPage;
    return filteredProducts.slice(start, start + itemsPerPage);
  }, [filteredProducts, currentPage, itemsPerPage]);

  const totalPages = useMemo(() => {
    if (itemsPerPage === -1) return 1;
    return Math.ceil(filteredProducts.length / itemsPerPage);
  }, [filteredProducts, itemsPerPage]);

  const handleViewSpec = (product: Product) => {
    setSelectedProduct(product);
    setIsPreviewOpen(true);
  };

  const handleProductEdit = (product: Product) => {
    setProductToEdit(product);
    setIsProductEditorOpen(true);
  };

  const handleDeleteProduct = async (id: string) => {
    try {
        await deleteProduct(id);
        toast({ title: 'Product Removed' });
    } catch {
        toast({ title: 'Error', variant: 'destructive' });
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">PackSpec Catalog</h1>
          <p className="text-muted-foreground">Technical Specification Data Sheets for client products.</p>
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="relative flex-1 md:w-80">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search catalog..." 
              className="pl-8 h-10 bg-white" 
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
            />
          </div>
          {hasPermission('crm', 'add') && (
            <Button onClick={() => { setProductToEdit(null); setIsProductEditorOpen(true); }} className="h-10">
              <Plus className="mr-2 h-4 w-4" /> Add Product
            </Button>
          )}
        </div>
      </header>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <Card key={i} className="h-48 animate-pulse bg-muted" />)}
        </div>
      ) : (
        <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {paginatedProducts.map(product => (
                <Card key={product.id} className="hover:shadow-md transition-shadow group h-full flex flex-col">
                <CardHeader className="pb-3 shrink-0">
                    <div className="flex justify-between items-start">
                        <Badge variant="outline" className="mb-2">{product.materialCode || 'No Code'}</Badge>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"><MoreHorizontal className="h-4 w-4" /></Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem onSelect={() => handleViewSpec(product)}><Eye className="mr-2 h-4 w-4"/> View Spec</DropdownMenuItem>
                                <DropdownMenuItem onSelect={() => handleProductEdit(product)}><Edit className="mr-2 h-4 w-4"/> Edit Specs</DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                        <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-destructive"><Trash2 className="mr-2 h-4 w-4"/> Delete</DropdownMenuItem>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                        <AlertDialogHeader>
                                            <AlertDialogTitle>Delete this product?</AlertDialogTitle>
                                            <AlertDialogDescription>This will permanently remove the product and its specification from the catalog.</AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                                            <AlertDialogAction onClick={() => handleDeleteProduct(product.id)}>Confirm Delete</AlertDialogAction>
                                        </AlertDialogFooter>
                                    </AlertDialogContent>
                                </AlertDialog>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                    <CardTitle className="text-lg line-clamp-1">{product.name}</CardTitle>
                    <CardDescription className="line-clamp-1">{product.partyName || 'Unassigned Client'}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 pt-0 flex-1">
                    <div className="grid grid-cols-2 text-xs gap-2 border-t pt-3">
                        <div className="flex flex-col">
                            <span className="text-muted-foreground uppercase font-semibold text-[9px] tracking-widest">Dimension</span>
                            <span className="font-bold">{product.specification?.dimension || 'N/A'}</span>
                        </div>
                        <div className="flex flex-col">
                            <span className="text-muted-foreground uppercase font-semibold text-[9px] tracking-widest">Ply</span>
                            <span className="font-bold">{product.specification?.ply || 'N/A'} Ply</span>
                        </div>
                    </div>
                    <Button variant="secondary" size="sm" className="w-full group-hover:bg-primary group-hover:text-primary-foreground transition-colors mt-auto" onClick={() => handleViewSpec(product)}>
                    Technical Sheet <ChevronRight className="ml-2 h-4 w-4" />
                    </Button>
                </CardContent>
                </Card>
            ))}
            </div>
            
            {(totalPages > 1 || itemsPerPage !== -1) && (
                <div className="flex items-center justify-between py-4 border-t mt-4 bg-muted/5 rounded-lg px-6">
                    <div className="text-xs text-muted-foreground font-medium">
                        {itemsPerPage === -1 ? (
                            <>Showing all <span className="font-bold text-foreground">{filteredProducts.length}</span> products</>
                        ) : (
                            <>
                                Showing <span className="font-bold text-foreground">{(currentPage - 1) * itemsPerPage + 1}</span> to <span className="font-bold text-foreground">{Math.min(currentPage * itemsPerPage, filteredProducts.length)}</span> of <span className="font-bold text-foreground">{filteredProducts.length}</span> products
                            </>
                        )}
                    </div>
                    <div className="flex items-center gap-6">
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground whitespace-nowrap">Cards per page:</span>
                            <Select value={String(itemsPerPage)} onValueChange={(v) => {
                                setItemsPerPage(parseInt(v));
                                setCurrentPage(1);
                            }}>
                                <SelectTrigger className="h-8 w-[75px] bg-white border-gray-200">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="12">12</SelectItem>
                                    <SelectItem value="24">24</SelectItem>
                                    <SelectItem value="48">48</SelectItem>
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
                </div>
            )}
        </>
      )}

      {/* Product Editor Dialog */}
      <Dialog open={isProductEditorOpen} onOpenChange={setIsProductEditorOpen}>
        <DialogContent className="sm:max-w-5xl max-h-[95vh] flex flex-col p-0">
            <DialogHeader className="p-6 pb-0">
                <DialogTitle>{productToEdit ? 'Edit Product Catalog Entry' : 'New Catalog Entry'}</DialogTitle>
                <DialogDescription>Define board composition layers and technical specs for the CRM catalog.</DialogDescription>
            </DialogHeader>
            <div className="flex-1 overflow-y-auto px-6 pb-6">
                <ProductForm 
                    productToEdit={productToEdit} 
                    onSaveSuccess={(data: any) => {
                        if (productToEdit) {
                            updateProduct(productToEdit.id, { ...data, lastModifiedBy: user?.username }).then(() => {
                                setIsProductEditorOpen(false);
                                toast({ title: 'Product Updated' });
                            });
                        } else {
                            addProductService({ ...data, createdBy: user?.username, createdAt: new Date().toISOString() }).then(() => {
                                setIsProductEditorOpen(false);
                                toast({ title: 'Product Added to Catalog' });
                            });
                        }
                    }} 
                />
            </div>
        </DialogContent>
      </Dialog>

      {/* TDS Preview Dialog */}
      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-auto p-0">
          {selectedProduct && (
            <div className="printable-area p-8 bg-white text-black font-sans">
              <header className="text-center space-y-1 mb-8 relative">
                <h1 className="text-2xl font-bold">SHIVAM PACKAGING INDUSTRIES PVT LTD.</h1>
                <p className="text-sm">HETAUDA 08, NEPAL</p>
                <h2 className="text-xl font-bold underline mt-2 uppercase">TECHNICAL DATA SHEET (PACKSPEC)</h2>
                <div className="absolute top-0 right-0 print:hidden flex gap-2">
                  <Button variant="outline" size="sm" onClick={handlePrint}>
                    <Printer className="mr-2 h-4 w-4" /> Print
                  </Button>
                </div>
              </header>

              <div className="grid grid-cols-2 gap-8 mb-8">
                <section className="space-y-2">
                  <h3 className="text-sm font-bold uppercase border-b pb-1">Client Information</h3>
                  <div className="text-sm">
                    <p><span className="text-muted-foreground">Client Name:</span> <span className="font-bold">{selectedProduct.partyName}</span></p>
                    <p><span className="text-muted-foreground">Material Code:</span> <span className="font-bold">{selectedProduct.materialCode}</span></p>
                    <p><span className="text-muted-foreground">Address:</span> {selectedProduct.partyAddress || 'N/A'}</p>
                  </div>
                </section>
                <section className="space-y-2">
                  <h3 className="text-sm font-bold uppercase border-b pb-1">Primary Specs</h3>
                  <div className="text-sm">
                    <p><span className="text-muted-foreground">Product:</span> <span className="font-bold">{selectedProduct.name}</span></p>
                    <p><span className="text-muted-foreground">Box Type:</span> {selectedProduct.specification?.boxType || 'RSC'}</p>
                    <p><span className="text-muted-foreground">Ply Count:</span> {selectedProduct.specification?.ply} Ply</p>
                  </div>
                </section>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <section className="space-y-4">
                  <h3 className="text-sm font-bold uppercase flex items-center gap-2">
                    <Layers className="h-4 w-4" /> 
                    Board Composition (GSM)
                  </h3>
                  <div className="border rounded-md">
                    <Table>
                      <TableBody>
                        {gsmFields.map(field => {
                          const val = selectedProduct.specification?.[field];
                          if (!val) return null;
                          return (
                            <TableRow key={field} className="h-8">
                              <TableCell className="text-xs font-medium py-1">{formatLabel(field)}</TableCell>
                              <TableCell className="text-xs py-1 text-right">{val} GSM</TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </section>

                <section className="space-y-4">
                  <h3 className="text-sm font-bold uppercase flex items-center gap-2">
                    <Box className="h-4 w-4" /> 
                    Physical & Test Specs
                  </h3>
                  <div className="border rounded-md">
                    <Table>
                      <TableBody>
                        <TableRow className="h-8">
                          <TableCell className="text-xs font-medium py-1">Dimension (LxBxH)</TableCell>
                          <TableCell className="text-xs py-1 text-right">{selectedProduct.specification?.dimension} mm</TableCell>
                        </TableRow>
                        <TableRow className="h-8">
                          <TableCell className="text-xs font-medium py-1">Weight of Box</TableCell>
                          <TableCell className="text-xs py-1 text-right">{selectedProduct.specification?.weightOfBox} Grams</TableCell>
                        </TableRow>
                        <TableRow className="h-8">
                          <TableCell className="text-xs font-medium py-1">Bursting Factor (BF)</TableCell>
                          <TableCell className="text-xs py-1 text-right">{selectedProduct.specification?.paperBf}</TableCell>
                        </TableRow>
                        <TableRow className="h-8">
                          <TableCell className="text-xs font-medium py-1">Load Bearing</TableCell>
                          <TableCell className="text-xs py-1 text-right">{selectedProduct.specification?.load} KGF</TableCell>
                        </TableRow>
                        <TableRow className="h-8">
                          <TableCell className="text-xs font-medium py-1">Max Moisture</TableCell>
                          <TableCell className="text-xs py-1 text-right">{selectedProduct.specification?.moisture}%</TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                  
                  <div className="mt-4 p-3 bg-muted/20 border rounded-md">
                    <h4 className="text-[10px] font-bold uppercase text-muted-foreground mb-1">Printing & Finishing</h4>
                    <p className="text-xs">{selectedProduct.specification?.printing || 'Plain / No specific instructions'}</p>
                  </div>
                </section>
              </div>

              <div className="mt-12 pt-8 border-t border-dashed">
                <p className="text-[10px] text-center text-muted-foreground uppercase tracking-widest italic">
                  End of Technical Data Sheet • Generated via StarSutra CRM
                </p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <style jsx global>{`
        @media print {
          @page { size: A4; margin: 0.5in; }
          body * { visibility: hidden; }
          .printable-area, .printable-area * { visibility: visible; }
          .printable-area { position: absolute; left: 0; top: 0; width: 100%; border: none; }
        }
      `}</style>
    </div>
  );
}
