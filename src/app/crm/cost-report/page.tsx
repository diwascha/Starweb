'use client';
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import type { Product, Party, PartyType, CostReport, CostReportItem, ProductSpecification, CostSetting, Accessory as ProductAccessory, CalculatedValues, CostReportTerm } from '@/lib/types';
import { onProductsUpdate, addProduct as addProductService, updateProduct as updateProductService, deleteProduct as deleteProductService } from '@/services/product-service';
import { onPartiesUpdate, addParty } from '@/services/party-service';
import { onCostReportsUpdate, addCostReport, deleteCostReport, generateNextCostReportNumber, updateCostReport } from '@/services/cost-report-service';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Printer, Loader2, Plus, Trash2, ChevronsUpDown, Check, PlusCircle, Edit, Save, MoreHorizontal, HistoryIcon, Image as ImageIcon, Copy, X, ListFilter, FileSpreadsheet } from 'lucide-react';
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
import autoTable from 'jspdf-autotable';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { onSettingUpdate } from '@/services/settings-service';
import React from 'react';

const bfOptions = ['16 BF', '18 BF', '20 BF', '22 BF'];

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
    const plyStr = item.ply || (item.specification ? item.specification.ply : '3');
    const p = parseInt(plyStr, 10);
    let layers: (string | undefined)[] = [];
    if (p === 3) layers = [item.topGsm || item.specification?.topGsm, item.flute1Gsm || item.specification?.flute1Gsm, item.bottomGsm || item.specification?.bottomGsm];
    else if (p === 5) layers = [item.topGsm || item.specification?.topGsm, item.flute1Gsm || item.specification?.flute1Gsm, item.middleGsm || item.specification?.middleGsm, item.flute2Gsm || item.specification?.flute2Gsm, item.bottomGsm || item.specification?.bottomGsm];
    else if (p === 7) layers = [item.topGsm || item.specification?.topGsm, item.flute1Gsm || item.specification?.flute1Gsm, item.liner2Gsm || item.specification?.liner2Gsm, item.flute2Gsm || item.specification?.flute2Gsm, item.liner3Gsm || item.specification?.liner3Gsm, item.flute3Gsm || item.specification?.flute3Gsm, item.bottomGsm || item.specification?.bottomGsm];
    else if (p === 9) layers = [item.topGsm || item.specification?.topGsm, item.flute1Gsm || item.specification?.flute1Gsm, item.liner2Gsm || item.specification?.liner2Gsm, item.flute2Gsm || item.specification?.flute2Gsm, item.liner3Gsm || item.specification?.liner3Gsm, item.flute3Gsm || item.specification?.flute3Gsm, item.liner4Gsm || item.specification?.liner4Gsm, item.flute4Gsm || item.specification?.flute4Gsm, item.bottomGsm || item.specification?.bottomGsm];
    else layers = [item.topGsm || item.specification?.topGsm, item.bottomGsm || item.specification?.bottomGsm];
    return layers.filter(l => l !== undefined && l !== null && String(l).trim() !== '').join('/');
};

const CompactGsmDisplay = ({ item }: { item: any }) => {
    const display = getGsmDisplay(item);
    if (!display || display === 'N/A') return <span>N/A</span>;
    const parts = display.split('/');
    if (parts.length <= 3) return <span>{display}</span>;
    const mid = Math.ceil(parts.length / 2);
    return (
        <div className="flex flex-col leading-tight whitespace-nowrap">
            <span>{parts.slice(0, mid).join('/')}</span>
            <span>{parts.slice(mid).join('/')}</span>
        </div>
    );
};

interface QuotationPreviewDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  reportNumber: string;
  reportDate: Date;
  party: Party | null | undefined;
  items: (CostReportItem & { totalItemCost: number })[];
  products: Product[];
  transportCost?: number;
  transportCostType?: 'Per Piece' | 'Per Consignment';
  termsAndConditions?: CostReportTerm[];
}

