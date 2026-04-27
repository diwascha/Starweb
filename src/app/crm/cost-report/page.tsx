'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import type { 
  Product, 
  Party, 
  PartyType, 
  CostReport, 
  CostReportItem, 
  ProductSpecification, 
  CostSetting, 
  CalculatedValues, 
  CostReportTerm,
  Accessory,
} from '@/lib/types';
import { onProductsUpdate, addProduct as addProductService, updateProduct } from '@/services/product-service';
import { onPartiesUpdate, addParty } from '@/services/party-service';
import { 
  onCostReportsUpdate, 
  addCostReport, 
  generateNextCostReportNumber, 
} from '@/services/cost-report-service';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { 
  Printer, 
  Loader2, 
  Plus, 
  Trash2, 
  Check, 
  PlusCircle, 
  Edit, 
  Save, 
  Image as ImageIcon, 
  Settings2,
  FileSpreadsheet,
  Search,
  ChevronsUpDown,
  Calendar,
  X
} from 'lucide-react';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow,
  TableFooter
} from '@/components/ui/table';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { cn, toNepaliDate } from '@/lib/utils';
import { format } from 'date-fns';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { onSettingUpdate, updateCostSettings } from '@/services/settings-service';
import React from 'react';

const bfOptions = ['16 BF', '18 BF', '20 BF', '22 BF'];
const plyOptions = ['3', '5', '7', '9'];

const normalizeBF = (val: any): string => {
  if (val === undefined || val === null || val === '') return "";
  const trimmed = String(val).trim();
  if (/^\d+$/.test(trimmed)) return `${trimmed} BF`;
  const match = trimmed.match(/^(\d+)\s*bf$/i);
  if (match) return `${match[1]} BF`;
  return trimmed;
};

const getGsmDisplay = (item: any) => {
    if (!item) return 'N/A';
    const plyStr = item.ply || '3';
    const p = parseInt(plyStr, 10);
    let layers: (string | undefined)[] = [];
    
    if (p === 3) layers = [item.topGsm, item.flute1Gsm, item.bottomGsm];
    else if (p === 5) layers = [item.topGsm, item.flute1Gsm, item.middleGsm, item.flute2Gsm, item.bottomGsm];
    else if (p === 7) layers = [item.topGsm, item.flute1Gsm, item.middleGsm, item.flute2Gsm, item.liner2Gsm, item.flute3Gsm, item.bottomGsm];
    else if (p === 9) layers = [item.topGsm, item.flute1Gsm, item.middleGsm, item.flute2Gsm, item.liner2Gsm, item.flute3Gsm, item.liner3Gsm, item.flute4Gsm, item.bottomGsm];
    else layers = [item.topGsm, item.bottomGsm];
    
    return layers.filter(l => l !== undefined && l !== null && String(l).trim() !== '').join('/');
};

interface QuotationPreviewDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  reportNumber: string;
  reportDate: Date;
  party: Party | null | undefined;
  items: (CostReportItem & { totalItemCost: number })[];
  products: Product[];
  termsAndConditions?: CostReportTerm[];
}

