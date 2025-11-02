
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export default function CostReportPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  
  const [inputs, setInputs] = useState({
    // Box Size
    l: '', b: '', h: '',
    // Paper Specs
    ply: '3',
    fluteType: 'B',
    paperBf: '18',
    // GSM
    topGsm: '120',
    flute1Gsm: '100',
    middleGsm: '120',
    flute2Gsm: '100',
    bottomGsm: '120',
    // Costs
    paperRate: '',
    gumRate: '1.5',
    stitchingRate: '0.5',
    // Other
    wastagePercent: '3.5',
  });

  useEffect(() => {
    const unsub = onProductsUpdate(setProducts);
    return () => unsub();
  }, []);
  
  const selectedProduct = useMemo(() => {
    return products.find(p => p.id === selectedProductId);
  }, [products, selectedProductId]);

  useEffect(() => {
    if (selectedProduct?.specification) {
      const spec = selectedProduct.specification;
      const [l,b,h] = spec.dimension?.split('x') || ['','',''];
      setInputs(prev => ({
        ...prev,
        l: l || '',
        b: b || '',
        h: h || '',
        ply: spec.ply || '3',
      }));
    }
  }, [selectedProduct]);

  const calculationResults = useMemo(() => {
    const l = parseFloat(inputs.l) || 0;
    const b = parseFloat(inputs.b) || 0;
    const h = parseFloat(inputs.h) || 0;
    const ply = parseInt(inputs.ply, 10) || 0;
    
    if (l === 0 || b === 0 || h === 0 || ply === 0) return null;

    // Calculations based on the Excel logic
    const sheetSizeL = ((2 * l) + (2 * b) + 5);
    const sheetSizeB = (b + h + 2);

    const fluteFactor = inputs.fluteType === 'B' ? 1.33 : (inputs.fluteType === 'C' ? 1.45 : 1.25); // Simplified flute factor

    const topGsm = parseInt(inputs.topGsm, 10) || 0;
    const flute1Gsm = parseInt(inputs.flute1Gsm, 10) || 0;
    const middleGsm = parseInt(inputs.middleGsm, 10) || 0;
    const flute2Gsm = parseInt(inputs.flute2Gsm, 10) || 0;
    const bottomGsm = parseInt(inputs.bottomGsm, 10) || 0;
    
    let totalGsm = 0;
    let paperWeight = 0;

    const sheetArea = (sheetSizeL * sheetSizeB) / 10000; // in sq. meters

    if (ply === 3) {
      totalGsm = topGsm + flute1Gsm + bottomGsm;
      paperWeight = ((topGsm / 1000) * sheetArea) + ((flute1Gsm / 1000) * sheetArea * fluteFactor) + ((bottomGsm / 1000) * sheetArea);
    } else if (ply === 5) {
      totalGsm = topGsm + flute1Gsm + middleGsm + flute2Gsm + bottomGsm;
       paperWeight = ((topGsm / 1000) * sheetArea) + ((flute1Gsm / 1000) * sheetArea * fluteFactor) + ((middleGsm / 1000) * sheetArea) + ((flute2Gsm / 1000) * sheetArea * fluteFactor) + ((bottomGsm / 1000) * sheetArea);
    } else { // Simplified for other plies
      totalGsm = topGsm + bottomGsm + ((ply - 2) * flute1Gsm); // Approximation
      paperWeight = (totalGsm/1000) * sheetArea;
    }
    
    const wastage = parseFloat(inputs.wastagePercent) / 100 || 0;
    const totalBoxWeight = paperWeight * (1 + wastage);
    
    const paperRate = parseFloat(inputs.paperRate) || 0;
    const paperCost = totalBoxWeight * paperRate;
    
    const gumCost = (paperWeight * (ply - 1) / 2) * (parseFloat(inputs.gumRate) || 0); // Simplified gum calculation
    const stitchingCost = parseFloat(inputs.stitchingRate) || 0;
    
    const totalCost = paperCost + gumCost + stitchingCost;

    return {
      sheetSizeL: sheetSizeL.toFixed(2),
      sheetSizeB: sheetSizeB.toFixed(2),
      sheetArea: sheetArea.toFixed(4),
      totalGsm,
      paperWeight: paperWeight.toFixed(4),
      totalBoxWeight: totalBoxWeight.toFixed(4),
      paperCost: paperCost.toFixed(2),
      gumCost: gumCost.toFixed(2),
      stitchingCost: stitchingCost.toFixed(2),
      totalCost: totalCost.toFixed(2),
    };

  }, [inputs]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setInputs(prev => ({ ...prev, [name]: value }));
  };

  const handleSelectChange = (name: string, value: string) => {
    setInputs(prev => ({...prev, [name]: value}));
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <>
      <div className="flex flex-col gap-8">
        <header>
          <h1 className="text-3xl font-bold tracking-tight">Advanced Cost Report</h1>
          <p className="text-muted-foreground">Select a product or enter details to calculate box cost based on the new formula.</p>
        </header>

        <div className="grid grid-cols-1 gap-6">
            <Card>
              <CardHeader><CardTitle>Product &amp; Size</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="product-select">Select Product (Optional)</Label>
                  <Select onValueChange={setSelectedProductId} value={selectedProductId}>
                    <SelectTrigger id="product-select"><SelectValue placeholder="Select a product..." /></SelectTrigger>
                    <SelectContent>{products.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                 <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-2">
                    <Label htmlFor="l">L (cm)</Label>
                    <Input id="l" name="l" type="number" value={inputs.l} onChange={handleInputChange} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="b">B (cm)</Label>
                    <Input id="b" name="b" type="number" value={inputs.b} onChange={handleInputChange} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="h">H (cm)</Label>
                    <Input id="h" name="h" type="number" value={inputs.h} onChange={handleInputChange} />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
                <CardHeader><CardTitle>Paper Specification</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-3 gap-2">
                        <div className="space-y-2"><Label htmlFor="ply">Ply</Label><Input id="ply" name="ply" type="number" value={inputs.ply} onChange={handleInputChange} /></div>
                        <div className="space-y-2"><Label htmlFor="fluteType">Flute</Label>
                          <Select onValueChange={(v) => handleSelectChange('fluteType',v)} value={inputs.fluteType}>
                            <SelectTrigger><SelectValue/></SelectTrigger>
                            <SelectContent><SelectItem value="A">A</SelectItem><SelectItem value="B">B</SelectItem><SelectItem value="C">C</SelectItem><SelectItem value="E">E</SelectItem><SelectItem value="F">F</SelectItem></SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2"><Label htmlFor="paperBf">BF</Label><Input id="paperBf" name="paperBf" type="number" value={inputs.paperBf} onChange={handleInputChange} /></div>
                    </div>
                    <Label>GSM Layers (Top to Bottom)</Label>
                    <div className="grid grid-cols-5 gap-2">
                       <div className="space-y-1"><Label className="text-xs">Top</Label><Input name="topGsm" type="number" value={inputs.topGsm} onChange={handleInputChange} /></div>
                       <div className="space-y-1"><Label className="text-xs">Flute 1</Label><Input name="flute1Gsm" type="number" value={inputs.flute1Gsm} onChange={handleInputChange} /></div>
                       <div className="space-y-1"><Label className="text-xs">Middle</Label><Input name="middleGsm" type="number" value={inputs.middleGsm} onChange={handleInputChange} disabled={inputs.ply !== '5'}/></div>
                       <div className="space-y-1"><Label className="text-xs">Flute 2</Label><Input name="flute2Gsm" type="number" value={inputs.flute2Gsm} onChange={handleInputChange} disabled={inputs.ply !== '5'}/></div>
                       <div className="space-y-1"><Label className="text-xs">Bottom</Label><Input name="bottomGsm" type="number" value={inputs.bottomGsm} onChange={handleInputChange} /></div>
                    </div>
                </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Costs &amp; Wastage</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                 <div className="space-y-2">
                  <Label htmlFor="paperRate">Paper Rate (per KG)</Label>
                  <Input id="paperRate" name="paperRate" type="number" value={inputs.paperRate} onChange={handleInputChange} />
                </div>
                 <div className="space-y-2">
                  <Label htmlFor="gumRate">Gum Rate (per KG of paper)</Label>
                  <Input id="gumRate" name="gumRate" type="number" value={inputs.gumRate} onChange={handleInputChange} />
                </div>
                 <div className="space-y-2">
                  <Label htmlFor="stitchingRate">Stitching/Pasting (per box)</Label>
                  <Input id="stitchingRate" name="stitchingRate" type="number" value={inputs.stitchingRate} onChange={handleInputChange} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="wastagePercent">Wastage (%)</Label>
                  <Input id="wastagePercent" name="wastagePercent" type="number" value={inputs.wastagePercent} onChange={handleInputChange} />
                </div>
              </CardContent>
            </Card>
        </div>
      </div>
    </>
  );
}
