'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
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
  Eye,
  Check,
  X,
  Download,
  Upload,
  FileSpreadsheet,
  ChevronDown,
  FileDown
} from 'lucide-react';
import type { Product, ProductSpecification } from '@/lib/types';
import { onProductsUpdate, addProduct as addProductService, updateProduct, deleteProduct } from '@/services/product-service';
import { getCostReports } from '@/services/cost-report-service';
import { onPartiesUpdate } from '@/services/party-service';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { ProductForm } from '../cost-report/_components/product-form';
import { SortableHead } from '@/components/ui/sortable-head';
import { MultiSelectFilter } from '@/components/ui/multi-select-filter';

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
  const [parties, setParties] = useState<{ id: string; name: string }[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  
  // Management State
  const [productToEdit, setProductToEdit] = useState<Product | null>(null);
  const [isProductEditorOpen, setIsProductEditorOpen] = useState(false);

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Sort/Filter state - same SortableHead/MultiSelectFilter pattern used by
  // the other Excel-style tables in the app (Payroll, Attendance, Benchmark).
  type SortKey = 'materialCode' | 'name' | 'partyName' | 'ply';
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' } | null>(null);
  const [clientFilter, setClientFilter] = useState<string[]>([]);
  const [plyFilter, setPlyFilter] = useState<string[]>([]);
  const handleSort = (key: SortKey) => {
    setSortConfig(prev => prev?.key === key ? { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' } : { key, direction: 'asc' });
  };

  const importFileInputRef = useRef<HTMLInputElement>(null);
  const [isImportingProducts, setIsImportingProducts] = useState(false);
  const printableRef = useRef<HTMLDivElement>(null);
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  // Delete-guard state: how many saved quotations reference the product
  // currently up for deletion. Deleting a product that's used in a past
  // quotation doesn't break that quotation's numbers (they're stored
  // inline), but its printed/reprinted preview falls back to "Custom Item"
  // since the name is looked up live - worth warning about before deleting.
  const [deleteCheckProductId, setDeleteCheckProductId] = useState<string | null>(null);
  const [quotationRefCount, setQuotationRefCount] = useState<number | null>(null);

  const checkProductUsage = async (productId: string) => {
    setDeleteCheckProductId(productId);
    setQuotationRefCount(null);
    try {
      const reports = await getCostReports();
      const count = reports.filter(r => r.items.some(i => i.productId === productId)).length;
      setQuotationRefCount(count);
    } catch {
      setQuotationRefCount(null);
    }
  };

  useEffect(() => {
    const unsub = onProductsUpdate((data) => {
      setProducts(data);
      setIsLoading(false);
    });
    const unsubParties = onPartiesUpdate((data) => setParties(data.map(p => ({ id: p.id, name: p.name }))));
    return () => { unsub(); unsubParties(); };
  }, []);

  const clientOptions = useMemo(() => {
    const names = Array.from(new Set(products.map(p => p.partyName || 'Unassigned Client'))).sort();
    return names.map(n => ({ value: n, label: n }));
  }, [products]);

  const plyOptions = useMemo(() => {
    const plies = Array.from(new Set(products.map(p => p.specification?.ply).filter(Boolean))) as string[];
    return plies.sort((a, b) => parseInt(a, 10) - parseInt(b, 10)).map(p => ({ value: p, label: `${p} Ply` }));
  }, [products]);

  const filteredProducts = useMemo(() => {
    let result = products.filter(p =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.materialCode || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.partyName || '').toLowerCase().includes(searchQuery.toLowerCase())
    );
    if (clientFilter.length > 0) {
      result = result.filter(p => clientFilter.includes(p.partyName || 'Unassigned Client'));
    }
    if (plyFilter.length > 0) {
      result = result.filter(p => p.specification?.ply && plyFilter.includes(p.specification.ply));
    }
    if (sortConfig) {
      const { key, direction } = sortConfig;
      result = [...result].sort((a, b) => {
        const av = key === 'ply' ? (a.specification?.ply || '') : (a[key] || '');
        const bv = key === 'ply' ? (b.specification?.ply || '') : (b[key] || '');
        if (av < bv) return direction === 'asc' ? -1 : 1;
        if (av > bv) return direction === 'asc' ? 1 : -1;
        return 0;
      });
    } else {
      result = [...result].sort((a, b) => a.name.localeCompare(b.name));
    }
    return result;
  }, [products, searchQuery, clientFilter, plyFilter, sortConfig]);

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

  const handleDownloadPdf = async () => {
    if (!printableRef.current || !selectedProduct) return;
    setIsExportingPdf(true);
    try {
      const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([import('jspdf'), import('html2canvas')]);
      const canvas = await html2canvas(printableRef.current, { scale: 2, useCORS: true });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = (canvas.height * pageWidth) / canvas.width;
      pdf.addImage(imgData, 'PNG', 0, 0, pageWidth, pageHeight);
      pdf.save(`PackSpec-${selectedProduct.materialCode || selectedProduct.name}.pdf`);
    } catch {
      toast({ title: 'PDF Export Failed', variant: 'destructive' });
    } finally {
      setIsExportingPdf(false);
    }
  };

  // Every ProductSpecification field, flattened into one row per product -
  // a full round-trip of the catalog through Excel for bulk editing/backup.
  const handleExportExcel = async () => {
    try {
      const XLSX = await import('xlsx');
      const data = filteredProducts.map(p => {
        const s = p.specification || {};
        return {
          'Material Code': p.materialCode || '',
          'Product Name': p.name,
          'Client': p.partyName || '',
          'Dimension (LxBxH mm)': s.dimension || '',
          'Ply': s.ply || '',
          'Box Type': s.boxType || '',
          'Paper Type': s.paperType || '',
          'Paper BF': s.paperBf || '',
          'Wastage %': s.wastagePercent || '',
          'Top GSM': s.topGsm || '',
          'Flute1 GSM': s.flute1Gsm || '',
          'Middle GSM': s.middleGsm || '',
          'Flute2 GSM': s.flute2Gsm || '',
          'Liner2 GSM': s.liner2Gsm || '',
          'Flute3 GSM': s.flute3Gsm || '',
          'Liner3 GSM': s.liner3Gsm || '',
          'Flute4 GSM': s.flute4Gsm || '',
          'Bottom GSM': s.bottomGsm || '',
          'Weight of Box (g)': s.weightOfBox || '',
          'Load (KGF)': s.load || '',
          'Max Moisture %': s.moisture || '',
          'Finishing/Printing': s.printing || '',
          'Rate': p.rate ?? ''
        };
      });
      const worksheet = XLSX.utils.json_to_sheet(data);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Product Catalog");
      XLSX.writeFile(workbook, `PackSpec_Catalog_${new Date().toISOString().split('T')[0]}.xlsx`);
      toast({ title: 'Export Successful' });
    } catch {
      toast({ title: 'Export Failed', variant: 'destructive' });
    }
  };

  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setIsImportingProducts(true);
    try {
      const XLSX = await import('xlsx');
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const data = new Uint8Array(event.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const sheet = workbook.Sheets[workbook.SheetNames[0]];
          const json = XLSX.utils.sheet_to_json<any>(sheet);

          let created = 0, updated = 0, skippedNoClient = 0;

          for (const row of json) {
            const name = String(row['Product Name'] || row['Name'] || '').trim();
            const materialCode = String(row['Material Code'] || row['Code'] || '').trim();
            const clientName = String(row['Client'] || row['Company'] || '').trim();
            if (!name) continue;

            const party = parties.find(p => p.name.toLowerCase().trim() === clientName.toLowerCase().trim());
            if (!party) { skippedNoClient++; continue; }

            const specification: Partial<ProductSpecification> = {
              dimension: String(row['Dimension (LxBxH mm)'] || row['Dimension'] || ''),
              ply: String(row['Ply'] || '3'),
              boxType: String(row['Box Type'] || 'RSC'),
              paperType: String(row['Paper Type'] || 'KRAFT'),
              paperBf: String(row['Paper BF'] || '18 BF'),
              wastagePercent: String(row['Wastage %'] || '3.5'),
              topGsm: String(row['Top GSM'] || ''),
              flute1Gsm: String(row['Flute1 GSM'] || ''),
              middleGsm: String(row['Middle GSM'] || ''),
              flute2Gsm: String(row['Flute2 GSM'] || ''),
              liner2Gsm: String(row['Liner2 GSM'] || ''),
              flute3Gsm: String(row['Flute3 GSM'] || ''),
              liner3Gsm: String(row['Liner3 GSM'] || ''),
              flute4Gsm: String(row['Flute4 GSM'] || ''),
              bottomGsm: String(row['Bottom GSM'] || ''),
              weightOfBox: String(row['Weight of Box (g)'] || ''),
              load: String(row['Load (KGF)'] || ''),
              moisture: String(row['Max Moisture %'] || ''),
              printing: String(row['Finishing/Printing'] || ''),
            };
            const rate = row['Rate'] !== undefined && row['Rate'] !== '' ? Number(row['Rate']) : undefined;

            // Match an existing catalog entry by material code (if given) or
            // by name+client, so re-importing an edited export updates in
            // place instead of creating duplicates.
            const existing = products.find(p =>
              (materialCode && p.materialCode === materialCode) ||
              (!materialCode && p.name.toLowerCase().trim() === name.toLowerCase().trim() && p.partyId === party.id)
            );

            if (existing) {
              await updateProduct(existing.id, { name, materialCode: materialCode || existing.materialCode, partyId: party.id, partyName: party.name, specification, rate, lastModifiedBy: user.username });
              updated++;
            } else {
              await addProductService({ name, materialCode, partyId: party.id, partyName: party.name, specification, rate, createdBy: user.username, createdAt: new Date().toISOString(), ownership: 'Both' } as any);
              created++;
            }
          }

          toast({
            title: 'Import Complete',
            description: `${created} product(s) added, ${updated} updated. ${skippedNoClient} row(s) skipped - client not found in registry.`
          });
        } catch {
          toast({ title: 'Import Failed', description: 'Failed to parse Excel data.', variant: 'destructive' });
        } finally {
          setIsImportingProducts(false);
        }
      };
      reader.readAsArrayBuffer(file);
    } catch {
      setIsImportingProducts(false);
      toast({ title: 'Error', description: 'Failed to process file.', variant: 'destructive' });
    }
    if (importFileInputRef.current) importFileInputRef.current.value = '';
  };

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-gray-900 uppercase">PackSpec Catalog</h1>
          <p className="text-muted-foreground text-sm font-medium italic">Technical Specification Data Sheets for client products.</p>
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="relative flex-1 md:w-80">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search code, product, or client..." 
              className="pl-8 h-10 bg-white border-gray-300" 
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
            />
          </div>
          {(clientFilter.length > 0 || plyFilter.length > 0 || sortConfig) && (
            <Button variant="ghost" size="sm" onClick={() => { setClientFilter([]); setPlyFilter([]); setSortConfig(null); }} className="h-10 text-muted-foreground font-black text-[9px] uppercase">
              Clear Filters
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="h-10 font-bold text-xs uppercase tracking-widest gap-2">
                <FileSpreadsheet className="h-4 w-4" /> Catalog <ChevronDown className="h-3 w-3 opacity-50" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={handleExportExcel}>
                <Download className="mr-2 h-4 w-4" /> Export to Excel
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => importFileInputRef.current?.click()}>
                <Upload className="mr-2 h-4 w-4" /> Import from Excel
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <input
            type="file"
            ref={importFileInputRef}
            onChange={handleImportExcel}
            accept=".xlsx,.xls"
            className="hidden"
          />
          {hasPermission('crm', 'add') && (
            <Button onClick={() => { setProductToEdit(null); setIsProductEditorOpen(true); }} className="h-10 font-black text-xs uppercase tracking-widest shadow-lg shadow-primary/20 px-6">
              <Plus className="mr-2 h-4 w-4" /> Add Product
            </Button>
          )}
        </div>
      </header>

      {isImportingProducts && (
        <div className="bg-primary/5 border border-primary/20 p-4 rounded-lg flex items-center gap-3 animate-pulse">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <span className="text-sm font-bold uppercase tracking-widest text-primary">Synchronizing Catalog...</span>
        </div>
      )}

      <Card className="shadow-sm border-gray-100 bg-white overflow-hidden">
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/50">
                <TableRow className="hover:bg-transparent h-11 border-b">
                    <SortableHead label="Code" sortKey="materialCode" sortConfig={sortConfig} onSort={handleSort} className="pl-6" />
                    <SortableHead label="Product Name" sortKey="name" sortConfig={sortConfig} onSort={handleSort} />
                    <SortableHead label="Client / Company" sortKey="partyName" sortConfig={sortConfig} onSort={handleSort}>
                        <MultiSelectFilter label="Client" options={clientOptions} selected={clientFilter} onChange={setClientFilter} />
                    </SortableHead>
                    <TableHead className="font-black uppercase text-[10px] tracking-widest text-center">Dimension (mm)</TableHead>
                    <SortableHead label="Ply" sortKey="ply" sortConfig={sortConfig} onSort={handleSort} align="center">
                        <MultiSelectFilter label="Ply" options={plyOptions} selected={plyFilter} onChange={setPlyFilter} />
                    </SortableHead>
                    <TableHead className="text-right pr-6 font-black uppercase text-[10px] tracking-widest">Actions</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {isLoading ? (
                    <TableRow>
                        <TableCell colSpan={6} className="text-center py-20">
                            <Loader2 className="h-8 w-8 animate-spin mx-auto opacity-20"/>
                        </TableCell>
                    </TableRow>
                ) : paginatedProducts.map(product => (
                    <TableRow key={product.id} className="hover:bg-muted/30 group h-14 border-b transition-colors">
                        <TableCell className="pl-6">
                            <Badge variant="outline" className="font-mono text-[10px] bg-white border-gray-200 text-gray-600 px-1.5">{product.materialCode || 'N/A'}</Badge>
                        </TableCell>
                        <TableCell className="font-black text-gray-900 uppercase tracking-tighter">{product.name}</TableCell>
                        <TableCell className="text-xs text-muted-foreground uppercase font-bold tracking-tight truncate max-w-[200px]">{product.partyName || 'Unassigned Client'}</TableCell>
                        <TableCell className="text-center font-mono text-xs text-gray-500">{product.specification?.dimension || 'N/A'}</TableCell>
                        <TableCell className="text-center">
                            {product.specification?.ply ? (
                                <Badge variant="secondary" className="text-[9px] font-black uppercase h-5 px-2 bg-blue-50 text-blue-700 border-blue-100">{product.specification.ply} Ply</Badge>
                            ) : (
                                <span className="text-muted-foreground text-xs opacity-30">—</span>
                            )}
                        </TableCell>
                        <TableCell className="text-right pr-6">
                            <div className="flex items-center justify-end gap-2">
                                <Button 
                                    variant="outline" 
                                    size="sm" 
                                    className="h-8 text-[9px] font-black uppercase tracking-widest opacity-100 lg:opacity-0 group-hover:opacity-100 transition-opacity border-gray-300"
                                    onClick={() => handleViewSpec(product)}
                                >
                                    <FileText className="mr-1.5 h-3.5 w-3.5 text-primary" /> Technical Sheet
                                </Button>
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="ghost" size="icon" className="h-8 w-8">
                                            <MoreHorizontal className="h-4 w-4"/>
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="w-56">
                                        <DropdownMenuItem onSelect={() => handleViewSpec(product)}><Eye className="mr-2 h-4 w-4"/> View Full Spec</DropdownMenuItem>
                                        <DropdownMenuItem onSelect={() => handleProductEdit(product)}><Edit className="mr-2 h-4 w-4"/> Edit Configuration</DropdownMenuItem>
                                        <DropdownMenuSeparator />
                                        <AlertDialog onOpenChange={(open) => { if (open) checkProductUsage(product.id); }}>
                                            <AlertDialogTrigger asChild>
                                                <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-destructive"><Trash2 className="mr-2 h-4 w-4"/> Delete Product</DropdownMenuItem>
                                            </AlertDialogTrigger>
                                            <AlertDialogContent>
                                                <AlertDialogHeader>
                                                    <AlertDialogTitle className="font-black uppercase tracking-tight">Purge Product?</AlertDialogTitle>
                                                    <AlertDialogDescription>
                                                        This will permanently remove the product and its specification from the global catalog.
                                                        {deleteCheckProductId === product.id && quotationRefCount !== null && quotationRefCount > 0 && (
                                                            <span className="block mt-2 font-bold text-destructive">
                                                                Used in {quotationRefCount} saved quotation{quotationRefCount > 1 ? 's' : ''} - those will show "Custom Item" instead of this product's name if reprinted.
                                                            </span>
                                                        )}
                                                    </AlertDialogDescription>
                                                </AlertDialogHeader>
                                                <AlertDialogFooter>
                                                    <AlertDialogCancel className="font-bold text-xs uppercase h-10">Cancel</AlertDialogCancel>
                                                    <AlertDialogAction onClick={() => handleDeleteProduct(product.id)} className="bg-destructive text-white font-black text-xs uppercase h-10 shadow-lg shadow-destructive/20">Delete Record</AlertDialogAction>
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
                    <TableRow>
                        <TableCell colSpan={6} className="h-60 text-center text-muted-foreground italic">
                            <Package className="h-10 w-10 mx-auto opacity-10 mb-3"/>
                            <p className="text-sm font-medium uppercase tracking-widest">No products found in the catalog.</p>
                        </TableCell>
                    </TableRow>
                )}
            </TableBody>
          </Table>
        </CardContent>
        
        {(totalPages > 1 || itemsPerPage !== -1) && (
            <CardFooter className="flex flex-col sm:flex-row items-center justify-between py-4 border-t bg-muted/5 px-6 gap-4">
                <div className="text-xs text-muted-foreground font-bold uppercase tracking-tight">
                    {itemsPerPage === -1 ? (
                        <>Showing all <span className="font-black text-foreground">{filteredProducts.length}</span> products</>
                    ) : (
                        <>
                            Showing <span className="font-black text-foreground">{(currentPage - 1) * itemsPerPage + 1}</span> to <span className="font-black text-foreground">{Math.min(currentPage * itemsPerPage, filteredProducts.length)}</span> of <span className="font-black text-foreground">{filteredProducts.length}</span> products
                        </>
                    )}
                </div>
                <div className="flex items-center gap-6">
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black uppercase text-muted-foreground whitespace-nowrap">Rows per page:</span>
                        <Select value={String(itemsPerPage)} onValueChange={(v) => {
                            setItemsPerPage(parseInt(v));
                            setCurrentPage(1);
                        }}>
                            <SelectTrigger className="h-8 w-[75px] bg-white border-gray-200 text-xs font-bold">
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
                            <div className="text-xs font-black px-2 whitespace-nowrap tabular-nums">Page {currentPage} of {totalPages}</div>
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

      {/* Product Editor Dialog */}
      <Dialog open={isProductEditorOpen} onOpenChange={setIsProductEditorOpen}>
        <DialogContent className="sm:max-w-5xl max-h-[95vh] flex flex-col p-0 border-none shadow-2xl overflow-hidden">
            <DialogHeader className="p-6 border-b bg-muted/5 shrink-0">
                <DialogTitle className="text-2xl font-black text-gray-900 uppercase tracking-tight">{productToEdit ? 'Edit Product Catalog Entry' : 'New Catalog Entry'}</DialogTitle>
                <DialogDescription className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Define board composition layers and technical specs for the CRM catalog.</DialogDescription>
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
        <DialogContent className="max-w-4xl max-h-[95vh] flex flex-col p-0 border-none shadow-2xl overflow-hidden">
          {selectedProduct && (
            <>
              <DialogHeader className="p-6 border-b bg-muted/5 shrink-0">
                <div className="flex items-center justify-between">
                    <DialogTitle className="text-xl font-black uppercase tracking-tight flex items-center gap-2">
                        <FileText className="h-5 w-5 text-primary"/>
                        Specification Data Sheet
                    </DialogTitle>
                    <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={handleDownloadPdf} disabled={isExportingPdf} className="h-9 font-bold text-xs">
                            {isExportingPdf ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileDown className="mr-2 h-4 w-4" />} Download PDF
                        </Button>
                        <Button variant="outline" size="sm" onClick={handlePrint} className="h-9 font-bold text-xs">
                            <Printer className="mr-2 h-4 w-4" /> Print Spec
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => setIsPreviewOpen(false)} className="h-9 w-9"><X className="h-4 w-4"/></Button>
                    </div>
                </div>
              </DialogHeader>
              <ScrollArea className="flex-1 bg-gray-100/50 p-4 sm:p-12">
                <div ref={printableRef} className="printable-area mx-auto p-12 bg-white text-black font-sans shadow-2xl ring-1 ring-black/5" style={{ width: '210mm', minHeight: '297mm' }}>
                <header className="text-center space-y-1 mb-10 border-b-2 border-neutral-900 pb-6">
                    <h1 className="text-2xl font-black uppercase tracking-tight">SHIVAM PACKAGING INDUSTRIES PVT LTD.</h1>
                    <p className="text-sm font-bold uppercase tracking-widest text-neutral-500">HETAUDA 08, NEPAL</p>
                    <h2 className="text-lg font-black underline mt-6 uppercase tracking-[0.2em]">TECHNICAL DATA SHEET (PACKSPEC)</h2>
                </header>

                <div className="grid grid-cols-2 gap-12 mb-10 text-sm">
                    <section className="space-y-4">
                    <h3 className="text-[10px] font-black uppercase border-b border-neutral-200 pb-1 text-neutral-400 tracking-widest">Client Identification</h3>
                    <div className="space-y-2">
                        <p><span className="font-bold text-neutral-400 uppercase text-[9px] block">Client Name:</span> <span className="font-black text-base">{selectedProduct.partyName}</span></p>
                        <p><span className="font-bold text-neutral-400 uppercase text-[9px] block">Material Code:</span> <span className="font-black text-blue-700 font-mono">{selectedProduct.materialCode || 'N/A'}</span></p>
                        <p><span className="font-bold text-neutral-400 uppercase text-[9px] block">Property Address:</span> <span className="font-medium text-neutral-600">{selectedProduct.partyAddress || 'N/A'}</span></p>
                    </div>
                    </section>
                    <section className="space-y-4">
                    <h3 className="text-[10px] font-black uppercase border-b border-neutral-200 pb-1 text-neutral-400 tracking-widest">Product Primary Specs</h3>
                    <div className="space-y-2">
                        <p><span className="font-bold text-neutral-400 uppercase text-[9px] block">Product Label:</span> <span className="font-black text-base uppercase">{selectedProduct.name}</span></p>
                        <p><span className="font-bold text-neutral-400 uppercase text-[9px] block">Structural Class:</span> <span className="font-black">{selectedProduct.specification?.boxType || 'RSC'}</span></p>
                        <p><span className="font-bold text-neutral-400 uppercase text-[9px] block">Ply Construction:</span> <span className="font-black">{selectedProduct.specification?.ply} Ply Board</span></p>
                    </div>
                    </section>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                    <section className="space-y-4">
                    <h3 className="text-[10px] font-black uppercase flex items-center gap-2 text-neutral-400 tracking-widest">
                        <Layers className="h-3 w-3" /> 
                        Board Composition (GSM)
                    </h3>
                    <div className="border-2 border-neutral-900 overflow-hidden rounded-lg">
                        <Table className="text-xs">
                        <TableBody>
                            {gsmFields.map(field => {
                            const val = selectedProduct.specification?.[field];
                            if (!val) return null;
                            return (
                                <TableRow key={field} className="h-9 border-b border-neutral-200 hover:bg-transparent">
                                <TableCell className="font-bold uppercase text-[10px] bg-neutral-50 border-r border-neutral-200">{formatLabel(field)}</TableCell>
                                <TableCell className="text-right font-black tabular-nums">{val} GSM</TableCell>
                                </TableRow>
                            );
                            })}
                        </TableBody>
                        </Table>
                    </div>
                    </section>

                    <section className="space-y-6">
                    <h3 className="text-[10px] font-black uppercase flex items-center gap-2 text-neutral-400 tracking-widest">
                        <Box className="h-3 w-3" /> 
                        Physical & Test Parameters
                    </h3>
                    <div className="border-2 border-neutral-900 overflow-hidden rounded-lg">
                        <Table className="text-xs">
                        <TableBody>
                            <TableRow className="h-9 border-b border-neutral-200 hover:bg-transparent">
                            <TableCell className="font-bold uppercase text-[10px] bg-neutral-50 border-r border-neutral-200">Dimension (LxBxH)</TableCell>
                            <TableCell className="text-right font-black tabular-nums">{selectedProduct.specification?.dimension} mm</TableCell>
                            </TableRow>
                            <TableRow className="h-9 border-b border-neutral-200 hover:bg-transparent">
                            <TableCell className="font-bold uppercase text-[10px] bg-neutral-50 border-r border-neutral-200">Weight of Box</TableCell>
                            <TableCell className="text-right font-black tabular-nums">{selectedProduct.specification?.weightOfBox} Grams</TableCell>
                            </TableRow>
                            <TableRow className="h-9 border-b border-neutral-200 hover:bg-transparent">
                            <TableCell className="font-bold uppercase text-[10px] bg-neutral-50 border-r border-neutral-200">Bursting Factor (BF)</TableCell>
                            <TableCell className="text-right font-black tabular-nums">{selectedProduct.specification?.paperBf}</TableCell>
                            </TableRow>
                            <TableRow className="h-9 border-b border-neutral-200 hover:bg-transparent">
                            <TableCell className="font-bold uppercase text-[10px] bg-neutral-50 border-r border-neutral-200">Load Bearing</TableCell>
                            <TableCell className="text-right font-black tabular-nums">{selectedProduct.specification?.load} KGF</TableCell>
                            </TableRow>
                            <TableRow className="h-9 border-b border-neutral-200 hover:bg-transparent">
                            <TableCell className="font-bold uppercase text-[10px] bg-neutral-50 border-r border-neutral-200">Max Moisture</TableCell>
                            <TableCell className="text-right font-black tabular-nums">{selectedProduct.specification?.moisture}%</TableCell>
                            </TableRow>
                        </TableBody>
                        </Table>
                    </div>
                    
                    <div className="p-4 bg-neutral-50 border-2 border-dashed border-neutral-200 rounded-lg">
                        <h4 className="text-[9px] font-black uppercase text-neutral-400 mb-2 tracking-widest flex items-center gap-1.5"><PrinterIcon className="h-3 w-3"/> Finishing Instructions</h4>
                        <p className="text-xs font-bold leading-relaxed">{selectedProduct.specification?.printing || 'Plain / No specific instructions'}</p>
                    </div>
                    </section>
                </div>

                <div className="mt-20 pt-10 border-t border-dashed border-neutral-300">
                    <p className="text-[10px] text-center text-neutral-400 uppercase tracking-[0.3em] font-black">
                    End of Technical Data Sheet &bull; Verified via StarSutra Intelligence
                    </p>
                </div>
                </div>
                <ScrollBar orientation="horizontal" />
              </ScrollArea>
            </>
          )}
        </DialogContent>
      </Dialog>

      <style jsx global>{`
        @media print {
          @page { size: A4; margin: 0; }
          body { background: white !important; }
          body * { visibility: hidden; }
          .printable-area, .printable-area * { visibility: visible; }
          .printable-area { position: absolute; left: 0; top: 0; width: 210mm; border: none; box-shadow: none; padding: 12mm; }
        }
      `}</style>
    </div>
  );
}