function QuotationPreviewDialog({ isOpen, onOpenChange, reportNumber, reportDate, party, items, products, transportCost, transportCostType, termsAndConditions = [] }: QuotationPreviewDialogProps) {
  const printRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);
  const { toast } = useToast();
  
  const selectedTerms = useMemo(() => (termsAndConditions || []).filter(t => t.isSelected), [termsAndConditions]);

  const getProductDisplayName = (productId: string) => {
    const product = products.find(p => p.id === productId);
    return product ? (product.materialCode ? `${product.name} (${product.materialCode})` : product.name) : 'Custom Item';
  };

  const handlePrint = () => {
    const printableArea = printRef.current;
    if (!printableArea) return;
    const printWindow = window.open('', '', 'height=800,width=800');
    printWindow?.document.write('<html><head><title>Print Quotation</title></head><body>');
    printWindow?.document.write(printableArea.innerHTML);
    printWindow?.document.write('</body></html>');
    printWindow?.document.close();
    printWindow?.focus();
    setTimeout(() => { printWindow?.print(); printWindow?.close(); }, 250);
  };
  
  const handleExportPdf = async () => {
    if (!party) return;
    setIsExporting(true);
    try {
        const doc = new jsPDF();
        doc.setFont("Helvetica", "bold").setFontSize(16);
        doc.text("SHIVAM PACKAGING INDUSTRIES PVT LTD.", 105, 20, { align: "center" });
        doc.setFont("Helvetica", "normal").setFontSize(10);
        doc.text("HETAUDA 08, BAGMATI PROVIENCE, NEPAL", 105, 26, { align: "center" });
        doc.setFont("Helvetica", "bold").setFontSize(14).text("QUOTATION", 105, 35, { align: "center" });
        doc.setFontSize(10).text(`To,`, 14, 45);
        doc.setFont("Helvetica", "bold").text(party.name, 14, 50);
        doc.setFont("Helvetica", "normal");
        if (party.address) doc.text(party.address, 14, 55);
        if (party.panNumber) doc.text(`PAN: ${party.panNumber}`, 14, 60);
        doc.text(`Ref No: ${reportNumber}`, 196, 45, { align: 'right' });
        doc.text(`Date: ${toNepaliDate(reportDate.toISOString())} BS (${format(reportDate, "MMMM do, yyyy")})`, 196, 50, { align: 'right' });

        const body = items.flatMap((item, index) => {
            const mainRow = [
                index + 1, getProductDisplayName(item.productId), `${item.l}x${item.b}x${item.h}`, `${item.ply} Ply`,
                `${item.paperType} ${normalizeBF(item.paperBf)}`, getGsmDisplay(item),
                `${(item.calculated?.paperWeight || 0).toFixed(2)}`, `Rs. ${item.totalItemCost.toFixed(2)}`
            ];
            const accRows = (item.accessories || []).map(acc => [
                "", `+ ${acc.name}`, `${acc.l}x${acc.b}x${acc.h}`, `${acc.ply} Ply`,
                `${acc.paperType} ${normalizeBF(acc.paperBf)}`, getGsmDisplay(acc),
                `${(acc.calculated?.paperWeight || 0).toFixed(2)}`, `(${(acc.calculated?.paperCost || 0).toFixed(2)})`
            ]);
            return [mainRow, ...accRows];
        });

        autoTable(doc, {
            startY: 65,
            head: [['Sl.No', 'Particulars', 'Size (mm)', 'Ply', 'Paper', 'GSM', 'Weight (g)', 'Total']],
            body: body,
            theme: 'grid',
            didDrawPage: (data) => {
                let finalY = data.cursor?.y || 65;
                doc.setFontSize(10);
                if (selectedTerms.length > 0) {
                    doc.text("Terms & Conditions:", 14, finalY + 10);
                    selectedTerms.forEach((term, idx) => doc.text(`${idx + 1}. ${term.text}`, 14, finalY + 15 + (idx * 5)));
                }
            }
        });
        doc.save(`Quotation-${reportNumber}.pdf`);
    } catch { toast({ title: 'Error', variant: 'destructive' }); } finally { setIsExporting(false); }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl">
        <DialogHeader>
          <DialogTitle>Quotation Preview</DialogTitle>
          <DialogDescription>Review before exporting.</DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[70vh] bg-gray-100 p-8">
            <div ref={printRef} className="w-[210mm] mx-auto bg-white p-8 text-black shadow-lg">
               <header className="text-center space-y-1 mb-6">
                    <h1 className="text-2xl font-bold">SHIVAM PACKAGING INDUSTRIES PVT LTD.</h1>
                    <p className="text-base">HETAUDA 08, BAGMATI PROVIENCE, NEPAL</p>
                    <h2 className="text-xl font-bold underline mt-2">QUOTATION</h2>
                </header>
                 <div className="grid grid-cols-2 text-sm mb-4">
                    <div><p>To,</p><p className="font-bold">{party?.name}</p><p>{party?.address}</p></div>
                    <div className="text-right"><p>Ref No: {reportNumber}</p><p>Date: {toNepaliDate(reportDate.toISOString())} BS</p></div>
                </div>
                <Table className="text-xs border">
                    <TableHeader className="bg-muted/50">
                        <TableRow>
                            <TableHead className="w-12">S.N.</TableHead>
                            <TableHead>Particulars</TableHead>
                            <TableHead>Size (mm)</TableHead>
                            <TableHead>Ply</TableHead>
                            <TableHead>Paper</TableHead>
                            <TableHead>GSM</TableHead>
                            <TableHead className="text-right">Total</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {items.map((item, index) => (
                           <React.Fragment key={item.id}>
                             <TableRow>
                                <TableCell>{index + 1}</TableCell>
                                <TableCell className="font-bold">{getProductDisplayName(item.productId)}</TableCell>
                                <TableCell>{item.l}x{item.b}x{item.h}</TableCell>
                                <TableCell>{item.ply} Ply</TableCell>
                                <TableCell>{item.paperType} {normalizeBF(item.paperBf)}</TableCell>
                                <TableCell><CompactGsmDisplay item={item} /></TableCell>
                                <TableCell className="text-right font-bold">Rs. {item.totalItemCost.toFixed(2)}</TableCell>
                             </TableRow>
                           </React.Fragment>
                        ))}
                    </TableBody>
                </Table>
            </div>
        </ScrollArea>
        <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
            <Button onClick={handleExportPdf} disabled={isExporting}>{isExporting ? <Loader2 className="animate-spin" /> : <Save className="mr-2 h-4 w-4" />} Save PDF</Button>
            <Button onClick={handlePrint}><Printer className="mr-2 h-4 w-4" /> Print</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const initialCalculatedState: CalculatedValues = {
    sheetSizeL: 0, sheetSizeB: 0, sheetArea: 0, totalGsm: 0, paperWeight: 0, totalBoxWeight: 0, paperRate: 0, paperCost: 0
};

const initialKraftCosts: Record<string, number | ''> = { '16 BF': '', '18 BF': '', '20 BF': '', '22 BF': '' };

function CostReportCalculator({ reportToEdit, onSaveSuccess, onCancelEdit, products }: any) {
  const [parties, setParties] = useState<Party[]>([]);
  const [costReports, setCostReports] = useState<CostReport[]>([]);
  const [selectedPartyId, setSelectedPartyId] = useState('');
  const [reportNumber, setReportNumber] = useState('CR-001');
  const [reportDate, setReportDate] = useState<Date>(new Date());
  const [kraftPaperCosts, setKraftPaperCosts] = useState(initialKraftCosts);
  const [virginPaperCost, setVirginCost] = useState<number | ''>('');
  const [conversionCost, setConversionCost] = useState<number | ''>('');
  const [transportCost, setTransportCost] = useState<number | ''>('');
  const [transportCostType, setTransportCostType] = useState<'Per Piece' | 'Per Consignment'>('Per Consignment');
  const [termsAndConditions, setTermsAndConditions] = useState<CostReportTerm[]>([]);
  const [items, setItems] = useState<CostReportItem[]>([]);
  const [selectedForPrint, setSelectedForPrint] = useState(new Set<string>());
  const [isSaving, setIsSaving] = useState(false);
  const [isPartyDialogOpen, setIsPartyDialogOpen] = useState(false);
  const [partyForm, setPartyForm] = useState<{ name: string, type: PartyType, address?: string, panNumber?: string }>({ name: '', type: 'Customer', address: '', panNumber: '' });
  const [isProductDialogOpen, setIsProductDialogOpen] = useState(false);
  const [isBatchAddDialogOpen, setIsBatchAddDialogOpen] = useState(false);
  const [selectedBatchProductIds, setSelectedBatchProductIds] = useState<Set<string>>(new Set());
  const [pendingIdx, setPendingIdx] = useState<number | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [costSettings, setCostSettings] = useState<CostSetting | null>(null);
  const { toast } = useToast();
  const { user } = useAuth();

  useEffect(() => {
    const unsubCostSettings = onSettingUpdate('costing', (s) => s?.value && setCostSettings(s.value));
    const unsubParties = onPartiesUpdate(setParties);
    const unsubReports = onCostReportsUpdate(setCostReports);
    return () => { unsubCostSettings(); unsubParties(); unsubReports(); };
  }, []);

  const calculateItemCost = useCallback((item: any, globalK: any, globalV: number, globalC: number): CalculatedValues => {
    const l = parseFloat(item.l) || 0, b = parseFloat(item.b) || 0, h = parseFloat(item.h) || 0, pcs = parseInt(item.noOfPcs, 10) || 1;
    if (l <= 0 || b <= 0) return initialCalculatedState;
    const isBox = h > 0;
    let sL = 0, sB = 0;
    if (isBox) {
        const c1 = b + h + 20, d1 = (2 * l) + (2 * b) + 62, c2 = l + h + 20, d2 = (2 * b) + (2 * l) + 62;
        if (c1 * d1 <= c2 * d2) { sL = c1; sB = d1; } else { sL = c2; sB = d2; }
    } else { const d = [l, b].sort((x, y) => y - x); sL = d[0]; sB = d[1]; }
    const ply = parseInt(item.ply, 10) || 0, top = parseInt(item.topGsm, 10) || 0, fl1 = parseInt(item.flute1Gsm, 10) || 0, mid = parseInt(item.middleGsm, 10) || 0, fl2 = parseInt(item.flute2Gsm, 10) || 0, bot = parseInt(item.bottomGsm, 10) || 0;
    const sArea = (sL * sB) / 1000000;
    let tGsm = 0;
    if (ply === 3) tGsm = top + (fl1 * 1.35) + bot;
    else if (ply === 5) tGsm = top + (fl1 * 1.35) + mid + (fl2 * 1.35) + bot;
    else tGsm = top + bot;
    const pWt = sArea * tGsm * pcs;
    const tBWt = pWt * (1 + (parseFloat(item.wastagePercent) / 100 || 0));
    const kC = globalK[normalizeBF(item.paperBf)] || 0;
    let pRate = item.paperType === 'VIRGIN' ? globalV : kC;
    const finalRate = pRate + globalC;
    return { sheetSizeL: sL, sheetSizeB: sB, sheetArea: sArea, totalGsm: tGsm, paperWeight: pWt, totalBoxWeight: tBWt, paperRate: finalRate, paperCost: (tBWt / 1000) * finalRate };
  }, []);

  useEffect(() => {
    if (!reportToEdit && costSettings) {
        generateNextCostReportNumber(costReports).then(setReportNumber);
        setKraftPaperCosts(costSettings.kraftPaperCosts || initialKraftCosts);
        setVirginCost(costSettings.virginPaperCost || '');
        setConversionCost(costSettings.conversionCost || '');
    }
  }, [reportToEdit, costReports, costSettings]);

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
        bottomGsm: spec.bottomGsm || '120',
        wastagePercent: spec.wastagePercent || '3.5',
        accessories: []
    };
    return { ...base, calculated: calculateItemCost(base, kraftPaperCosts, Number(virginPaperCost) || 0, Number(conversionCost) || 0) };
  }, [calculateItemCost, kraftPaperCosts, virginPaperCost, conversionCost]);

  const handleAddItem = () => {
    const base = { id: Date.now().toString(), productId: '', l:'',b:'',h:'', noOfPcs:'1', ply:'3', fluteType: 'B', paperType: 'KRAFT', paperBf:'18 BF', paperShade: 'NS', boxType: 'RSC', topGsm:'120',flute1Gsm:'100',middleGsm:'',flute2Gsm:'',bottomGsm:'120', wastagePercent:'3.5', accessories: [] };
    const newItem = { ...base, calculated: calculateItemCost(base, kraftPaperCosts, Number(virginPaperCost) || 0, Number(conversionCost) || 0) };
    setItems([...items, newItem]);
    setSelectedForPrint(new Set(selectedForPrint).add(newItem.id));
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
        if (product) {
            item = mapProductToItem(product);
        }
    }

    next[idx] = { ...item, calculated: calculateItemCost(item, kraftPaperCosts, Number(virginPaperCost) || 0, Number(conversionCost) || 0) };
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

  const companyProducts = useMemo(() => {
    if (!selectedPartyId) return [];
    return products.filter(p => p.partyId === selectedPartyId).sort((a,b) => a.name.localeCompare(b.name));
  }, [products, selectedPartyId]);

  return (
    <div className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="shadow-sm">
                <CardHeader className="py-3 px-4 border-b"><CardTitle className="text-sm">Report Details</CardTitle></CardHeader>
                <CardContent className="pt-4 space-y-4">
                    <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1"><Label className="text-[10px]">Report No</Label><Input value={reportNumber} readOnly className="h-8 text-xs bg-muted" /></div>
                        <div className="space-y-1"><Label className="text-[10px]">Date</Label><Button variant="outline" className="w-full h-8 text-xs"><CalendarIcon className="mr-2 h-3 w-3" /> {toNepaliDate(reportDate.toISOString())}</Button></div>
                    </div>
                    <div className="space-y-1">
                        <Label className="text-[10px]">Party Name</Label>
                        <div className="flex gap-2">
                            <Select value={selectedPartyId} onValueChange={setSelectedPartyId}>
                                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select party..." /></SelectTrigger>
                                <SelectContent>{parties.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                            </Select>
                            <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setIsPartyDialogOpen(true)}><Plus className="h-4 w-4" /></Button>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card className="shadow-sm">
                <CardHeader className="py-3 px-4 border-b"><CardTitle className="text-sm">Global Rates (NPR)</CardTitle></CardHeader>
                <CardContent className="pt-4 grid grid-cols-2 gap-4">
                    <div className="space-y-2 col-span-2">
                        <Label className="text-[10px] font-bold">Kraft BF Rates</Label>
                        <div className="grid grid-cols-2 gap-2">
                            {bfOptions.map(bf => (
                                <div key={bf} className="flex items-center gap-2">
                                    <span className="text-[10px] w-12">{bf}</span>
                                    <Input type="number" className="h-8 text-xs" value={kraftPaperCosts[normalizeBF(bf)] || ''} onChange={e => setKraftPaperCosts({...kraftPaperCosts, [normalizeBF(bf)]: e.target.value === '' ? '' : parseFloat(e.target.value)})} />
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="space-y-1"><Label className="text-[10px]">Virgin Rate</Label><Input type="number" value={virginPaperCost} onChange={e => setVirginCost(e.target.value === '' ? '' : parseFloat(e.target.value))} className="h-8 text-xs" /></div>
                    <div className="space-y-1"><Label className="text-[10px]">Conversion</Label><Input type="number" value={conversionCost} onChange={e => setConversionCost(e.target.value === '' ? '' : parseFloat(e.target.value))} className="h-8 text-xs" /></div>
                </CardContent>
            </Card>

            <Card className="shadow-sm">
                <CardHeader className="py-3 px-4 border-b"><CardTitle className="text-sm">Terms & Transport</CardTitle></CardHeader>
                <CardContent className="pt-4 space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1"><Label className="text-[10px]">Transport</Label><Input type="number" value={transportCost} onChange={e => setTransportCost(e.target.value === '' ? '' : parseFloat(e.target.value))} className="h-8 text-xs" /></div>
                        <div className="space-y-1"><Label className="text-[10px]">Basis</Label>
                            <Select value={transportCostType} onValueChange={(v: any) => setTransportCostType(v)}>
                                <SelectTrigger className="h-8 text-xs"><SelectValue/></SelectTrigger>
                                <SelectContent><SelectItem value="Per Piece">Per Piece</SelectItem><SelectItem value="Per Consignment">Lump Sum</SelectItem></SelectContent>
                            </Select>
                        </div>
                    </div>
                    <div className="pt-2">
                        <p className="text-[10px] text-muted-foreground uppercase font-bold mb-2">Terms & Conditions</p>
                        <ScrollArea className="h-20 border rounded p-2 bg-muted/10">
                            {costSettings?.termsAndConditions?.map((term, idx) => (
                                <div key={idx} className="flex items-center space-x-2 mb-1">
                                    <Checkbox 
                                        id={`term-${idx}`} 
                                        checked={termsAndConditions.find(t => t.text === term.text)?.isSelected} 
                                        onCheckedChange={(v) => {
                                            const next = [...termsAndConditions];
                                            const existingIdx = next.findIndex(t => t.text === term.text);
                                            if (existingIdx > -1) next[existingIdx].isSelected = !!v;
                                            else next.push({ text: term.text, isSelected: !!v });
                                            setTermsAndConditions(next);
                                        }}
                                    />
                                    <Label htmlFor={`term-${idx}`} className="text-[10px] cursor-pointer">{term.text}</Label>
                                </div>
                            ))}
                        </ScrollArea>
                    </div>
                </CardContent>
            </Card>
        </div>

        <Card className="shadow-lg overflow-hidden border-t-4 border-t-primary">
            <CardHeader className="flex flex-row items-center gap-4 bg-muted/20 py-4 px-6">
                <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={handleAddItem}><Plus className="mr-2 h-4 w-4" /> Add Item</Button>
                    <Button size="sm" variant="outline" onClick={() => setIsBatchAddDialogOpen(true)} disabled={!selectedPartyId}>
                        <FileSpreadsheet className="mr-2 h-4 w-4" /> Load from List
                    </Button>
                    <Button size="sm" onClick={() => setIsSaving(true)}><Save className="mr-2 h-4 w-4" /> Save Report</Button>
                    <Button size="sm" variant="outline" onClick={() => setIsPreviewOpen(true)}><ImageIcon className="mr-2 h-4 w-4" /> Preview Quotation</Button>
                </div>
                <div className="ml-auto text-right">
                    <CardTitle className="text-lg">Product Cost Breakdown</CardTitle>
                    <CardDescription>Detailed technical analysis and weight calculation</CardDescription>
                </div>
            </CardHeader>
            <CardContent className="p-0">
                <ScrollArea className="w-full">
                    <div className="p-4">
                        <Table className="text-[11px] border min-w-[2200px]">
                            <TableHeader className="bg-muted/50">
                                <TableRow>
                                    <TableHead rowSpan={2} className="w-10 px-2"></TableHead>
                                    <TableHead rowSpan={2} className="min-w-[250px]">Item Name / Product</TableHead>
                                    <TableHead colSpan={3} className="text-center border-x">Size (mm)</TableHead>
                                    <TableHead rowSpan={2} className="text-center min-w-[80px]">Pcs</TableHead>
                                    <TableHead rowSpan={2} className="text-center min-w-[80px]">Ply</TableHead>
                                    <TableHead rowSpan={2} className="text-center min-w-[150px]">Type (K/V/M)</TableHead>
                                    <TableHead rowSpan={2} className="text-center min-w-[130px]">Paper BF</TableHead>
                                    <TableHead rowSpan={2} className="text-center min-w-[80px]">Waste %</TableHead>
                                    <TableHead colSpan={5} className="text-center border-x">GSM Composition</TableHead>
                                    <TableHead rowSpan={2} className="text-center min-w-[80px]">T.GSM</TableHead>
                                    <TableHead rowSpan={2} className="text-center min-w-[90px]">Weight (g)</TableHead>
                                    <TableHead rowSpan={2} className="text-center min-w-[120px]">Paper Cost</TableHead>
                                    <TableHead rowSpan={2} className="text-right min-w-[120px] pr-6">Total NPR</TableHead>
                                    <TableHead rowSpan={2} className="w-20"></TableHead>
                                </TableRow>
                                <TableRow>
                                    <TableHead className="text-center border-l min-w-[90px]">L</TableHead>
                                    <TableHead className="text-center min-w-[90px]">B</TableHead>
                                    <TableHead className="text-center border-r min-w-[90px]">H</TableHead>
                                    <TableHead className="text-center border-l min-w-[85px]">Top</TableHead>
                                    <TableHead className="text-center min-w-[85px]">Flute1</TableHead>
                                    <TableHead className="text-center min-w-[85px]">Mid</TableHead>
                                    <TableHead className="text-center min-w-[85px]">Flute2</TableHead>
                                    <TableHead className="text-center border-r min-w-[85px]">Bot</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {items.map((item, idx) => (
                                    <TableRow key={item.id} className="h-14 hover:bg-muted/30">
                                        <TableCell className="px-2"><Checkbox checked={selectedForPrint.has(item.id)} onCheckedChange={v => { const n = new Set(selectedForPrint); if(v) n.add(item.id); else n.delete(item.id); setSelectedForPrint(n); }} /></TableCell>
                                        <TableCell>
                                            <div className="flex gap-1">
                                                <Button variant="outline" size="icon" className="h-7 w-7 shrink-0" onClick={() => { setPendingIdx(idx); setIsProductDialogOpen(true); }}><Plus className="h-3 w-3" /></Button>
                                                <Select value={item.productId} onValueChange={v => handleItemChange(idx, 'productId', v)}>
                                                    <SelectTrigger className="h-8 text-[10px] w-full"><SelectValue placeholder="Select product..." /></SelectTrigger>
                                                    <SelectContent>{products.sort((a,b)=>a.name.localeCompare(b.name)).map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                                                </Select>
                                            </div>
                                        </TableCell>
                                        <TableCell className="border-l"><Input type="number" value={item.l} onChange={e => handleItemChange(idx, 'l', e.target.value)} className="h-8 text-center px-0 w-full border-none focus-visible:ring-0" /></TableCell>
                                        <TableCell><Input type="number" value={item.b} onChange={e => handleItemChange(idx, 'b', e.target.value)} className="h-8 text-center px-0 w-full border-none focus-visible:ring-0" /></TableCell>
                                        <TableCell className="border-r"><Input type="number" value={item.h} onChange={e => handleItemChange(idx, 'h', e.target.value)} className="h-8 text-center px-0 w-full border-none focus-visible:ring-0" /></TableCell>
                                        <TableCell><Input type="number" value={item.noOfPcs} onChange={e => handleItemChange(idx, 'noOfPcs', e.target.value)} className="h-8 text-center px-0 w-full border-none focus-visible:ring-0" /></TableCell>
                                        <TableCell>
                                            <Select value={item.ply} onValueChange={v => handleItemChange(idx, 'ply', v)}>
                                                <SelectTrigger className="h-8 text-center px-1"><SelectValue/></SelectTrigger>
                                                <SelectContent><SelectItem value="3">3</SelectItem><SelectItem value="5">5</SelectItem></SelectContent>
                                            </Select>
                                        </TableCell>
                                        <TableCell>
                                            <Select value={item.paperType} onValueChange={v => handleItemChange(idx, 'paperType', v)}>
                                                <SelectTrigger className="h-8 px-1"><SelectValue/></SelectTrigger>
                                                <SelectContent><SelectItem value="KRAFT">Kraft (K)</SelectItem><SelectItem value="VIRGIN">Virgin (V)</SelectItem><SelectItem value="VIRGIN & KRAFT">Mixed (M)</SelectItem></SelectContent>
                                            </Select>
                                        </TableCell>
                                        <TableCell>
                                            <Select value={normalizeBF(item.paperBf)} onValueChange={v => handleItemChange(idx, 'paperBf', v)}>
                                                <SelectTrigger className="h-8 px-1"><SelectValue/></SelectTrigger>
                                                <SelectContent>{bfOptions.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
                                            </Select>
                                        </TableCell>
                                        <TableCell><Input type="number" value={item.wastagePercent} onChange={e => handleItemChange(idx, 'wastagePercent', e.target.value)} className="h-8 text-center px-0 w-full border-none focus-visible:ring-0" /></TableCell>
                                        <TableCell className="border-l"><Input type="number" value={item.topGsm} onChange={e => handleItemChange(idx, 'topGsm', e.target.value)} className="h-8 text-center px-0 w-full border-none focus-visible:ring-0" /></TableCell>
                                        <TableCell><Input type="number" value={item.flute1Gsm} onChange={e => handleItemChange(idx, 'flute1Gsm', e.target.value)} className="h-8 text-center px-0 w-full border-none focus-visible:ring-0" /></TableCell>
                                        <TableCell><Input type="number" value={item.middleGsm} onChange={e => handleItemChange(idx, 'middleGsm', e.target.value)} className="h-8 text-center px-0 w-full border-none focus-visible:ring-0" disabled={item.ply === '3'} /></TableCell>
                                        <TableCell><Input type="number" value={item.flute2Gsm} onChange={e => handleItemChange(idx, 'flute2Gsm', e.target.value)} className="h-8 text-center px-0 w-full border-none focus-visible:ring-0" disabled={item.ply === '3'} /></TableCell>
                                        <TableCell className="border-r"><Input type="number" value={item.bottomGsm} onChange={e => handleItemChange(idx, 'bottomGsm', e.target.value)} className="h-8 text-center px-0 w-full border-none focus-visible:ring-0" /></TableCell>
                                        <TableCell className="text-center font-medium bg-muted/10">{item.calculated?.totalGsm.toFixed(0)}</TableCell>
                                        <TableCell className="text-center font-medium bg-muted/10">{item.calculated?.paperWeight.toFixed(0)}</TableCell>
                                        <TableCell className="text-center font-medium bg-muted/20">{item.calculated?.paperCost.toFixed(2)}</TableCell>
                                        <TableCell className="text-right font-bold pr-6">Rs. {item.calculated?.paperCost.toFixed(2)}</TableCell>
                                        <TableCell className="px-2">
                                            <div className="flex gap-1">
                                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setItems(items.filter(i => i.id !== item.id))}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                    <ScrollBar orientation="horizontal" />
                </ScrollArea>
            </CardContent>
        </Card>

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
                    <div className="space-y-2"><Label>Party Name</Label><Input value={partyForm.name} onChange={e => setPartyForm({...partyForm, name: e.target.value})} /></div>
                    <div className="space-y-2"><Label>Address</Label><Textarea value={partyForm.address} onChange={e => setPartyForm({...partyForm, address: e.target.value})} /></div>
                </div>
                <DialogFooter><Button onClick={handleSubmitParty}>Add Party</Button></DialogFooter>
            </DialogContent>
        </Dialog>

        <Dialog open={isProductDialogOpen} onOpenChange={setIsProductDialogOpen}>
            <DialogContent className="sm:max-w-5xl max-h-[90vh]">
                <DialogHeader><DialogTitle>Quick Add Product</DialogTitle></DialogHeader>
                <ScrollArea className="pr-4">
                    <ProductForm onSaveSuccess={(data: any) => { addProductService({...data, createdBy: user?.username}).then(() => setIsProductDialogOpen(false)); }} />
                </ScrollArea>
            </DialogContent>
        </Dialog>

        <QuotationPreviewDialog isOpen={isPreviewOpen} onOpenChange={setIsPreviewOpen} reportNumber={reportNumber} reportDate={reportDate} party={parties.find(p => p.id === selectedPartyId)} items={items.filter(i => selectedForPrint.has(i.id)).map(i => ({...i, totalItemCost: i.calculated.paperCost}))} products={products} transportCost={Number(transportCost)} transportCostType={transportCostType} termsAndConditions={termsAndConditions} />
    </div>
  );
}

function ProductForm({ productToEdit, onSaveSuccess }: any) {
    const [form, setForm] = useState<any>({ name: '', materialCode: '', partyId: '', specification: { ply: '3', wastagePercent: '3.5', boxType: 'RSC', paperType: 'KRAFT', paperBf: '18 BF', topGsm: '120', flute1Gsm: '100', middleGsm: '', flute2Gsm: '', bottomGsm: '120', dimension: '' } });
    const [dim, setDim] = useState({ l: '', b: '', h: '' });
    const [parties, setParties] = useState<Party[]>([]);
    const { toast } = useToast();

    useEffect(() => { onPartiesUpdate(setParties); }, []);
    useEffect(() => {
        if (productToEdit) {
            const [l, b, h] = productToEdit.specification?.dimension?.split('x') || ['', '', ''];
            setDim({ l, b, h });
            setForm(productToEdit);
        }
    }, [productToEdit]);

    const handleSave = () => {
        if (!form.name || !form.partyId) { toast({ title: 'Validation Error', variant: 'destructive' }); return; }
        const p = parties.find(x => x.id === form.partyId);
        onSaveSuccess({ ...form, partyName: p?.name, partyAddress: p?.address, specification: { ...form.specification, dimension: `${dim.l}x${dim.b}x${dim.h}` } });
    };

    const updateSpec = (f: string, v: string) => setForm((p: any) => ({ ...p, specification: { ...p.specification, [f]: v } }));

    return (
        <div className="space-y-6 pt-2">
            <div className="grid grid-cols-2 gap-6">
                <div className="space-y-4">
                    <h3 className="text-xs font-bold uppercase border-b pb-1">General Info</h3>
                    <div className="space-y-2"><Label>Product Name</Label><Input value={form.name} onChange={e => setForm({...form, name: e.target.value})} /></div>
                    <div className="space-y-2"><Label>Party (Customer)</Label>
                        <Select value={form.partyId} onValueChange={v => setForm({...form, partyId: v})}>
                            <SelectTrigger><SelectValue placeholder="Select party..." /></SelectTrigger>
                            <SelectContent>{parties.sort((a,b)=>a.name.localeCompare(b.name)).map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                        </Select>
                    </div>
                </div>
                <div className="space-y-4">
                    <h3 className="text-xs font-bold uppercase border-b pb-1">Dimensions (mm)</h3>
                    <div className="grid grid-cols-3 gap-2">
                        <div><Label className="text-[10px]">L</Label><Input type="number" value={dim.l} onChange={e => setDim({...dim, l: e.target.value})} /></div>
                        <div><Label className="text-[10px]">B</Label><Input type="number" value={dim.b} onChange={e => setDim({...dim, b: e.target.value})} /></div>
                        <div><Label className="text-[10px]">H</Label><Input type="number" value={dim.h} onChange={e => setDim({...dim, h: e.target.value})} /></div>
                    </div>
                </div>
            </div>
            <Separator />
            <div className="space-y-4">
                <h3 className="text-xs font-bold uppercase border-b pb-1">Technical Specs</h3>
                <div className="grid grid-cols-4 gap-4">
                    <div><Label>Ply</Label><Select value={form.specification.ply} onValueChange={v => updateSpec('ply', v)}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="3">3</SelectItem><SelectItem value="5">5</SelectItem></SelectContent></Select></div>
                    <div><Label>Paper Type</Label><Select value={form.specification.paperType} onValueChange={v => updateSpec('paperType', v)}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="KRAFT">Kraft</SelectItem><SelectItem value="VIRGIN">Virgin</SelectItem><SelectItem value="VIRGIN & KRAFT">Mixed</SelectItem></SelectContent></Select></div>
                    <div><Label>Paper BF</Label><Select value={normalizeBF(form.specification.paperBf)} onValueChange={v => updateSpec('paperBf', v)}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{bfOptions.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent></Select></div>
                    <div><Label>Waste %</Label><Input type="number" value={form.specification.wastagePercent} onChange={e => updateSpec('wastagePercent', e.target.value)} /></div>
                </div>
                <div className="p-4 bg-muted/20 rounded-md space-y-4">
                    <Label className="text-xs font-bold">GSM Layers</Label>
                    <div className="grid grid-cols-5 gap-4">
                        <div><Label className="text-[10px]">Top</Label><Input type="number" value={form.specification.topGsm} onChange={e => updateSpec('topGsm', e.target.value)} /></div>
                        <div><Label className="text-[10px]">Flute 1</Label><Input type="number" value={form.specification.flute1Gsm} onChange={e => updateSpec('flute1Gsm', e.target.value)} /></div>
                        <div><Label className="text-[10px]">Middle</Label><Input type="number" value={form.specification.middleGsm} onChange={e => updateSpec('middleGsm', e.target.value)} disabled={form.specification.ply === '3'} /></div>
                        <div><Label className="text-[10px]">Flute 2</Label><Input type="number" value={form.specification.flute2Gsm} onChange={e => updateSpec('flute2Gsm', e.target.value)} disabled={form.specification.ply === '3'} /></div>
                        <div><Label className="text-[10px]">Bottom</Label><Input type="number" value={form.specification.bottomGsm} onChange={e => updateSpec('bottomGsm', e.target.value)} /></div>
                    </div>
                </div>
            </div>
            <Button className="w-full" onClick={handleSave}>Save Product</Button>
        </div>
    );
}

function SavedReportsList({ onEdit }: any) {
    const [reports, setReports] = useState<CostReport[]>([]);
    useEffect(() => onCostReportsUpdate(setReports), []);
    return (
        <Card><CardHeader><CardTitle>Saved Cost Reports</CardTitle></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>Report #</TableHead><TableHead>Date</TableHead><TableHead>Party Name</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader><TableBody>{reports.map(r => (<TableRow key={r.id}><TableCell>{r.reportNumber}</TableCell><TableCell>{toNepaliDate(r.reportDate)}</TableCell><TableCell>{r.partyName}</TableCell><TableCell className="text-right"><Button variant="ghost" size="icon" onClick={() => onEdit(r)}><Edit className="h-4 w-4" /></Button></TableCell></TableRow>))}</TableBody></Table></CardContent></Card>
    );
}

export default function CostReportPage() {
    const [activeTab, setActiveTab] = useState("calculator");
    const [reportToEdit, setReportToEdit] = useState<CostReport | null>(null);
    const [products, setProducts] = useState<Product[]>([]);
    useEffect(() => onProductsUpdate(setProducts), []);
    return (
        <div className="flex flex-col gap-8"><header><h1 className="text-3xl font-bold">Cost Report Generator</h1></header><Tabs value={activeTab} onValueChange={setActiveTab}><TabsList><TabsTrigger value="calculator">Calculator</TabsTrigger><TabsTrigger value="saved">Saved Reports</TabsTrigger></TabsList><TabsContent value="calculator" className="pt-4"><CostReportCalculator reportToEdit={reportToEdit} products={products} onSaveSuccess={() => { setReportToEdit(null); setActiveTab("saved"); }} onCancelEdit={() => setReportToEdit(null)} /></TabsContent><TabsContent value="saved" className="pt-4"><SavedReportsList onEdit={(r: any) => { setReportToEdit(r); setActiveTab("calculator"); }} /></TabsContent></Tabs></div>
    );
}
