'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { format } from 'date-fns';
import { drawPdfLetterhead } from '@/lib/pdf-letterhead';
import { useBusinessProfile } from '@/hooks/use-business-profile';
import {
  Package,
  Search,
  FileText,
  Printer,
  Layers,
  Box,
  ChevronRight,
  ChevronLeft,
  Loader2,
  Plus,
  Edit,
  Trash2,
  MoreHorizontal,
  Eye,
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
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { ProductForm } from '../cost-report/_components/product-form';
import { SortableHead } from '@/components/ui/sortable-head';

const formatLabel = (key: string) => {
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
};

const gsmFields: (keyof ProductSpecification)[] = [
  'topGsm', 'flute1Gsm', 'middleGsm', 'flute2Gsm', 'liner2Gsm', 'flute3Gsm', 'liner3Gsm', 'flute4Gsm', 'liner4Gsm', 'bottomGsm'
];

/**
 * The single definition of what a specification data sheet contains.
 *
 * The on-screen sheet, the PDF export and the per-product Excel export all
 * render from this one list, so the three can't drift apart - and because
 * it is already a flat (section, field, value) list, the Excel export is a
 * straight dump with no reshaping, which is what makes it editable.
 */
const buildSpecRows = (p: Product): { section: string; label: string; value: string }[] => {
  const s = p.specification || {};
  const rows: { section: string; label: string; value: string }[] = [];
  const add = (section: string, label: string, value: any, suffix = '') => {
    const v = value === undefined || value === null || value === '' ? '' : `${value}${suffix}`;
    rows.push({ section, label, value: v });
  };

  add('Identification', 'Client', p.partyName);
  add('Identification', 'Client Address', p.partyAddress);
  add('Identification', 'Product', p.name);
  add('Identification', 'Material Code', p.materialCode);

  add('Construction', 'Box Type', s.boxType);
  add('Construction', 'Ply', s.ply ? `${s.ply} Ply` : '');
  add('Construction', 'Dimension (L x B x H)', s.dimension, ' mm');
  add('Construction', 'Paper Type', s.paperType);
  add('Construction', 'Paper BF', s.paperBf);
  add('Construction', 'Paper Shade', s.paperShade);

  // Only the layers this board actually has - a 3 ply sheet shouldn't print
  // seven empty GSM rows.
  gsmFields.forEach(f => {
    const v = s[f];
    if (v) add('Board Composition', formatLabel(f as string), v, ' GSM');
  });
  add('Board Composition', 'Total Board GSM', s.gsm, s.gsm ? ' GSM' : '');

  add('Physical & Test', 'Weight of Box', s.weightOfBox, s.weightOfBox ? ' g' : '');
  add('Physical & Test', 'Load Bearing', s.load, s.load ? ' kg' : '');
  add('Physical & Test', 'Max Moisture', s.moisture, s.moisture ? ' %' : '');
  add('Physical & Test', 'Wastage', s.wastagePercent, s.wastagePercent ? ' %' : '');
  add('Physical & Test', 'Stapling', s.stapling);
  add('Physical & Test', 'Staple Width', s.stapleWidth);
  add('Physical & Test', 'Overlap Width', s.overlapWidth);

  add('Finishing', 'Printing / Finishing', s.printing);

  return rows.filter(r => r.value !== '');
};

/** A product with no dimensions or no ply can't produce a usable data sheet.
 *  Surfaced as a badge and a filter so the gaps are findable rather than
 *  discovered when someone tries to print one. */
const isIncompleteSpec = (p: Product): boolean => {
  const spec = p.specification || {};
  const dims = (spec.dimension || '').split('x').map(v => parseFloat(v) || 0);
  return dims.length < 2 || dims[0] <= 0 || dims[1] <= 0 || !spec.ply;
};

/** Sort key for the Dimension column - ordering by the raw "400x300x250"
 *  string is meaningless, so rows order by the volume it describes. */
const specVolume = (p: Product): number => {
  const [l, b, h] = (p.specification?.dimension || '').split('x').map(v => parseFloat(v) || 0);
  return (l || 0) * (b || 0) * (h || 1);
};

/** A labelled filter dropdown for the filter bar. Same multi-select
 *  behaviour as the in-header funnel icons this page used to have, but with
 *  the label and the active count visible without opening it. */
const FilterSelect = ({ label, options, selected, onChange }: {
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (v: string[]) => void;
}) => {
  const toggle = (v: string) => onChange(selected.includes(v) ? selected.filter(x => x !== v) : [...selected, v]);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant={selected.length > 0 ? 'default' : 'outline'}
          size="sm"
          className="h-9 text-[10px] font-black uppercase tracking-widest gap-1.5"
          disabled={options.length === 0}
          title={options.length === 0 ? `No ${label.toLowerCase()} values in the catalog yet` : undefined}
        >
          {label}
          {selected.length > 0 && <span className="tabular-nums">({selected.length})</span>}
          <ChevronDown className="h-3 w-3 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-0">
        <ScrollArea className="max-h-64">
          <div className="p-1">
            {options.map(o => (
              <button
                key={o.value}
                onClick={() => toggle(o.value)}
                className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-muted text-left"
              >
                <Checkbox checked={selected.includes(o.value)} className="pointer-events-none" />
                <span className="truncate">{o.label}</span>
              </button>
            ))}
          </div>
        </ScrollArea>
        {selected.length > 0 && (
          <div className="border-t p-1">
            <Button variant="ghost" size="sm" className="w-full h-7 text-[10px] font-bold uppercase" onClick={() => onChange([])}>
              Clear {label}
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
};

/** Row actions. Extracted because the table and the mobile card list both
 *  need the identical menu, delete guard included. */
const ProductRowMenu = ({ product, onView, onEdit, onCheckUsage, onDelete, deleteCheckProductId, quotationRefCount }: any) => (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4"/></Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="w-56">
      <DropdownMenuItem onSelect={() => onView(product)}><Eye className="mr-2 h-4 w-4"/> View Full Spec</DropdownMenuItem>
      <DropdownMenuItem onSelect={() => onEdit(product)}><Edit className="mr-2 h-4 w-4"/> Edit Configuration</DropdownMenuItem>
      <DropdownMenuSeparator />
      <AlertDialog onOpenChange={(open) => { if (open) onCheckUsage(product.id); }}>
        <AlertDialogTrigger asChild>
          <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-destructive"><Trash2 className="mr-2 h-4 w-4"/> Delete Product</DropdownMenuItem>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-black uppercase tracking-tight">Delete Product?</AlertDialogTitle>
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
            <AlertDialogAction onClick={() => onDelete(product.id)} className="bg-destructive text-white font-black text-xs uppercase h-10 shadow-lg shadow-destructive/20">Delete Record</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DropdownMenuContent>
  </DropdownMenu>
);

export default function PackSpecPage() {
  const { user, hasPermission } = useAuth();
  const { toast } = useToast();
  // Reads the saved company profile, so a Settings edit reaches the spec
  // sheet and its export - both used to be pinned to the hardcoded default.
  const companyProfile = useBusinessProfile();
  const [products, setProducts] = useState<Product[]>([]);
  const [parties, setParties] = useState<{ id: string; name: string }[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const specRows = useMemo(() => (selectedProduct ? buildSpecRows(selectedProduct) : []), [selectedProduct]);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  
  // Management State
  const [productToEdit, setProductToEdit] = useState<Product | null>(null);
  const [isProductEditorOpen, setIsProductEditorOpen] = useState(false);

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Sort lives on the column headers (SortableHead, shared with the other
  // Excel-style tables); filtering lives in the visible filter bar rather
  // than behind funnel icons, which nobody found here.
  type SortKey = 'materialCode' | 'name' | 'partyName' | 'ply' | 'boxType' | 'volume' | 'paperType' | 'gsm';
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' } | null>(null);
  const [clientFilter, setClientFilter] = useState<string[]>([]);
  const [plyFilter, setPlyFilter] = useState<string[]>([]);
  const [paperFilter, setPaperFilter] = useState<string[]>([]);
  const [bfFilter, setBfFilter] = useState<string[]>([]);
  const [boxTypeFilter, setBoxTypeFilter] = useState<string[]>([]);
  const [onlyIncomplete, setOnlyIncomplete] = useState(false);
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

  // Every filter's options come from what's actually in the catalog, so a
  // filter never offers a value that would return nothing.
  const distinctSpecValues = (key: 'paperType' | 'paperBf' | 'boxType') =>
    Array.from(new Set(products.map(p => p.specification?.[key]).filter(Boolean))).sort() as string[];

  const paperOptions = useMemo(
    () => distinctSpecValues('paperType').map(v => ({ value: v, label: v })),
    [products]);

  const bfOptions = useMemo(
    () => distinctSpecValues('paperBf').map(v => ({ value: v, label: v })),
    [products]);

  const boxTypeOptions = useMemo(
    () => distinctSpecValues('boxType').map(v => ({ value: v, label: v })),
    [products]);

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
    if (paperFilter.length > 0) {
      result = result.filter(p => p.specification?.paperType && paperFilter.includes(p.specification.paperType));
    }
    if (bfFilter.length > 0) {
      result = result.filter(p => p.specification?.paperBf && bfFilter.includes(p.specification.paperBf));
    }
    if (boxTypeFilter.length > 0) {
      result = result.filter(p => p.specification?.boxType && boxTypeFilter.includes(p.specification.boxType));
    }
    if (onlyIncomplete) {
      result = result.filter(isIncompleteSpec);
    }
    if (sortConfig) {
      const { key, direction } = sortConfig;
      const dir = direction === 'asc' ? 1 : -1;
      result = [...result].sort((a, b) => {
        // Ply, GSM and volume are numbers stored as strings - comparing them
        // as text puts "9 Ply" before "10 Ply", so they sort numerically.
        if (key === 'ply' || key === 'gsm') {
          return ((parseFloat(a.specification?.[key] || '') || 0) - (parseFloat(b.specification?.[key] || '') || 0)) * dir;
        }
        if (key === 'volume') return (specVolume(a) - specVolume(b)) * dir;
        const av = key === 'materialCode' ? (a.materialCode || '')
          : key === 'name' ? a.name
          : key === 'partyName' ? (a.partyName || '')
          : (a.specification?.[key] || '');
        const bv = key === 'materialCode' ? (b.materialCode || '')
          : key === 'name' ? b.name
          : key === 'partyName' ? (b.partyName || '')
          : (b.specification?.[key] || '');
        return String(av).localeCompare(String(bv)) * dir;
      });
    } else {
      result = [...result].sort((a, b) => a.name.localeCompare(b.name));
    }
    return result;
  }, [products, searchQuery, clientFilter, plyFilter, paperFilter, bfFilter, boxTypeFilter, onlyIncomplete, sortConfig]);

  const stats = useMemo(() => ({
    total: products.length,
    clients: new Set(products.map(p => p.partyName || 'Unassigned Client')).size,
    plyVariants: new Set(products.map(p => p.specification?.ply).filter(Boolean)).size,
    incomplete: products.filter(isIncompleteSpec).length,
  }), [products]);

  const clearAllFilters = () => {
    setClientFilter([]); setPlyFilter([]); setPaperFilter([]); setBfFilter([]);
    setBoxTypeFilter([]); setOnlyIncomplete(false); setSearchQuery(''); setSortConfig(null);
    setCurrentPage(1);
  };

  // One flat list of what's currently narrowing the view, so each filter can
  // be lifted individually from the chip row instead of hunting for the
  // control that set it.
  const activeChips = useMemo(() => {
    const chips: { group: string; value: string; label: string; remove: () => void }[] = [];
    const add = (group: string, values: string[], setter: (v: string[]) => void, fmt: (v: string) => string = v => v) =>
      values.forEach(v => chips.push({ group, value: v, label: fmt(v), remove: () => setter(values.filter(x => x !== v)) }));

    add('Client', clientFilter, setClientFilter);
    add('Ply', plyFilter, setPlyFilter, v => `${v} Ply`);
    add('Paper', paperFilter, setPaperFilter);
    add('BF', bfFilter, setBfFilter);
    add('Box Type', boxTypeFilter, setBoxTypeFilter);
    if (onlyIncomplete) chips.push({ group: 'Status', value: 'incomplete', label: 'Incomplete only', remove: () => setOnlyIncomplete(false) });
    if (searchQuery) chips.push({ group: 'Search', value: searchQuery, label: searchQuery, remove: () => setSearchQuery('') });
    return chips;
  }, [clientFilter, plyFilter, paperFilter, bfFilter, boxTypeFilter, onlyIncomplete, searchQuery]);

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

  /**
   * Pure vector PDF - real text, no bitmap.
   *
   * This used to rasterise the sheet with html2canvas at scale 2 and embed
   * the result as an uncompressed PNG, which produced ~15 MB files for one
   * A4 page of text that you could not select, search or zoom into. Drawing
   * the same rows with jsPDF's text and autoTable APIs instead gives a file
   * in the tens of kilobytes, with selectable text and no resolution limit.
   */
  const handleDownloadPdf = async () => {
    if (!selectedProduct) return;
    setIsExportingPdf(true);
    try {
      const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
        import('jspdf'),
        import('jspdf-autotable'),
      ]);

      const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4', compress: true });
      const pageWidth = doc.internal.pageSize.getWidth();
      const rows = buildSpecRows(selectedProduct);

      const headEnd = drawPdfLetterhead(doc, companyProfile, {
        x: pageWidth / 2, y: 16, align: 'center',
        nameSize: 13, detailSize: 8, showPan: false,
      });
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text('TECHNICAL DATA SHEET', pageWidth / 2, headEnd + 8, { align: 'center' });

      // Section names become full-width header rows so the flat list still
      // reads as grouped sections in the PDF.
      const body: any[] = [];
      rows.forEach((r, i) => {
        if (i === 0 || rows[i - 1].section !== r.section) {
          body.push([{ content: r.section.toUpperCase(), colSpan: 2, styles: { fontStyle: 'bold', fillColor: [240, 240, 240], textColor: 40, fontSize: 7 } }]);
        }
        body.push([r.label, r.value]);
      });

      autoTable(doc, {
        startY: 35,
        body,
        theme: 'grid',
        styles: { fontSize: 8, cellPadding: 1.6, lineColor: [210, 210, 210], lineWidth: 0.1 },
        columnStyles: { 0: { cellWidth: 65, fontStyle: 'bold', textColor: 90 }, 1: { textColor: 20 } },
        margin: { left: 14, right: 14 },
      });

      const endY = (doc as any).lastAutoTable?.finalY || 35;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(140);
      doc.text(
        `End of Technical Data Sheet  -  ${format(new Date(), 'dd MMM yyyy')}`,
        pageWidth / 2, Math.min(endY + 8, doc.internal.pageSize.getHeight() - 10), { align: 'center' }
      );

      doc.save(`PackSpec-${selectedProduct.materialCode || selectedProduct.name}.pdf`);
    } catch {
      toast({ title: 'PDF Export Failed', variant: 'destructive' });
    } finally {
      setIsExportingPdf(false);
    }
  };

  /** This one sheet as an editable Excel row-per-field list. */
  const handleExportSheetExcel = async () => {
    if (!selectedProduct) return;
    try {
      const XLSX = await import('xlsx');
      const data = buildSpecRows(selectedProduct).map(r => ({ Section: r.section, Field: r.label, Value: r.value }));
      const ws = XLSX.utils.json_to_sheet(data);
      ws['!cols'] = [{ wch: 20 }, { wch: 28 }, { wch: 40 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Spec');
      XLSX.writeFile(wb, `PackSpec-${selectedProduct.materialCode || selectedProduct.name}.xlsx`);
    } catch {
      toast({ title: 'Excel Export Failed', variant: 'destructive' });
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
    <div className="flex flex-col gap-5">
      <header className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-gray-900 uppercase">PackSpec Catalog</h1>
          <p className="text-muted-foreground text-sm font-medium italic">Technical specification data sheets for client products.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="h-9 font-bold text-[11px] uppercase tracking-widest gap-2">
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
          <input type="file" ref={importFileInputRef} onChange={handleImportExcel} accept=".xlsx,.xls" className="hidden" />
          {hasPermission('crm', 'add') && (
            <Button onClick={() => { setProductToEdit(null); setIsProductEditorOpen(true); }} className="h-9 font-black text-[11px] uppercase tracking-widest shadow-lg shadow-primary/20 px-5">
              <Plus className="mr-1.5 h-4 w-4" /> Add Product
            </Button>
          )}
        </div>
      </header>

      {/* At-a-glance state of the catalog. "Incomplete" is the actionable one:
          a product with no dimensions or no ply can't produce a usable data
          sheet, and there was previously no way to find those. */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        {[
          { label: 'Products', value: stats.total, icon: Package, tone: 'text-foreground' },
          { label: 'Clients', value: stats.clients, icon: Box, tone: 'text-foreground' },
          { label: 'Ply Variants', value: stats.plyVariants, icon: Layers, tone: 'text-foreground' },
          { label: 'Incomplete Specs', value: stats.incomplete, icon: FileText, tone: stats.incomplete > 0 ? 'text-amber-600' : 'text-foreground' },
        ].map(s => (
          <Card key={s.label} className="shadow-sm border-gray-100">
            <CardContent className="p-3 flex items-center gap-3">
              <s.icon className={cn('h-4 w-4 shrink-0 opacity-40', s.tone)} />
              <div className="min-w-0">
                <div className={cn('text-xl font-black tabular-nums leading-none', s.tone)}>{s.value}</div>
                <div className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mt-1 truncate">{s.label}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filter bar. These used to be funnel icons hidden inside two of the
          six column headers, which meant in practice nobody found them.
          Every filter now lives in one labelled, always-visible row. */}
      <Card className="shadow-sm border-gray-100">
        <CardContent className="p-3 space-y-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search code, product, or client..."
                className="pl-8 h-9 bg-white border-gray-300"
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <FilterSelect label="Client" options={clientOptions} selected={clientFilter} onChange={v => { setClientFilter(v); setCurrentPage(1); }} />
              <FilterSelect label="Ply" options={plyOptions} selected={plyFilter} onChange={v => { setPlyFilter(v); setCurrentPage(1); }} />
              <FilterSelect label="Paper" options={paperOptions} selected={paperFilter} onChange={v => { setPaperFilter(v); setCurrentPage(1); }} />
              <FilterSelect label="BF" options={bfOptions} selected={bfFilter} onChange={v => { setBfFilter(v); setCurrentPage(1); }} />
              <FilterSelect label="Box Type" options={boxTypeOptions} selected={boxTypeFilter} onChange={v => { setBoxTypeFilter(v); setCurrentPage(1); }} />
              <Button
                variant={onlyIncomplete ? 'default' : 'outline'}
                size="sm"
                onClick={() => { setOnlyIncomplete(v => !v); setCurrentPage(1); }}
                className="h-9 text-[10px] font-black uppercase tracking-widest"
                title="Show only products missing dimensions or ply"
              >
                Incomplete
              </Button>
            </div>
          </div>

          {/* Active filters as removable chips, so it's always obvious why the
              list is short - the old UI gave no feedback that a filter was on. */}
          {activeChips.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t">
              <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mr-1">Filtering</span>
              {activeChips.map(chip => (
                <button
                  key={`${chip.group}-${chip.value}`}
                  onClick={chip.remove}
                  className="inline-flex items-center gap-1 h-6 px-2 rounded-full border bg-primary/5 border-primary/20 text-[10px] font-bold hover:bg-primary/10 transition-colors"
                  title="Remove this filter"
                >
                  <span className="text-muted-foreground">{chip.group}:</span>
                  <span>{chip.label}</span>
                  <X className="h-3 w-3 opacity-50" />
                </button>
              ))}
              <Button variant="ghost" size="sm" onClick={clearAllFilters} className="h-6 px-2 text-[9px] font-black uppercase tracking-widest text-muted-foreground">
                Clear all
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {isImportingProducts && (
        <div className="bg-primary/5 border border-primary/20 p-4 rounded-lg flex items-center gap-3 animate-pulse">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <span className="text-sm font-bold uppercase tracking-widest text-primary">Synchronizing Catalog...</span>
        </div>
      )}

      <Card className="shadow-sm border-gray-100 bg-white overflow-hidden">
        {/* ---------------- Desktop: sortable table ---------------- */}
        <CardContent className="p-0 hidden md:block">
          <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/50">
                <TableRow className="hover:bg-transparent h-11 border-b">
                    <SortableHead label="Code" sortKey="materialCode" sortConfig={sortConfig} onSort={handleSort} className="pl-6" />
                    <SortableHead label="Product Name" sortKey="name" sortConfig={sortConfig} onSort={handleSort} />
                    <SortableHead label="Client" sortKey="partyName" sortConfig={sortConfig} onSort={handleSort} />
                    <SortableHead label="Box Type" sortKey="boxType" sortConfig={sortConfig} onSort={handleSort} align="center" />
                    <SortableHead label="Dimension (mm)" sortKey="volume" sortConfig={sortConfig} onSort={handleSort} align="center" />
                    <SortableHead label="Ply" sortKey="ply" sortConfig={sortConfig} onSort={handleSort} align="center" />
                    <SortableHead label="Board" sortKey="paperType" sortConfig={sortConfig} onSort={handleSort} align="center" />
                    <SortableHead label="GSM" sortKey="gsm" sortConfig={sortConfig} onSort={handleSort} align="center" />
                    <TableHead className="text-right pr-6 font-black uppercase text-[10px] tracking-widest">Actions</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {isLoading ? (
                    <TableRow>
                        <TableCell colSpan={9} className="text-center py-20">
                            <Loader2 className="h-8 w-8 animate-spin mx-auto opacity-20"/>
                        </TableCell>
                    </TableRow>
                ) : paginatedProducts.map(product => {
                    const spec = product.specification || {};
                    const incomplete = isIncompleteSpec(product);
                    return (
                    <TableRow key={product.id} className={cn('hover:bg-muted/30 group h-14 border-b transition-colors', incomplete && 'bg-amber-50/30')}>
                        <TableCell className="pl-6">
                            <Badge variant="outline" className="font-mono text-[10px] bg-white border-gray-200 text-gray-600 px-1.5">{product.materialCode || 'N/A'}</Badge>
                        </TableCell>
                        <TableCell className="font-black text-gray-900 uppercase tracking-tighter">
                            <span className="inline-flex items-center gap-1.5">
                                {incomplete && <span title="Missing dimensions or ply - this product can't produce a full data sheet" className="text-amber-500">&#9888;</span>}
                                {product.name}
                            </span>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground uppercase font-bold tracking-tight truncate max-w-[180px]">{product.partyName || 'Unassigned Client'}</TableCell>
                        <TableCell className="text-center text-xs font-bold text-gray-600">{spec.boxType || '—'}</TableCell>
                        <TableCell className="text-center font-mono text-xs text-gray-500">{spec.dimension || 'N/A'}</TableCell>
                        <TableCell className="text-center">
                            {spec.ply ? (
                                <Badge variant="secondary" className="text-[9px] font-black uppercase h-5 px-2 bg-blue-50 text-blue-700 border-blue-100">{spec.ply} Ply</Badge>
                            ) : (
                                <span className="text-muted-foreground text-xs opacity-30">—</span>
                            )}
                        </TableCell>
                        <TableCell className="text-center text-[11px] text-gray-600">
                            {spec.paperType ? (
                                <span className="font-bold">{spec.paperType}{spec.paperBf ? ` ${spec.paperBf}` : ''}</span>
                            ) : <span className="opacity-30">—</span>}
                        </TableCell>
                        <TableCell className="text-center font-mono text-xs text-gray-500 tabular-nums">{spec.gsm || '—'}</TableCell>
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
                                <ProductRowMenu
                                    product={product}
                                    onView={handleViewSpec}
                                    onEdit={handleProductEdit}
                                    onCheckUsage={checkProductUsage}
                                    onDelete={handleDeleteProduct}
                                    deleteCheckProductId={deleteCheckProductId}
                                    quotationRefCount={quotationRefCount}
                                />
                            </div>
                        </TableCell>
                    </TableRow>
                    );
                })}
                {!isLoading && filteredProducts.length === 0 && (
                    <TableRow>
                        <TableCell colSpan={9} className="h-60 text-center text-muted-foreground italic">
                            <Package className="h-10 w-10 mx-auto opacity-10 mb-3"/>
                            <p className="text-sm font-medium uppercase tracking-widest">
                                {products.length === 0 ? 'No products in the catalog yet.' : 'No products match the current filters.'}
                            </p>
                            {products.length > 0 && activeChips.length > 0 && (
                                <Button variant="link" size="sm" onClick={clearAllFilters} className="text-xs mt-1">Clear all filters</Button>
                            )}
                        </TableCell>
                    </TableRow>
                )}
            </TableBody>
          </Table>
          </div>
        </CardContent>

        {/* ---------------- Mobile: one card per product ---------------- */}
        <CardContent className="p-3 space-y-2.5 md:hidden">
            {isLoading ? (
                <div className="py-16 text-center"><Loader2 className="h-8 w-8 animate-spin mx-auto opacity-20"/></div>
            ) : paginatedProducts.map(product => {
                const spec = product.specification || {};
                const incomplete = isIncompleteSpec(product);
                return (
                    <Card key={product.id} className={cn('border shadow-sm', incomplete && 'border-amber-300 bg-amber-50/30')}>
                        <CardContent className="p-3 space-y-2">
                            <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                    <div className="font-black uppercase tracking-tight text-sm leading-tight truncate">
                                        {incomplete && <span className="text-amber-500 mr-1">&#9888;</span>}
                                        {product.name}
                                    </div>
                                    <div className="text-[11px] text-muted-foreground uppercase font-bold truncate">{product.partyName || 'Unassigned Client'}</div>
                                </div>
                                <ProductRowMenu
                                    product={product}
                                    onView={handleViewSpec}
                                    onEdit={handleProductEdit}
                                    onCheckUsage={checkProductUsage}
                                    onDelete={handleDeleteProduct}
                                    deleteCheckProductId={deleteCheckProductId}
                                    quotationRefCount={quotationRefCount}
                                />
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                                <Badge variant="outline" className="font-mono text-[9px] px-1.5">{product.materialCode || 'No code'}</Badge>
                                {spec.boxType && <Badge variant="outline" className="text-[9px] px-1.5">{spec.boxType}</Badge>}
                                {spec.ply && <Badge variant="secondary" className="text-[9px] px-1.5 bg-blue-50 text-blue-700 border-blue-100">{spec.ply} Ply</Badge>}
                                {spec.paperType && <Badge variant="outline" className="text-[9px] px-1.5">{spec.paperType}{spec.paperBf ? ` ${spec.paperBf}` : ''}</Badge>}
                            </div>
                            <div className="flex items-center justify-between gap-2 text-[11px] pt-1 border-t">
                                <span className="font-mono text-muted-foreground">{spec.dimension || 'No dimensions'}</span>
                                <span className="font-mono text-muted-foreground tabular-nums">{spec.gsm ? `${spec.gsm} gsm` : ''}</span>
                            </div>
                            <Button variant="outline" size="sm" className="w-full h-8 text-[9px] font-black uppercase tracking-widest" onClick={() => handleViewSpec(product)}>
                                <FileText className="mr-1.5 h-3.5 w-3.5 text-primary" /> Technical Sheet
                            </Button>
                        </CardContent>
                    </Card>
                );
            })}
            {!isLoading && filteredProducts.length === 0 && (
                <div className="py-16 text-center text-muted-foreground italic">
                    <Package className="h-10 w-10 mx-auto opacity-10 mb-3"/>
                    <p className="text-xs font-medium uppercase tracking-widest">
                        {products.length === 0 ? 'No products yet.' : 'No products match the filters.'}
                    </p>
                </div>
            )}
        </CardContent>

        {(totalPages > 1 || itemsPerPage !== -1) && (
            <CardFooter className="flex flex-col sm:flex-row items-center justify-between py-3 border-t bg-muted/5 px-4 sm:px-6 gap-3">
                <div className="text-[11px] text-muted-foreground font-bold uppercase tracking-tight">
                    {itemsPerPage === -1 ? (
                        <>Showing all <span className="font-black text-foreground">{filteredProducts.length}</span> products</>
                    ) : (
                        <>
                            <span className="font-black text-foreground">{filteredProducts.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1}</span>
                            {'-'}
                            <span className="font-black text-foreground">{Math.min(currentPage * itemsPerPage, filteredProducts.length)}</span>
                            {' of '}
                            <span className="font-black text-foreground">{filteredProducts.length}</span>
                            {filteredProducts.length !== products.length && <span className="text-muted-foreground/70"> (of {products.length})</span>}
                        </>
                    )}
                </div>
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black uppercase text-muted-foreground whitespace-nowrap">Rows:</span>
                        <Select value={String(itemsPerPage)} onValueChange={(v) => { setItemsPerPage(parseInt(v)); setCurrentPage(1); }}>
                            <SelectTrigger className="h-8 w-[75px] bg-white border-gray-200 text-xs font-bold"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="10">10</SelectItem>
                                <SelectItem value="25">25</SelectItem>
                                <SelectItem value="50">50</SelectItem>
                                <SelectItem value="-1">All</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    {itemsPerPage !== -1 && totalPages > 1 && (
                        <div className="flex items-center gap-1">
                            <Button variant="outline" size="icon" className="h-8 w-8" disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)}>
                                <ChevronLeft className="h-4 w-4"/>
                            </Button>
                            <span className="text-[11px] font-bold px-2 tabular-nums">{currentPage} / {totalPages}</span>
                            <Button variant="outline" size="icon" className="h-8 w-8" disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)}>
                                <ChevronRight className="h-4 w-4"/>
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
                        <Button variant="outline" size="sm" onClick={handleExportSheetExcel} className="h-9 font-bold text-xs">
                            <FileSpreadsheet className="mr-2 h-4 w-4" /> Excel
                        </Button>
                        <Button variant="outline" size="sm" onClick={handlePrint} className="h-9 font-bold text-xs">
                            <Printer className="mr-2 h-4 w-4" /> Print
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => setIsPreviewOpen(false)} className="h-9 w-9"><X className="h-4 w-4"/></Button>
                    </div>
                </div>
              </DialogHeader>
              <ScrollArea className="flex-1 bg-gray-100/50 p-4 sm:p-12">
                <div ref={printableRef} className="printable-area mx-auto px-10 py-8 bg-white text-black font-sans shadow-2xl ring-1 ring-black/5" style={{ width: '210mm', minHeight: '297mm' }}>
                <header className="text-center mb-5 border-b-2 border-neutral-900 pb-3">
                    <h1 className="text-lg font-black uppercase tracking-tight">{companyProfile.nameEn}</h1>
                    {companyProfile.nameNp && <h2 className="text-[13px] font-semibold text-neutral-700">{companyProfile.nameNp}</h2>}
                    <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">{companyProfile.address}</p>
                    <h2 className="text-xs font-black mt-3 uppercase tracking-[0.2em]">Technical Data Sheet</h2>
                </header>

                {/* One flat field/value list rather than a grid of cards - it
                    fits a fraction of the space, reads top to bottom, and is
                    the same shape as the Excel export. */}
                <table className="w-full text-[11px] border-collapse">
                    <tbody>
                        {specRows.map((row, i) => {
                            const isNewSection = i === 0 || specRows[i - 1].section !== row.section;
                            return (
                                <React.Fragment key={`${row.section}-${row.label}`}>
                                    {isNewSection && (
                                        <tr>
                                            <td colSpan={2} className="pt-3 pb-1 text-[9px] font-black uppercase tracking-widest text-neutral-400 border-b border-neutral-300">
                                                {row.section}
                                            </td>
                                        </tr>
                                    )}
                                    <tr className="border-b border-neutral-100">
                                        <td className="py-1 pr-4 w-[45%] font-bold uppercase text-[10px] text-neutral-500 align-top">{row.label}</td>
                                        <td className="py-1 font-bold text-neutral-900 break-words">{row.value}</td>
                                    </tr>
                                </React.Fragment>
                            );
                        })}
                    </tbody>
                </table>

                <div className="mt-8 pt-4 border-t border-dashed border-neutral-300 flex justify-between text-[9px] text-neutral-400 uppercase tracking-widest font-black">
                    <span>End of Technical Data Sheet</span>
                    <span>{format(new Date(), 'dd MMM yyyy')}</span>
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
