
'use client';

import { useState, useEffect, useMemo } from 'react';
import type { Product } from '@/lib/types';
import { onProductsUpdate } from '@/services/product-service';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Printer, Loader2 } from 'lucide-react';

export default function CostReportPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  
  const [costs, setCosts] = useState({
    kraftPaper: '',
    gum: '',
    ink: '',
    stitchingWire: '',
    labour: '',
    overhead: '',
  });

  useEffect(() => {
    const unsub = onProductsUpdate(setProducts);
    return () => unsub();
  }, []);

  const selectedProduct = useMemo(() => {
    return products.find(p => p.id === selectedProductId);
  }, [products, selectedProductId]);

  const calculationResults = useMemo(() => {
    if (!selectedProduct || !selectedProduct.specification) {
      return null;
    }
    
    const spec = selectedProduct.specification;
    const l = parseFloat(spec.dimension.split('x')[0] || '0') * 2.54;
    const b = parseFloat(spec.dimension.split('x')[1] || '0') * 2.54;
    const h = parseFloat(spec.dimension.split('x')[2] || '0') * 2.54;
    const ply = parseFloat(spec.ply) || 0;
    
    if (l === 0 || b === 0 || h === 0 || ply === 0) return null;

    const sheetSizeL = ((2 * l) + (2 * b) + 5) / 100;
    const sheetSizeB = (b + h + 2) / 100;
    const sheetArea = sheetSizeL * sheetSizeB;
    const paperRequired = sheetArea * ply;
    
    const kraftPaperCost = (paperRequired * parseFloat(costs.kraftPaper || '0'));
    const gumCost = (paperRequired * parseFloat(costs.gum || '0'));
    const inkCost = parseFloat(costs.ink || '0');
    const stitchingWireCost = parseFloat(costs.stitchingWire || '0');
    const labourCost = parseFloat(costs.labour || '0');
    const overheadCost = parseFloat(costs.overhead || '0');
    
    const totalRawMaterialCost = kraftPaperCost + gumCost + inkCost + stitchingWireCost;
    const totalCost = totalRawMaterialCost + labourCost + overheadCost;

    return {
      paperRequired: paperRequired.toFixed(4),
      kraftPaperCost: kraftPaperCost.toFixed(2),
      gumCost: gumCost.toFixed(2),
      totalRawMaterialCost: totalRawMaterialCost.toFixed(2),
      totalCost: totalCost.toFixed(2),
    };

  }, [selectedProduct, costs]);

  const handleCostChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setCosts(prev => ({ ...prev, [name]: value }));
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <>
      <div className="flex flex-col gap-8 print:hidden">
        <header>
          <h1 className="text-3xl font-bold tracking-tight">Cost Report Generator</h1>
          <p className="text-muted-foreground">Select a product and input current costs to generate a report.</p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
          <div className="lg:col-span-1 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Configuration</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="product-select">Select Product</Label>
                  <Select onValueChange={setSelectedProductId} value={selectedProductId}>
                    <SelectTrigger id="product-select">
                      <SelectValue placeholder="Select a product..." />
                    </SelectTrigger>
                    <SelectContent>
                      {products.map(p => (
                        <SelectItem key={p.id} value={p.id}>{p.name} ({p.materialCode})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Raw Material Costs</CardTitle>
                <CardDescription>Enter the current rate per KG.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="cost-kraftPaper">Kraft Paper (per KG)</Label>
                  <Input id="cost-kraftPaper" name="kraftPaper" type="number" value={costs.kraftPaper} onChange={handleCostChange} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cost-gum">Gum (per KG of paper)</Label>
                  <Input id="cost-gum" name="gum" type="number" value={costs.gum} onChange={handleCostChange} />
                </div>
                 <div className="space-y-2">
                  <Label htmlFor="cost-ink">Ink Cost (per box)</Label>
                  <Input id="cost-ink" name="ink" type="number" value={costs.ink} onChange={handleCostChange} />
                </div>
                 <div className="space-y-2">
                  <Label htmlFor="cost-stitchingWire">Stitching Wire (per box)</Label>
                  <Input id="cost-stitchingWire" name="stitchingWire" type="number" value={costs.stitchingWire} onChange={handleCostChange} />
                </div>
              </CardContent>
            </Card>
             <Card>
                <CardHeader>
                    <CardTitle>Other Costs</CardTitle>
                    <CardDescription>Enter other costs per box.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="cost-labour">Labour Cost</Label>
                        <Input id="cost-labour" name="labour" type="number" value={costs.labour} onChange={handleCostChange} />
                    </div>
                     <div className="space-y-2">
                        <Label htmlFor="cost-overhead">Overhead Cost</Label>
                        <Input id="cost-overhead" name="overhead" type="number" value={costs.overhead} onChange={handleCostChange} />
                    </div>
                </CardContent>
             </Card>

          </div>

          <div className="lg:col-span-2">
            <Card className="sticky top-8">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                    <CardTitle>Generated Cost Report</CardTitle>
                    {selectedProduct && <CardDescription>For: {selectedProduct.name}</CardDescription>}
                </div>
                <Button onClick={handlePrint} variant="outline" size="icon" disabled={!calculationResults}>
                    <Printer className="h-4 w-4" />
                </Button>
              </CardHeader>
              <CardContent>
                {!selectedProduct ? (
                  <div className="flex h-64 items-center justify-center text-muted-foreground">
                    <p>Select a product to begin.</p>
                  </div>
                ) : !calculationResults ? (
                    <div className="flex h-64 items-center justify-center text-muted-foreground">
                        <p>Product specifications are incomplete for calculation.</p>
                    </div>
                ) : (
                  <div className="space-y-4">
                    <h3 className="font-semibold">Cost Breakdown (per box)</h3>
                    <div className="p-4 border rounded-md space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Paper Required (KG)</span>
                        <span>{calculationResults.paperRequired}</span>
                      </div>
                      <Separator />
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Kraft Paper Cost</span>
                        <span>{calculationResults.kraftPaperCost}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Gum Cost</span>
                        <span>{calculationResults.gumCost}</span>
                      </div>
                       <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Ink Cost</span>
                        <span>{parseFloat(costs.ink || '0').toFixed(2)}</span>
                      </div>
                       <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Stitching Wire Cost</span>
                        <span>{parseFloat(costs.stitchingWire || '0').toFixed(2)}</span>
                      </div>
                      <Separator />
                      <div className="flex justify-between font-medium">
                        <span className="text-muted-foreground">Total Raw Material Cost</span>
                        <span>{calculationResults.totalRawMaterialCost}</span>
                      </div>
                    </div>
                     <div className="p-4 border rounded-md space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Labour Cost</span>
                        <span>{parseFloat(costs.labour || '0').toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Overhead Cost</span>
                        <span>{parseFloat(costs.overhead || '0').toFixed(2)}</span>
                      </div>
                     </div>
                     <Separator />
                      <div className="flex justify-between text-lg font-bold">
                        <span>Total Cost Per Box (NPR)</span>
                        <span>{calculationResults.totalCost}</span>
                      </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
      
      {/* Printable Report */}
      <div className="printable-area hidden print:block space-y-4 p-4 text-black bg-white">
        {selectedProduct && calculationResults && (
            <>
                <header className="text-center space-y-1 mb-4">
                    <h1 className="text-xl font-bold">SHIVAM PACKAGING INDUSTRIES PVT LTD.</h1>
                    <h2 className="text-lg font-semibold">Cost Report</h2>
                </header>
                <div className="text-sm">
                    <p><span className="font-semibold">Date:</span> {new Date().toLocaleDateString('en-CA')}</p>
                    <p><span className="font-semibold">Product:</span> {selectedProduct.name} ({selectedProduct.materialCode})</p>
                </div>
                <Separator className="my-4 bg-gray-400" />
                <div className="space-y-2">
                    <h3 className="font-semibold text-lg">Specifications</h3>
                    <ul className="list-disc list-inside text-sm grid grid-cols-2 gap-x-4">
                        {Object.entries(selectedProduct.specification).map(([key, value]) => value && <li key={key}>{key.charAt(0).toUpperCase() + key.slice(1)}: {value}</li>)}
                    </ul>
                </div>
                 <Separator className="my-4 bg-gray-400" />
                 <div className="space-y-2">
                    <h3 className="font-semibold text-lg">Cost Breakdown (per box)</h3>
                    <div className="flex justify-between text-sm"><span className="text-gray-600">Paper Required (KG)</span><span>{calculationResults.paperRequired}</span></div>
                    <Separator className="my-1 bg-gray-200" />
                    <div className="flex justify-between text-sm"><span className="text-gray-600">Kraft Paper Cost</span><span>{calculationResults.kraftPaperCost}</span></div>
                    <div className="flex justify-between text-sm"><span className="text-gray-600">Gum Cost</span><span>{calculationResults.gumCost}</span></div>
                    <div className="flex justify-between text-sm"><span className="text-gray-600">Ink Cost</span><span>{parseFloat(costs.ink || '0').toFixed(2)}</span></div>
                    <div className="flex justify-between text-sm"><span className="text-gray-600">Stitching Wire Cost</span><span>{parseFloat(costs.stitchingWire || '0').toFixed(2)}</span></div>
                    <Separator className="my-1 bg-gray-400" />
                    <div className="flex justify-between font-bold text-sm"><span className="text-gray-600">Total Raw Material Cost</span><span>{calculationResults.totalRawMaterialCost}</span></div>
                     <Separator className="my-4 bg-gray-400" />
                    <div className="flex justify-between text-sm"><span className="text-gray-600">Labour Cost</span><span>{parseFloat(costs.labour || '0').toFixed(2)}</span></div>
                    <div className="flex justify-between text-sm"><span className="text-gray-600">Overhead Cost</span><span>{parseFloat(costs.overhead || '0').toFixed(2)}</span></div>
                    <Separator className="my-4 bg-gray-400" />
                    <div className="flex justify-between text-xl font-bold"><span>Total Cost Per Box (NPR)</span><span>{calculationResults.totalCost}</span></div>
                </div>
            </>
        )}
      </div>

       <style jsx global>{`
        @media print {
          @page { size: A4; margin: 0.5in; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          body * { visibility: hidden; }
          .printable-area, .printable-area * { visibility: visible; }
          .printable-area { position: absolute; left: 0; top: 0; width: 100%; }
          .print\:hidden { display: none !important; }
        }
      `}</style>
    </>
  );
}
