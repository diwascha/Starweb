
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
  ChevronRight
} from 'lucide-react';
import type { Product, ProductSpecification } from '@/lib/types';
import { onProductsUpdate } from '@/services/product-service';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table';

const formatLabel = (key: string) => {
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
};

const gsmFields: (keyof ProductSpecification)[] = [
  'topGsm', 'flute1Gsm', 'middleGsm', 'flute2Gsm', 'liner2Gsm', 'flute3Gsm', 'liner3Gsm', 'flute4Gsm', 'liner4Gsm', 'bottomGsm'
];

export default function PackSpecPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

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

  const handleViewSpec = (product: Product) => {
    setSelectedProduct(product);
    setIsPreviewOpen(true);
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
        <div className="relative w-full md:w-80">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search by product or client..." 
            className="pl-8" 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </header>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <Card key={i} className="h-48 animate-pulse bg-muted" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredProducts.map(product => (
            <Card key={product.id} className="hover:shadow-md transition-shadow group">
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start">
                  <Badge variant="outline" className="mb-2">{product.materialCode || 'No Code'}</Badge>
                  <Package className="h-5 w-5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                <CardTitle className="text-lg line-clamp-1">{product.name}</CardTitle>
                <CardDescription className="line-clamp-1">{product.partyName || 'Unassigned Client'}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 text-xs gap-2">
                  <div className="flex flex-col">
                    <span className="text-muted-foreground uppercase font-semibold text-[10px]">Dimension</span>
                    <span>{product.specification?.dimension || 'N/A'}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-muted-foreground uppercase font-semibold text-[10px]">Ply</span>
                    <span>{product.specification?.ply || 'N/A'} Ply</span>
                  </div>
                </div>
                <Button variant="secondary" size="sm" className="w-full group-hover:bg-primary group-hover:text-primary-foreground transition-colors" onClick={() => handleViewSpec(product)}>
                  View Full Spec <ChevronRight className="ml-2 h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-auto p-0">
          {selectedProduct && (
            <div className="printable-area p-8 bg-white text-black font-sans">
              <header className="text-center space-y-1 mb-8 relative">
                <h1 className="text-2xl font-bold">SHIVAM PACKAGING INDUSTRIES PVT LTD.</h1>
                <p className="text-sm">HETAUDA 08, NEPAL</p>
                <h2 className="text-xl font-bold underline mt-2">TECHNICAL DATA SHEET (PACKSPEC)</h2>
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
                  End of Technical Data Sheet • Generated via STARWEB CRM
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
