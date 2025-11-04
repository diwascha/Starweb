
'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import type { Product, Party, PartyType, CostReport, CostReportItem, ProductSpecification } from '@/lib/types';
import { onProductsUpdate, addProduct as addProductService, updateProduct as updateProductService, deleteProduct as deleteProductService } from '@/services/product-service';
import { onPartiesUpdate, addParty, updateParty } from '@/services/party-service';
import { onCostReportsUpdate, addCostReport, deleteCostReport, generateNextCostReportNumber, getCostReport, updateCostReport } from '@/services/cost-report-service';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Printer, Loader2, Plus, Trash2, ChevronsUpDown, Check, PlusCircle, Edit, Save, MoreHorizontal, Search, ArrowUpDown } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
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
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';


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
  products: Product[];
  onProductAdd: () => void;
}


function CostReportCalculator({ reportToEdit, onSaveSuccess, onCancelEdit, products, onProductAdd }: CostReportCalculatorProps) {
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
  const [selectedForPrint, setSelectedForPrint] = useState<Set<string>>(new Set());

  const { toast } = useToast();
  const { user } = useAuth();
  
  const [isPartyDialogOpen, setIsPartyDialogOpen] = useState(false);
  const [partyForm, setPartyForm] = useState<{ name: string; type: PartyType; address?: string; panNumber?: string; }>({ name: '', type: 'Customer', address: '', panNumber: '' });
  const [editingParty, setEditingParty] = useState<Party | null>(null);
  
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);


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

    let totalGsmForCalc = 0;
    if (ply === 3) {
        totalGsmForCalc = topGsm + (flute1Gsm * fluteFactor) + bottomGsm;
    } else if (ply === 5) {
        totalGsmForCalc = topGsm + (flute1Gsm * fluteFactor) + middleGsm + (flute2Gsm * fluteFactor) + bottomGsm;
    }

    const paperWeightInGrams = (sheetArea * totalGsmForCalc) * noOfPcs;
    
    const wastage = parseFloat(item.wastagePercent) / 100 || 0;
    const totalBoxWeightInGrams = paperWeightInGrams * (1 + wastage);
    const totalBoxWeightInKg = totalBoxWeightInGrams / 1000;

    let paperRate = 0;
    
    if (item.paperType === 'VIRGIN' && globalVirginCost > 0) {
        paperRate = globalVirginCost;
    } else if (item.paperType === 'VIRGIN & KRAFT' && topGsm > 0 && globalVirginCost > 0) {
        const totalGsm = topGsm + (flute1Gsm * 1.38) + (ply === 5 ? middleGsm + (flute2Gsm * 1.38) : 0) + bottomGsm;
        if (totalGsm > 0) {
            paperRate = (topGsm * globalVirginCost + (totalGsm - topGsm) * globalKraftCost) / totalGsm;
        } else {
             paperRate = globalKraftCost;
        }
    } else { // Default to KRAFT
        paperRate = globalKraftCost;
    }
    
    const finalPaperRate = paperRate + globalConversionCost;
    const paperCost = totalBoxWeightInKg * finalPaperRate;
    
    return { sheetSizeL, sheetSizeB, sheetArea, totalGsm: totalGsmForCalc, paperWeight: paperWeightInGrams, totalBoxWeight: totalBoxWeightInGrams, paperRate: finalPaperRate, paperCost };
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
    const unsubParties = onPartiesUpdate(setParties);
    const unsubCostReports = onCostReportsUpdate(setCostReports);
    return () => {
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
      setSelectedForPrint(new Set(reportToEdit.items.map(i => i.id)));
    } else {
        generateNextCostReportNumber(costReports).then(setReportNumber);
        setReportDate(new Date());
        setSelectedPartyId('');
        const kCost = Number(kraftPaperCost) || 0;
        const vCost = Number(virginPaperCost) || 0;
        const cCost = Number(conversionCost) || 0;
        setItems([]);
        setSelectedForPrint(new Set());
    }
  }, [reportToEdit, costReports, calculateItemCost, kraftPaperCost, virginPaperCost, conversionCost]);


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
            paperBf: spec.paperBf || '',
            topGsm: spec.topGsm || '',
            flute1Gsm: spec.flute1Gsm || '',
            middleGsm: spec.middleGsm || '',
            flute2Gsm: spec.flute2Gsm || '',
            bottomGsm: spec.bottomGsm || '',
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
    setSelectedForPrint(prev => new Set(prev).add(newItem.id));
  };
  
  const handleRemoveItem = (id: string) => {
    setItems(prev => prev.filter(item => item.id !== id));
    setSelectedForPrint(prev => {
        const newSet = new Set(prev);
        newSet.delete(id);
        return newSet;
    });
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
  
  const handlePrintPreview = () => {
    const itemsToPrint = items.filter(item => selectedForPrint.has(item.id));
    if (itemsToPrint.length === 0) {
        toast({ title: "Cannot Print", description: "Please select at least one item to print.", variant: "destructive" });
        return;
    }
    if (!selectedPartyId) {
        toast({ title: "Cannot Print", description: "Please select a party before printing.", variant: "destructive" });
        return;
    }
    setIsPreviewOpen(true);
  };
  
  const doActualPrint = () => {
    const printableArea = printRef.current;
    if (!printableArea) return;

    const printWindow = window.open('', '', 'height=800,width=800');
    printWindow?.document.write('<html><head><title>Cost Report</title>');
    printWindow?.document.write('<style>@media print{@page{size: auto;margin: 20mm;}body{margin: 0;}}</style>');
    printWindow?.document.write('</head><body>');
    printWindow?.document.write(printableArea.innerHTML);
    printWindow?.document.write('</body></html>');
    printWindow?.document.close();
    printWindow?.focus();
    setTimeout(() => {
        printWindow?.print();
        printWindow?.close();
    }, 250);
  };

  const itemsToPrint = items.filter(item => selectedForPrint.has(item.id));
  const totalCostOfPrintedItems = itemsToPrint.reduce((sum, item) => sum + (item.calculated?.paperCost || 0), 0);
  const selectedParty = parties.find(p => p.id === selectedPartyId);

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
                                <TableHead rowSpan={2} className="w-[50px] align-bottom">
                                    <div className="flex items-center">
                                        <Checkbox
                                            checked={selectedForPrint.size === items.length && items.length > 0}
                                            onCheckedChange={(checked) => {
                                                if (checked) {
                                                    setSelectedForPrint(new Set(items.map(i => i.id)));
                                                } else {
                                                    setSelectedForPrint(new Set());
                                                }
                                            }}
                                            aria-label="Select all rows"
                                            className="mr-2"
                                        />
                                        Sl.No
                                    </div>
                                </TableHead>
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
                                <TableHead rowSpan={2} className="w-[50px] align-bottom"></TableHead>
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
                                    <div className="flex items-center">
                                         <Checkbox
                                            checked={selectedForPrint.has(item.id)}
                                            onCheckedChange={(checked) => {
                                                setSelectedForPrint(prev => {
                                                    const newSet = new Set(prev);
                                                    if (checked) newSet.add(item.id);
                                                    else newSet.delete(item.id);
                                                    return newSet;
                                                });
                                            }}
                                            aria-label={`Select row ${index + 1}`}
                                            className="mr-2"
                                        />
                                        {index + 1}
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <Popover>
                                        <PopoverTrigger asChild>
                                            <Button variant="outline" role="combobox" className="w-[200px] justify-between">
                                                {item.productId ? products.find(p => p.id === item.productId)?.name : "Select product..."}
                                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="p-0 w-[--radix-popover-trigger-width]">
                                            <Command>
                                                <CommandInput placeholder="Search products..." />
                                                <CommandList>
                                                    <CommandEmpty>
                                                        <Button variant="ghost" className="w-full justify-start" onClick={onProductAdd}><PlusCircle className="mr-2 h-4 w-4" /> Add New Product</Button>
                                                    </CommandEmpty>
                                                    <CommandGroup>
                                                        {products.map(p => (
                                                            <CommandItem key={p.id} value={p.name} onSelect={() => handleProductSelect(index, p.id)}>
                                                                <Check className={cn("mr-2 h-4 w-4", item.productId === p.id ? "opacity-100" : "opacity-0")} />
                                                                {p.name}
                                                            </CommandItem>
                                                        ))}
                                                    </CommandGroup>
                                                </CommandList>
                                            </Command>
                                        </PopoverContent>
                                    </Popover>
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
                                 <TableCell>
                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleRemoveItem(item.id)}>
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
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
            <Button variant="outline" onClick={handlePrintPreview}><Printer className="mr-2 h-4 w-4" /> Print</Button>
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
      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="max-w-6xl">
          <DialogHeader>
            <DialogTitle>Quotation Preview</DialogTitle>
            <DialogDescription>Review the quotation before printing.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[70vh] overflow-auto p-4 bg-gray-100">
             <div ref={printRef} className="bg-white text-black p-8 font-sans text-sm space-y-6 w-[210mm] mx-auto">
                 <header className="text-center space-y-1">
                    <h1 className="text-2xl font-bold">SHIVAM PACKAGING INDUSTRIES PVT LTD.</h1>
                    <p className="text-lg">HETAUDA 08, BAGMATI PROVIENCE, NEPAL</p>
                    <h2 className="text-xl font-semibold underline mt-2">QUOTATION</h2>
                </header>
                
                <div className="grid grid-cols-2 text-xs">
                    {selectedParty && (
                        <div>
                            <p className="font-bold">To,</p>
                            <p>{selectedParty.name}</p>
                            {selectedParty.address && <p>{selectedParty.address}</p>}
                        </div>
                    )}
                    <div className="text-right">
                        <p><span className="font-semibold">Ref No:</span> {reportNumber}</p>
                        <p><span className="font-semibold">Date:</span> {toNepaliDate(reportDate.toISOString())} BS ({format(reportDate, "PPP")})</p>
                    </div>
                </div>

              <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead className="text-black font-semibold">Sl.No</TableHead>
                        <TableHead className="text-black font-semibold">Particulars</TableHead>
                        <TableHead className="text-black font-semibold">Box Size (mm)</TableHead>
                        <TableHead className="text-black font-semibold">Ply</TableHead>
                        <TableHead className="text-black font-semibold">Paper</TableHead>
                        <TableHead className="text-black font-semibold text-right">Box Wt (Grams)</TableHead>
                        <TableHead className="text-black font-semibold text-right">Box Rate/Piece</TableHead>
                        <TableHead className="text-black font-semibold text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {itemsToPrint.map((item, index) => (
                    <TableRow key={item.id}>
                      <TableCell>{index + 1}</TableCell>
                      <TableCell>
                          <div>{products.find(p => p.id === item.productId)?.name || 'N/A'}</div>
                          <div className="text-xs text-muted-foreground">{`T:${item.topGsm}, F1:${item.flute1Gsm}, ${item.ply === '5' ? `M:${item.middleGsm}, F2:${item.flute2Gsm}, `: ''}B:${item.bottomGsm}`}</div>
                      </TableCell>
                      <TableCell>{`${item.l}x${item.b}x${item.h}`}</TableCell>
                      <TableCell>{item.ply}</TableCell>
                      <TableCell>{item.paperType}</TableCell>
                      <TableCell className="text-right">{item.calculated.totalBoxWeight.toFixed(2)}</TableCell>
                      <TableCell className="text-right">{item.calculated.paperRate.toFixed(2)}</TableCell>
                      <TableCell className="text-right">{item.calculated.paperCost.toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                    <TableRow className="font-bold text-base">
                        <TableCell colSpan={7} className="text-right">Total</TableCell>
                        <TableCell className="text-right">{totalCostOfPrintedItems.toFixed(2)}</TableCell>
                    </TableRow>
                </TableFooter>
              </Table>

                <footer className="pt-8 text-xs space-y-4">
                    <div className="font-semibold">Terms & Conditions:</div>
                    <ul className="list-disc list-inside space-y-1">
                        <li>VAT 13% will be extra.</li>
                        <li>Weight tolerance will be +/- 10%.</li>
                        <li>The rates are valid for 7 days from the date of this quotation.</li>
                    </ul>
                    <div className="pt-12">
                        <p className="border-t border-gray-400 w-48">Authorized Signature</p>
                    </div>
                </footer>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPreviewOpen(false)}>Cancel</Button>
            <Button onClick={doActualPrint}><Printer className="mr-2 h-4 w-4" /> Print</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SavedReportsList({ onEdit }: { onEdit: (report: CostReport) => void }) {
    const [reports, setReports] = useState<CostReport[]>([]);
    const { toast } = useToast();
    const [products, setProducts] = useState<Product[]>([]);
    const [parties, setParties] = useState<Party[]>([]);

    const [isPreviewOpen, setIsPreviewOpen] = useState(false);
    const [reportToPrint, setReportToPrint] = useState<CostReport | null>(null);
    const printRef = useRef<HTMLDivElement>(null);


    useEffect(() => {
        const unsub = onCostReportsUpdate(setReports);
        const unsubProducts = onProductsUpdate(setProducts);
        const unsubParties = onPartiesUpdate(setParties);
        return () => {
            unsub();
            unsubProducts();
            unsubParties();
        }
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
        setReportToPrint(report);
        setIsPreviewOpen(true);
    }
    
    const doActualPrint = () => {
        const printableArea = printRef.current;
        if (!printableArea) return;

        const printWindow = window.open('', '', 'height=800,width=800');
        printWindow?.document.write('<html><head><title>Cost Report</title>');
        printWindow?.document.write('<style>@media print{@page{size: auto;margin: 20mm;}body{margin: 0;}}</style>');
        printWindow?.document.write('</head><body>');
        printWindow?.document.write(printableArea.innerHTML);
        printWindow?.document.write('</body></html>');
        printWindow?.document.close();
        printWindow?.focus();
        setTimeout(() => {
            printWindow?.print();
            printWindow?.close();
        }, 250);
    };

    const calculateItemCost = useCallback((item: Omit<CostReportItem, 'id' | 'calculated' | 'productId'>, report: CostReport): CalculatedValues => {
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
        let totalGsmForCalc = 0;
        if (ply === 3) totalGsmForCalc = topGsm + (flute1Gsm * fluteFactor) + bottomGsm;
        else if (ply === 5) totalGsmForCalc = topGsm + (flute1Gsm * fluteFactor) + middleGsm + (flute2Gsm * fluteFactor) + bottomGsm;
        const paperWeightInGrams = (sheetArea * totalGsmForCalc) * noOfPcs;
        const wastage = parseFloat(item.wastagePercent) / 100 || 0;
        const totalBoxWeightInGrams = paperWeightInGrams * (1 + wastage);
        const totalBoxWeightInKg = totalBoxWeightInGrams / 1000;
        let paperRate = 0;
        if (item.paperType === 'VIRGIN' && report.virginPaperCost > 0) paperRate = report.virginPaperCost;
        else if (item.paperType === 'VIRGIN & KRAFT' && topGsm > 0 && report.virginPaperCost > 0) {
            const totalGsm = topGsm + (flute1Gsm * 1.38) + (ply === 5 ? middleGsm + (flute2Gsm * 1.38) : 0) + bottomGsm;
            if (totalGsm > 0) paperRate = (topGsm * report.virginPaperCost + (totalGsm - topGsm) * report.kraftPaperCost) / totalGsm;
            else paperRate = report.kraftPaperCost;
        } else paperRate = report.kraftPaperCost;
        const finalPaperRate = paperRate + report.conversionCost;
        const paperCost = totalBoxWeightInKg * finalPaperRate;
        return { sheetSizeL, sheetSizeB, sheetArea, totalGsm: totalGsmForCalc, paperWeight: paperWeightInGrams, totalBoxWeight: totalBoxWeightInGrams, paperRate: finalPaperRate, paperCost };
    }, []);

    const printableReportItems = useMemo(() => {
        if (!reportToPrint) return [];
        return reportToPrint.items.map(item => ({ ...item, calculated: calculateItemCost(item, reportToPrint) }))
    }, [reportToPrint, calculateItemCost]);
    
    const printableTotalCost = useMemo(() => {
        return printableReportItems.reduce((sum, item) => sum + item.calculated.paperCost, 0);
    }, [printableReportItems]);


    return (
        <>
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
        
        <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
            <DialogContent className="max-w-6xl">
              <DialogHeader>
                <DialogTitle>Quotation Preview</DialogTitle>
                <DialogDescription>Review the quotation before printing.</DialogDescription>
              </DialogHeader>
              {reportToPrint && (
                  <>
                  <div className="max-h-[70vh] overflow-auto p-4 bg-gray-100">
                     <div ref={printRef} className="bg-white text-black p-8 font-sans text-sm space-y-6 w-[210mm] mx-auto">
                         <header className="text-center space-y-1">
                            <h1 className="text-2xl font-bold">SHIVAM PACKAGING INDUSTRIES PVT LTD.</h1>
                            <p className="text-lg">HETAUDA 08, BAGMATI PROVIENCE, NEPAL</p>
                            <h2 className="text-xl font-semibold underline mt-2">QUOTATION</h2>
                        </header>
                        <div className="grid grid-cols-2 text-xs">
                            <div>
                                <p className="font-bold">To,</p>
                                <p>{reportToPrint.partyName}</p>
                                <p>{parties.find(p => p.id === reportToPrint.partyId)?.address}</p>
                            </div>
                            <div className="text-right">
                                <p><span className="font-semibold">Ref No:</span> {reportToPrint.reportNumber}</p>
                                <p><span className="font-semibold">Date:</span> {toNepaliDate(reportToPrint.reportDate)} BS ({format(new Date(reportToPrint.reportDate), "PPP")})</p>
                            </div>
                        </div>
                        <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="text-black font-semibold">Sl.No</TableHead>
                                <TableHead className="text-black font-semibold">Particulars</TableHead>
                                <TableHead className="text-black font-semibold">Box Size (mm)</TableHead>
                                <TableHead className="text-black font-semibold">Ply</TableHead>
                                <TableHead className="text-black font-semibold">Paper</TableHead>
                                <TableHead className="text-black font-semibold text-right">Box Wt (Grams)</TableHead>
                                <TableHead className="text-black font-semibold text-right">Box Rate/Piece</TableHead>
                                <TableHead className="text-black font-semibold text-right">Total</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {printableReportItems.map((item, index) => (
                            <TableRow key={item.id}>
                                <TableCell>{index + 1}</TableCell>
                                <TableCell>
                                    <div>{products.find(p => p.id === item.productId)?.name || 'N/A'}</div>
                                    <div className="text-xs text-muted-foreground">{`T:${item.topGsm}, F1:${item.flute1Gsm}, ${item.ply === '5' ? `M:${item.middleGsm}, F2:${item.flute2Gsm}, `: ''}B:${item.bottomGsm}`}</div>
                                </TableCell>
                                <TableCell>{`${item.l}x${item.b}x${item.h}`}</TableCell>
                                <TableCell>{item.ply}</TableCell>
                                <TableCell>{item.paperType}</TableCell>
                                <TableCell className="text-right">{item.calculated.totalBoxWeight.toFixed(2)}</TableCell>
                                <TableCell className="text-right">{item.calculated.paperRate.toFixed(2)}</TableCell>
                                <TableCell className="text-right">{item.calculated.paperCost.toFixed(2)}</TableCell>
                            </TableRow>
                            ))}
                        </TableBody>
                         <TableFooter>
                            <TableRow className="font-bold text-base">
                                <TableCell colSpan={7} className="text-right">Total</TableCell>
                                <TableCell className="text-right">{printableTotalCost.toFixed(2)}</TableCell>
                            </TableRow>
                        </TableFooter>
                        </Table>
                         <footer className="pt-8 text-xs space-y-4">
                            <div className="font-semibold">Terms & Conditions:</div>
                            <ul className="list-disc list-inside space-y-1">
                                <li>VAT 13% will be extra.</li>
                                <li>Weight tolerance will be +/- 10%.</li>
                                <li>The rates are valid for 7 days from the date of this quotation.</li>
                            </ul>
                            <div className="pt-12">
                                <p className="border-t border-gray-400 w-48">Authorized Signature</p>
                            </div>
                        </footer>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsPreviewOpen(false)}>Cancel</Button>
                    <Button onClick={doActualPrint}><Printer className="mr-2 h-4 w-4" /> Print</Button>
                  </DialogFooter>
                </>
              )}
            </DialogContent>
        </Dialog>
      </>
    );
}

