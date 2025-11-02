
'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import type { Product, Party, PartyType, CostReport, CostReportItem } from '@/lib/types';
import { onProductsUpdate } from '@/services/product-service';
import { onPartiesUpdate, addParty, updateParty } from '@/services/party-service';
import { onCostReportsUpdate, addCostReport, deleteCostReport, generateNextCostReportNumber, getCostReport, updateCostReport } from '@/services/cost-report-service';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Printer, Loader2, Plus, Trash2, ChevronsUpDown, Check, PlusCircle, Edit, Save, MoreHorizontal } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon } from 'lucide-react';
import { DualCalendar } from '@/components/ui/dual-calendar';
import { cn, toNepaliDate } from '@/lib/utils';
import { format } from 'date-fns';
import { useAuth } from '@/hooks/use-auth';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { AnnapurnaSIL } from '@/lib/fonts/AnnapurnaSIL-Regular-base64';
import { AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';


interface CalculatedValues {
    sheetSizeL: number;
    sheetSizeB: number;
    sheetArea: number;
    totalGsm: number;
    paperWeight: number;
    totalBoxWeight: number;
    paperRate: number;
    paperCost: number;
}

const initialCalculatedState: CalculatedValues = {
    sheetSizeL: 0, sheetSizeB: 0, sheetArea: 0, totalGsm: 0, paperWeight: 0, totalBoxWeight: 0, paperRate: 0, paperCost: 0
};

interface CostReportCalculatorProps {
  reportToEdit: CostReport | null;
  onSaveSuccess: () => void;
  onCancelEdit: () => void;
}


function CostReportCalculator({ reportToEdit, onSaveSuccess, onCancelEdit }: CostReportCalculatorProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [costReports, setCostReports] = useState<CostReport[]>([]);
  const [selectedPartyId, setSelectedPartyId] = useState<string>('');
  const [reportNumber, setReportNumber] = useState('CR-001');
  const [reportDate, setReportDate] = useState<Date>(new Date());
  
  const [kraftPaperCost, setKraftPaperCost] = useState<number | ''>(13.118);
  const [virginPaperCost, setVirginPaperCost] = useState<number | ''>('');
  const [conversionCost, setConversionCost] = useState<number | ''>(1);
  const [isSaving, setIsSaving] = useState(false);
  const [items, setItems] = useState<CostReportItem[]>([]);

  const { toast } = useToast();
  const { user } = useAuth();
  
  const [isPartyDialogOpen, setIsPartyDialogOpen] = useState(false);
  const [partyForm, setPartyForm] = useState<{ name: string; type: PartyType; address?: string; panNumber?: string; }>({ name: '', type: 'Customer', address: '', panNumber: '' });
  const [editingParty, setEditingParty] = useState<Party | null>(null);

  const calculateItemCost = useCallback((item: Omit<CostReportItem, 'id' | 'calculated' | 'productId'>, globalKraftCost: number, globalVirginCost: number, globalConversionCost: number): CalculatedValues => {
    const l = parseFloat(item.l) || 0;
    const b = parseFloat(item.b) || 0;
    const h = parseFloat(item.h) || 0;
    const noOfPcs = parseInt(item.noOfPcs, 10) || 0;
    const ply = parseInt(item.ply, 10) || 0;
    
    if (l === 0 || b === 0 || h === 0 || ply === 0 || noOfPcs === 0) return initialCalculatedState;

    const sheetSizeL = b + h + 20;
    const sheetSizeB = (2 * l) + (2 * b) + 62;

    const fluteFactor = 1.38;

    const topGsm = parseInt(item.topGsm, 10) || 0;
    const flute1Gsm = parseInt(item.flute1Gsm, 10) || 0;
    const middleGsm = parseInt(item.middleGsm, 10) || 0;
    const flute2Gsm = parseInt(item.flute2Gsm, 10) || 0;
    const bottomGsm = parseInt(item.bottomGsm, 10) || 0;
    
    const sheetArea = (sheetSizeL * sheetSizeB) / 1000000;

    let totalGsm = 0;
    if (ply === 3) {
      totalGsm = topGsm + (flute1Gsm * fluteFactor) + bottomGsm;
    } else if (ply === 5) {
      totalGsm = topGsm + (flute1Gsm * fluteFactor) + middleGsm + (flute2Gsm * fluteFactor) + bottomGsm;
    }
    
    const paperWeightInGrams = (sheetArea * totalGsm) * noOfPcs;
    
    const wastage = parseFloat(item.wastagePercent) / 100 || 0;
    const totalBoxWeightInGrams = paperWeightInGrams * (1 + wastage);
    const totalBoxWeightInKg = totalBoxWeightInGrams / 1000;

    let paperRate = 0;
    
    if (item.paperType === 'KRAFT') {
        paperRate = globalKraftCost + globalConversionCost;
    } else if (item.paperType === 'VIRGIN' && globalVirginCost > 0) {
        paperRate = globalVirginCost + globalConversionCost;
    } else if (item.paperType === 'VIRGIN & KRAFT' && totalGsm > 0 && globalVirginCost > 0) {
        const topLayerWeightGsm = topGsm;
        const topLayerRatio = topLayerWeightGsm / totalGsm;
        
        const kraftLayersWeightGsm = totalGsm - topLayerWeightGsm;
        const kraftLayerRatio = kraftLayersWeightGsm / totalGsm;

        if (!isNaN(topLayerRatio) && !isNaN(kraftLayerRatio)) {
          const blendedRate = (globalVirginCost * topLayerRatio) + (globalKraftCost * kraftLayerRatio);
          paperRate = blendedRate + globalConversionCost;
        } else {
          paperRate = globalKraftCost + globalConversionCost;
        }
    } else {
        paperRate = globalKraftCost + globalConversionCost;
    }
    
    const paperCost = totalBoxWeightInKg * paperRate;
    
    return { sheetSizeL, sheetSizeB, sheetArea, totalGsm, paperWeight: paperWeightInGrams, totalBoxWeight: totalBoxWeightInGrams, paperRate, paperCost };
  }, []);

  useEffect(() => {
    const kCost = Number(kraftPaperCost) || 0;
    const vCost = Number(virginPaperCost) || 0;
    const cCost = Number(conversionCost) || 0;
    
    setItems(prevItems => prevItems.map(item => ({
        ...item,
        calculated: calculateItemCost(item, kCost, vCost, cCost)
    })));
  }, [kraftPaperCost, virginPaperCost, conversionCost, calculateItemCost]);


  useEffect(() => {
    const unsubProducts = onProductsUpdate(setProducts);
    const unsubParties = onPartiesUpdate(setParties);
    const unsubCostReports = onCostReportsUpdate(setCostReports);
    return () => {
        unsubProducts();
        unsubParties();
        unsubCostReports();
    };
  }, []);
  
  useEffect(() => {
    if (reportToEdit) {
      setReportNumber(reportToEdit.reportNumber);
      setReportDate(new Date(reportToEdit.reportDate));
      setSelectedPartyId(reportToEdit.partyId);
      setKraftPaperCost(reportToEdit.kraftPaperCost);
      setVirginPaperCost(reportToEdit.virginPaperCost);
      setConversionCost(reportToEdit.conversionCost);
      const kCost = reportToEdit.kraftPaperCost || 0;
      const vCost = reportToEdit.virginPaperCost || 0;
      const cCost = reportToEdit.conversionCost || 0;
      setItems(reportToEdit.items.map(item => ({...item, id: item.id || Date.now().toString(), calculated: calculateItemCost(item, kCost, vCost, cCost)})));
    } else {
        generateNextCostReportNumber(costReports).then(setReportNumber);
        setReportDate(new Date());
        setSelectedPartyId('');
        const kCost = Number(kraftPaperCost) || 0;
        const vCost = Number(virginPaperCost) || 0;
        const cCost = Number(conversionCost) || 0;
        setItems([]);
    }
  }, [reportToEdit, costReports, calculateItemCost]);


  const handleProductSelect = (index: number, productId: string) => {
    const product = products.find(p => p.id === productId);
    if (!product) return;
    
    const spec = product.specification;
    const [l,b,h] = spec.dimension?.split('x') || ['','',''];
    
    const kCost = Number(kraftPaperCost) || 0;
    const vCost = Number(virginPaperCost) || 0;
    const cCost = Number(conversionCost) || 0;

    setItems(prevItems => {
        const newItems = [...prevItems];
        const updatedItem = {
            ...newItems[index],
            productId: product.id,
            l: l || '', b: b || '', h: h || '',
            ply: spec.ply || '3',
        };
        newItems[index] = {
            ...updatedItem,
            calculated: calculateItemCost(updatedItem, kCost, vCost, cCost)
        };
        return newItems;
    });
  };

  const handleItemChange = (index: number, field: keyof Omit<CostReportItem, 'id' | 'calculated'>, value: string) => {
    const kCost = Number(kraftPaperCost) || 0;
    const vCost = Number(virginPaperCost) || 0;
    const cCost = Number(conversionCost) || 0;

    setItems(prevItems => {
        const newItems = [...prevItems];
        const currentItem = { ...newItems[index], [field]: value };
        const newCalculated = calculateItemCost(currentItem, kCost, vCost, cCost);
        newItems[index] = { ...currentItem, calculated: newCalculated };
        return newItems;
    });
  };

  const handleAddItem = () => {
    const kCost = Number(kraftPaperCost) || 0;
    const vCost = Number(virginPaperCost) || 0;
    const cCost = Number(conversionCost) || 0;
    const newItem = { id: Date.now().toString(), productId: '', l:'',b:'',h:'', noOfPcs:'1', boxType: 'RSC', ply:'3', fluteType: 'B', paperType: 'KRAFT', paperShade:'Golden', paperBf:'18', topGsm:'120',flute1Gsm:'100',middleGsm:'',flute2Gsm:'',bottomGsm:'120',wastagePercent:'3.5' };
    setItems(prev => [...prev, { ...newItem, calculated: calculateItemCost(newItem, kCost, vCost, cCost) }]);
  };
  
  const handleRemoveItem = (id: string) => {
    setItems(prev => prev.filter(item => item.id !== id));
  };
  
  const totalItemCost = useMemo(() => {
    return items.reduce((sum, item) => sum + (item.calculated?.paperCost || 0), 0);
  }, [items]);
  
  const handleOpenPartyDialog = (partyToEdit: Party | null = null, searchName: string = '') => {
    if (partyToEdit) {
        setEditingParty(partyToEdit);
        setPartyForm({ name: partyToEdit.name, type: partyToEdit.type, address: partyToEdit.address || '', panNumber: partyToEdit.panNumber || '' });
    } else {
        setEditingParty(null);
        setPartyForm({ name: searchName, type: 'Customer', address: '', panNumber: '' });
    }
    setIsPartyDialogOpen(true);
  };
  
  const handleSubmitParty = async () => {
    if (!user) return;
    if (!partyForm.name) {
        toast({ title: 'Error', description: 'Party name is required.', variant: 'destructive' });
        return;
    }
    try {
        if (editingParty) {
            await updateParty(editingParty.id, { ...partyForm, lastModifiedBy: user.username });
            toast({ title: 'Success', description: 'Party updated.' });
        } else {
            const newPartyId = await addParty({ ...partyForm, createdBy: user.username });
            setSelectedPartyId(newPartyId);
            toast({ title: 'Success', description: 'New party added.' });
        }
        setIsPartyDialogOpen(false);
    } catch {
        toast({ title: 'Error', description: 'Failed to save party.', variant: 'destructive' });
    }
  };

  const handleSaveReport = async () => {
      if (!user || !selectedPartyId) {
          toast({ title: "Error", description: "Please select a party before saving.", variant: "destructive" });
          return;
      }
      setIsSaving(true);
      try {
           const reportData: Omit<CostReport, 'id' | 'createdAt'> = {
              reportNumber,
              reportDate: reportDate.toISOString(),
              partyId: selectedPartyId,
              partyName: parties.find(p => p.id === selectedPartyId)?.name || '',
              kraftPaperCost: Number(kraftPaperCost) || 0,
              virginPaperCost: Number(virginPaperCost) || 0,
              conversionCost: Number(conversionCost) || 0,
              items: items.map(({ calculated, ...item }) => item),
              totalCost: totalItemCost,
              createdBy: user.username,
          };

          if (reportToEdit) {
              await updateCostReport(reportToEdit.id, {...reportData, lastModifiedBy: user.username});
              toast({ title: "Success", description: "Cost report updated." });
          } else {
              await addCostReport(reportData);
              toast({ title: "Success", description: "Cost report saved successfully." });
          }
          onSaveSuccess();
      } catch (error) {
          toast({ title: "Error", description: "Failed to save the report.", variant: "destructive" });
      } finally {
          setIsSaving(false);
      }
  };
  
  const handlePrint = async () => {
    if (!selectedPartyId) {
        toast({ title: "Cannot Print", description: "Please select a party before printing.", variant: "destructive" });
        return;
    }
    const doc = new jsPDF();
    
    doc.addFileToVFS("AnnapurnaSIL.ttf", AnnapurnaSIL);
    doc.addFont("AnnapurnaSIL.ttf", "AnnapurnaSIL", "normal");
    
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('Cost Report', doc.internal.pageSize.getWidth() / 2, 15, { align: 'center' });
    
    doc.setFontSize(10);
    doc.setFont('Helvetica', 'normal');
    doc.text(`Report No: ${reportNumber}`, 14, 30);
    doc.text(`Party: ${parties.find(p => p.id === selectedPartyId)?.name || ''}`, 14, 35);
    doc.text(`Date: ${toNepaliDate(reportDate.toISOString())}`, doc.internal.pageSize.getWidth() - 14, 30, { align: 'right' });
    
    (doc as any).autoTable({
        startY: 45,
        head: [['Sl.No', 'Item Name', 'Box Size (LxBxH)', 'Ply', 'Total', 'Box Rate/Piece']],
        body: items.map((item, index) => [
            index + 1,
            products.find(p => p.id === item.productId)?.name || 'N/A',
            `${item.l}x${item.b}x${item.h}`,
            item.ply,
            item.calculated.paperCost.toFixed(2),
            item.calculated.paperRate.toFixed(2),
        ]),
        theme: 'grid',
        footStyles: { fontStyle: 'bold' },
        foot: [
            [{ content: 'Total', colSpan: 4, styles: { halign: 'right' } }, totalItemCost.toFixed(2), ''],
        ]
    });
    
    doc.save(`CostReport-${reportNumber}.pdf`);
  };


  return (
    <div className="flex flex-col gap-8">
        {reportToEdit && (
            <div className="flex justify-between items-center bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 p-4" role="alert">
                <p className="font-bold">Editing Report #{reportToEdit.reportNumber}</p>
                <Button variant="ghost" onClick={onCancelEdit}>Cancel Edit</Button>
            </div>
        )}
      
        <Card>
            <CardHeader>
                <CardTitle>Report Details</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-6">
                 <div className="space-y-2">
                    <Label htmlFor="reportNumber">Report Number</Label>
                    <Input id="reportNumber" value={reportNumber} readOnly className="bg-muted/50" />
                 </div>
                 <div className="space-y-2">
                    <Label htmlFor="reportDate">Report Date</Label>
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button variant={"outline"} className={cn("w-full justify-start text-left font-normal", !reportDate && "text-muted-foreground")}>
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {reportDate ? `${toNepaliDate(reportDate.toISOString())} BS (${format(reportDate, "PPP")})` : <span>Pick a date</span>}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                            <DualCalendar selected={reportDate} onSelect={(d) => d && setReportDate(d)} />
                        </PopoverContent>
                    </Popover>
                 </div>
                 <div className="space-y-2">
                    <Label htmlFor="party-select">Party Name</Label>
                    <div className="flex gap-2">
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button variant="outline" role="combobox" className="w-full justify-between">
                                    {selectedPartyId ? parties.find(p => p.id === selectedPartyId)?.name : "Select party..."}
                                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="p-0 w-[--radix-popover-trigger-width]">
                                <Command>
                                    <CommandInput placeholder="Search party..." />
                                    <CommandList>
                                        <CommandEmpty>
                                             <Button variant="ghost" className="w-full justify-start" onClick={() => handleOpenPartyDialog(null, '')}><PlusCircle className="mr-2 h-4 w-4" /> Add New Party</Button>
                                        </CommandEmpty>
                                        <CommandGroup>
                                            {parties.map(p => (
                                                <CommandItem key={p.id} value={p.name} onSelect={() => setSelectedPartyId(p.id)} className="flex justify-between">
                                                    <div>
                                                        <Check className={cn("mr-2 h-4 w-4", selectedPartyId === p.id ? "opacity-100" : "opacity-0")} />
                                                        {p.name}
                                                    </div>
                                                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => {e.stopPropagation(); handleOpenPartyDialog(p)}}><Edit className="h-3 w-3"/></Button>
                                                </CommandItem>
                                            ))}
                                        </CommandGroup>
                                    </CommandList>
                                </Command>
                            </PopoverContent>
                        </Popover>
                    </div>
                 </div>
            </CardContent>
        </Card>

        <Card>
            <CardHeader>
                <CardTitle>Additional Costs</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-3 grid grid-cols-1 sm:grid-cols-3 gap-6">
                        <div className="space-y-2">
                            <Label htmlFor="kraftPaperCost">Kraft Paper Cost</Label>
                            <Input id="kraftPaperCost" type="number" placeholder="Enter cost" value={kraftPaperCost} onChange={e => setKraftPaperCost(e.target.value === '' ? '' : parseFloat(e.target.value))} />
                        </div>
                         <div className="space-y-2">
                            <Label htmlFor="virginPaperCost">Virgin Paper Cost</Label>
                            <Input id="virginPaperCost" type="number" placeholder="Enter cost" value={virginPaperCost} onChange={e => setVirginPaperCost(e.target.value === '' ? '' : parseFloat(e.target.value))} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="conversionCost">Conversion Cost</Label>
                            <Input id="conversionCost" type="number" placeholder="Enter cost" value={conversionCost} onChange={e => setConversionCost(e.target.value === '' ? '' : parseFloat(e.target.value))} />
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
        
        <Card>
            <CardHeader>
                <CardTitle>Product Cost Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead rowSpan={2} className="w-[50px] align-bottom">Sl.No</TableHead>
                                <TableHead rowSpan={2} className="min-w-[200px] align-bottom">Item Name</TableHead>
                                <TableHead colSpan={3} className="text-center">Box Size</TableHead>
                                <TableHead rowSpan={2} className="align-bottom">No of Pcs</TableHead>
                                <TableHead rowSpan={2} className="align-bottom">Box Type</TableHead>
                                <TableHead rowSpan={2} className="align-bottom">No of Ply</TableHead>
                                <TableHead rowSpan={2} className="align-bottom">Type of Flute</TableHead>
                                <TableHead rowSpan={2} className="align-bottom">Paper Type</TableHead>
                                <TableHead rowSpan={2} className="align-bottom">Paper Shade</TableHead>
                                <TableHead rowSpan={2} className="align-bottom">Paper BF</TableHead>
                                <TableHead colSpan={5} className="text-center">GSM</TableHead>
                                <TableHead rowSpan={2} className="align-bottom min-w-[100px]">Total Gsm</TableHead>
                                <TableHead rowSpan={2} className="align-bottom min-w-[100px]">R. Size (cm)</TableHead>
                                <TableHead rowSpan={2} className="align-bottom min-w-[100px]">C. Size (cm)</TableHead>
                                <TableHead rowSpan={2} className="align-bottom min-w-[100px]">Box Wt Grams</TableHead>
                                <TableHead rowSpan={2} className="align-bottom min-w-[100px]">Waste 3.5%</TableHead>
                                <TableHead rowSpan={2} className="align-bottom min-w-[100px]">Total Box Wt</TableHead>
                                <TableHead rowSpan={2} className="align-bottom min-w-[100px]">Box Rate/ Piece</TableHead>
                                <TableHead rowSpan={2} className="align-bottom min-w-[120px]">Total</TableHead>
                            </TableRow>
                            <TableRow>
                                <TableHead>L</TableHead>
                                <TableHead>B</TableHead>
                                <TableHead>H</TableHead>
                                <TableHead>T</TableHead>
                                <TableHead>F1</TableHead>
                                <TableHead>M</TableHead>
                                <TableHead>F2</TableHead>
                                <TableHead>B</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                        {items.map((item, index) => (
                            <TableRow key={item.id}>
                                <TableCell>
                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleRemoveItem(item.id)}>
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </TableCell>
                                <TableCell>
                                    <Select onValueChange={(v) => handleProductSelect(index, v)} value={item.productId}>
                                        <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                                        <SelectContent>{products.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                                    </Select>
                                </TableCell>
                                <TableCell><Input type="number" value={item.l} onChange={e => handleItemChange(index, 'l', e.target.value)} className="w-16" /></TableCell>
                                <TableCell><Input type="number" value={item.b} onChange={e => handleItemChange(index, 'b', e.target.value)} className="w-16" /></TableCell>
                                <TableCell><Input type="number" value={item.h} onChange={e => handleItemChange(index, 'h', e.target.value)} className="w-16" /></TableCell>
                                <TableCell><Input type="number" value={item.noOfPcs} onChange={e => handleItemChange(index, 'noOfPcs', e.target.value)} className="w-16" /></TableCell>
                                <TableCell><Input value={item.boxType} onChange={e => handleItemChange(index, 'boxType', e.target.value)} className="w-20" /></TableCell>
                                <TableCell><Input type="number" value={item.ply} onChange={e => handleItemChange(index, 'ply', e.target.value)} className="w-16" /></TableCell>
                                <TableCell><Input value={item.fluteType} onChange={e => handleItemChange(index, 'fluteType', e.target.value)} className="w-16" /></TableCell>
                                <TableCell>
                                    <Select
                                        value={item.paperType}
                                        onValueChange={(value) => handleItemChange(index, 'paperType', value)}
                                    >
                                        <SelectTrigger className="w-32">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="KRAFT">KRAFT</SelectItem>
                                            <SelectItem value="VIRGIN">VIRGIN</SelectItem>
                                            <SelectItem value="VIRGIN & KRAFT">VIRGIN & KRAFT</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </TableCell>
                                <TableCell><Input value={item.paperShade} onChange={e => handleItemChange(index, 'paperShade', e.target.value)} className="w-24" /></TableCell>
                                <TableCell><Input value={item.paperBf} onChange={e => handleItemChange(index, 'paperBf', e.target.value)} className="w-16" /></TableCell>
                                <TableCell><Input type="number" value={item.topGsm} onChange={e => handleItemChange(index, 'topGsm', e.target.value)} className="w-20" /></TableCell>
                                <TableCell><Input type="number" value={item.flute1Gsm} onChange={e => handleItemChange(index, 'flute1Gsm', e.target.value)} className="w-20" /></TableCell>
                                <TableCell><Input type="number" value={item.middleGsm} onChange={e => handleItemChange(index, 'middleGsm', e.target.value)} className="w-20" disabled={item.ply !== '5'}/></TableCell>
                                <TableCell><Input type="number" value={item.flute2Gsm} onChange={e => handleItemChange(index, 'flute2Gsm', e.target.value)} className="w-20" disabled={item.ply !== '5'}/></TableCell>
                                <TableCell><Input type="number" value={item.bottomGsm} onChange={e => handleItemChange(index, 'bottomGsm', e.target.value)} className="w-20" /></TableCell>
                                <TableCell>{item.calculated.totalGsm.toFixed(2)}</TableCell>
                                <TableCell>{(item.calculated.sheetSizeL / 10).toFixed(2)}</TableCell>
                                <TableCell>{(item.calculated.sheetSizeB / 10).toFixed(2)}</TableCell>
                                <TableCell>{item.calculated.paperWeight.toFixed(2)}</TableCell>
                                <TableCell>{((item.calculated.paperWeight * (parseFloat(item.wastagePercent) / 100 || 0))).toFixed(2)}</TableCell>
                                <TableCell>{(item.calculated.totalBoxWeight).toFixed(2)}</TableCell>
                                <TableCell>{item.calculated.paperRate.toFixed(2)}</TableCell>
                                <TableCell className="font-bold">
                                    {item.calculated.paperCost > 0 ? item.calculated.paperCost.toFixed(2) : '...'}
                                </TableCell>
                            </TableRow>
                        ))}
                        </TableBody>
                    </Table>
                </div>
                 <div className="flex justify-between items-center mt-4">
                    <Button variant="outline" size="sm" onClick={handleAddItem}><Plus className="mr-2 h-4 w-4" />Add Another Product</Button>
                    <div className="text-right">
                        <span className="text-sm font-medium text-muted-foreground">Total Cost: </span>
                        <span className="text-xl font-bold">{totalItemCost.toFixed(2)}</span>
                    </div>
                </div>
            </CardContent>
            
        </Card>

        <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={handlePrint}><Printer className="mr-2 h-4 w-4" /> Print</Button>
            <Button onClick={handleSaveReport} disabled={isSaving}>
                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                {reportToEdit ? 'Save Changes' : 'Save Report'}
            </Button>
        </div>
      
       <Dialog open={isPartyDialogOpen} onOpenChange={setIsPartyDialogOpen}>
          <DialogContent className="sm:max-w-md">
              <DialogHeader>
                  <DialogTitle>{editingParty ? 'Edit Party' : 'Add New Party'}</DialogTitle>
                   <DialogDescription>
                      {editingParty ? 'Update the details for this party.' : 'Create a new customer/vendor record.'}
                  </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                  <div className="space-y-2">
                      <Label htmlFor="party-name-dialog">Party Name</Label>
                      <Input id="party-name-dialog" value={partyForm.name} onChange={e => setPartyForm(p => ({...p, name: e.target.value}))} />
                  </div>
                   <div className="space-y-2">
                      <Label htmlFor="party-type-dialog">Party Type</Label>
                      <Select value={partyForm.type} onValueChange={(v: PartyType) => setPartyForm(p => ({...p, type: v}))}>
                          <SelectTrigger id="party-type-dialog"><SelectValue/></SelectTrigger>
                          <SelectContent>
                              <SelectItem value="Vendor">Vendor</SelectItem>
                              <SelectItem value="Customer">Customer</SelectItem>
                              <SelectItem value="Both">Both</SelectItem>
                          </SelectContent>
                      </Select>
                  </div>
                  <div className="space-y-2">
                      <Label htmlFor="party-pan-dialog">PAN Number</Label>
                      <Input id="party-pan-dialog" value={partyForm.panNumber || ''} onChange={e => setPartyForm(p => ({...p, panNumber: e.target.value}))} />
                  </div>
                  <div className="space-y-2">
                      <Label htmlFor="party-address-dialog">Address</Label>
                      <Textarea id="party-address-dialog" value={partyForm.address || ''} onChange={e => setPartyForm(p => ({...p, address: e.target.value}))} />
                  </div>
              </div>
              <DialogFooter>
                  <Button variant="outline" onClick={() => setIsPartyDialogOpen(false)}>Cancel</Button>
                  <Button onClick={handleSubmitParty}>{editingParty ? 'Save Changes' : 'Add Party'}</Button>
              </DialogFooter>
          </DialogContent>
      </Dialog>
    </div>
  );
}