function QuotationPreviewDialog({ isOpen, onOpenChange, reportNumber, reportDate, party, items, products, termsAndConditions = [] }: QuotationPreviewDialogProps) {
  const printRef = useRef<HTMLDivElement>(null);
  const selectedTerms = useMemo(() => (termsAndConditions || []).filter(t => t.isSelected), [termsAndConditions]);

  const getProductDisplayName = (productId: string) => {
    const product = products.find(p => p.id === productId);
    return product ? (product.materialCode ? `${product.name} (${product.materialCode})` : product.name) : 'Custom Item';
  };

  const handlePrint = () => {
    const printableArea = printRef.current;
    if (!printableArea) return;
    const printWindow = window.open('', '', 'height=800,width=800');
    printWindow?.document.write('<html><head><title>Print Quotation</title><style>body{font-family:sans-serif;padding:20px;}table{width:100%;border-collapse:collapse;}th,td{border:1px solid #ddd;padding:8px;text-align:left;}th{background-color:#f2f2f2;}.text-right{text-align:right;}.font-bold{font-weight:bold;}</style></head><body>');
    printWindow?.document.write(printableArea.innerHTML);
    printWindow?.document.write('</body></html>');
    printWindow?.document.close();
    printWindow?.focus();
    setTimeout(() => { printWindow?.print(); printWindow?.close(); }, 250);
  };
  
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Quotation Preview</DialogTitle>
          <DialogDescription>Review the document layout before printing.</DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[70vh] bg-gray-100 p-4 border rounded">
            <div ref={printRef} className="w-[210mm] mx-auto bg-white p-12 text-black shadow-lg">
               <header className="text-center space-y-1 mb-8">
                    <h1 className="text-2xl font-bold">SHIVAM PACKAGING INDUSTRIES PVT LTD.</h1>
                    <p className="text-base uppercase tracking-wide">Hetauda 08, Bagmati Province, Nepal</p>
                    <h2 className="text-xl font-bold underline mt-4">QUOTATION</h2>
                </header>
                 <div className="grid grid-cols-2 text-sm mb-6">
                    <div>
                        <p>To,</p>
                        <p className="font-bold text-lg">{party?.name}</p>
                        <p className="whitespace-pre-line">{party?.address}</p>
                        {party?.panNumber && <p>PAN/VAT: {party.panNumber}</p>}
                    </div>
                    <div className="text-right">
                        <p><span className="font-semibold">Ref No:</span> {reportNumber}</p>
                        <p><span className="font-semibold">Date:</span> {toNepaliDate(reportDate.toISOString())} BS</p>
                        <p className="text-xs text-muted-foreground">({format(reportDate, "MMMM do, yyyy")})</p>
                    </div>
                </div>
                <Table className="text-xs border">
                    <TableHeader className="bg-muted/50">
                        <TableRow>
                            <TableHead className="w-12 text-black font-bold">S.N.</TableHead>
                            <TableHead className="text-black font-bold">Particulars</TableHead>
                            <TableHead className="text-black font-bold">Size (mm)</TableHead>
                            <TableHead className="text-black font-bold">Ply</TableHead>
                            <TableHead className="text-black font-bold">Paper</TableHead>
                            <TableHead className="text-black font-bold text-right">Rate (NPR)</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {items.flatMap((item, index) => {
                            const mainRow = (
                                <TableRow key={item.id}>
                                    <TableCell>{index + 1}</TableCell>
                                    <TableCell className="font-bold">{getProductDisplayName(item.productId)}</TableCell>
                                    <TableCell>{item.l}x{item.b}x{item.h}</TableCell>
                                    <TableCell>{item.ply} Ply</TableCell>
                                    <TableCell>{item.paperType} {normalizeBF(item.paperBf)}</TableCell>
                                    <TableCell className="text-right font-bold">Rs. {item.totalItemCost.toFixed(2)}</TableCell>
                                </TableRow>
                            );
                            const accRows = (item.accessories || []).map((acc, aIdx) => (
                                <TableRow key={acc.id} className="bg-muted/5 italic">
                                    <TableCell></TableCell>
                                    <TableCell className="pl-6">— {acc.name}</TableCell>
                                    <TableCell>{acc.l}x{acc.b}x{acc.h}</TableCell>
                                    <TableCell>{acc.ply} Ply</TableCell>
                                    <TableCell>{acc.paperType} {normalizeBF(acc.paperBf)}</TableCell>
                                    <TableCell className="text-right">Rs. {acc.calculated?.paperCost.toFixed(2)}</TableCell>
                                </TableRow>
                            ));
                            return [mainRow, ...accRows];
                        })}
                    </TableBody>
                </Table>
                {selectedTerms.length > 0 && (
                    <div className="mt-12">
                        <p className="font-bold underline text-sm mb-3">Terms & Conditions:</p>
                        <ol className="list-decimal pl-5 text-xs space-y-2">
                            {selectedTerms.map((term, i) => <li key={i}>{term.text}</li>)}
                        </ol>
                    </div>
                )}
                <div className="mt-20 flex justify-between px-4">
                    <div className="text-center">
                        <div className="border-t border-black w-40 mb-1"></div>
                        <p className="text-xs font-bold">Prepared By</p>
                    </div>
                    <div className="text-center">
                        <div className="border-t border-black w-40 mb-1"></div>
                        <p className="text-xs font-bold">Authorized Signature</p>
                    </div>
                </div>
            </div>
        </ScrollArea>
        <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
            <Button onClick={handlePrint}><Printer className="mr-2 h-4 w-4" /> Print Quotation</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ManageTermsDialog({ isOpen, onOpenChange, masterTerms, onSave }: { isOpen: boolean, onOpenChange: (v: boolean) => void, masterTerms: CostReportTerm[], onSave: (v: CostReportTerm[]) => void }) {
    const [terms, setTerms] = useState<string[]>([]);
    const [newTerm, setNewTerm] = useState('');

    useEffect(() => {
        if (isOpen) setTerms(masterTerms.map(t => t.text));
    }, [isOpen, masterTerms]);

    const handleSave = () => {
        onSave(terms.map(text => ({ text, isSelected: true })));
        onOpenChange(false);
    };

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Manage Master Terms & Conditions</DialogTitle>
                    <DialogDescription>Maintain a global list of terms. You can select specific ones for each report.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    <div className="flex gap-2">
                        <Input placeholder="Enter a standard term..." value={newTerm} onChange={e => setNewTerm(e.target.value)} onKeyDown={e => { if(e.key === 'Enter') { if(newTerm) setTerms([...terms, newTerm]); setNewTerm(''); } }} />
                        <Button onClick={() => { if(newTerm) { setTerms([...terms, newTerm]); setNewTerm(''); } }}><Plus className="h-4 w-4" /></Button>
                    </div>
                    <ScrollArea className="h-64 border rounded p-3">
                        <div className="space-y-3">
                            {terms.map((text, idx) => (
                                <div key={idx} className="flex gap-2 items-start group">
                                    <Textarea value={text} onChange={e => { const n = [...terms]; n[idx] = e.target.value; setTerms(n); }} className="min-h-[60px] text-xs resize-none" />
                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => setTerms(terms.filter((_, i) => i !== idx))}><Trash2 className="h-4 w-4" /></Button>
                                </div>
                            ))}
                        </div>
                    </ScrollArea>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button onClick={handleSave}>Update Master List</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function CostReportCalculator({ reportToEdit, onSaveSuccess, products }: any) {
  const [parties, setParties] = useState<Party[]>([]);
  const [costReports, setCostReports] = useState<CostReport[]>([]);
  const [selectedPartyId, setSelectedPartyId] = useState('');
  const [reportNumber, setReportNumber] = useState('');
  const [reportDate, setReportDate] = useState<Date>(new Date());
  
  const [kraftPaperCosts, setKraftPaperCosts] = useState<Record<string, number>>({});
  const [virginPaperCost, setVirginCost] = useState<number | ''>('');
  const [conversionCost, setConversionCost] = useState<number | ''>('');
  const [transportCost, setTransportCost] = useState<number | ''>('');
  const [transportCostType, setTransportCostType] = useState<'Per Piece' | 'Per Consignment'>('Per Consignment');
  
  const [termsAndConditions, setTermsAndConditions] = useState<CostReportTerm[]>([]);
  const [items, setItems] = useState<CostReportItem[]>([]);
  const [selectedForPrint, setSelectedForPrint] = useState(new Set<string>());
  
  const [isSaving, setIsSaving] = useState(false);
  const [isPartyDialogOpen, setIsPartyDialogOpen] = useState(false);
  const [partyForm, setPartyForm] = useState({ name: '', type: 'Customer' as PartyType, address: '', panNumber: '' });
  const [isPartyPopoverOpen, setIsPartyPopoverOpen] = useState(false);
  const [partySearch, setPartySearch] = useState('');
  
  const [isProductDialogOpen, setIsProductDialogOpen] = useState(false);
  const [isBatchAddDialogOpen, setIsBatchAddDialogOpen] = useState(false);
  const [isManageTermsDialogOpen, setIsManageTermsDialogOpen] = useState(false);
  const [selectedBatchProductIds, setSelectedBatchProductIds] = useState<Set<string>>(new Set());
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [productSearch, setProductSearch] = useState<Record<string, string>>({});
  const [isProductPopoverOpen, setIsProductPopoverOpen] = useState<Record<string, boolean>>({});
  
  const [costSettings, setCostSettings] = useState<CostSetting | null>(null);
  const { toast } = useToast();
  const { user } = useAuth();

  useEffect(() => {
    const unsubCostSettings = onSettingUpdate('costing', (s) => {
        if (s?.value) {
            setCostSettings(s.value);
            setKraftPaperCosts(s.value.kraftPaperCosts || {});
            setVirginCost(s.value.virginPaperCost || '');
            setConversionCost(s.value.conversionCost || '');
            setTermsAndConditions(prev => prev.length === 0 ? (s.value.termsAndConditions || []) : prev);
        }
    });
    const unsubParties = onPartiesUpdate(setParties);
    const unsubReports = onCostReportsUpdate(setCostReports);
    return () => { unsubCostSettings(); unsubParties(); unsubReports(); };
  }, []);

  useEffect(() => {
      if (!reportToEdit) {
          generateNextCostReportNumber(costReports).then(setReportNumber);
      } else {
          setReportNumber(reportToEdit.reportNumber);
          setReportDate(new Date(reportToEdit.reportDate));
          setSelectedPartyId(reportToEdit.partyId);
          setTermsAndConditions(reportToEdit.termsAndConditions || []);
          // Note: Full item load with accessories should be mapped here if needed
      }
  }, [reportToEdit, costReports]);

  const calculateItemCost = useCallback((item: any, globalK: any, globalV: number, globalC: number): CalculatedValues => {
    const l = parseFloat(item.l) || 0, b = parseFloat(item.b) || 0, h = parseFloat(item.h) || 0, pcs = parseInt(item.noOfPcs, 10) || 1;
    if (l <= 0 || b <= 0) return { sheetSizeL: 0, sheetSizeB: 0, sheetArea: 0, totalGsm: 0, paperWeight: 0, totalBoxWeight: 0, paperRate: 0, paperCost: 0 };
    
    const isBox = h > 0;
    let sL = 0, sB = 0;
    if (isBox) {
        const c1 = b + h + 20, d1 = (2 * l) + (2 * b) + 62, c2 = l + h + 20, d2 = (2 * b) + (2 * l) + 62;
        if (c1 * d1 <= c2 * d2) { sL = c1; sB = d1; } else { sL = c2; sB = d2; }
    } else { const d = [l, b].sort((x, y) => y - x); sL = d[0]; sB = d[1]; }
    
    const ply = parseInt(item.ply, 10) || 0;
    const gsm = {
        l1: parseFloat(item.topGsm) || 0,
        f1: parseFloat(item.flute1Gsm) || 0,
        l2: parseFloat(item.middleGsm) || 0,
        f2: parseFloat(item.flute2Gsm) || 0,
        l3: parseFloat(item.liner2Gsm) || 0,
        f3: parseFloat(item.flute3Gsm) || 0,
        l4: parseFloat(item.liner3Gsm) || 0,
        f4: parseFloat(item.flute4Gsm) || 0,
        l5: parseFloat(item.bottomGsm) || 0,
    };

    let tGsm = 0;
    const factor = 1.35;

    if (ply === 3) tGsm = gsm.l1 + (gsm.f1 * factor) + gsm.l5;
    else if (ply === 5) tGsm = gsm.l1 + (gsm.f1 * factor) + gsm.l2 + (gsm.f2 * factor) + gsm.l5;
    else if (ply === 7) tGsm = gsm.l1 + (gsm.f1 * factor) + gsm.l2 + (gsm.f2 * factor) + gsm.l3 + (gsm.f3 * factor) + gsm.l5;
    else if (ply === 9) tGsm = gsm.l1 + (gsm.f1 * factor) + gsm.l2 + (gsm.f2 * factor) + gsm.l3 + (gsm.f3 * factor) + gsm.l4 + (gsm.f4 * factor) + gsm.l5;
    else tGsm = gsm.l1 + gsm.l5;
    
    const sArea = (sL * sB) / 1000000;
    const pWt = sArea * tGsm * pcs;
    const tBWt = pWt * (1 + (parseFloat(item.wastagePercent) / 100 || 0));
    const kC = globalK[normalizeBF(item.paperBf)] || 0;
    let pRate = item.paperType === 'VIRGIN' ? globalV : kC;
    const finalRate = pRate + globalC;
    
    return { 
        sheetSizeL: sL, sheetSizeB: sB, sheetArea: sArea, totalGsm: tGsm, 
        paperWeight: pWt, totalBoxWeight: tBWt, paperRate: finalRate, 
        paperCost: (tBWt / 1000) * finalRate 
    };
  }, []);

  const handleSaveMasterTerms = async (newTerms: CostReportTerm[]) => {
      if (!user) return;
      try {
          await updateCostSettings({ termsAndConditions: newTerms }, user.username);
          setTermsAndConditions(newTerms);
          toast({ title: 'Terms Updated', description: 'Master list has been updated.' });
      } catch {
          toast({ title: 'Error', description: 'Failed to update master terms.', variant: 'destructive' });
      }
  };

  const mapProductToItem = useCallback((product: Product): CostReportItem => {
    const spec = product.specification || {};
    const [dimL, dimB, dimH] = (spec.dimension || '').split('x');
    const base = {
        id: Math.random().toString(36).substr(2, 9),
        productId: product.id,
        l: dimL || '',
        b: dimB || '',
        h: dimH || '',
        noOfPcs: '1',
        ply: spec.ply || '3',
        fluteType: 'B',
        paperType: spec.paperType || 'KRAFT',
        paperBf: spec.paperBf || '18 BF',
        paperShade: spec.paperShade || 'NS',
        boxType: spec.boxType || 'RSC',
        topGsm: spec.topGsm || '120',
        flute1Gsm: spec.flute1Gsm || '100',
        middleGsm: spec.middleGsm || '',
        flute2Gsm: spec.flute2Gsm || '',
        liner2Gsm: spec.liner2Gsm || '',
        flute3Gsm: spec.flute3Gsm || '',
        liner3Gsm: spec.liner3Gsm || '',
        flute4Gsm: spec.flute4Gsm || '',
        bottomGsm: spec.bottomGsm || '120',
        liner4Gsm: spec.liner4Gsm || '',
        wastagePercent: spec.wastagePercent || '3.5',
        accessories: (product.accessories || []).map(acc => ({
            ...acc,
            calculated: calculateItemCost(acc, kraftPaperCosts, Number(virginPaperCost) || 0, Number(conversionCost) || 0)
        }))
    };
    return { ...base, calculated: calculateItemCost(base, kraftPaperCosts, Number(virginPaperCost) || 0, Number(conversionCost) || 0) };
  }, [calculateItemCost, kraftPaperCosts, virginPaperCost, conversionCost]);

  const handleAddItem = () => {
    const base = { id: Date.now().toString(), productId: '', l:'', b:'', h:'', noOfPcs:'1', ply:'3', fluteType: 'B', paperType: 'KRAFT', paperBf:'18 BF', paperShade: 'NS', boxType: 'RSC', topGsm:'120', flute1Gsm:'100', middleGsm:'', flute2Gsm:'', bottomGsm:'120', liner2Gsm:'', flute3Gsm:'', liner3Gsm:'', flute4Gsm:'', liner4Gsm:'', wastagePercent:'3.5', accessories: [] };
    const newItem = { ...base, calculated: calculateItemCost(base, kraftPaperCosts, Number(virginPaperCost) || 0, Number(conversionCost) || 0) };
    setItems([...items, newItem]);
    setSelectedForPrint(new Set(selectedForPrint).add(newItem.id));
  };

  const handleAddAccessory = (idx: number) => {
    const parent = items[idx];
    const newAcc: Accessory = {
        id: Math.random().toString(36).substr(2, 9),
        name: 'Internal Pad',
        l: parent.l,
        b: parent.b,
        h: '0',
        noOfPcs: '1',
        ply: '3',
        fluteType: 'B',
        paperType: 'KRAFT',
        paperBf: '18 BF',
        paperShade: 'NS',
        boxType: 'PAD',
        topGsm: '120',
        flute1Gsm: '100',
        middleGsm: '',
        flute2Gsm: '',
        bottomGsm: '120',
        liner2Gsm: '',
        flute3Gsm: '',
        liner3Gsm: '',
        flute4Gsm: '',
        liner4Gsm: '',
        wastagePercent: '2.5',
        calculated: { sheetSizeL: 0, sheetSizeB: 0, sheetArea: 0, totalGsm: 0, paperWeight: 0, totalBoxWeight: 0, paperRate: 0, paperCost: 0 }
    };
    newAcc.calculated = calculateItemCost(newAcc, kraftPaperCosts, Number(virginPaperCost) || 0, Number(conversionCost) || 0);
    const next = [...items];
    next[idx].accessories = [...(next[idx].accessories || []), newAcc];
    setItems(next);
  };

  const handleBatchLoad = () => {
    const selectedProducts = products.filter(p => selectedBatchProductIds.has(p.id));
    const newItems = selectedProducts.map(p => mapProductToItem(p));
    setItems([...items, ...newItems]);
    const newSelectedForPrint = new Set(selectedForPrint);
    newItems.forEach(i => newSelectedForPrint.add(i.id));
    setSelectedForPrint(newSelectedForPrint);
    setIsBatchAddDialogOpen(false);
    setSelectedBatchProductIds(new Set());
  };

  const handleItemChange = (idx: number, f: string, v: string) => {
    const next = [...items];
    let item = { ...next[idx], [f]: f === 'paperBf' ? normalizeBF(v) : v };
    if (f === 'productId') {
        const product = products.find((p: Product) => p.id === v);
        if (product) item = mapProductToItem(product);
    }
    next[idx] = { ...item, calculated: calculateItemCost(item, kraftPaperCosts, Number(virginPaperCost) || 0, Number(conversionCost) || 0) };
    setItems(next);
  };

  const handleAccessoryChange = (itemIdx: number, accIdx: number, f: string, v: string) => {
    const next = [...items];
    const acc = { ...next[itemIdx].accessories![accIdx], [f]: f === 'paperBf' ? normalizeBF(v) : v };
    acc.calculated = calculateItemCost(acc, kraftPaperCosts, Number(virginPaperCost) || 0, Number(conversionCost) || 0);
    next[itemIdx].accessories![accIdx] = acc;
    setItems(next);
  };

  const handleSubmitParty = async () => {
    if (!user) return;
    if (!partyForm.name) {
        toast({ title: 'Error', description: 'Party name is required.', variant: 'destructive' });
        return;
    }
    try {
        const newPartyId = await addParty({ ...partyForm, createdBy: user.username });
        setSelectedPartyId(newPartyId);
        toast({ title: 'Success', description: 'New party added.' });
        setIsPartyDialogOpen(false);
        setPartyForm({ name: '', type: 'Customer', address: '', panNumber: '' });
    } catch {
        toast({ title: 'Error', description: 'Failed to add party.', variant: 'destructive' });
    }
  };

  const handleSaveReport = async () => {
    if (!user || !selectedPartyId || items.length === 0) {
        toast({ title: 'Error', description: 'Party and at least one item are required.', variant: 'destructive' });
        return;
    }
    setIsSaving(true);
    try {
        const reportData = {
            reportNumber,
            reportDate: reportDate.toISOString(),
            partyId: selectedPartyId,
            partyName: parties.find(p => p.id === selectedPartyId)?.name || 'N/A',
            kraftPaperCosts,
            virginPaperCost: Number(virginPaperCost) || 0,
            conversionCost: Number(conversionCost) || 0,
            transportCost: Number(transportCost) || 0,
            transportCostType,
            termsAndConditions,
            items: items.map(({ calculated, ...rest }) => rest),
            totalCost: items.reduce((sum, i) => sum + i.calculated.paperCost + (i.accessories?.reduce((aSum, a) => aSum + a.calculated.paperCost, 0) || 0), 0),
            createdBy: user.username
        };
        await addCostReport(reportData);

        const updatePromises: any[] = [];
        items.forEach(item => {
            if (!item.productId) return;
            const product = products.find(p => p.id === item.productId);
            if (!product) return;
            
            const updatedSpec: Partial<ProductSpecification> = {
                ...product.specification,
                dimension: `${item.l}x${item.b}x${item.h}`,
                ply: item.ply,
                paperType: item.paperType,
                paperBf: item.paperBf,
                topGsm: item.topGsm,
                flute1Gsm: item.flute1Gsm,
                middleGsm: item.middleGsm,
                flute2Gsm: item.flute2Gsm,
                liner2Gsm: item.liner2Gsm,
                flute3Gsm: item.flute3Gsm,
                liner3Gsm: item.liner3Gsm,
                flute4Gsm: item.flute4Gsm,
                bottomGsm: item.bottomGsm,
                wastagePercent: item.wastagePercent,
            };
            
            updatePromises.push(updateProduct(item.productId, { 
                specification: updatedSpec, 
                accessories: item.accessories?.map(({ calculated, ...rest }) => rest),
                lastModifiedBy: user.username 
            }));
        });
        
        await Promise.all(updatePromises);
        toast({ title: 'Success', description: 'Report saved and specifications updated.' });
        onSaveSuccess();
    } catch (error) {
        console.error("Save error:", error);
        toast({ title: 'Error', description: 'Failed to save record.', variant: 'destructive' });
    } finally {
        setIsSaving(false);
    }
  };

  const companyProducts = useMemo(() => {
    if (!selectedPartyId) return [];
    return products.filter(p => p.partyId === selectedPartyId).sort((a,b) => a.name.localeCompare(b.name));
  }, [products, selectedPartyId]);

  const maxPly = useMemo(() => {
      let max = 3;
      items.forEach(i => {
          max = Math.max(max, parseInt(i.ply, 10) || 3);
          i.accessories?.forEach(a => max = Math.max(max, parseInt(a.ply, 10) || 3));
      });
      return max;
  }, [items]);

  return (
    <div className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="shadow-sm">
                <CardHeader className="py-3 px-4 border-b bg-muted/5"><CardTitle className="text-xs uppercase tracking-wider">Report Identity</CardTitle></CardHeader>
                <CardContent className="pt-4 space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1"><Label className="text-[10px] font-bold">Report No</Label><Input value={reportNumber ?? ''} readOnly className="h-8 text-xs bg-muted font-mono" /></div>
                        <div className="space-y-1"><Label className="text-[10px] font-bold">Date</Label><Button variant="outline" className="w-full h-8 text-xs font-normal justify-start"><Calendar className="mr-2 h-3.5 w-3.5" /> {toNepaliDate(reportDate.toISOString())}</Button></div>
                    </div>
                    <div className="space-y-1">
                        <Label className="text-[10px] font-bold">Party Name</Label>
                        <Popover open={isPartyPopoverOpen} onOpenChange={setIsPartyPopoverOpen}>
                            <PopoverTrigger asChild>
                                <Button variant="outline" role="combobox" className="w-full justify-between h-8 text-xs">
                                    {selectedPartyId ? parties.find(p => p.id === selectedPartyId)?.name : "Select customer..."}
                                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="p-0">
                                <Command>
                                    <CommandInput placeholder="Search customer..." value={partySearch} onValueChange={setPartySearch} />
                                    <CommandList>
                                        <CommandEmpty>
                                            <Button variant="ghost" className="w-full justify-start text-xs" onClick={() => { setPartyForm({ name: partySearch, type: 'Customer', address: '', panNumber: '' }); setIsPartyDialogOpen(true); setIsPartyPopoverOpen(false); }}>
                                                <PlusCircle className="mr-2 h-4 w-4" /> Add "{partySearch}"
                                            </Button>
                                        </CommandEmpty>
                                        <CommandGroup>
                                            {parties.sort((a,b)=>a.name.localeCompare(b.name)).map(p => (
                                                <CommandItem key={p.id} value={p.name} onSelect={() => { setSelectedPartyId(p.id); setIsPartyPopoverOpen(false); }}>
                                                    <Check className={cn("mr-2 h-4 w-4", selectedPartyId === p.id ? "opacity-100" : "opacity-0")} />
                                                    {p.name}
                                                </CommandItem>
                                            ))}
                                        </CommandGroup>
                                    </CommandList>
                                </Command>
                            </PopoverContent>
                        </Popover>
                    </div>
                </CardContent>
            </Card>

            <Card className="shadow-sm">
                <CardHeader className="py-3 px-4 border-b bg-muted/5"><CardTitle className="text-xs uppercase tracking-wider">Global Rates (NPR)</CardTitle></CardHeader>
                <CardContent className="pt-4 grid grid-cols-2 gap-4">
                    <div className="space-y-2 col-span-2">
                        <Label className="text-[10px] font-bold text-muted-foreground">KRAFT BF RATES</Label>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                            {bfOptions.map(bf => (
                                <div key={bf} className="flex items-center gap-2">
                                    <span className="text-[10px] w-12 font-medium">{bf}</span>
                                    <Input type="number" className="h-8 text-xs px-2" value={kraftPaperCosts[normalizeBF(bf)] ?? ''} onChange={e => setKraftPaperCosts({...kraftPaperCosts, [normalizeBF(bf)]: e.target.value === '' ? 0 : parseFloat(e.target.value)})} />
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="space-y-1"><Label className="text-[10px] font-bold">Virgin Rate</Label><Input type="number" value={virginPaperCost ?? ''} onChange={e => setVirginCost(e.target.value === '' ? '' : parseFloat(e.target.value))} className="h-8 text-xs" /></div>
                    <div className="space-y-1"><Label className="text-[10px] font-bold">Conversion</Label><Input type="number" value={conversionCost ?? ''} onChange={e => setConversionCost(e.target.value === '' ? '' : parseFloat(e.target.value))} className="h-8 text-xs" /></div>
                </CardContent>
            </Card>

            <Card className="shadow-sm">
                <CardHeader className="py-3 px-4 border-b bg-muted/5 flex flex-row items-center justify-between">
                    <CardTitle className="text-xs uppercase tracking-wider">T&C and Logistics</CardTitle>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setIsManageTermsDialogOpen(true)} title="Manage Master Terms"><Settings2 className="h-3 w-3" /></Button>
                </CardHeader>
                <CardContent className="pt-4 space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1"><Label className="text-[10px] font-bold">Transport</Label><Input type="number" value={transportCost ?? ''} onChange={e => setTransportCost(e.target.value === '' ? '' : parseFloat(e.target.value))} className="h-8 text-xs" /></div>
                        <div className="space-y-1"><Label className="text-[10px] font-bold">Basis</Label>
                            <Select value={transportCostType} onValueChange={(v: any) => setTransportCostType(v)}>
                                <SelectTrigger className="h-8 text-xs"><SelectValue/></SelectTrigger>
                                <SelectContent><SelectItem value="Per Piece">Per Piece</SelectItem><SelectItem value="Per Consignment">Lump Sum</SelectItem></SelectContent>
                            </Select>
                        </div>
                    </div>
                    <div className="space-y-1">
                        <Label className="text-[10px] font-bold text-muted-foreground uppercase">Selected Terms</Label>
                        <ScrollArea className="h-20 border rounded bg-muted/5 p-2">
                            {termsAndConditions.length > 0 ? (
                                <div className="space-y-1.5">
                                    {termsAndConditions.map((term, idx) => (
                                        <div key={idx} className="flex items-center space-x-2">
                                            <Checkbox 
                                                id={`term-${idx}`} 
                                                checked={term.isSelected} 
                                                onCheckedChange={(v) => {
                                                    const next = [...termsAndConditions];
                                                    next[idx].isSelected = !!v;
                                                    setTermsAndConditions(next);
                                                }}
                                            />
                                            <Label htmlFor={`term-${idx}`} className="text-[10px] leading-tight cursor-pointer line-clamp-1">{term.text}</Label>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-[9px] text-center text-muted-foreground py-4 italic">No terms in master list.</p>
                            )}
                        </ScrollArea>
                    </div>
                </CardContent>
            </Card>
        </div>

        <Card className="shadow-lg overflow-hidden border-t-4 border-t-primary">
            <CardHeader className="flex flex-row items-center gap-4 bg-muted/20 py-4 px-6">
                <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={handleAddItem} className="h-9"><Plus className="mr-2 h-4 w-4" /> Add Item</Button>
                    <Button size="sm" variant="outline" onClick={() => setIsBatchAddDialogOpen(true)} disabled={!selectedPartyId} className="h-9">
                        <FileSpreadsheet className="mr-2 h-4 w-4" /> Load from List
                    </Button>
                    <Button size="sm" onClick={handleSaveReport} disabled={isSaving} className="h-9">
                        {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} 
                        Save Report
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setIsPreviewOpen(true)} className="h-9"><ImageIcon className="mr-2 h-4 w-4" /> Preview Quotation</Button>
                </div>
                <div className="ml-auto text-right">
                    <CardTitle className="text-base font-bold">Costing Dashboard</CardTitle>
                    <CardDescription className="text-[11px]">Technical analysis and weight calculation</CardDescription>
                </div>
            </CardHeader>
            <CardContent className="p-0">
                <ScrollArea className="w-full">
                    <div className="p-4">
                        <Table className="text-[11px] border border-collapse min-w-[2200px]">
                            <TableHeader className="bg-muted/80">
                                <TableRow>
                                    <TableHead rowSpan={2} className="w-10 px-2"></TableHead>
                                    <TableHead rowSpan={2} className="min-w-[280px] font-bold text-black border-r">Item Name / Product</TableHead>
                                    <TableHead colSpan={3} className="text-center border-x font-bold text-black bg-blue-50/50">Size (mm)</TableHead>
                                    <TableHead rowSpan={2} className="text-center min-w-[80px] border-r">Pcs</TableHead>
                                    <TableHead rowSpan={2} className="text-center min-w-[80px] border-r">Ply</TableHead>
                                    <TableHead rowSpan={2} className="text-center min-w-[150px] border-r">Type (K/V/M)</TableHead>
                                    <TableHead rowSpan={2} className="text-center min-w-[130px] border-r">Paper BF</TableHead>
                                    <TableHead rowSpan={2} className="text-center min-w-[100px] border-r">Waste %</TableHead>
                                    <TableHead colSpan={maxPly} className="text-center border-x font-bold text-black bg-orange-50/50">GSM Composition</TableHead>
                                    <TableHead rowSpan={2} className="text-center min-w-[90px] border-r bg-muted/20">T.GSM</TableHead>
                                    <TableHead rowSpan={2} className="text-center min-w-[100px] border-r bg-muted/20">Weight (g)</TableHead>
                                    <TableHead rowSpan={2} className="text-center min-w-[120px] border-r bg-primary/5 font-bold">Paper Cost</TableHead>
                                    <TableHead rowSpan={2} className="text-right min-w-[140px] pr-6 bg-primary/10 font-bold">Total NPR</TableHead>
                                    <TableHead rowSpan={2} className="w-20"></TableHead>
                                </TableRow>
                                <TableRow>
                                    <TableHead className="text-center border-l min-w-[110px] bg-blue-50/30">L</TableHead>
                                    <TableHead className="text-center min-w-[110px] bg-blue-50/30">B</TableHead>
                                    <TableHead className="text-center border-r min-w-[110px] bg-blue-50/30">H</TableHead>
                                    <TableHead className="text-center border-l min-w-[100px] bg-orange-50/30">Top</TableHead>
                                    <TableHead className="text-center min-w-[100px] bg-orange-50/30">F1</TableHead>
                                    {maxPly >= 5 && <TableHead className="text-center min-w-[100px] bg-orange-50/30">Mid1</TableHead>}
                                    {maxPly >= 5 && <TableHead className="text-center min-w-[100px] bg-orange-50/30">F2</TableHead>}
                                    {maxPly >= 7 && <TableHead className="text-center min-w-[100px] bg-orange-50/30">Mid2</TableHead>}
                                    {maxPly >= 7 && <TableHead className="text-center min-w-[100px] bg-orange-50/30">F3</TableHead>}
                                    {maxPly >= 9 && <TableHead className="text-center min-w-[100px] bg-orange-50/30">Mid3</TableHead>}
                                    {maxPly >= 9 && <TableHead className="text-center min-w-[100px] bg-orange-50/30">F4</TableHead>}
                                    <TableHead className="text-center border-r min-w-[100px] bg-orange-50/30">Bot</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {items.map((item, idx) => (
                                    <React.Fragment key={item.id}>
                                        <TableRow className="h-14 hover:bg-muted/30 border-b">
                                            <TableCell className="px-2 border-r"><Checkbox checked={selectedForPrint.has(item.id)} onCheckedChange={v => { const n = new Set(selectedForPrint); if(v) n.add(item.id); else n.delete(item.id); setSelectedForPrint(n); }} /></TableCell>
                                            <TableCell className="border-r pr-2">
                                                <div className="flex gap-1.5 items-center">
                                                    <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={() => handleAddAccessory(idx)} title="Add Accessory"><Plus className="h-3.5 w-3.5" /></Button>
                                                    <Popover open={isProductPopoverOpen[item.id]} onOpenChange={(v) => setIsProductPopoverOpen(prev => ({...prev, [item.id]: v}))}>
                                                        <PopoverTrigger asChild>
                                                            <Button variant="outline" role="combobox" className="h-8 text-[11px] w-full justify-between px-2">
                                                                {item.productId ? products.find(p => p.id === item.productId)?.name : "Select product..."}
                                                                <ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
                                                            </Button>
                                                        </PopoverTrigger>
                                                        <PopoverContent className="p-0">
                                                            <Command>
                                                                <CommandInput placeholder="Search product..." value={productSearch[item.id] || ''} onValueChange={(v) => setProductSearch(prev => ({...prev, [item.id]: v}))} />
                                                                <CommandList>
                                                                    <CommandEmpty>
                                                                        <Button variant="ghost" className="w-full justify-start text-xs" onClick={() => { setIsProductDialogOpen(true); setIsProductPopoverOpen(prev => ({...prev, [item.id]: false})); }}>
                                                                            <PlusCircle className="mr-2 h-4 w-4" /> Add "{productSearch[item.id]}"
                                                                        </Button>
                                                                    </CommandEmpty>
                                                                    <CommandGroup>
                                                                        {products.sort((a,b)=>a.name.localeCompare(b.name)).map(p => (
                                                                            <CommandItem key={p.id} value={p.name} onSelect={() => { handleItemChange(idx, 'productId', p.id); setIsProductPopoverOpen(prev => ({...prev, [item.id]: false})); }}>
                                                                                <Check className={cn("mr-2 h-4 w-4", item.productId === p.id ? "opacity-100" : "opacity-0")} />
                                                                                {p.name}
                                                                            </CommandItem>
                                                                        ))}
                                                                    </CommandGroup>
                                                                </CommandList>
                                                            </Command>
                                                        </PopoverContent>
                                                    </Popover>
                                                </div>
                                            </TableCell>
                                            <TableCell className="border-r p-0"><Input type="number" value={item.l ?? ''} onChange={e => handleItemChange(idx, 'l', e.target.value)} className="h-14 text-center px-0 w-full border-none focus-visible:ring-0 rounded-none bg-transparent" /></TableCell>
                                            <TableCell className="border-r p-0"><Input type="number" value={item.b ?? ''} onChange={e => handleItemChange(idx, 'b', e.target.value)} className="h-14 text-center px-0 w-full border-none focus-visible:ring-0 rounded-none bg-transparent" /></TableCell>
                                            <TableCell className="border-r p-0"><Input type="number" value={item.h ?? ''} onChange={e => handleItemChange(idx, 'h', e.target.value)} className="h-14 text-center px-0 w-full border-none focus-visible:ring-0 rounded-none bg-transparent" /></TableCell>
                                            <TableCell className="border-r p-0"><Input type="number" value={item.noOfPcs ?? ''} onChange={e => handleItemChange(idx, 'noOfPcs', e.target.value)} className="h-14 text-center px-0 w-full border-none focus-visible:ring-0 rounded-none bg-transparent" /></TableCell>
                                            <TableCell className="border-r px-2">
                                                <Select value={item.ply ?? '3'} onValueChange={v => handleItemChange(idx, 'ply', v)}>
                                                    <SelectTrigger className="h-8 text-center px-1"><SelectValue/></SelectTrigger>
                                                    <SelectContent>{plyOptions.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                                                </Select>
                                            </TableCell>
                                            <TableCell className="border-r px-2">
                                                <Select value={item.paperType ?? 'KRAFT'} onValueChange={v => handleItemChange(idx, 'paperType', v)}>
                                                    <SelectTrigger className="h-8 px-2 text-[10px]"><SelectValue/></SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="KRAFT">Kraft (K)</SelectItem>
                                                        <SelectItem value="VIRGIN">Virgin (V)</SelectItem>
                                                        <SelectItem value="VIRGIN & KRAFT">Mixed (M)</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </TableCell>
                                            <TableCell className="border-r px-2">
                                                <Select value={normalizeBF(item.paperBf)} onValueChange={v => handleItemChange(idx, 'paperBf', v)}>
                                                    <SelectTrigger className="h-8 px-2"><SelectValue/></SelectTrigger>
                                                    <SelectContent>{bfOptions.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
                                                </Select>
                                            </TableCell>
                                            <TableCell className="border-r p-0"><Input type="number" value={item.wastagePercent ?? ''} onChange={e => handleItemChange(idx, 'wastagePercent', e.target.value)} className="h-14 text-center px-0 w-full border-none focus-visible:ring-0 rounded-none bg-transparent" /></TableCell>
                                            <TableCell className="border-r p-0 bg-orange-50/10"><Input type="number" value={item.topGsm ?? ''} onChange={e => handleItemChange(idx, 'topGsm', e.target.value)} className="h-14 text-center px-0 w-full border-none focus-visible:ring-0 rounded-none bg-transparent" /></TableCell>
                                            <TableCell className="border-r p-0 bg-orange-50/10"><Input type="number" value={item.flute1Gsm ?? ''} onChange={e => handleItemChange(idx, 'flute1Gsm', e.target.value)} className="h-14 text-center px-0 w-full border-none focus-visible:ring-0 rounded-none bg-transparent" /></TableCell>
                                            {maxPly >= 5 && (
                                                <>
                                                    <TableCell className="border-r p-0 bg-orange-50/10"><Input type="number" value={item.middleGsm ?? ''} onChange={e => handleItemChange(idx, 'middleGsm', e.target.value)} className={cn("h-14 text-center px-0 w-full border-none focus-visible:ring-0 rounded-none", parseInt(item.ply, 10) < 5 ? "bg-muted/20" : "bg-transparent")} disabled={parseInt(item.ply, 10) < 5} /></TableCell>
                                                    <TableCell className="border-r p-0 bg-orange-50/10"><Input type="number" value={item.flute2Gsm ?? ''} onChange={e => handleItemChange(idx, 'flute2Gsm', e.target.value)} className={cn("h-14 text-center px-0 w-full border-none focus-visible:ring-0 rounded-none", parseInt(item.ply, 10) < 5 ? "bg-muted/20" : "bg-transparent")} disabled={parseInt(item.ply, 10) < 5} /></TableCell>
                                                </>
                                            )}
                                            {maxPly >= 7 && (
                                                <>
                                                    <TableCell className="border-r p-0 bg-orange-50/10"><Input type="number" value={item.liner2Gsm ?? ''} onChange={e => handleItemChange(idx, 'liner2Gsm', e.target.value)} className={cn("h-14 text-center px-0 w-full border-none focus-visible:ring-0 rounded-none", parseInt(item.ply, 10) < 7 ? "bg-muted/20" : "bg-transparent")} disabled={parseInt(item.ply, 10) < 7} /></TableCell>
                                                    <TableCell className="border-r p-0 bg-orange-50/10"><Input type="number" value={item.flute3Gsm ?? ''} onChange={e => handleItemChange(idx, 'flute3Gsm', e.target.value)} className={cn("h-14 text-center px-0 w-full border-none focus-visible:ring-0 rounded-none", parseInt(item.ply, 10) < 7 ? "bg-muted/20" : "bg-transparent")} disabled={parseInt(item.ply, 10) < 7} /></TableCell>
                                                </>
                                            )}
                                            {maxPly >= 9 && (
                                                <>
                                                    <TableCell className="border-r p-0 bg-orange-50/10"><Input type="number" value={item.liner3Gsm ?? ''} onChange={e => handleItemChange(idx, 'liner3Gsm', e.target.value)} className={cn("h-14 text-center px-0 w-full border-none focus-visible:ring-0 rounded-none", parseInt(item.ply, 10) < 9 ? "bg-muted/20" : "bg-transparent")} disabled={parseInt(item.ply, 10) < 9} /></TableCell>
                                                    <TableCell className="border-r p-0 bg-orange-50/10"><Input type="number" value={item.flute4Gsm ?? ''} onChange={e => handleItemChange(idx, 'flute4Gsm', e.target.value)} className={cn("h-14 text-center px-0 w-full border-none focus-visible:ring-0 rounded-none", parseInt(item.ply, 10) < 9 ? "bg-muted/20" : "bg-transparent")} disabled={parseInt(item.ply, 10) < 9} /></TableCell>
                                                </>
                                            )}
                                            <TableCell className="border-r p-0 bg-orange-50/10"><Input type="number" value={item.bottomGsm ?? ''} onChange={e => handleItemChange(idx, 'bottomGsm', e.target.value)} className="h-14 text-center px-0 w-full border-none focus-visible:ring-0 rounded-none bg-transparent" /></TableCell>
                                            <TableCell className="text-center font-medium bg-muted/20 border-r">{item.calculated?.totalGsm.toFixed(0)}</TableCell>
                                            <TableCell className="text-center font-medium bg-muted/20 border-r">{item.calculated?.paperWeight.toFixed(1)}</TableCell>
                                            <TableCell className="text-center font-bold border-r bg-primary/5">Rs. {item.calculated?.paperCost.toFixed(2)}</TableCell>
                                            <TableCell className="text-right font-bold pr-6 bg-primary/10">Rs. {item.calculated?.paperCost.toFixed(2)}</TableCell>
                                            <TableCell className="px-2">
                                                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setItems(items.filter(i => i.id !== item.id))}><Trash2 className="h-4 w-4" /></Button>
                                            </TableCell>
                                        </TableRow>
                                        {/* Accessory Rows */}
                                        {(item.accessories || []).map((acc, aIdx) => (
                                            <TableRow key={acc.id} className="h-12 bg-muted/10 border-b border-dashed">
                                                <TableCell></TableCell>
                                                <TableCell className="border-r pr-2 pl-6">
                                                    <div className="flex gap-1.5 items-center">
                                                        <Input value={acc.name} onChange={e => handleAccessoryChange(idx, aIdx, 'name', e.target.value)} className="h-8 text-[10px] w-full bg-white font-semibold" />
                                                    </div>
                                                </TableCell>
                                                <TableCell className="border-r p-0"><Input type="number" value={acc.l ?? ''} onChange={e => handleAccessoryChange(idx, aIdx, 'l', e.target.value)} className="h-12 text-center px-0 w-full border-none bg-transparent" /></TableCell>
                                                <TableCell className="border-r p-0"><Input type="number" value={acc.b ?? ''} onChange={e => handleAccessoryChange(idx, aIdx, 'b', e.target.value)} className="h-12 text-center px-0 w-full border-none bg-transparent" /></TableCell>
                                                <TableCell className="border-r p-0 bg-muted/20"><Input readOnly value="0" className="h-12 text-center px-0 w-full border-none bg-transparent" /></TableCell>
                                                <TableCell className="border-r p-0"><Input type="number" value={acc.noOfPcs ?? ''} onChange={e => handleAccessoryChange(idx, aIdx, 'noOfPcs', e.target.value)} className="h-12 text-center px-0 w-full border-none bg-transparent" /></TableCell>
                                                <TableCell className="border-r px-2">
                                                    <Select value={acc.ply ?? '3'} onValueChange={v => handleAccessoryChange(idx, aIdx, 'ply', v)}>
                                                        <SelectTrigger className="h-8 text-center px-1"><SelectValue/></SelectTrigger>
                                                        <SelectContent>{plyOptions.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                                                    </Select>
                                                </TableCell>
                                                <TableCell className="border-r px-2">
                                                    <Select value={acc.paperType ?? 'KRAFT'} onValueChange={v => handleAccessoryChange(idx, aIdx, 'paperType', v)}>
                                                        <SelectTrigger className="h-8 px-2 text-[10px]"><SelectValue/></SelectTrigger>
                                                        <SelectContent><SelectItem value="KRAFT">Kraft (K)</SelectItem><SelectItem value="VIRGIN">Virgin (V)</SelectItem></SelectContent>
                                                    </Select>
                                                </TableCell>
                                                <TableCell className="border-r px-2">
                                                    <Select value={normalizeBF(acc.paperBf)} onValueChange={v => handleAccessoryChange(idx, aIdx, 'paperBf', v)}>
                                                        <SelectTrigger className="h-8 px-2"><SelectValue/></SelectTrigger>
                                                        <SelectContent>{bfOptions.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
                                                    </Select>
                                                </TableCell>
                                                <TableCell className="border-r p-0"><Input type="number" value={acc.wastagePercent ?? ''} onChange={e => handleAccessoryChange(idx, aIdx, 'wastagePercent', e.target.value)} className="h-12 text-center px-0 w-full border-none bg-transparent" /></TableCell>
                                                <TableCell className="border-r p-0 bg-orange-50/10"><Input type="number" value={acc.topGsm ?? ''} onChange={e => handleAccessoryChange(idx, aIdx, 'topGsm', e.target.value)} className="h-12 text-center px-0 w-full border-none bg-transparent" /></TableCell>
                                                <TableCell className="border-r p-0 bg-orange-50/10"><Input type="number" value={acc.flute1Gsm ?? ''} onChange={e => handleAccessoryChange(idx, aIdx, 'flute1Gsm', e.target.value)} className="h-12 text-center px-0 w-full border-none bg-transparent" /></TableCell>
                                                {maxPly >= 5 && (
                                                    <>
                                                        <TableCell className="border-r p-0 bg-orange-50/10"><Input type="number" value={acc.middleGsm ?? ''} onChange={e => handleAccessoryChange(idx, aIdx, 'middleGsm', e.target.value)} className={cn("h-12 text-center px-0 w-full border-none", parseInt(acc.ply, 10) < 5 ? "bg-muted/20" : "bg-transparent")} disabled={parseInt(acc.ply, 10) < 5} /></TableCell>
                                                        <TableCell className="border-r p-0 bg-orange-50/10"><Input type="number" value={acc.flute2Gsm ?? ''} onChange={e => handleAccessoryChange(idx, aIdx, 'flute2Gsm', e.target.value)} className={cn("h-12 text-center px-0 w-full border-none", parseInt(acc.ply, 10) < 5 ? "bg-muted/20" : "bg-transparent")} disabled={parseInt(acc.ply, 10) < 5} /></TableCell>
                                                    </>
                                                )}
                                                {maxPly >= 7 && (
                                                    <>
                                                        <TableCell className="border-r p-0 bg-orange-50/10"><Input type="number" value={acc.liner2Gsm ?? ''} onChange={e => handleAccessoryChange(idx, aIdx, 'liner2Gsm', e.target.value)} className={cn("h-12 text-center px-0 w-full border-none", parseInt(acc.ply, 10) < 7 ? "bg-muted/20" : "bg-transparent")} disabled={parseInt(acc.ply, 10) < 7} /></TableCell>
                                                        <TableCell className="border-r p-0 bg-orange-50/10"><Input type="number" value={acc.flute3Gsm ?? ''} onChange={e => handleAccessoryChange(idx, aIdx, 'flute3Gsm', e.target.value)} className={cn("h-12 text-center px-0 w-full border-none", parseInt(acc.ply, 10) < 7 ? "bg-muted/20" : "bg-transparent")} disabled={parseInt(acc.ply, 10) < 7} /></TableCell>
                                                    </>
                                                )}
                                                {maxPly >= 9 && (
                                                    <>
                                                        <TableCell className="border-r p-0 bg-orange-50/10"><Input type="number" value={acc.liner3Gsm ?? ''} onChange={e => handleAccessoryChange(idx, aIdx, 'liner3Gsm', e.target.value)} className={cn("h-12 text-center px-0 w-full border-none", parseInt(acc.ply, 10) < 9 ? "bg-muted/20" : "bg-transparent")} disabled={parseInt(acc.ply, 10) < 9} /></TableCell>
                                                        <TableCell className="border-r p-0 bg-orange-50/10"><Input type="number" value={acc.flute4Gsm ?? ''} onChange={e => handleAccessoryChange(idx, aIdx, 'flute4Gsm', e.target.value)} className={cn("h-12 text-center px-0 w-full border-none", parseInt(acc.ply, 10) < 9 ? "bg-muted/20" : "bg-transparent")} disabled={parseInt(acc.ply, 10) < 9} /></TableCell>
                                                    </>
                                                )}
                                                <TableCell className="border-r p-0 bg-orange-50/10"><Input type="number" value={acc.bottomGsm ?? ''} onChange={e => handleAccessoryChange(idx, aIdx, 'bottomGsm', e.target.value)} className="h-12 text-center px-0 w-full border-none bg-transparent" /></TableCell>
                                                <TableCell className="text-center bg-muted/20 border-r">{acc.calculated?.totalGsm.toFixed(0)}</TableCell>
                                                <TableCell className="text-center bg-muted/20 border-r">{acc.calculated?.paperWeight.toFixed(1)}</TableCell>
                                                <TableCell className="text-center border-r">Rs. {acc.calculated?.paperCost.toFixed(2)}</TableCell>
                                                <TableCell className="text-right pr-6">Rs. {acc.calculated?.paperCost.toFixed(2)}</TableCell>
                                                <TableCell className="px-2">
                                                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive/70" onClick={() => {
                                                        const next = [...items];
                                                        next[idx].accessories = next[idx].accessories!.filter((_, i) => i !== aIdx);
                                                        setItems(next);
                                                    }}><X className="h-3.5 w-3.5" /></Button>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </React.Fragment>
                                ))}
                            </TableBody>
                            {items.length > 0 && (
                                <TableFooter className="bg-muted/50 border-t-2">
                                    <TableRow className="h-12 font-bold">
                                        <TableCell colSpan={maxPly + 12} className="text-right text-sm">Grand Total (Paper Cost)</TableCell>
                                        <TableCell className="text-right pr-6 text-sm text-primary">Rs. {items.reduce((sum, i) => sum + i.calculated.paperCost + (i.accessories?.reduce((aSum, a) => aSum + a.calculated.paperCost, 0) || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                        <TableCell></TableCell>
                                    </TableRow>
                                </TableFooter>
                            )}
                        </Table>
                    </div>
                    <ScrollBar orientation="horizontal" />
                </ScrollArea>
            </CardContent>
        </Card>

        {/* Batch Load Dialog */}
        <Dialog open={isBatchAddDialogOpen} onOpenChange={setIsBatchAddDialogOpen}>
            <DialogContent className="sm:max-w-2xl max-h-[80vh]">
                <DialogHeader>
                    <DialogTitle>Load Products from List</DialogTitle>
                    <DialogDescription>Select multiple products for the current party to add to the calculator.</DialogDescription>
                </DialogHeader>
                <ScrollArea className="pr-4 mt-4">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-12"></TableHead>
                                <TableHead>Product Name</TableHead>
                                <TableHead>Specs</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {companyProducts.map(p => (
                                <TableRow key={p.id}>
                                    <TableCell>
                                        <Checkbox 
                                            checked={selectedBatchProductIds.has(p.id)} 
                                            onCheckedChange={(v) => {
                                                const next = new Set(selectedBatchProductIds);
                                                if (v) next.add(p.id);
                                                else next.delete(p.id);
                                                setSelectedBatchProductIds(next);
                                            }}
                                        />
                                    </TableCell>
                                    <TableCell className="font-medium">{p.name}</TableCell>
                                    <TableCell className="text-xs text-muted-foreground">
                                        {p.specification?.dimension || 'N/A'} • {p.specification?.ply} Ply • {p.specification?.paperType}
                                    </TableCell>
                                </TableRow>
                            ))}
                            {companyProducts.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                                        No products found for this party.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </ScrollArea>
                <DialogFooter>
                    <Button variant="outline" onClick={() => setIsBatchAddDialogOpen(false)}>Cancel</Button>
                    <Button onClick={handleBatchLoad} disabled={selectedBatchProductIds.size === 0}>
                        Load Selected ({selectedBatchProductIds.size})
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>

        <Dialog open={isPartyDialogOpen} onOpenChange={setIsPartyDialogOpen}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader><DialogTitle>Quick Add Party</DialogTitle></DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="space-y-2"><Label>Party Name</Label><Input value={partyForm.name ?? ''} onChange={e => setPartyForm({...partyForm, name: e.target.value})} /></div>
                    <div className="space-y-2"><Label>Address</Label><Textarea value={partyForm.address ?? ''} onChange={e => setPartyForm({...partyForm, address: e.target.value})} /></div>
                </div>
                <DialogFooter><Button onClick={handleSubmitParty}>Add Party</Button></DialogFooter>
            </DialogContent>
        </Dialog>

        <Dialog open={isProductDialogOpen} onOpenChange={setIsProductDialogOpen}>
            <DialogContent className="sm:max-w-5xl max-h-[90vh]">
                <DialogHeader><DialogTitle>Quick Add Product</DialogTitle></DialogHeader>
                <ScrollArea className="pr-4">
                    <ProductForm onSaveSuccess={(data: any) => { 
                        addProductService({...data, createdBy: user?.username}).then(() => {
                            setIsProductDialogOpen(false);
                            toast({ title: 'Product Added' });
                        }); 
                    }} />
                </ScrollArea>
            </DialogContent>
        </Dialog>

        <ManageTermsDialog 
            isOpen={isManageTermsDialogOpen} 
            onOpenChange={setIsManageTermsDialogOpen} 
            masterTerms={costSettings?.termsAndConditions || []} 
            onSave={handleSaveMasterTerms} 
        />

        <QuotationPreviewDialog 
            isOpen={isPreviewOpen} 
            onOpenChange={setIsPreviewOpen} 
            reportNumber={reportNumber} 
            reportDate={reportDate} 
            party={parties.find(p => p.id === selectedPartyId)} 
            items={items.filter(i => selectedForPrint.has(i.id)).map(i => ({...i, totalItemCost: i.calculated.paperCost + (i.accessories?.reduce((sum, a) => sum + a.calculated.paperCost, 0) || 0)}))} 
            products={products}
            termsAndConditions={termsAndConditions}
        />
    </div>
  );
}

function ProductsList({ products, onEdit }: { products: Product[], onEdit: (p: Product) => void }) {
    const [search, setSearch] = useState('');
    
    const filtered = useMemo(() => {
        return products.filter(p => 
            p.name.toLowerCase().includes(search.toLowerCase()) || 
            (p.partyName || '').toLowerCase().includes(search.toLowerCase())
        ).sort((a,b) => a.name.localeCompare(b.name));
    }, [products, search]);

    return (
        <Card>
            <CardHeader className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <div>
                    <CardTitle>Product Specification Catalog</CardTitle>
                    <CardDescription>Manage saved board compositions and dimensions.</CardDescription>
                </div>
                <div className="relative w-full sm:w-72">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input 
                        placeholder="Search products or customers..." 
                        className="pl-8" 
                        value={search ?? ''} 
                        onChange={e => setSearch(e.target.value)} 
                    />
                </div>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Product Name</TableHead>
                            <TableHead>Customer</TableHead>
                            <TableHead>Dimension (mm)</TableHead>
                            <TableHead>Ply</TableHead>
                            <TableHead>Composition (GSM)</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filtered.length > 0 ? filtered.map(p => (
                            <TableRow key={p.id}>
                                <TableCell className="font-bold">{p.name}</TableCell>
                                <TableCell>{p.partyName}</TableCell>
                                <TableCell>{p.specification?.dimension || 'N/A'}</TableCell>
                                <TableCell>{p.specification?.ply} Ply</TableCell>
                                <TableCell className="text-xs text-muted-foreground">
                                    {getGsmDisplay(p.specification)}
                                </TableCell>
                                <TableCell className="text-right">
                                    <Button variant="ghost" size="icon" onClick={() => onEdit(p)}>
                                        <Edit className="h-4 w-4" />
                                    </Button>
                                </TableCell>
                            </TableRow>
                        )) : (
                            <TableRow>
                                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No products found.</TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    );
}

function ProductForm({ productToEdit, onSaveSuccess }: any) {
    const [form, setForm] = useState<any>({ 
        name: '', materialCode: '', partyId: '', 
        specification: { 
            ply: '3', wastagePercent: '3.5', boxType: 'RSC', paperType: 'KRAFT', paperBf: '18 BF', 
            topGsm: '120', flute1Gsm: '100', middleGsm: '', flute2Gsm: '', liner2Gsm: '', flute3Gsm: '', liner3Gsm: '', flute4Gsm: '', bottomGsm: '120', dimension: '',
            weightOfBox: '', moisture: '', load: '', printing: ''
        } 
    });
    const [dim, setDim] = useState({ l: '', b: '', h: '' });
    const [parties, setParties] = useState<Party[]>([]);
    const { toast } = useToast();

    useEffect(() => { onPartiesUpdate(setParties); }, []);
    useEffect(() => {
        if (productToEdit) {
            const [l, b, h] = productToEdit.specification?.dimension?.split('x') || ['', '', ''];
            setDim({ l, b, h });
            setForm({
                ...productToEdit,
                specification: {
                    ...form.specification,
                    ...productToEdit.specification
                }
            });
        }
    }, [productToEdit]);

    const handleSave = () => {
        if (!form.name || !form.partyId) { toast({ title: 'Validation Error', description: 'Name and Party are required.', variant: 'destructive' }); return; }
        const p = parties.find(x => x.id === form.partyId);
        onSaveSuccess({ ...form, partyName: p?.name, partyAddress: p?.address, specification: { ...form.specification, dimension: `${dim.l}x${dim.b}x${dim.h}` } });
    };

    const updateSpec = (f: string, v: string) => setForm((p: any) => ({ ...p, specification: { ...p.specification, [f]: v } }));

    const p = parseInt(form.specification.ply, 10);

    return (
        <div className="space-y-6 pt-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                    <h3 className="text-xs font-bold uppercase border-b pb-1 text-muted-foreground">General Info</h3>
                    <div className="space-y-2"><Label>Product Name</Label><Input value={form.name ?? ''} onChange={e => setForm({...form, name: e.target.value})} /></div>
                    <div className="space-y-2"><Label>Party (Customer)</Label>
                        <Select value={form.partyId ?? ''} onValueChange={v => setForm({...form, partyId: v})}>
                            <SelectTrigger><SelectValue placeholder="Select party..." /></SelectTrigger>
                            <SelectContent>{parties.sort((a,b)=>a.name.localeCompare(b.name)).map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                        </Select>
                    </div>
                </div>
                <div className="space-y-4">
                    <h3 className="text-xs font-bold uppercase border-b pb-1 text-muted-foreground">Dimensions (mm)</h3>
                    <div className="grid grid-cols-3 gap-2">
                        <div><Label className="text-[10px]">L</Label><Input type="number" value={dim.l ?? ''} onChange={e => setDim({...dim, l: e.target.value})} /></div>
                        <div><Label className="text-[10px]">B</Label><Input type="number" value={dim.b ?? ''} onChange={e => setDim({...dim, b: e.target.value})} /></div>
                        <div><Label className="text-[10px]">H</Label><Input type="number" value={dim.h ?? ''} onChange={e => setDim({...dim, h: e.target.value})} /></div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 mt-2">
                        <div><Label className="text-[10px]">Weight (g)</Label><Input value={form.specification.weightOfBox ?? ''} onChange={e => updateSpec('weightOfBox', e.target.value)} /></div>
                        <div><Label className="text-[10px]">Load (KGF)</Label><Input value={form.specification.load ?? ''} onChange={e => updateSpec('load', e.target.value)} /></div>
                    </div>
                </div>
            </div>
            <Separator />
            <div className="space-y-4">
                <h3 className="text-xs font-bold uppercase border-b pb-1 text-muted-foreground">Technical Specs</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div><Label>Ply</Label><Select value={form.specification.ply ?? '3'} onValueChange={v => updateSpec('ply', v)}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{plyOptions.map(opt => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}</SelectContent></Select></div>
                    <div><Label>Paper Type</Label><Select value={form.specification.paperType ?? 'KRAFT'} onValueChange={v => updateSpec('paperType', v)}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="KRAFT">Kraft</SelectItem><SelectItem value="VIRGIN">Virgin</SelectItem><SelectItem value="VIRGIN & KRAFT">Mixed</SelectItem></SelectContent></Select></div>
                    <div><Label>Paper BF</Label><Select value={normalizeBF(form.specification.paperBf)} onValueChange={v => updateSpec('paperBf', v)}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{bfOptions.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent></Select></div>
                    <div><Label>Waste %</Label><Input type="number" value={form.specification.wastagePercent ?? '3.5'} onChange={e => updateSpec('wastagePercent', e.target.value)} /></div>
                </div>
                <div className="p-6 bg-muted/10 rounded-lg space-y-4 border border-dashed">
                    <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">GSM Composition Layers (Up to {p} Ply)</Label>
                    <div className="grid grid-cols-3 md:grid-cols-5 gap-4">
                        <div><Label className="text-[10px] font-bold">L1 (Top)</Label><Input type="number" value={form.specification.topGsm ?? ''} onChange={e => updateSpec('topGsm', e.target.value)} /></div>
                        <div><Label className="text-[10px] font-bold">F1</Label><Input type="number" value={form.specification.flute1Gsm ?? ''} onChange={e => updateSpec('flute1Gsm', e.target.value)} /></div>
                        {p >= 5 && (
                            <>
                                <div><Label className="text-[10px] font-bold">L2 (Mid 1)</Label><Input type="number" value={form.specification.middleGsm ?? ''} onChange={e => updateSpec('middleGsm', e.target.value)} /></div>
                                <div><Label className="text-[10px] font-bold">F2</Label><Input type="number" value={form.specification.flute2Gsm ?? ''} onChange={e => updateSpec('flute2Gsm', e.target.value)} /></div>
                            </>
                        )}
                        {p >= 7 && (
                            <>
                                <div><Label className="text-[10px] font-bold">L3 (Mid 2)</Label><Input type="number" value={form.specification.liner2Gsm ?? ''} onChange={e => updateSpec('liner2Gsm', e.target.value)} /></div>
                                <div><Label className="text-[10px] font-bold">F3</Label><Input type="number" value={form.specification.flute3Gsm ?? ''} onChange={e => updateSpec('flute3Gsm', e.target.value)} /></div>
                            </>
                        )}
                        {p >= 9 && (
                            <>
                                <div><Label className="text-[10px] font-bold">L4 (Mid 3)</Label><Input type="number" value={form.specification.liner3Gsm ?? ''} onChange={e => updateSpec('liner3Gsm', e.target.value)} /></div>
                                <div><Label className="text-[10px] font-bold">F4</Label><Input type="number" value={form.specification.flute4Gsm ?? ''} onChange={e => updateSpec('flute4Gsm', e.target.value)} /></div>
                            </>
                        )}
                        <div><Label className="text-[10px] font-bold">L5 (Bottom)</Label><Input type="number" value={form.specification.bottomGsm ?? ''} onChange={e => updateSpec('bottomGsm', e.target.value)} /></div>
                    </div>
                </div>
                <div className="space-y-2"><Label>Finishing & Printing Instructions</Label><Textarea value={form.specification.printing ?? ''} onChange={e => updateSpec('printing', e.target.value)} placeholder="e.g. 2 Color Flexo printing, Glue closing..." /></div>
            </div>
            <Button className="w-full h-11" onClick={handleSave}>Save Product Record</Button>
        </div>
    );
}

function SavedReportsList({ onEdit }: any) {
    const [reports, setReports] = useState<CostReport[]>([]);
    useEffect(() => onCostReportsUpdate(setReports), []);
    return (
        <Card><CardHeader><CardTitle>Saved Cost Reports</CardTitle></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>Report #</TableHead><TableHead>Date</TableHead><TableHead>Party Name</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader><TableBody>{reports.map(r => (<TableRow key={r.id}><TableCell className="font-mono">{r.reportNumber}</TableCell><TableCell>{toNepaliDate(r.reportDate)}</TableCell><TableCell>{r.partyName}</TableCell><TableCell className="text-right"><Button variant="ghost" size="icon" onClick={() => onEdit(r)}><Edit className="h-4 w-4" /></Button></TableCell></TableRow>))}</TableBody></Table></CardContent></Card>
    );
}

export default function CostReportPage() {
    const [activeTab, setActiveTab] = useState("calculator");
    const [reportToEdit, setReportToEdit] = useState<CostReport | null>(null);
    const [productToEdit, setProductToEdit] = useState<Product | null>(null);
    const [isProductEditorOpen, setIsProductEditorOpen] = useState(false);
    const [products, setProducts] = useState<Product[]>([]);
    const { user } = useAuth();
    const { toast } = useToast();

    useEffect(() => onProductsUpdate(setProducts), []);

    const handleProductEdit = (product: Product) => {
        setProductToEdit(product);
        setIsProductEditorOpen(true);
    };

    return (
        <div className="flex flex-col gap-8">
            <header>
                <h1 className="text-3xl font-bold tracking-tight">Cost Report Generator</h1>
                <p className="text-muted-foreground">Estimate product manufacturing costs and generate quotations.</p>
            </header>
            <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="mb-4">
                    <TabsTrigger value="calculator">Calculator</TabsTrigger>
                    <TabsTrigger value="saved">Saved Reports History</TabsTrigger>
                    <TabsTrigger value="products">Product Catalog</TabsTrigger>
                </TabsList>
                <TabsContent value="calculator" className="pt-0">
                    <CostReportCalculator reportToEdit={reportToEdit} products={products} onSaveSuccess={() => { setReportToEdit(null); setActiveTab("saved"); }} />
                </TabsContent>
                <TabsContent value="saved" className="pt-0">
                    <SavedReportsList onEdit={(r: any) => { setReportToEdit(r); setActiveTab("calculator"); }} />
                </TabsContent>
                <TabsContent value="products" className="pt-0">
                    <ProductsList products={products} onEdit={handleProductEdit} />
                </TabsContent>
            </Tabs>

            <Dialog open={isProductEditorOpen} onOpenChange={setIsProductEditorOpen}>
                <DialogContent className="sm:max-w-5xl max-h-[90vh]">
                    <DialogHeader>
                        <DialogTitle>Edit Product Record</DialogTitle>
                        <DialogDescription>Update the technical specifications for this product.</DialogDescription>
                    </DialogHeader>
                    <ScrollArea className="pr-4">
                        <ProductForm 
                            productToEdit={productToEdit} 
                            onSaveSuccess={(data: any) => {
                                if (productToEdit) {
                                    updateProduct(productToEdit.id, { ...data, lastModifiedBy: user?.username }).then(() => {
                                        setIsProductEditorOpen(false);
                                        setProductToEdit(null);
                                        toast({ title: 'Product Updated' });
                                    });
                                }
                            }} 
                        />
                    </ScrollArea>
                </DialogContent>
            </Dialog>
        </div>
    );
}