function ProductList({ onProductAdd, onProductEdit }: { onProductAdd: () => void, onProductEdit: (product: Product) => void }) {
    const [products, setProducts] = useState<Product[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterPartyName, setFilterPartyName] = useState('All');
    const [sortConfig, setSortConfig] = useState<{ key: keyof Product | 'gsm' | 'bf'; direction: 'asc' | 'desc' }>({ key: 'name', direction: 'asc' });
    const { toast } = useToast();
    const { user } = useAuth();
    
    useEffect(() => {
        const unsub = onProductsUpdate(setProducts);
        return () => unsub();
    }, []);

    const requestSort = (key: keyof Product | 'gsm' | 'bf') => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };
    
    const getSortableValue = (product: Product, key: keyof Product | 'gsm' | 'bf') => {
        if (key === 'gsm') {
            return product.specification?.topGsm || '';
        }
        if (key === 'bf') {
            return product.specification?.paperBf || '';
        }
        return product[key as keyof Product] ?? '';
    };

    const uniquePartyNames = useMemo(() => {
        const names = new Set(products.map(p => p.partyName).filter(Boolean));
        return ['All', ...Array.from(names).sort()];
    }, [products]);

    const sortedProducts = useMemo(() => {
        let sortable = [...products];

        if (filterPartyName !== 'All') {
            sortable = sortable.filter(p => p.partyName === filterPartyName);
        }

        if (searchQuery) {
            sortable = sortable.filter(p => 
                p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                (p.specification?.dimension || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                (p.materialCode || '').toLowerCase().includes(searchQuery.toLowerCase())
            );
        }
        
        sortable.sort((a, b) => {
            const aVal = getSortableValue(a, sortConfig.key);
            const bVal = getSortableValue(b, sortConfig.key);
            
            if (typeof aVal === 'number' && typeof bVal === 'number') {
                return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal;
            }
            
            const strA = String(aVal).toLowerCase();
            const strB = String(bVal).toLowerCase();

            if (strA < strB) return sortConfig.direction === 'asc' ? -1 : 1;
            if (strA > strB) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
        return sortable;
    }, [products, sortConfig, searchQuery, filterPartyName]);

    const formatGsm = (spec: Product['specification']) => {
        if (!spec) return 'N/A';
        if (spec.topGsm) {
            return `${spec.topGsm}/${spec.flute1Gsm}/${spec.middleGsm ? `${spec.middleGsm}/${spec.flute2Gsm}/` : ''}${spec.bottomGsm}`;
        }
        return 'N/A';
    };

    return (
        <>
            <Card>
                <CardHeader>
                    <div className="flex justify-between items-center">
                        <div>
                            <CardTitle>Products for Costing</CardTitle>
                            <CardDescription>A list of products available in the cost calculator.</CardDescription>
                        </div>
                         <div className="flex items-center gap-2">
                            <Select value={filterPartyName} onValueChange={setFilterPartyName}>
                                <SelectTrigger className="w-[180px]">
                                    <SelectValue placeholder="Filter by party..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {uniquePartyNames.map(party => (
                                        <SelectItem key={party} value={party}>{party}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <div className="relative">
                                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Search products..."
                                    className="pl-8 w-full sm:w-[250px]"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                />
                            </div>
                            <Button onClick={onProductAdd}>
                                <PlusCircle className="mr-2 h-4 w-4" /> Add Product
                            </Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead><Button variant="ghost" onClick={() => requestSort('name')}>Product Name <ArrowUpDown className="ml-2 h-4 w-4 inline-block" /></Button></TableHead>
                                <TableHead>Material Code</TableHead>
                                <TableHead><Button variant="ghost" onClick={() => requestSort('partyName')}>Party Name <ArrowUpDown className="ml-2 h-4 w-4 inline-block" /></Button></TableHead>
                                <TableHead>Dimension</TableHead>
                                <TableHead>Ply</TableHead>
                                <TableHead><Button variant="ghost" onClick={() => requestSort('gsm')}>GSM</Button></TableHead>
                                <TableHead><Button variant="ghost" onClick={() => requestSort('bf')}>BF</Button></TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {sortedProducts.map(product => (
                                <TableRow key={product.id}>
                                    <TableCell>{product.name}</TableCell>
                                    <TableCell>{product.materialCode}</TableCell>
                                    <TableCell>{product.partyName}</TableCell>
                                    <TableCell>{product.specification?.dimension || 'N/A'}</TableCell>
                                    <TableCell>{product.specification?.ply || 'N/A'}</TableCell>
                                    <TableCell>{formatGsm(product.specification)}</TableCell>
                                    <TableCell>{product.specification?.paperBf || 'N/A'}</TableCell>
                                    <TableCell className="text-right">
                                        <Button variant="ghost" size="icon" onClick={() => onProductEdit(product)}>
                                            <Edit className="h-4 w-4" />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </>
    );
}

export default function CostReportPage() {
    const [activeTab, setActiveTab] = useState("calculator");
    const [reportToEdit, setReportToEdit] = useState<CostReport | null>(null);
    const [products, setProducts] = useState<Product[]>([]);
    const [parties, setParties] = useState<Party[]>([]);
    
    // State for the product dialog
    const [isProductDialogOpen, setIsProductDialogOpen] = useState(false);
    const [productToEdit, setProductToEdit] = useState<Product | null>(null);
    const [productForm, setProductForm] = useState<Partial<Product> & { l?: string, b?: string, h?: string }>({ specification: {} });
    const { toast } = useToast();
    const { user } = useAuth();
    
    const relevantSpecFields: (keyof ProductSpecification)[] = ['ply', 'paperBf', 'topGsm', 'flute1Gsm', 'middleGsm', 'flute2Gsm', 'bottomGsm', 'printing'];
    
    useEffect(() => {
        const unsubProducts = onProductsUpdate(setProducts);
        const unsubParties = onPartiesUpdate(setParties);
        return () => {
          unsubProducts();
          unsubParties();
        }
    }, []);
    
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
    
    const handleOpenProductDialog = (product: Product | null = null) => {
        if (product) {
            setProductToEdit(product);
            const spec: Partial<ProductSpecification> = {};
            relevantSpecFields.forEach(field => {
                spec[field] = product.specification?.[field] || '';
            });
            
            const [l, b, h] = product.specification?.dimension?.split('x') || ['', '', ''];

            setProductForm({ ...product, specification: spec, l, b, h });
        } else {
            setProductToEdit(null);
            const spec: Partial<ProductSpecification> = {};
            relevantSpecFields.forEach(field => {
                spec[field] = '';
            });
            setProductForm({ name: '', materialCode: '', partyId: '', partyName: '', specification: spec, l: '', b: '', h: '' });
        }
        setIsProductDialogOpen(true);
    };

    const handleSaveProduct = async () => {
        if (!user) return;
        
        const { l, b, h, ...restOfForm } = productForm;
        const dimension = (l || b || h) ? `${l || '0'}x${b || '0'}x${h || '0'}` : '';

        const finalSpec: Partial<ProductSpecification> = { dimension };

        for(const key in restOfForm.specification) {
            if(relevantSpecFields.includes(key as keyof ProductSpecification)) {
                finalSpec[key as keyof ProductSpecification] = restOfForm.specification[key as keyof ProductSpecification];
            }
        }
        
        const party = parties.find(p => p.id === restOfForm.partyId);

        try {
            if (productToEdit) {
                 await updateProductService(productToEdit.id, {
                    name: restOfForm.name,
                    materialCode: restOfForm.materialCode,
                    partyId: restOfForm.partyId,
                    partyName: party?.name || '',
                    specification: finalSpec,
                    lastModifiedBy: user.username,
                });
                toast({ title: 'Success', description: 'Product updated.' });
            } else {
                await addProductService({
                    name: restOfForm.name,
                    materialCode: restOfForm.materialCode,
                    partyId: restOfForm.partyId,
                    partyName: party?.name || '',
                    specification: finalSpec,
                    createdBy: user.username,
                    createdAt: new Date().toISOString()
                } as Omit<Product, 'id'>);
                toast({ title: 'Success', description: 'New product added.' });
            }
            
            setIsProductDialogOpen(false);
            setProductToEdit(null);
        } catch (error) {
            toast({ title: 'Error', description: 'Failed to save product.', variant: 'destructive' });
        }
    };
    
    const handleProductFormChange = (field: keyof Omit<typeof productForm, 'specification'>, value: any) => {
        setProductForm(prev => ({ ...prev, [field]: value }));
    };

    const handleSpecChange = (field: keyof ProductSpecification, value: string) => {
        setProductForm(prev => ({
            ...prev,
            specification: {
                ...(prev.specification as ProductSpecification),
                [field]: value
            },
        }));
    };

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
                    <TabsTrigger value="products">Products</TabsTrigger>
                </TabsList>
                <TabsContent value="calculator" className="pt-4">
                    <CostReportCalculator 
                        reportToEdit={reportToEdit} 
                        onSaveSuccess={handleFinishEditing} 
                        onCancelEdit={handleCancelEdit}
                        products={products}
                        onProductAdd={() => handleOpenProductDialog(null)}
                    />
                </TabsContent>
                <TabsContent value="saved" className="pt-4">
                    <SavedReportsList onEdit={handleEditReport} />
                </TabsContent>
                <TabsContent value="products" className="pt-4">
                    <ProductList 
                      onProductAdd={() => handleOpenProductDialog(null)}
                      onProductEdit={(product) => handleOpenProductDialog(product)}
                    />
                </TabsContent>
            </Tabs>

            <Dialog open={isProductDialogOpen} onOpenChange={setIsProductDialogOpen}>
                <DialogContent className="max-w-xl">
                    <DialogHeader>
                        <DialogTitle>{productToEdit ? 'Edit Product' : 'Add New Product'}</DialogTitle>
                    </DialogHeader>
                    <ScrollArea className="max-h-[70vh]">
                        <div className="py-4 px-6 space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="product-name">Product Name</Label>
                                    <Input id="product-name" value={productForm.name || ''} onChange={(e) => handleProductFormChange('name', e.target.value)} />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="material-code">Material Code</Label>
                                    <Input id="material-code" value={productForm.materialCode || ''} onChange={(e) => handleProductFormChange('materialCode', e.target.value)} />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="partyId">Party Name</Label>
                                 <Select value={productForm.partyId} onValueChange={(value) => handleProductFormChange('partyId', value)}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select a party" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {parties.map(p => (
                                            <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <Separator />
                            <h4 className="font-semibold">Specification</h4>
                             <div className="space-y-2">
                                <Label>Dimension</Label>
                                <div className="flex gap-2">
                                    <Input placeholder="L" type="number" value={productForm.l} onChange={e => handleProductFormChange('l', e.target.value)} />
                                    <Input placeholder="B" type="number" value={productForm.b} onChange={e => handleProductFormChange('b', e.target.value)} />
                                    <Input placeholder="H" type="number" value={productForm.h} onChange={e => handleProductFormChange('h', e.target.value)} />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                {relevantSpecFields.map(key => (
                                        <div key={key} className="space-y-2">
                                            <Label htmlFor={`spec-${key}`}>{key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1')}</Label>
                                            <Input
                                                id={`spec-${key}`}
                                                value={productForm.specification?.[key] || ''}
                                                onChange={(e) => handleSpecChange(key, e.target.value)}
                                            />
                                        </div>
                                ))}
                            </div>
                        </div>
                    </ScrollArea>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsProductDialogOpen(false)}>Cancel</Button>
                        <Button onClick={handleSaveProduct}>{productToEdit ? 'Save Changes' : 'Add Product'}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

    