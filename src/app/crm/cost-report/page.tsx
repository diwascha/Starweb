
'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import type { Product, Party, PartyType, CostReport, CostReportItem, ProductSpecification, CostSetting, Accessory } from '@/lib/types';
import { onProductsUpdate, addProduct as addProductService, updateProduct as updateProductService, deleteProduct as deleteProductService } from '@/services/product-service';
import { onPartiesUpdate, addParty, updateParty } from '@/services/party-service';
import { onCostReportsUpdate, addCostReport, deleteCostReport, generateNextCostReportNumber, getCostReport, updateCostReport } from '@/services/cost-report-service';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Printer, Loader2, Plus, Trash2, ChevronsUpDown, Check, PlusCircle, Edit, Save, MoreHorizontal, Search, ArrowUpDown, History, Library, HistoryIcon, Paperclip } from 'lucide-react';
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { onSettingUpdate, updateCostSettings } from '@/services/settings-service';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';


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
  
  const [costSettings, setCostSettings] = useState<CostSetting | null>(null);
  const [kraftPaperCost, setKraftPaperCost] = useState<number | ''>('');
  const [virginPaperCost, setVirginPaperCost] = useState<number | ''>('');
  const [conversionCost, setConversionCost] = useState<number | ''>('');
  const [isCostHistoryDialogOpen, setIsCostHistoryDialogOpen] = useState(false);

  const [isSaving, setIsSaving] = useState(false);
  const [items, setItems] = useState<CostReportItem[]>([]);
  const [selectedForPrint, setSelectedForPrint] = useState<Set<string>>(new Set());

  const { toast } = useToast();
  const { user } = useAuth();
  
  const [isPartyDialogOpen, setIsPartyDialogOpen] = useState(false);
  const [partyForm, setPartyForm] = useState<{ name: string; type: PartyType; address?: string; panNumber?: string; }>({ name: '', type: 'Customer', address: '', panNumber: '' });
  const [editingParty, setEditingParty] = useState<Party | null>(null);
  const [partySearch, setPartySearch] = useState('');
  
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  const [isLoadProductsDialogOpen, setIsLoadProductsDialogOpen] = useState(false);
  const [productsToLoad, setProductsToLoad] = useState<Set<string>>(new Set());
  const [loadProductPartyFilter, setLoadProductPartyFilter] = useState('All');

  const filteredProductsForLoad = useMemo(() => {
    if (loadProductPartyFilter === 'All') {
        return products;
    }
    return products.filter(p => p.partyName === loadProductPartyFilter);
  }, [products, loadProductPartyFilter]);
  
  const uniquePartiesForLoad = useMemo(() => ['All', ...Array.from(new Set(products.map(p => p.partyName).filter(Boolean)))], [products]);

  useEffect(() => {
    const unsubCostSettings = onSettingUpdate('costing', (setting) => {
        if (setting?.value) {
            const settings = setting.value as CostSetting;
            setCostSettings(settings);
            if (!reportToEdit) { // Only set from global if it's a new report
                setKraftPaperCost(settings.kraftPaperCost || '');
                setVirginPaperCost(settings.virginPaperCost || '');
                setConversionCost(settings.conversionCost || '');
            }
        }
    });
    return () => unsubCostSettings();
  }, [reportToEdit]);

 const calculateItemCost = useCallback((item: Omit<CostReportItem, 'id' | 'calculated' | 'productId' | 'accessories'>, globalKraftCost: number, globalVirginCost: number, globalConversionCost: number): CalculatedValues => {
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
    const liner2Gsm = parseInt(item.liner2Gsm, 10) || 0;
    const flute3Gsm = parseInt(item.flute3Gsm, 10) || 0;
    const liner3Gsm = parseInt(item.liner3Gsm, 10) || 0;
    const flute4Gsm = parseInt(item.flute4Gsm, 10) || 0;
    const liner4Gsm = parseInt(item.liner4Gsm, 10) || 0;
    
    const sheetArea = (sheetSizeL * sheetSizeB) / 1000000;

    let totalGsmForCalc = 0;
    if (ply === 3) {
        totalGsmForCalc = topGsm + (flute1Gsm * fluteFactor) + bottomGsm;
    } else if (ply === 5) {
        totalGsmForCalc = topGsm + (flute1Gsm * fluteFactor) + middleGsm + (flute2Gsm * fluteFactor) + bottomGsm;
    } else if (ply === 7) {
        totalGsmForCalc = topGsm + (flute1Gsm * fluteFactor) + liner2Gsm + (flute2Gsm * fluteFactor) + liner3Gsm + (flute3Gsm * fluteFactor) + bottomGsm;
    } else if (ply === 9) {
        totalGsmForCalc = topGsm + (flute1Gsm * fluteFactor) + liner2Gsm + (flute2Gsm * fluteFactor) + liner3Gsm + (flute3Gsm * fluteFactor) + liner4Gsm + (flute4Gsm * fluteFactor) + bottomGsm;
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

  const handleCostChange = (costType: 'kraft' | 'virgin' | 'conversion', value: string) => {
    const numericValue = value === '' ? '' : parseFloat(value);
    if (costType === 'kraft') setKraftPaperCost(numericValue);
    else if (costType === 'virgin') setVirginPaperCost(numericValue);
    else if (costType === 'conversion') setConversionCost(numericValue);
  }

  useEffect(() => {
    const kCost = Number(kraftPaperCost) || 0;
    const vCost = Number(virginPaperCost) || 0;
    const cCost = Number(conversionCost) || 0;
    
    setItems(prevItems => prevItems.map(item => ({
        ...item,
        calculated: calculateItemCost(item, kCost, vCost, cCost),
        accessories: (item.accessories || []).map(acc => ({
            ...acc,
            calculated: calculateItemCost(acc, kCost, vCost, cCost)
        }))
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
      setItems(reportToEdit.items.map(item => ({
          ...item, 
          id: item.id || Date.now().toString(), 
          calculated: calculateItemCost(item, kCost, vCost, cCost),
          accessories: (item.accessories || []).map(acc => ({
              ...acc,
              id: acc.id || Date.now().toString(),
              calculated: calculateItemCost(acc, kCost, vCost, cCost)
          }))
      })));
      setSelectedForPrint(new Set(reportToEdit.items.map(i => i.id)));
    } else {
        generateNextCostReportNumber(costReports).then(setReportNumber);
        setReportDate(new Date());
        setSelectedPartyId('');
        const kCost = Number(costSettings?.kraftPaperCost) || 0;
        const vCost = Number(costSettings?.virginPaperCost) || 0;
        const cCost = Number(costSettings?.conversionCost) || 0;
        setItems([]);
        setSelectedForPrint(new Set());
    }
  }, [reportToEdit, costReports, calculateItemCost, costSettings]);


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
            boxType: spec.boxType || 'RSC',
            topGsm: spec.topGsm || '',
            flute1Gsm: spec.flute1Gsm || '',
            middleGsm: spec.middleGsm || '',
            flute2Gsm: spec.flute2Gsm || '',
            bottomGsm: spec.bottomGsm || '',
            liner2Gsm: spec.liner2Gsm || '',
            flute3Gsm: spec.flute3Gsm || '',
            liner3Gsm: spec.liner3Gsm || '',
            flute4Gsm: spec.flute4Gsm || '',
            liner4Gsm: spec.liner4Gsm || '',
        };
        newItems[index] = {
            ...updatedItem,
            calculated: calculateItemCost(updatedItem, kCost, vCost, cCost)
        };
        return newItems;
    });
  };

  const handleItemChange = (index: number, field: keyof Omit<CostReportItem, 'id' | 'calculated' | 'accessories'>, value: string) => {
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
  
    const addItemFromProduct = (product: Product) => {
        const spec = product.specification;
        const [l, b, h] = spec.dimension?.split('x') || ['', '', ''];

        const kCost = Number(kraftPaperCost) || 0;
        const vCost = Number(virginPaperCost) || 0;
        const cCost = Number(conversionCost) || 0;

        const newItemBase = {
            id: Date.now().toString() + product.id,
            productId: product.id,
            l: l || '', b: b || '', h: h || '',
            noOfPcs: '1',
            ply: spec.ply || '3',
            paperType: 'KRAFT',
            paperBf: spec.paperBf || '18',
            paperShade: 'NS',
            boxType: 'RSC',
            topGsm: spec.topGsm || '120',
            flute1Gsm: spec.flute1Gsm || '100',
            middleGsm: spec.middleGsm || '',
            flute2Gsm: spec.flute2Gsm || '',
            bottomGsm: spec.bottomGsm || '120',
            liner2Gsm: spec.liner2Gsm || '',
            flute3Gsm: spec.flute3Gsm || '',
            liner3Gsm: spec.liner3Gsm || '',
            flute4Gsm: spec.flute4Gsm || '',
            liner4Gsm: spec.liner4Gsm || '',
            wastagePercent: '3.5',
            accessories: [],
        };
        
        const newItem = { ...newItemBase, calculated: calculateItemCost(newItemBase, kCost, vCost, cCost) };
        setItems(prev => [...prev, newItem]);
        setSelectedForPrint(prev => new Set(prev).add(newItem.id));
    };

  const handleAddItem = () => {
    const kCost = Number(kraftPaperCost) || 0;
    const vCost = Number(virginPaperCost) || 0;
    const cCost = Number(conversionCost) || 0;
    const newItemBase = { id: Date.now().toString(), productId: '', l:'',b:'',h:'', noOfPcs:'1', ply:'3', fluteType: 'B', paperType: 'KRAFT', paperBf:'18', paperShade: 'NS', boxType: 'RSC', topGsm:'120',flute1Gsm:'100',middleGsm:'',flute2Gsm:'',bottomGsm:'120', liner2Gsm: '', flute3Gsm: '', liner3Gsm: '', flute4Gsm: '', liner4Gsm: '', wastagePercent:'3.5', accessories: [] };
    const newItem = { ...newItemBase, calculated: calculateItemCost(newItemBase, kCost, vCost, cCost) };
    setItems(prev => [...prev, newItem]);
    setSelectedForPrint(prev => new Set(prev).add(newItem.id));
  };
  
    const handleLoadProducts = () => {
        productsToLoad.forEach(productId => {
            const product = products.find(p => p.id === productId);
            if (product) {
                addItemFromProduct(product);
            }
        });
        setProductsToLoad(new Set());
        setIsLoadProductsDialogOpen(false);
    };

  const handleRemoveItem = (id: string) => {
    setItems(prev => prev.filter(item => item.id !== id));
    setSelectedForPrint(prev => {
        const newSet = new Set(prev);
        newSet.delete(id);
        return newSet;
    });
  };
  
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
           const kCost = Number(kraftPaperCost) || 0;
           const vCost = Number(virginPaperCost) || 0;
           const cCost = Number(conversionCost) || 0;

           const totalItemCost = items.reduce((sum, item) => {
             const paperCost = item.calculated?.paperCost || 0;
             const accessoriesCost = (item.accessories || []).reduce((accSum, acc) => accSum + (acc.calculated?.paperCost || 0), 0);
             return sum + paperCost + accessoriesCost;
           }, 0);

           const reportData: Omit<CostReport, 'id' | 'createdAt'> = {
              reportNumber,
              reportDate: reportDate.toISOString(),
              partyId: selectedPartyId,
              partyName: parties.find(p => p.id === selectedPartyId)?.name || '',
              kraftPaperCost: kCost,
              virginPaperCost: vCost,
              conversionCost: cCost,
              items: items.map(({ calculated, accessories, ...item }) => ({
                ...item,
                accessories: (accessories || []).map(({ calculated: accCalculated, ...acc }) => acc),
            })),
              totalCost: totalItemCost,
              createdBy: user.username,
          };
          
          await updateCostSettings({
            kraftPaperCost: kCost,
            virginPaperCost: vCost,
            conversionCost: cCost,
          }, user.username);


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

  const itemsToPrint = useMemo(() => {
    return items
      .filter(item => selectedForPrint.has(item.id))
      .map(item => {
        const accessoriesCost = (item.accessories || []).reduce((sum, acc) => sum + (acc.calculated?.paperCost || 0), 0);
        return {
          ...item,
          totalItemCost: (item.calculated?.paperCost || 0) + accessoriesCost,
        };
      });
  }, [items, selectedForPrint]);

  const selectedParty = parties.find(p => p.id === selectedPartyId);
  const [productSearch, setProductSearch] = useState('');

  const GsmDisplay = ({ item }: { item: CostReportItem | Accessory }) => {
    const ply = parseInt(item.ply, 10);
    
    const parts = [
        {label: 'T', value: item.topGsm},
        {label: 'F1', value: item.flute1Gsm}
    ];

    if (ply >= 7) parts.push({label: 'L2', value: item.liner2Gsm});
    if (ply >= 5) parts.push({label: 'F2', value: item.flute2Gsm});
    if (ply === 5) parts.push({label: 'M', value: item.middleGsm});
    if (ply >= 7) parts.push({label: 'L3', value: item.liner3Gsm});
    if (ply >= 7) parts.push({label: 'F3', value: item.flute3Gsm});
    if (ply >= 9) parts.push({label: 'L4', value: item.liner4Gsm});
    if (ply >= 9) parts.push({label: 'F4', value: item.flute4Gsm});

    parts.push({label: 'B', value: item.bottomGsm});

    const part1 = parts.slice(0, 4).filter(p => p.value).map(p => `${p.label}:${p.value}`).join(' ');
    const part2 = parts.slice(4).filter(p => p.value).map(p => `${p.label}:${p.value}`).join(' ');

    return (
      <div>
        <div>{part1}</div>
        {part2 && <div>{part2}</div>}
      </div>
    );
  };
  
  const handleAccessoryChange = (itemIndex: number, accIndex: number, field: keyof Accessory, value: string) => {
    const kCost = Number(kraftPaperCost) || 0;
    const vCost = Number(virginPaperCost) || 0;
    const cCost = Number(conversionCost) || 0;

    setItems(prevItems => {
        const newItems = [...prevItems];
        const accessories = [...(newItems[itemIndex].accessories || [])];
        const currentAccessory = { ...accessories[accIndex], [field]: value };
        
        const newCalculated = calculateItemCost(currentAccessory, kCost, vCost, cCost);
        accessories[accIndex] = { ...currentAccessory, calculated: newCalculated };
        newItems[itemIndex] = { ...newItems[itemIndex], accessories };
        return newItems;
    });
  };


  const addAccessory = (itemIndex: number) => {
    const kCost = Number(kraftPaperCost) || 0;
    const vCost = Number(virginPaperCost) || 0;
    const cCost = Number(conversionCost) || 0;
    const newAccessoryBase = {
        id: Date.now().toString(), productId: '', l: '', b: '', h: '', noOfPcs: '1', ply: '3',
        fluteType: 'B', paperType: 'KRAFT', paperBf: '18', paperShade: 'NS', boxType: 'RSC',
        topGsm: '120', flute1Gsm: '100', middleGsm: '', flute2Gsm: '', bottomGsm: '120',
        liner2Gsm: '', flute3Gsm: '', liner3Gsm: '', flute4Gsm: '', liner4Gsm: '', wastagePercent: '3.5', name: 'Accessory'
    };
    const newAccessory = { ...newAccessoryBase, calculated: calculateItemCost(newAccessoryBase, kCost, vCost, cCost) };
    
    setItems(prevItems => {
        const newItems = [...prevItems];
        const accessories = newItems[itemIndex].accessories || [];
        newItems[itemIndex] = {
            ...newItems[itemIndex],
            accessories: [...accessories, newAccessory]
        };
        return newItems;
    });
  };

  const removeAccessory = (itemIndex: number, accId: string) => {
    setItems(prevItems => {
        const newItems = [...prevItems];
        const accessories = (newItems[itemIndex].accessories || []).filter(acc => acc.id !== accId);
        newItems[itemIndex] = { ...newItems[itemIndex], accessories };
        return newItems;
    });
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
                                    <CommandInput 
                                        placeholder="Search party..." 
                                        value={partySearch}
                                        onValueChange={setPartySearch}
                                    />
                                    <CommandList>
                                        <CommandEmpty>
                                            <Button variant="ghost" className="w-full justify-start" onClick={() => handleOpenPartyDialog(null, partySearch)}>
                                                <PlusCircle className="mr-2 h-4 w-4" /> Add "{partySearch}"
                                            </Button>
                                        </CommandEmpty>
                                        <CommandGroup>
                                            {parties.map(p => (
                                                <CommandItem key={p.id} value={p.name} onSelect={() => { setSelectedPartyId(p.id); setPartySearch(''); }} className="flex justify-between">
                                                    <div className="flex items-center">
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
                <div className="flex items-center justify-between">
                    <CardTitle>Additional Costs</CardTitle>
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" onClick={() => setIsCostHistoryDialogOpen(true)}>
                                    <HistoryIcon className="h-5 w-5" />
                                    <span className="sr-only">View Cost History</span>
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                                <p>View Costing History</p>
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                </div>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                    <div className="space-y-2">
                        <Label htmlFor="kraftPaperCost">Kraft Paper Cost</Label>
                        <Input id="kraftPaperCost" type="number" placeholder="Enter cost" value={kraftPaperCost} onChange={e => handleCostChange('kraft', e.target.value)} />
                    </div>
                        <div className="space-y-2">
                        <Label htmlFor="virginPaperCost">Virgin Paper Cost</Label>
                        <Input id="virginPaperCost" type="number" placeholder="Enter cost" value={virginPaperCost} onChange={e => handleCostChange('virgin', e.target.value)} />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="conversionCost">Conversion Cost</Label>
                        <Input id="conversionCost" type="number" placeholder="Enter cost" value={conversionCost} onChange={e => handleCostChange('conversion', e.target.value)} />
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
                                <TableHead rowSpan={2} className="align-bottom">No of Ply</TableHead>
                                <TableHead rowSpan={2} className="align-bottom">Type of Flute</TableHead>
                                <TableHead rowSpan={2} className="align-bottom">Paper Type</TableHead>
                                <TableHead rowSpan={2} className="align-bottom">Paper BF</TableHead>
                                <TableHead colSpan={9} className="text-center">GSM</TableHead>
                                <TableHead rowSpan={2} className="align-bottom min-w-[100px]">Total Gsm</TableHead>
                                <TableHead rowSpan={2} className="align-bottom min-w-[100px]">R. Size (cm)</TableHead>
                                <TableHead rowSpan={2} className="align-bottom min-w-[100px]">C. Size (cm)</TableHead>
                                <TableHead rowSpan={2} className="align-bottom min-w-[100px]">Box Wt Grams</TableHead>
                                <TableHead rowSpan={2} className="align-bottom min-w-[100px]">Waste 3.5%</TableHead>
                                <TableHead rowSpan={2} className="align-bottom min-w-[100px]">Total Box Wt</TableHead>
                                <TableHead rowSpan={2} className="align-bottom min-w-[120px]">Paper Cost</TableHead>
                                <TableHead rowSpan={2} className="align-bottom min-w-[250px]">Accessories</TableHead>
                                <TableHead rowSpan={2} className="w-[50px] align-bottom"></TableHead>
                            </TableRow>
                            <TableRow>
                                <TableHead>L</TableHead>
                                <TableHead>B</TableHead>
                                <TableHead>H</TableHead>
                                <TableHead>T</TableHead>
                                <TableHead>F1</TableHead>
                                <TableHead>L2</TableHead>
                                <TableHead>F2</TableHead>
                                <TableHead>M/L3</TableHead>
                                <TableHead>F3</TableHead>
                                <TableHead>L4</TableHead>
                                <TableHead>F4</TableHead>
                                <TableHead>B</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                        {items.map((item, index) => {
                             const ply = parseInt(item.ply, 10);
                             const accessoriesCost = (item.accessories || []).reduce((sum, acc) => sum + (acc.calculated?.paperCost || 0), 0);
                             const totalItemCost = (item.calculated?.paperCost || 0) + accessoriesCost;
                             return (
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
                                                <CommandInput
                                                    placeholder="Search products..."
                                                    value={productSearch}
                                                    onValueChange={setProductSearch}
                                                />
                                                <CommandList>
                                                    <CommandEmpty>
                                                        <Button variant="ghost" className="w-full justify-start" onClick={() => onProductAdd()}>
                                                          <PlusCircle className="mr-2 h-4 w-4" /> Add "{productSearch}"
                                                        </Button>
                                                    </CommandEmpty>
                                                    <CommandGroup>
                                                        {products.map(p => (
                                                            <CommandItem key={p.id} value={p.name} onSelect={() => { handleProductSelect(index, p.id); setProductSearch(''); }}>
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
                                <TableCell>
                                    <Select value={item.ply} onValueChange={(value) => handleItemChange(index, 'ply', value)}>
                                        <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="3">3 Ply</SelectItem>
                                            <SelectItem value="5">5 Ply</SelectItem>
                                            <SelectItem value="7">7 Ply</SelectItem>
                                            <SelectItem value="9">9 Ply</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </TableCell>
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
                                <TableCell><Input value={item.paperBf} onChange={e => handleItemChange(index, 'paperBf', e.target.value)} className="w-16" /></TableCell>
                                <TableCell><Input type="number" value={item.topGsm} onChange={e => handleItemChange(index, 'topGsm', e.target.value)} className="w-20" /></TableCell>
                                <TableCell><Input type="number" value={item.flute1Gsm} onChange={e => handleItemChange(index, 'flute1Gsm', e.target.value)} className="w-20" /></TableCell>
                                <TableCell>{ply >= 7 ? <Input type="number" value={item.liner2Gsm} onChange={e => handleItemChange(index, 'liner2Gsm', e.target.value)} className="w-20" /> : null}</TableCell>
                                <TableCell>{ply >= 5 ? <Input type="number" value={item.flute2Gsm} onChange={e => handleItemChange(index, 'flute2Gsm', e.target.value)} className="w-20" /> : null}</TableCell>
                                <TableCell>{ply === 5 ? <Input type="number" value={item.middleGsm} onChange={e => handleItemChange(index, 'middleGsm', e.target.value)} className="w-20" /> : (ply >= 7 ? <Input type="number" value={item.liner3Gsm} onChange={e => handleItemChange(index, 'liner3Gsm', e.target.value)} className="w-20" /> : null)}</TableCell>
                                <TableCell>{ply >= 7 ? <Input type="number" value={item.flute3Gsm} onChange={e => handleItemChange(index, 'flute3Gsm', e.target.value)} className="w-20" /> : null}</TableCell>
                                <TableCell>{ply >= 9 ? <Input type="number" value={item.liner4Gsm} onChange={e => handleItemChange(index, 'liner4Gsm', e.target.value)} className="w-20" /> : null}</TableCell>
                                <TableCell>{ply >= 9 ? <Input type="number" value={item.flute4Gsm} onChange={e => handleItemChange(index, 'flute4Gsm', e.target.value)} className="w-20" /> : null}</TableCell>
                                <TableCell><Input type="number" value={item.bottomGsm} onChange={e => handleItemChange(index, 'bottomGsm', e.target.value)} className="w-20" /></TableCell>
                                <TableCell>{item.calculated.totalGsm.toFixed(2)}</TableCell>
                                <TableCell>{(item.calculated.sheetSizeL / 10).toFixed(2)}</TableCell>
                                <TableCell>{(item.calculated.sheetSizeB / 10).toFixed(2)}</TableCell>
                                <TableCell>{item.calculated.paperWeight.toFixed(2)}</TableCell>
                                <TableCell>{((item.calculated.paperWeight * (parseFloat(item.wastagePercent) / 100 || 0))).toFixed(2)}</TableCell>
                                <TableCell>{(item.calculated.totalBoxWeight).toFixed(2)}</TableCell>
                                <TableCell className="font-medium">
                                    {item.calculated.paperCost > 0 ? item.calculated.paperCost.toFixed(2) : '...'}
                                </TableCell>
                                 <TableCell>
                                     <div className="space-y-2">
                                        {(item.accessories || []).map((acc, accIndex) => (
                                            <Popover key={acc.id}>
                                                <PopoverTrigger asChild>
                                                    <Button variant="outline" className="w-full justify-between h-8 text-xs">
                                                        <span>{acc.name || 'Accessory'}</span>
                                                        <span className="font-bold ml-2">{(acc.calculated?.paperCost || 0).toFixed(2)}</span>
                                                    </Button>
                                                </PopoverTrigger>
                                                <PopoverContent className="w-96 p-4 space-y-4">
                                                    <div className="flex justify-between items-center">
                                                        <h4 className="font-medium">Edit Accessory</h4>
                                                         <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeAccessory(index, acc.id)}>
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                    </div>
                                                    <Input placeholder="Accessory Name (e.g. Plate)" value={acc.name} onChange={e => handleAccessoryChange(index, accIndex, 'name', e.target.value)} />
                                                    <div className="grid grid-cols-3 gap-2">
                                                        <Input placeholder="L" type="number" value={acc.l} onChange={e => handleAccessoryChange(index, accIndex, 'l', e.target.value)} />
                                                        <Input placeholder="B" type="number" value={acc.b} onChange={e => handleAccessoryChange(index, accIndex, 'b', e.target.value)} />
                                                        <Input placeholder="H" type="number" value={acc.h} onChange={e => handleAccessoryChange(index, accIndex, 'h', e.target.value)} />
                                                    </div>
                                                    <Select value={acc.ply} onValueChange={(v) => handleAccessoryChange(index, accIndex, 'ply', v)}>
                                                        <SelectTrigger><SelectValue/></SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="3">3 Ply</SelectItem>
                                                            <SelectItem value="5">5 Ply</SelectItem>
                                                            <SelectItem value="7">7 Ply</SelectItem>
                                                            <SelectItem value="9">9 Ply</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                </PopoverContent>
                                            </Popover>
                                        ))}
                                        <Button variant="outline" size="sm" className="h-8 w-full" onClick={() => addAccessory(index)}>
                                            <Paperclip className="mr-2 h-4 w-4"/> Add Accessory
                                        </Button>
                                    </div>
                                </TableCell>
                                 <TableCell>
                                    <div className="flex flex-col items-center">
                                      <span className="font-bold text-lg">{totalItemCost.toFixed(2)}</span>
                                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleRemoveItem(item.id)}>
                                          <Trash2 className="h-4 w-4" />
                                      </Button>
                                    </div>
                                </TableCell>
                            </TableRow>
                        )})}
                        </TableBody>
                    </Table>
                </div>
                <div className="flex justify-start gap-2 mt-4">
                    <Button variant="outline" size="sm" onClick={handleAddItem}><Plus className="mr-2 h-4 w-4" />Add Another Product</Button>
                    <Button variant="outline" size="sm" onClick={() => setIsLoadProductsDialogOpen(true)}><Library className="mr-2 h-4 w-4" /> Load Products</Button>
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
                        <TableHead className="text-black font-semibold">Ply, Type</TableHead>
                        <TableHead className="text-black font-semibold">Paper</TableHead>
                        <TableHead className="text-black font-semibold">GSM</TableHead>
                        <TableHead className="text-black font-semibold text-right">Box Wt (Grams)</TableHead>
                        <TableHead className="text-black font-semibold text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {itemsToPrint.map((item, index) => (
                    <tr key={item.id}>
                      <td className="align-top">{index + 1}</td>
                      <td className="align-top">
                        <p>{products.find(p => p.id === item.productId)?.name || 'N/A'}</p>
                        {(item.accessories || []).length > 0 && (
                          <div className="text-xs text-muted-foreground pl-2">
                            {item.accessories?.map(acc => (
                              <p key={acc.id}>+ {acc.name}</p>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="align-top">{`${item.l}x${item.b}x${item.h}`}</td>
                      <td className="align-top">{`${item.ply} Ply, ${item.boxType}`}</td>
                      <td className="align-top">
                          <div>{item.paperType}</div>
                          <div className="text-xs text-muted-foreground">{item.paperShade}</div>
                      </td>
                       <td className="align-top"><GsmDisplay item={item} /></td>
                      <td className="align-top text-right">{item.calculated.totalBoxWeight.toFixed(2)}</td>
                      <td className="align-top text-right">
                        <p>{item.totalItemCost.toFixed(2)}</p>
                         {(item.accessories || []).length > 0 && (
                          <div className="text-xs text-muted-foreground pl-2 text-right">
                            {item.accessories?.map(acc => (
                              <p key={acc.id}>({(acc.calculated?.paperCost || 0).toFixed(2)})</p>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </TableBody>
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
      <Dialog open={isLoadProductsDialogOpen} onOpenChange={setIsLoadProductsDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Load Products</DialogTitle>
            <DialogDescription>Select products from the list to add them to the calculator.</DialogDescription>
          </DialogHeader>
            <div className="py-4 space-y-4">
                <Select value={loadProductPartyFilter} onValueChange={setLoadProductPartyFilter}>
                    <SelectTrigger className="w-full sm:w-1/2">
                        <SelectValue placeholder="Filter by party..." />
                    </SelectTrigger>
                    <SelectContent>
                        {uniquePartiesForLoad.map(party => (
                            <SelectItem key={party} value={party}>{party}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <ScrollArea className="h-80">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-10"></TableHead>
                                <TableHead>Product Name</TableHead>
                                {loadProductPartyFilter === 'All' && <TableHead>Party Name</TableHead>}
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredProductsForLoad.map(p => (
                                <TableRow key={p.id}>
                                    <TableCell>
                                        <Checkbox
                                            checked={productsToLoad.has(p.id)}
                                            onCheckedChange={checked => {
                                                setProductsToLoad(prev => {
                                                    const newSet = new Set(prev);
                                                    if (checked) newSet.add(p.id);
                                                    else newSet.delete(p.id);
                                                    return newSet;
                                                });
                                            }}
                                        />
                                    </TableCell>
                                    <TableCell>{p.name}</TableCell>
                                    {loadProductPartyFilter === 'All' && <TableCell>{p.partyName}</TableCell>}
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </ScrollArea>
            </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsLoadProductsDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleLoadProducts}>Add Selected Products</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
        <Dialog open={isCostHistoryDialogOpen} onOpenChange={setIsCostHistoryDialogOpen}>
        <DialogContent>
            <DialogHeader>
                <DialogTitle>Costing History</DialogTitle>
                <DialogDescription>Review past changes to paper and conversion costs.</DialogDescription>
            </DialogHeader>
            <ScrollArea className="h-96">
                {(costSettings?.history || []).length > 0 ? (
                <div className="space-y-4 p-4">
                    {[...(costSettings?.history || [])].reverse().map((entry, index) => (
                    <div key={index} className="flex justify-between items-center text-sm">
                        <div>
                        <p className="font-medium capitalize">{entry.costType.replace('Cost', ' Cost')}</p>
                        <p className="text-xs text-muted-foreground">{format(new Date(entry.date), "PPp")} by {entry.setBy}</p>
                        </div>
                        <div className="text-right">
                        <p>{entry.newValue.toLocaleString()}</p>
                        <p className="text-xs text-muted-foreground line-through">{entry.oldValue.toLocaleString()}</p>
                        </div>
                    </div>
                    ))}
                </div>
                ) : (
                <div className="text-center text-muted-foreground p-8">No history found.</div>
                )}
            </ScrollArea>
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

    const calculateItemCost = useCallback((item: Omit<CostReportItem, 'id' | 'calculated' | 'productId' | 'accessories'>, report: CostReport): CalculatedValues => {
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
        const liner2Gsm = parseInt(item.liner2Gsm, 10) || 0;
        const flute3Gsm = parseInt(item.flute3Gsm, 10) || 0;
        const liner3Gsm = parseInt(item.liner3Gsm, 10) || 0;
        const flute4Gsm = parseInt(item.flute4Gsm, 10) || 0;
        const liner4Gsm = parseInt(item.liner4Gsm, 10) || 0;
        const sheetArea = (sheetSizeL * sheetSizeB) / 1000000;
        let totalGsmForCalc = 0;
        if (ply === 3) totalGsmForCalc = topGsm + (flute1Gsm * fluteFactor) + bottomGsm;
        else if (ply === 5) totalGsmForCalc = topGsm + (flute1Gsm * fluteFactor) + middleGsm + (flute2Gsm * fluteFactor) + bottomGsm;
        else if (ply === 7) totalGsmForCalc = topGsm + (flute1Gsm * fluteFactor) + liner2Gsm + (flute2Gsm * fluteFactor) + liner3Gsm + (flute3Gsm * fluteFactor) + bottomGsm;
        else if (ply === 9) totalGsmForCalc = topGsm + (flute1Gsm * fluteFactor) + liner2Gsm + (flute2Gsm * fluteFactor) + liner3Gsm + (flute3Gsm * fluteFactor) + liner4Gsm + (flute4Gsm * fluteFactor) + bottomGsm;

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
        return reportToPrint.items.map(item => {
            const calculated = calculateItemCost(item, reportToPrint);
            const accessoriesCost = (item.accessories || []).reduce((sum, acc) => {
                 const accCalculated = calculateItemCost(acc, reportToPrint);
                 return sum + (accCalculated.paperCost || 0);
            }, 0);
            return {
                ...item,
                calculated,
                totalItemCost: (calculated.paperCost || 0) + accessoriesCost
            };
        });
    }, [reportToPrint, calculateItemCost]);
    
    const GsmDisplay = ({ item }: { item: CostReportItem | Accessory }) => {
        const ply = parseInt(item.ply, 10);
        
        const parts = [
            {label: 'T', value: item.topGsm},
            {label: 'F1', value: item.flute1Gsm}
        ];

        if (ply >= 7) parts.push({label: 'L2', value: item.liner2Gsm});
        if (ply >= 5) parts.push({label: 'F2', value: item.flute2Gsm});
        if (ply === 5) parts.push({label: 'M', value: item.middleGsm});
        if (ply >= 7) parts.push({label: 'L3', value: item.liner3Gsm});
        if (ply >= 7) parts.push({label: 'F3', value: item.flute3Gsm});
        if (ply >= 9) parts.push({label: 'L4', value: item.liner4Gsm});
        if (ply >= 9) parts.push({label: 'F4', value: item.flute4Gsm});

        parts.push({label: 'B', value: item.bottomGsm});

        const part1 = parts.slice(0, 4).filter(p => p.value).map(p => `${p.label}:${p.value}`).join(' ');
        const part2 = parts.slice(4).filter(p => p.value).map(p => `${p.label}:${p.value}`).join(' ');

        return (
          <div>
            <div>{part1}</div>
            {part2 && <div>{part2}</div>}
          </div>
        );
    };


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
                                    <TableHead className="text-black font-semibold">Ply, Type</TableHead>
                                    <TableHead className="text-black font-semibold">Paper</TableHead>
                                    <TableHead className="text-black font-semibold">GSM</TableHead>
                                    <TableHead className="text-black font-semibold text-right">Box Wt (Grams)</TableHead>
                                    <TableHead className="text-black font-semibold text-right">Total</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                            {printableReportItems.map((item, index) => (
                                <tr key={item.id}>
                                    <td className="align-top">{index + 1}</td>
                                    <td className="align-top">
                                        <p>{products.find(p => p.id === item.productId)?.name || 'N/A'}</p>
                                        {(item.accessories || []).length > 0 && (
                                        <div className="text-xs text-muted-foreground pl-2">
                                            {item.accessories?.map(acc => (
                                            <p key={acc.id}>+ {acc.name}</p>
                                            ))}
                                        </div>
                                        )}
                                    </td>
                                    <td className="align-top">{`${item.l}x${item.b}x${item.h}`}</td>
                                    <td className="align-top">{`${item.ply} Ply, ${item.boxType}`}</td>
                                    <td className="align-top">
                                        <div>{item.paperType}</div>
                                        <div className="text-xs text-muted-foreground">{item.paperShade}</div>
                                    </td>
                                    <td className="align-top"><GsmDisplay item={item} /></td>
                                    <td className="align-top text-right">{item.calculated.totalBoxWeight.toFixed(2)}</td>
                                    <td className="align-top text-right">
                                        <p>{item.totalItemCost.toFixed(2)}</p>
                                        {(item.accessories || []).length > 0 && (
                                        <div className="text-xs text-muted-foreground pl-2 text-right">
                                            {item.accessories?.map(acc => {
                                                const accCalculated = calculateItemCost(acc, reportToPrint!);
                                                return (
                                                <p key={acc.id}>({(accCalculated.paperCost || 0).toFixed(2)})</p>
                                                )
                                            })}
                                        </div>
                                        )}
                                    </td>
                                </tr>
                            ))}
                            </TableBody>
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

function ProductForm({ productToEdit, onSaveSuccess }: { productToEdit: Product | null, onSaveSuccess: () => void }) {
    const [productForm, setProductForm] = useState<Partial<Product> & { l?: string, b?: string, h?: string }>({ specification: {} });
    const [parties, setParties] = useState<Party[]>([]);
    const [partySearch, setPartySearch] = useState('');
    const [isPartyDialogOpen, setIsPartyDialogOpen] = useState(false);
    const [newPartyForm, setNewPartyForm] = useState<{ name: string; type: PartyType; address?: string; panNumber?: string; }>({ name: '', type: 'Customer', address: '', panNumber: '' });
    const [editingParty, setEditingParty] = useState<Party | null>(null);

    const { user } = useAuth();
    const { toast } = useToast();
    
    const relevantSpecFields: (keyof ProductSpecification)[] = ['ply', 'paperBf', 'topGsm', 'flute1Gsm', 'middleGsm', 'flute2Gsm', 'liner2Gsm', 'flute3Gsm', 'liner3Gsm', 'flute4Gsm', 'liner4Gsm', 'bottomGsm', 'printing', 'paperShade', 'boxType'];

    useEffect(() => {
        const unsubParties = onPartiesUpdate(setParties);
        return () => unsubParties();
    }, []);

    useEffect(() => {
        if (productToEdit) {
            const spec: Partial<ProductSpecification> = {};
            relevantSpecFields.forEach(field => {
                spec[field] = productToEdit.specification?.[field] || '';
            });
            
            const [l, b, h] = productToEdit.specification?.dimension?.split('x') || ['', '', ''];

            setProductForm({ ...productToEdit, specification: spec, l, b, h });
        } else {
            const spec: Partial<ProductSpecification> = {};
            relevantSpecFields.forEach(field => {
                spec[field] = '';
            });
            spec.ply = '3';
            spec.paperShade = 'NS';
            spec.boxType = 'RSC';
            setProductForm({ name: '', materialCode: '', partyId: '', partyName: '', specification: spec, l: '', b: '', h: '' });
        }
    }, [productToEdit]);
    
    const handleProductFormChange = (field: keyof typeof productForm, value: any) => {
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
            onSaveSuccess();
        } catch (error) {
            toast({ title: 'Error', description: 'Failed to save product.', variant: 'destructive' });
        }
    };
    
    const handleOpenPartyDialog = (partyToEdit: Party | null = null, searchName: string = '') => {
        if (partyToEdit) {
            setEditingParty(partyToEdit);
            setNewPartyForm({ name: partyToEdit.name, type: partyToEdit.type, address: partyToEdit.address || '', panNumber: partyToEdit.panNumber || '' });
        } else {
            setEditingParty(null);
            setNewPartyForm({ name: searchName, type: 'Customer', address: '', panNumber: '' });
        }
        setIsPartyDialogOpen(true);
    };

    const handleSubmitParty = async () => {
        if (!user) return;
        if (!newPartyForm.name) {
            toast({ title: 'Error', description: 'Party name is required.', variant: 'destructive' });
            return;
        }
        try {
            if (editingParty) {
                await updateParty(editingParty.id, { ...newPartyForm, lastModifiedBy: user.username });
                toast({ title: 'Success', description: 'Party updated.' });
            } else {
                const newPartyId = await addParty({ ...newPartyForm, createdBy: user.username });
                setProductForm(prev => ({...prev, partyId: newPartyId}));
                toast({ title: 'Success', description: 'New party added.' });
            }
            setIsPartyDialogOpen(false);
        } catch {
            toast({ title: 'Error', description: 'Failed to save party.', variant: 'destructive' });
        }
    };
    
    const ply = parseInt(productForm.specification?.ply || '3', 10);
    
    return (
        <>
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
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button variant="outline" role="combobox" className="w-full justify-between">
                                    {productForm.partyId ? parties.find(p => p.id === productForm.partyId)?.name : "Select party..."}
                                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="p-0 w-[--radix-popover-trigger-width]">
                                <Command>
                                    <CommandInput 
                                        placeholder="Search party..." 
                                        value={partySearch}
                                        onValueChange={setPartySearch}
                                    />
                                    <CommandList>
                                        <CommandEmpty>
                                            <Button variant="ghost" className="w-full justify-start" onClick={() => handleOpenPartyDialog(null, partySearch)}>
                                                <PlusCircle className="mr-2 h-4 w-4" /> Add "{partySearch}"
                                            </Button>
                                        </CommandEmpty>
                                        <CommandGroup>
                                            {parties.map(p => (
                                                <CommandItem key={p.id} value={p.name} onSelect={() => { handleProductFormChange('partyId', p.id); setPartySearch('');}}>
                                                    <Check className={cn("mr-2 h-4 w-4", productForm.partyId === p.id ? "opacity-100" : "opacity-0")} />
                                                    {p.name}
                                                </CommandItem>
                                            ))}
                                        </CommandGroup>
                                    </CommandList>
                                </Command>
                            </PopoverContent>
                        </Popover>
                    </div>
                    <Separator />
                    <h4 className="font-semibold">Specification</h4>
                     <div className="space-y-2">
                        <Label>Dimension</Label>
                        <div className="flex gap-2">
                            <Input placeholder="L" type="number" value={productForm.l || ''} onChange={e => handleProductFormChange('l', e.target.value)} />
                            <Input placeholder="B" type="number" value={productForm.b || ''} onChange={e => handleProductFormChange('b', e.target.value)} />
                            <Input placeholder="H" type="number" value={productForm.h || ''} onChange={e => handleProductFormChange('h', e.target.value)} />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                       <div className="space-y-2">
                            <Label htmlFor={`spec-ply`}>Ply</Label>
                            <Select value={productForm.specification?.ply || '3'} onValueChange={(v) => handleSpecChange('ply', v)}>
                                <SelectTrigger><SelectValue/></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="3">3 Ply</SelectItem>
                                    <SelectItem value="5">5 Ply</SelectItem>
                                    <SelectItem value="7">7 Ply</SelectItem>
                                    <SelectItem value="9">9 Ply</SelectItem>
                                </SelectContent>
                            </Select>
                       </div>
                       <div className="space-y-2">
                            <Label htmlFor={`spec-paperBf`}>Paper Bf</Label>
                            <Input id={`spec-paperBf`} value={productForm.specification?.paperBf || ''} onChange={(e) => handleSpecChange('paperBf', e.target.value)} />
                       </div>
                       <div className="space-y-2">
                            <Label htmlFor={`spec-topGsm`}>Top Gsm</Label>
                            <Input id={`spec-topGsm`} value={productForm.specification?.topGsm || ''} onChange={(e) => handleSpecChange('topGsm', e.target.value)} />
                       </div>
                       <div className="space-y-2">
                            <Label htmlFor={`spec-flute1Gsm`}>Flute 1 Gsm</Label>
                            <Input id={`spec-flute1Gsm`} value={productForm.specification?.flute1Gsm || ''} onChange={(e) => handleSpecChange('flute1Gsm', e.target.value)} />
                       </div>
                       {ply >= 5 && (
                           <div className="space-y-2">
                                <Label htmlFor={`spec-middleGsm`}>Middle Gsm</Label>
                                <Input id={`spec-middleGsm`} value={productForm.specification?.middleGsm || ''} onChange={(e) => handleSpecChange('middleGsm', e.target.value)} />
                           </div>
                       )}
                       {ply >= 5 && (
                           <div className="space-y-2">
                                <Label htmlFor={`spec-flute2Gsm`}>Flute 2 Gsm</Label>
                                <Input id={`spec-flute2Gsm`} value={productForm.specification?.flute2Gsm || ''} onChange={(e) => handleSpecChange('flute2Gsm', e.target.value)} />
                           </div>
                       )}
                       {ply >= 7 && (
                           <div className="space-y-2">
                                <Label htmlFor={`spec-liner2Gsm`}>Liner 2 Gsm</Label>
                                <Input id={`spec-liner2Gsm`} value={productForm.specification?.liner2Gsm || ''} onChange={(e) => handleSpecChange('liner2Gsm', e.target.value)} />
                           </div>
                       )}
                       {ply >= 7 && (
                           <div className="space-y-2">
                                <Label htmlFor={`spec-flute3Gsm`}>Flute 3 Gsm</Label>
                                <Input id={`spec-flute3Gsm`} value={productForm.specification?.flute3Gsm || ''} onChange={(e) => handleSpecChange('flute3Gsm', e.target.value)} />
                           </div>
                       )}
                       {ply >= 7 && (
                           <div className="space-y-2">
                                <Label htmlFor={`spec-liner3Gsm`}>Liner 3 Gsm</Label>
                                <Input id={`spec-liner3Gsm`} value={productForm.specification?.liner3Gsm || ''} onChange={(e) => handleSpecChange('liner3Gsm', e.target.value)} />
                           </div>
                       )}
                       {ply >= 9 && (
                           <div className="space-y-2">
                                <Label htmlFor={`spec-flute4Gsm`}>Flute 4 Gsm</Label>
                                <Input id={`spec-flute4Gsm`} value={productForm.specification?.flute4Gsm || ''} onChange={(e) => handleSpecChange('flute4Gsm', e.target.value)} />
                           </div>
                       )}
                       {ply >= 9 && (
                           <div className="space-y-2">
                                <Label htmlFor={`spec-liner4Gsm`}>Liner 4 Gsm</Label>
                                <Input id={`spec-liner4Gsm`} value={productForm.specification?.liner4Gsm || ''} onChange={(e) => handleSpecChange('liner4Gsm', e.target.value)} />
                           </div>
                       )}
                       <div className="space-y-2">
                            <Label htmlFor={`spec-bottomGsm`}>Bottom Gsm</Label>
                            <Input id={`spec-bottomGsm`} value={productForm.specification?.bottomGsm || ''} onChange={(e) => handleSpecChange('bottomGsm', e.target.value)} />
                       </div>
                       <div className="space-y-2">
                            <Label htmlFor={`spec-printing`}>Printing</Label>
                            <Input id={`spec-printing`} value={productForm.specification?.printing || ''} onChange={(e) => handleSpecChange('printing', e.target.value)} />
                       </div>
                    </div>
                </div>
            </ScrollArea>
             <DialogFooter>
                <Button variant="outline" onClick={onSaveSuccess}>Cancel</Button>
                <Button onClick={handleSaveProduct}>{productToEdit ? 'Save Changes' : 'Add Product'}</Button>
            </DialogFooter>
            
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
                          <Input id="party-name-dialog" value={newPartyForm.name} onChange={e => setNewPartyForm(p => ({...p, name: e.target.value}))} />
                      </div>
                       <div className="space-y-2">
                          <Label htmlFor="party-type-dialog">Party Type</Label>
                          <Select value={newPartyForm.type} onValueChange={(v: PartyType) => setNewPartyForm(p => ({...p, type: v}))}>
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
                          <Input id="party-pan-dialog" value={newPartyForm.panNumber || ''} onChange={e => setNewPartyForm(p => ({...p, panNumber: e.target.value}))} />
                      </div>
                      <div className="space-y-2">
                          <Label htmlFor="party-address-dialog">Address</Label>
                          <Textarea id="party-address-dialog" value={newPartyForm.address || ''} onChange={e => setNewPartyForm(p => ({...p, address: e.target.value}))} />
                      </div>
                  </div>
                  <DialogFooter>
                      <Button variant="outline" onClick={() => setIsPartyDialogOpen(false)}>Cancel</Button>
                      <Button onClick={handleSubmitParty}>{editingParty ? 'Save Changes' : 'Add Party'}</Button>
                  </DialogFooter>
              </DialogContent>
          </Dialog>
        </>
    );
}


function SavedProductsList() {
    const [products, setProducts] = useState<Product[]>([]);
    const [parties, setParties] = useState<Party[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterParty, setFilterParty] = useState('All');
    const {toast} = useToast();
    
    // Product Dialog State
    const [isProductDialogOpen, setIsProductDialogOpen] = useState(false);
    const [productToEdit, setProductToEdit] = useState<Product | null>(null);


    useEffect(() => {
        const unsubProducts = onProductsUpdate(setProducts);
        const unsubParties = onPartiesUpdate(setParties);
        return () => {
          unsubProducts();
          unsubParties();
        }
    }, []);
    
    const sortedProducts = useMemo(() => {
        let filtered = products;
        if(filterParty !== 'All') {
            filtered = filtered.filter(p => p.partyName === filterParty);
        }
        if(searchQuery) {
            filtered = filtered.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()));
        }
        return filtered.sort((a,b) => a.name.localeCompare(b.name));
    }, [products, searchQuery, filterParty]);

    const uniqueParties = useMemo(() => ['All', ...Array.from(new Set(products.map(p => p.partyName).filter(Boolean)))], [products]);
    
    const handleDeleteProduct = async (id: string) => {
        try {
            await deleteProductService(id);
            toast({ title: 'Product Deleted' });
        } catch {
            toast({ title: 'Error', description: 'Failed to delete product', variant: 'destructive' });
        }
    };
    
    const handleOpenProductDialog = (product: Product | null = null) => {
        setProductToEdit(product);
        setIsProductDialogOpen(true);
    };
    
    const getGsmDisplay = (spec: Partial<ProductSpecification> | undefined) => {
        if (!spec) return 'N/A';
        const { ply, topGsm, flute1Gsm, bottomGsm, middleGsm, flute2Gsm, liner2Gsm, liner3Gsm, flute3Gsm, liner4Gsm, flute4Gsm } = spec;
        
        switch (String(ply)) {
            case '3':
                return [topGsm, flute1Gsm, bottomGsm].filter(Boolean).join('/');
            case '5':
                return [topGsm, flute1Gsm, middleGsm, flute2Gsm, bottomGsm].filter(Boolean).join('/');
            case '7':
                return [topGsm, flute1Gsm, liner2Gsm, flute2Gsm, liner3Gsm, flute3Gsm, bottomGsm].filter(Boolean).join('/');
            case '9':
                 return [topGsm, flute1Gsm, liner2Gsm, flute2Gsm, liner3Gsm, flute3Gsm, liner4Gsm, flute4Gsm, bottomGsm].filter(Boolean).join('/');
            default:
                return [topGsm, bottomGsm].filter(Boolean).join('/');
        }
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
                        <Input placeholder="Search products..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-64" />
                        <Select value={filterParty} onValueChange={setFilterParty}>
                            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                {uniqueParties.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                            </SelectContent>
                        </Select>
                        <Button onClick={() => handleOpenProductDialog()}><Plus className="mr-2 h-4 w-4" /> Add Product</Button>
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Product Name</TableHead>
                            <TableHead>Party Name</TableHead>
                            <TableHead>Dimension</TableHead>
                            <TableHead>Ply</TableHead>
                            <TableHead>GSM</TableHead>
                            <TableHead>Paper BF</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {sortedProducts.map(p => (
                            <TableRow key={p.id}>
                                <TableCell>{p.name}</TableCell>
                                <TableCell>{p.partyName || 'N/A'}</TableCell>
                                <TableCell>{p.specification?.dimension || 'N/A'}</TableCell>
                                <TableCell>{p.specification?.ply || 'N/A'}</TableCell>
                                <TableCell>
                                  {getGsmDisplay(p.specification)}
                                </TableCell>
                                <TableCell>{p.specification?.paperBf || 'N/A'}</TableCell>
                                <TableCell className="text-right">
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4"/></Button></DropdownMenuTrigger>
                                        <DropdownMenuContent>
                                            <DropdownMenuItem onSelect={() => handleOpenProductDialog(p)}><Edit className="mr-2 h-4 w-4"/>Edit</DropdownMenuItem>
                                            <AlertDialog>
                                                <AlertDialogTrigger asChild><DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-destructive"><Trash2 className="mr-2 h-4 w-4"/>Delete</DropdownMenuItem></AlertDialogTrigger>
                                                <AlertDialogContent>
                                                    <AlertDialogHeader>
                                                        <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                                        <AlertDialogDescription>This will permanently delete this product.</AlertDialogDescription>
                                                    </AlertDialogHeader>
                                                    <AlertDialogFooter>
                                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                        <AlertDialogAction onClick={() => handleDeleteProduct(p.id)}>Delete</AlertDialogAction>
                                                    </AlertDialogFooter>
                                                </AlertDialogContent>
                                            </AlertDialog>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
        <Dialog open={isProductDialogOpen} onOpenChange={setIsProductDialogOpen}>
            <DialogContent className="max-w-xl">
                <DialogHeader>
                    <DialogTitle>{productToEdit ? 'Edit Product' : 'Add New Product'}</DialogTitle>
                </DialogHeader>
                 <ProductForm 
                    productToEdit={productToEdit} 
                    onSaveSuccess={() => {
                        setIsProductDialogOpen(false);
                        setProductToEdit(null);
                    }}
                />
            </DialogContent>
        </Dialog>
      </>
    );
}

function CostingSettingsTab() {
  const [costSettings, setCostSettings] = useState<CostSetting | null>(null);
  const [kraftPaperCost, setKraftPaperCost] = useState<number | ''>('');
  const [virginPaperCost, setVirginPaperCost] = useState<number | ''>('');
  const [conversionCost, setConversionCost] = useState<number | ''>('');
  const { user } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    const unsubCostSettings = onSettingUpdate('costing', (setting) => {
        if (setting?.value) {
            const settings = setting.value as CostSetting;
            setCostSettings(settings);
            setKraftPaperCost(settings.kraftPaperCost || '');
            setVirginPaperCost(settings.virginPaperCost || '');
            setConversionCost(settings.conversionCost || '');
        }
    });
    return () => unsubCostSettings();
  }, []);

  const handleSaveCosts = async () => {
    if (!user) return;
    try {
        await updateCostSettings({
            kraftPaperCost: Number(kraftPaperCost) || 0,
            virginPaperCost: Number(virginPaperCost) || 0,
            conversionCost: Number(conversionCost) || 0,
        }, user.username);
        toast({ title: "Success", description: "Cost settings saved." });
    } catch (e) {
        toast({ title: "Error", description: "Failed to save cost settings.", variant: "destructive" });
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1">
            <CardHeader>
                <CardTitle>Default Costs</CardTitle>
                <CardDescription>These values will be used as defaults in new cost reports.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="space-y-2">
                    <Label htmlFor="globalKraftCost">Kraft Paper Cost</Label>
                    <Input id="globalKraftCost" type="number" placeholder="Enter cost" value={kraftPaperCost} onChange={e => setKraftPaperCost(e.target.value === '' ? '' : parseFloat(e.target.value))} />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="globalVirginCost">Virgin Paper Cost</Label>
                    <Input id="globalVirginCost" type="number" placeholder="Enter cost" value={virginPaperCost} onChange={e => setVirginPaperCost(e.target.value === '' ? '' : parseFloat(e.target.value))} />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="globalConversionCost">Conversion Cost</Label>
                    <Input id="globalConversionCost" type="number" placeholder="Enter cost" value={conversionCost} onChange={e => setConversionCost(e.target.value === '' ? '' : parseFloat(e.target.value))} />
                </div>
                <Button onClick={handleSaveCosts}>Save Default Costs</Button>
            </CardContent>
        </Card>
        <Card className="lg:col-span-2">
             <CardHeader>
                <CardTitle>Costing History</CardTitle>
                <CardDescription>Review past changes to paper and conversion costs.</CardDescription>
            </CardHeader>
            <CardContent>
                <ScrollArea className="h-96">
                    {(costSettings?.history || []).length > 0 ? (
                    <div className="space-y-4">
                        {[...(costSettings?.history || [])].reverse().map((entry, index) => (
                        <div key={index} className="flex justify-between items-center text-sm p-3 bg-muted/50 rounded-lg">
                            <div>
                            <p className="font-medium capitalize">{entry.costType.replace('Cost', ' Cost')}</p>
                            <p className="text-xs text-muted-foreground">{format(new Date(entry.date), "PPp")} by {entry.setBy}</p>
                            </div>
                            <div className="text-right">
                            <p>{entry.newValue.toLocaleString()}</p>
                            <p className="text-xs text-muted-foreground line-through">{entry.oldValue.toLocaleString()}</p>
                            </div>
                        </div>
                        ))}
                    </div>
                    ) : (
                    <div className="text-center text-muted-foreground p-8">No history found.</div>
                    )}
                </ScrollArea>
            </CardContent>
        </Card>
    </div>
  )
}

export default function CostReportPage() {
    const [activeTab, setActiveTab] = useState("calculator");
    const [reportToEdit, setReportToEdit] = useState<CostReport | null>(null);
    const [products, setProducts] = useState<Product[]>([]);
    
    const [isProductAddDialogOpen, setIsProductAddDialogOpen] = useState(false);
    
    useEffect(() => {
        const unsubProducts = onProductsUpdate(setProducts);
        return () => unsubProducts();
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
    
    const onProductAdd = () => {
        setIsProductAddDialogOpen(true);
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
                    <TabsTrigger value="costingSettings">Costing Settings</TabsTrigger>
                </TabsList>
                <TabsContent value="calculator" className="pt-4">
                    <CostReportCalculator 
                        reportToEdit={reportToEdit} 
                        onSaveSuccess={handleFinishEditing} 
                        onCancelEdit={handleCancelEdit}
                        products={products}
                        onProductAdd={onProductAdd}
                    />
                </TabsContent>
                <TabsContent value="saved" className="pt-4">
                    <SavedReportsList onEdit={handleEditReport} />
                </TabsContent>
                <TabsContent value="products" className="pt-4">
                    <SavedProductsList />
                </TabsContent>
                 <TabsContent value="costingSettings" className="pt-4">
                    <CostingSettingsTab />
                </TabsContent>
            </Tabs>
             {/* This dialog is now managed by the main page but triggered from the calculator */}
             <Dialog open={isProductAddDialogOpen} onOpenChange={setIsProductAddDialogOpen}>
                 <DialogContent className="max-w-xl">
                    <DialogHeader>
                        <DialogTitle>Add New Product</DialogTitle>
                    </DialogHeader>
                     <ProductForm productToEdit={null} onSaveSuccess={() => setIsProductAddDialogOpen(false)} />
                </DialogContent>
            </Dialog>
        </div>
    );
}

    