function SavedReportsList({ onEdit }: { onEdit: (report: CostReport) => void }) {
    const [reports, setReports] = useState<CostReport[]>([]);
    const { toast } = useToast();

    useEffect(() => {
        const unsub = onCostReportsUpdate(setReports);
        return () => unsub();
    }, []);

    const handleDelete = async (id: string) => {
        try {
            await deleteCostReport(id);
            toast({ title: "Success", description: "Cost report deleted." });
        } catch {
            toast({ title: "Error", description: "Failed to delete report.", variant: "destructive" });
        }
    };
    
    const handlePrintFromSaved = async (reportId: string) => {
        const report = await getCostReport(reportId);
        if (!report) {
            toast({ title: "Error", description: "Could not find report to print.", variant: "destructive" });
            return;
        }

        const doc = new jsPDF();
        doc.addFileToVFS("AnnapurnaSIL.ttf", AnnapurnaSIL);
        doc.addFont("AnnapurnaSIL.ttf", "AnnapurnaSIL", "normal");
        
        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(16);
        doc.text('Cost Report', doc.internal.pageSize.getWidth() / 2, 15, { align: 'center' });
        
        doc.setFontSize(10);
        doc.setFont('Helvetica', 'normal');
        doc.text(`Report No: ${report.reportNumber}`, 14, 30);
        doc.text(`Party: ${report.partyName}`, 14, 35);
        doc.text(`Date: ${toNepaliDate(report.reportDate)}`, doc.internal.pageSize.getWidth() - 14, 30, { align: 'right' });
        
        // This part needs product data which isn't stored in the cost report, so we show 'N/A'
        (doc as any).autoTable({
            startY: 45,
            head: [['Sl.No', 'Item Name', 'Box Size (LxBxH)', 'Ply', 'Total']],
            body: report.items.map((item, index) => [
                index + 1,
                'N/A', // Product name isn't stored with the report item
                `${item.l}x${item.b}x${item.h}`,
                item.ply,
                'N/A', // Cost per item isn't stored, just total
            ]),
            theme: 'grid',
            footStyles: { fontStyle: 'bold' },
            foot: [
                [{ content: 'Total', colSpan: 4, styles: { halign: 'right' } }, report.totalCost.toFixed(2)],
            ]
        });
        
        doc.save(`CostReport-${report.reportNumber}.pdf`);
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Saved Cost Reports</CardTitle>
                <CardDescription>A log of all previously generated cost reports.</CardDescription>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Report #</TableHead>
                            <TableHead>Date</TableHead>
                            <TableHead>Party Name</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {reports.length > 0 ? reports.map(report => (
                            <TableRow key={report.id}>
                                <TableCell>{report.reportNumber}</TableCell>
                                <TableCell>{toNepaliDate(report.reportDate)}</TableCell>
                                <TableCell>{report.partyName}</TableCell>
                                <TableCell className="text-right">
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent>
                                            <DropdownMenuItem onSelect={() => onEdit(report)}>
                                                <Edit className="mr-2 h-4 w-4" /> Edit
                                            </DropdownMenuItem>
                                            <DropdownMenuItem onSelect={() => handlePrintFromSaved(report.id)}>
                                                <Printer className="mr-2 h-4 w-4" /> Print
                                            </DropdownMenuItem>
                                             <AlertDialog>
                                                <AlertDialogTrigger asChild>
                                                    <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-destructive">
                                                         <Trash2 className="mr-2 h-4 w-4" /> Delete
                                                    </DropdownMenuItem>
                                                </AlertDialogTrigger>
                                                <AlertDialogContent>
                                                    <AlertDialogHeader>
                                                        <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                                        <AlertDialogDescription>This action cannot be undone and will permanently delete this cost report.</AlertDialogDescription>
                                                    </AlertDialogHeader>
                                                    <AlertDialogFooter>
                                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                        <AlertDialogAction onClick={() => handleDelete(report.id)}>Delete</AlertDialogAction>
                                                    </AlertDialogFooter>
                                                </AlertDialogContent>
                                            </AlertDialog>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </TableCell>
                            </TableRow>
                        )) : (
                            <TableRow>
                                <TableCell colSpan={4} className="text-center">No saved reports found.</TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    );
}

export default function CostReportPage() {
    const [activeTab, setActiveTab] = useState("calculator");
    const [reportToEdit, setReportToEdit] = useState<CostReport | null>(null);
    
    const handleEditReport = (report: CostReport) => {
        setReportToEdit(report);
        setActiveTab("calculator");
    };

    const handleFinishEditing = () => {
        setReportToEdit(null);
        setActiveTab("saved");
    };

    const handleCancelEdit = () => {
        setReportToEdit(null);
    }

    return (
        <div className="flex flex-col gap-8">
            <header>
                <h1 className="text-3xl font-bold tracking-tight">Cost Report Generator</h1>
                <p className="text-muted-foreground">Calculate product costs based on multiple raw materials and specifications.</p>
            </header>
            <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList>
                    <TabsTrigger value="calculator">Calculator</TabsTrigger>
                    <TabsTrigger value="saved">Saved Reports</TabsTrigger>
                </TabsList>
                <TabsContent value="calculator" className="pt-4">
                    <CostReportCalculator 
                        reportToEdit={reportToEdit} 
                        onSaveSuccess={handleFinishEditing} 
                        onCancelEdit={handleCancelEdit}
                    />
                </TabsContent>
                <TabsContent value="saved" className="pt-4">
                    <SavedReportsList onEdit={handleEditReport} />
                </TabsContent>
            </Tabs>
        </div>
    );
}

