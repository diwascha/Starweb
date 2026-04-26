'use client';
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import type { Product, Party, PartyType, CostReport, CostReportItem, ProductSpecification, CostSetting, Accessory as ProductAccessory, Product as ProductType, CostReportTerm } from '@/lib/types';
import { onProductsUpdate, addProduct as addProductService, updateProduct as updateProductService, deleteProduct as deleteProductService } from '@/services/product-service';
import { onPartiesUpdate, addParty } from '@/services/party-service';
import { onCostReportsUpdate, addCostReport, deleteCostReport, generateNextCostReportNumber, updateCostReport } from '@/services/cost-report-service';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Printer, Loader2, Plus, Trash2, ChevronsUpDown, Check, PlusCircle, Edit, Save, MoreHorizontal, HistoryIcon, Image as ImageIcon, Copy, ChevronDown, ChevronUp, X } from 'lucide-react';
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
import html2canvas from 'html2canvas';
import { AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { onSettingUpdate, updateCostSettings } from '@/services/settings-service';
import React from 'react';

const bfOptions = ['16 BF', '18 BF', '20 BF', '22 BF'];

const normalizeBF = (val: any): string => {
  if (val === undefined || val === null || val === '') return "";
  const trimmed = String(val).trim();
  if (/^\d+$/.test(trimmed)) {
    return `${trimmed} BF`;
  }
  const match = trimmed.match(/^(\d+)\s*bf$/i);
  if (match) {
    return `${match[1]} BF`;
  }
  return trimmed;
};

const getGsmDisplay = (item: any) => {
    if (!item) return 'N/A';
    const plyStr = item.ply || (item.specification ? item.specification.ply : '3');
    const p = parseInt(plyStr, 10);
    
    let layers: (string | undefined)[] = [];
    if (p === 3) {
        layers = [item.topGsm || item.specification?.topGsm, item.flute1Gsm || item.specification?.flute1Gsm, item.bottomGsm || item.specification?.bottomGsm];
    } else if (p === 5) {
        layers = [item.topGsm || item.specification?.topGsm, item.flute1Gsm || item.specification?.flute1Gsm, item.middleGsm || item.specification?.middleGsm, item.flute2Gsm || item.specification?.flute2Gsm, item.bottomGsm || item.specification?.bottomGsm];
    } else if (p === 7) {
        layers = [item.topGsm || item.specification?.topGsm, item.flute1Gsm || item.specification?.flute1Gsm, item.liner2Gsm || item.specification?.liner2Gsm, item.flute2Gsm || item.specification?.flute2Gsm, item.liner3Gsm || item.specification?.liner3Gsm, item.flute3Gsm || item.specification?.flute3Gsm, item.bottomGsm || item.specification?.bottomGsm];
    } else if (p === 9) {
        layers = [item.topGsm || item.specification?.topGsm, item.flute1Gsm || item.specification?.flute1Gsm, item.liner2Gsm || item.specification?.liner2Gsm, item.flute2Gsm || item.specification?.flute2Gsm, item.liner3Gsm || item.specification?.liner3Gsm, item.flute3Gsm || item.specification?.flute3Gsm, item.liner4Gsm || item.specification?.liner4Gsm, item.flute4Gsm || item.specification?.flute4Gsm, item.bottomGsm || item.specification?.bottomGsm];
    } else {
        layers = [item.topGsm || item.specification?.topGsm, item.bottomGsm || item.specification?.bottomGsm];
    }
    
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

  const formatAccessoryDimension = (acc: ProductAccessory) => {
    const dims = [acc.l, acc.b, acc.h].filter(d => d && parseFloat(d) > 0);
    return dims.join('x');
  };
  
   const getProductDisplayName = (productId: string) => {
    const product = products.find(p => p.id === productId);
    if (!product) return 'Custom Item';
    return product.materialCode ? `${product.name} (${product.materialCode})` : product.name;
  };

  const handlePrint = () => {
    const printableArea = printRef.current;
    if (!printableArea) return;
    const printWindow = window.open('', '', 'height=800,width=800');
    printWindow?.document.write('<html><head><title>Print Quotation</title>');
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
  
    const handleExportPdf = async () => {
        if (!party) return;
        setIsExporting(true);
        try {
            const doc = new jsPDF();
            doc.setFont("Helvetica", "bold");
            doc.setFontSize(16);
            doc.text("SHIVAM PACKAGING INDUSTRIES PVT LTD.", doc.internal.pageSize.getWidth() / 2, 20, { align: "center" });
            doc.setFont("Helvetica", "normal");
            doc.setFontSize(10);
            doc.text("HETAUDA 08, BAGMATI PROVIENCE, NEPAL", doc.internal.pageSize.getWidth() / 2, 26, { align: "center" });
            doc.setFont("Helvetica", "bold");
            doc.setFontSize(14);
            doc.text("QUOTATION", doc.internal.pageSize.getWidth() / 2, 35, { align: "center" });
            doc.setFontSize(10);
            doc.text(`To,`, 14, 45);
            doc.setFont("Helvetica", "bold");
            doc.text(party.name, 14, 50);
            doc.setFont("Helvetica", "normal");
            if (party.address) doc.text(party.address, 14, 55);
            if (party.panNumber) doc.text(`PAN: ${party.panNumber}`, 14, 60);
            doc.text(`Ref No: ${reportNumber}`, doc.internal.pageSize.getWidth() - 14, 45, { align: 'right' });
            doc.text(`Date: ${toNepaliDate(reportDate.toISOString())} BS (${format(reportDate, "MMMM do, yyyy")})`, doc.internal.pageSize.getWidth() - 14, 50, { align: 'right' });

            const body = items.flatMap((item, index) => {
                const productName = getProductDisplayName(item.productId);
                const getGsmPdf = (it: any) => {
                    const g = getGsmDisplay(it);
                    const parts = g.split('/');
                    if (parts.length <= 3) return g;
                    const mid = Math.ceil(parts.length / 2);
                    return parts.slice(0, mid).join('/') + '\n' + parts.slice(mid).join('/');
                };
                const mainRow = [
                    index + 1, productName, `${item.l}x${item.b}x${item.h}`, `${item.ply} Ply, ${item.boxType}`,
                    `${item.paperType} ${normalizeBF(item.paperBf)}`, getGsmPdf(item),
                     `${(item.calculated?.paperWeight || 0).toFixed(2)}`, `Rs. ${item.totalItemCost.toFixed(2)}`
                ];
                const accessoriesRows = (item.accessories || []).map(acc => [
                    "", `+ ${acc.name}`, formatAccessoryDimension(acc as ProductAccessory), `${acc.ply} Ply`,
                    `${acc.paperType} ${normalizeBF(acc.paperBf)}`, getGsmPdf(acc),
                    `${(acc.calculated?.paperWeight || 0).toFixed(2)}`, `(${(acc.calculated?.paperCost || 0).toFixed(2)})`
                ]);
                return [mainRow, ...accessoriesRows];
            });

            if (transportCost && transportCostType === 'Per Consignment') {
                body.push(["", "Transport Cost (Consignment)", "", "", "", "", "", `Rs. ${transportCost.toFixed(2)}`]);
            }
            
            autoTable(doc, {
                startY: 65,
                head: [['Sl.No', 'Particulars', 'Box Size (mm)', 'Ply, Type', 'Paper', 'GSM', 'Box Wt (Grams)', 'Total']],
                body: body,
                theme: 'grid',
                headStyles: { fillColor: [230, 230, 230], textColor: 20, fontStyle: 'bold' },
                didDrawPage: (data: any) => {
                    let finalY = data.cursor.y;
                    doc.setFontSize(10);
                    if (selectedTerms.length > 0) {
                        doc.text("Terms & Conditions:", 14, finalY + 10);
                        selectedTerms.forEach((term, idx) => {
                            doc.text(`${idx + 1}. ${term.text}`, 14, finalY + 15 + (idx * 5));
                        });
                    }
                    doc.setFontSize(8);
                    doc.setTextColor(100);
                    doc.text("Disclaimer: This document is electronically generated and does not require a signature.", doc.internal.pageSize.getWidth() / 2, doc.internal.pageSize.getHeight() - 15, { align: 'center' });
                }
            });
            doc.save(`Quotation-${reportNumber}.pdf`);
        } catch (error) {
            toast({ title: 'Error', description: 'Failed to export PDF.', variant: 'destructive' });
        } finally {
            setIsExporting(false);
        }
    };

    const handleExportJpg = async () => {
        if (!printRef.current) return;
        setIsExporting(true);
        try {
            const canvas = await html2canvas(printRef.current, { scale: 3, useCORS: true, backgroundColor: '#ffffff' });
            const link = document.createElement('a');
            link.download = `Quotation-${reportNumber}.jpg`;
            link.href = canvas.toDataURL('image/jpeg', 0.9);
            link.click();
        } catch (error) {
            toast({ title: 'Export Failed', description: `Could not export invoice as JPG.`, variant: 'destructive' });
        } finally {
            setIsExporting(false);
        }
    };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl">
        <DialogHeader>
          <DialogTitle>Quotation Preview</DialogTitle>
          <DialogDescription>Review the quotation before printing.</DialogDescription>
        </DialogHeader>
        <div className="max-h-[70vh] overflow-auto bg-gray-100 p-8">
            <div ref={printRef} className="w-[210mm] mx-auto bg-white p-8 text-black">
               <header className="text-center space-y-1 mb-6">
                    <h1 className="text-2xl font-bold">SHIVAM PACKAGING INDUSTRIES PVT LTD.</h1>
                    <p className="text-base">HETAUDA 08, BAGMATI PROVIENCE, NEPAL</p>
                    <h2 className="text-xl font-bold underline mt-2">QUOTATION</h2>
                </header>
                 <div className="grid grid-cols-2 text-sm mb-4">
                    <div>
                        <p>To,</p>
                        <p className="font-bold">{party?.name}</p>
                        <p>{party?.address}</p>
                        {party?.panNumber && <p>PAN No: {party.panNumber}</p>}
                    </div>
                    <div className="text-right">
                        <p>Ref No: {reportNumber}</p>
                        <p>Date: {toNepaliDate(reportDate.toISOString())} BS ({format(reportDate, "MMMM do, yyyy")})</p>
                    </div>
                </div>
                <Table className="text-xs">
                    <TableHeader>
                        <TableRow>
                            <TableHead>Sl.No</TableHead>
                            <TableHead>Particulars</TableHead>
                            <TableHead>Box Size (mm)</TableHead>
                            <TableHead>Ply, Type</TableHead>
                            <TableHead>Paper</TableHead>
                            <TableHead>GSM</TableHead>
                            <TableHead>Box Wt (Grams)</TableHead>
                            <TableHead className="text-right">Total</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {items.map((item, index) => (
                           <React.Fragment key={item.id}>
                             <TableRow>
                                <TableCell>{index + 1}</TableCell>
                                <TableCell>{getProductDisplayName(item.productId)}</TableCell>
                                <TableCell>{item.l}x{item.b}x{item.h}</TableCell>
                                <TableCell>{item.ply} Ply, {item.boxType}</TableCell>
                                <TableCell>{item.paperType} {normalizeBF(item.paperBf)}</TableCell>
                                <TableCell><CompactGsmDisplay item={item} /></TableCell>
                                <TableCell>{(item.calculated?.paperWeight || 0).toFixed(2)}</TableCell>
                                <TableCell className="text-right font-bold">Rs. {item.totalItemCost.toFixed(2)}</TableCell>
                             </TableRow>
                             {(item.accessories || []).map((acc) => (
                                 <TableRow key={acc.id} className="bg-muted/30">
                                     <TableCell></TableCell>
                                     <TableCell className="pl-6">+ {acc.name}</TableCell>
                                     <TableCell>{formatAccessoryDimension(acc as ProductAccessory)}</TableCell>
                                     <TableCell>{acc.ply} Ply</TableCell>
                                     <TableCell>{acc.paperType} {normalizeBF(acc.paperBf)}</TableCell>
                                     <TableCell><CompactGsmDisplay item={acc} /></TableCell>
                                     <TableCell>{(acc.calculated?.paperWeight || 0).toFixed(2)}</TableCell>
                                     <TableCell className="text-right">({(acc.calculated?.paperCost || 0).toFixed(2)})</TableCell>
                                 </TableRow>
                             ))}
                           </React.Fragment>
                        ))}
                        {!!transportCost && transportCostType === 'Per Consignment' && (
                            <TableRow className="font-bold">
                                <TableCell colSpan={7} className="text-right">Transport Cost (Lump Sum)</TableCell>
                                <TableCell className="text-right">Rs. {transportCost.toFixed(2)}</TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
                {selectedTerms.length > 0 && (
                    <div className="mt-8">
                        <h4 className="font-bold">Terms & Conditions:</h4>
                        <ul className="list-disc list-inside text-sm">
                            {selectedTerms.map((term, i) => <li key={i}>{term.text}</li>)}
                        </ul>
                    </div>
                )}
                 <div className="mt-16 text-center text-[10px] text-muted-foreground border-t pt-4">
                    <p>Disclaimer: This document is electronically generated and does not require a signature.</p>
                </div>
            </div>
        </div>
        <DialogFooter className="sm:justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button variant="outline" onClick={handleExportJpg} disabled={isExporting}>
                {isExporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <ImageIcon className="mr-2 h-4 w-4"/>} Export as JPG
            </Button>
            <Button variant="outline" onClick={handleExportPdf} disabled={isExporting}>
                {isExporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Save className="mr-2 h-4 w-4"/>} Export as PDF
            </Button>
            <Button onClick={handlePrint}><Printer className="mr-2 h-4 w-4" /> Print</Button>
        </DialogFooter>
      </Dialog>
    </Dialog>
  );
}

const initialCalculatedState: CalculatedValues = {
    sheetSizeL: 0, sheetSizeB: 0, sheetArea: 0, totalGsm: 0, paperWeight: 0, totalBoxWeight: 0, paperRate: 0, paperCost: 0
};

const initialKraftCosts: Record<string, number | ''> = {
    '16 BF': '', '18 BF': '', '20 BF': '', '22 BF': ''
};

interface Accessory extends ProductAccessory {
  calculated: CalculatedValues;
}

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
  const [kraftPaperCosts, setKraftPaperCosts] = useState<Record<string, number | ''>>(initialKraftCosts);
  const [virginPaperCost, setVirginCost] = useState<number | ''>('');
  const [conversionCost, setConversionCost] = useState<number | ''>('');
  const [transportCost, setTransportCost] = useState<number | ''>('');
  const [transportCostType, setTransportCostType] = useState<'Per Piece' | 'Per Consignment'>('Per Consignment');
  const [termsAndConditions, setTermsAndConditions] = useState<CostReportTerm[]>([]);
  const [newTerm, setNewTerm] = useState('');
  const [isCostHistoryDialogOpen, setIsCostHistoryDialogOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [items, setItems] = useState<CostReportItem[]>([]);
  const [selectedForPrint, setSelectedForPrint] = useState<Set<string>>(new Set());
  const { toast } = useToast();
  const { user } = useAuth();
  
  const [isPartyDialogOpen, setIsPartyDialogOpen] = useState(false);
  const [partyForm, setPartyForm] = useState<{ name: string; type: PartyType; address?: string; panNumber?: string; }>({ name: '', type: 'Customer', address: '', panNumber: '' });
  
  const [isProductDialogOpen, setIsProductDialogOpen] = useState(false);
  const [productFormForAdd, setProductFormForAdd] = useState<any>(null);
  const [pendingProductIdx, setPendingProductIdx] = useState<number | null>(null);

  const [partySearch, setPartySearch] = useState('');
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [costSettings, setCostSettings] = useState<CostSetting | null>(null);
  const [productSearch, setProductSearch] = useState('');

  const sortedParties = useMemo(() => [...parties].sort((a, b) => a.name.localeCompare(b.name)), [parties]);
  const sortedProducts = useMemo(() => [...products].sort((a, b) => a.name.localeCompare(b.name)), [products]);

  useEffect(() => {
    const unsubCostSettings = onSettingUpdate('costing', (setting) => {
        if (setting?.value) setCostSettings(setting.value as CostSetting);
    });
    return () => unsubCostSettings();
  }, []);

  const calculateItemCost = useCallback((item: any, globalKraftCosts: Record<string, number>, globalVirginCost: number, globalConversionCost: number): CalculatedValues => {
    const l = parseFloat(item.l) || 0;
    const b = parseFloat(item.b) || 0;
    const h = parseFloat(item.h) || 0;
    const noOfPcs = parseInt(item.noOfPcs, 10) || 1;
    const isBox = l > 0 && b > 0 && h > 0;
    let sheetSizeL, sheetSizeB;
    if (isBox) {
        const cutOff1 = b + h + 20;
        const deckle1 = (2 * l) + (2 * b) + 62;
        const cutOff2 = l + h + 20;
        const deckle2 = (2 * b) + (2 * l) + 62;
        if (cutOff1 * deckle1 <= cutOff2 * deckle2) { sheetSizeL = cutOff1; sheetSizeB = deckle1; }
        else { sheetSizeL = cutOff2; sheetSizeB = deckle2; }
    } else {
        const dims = [l, b, h].filter(dim => dim > 0).sort((a, b) => b - a);
        if (dims.length < 2) return initialCalculatedState;
        sheetSizeL = dims[0]; sheetSizeB = dims[1];
    }
    if (sheetSizeL === 0 || sheetSizeB === 0) return initialCalculatedState;
    const ply = parseInt(item.ply, 10) || 0;
    const getFluteFactor = (f: string) => f === 'A' ? 1.55 : 1.35;
    const fluteTypes = (item.fluteType || 'B').split('/');
    const f1 = getFluteFactor(fluteTypes[0]);
    const f2 = getFluteFactor(fluteTypes[1] || fluteTypes[0]);
    const f3 = getFluteFactor(fluteTypes[2] || fluteTypes[1] || fluteTypes[0]);
    const f4 = getFluteFactor(fluteTypes[3] || fluteTypes[2] || fluteTypes[1] || fluteTypes[0]);
    const top = parseInt(item.topGsm, 10) || 0;
    const fl1 = parseInt(item.flute1Gsm, 10) || 0;
    const mid = parseInt(item.middleGsm, 10) || 0;
    const fl2 = parseInt(item.flute2Gsm, 10) || 0;
    const bot = parseInt(item.bottomGsm, 10) || 0;
    const li2 = parseInt(item.liner2Gsm, 10) || 0;
    const fl3 = parseInt(item.flute3Gsm, 10) || 0;
    const li3 = parseInt(item.liner3Gsm, 10) || 0;
    const fl4 = parseInt(item.flute4Gsm, 10) || 0;
    const li4 = parseInt(item.liner4Gsm, 10) || 0;
    const sheetArea = (sheetSizeL * sheetSizeB) / 1000000;
    let totalGsm = 0;
    if (ply === 3) totalGsm = top + (fl1 * f1) + bot;
    else if (ply === 5) totalGsm = top + (fl1 * f1) + mid + (fl2 * f2) + bot;
    else if (ply === 7) totalGsm = top + (fl1 * f1) + li2 + (fl2 * f2) + li3 + (fl3 * f3) + bot;
    else if (ply === 9) totalGsm = top + (fl1 * f1) + li2 + (fl2 * f2) + li3 + (fl3 * f3) + li4 + (fl4 * f4) + bot;
    else if (ply <= 2) totalGsm = top + (ply === 2 ? (fl1 * f1) + bot : 0);
    const paperWeight = (sheetArea * totalGsm) * noOfPcs;
    const totalBoxWeight = paperWeight * (1 + (parseFloat(item.wastagePercent) / 100 || 0));
    const kraftCost = globalKraftCosts[normalizeBF(item.paperBf)] || 0;
    let paperRate = 0;
    if (item.paperType === 'VIRGIN') paperRate = globalVirginCost;
    else if (item.paperType === 'VIRGIN & KRAFT' && top > 0) paperRate = (top * globalVirginCost + (totalGsm - top) * kraftCost) / totalGsm;
    else paperRate = kraftCost;
    const finalRate = paperRate + globalConversionCost;
    return { sheetSizeL, sheetSizeB, sheetArea, totalGsm, paperWeight, totalBoxWeight, paperRate: finalRate, paperCost: (totalBoxWeight / 1000) * finalRate };
  }, []);

  const handleCostChange = (type: string, val: string, bf?: string) => {
    const n = val === '' ? '' : parseFloat(val);
    if (type === 'kraft' && bf) setKraftPaperCosts(prev => ({...prev, [normalizeBF(bf)]: n}));
    else if (type === 'virgin') setVirginCost(n);
    else if (type === 'conversion') setConversionCost(n);
  };

  useEffect(() => {
    const k = Object.fromEntries(Object.entries(kraftPaperCosts).map(([b, c]) => [normalizeBF(b), Number(c) || 0]));
    const v = Number(virginPaperCost) || 0;
    const c = Number(conversionCost) || 0;
    setItems(prev => prev.map(i => ({...i, calculated: calculateItemCost(i, k, v, c), accessories: (i.accessories || []).map(a => ({...a, calculated: calculateItemCost(a, k, v, c)}))})));
  }, [kraftPaperCosts, virginPaperCost, conversionCost, calculateItemCost]);

  useEffect(() => {
    const unsubParties = onPartiesUpdate(setParties);
    const unsubCostReports = onCostReportsUpdate(setCostReports);
    return () => { unsubParties(); unsubCostReports(); };
  }, []);

  const initializedRef = useRef(false);
  useEffect(() => {
    if (initializedRef.current && !reportToEdit) return;
    if (reportToEdit) {
      setReportNumber(reportToEdit.reportNumber); setReportDate(new Date(reportToEdit.reportDate)); setSelectedPartyId(reportToEdit.partyId);
      const k = { ...initialKraftCosts };
      for (const b in k) k[normalizeBF(b)] = reportToEdit.kraftPaperCosts?.[normalizeBF(b)] || (costSettings?.kraftPaperCosts?.[normalizeBF(b)] ?? '');
      setKraftPaperCosts(k); setVirginCost(reportToEdit.virginPaperCost || (costSettings?.virginPaperCost ?? '')); setConversionCost(reportToEdit.conversionCost || (costSettings?.conversionCost ?? ''));
      setTransportCost(reportToEdit.transportCost ?? ''); setTransportCostType(reportToEdit.transportCostType ?? 'Per Consignment');
      setTermsAndConditions((reportToEdit.termsAndConditions || []).map(t => typeof t === 'string' ? { text: t, isSelected: true } : t));
      const kCalc = Object.fromEntries(Object.entries(reportToEdit.kraftPaperCosts || {}).map(([b, c]) => [normalizeBF(b), c]));
      const vC = reportToEdit.virginPaperCost || 0; const cC = reportToEdit.conversionCost || 0;
      setItems(reportToEdit.items.map(i => ({ ...i, paperBf: normalizeBF(i.paperBf), calculated: calculateItemCost(i, kCalc, vC, cC), accessories: (i.accessories || []).map(a => ({...a, paperBf: normalizeBF(a.paperBf), calculated: calculateItemCost(a, kCalc, vC, cC)}))})));
      setSelectedForPrint(new Set(reportToEdit.items.map(i => i.id))); initializedRef.current = true;
    } else if (costSettings && !initializedRef.current) {
        generateNextCostReportNumber(costReports).then(setReportNumber); setReportDate(new Date()); setSelectedPartyId('');
        setKraftPaperCosts(costSettings.kraftPaperCosts || initialKraftCosts); setVirginCost(costSettings.virginPaperCost || ''); setConversionCost(costSettings.conversionCost || '');
        setTermsAndConditions((costSettings.termsAndConditions || []).map(t => typeof t === 'string' ? { text: t, isSelected: true } : t));
        setTransportCost(''); setTransportCostType('Per Consignment'); setItems([]); setSelectedForPrint(new Set()); initializedRef.current = true;
    }
  }, [reportToEdit, costReports, calculateItemCost, costSettings]);

  const handleProductSelect = (idx: number, pId: string) => {
    const p = products.find(prod => prod.id === pId);
    if (!p) return;
    const [l,b,h] = p.specification.dimension?.split('x') || ['','',''];
    const k = Object.fromEntries(Object.entries(kraftPaperCosts).map(([bf, cost]) => [normalizeBF(bf), Number(cost) || 0]));
    const v = Number(virginPaperCost) || 0; const c = Number(conversionCost) || 0;
    const accs = (p.accessories || []).map(a => ({...a, paperBf: normalizeBF(a.paperBf), calculated: calculateItemCost(a, k, v, c)}));
    setItems(prev => {
        const next = [...prev];
        const up = { ...next[idx], productId: p.id, l: l || '', b: b || '', h: h || '', ply: p.specification.ply || '3', paperType: p.specification.paperType || 'KRAFT', paperBf: normalizeBF(p.specification.paperBf) || '18 BF', boxType: p.specification.boxType || 'RSC', wastagePercent: p.specification.wastagePercent || '3.5', topGsm: p.specification.topGsm || '120', flute1Gsm: p.specification.flute1Gsm || '100', middleGsm: p.specification.middleGsm || '', flute2Gsm: p.specification.flute2Gsm || '', bottomGsm: p.specification.bottomGsm || '120', accessories: accs };
        next[idx] = { ...up, calculated: calculateItemCost(up, k, v, c) };
        return next;
    });
  };

  const handleItemChange = (idx: number, f: string, v: string) => {
    const k = Object.fromEntries(Object.entries(kraftPaperCosts).map(([bf, cost]) => [normalizeBF(bf), Number(cost) || 0]));
    const vi = Number(virginPaperCost) || 0; const co = Number(conversionCost) || 0;
    setItems(prev => {
        const next = [...prev];
        const item = { ...next[idx], [f]: f === 'paperBf' ? normalizeBF(v) : v };
        next[idx] = { ...item, calculated: calculateItemCost(item, k, vi, co) };
        return next;
    });
  };

  const handleAddItem = () => {
    const k = Object.fromEntries(Object.entries(kraftPaperCosts).map(([bf, cost]) => [normalizeBF(bf), Number(cost) || 0]));
    const vi = Number(virginPaperCost) || 0; const co = Number(conversionCost) || 0;
    const base = { id: Date.now().toString(), productId: '', l:'',b:'',h:'', noOfPcs:'1', ply:'3', fluteType: 'B', paperType: 'KRAFT', paperBf:'18 BF', paperShade: 'NS', boxType: 'RSC', topGsm:'120',flute1Gsm:'100',middleGsm:'',flute2Gsm:'',bottomGsm:'120', liner2Gsm: '', flute3Gsm: '', liner3Gsm: '', flute4Gsm: '', liner4Gsm: '', wastagePercent:'3.5', accessories: [] };
    const item = { ...base, calculated: calculateItemCost(base, k, vi, co) };
    setItems(prev => [...prev, item]); setSelectedForPrint(prev => new Set(prev).add(item.id));
  };

  const handleSaveReport = async () => {
      if (!user || !selectedPartyId) { toast({ title: "Error", description: "Select a party.", variant: "destructive" }); return; }
      setIsSaving(true);
      try {
           const k = Object.fromEntries(Object.entries(kraftPaperCosts).map(([b, c]) => [normalizeBF(b), Number(c) || 0]));
           const v = Number(virginPaperCost) || 0; const c = Number(conversionCost) || 0;
           const itemCost = items.reduce((s, i) => s + (i.calculated?.paperCost || 0) + (i.accessories || []).reduce((as, a) => as + (a.calculated?.paperCost || 0), 0), 0);
           const transport = transportCostType === 'Per Piece' ? items.reduce((s, i) => s + (parseInt(i.noOfPcs, 10) || 0) * Number(transportCost), 0) : Number(transportCost);
           const data = { reportNumber, reportDate: reportDate.toISOString(), partyId: selectedPartyId, partyName: parties.find(p => p.id === selectedPartyId)?.name || '', kraftPaperCosts: k, virginPaperCost: v, conversionCost: c, transportCost: Number(transportCost) || 0, transportCostType, termsAndConditions, items: items.map(({ calculated, accessories, ...i }) => ({ ...i, paperBf: normalizeBF(i.paperBf), accessories: (accessories || []).map(({ calculated: ac, ...a }) => ({ ...a, paperBf: normalizeBF(a.paperBf) })) })), totalCost: itemCost + transport, createdBy: user.username };
           await updateCostSettings({ kraftPaperCosts: k, virginPaperCost: v, conversionCost: c }, user.username);
           if (reportToEdit) await updateCostReport(reportToEdit.id, {...data, lastModifiedBy: user.username});
           else await addCostReport(data);
           toast({ title: "Success", description: "Saved." }); onSaveSuccess();
      } catch { toast({ title: "Error", description: "Failed.", variant: "destructive" }); } finally { setIsSaving(false); }
  };

  const handlePrintPreview = () => {
    if (!selectedPartyId || !items.some(i => selectedForPrint.has(i.id))) { toast({ title: "Error", description: "Select party and items.", variant: "destructive" }); return; }
    setIsPreviewOpen(true);
  };

  const printableItems = useMemo(() => items.filter(i => selectedForPrint.has(i.id)).map(i => {
    const accCost = (i.accessories || []).reduce((s, a) => s + (a.calculated?.paperCost || 0), 0);
    const transport = transportCostType === 'Per Piece' ? (parseInt(i.noOfPcs, 10) || 0) * Number(transportCost) : 0;
    return { ...i, totalItemCost: (i.calculated?.paperCost || 0) + accCost + transport };
  }), [items, selectedForPrint, transportCost, transportCostType]);

  const maxPly = useMemo(() => items.reduce((m, i) => Math.max(m, parseInt(i.ply, 10) || 0, (i.accessories || []).reduce((am, a) => Math.max(am, parseInt(a.ply, 10) || 0), 0)), 3), [items]);

  const handlePartySubmit = async () => {
    if(!user) return;
    if(!partyForm.name || !partyForm.type) {
        toast({title: 'Error', description: 'Party name and type are required.', variant: 'destructive'});
        return;
    }
    try {
        const newPartyId = await addParty({...partyForm, createdBy: user.username});
        setSelectedPartyId(newPartyId);
        toast({title: 'Success', description: 'New party added.'});
        setIsPartyDialogOpen(false);
        setPartyForm({name: '', type: 'Customer', address: '', panNumber: ''});
    } catch {
         toast({title: 'Error', description: 'Failed to save party.', variant: 'destructive'});
    }
  };

  const handleQuickAddProduct = async (formData: any) => {
    if (!user) return;
    try {
        const party = parties.find(p => p.id === formData.partyId);
        const data = { ...formData, partyName: party?.name || '', partyAddress: party?.address || '' };
        const newProductId = await addProductService({ ...data, createdBy: user.username, createdAt: new Date().toISOString() });
        
        if (pendingProductIdx !== null) {
            handleProductSelect(pendingProductIdx, newProductId);
        }
        
        toast({ title: 'Success', description: 'New product added.' });
        setIsProductDialogOpen(false);
        setProductFormForAdd(null);
        setPendingProductIdx(null);
    } catch {
        toast({ title: 'Error', description: 'Failed to add product.', variant: 'destructive' });
    }
  };

  return (
    <div className="flex flex-col gap-6">
        {reportToEdit && (
            <div className="flex justify-between items-center bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 p-4 rounded-md" role="alert">
                <p className="font-bold">Editing Report #{reportToEdit.reportNumber}</p>
                <Button variant="ghost" onClick={onCancelEdit}>Cancel Edit</Button>
            </div>
        )}
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="shadow-md">
                <CardHeader className="py-3 px-4 border-b">
                    <CardTitle className="text-sm flex items-center gap-2">Report Details</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 gap-4 pt-4">
                    <div className="space-y-1">
                        <Label className="text-[10px]">Report Number</Label>
                        <Input value={reportNumber} readOnly className="bg-muted/50 h-8 text-xs" />
                    </div>
                    <div className="space-y-1">
                        <Label className="text-[10px]">Report Date</Label>
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button variant="outline" className="w-full justify-start h-8 text-xs"><CalendarIcon className="mr-2 h-3 w-3" /> {toNepaliDate(reportDate.toISOString())} BS</Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0"><DualCalendar selected={reportDate} onSelect={(d) => d && setReportDate(d)} /></PopoverContent>
                        </Popover>
                    </div>
                    <div className="space-y-1">
                        <Label className="text-[10px]">Party Name</Label>
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button variant="outline" className="w-full justify-between h-8 text-xs">{selectedPartyId ? parties.find(p => p.id === selectedPartyId)?.name : "Select party..."}<ChevronsUpDown className="ml-2 h-3 w-3 opacity-50" /></Button>
                            </PopoverTrigger>
                            <PopoverContent className="p-0">
                                <Command>
                                    <CommandInput placeholder="Search or add party..." onValueChange={setPartySearch}/>
                                    <CommandList>
                                        <CommandEmpty>
                                            <div className="p-2">
                                                <Button variant="outline" size="sm" className="w-full justify-start gap-2" onClick={() => { setPartyForm({ ...partyForm, name: partySearch }); setIsPartyDialogOpen(true); }}>
                                                    <PlusCircle className="h-4 w-4" /> Add "{partySearch}"
                                                </Button>
                                            </div>
                                        </CommandEmpty>
                                        <CommandGroup>{sortedParties.map(p => (<CommandItem key={p.id} value={p.name} onSelect={() => setSelectedPartyId(p.id)}>{p.name}</CommandItem>))}</CommandGroup>
                                    </CommandList>
                                </Command>
                            </PopoverContent>
                        </Popover>
                    </div>
                </CardContent>
            </Card>

            <Card className="shadow-md">
                <CardHeader className="py-3 px-4 border-b">
                    <div className="flex items-center justify-between">
                        <CardTitle className="text-sm flex items-center gap-2">Additional Costs</CardTitle>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setIsCostHistoryDialogOpen(true)}><HistoryIcon className="h-3 w-3" /></Button>
                    </div>
                </CardHeader>
                <CardContent className="pt-4 space-y-4">
                    <div className="space-y-2 p-3 border rounded-md bg-muted/20">
                        <Label className="text-[10px] font-bold">Kraft Rates</Label>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                            {bfOptions.map(bf => (
                                <div key={bf} className="flex items-center justify-between gap-2">
                                    <Label className="text-[10px] whitespace-nowrap">{bf}</Label>
                                    <Input type="number" className="w-20 h-9 text-xs px-2" value={kraftPaperCosts[normalizeBF(bf)] ?? ''} onChange={e => handleCostChange('kraft', e.target.value, bf)} />
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <Label className="text-[10px]">Virgin Rate</Label>
                            <Input type="number" className="h-9 text-xs" value={virginPaperCost} onChange={e => handleCostChange('virgin', e.target.value)} />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-[10px]">Conversion</Label>
                            <Input type="number" className="h-9 text-xs" value={conversionCost} onChange={e => handleCostChange('conversion', e.target.value)} />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <Label className="text-[10px]">Transport</Label>
                            <Input type="number" className="h-9 text-xs" value={transportCost} onChange={e => setTransportCost(e.target.value === '' ? '' : parseFloat(e.target.value))} />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-[10px]">Basis</Label>
                            <Select value={transportCostType} onValueChange={(v: any) => setTransportCostType(v)}>
                                <SelectTrigger className="h-9 text-xs">
                                    <SelectValue/>
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Per Piece">Per Piece</SelectItem>
                                    <SelectItem value="Per Consignment">Per Consignment</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card className="shadow-md">
                <CardHeader className="py-3 px-4 border-b">
                    <CardTitle className="text-sm">Terms & Conditions</CardTitle>
                </CardHeader>
                <CardContent className="pt-4 space-y-4">
                    <ScrollArea className="h-32 pr-2">
                        <div className="space-y-2">
                            {termsAndConditions.map((t, i) => (
                                <div key={i} className="flex items-center gap-2 group">
                                    <Checkbox checked={t.isSelected} onCheckedChange={(v) => { const next = [...termsAndConditions]; next[i].isSelected = !!v; setTermsAndConditions(next); }} />
                                    <Input value={t.text} onChange={(e) => { const next = [...termsAndConditions]; next[i].text = e.target.value; setTermsAndConditions(next); }} className="h-7 text-[10px]" />
                                    <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 text-destructive" onClick={() => setTermsAndConditions(termsAndConditions.filter((_, idx) => idx !== i))}><Trash2 className="h-3 w-3" /></Button>
                                </div>
                            ))}
                        </div>
                    </ScrollArea>
                    <div className="flex gap-2">
                        <Input value={newTerm} onChange={e => setNewTerm(e.target.value)} placeholder="Add new term..." className="h-8 text-xs" />
                        <Button size="icon" className="h-8 w-8" onClick={() => { if(newTerm.trim()) { setTermsAndConditions([...termsAndConditions, { text: newTerm.trim(), isSelected: true }]); setNewTerm(''); } }}><Plus className="h-3 w-3" /></Button>
                    </div>
                </CardContent>
            </Card>
        </div>

        <Card className="shadow-lg border-t-4 border-t-primary">
            <CardHeader className="py-4 px-6 border-b flex flex-row items-center justify-between">
                <div>
                    <CardTitle className="text-lg">Product Cost Breakdown</CardTitle>
                    <CardDescription>Comprehensive board and weight calculations</CardDescription>
                </div>
                <div className="flex gap-3">
                    <Button size="sm" variant="outline" onClick={handleAddItem}><Plus className="mr-2 h-4 w-4"/> Add Manual Item</Button>
                    <Button size="sm" variant="secondary" onClick={handlePrintPreview}><ImageIcon className="mr-2 h-4 w-4"/> Preview Quotation</Button>
                    <Button size="sm" onClick={handleSaveReport} disabled={isSaving}>{isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4"/>} Save Report</Button>
                </div>
            </CardHeader>
            <CardContent className="p-0">
                <ScrollArea className="w-full">
                    <div className="p-4">
                        <Table className="text-xs min-w-[1600px]">
                            <TableHeader>
                                <TableRow className="h-10 bg-muted/30">
                                    <TableHead rowSpan={2} className="w-[40px] px-2"><Checkbox checked={selectedForPrint.size === items.length && items.length > 0} onCheckedChange={v => setSelectedForPrint(v ? new Set(items.map(i => i.id)) : new Set())}/></TableHead>
                                    <TableHead rowSpan={2} className="min-w-[220px]">Item Name</TableHead>
                                    <TableHead colSpan={3} className="text-center border-x">Box Size (mm)</TableHead>
                                    <TableHead rowSpan={2} className="text-center w-[70px]">Pcs</TableHead>
                                    <TableHead rowSpan={2} className="text-center w-[80px]">Ply</TableHead>
                                    <TableHead rowSpan={2} className="text-center w-[100px]">Type (K/V/M)</TableHead>
                                    <TableHead rowSpan={2} className="text-center w-[110px]">Paper BF</TableHead>
                                    <TableHead rowSpan={2} className="text-center w-[80px]">Waste %</TableHead>
                                    <TableHead colSpan={maxPly} className="text-center border-x">GSM Layers</TableHead>
                                    <TableHead rowSpan={2} className="text-center w-[80px]">T.GSM</TableHead>
                                    <TableHead rowSpan={2} className="text-center w-[80px]">Wt(g)</TableHead>
                                    <TableHead rowSpan={2} className="text-center w-[80px]">Total Wt</TableHead>
                                    <TableHead rowSpan={2} className="text-center w-[100px]">Paper Rs</TableHead>
                                    <TableHead rowSpan={2} className="text-right w-[100px] pr-6">Total</TableHead>
                                    <TableHead rowSpan={2} className="w-[80px]"></TableHead>
                                </TableRow>
                                <TableRow className="h-10 bg-muted/10">
                                    <TableHead className="text-center border-l w-[70px]">L</TableHead>
                                    <TableHead className="text-center w-[70px]">B</TableHead>
                                    <TableHead className="text-center border-r w-[70px]">H</TableHead>
                                    <TableHead className="text-center border-l w-[70px]">T</TableHead>
                                    <TableHead className="text-center w-[70px]">F1</TableHead>
                                    {maxPly >= 5 && <TableHead className="text-center w-[70px]">F2</TableHead>}
                                    {maxPly >= 5 && <TableHead className="text-center w-[70px]">M</TableHead>}
                                    {maxPly >= 7 && <TableHead className="text-center w-[70px]">F3</TableHead>}
                                    <TableHead className="text-center border-r w-[70px]">B</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {items.map((item, idx) => (
                                    <React.Fragment key={item.id}>
                                        <TableRow className="hover:bg-muted/50 h-16">
                                            <TableCell className="px-2"><Checkbox checked={selectedForPrint.has(item.id)} onCheckedChange={v => { const next = new Set(selectedForPrint); if(v) next.add(item.id); else next.delete(item.id); setSelectedForPrint(next); }}/></TableCell>
                                            <TableCell className="min-w-[220px]">
                                                <div className="flex gap-2">
                                                    <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={() => { const k = Object.fromEntries(Object.entries(kraftPaperCosts).map(([b, c]) => [normalizeBF(b), Number(c) || 0])); const vi = Number(virginPaperCost) || 0; const co = Number(conversionCost) || 0; const acc = { id: Date.now().toString(), name: 'Acc', l:'',b:'',h:'0', noOfPcs:'1', ply:'0', fluteType:'B', paperType:'KRAFT', paperBf:'18 BF', wastagePercent:'3.5', topGsm:'120', flute1Gsm:'' }; setItems(prev => { const next = [...prev]; next[idx].accessories = [...(next[idx].accessories || []), { ...acc, calculated: calculateItemCost(acc, k, vi, co) }]; return next; }); }}><Plus className="h-4 w-4" /></Button>
                                                    <Popover>
                                                        <PopoverTrigger asChild><Button variant="outline" className="w-full h-9 text-[11px] justify-start truncate">{products.find(p => p.id === item.productId)?.name || "Select product..."}</Button></PopoverTrigger>
                                                        <PopoverContent className="p-0 w-[--radix-popover-trigger-width]"><Command><CommandInput placeholder="Search or add product..." onValueChange={setProductSearch} /><CommandList><CommandEmpty>
                                                                <div className="p-2">
                                                                    <Button variant="outline" size="sm" className="w-full justify-start gap-2" onClick={() => { 
                                                                        setProductFormForAdd({ name: productSearch, materialCode: '', partyId: selectedPartyId, specification: { ply: '3', wastagePercent: '3.5', boxType: 'RSC', paperType: 'KRAFT', paperBf: '18 BF', topGsm: '120', flute1Gsm: '100', bottomGsm: '120' }, accessories: [] });
                                                                        setPendingProductIdx(idx);
                                                                        setIsProductDialogOpen(true);
                                                                    }}><PlusCircle className="h-4 w-4" /> Add "{productSearch}"</Button>
                                                                </div>
                                                            </CommandEmpty><CommandGroup>{sortedProducts.map(p => (<CommandItem key={p.id} value={p.name} onSelect={() => handleProductSelect(idx, p.id)}>{p.name}</CommandItem>))}</CommandGroup></CommandList></Command></PopoverContent>
                                                    </Popover>
                                                </div>
                                            </TableCell>
                                            <TableCell className="border-l"><Input type="number" value={item.l} onChange={e => handleItemChange(idx, 'l', e.target.value)} className="w-20 h-9 px-1 text-center" /></TableCell>
                                            <TableCell><Input type="number" value={item.b} onChange={e => handleItemChange(idx, 'b', e.target.value)} className="w-20 h-9 px-1 text-center" /></TableCell>
                                            <TableCell className="border-r"><Input type="number" value={item.h} onChange={e => handleItemChange(idx, 'h', e.target.value)} className="w-20 h-9 px-1 text-center" /></TableCell>
                                            <TableCell><Input type="number" value={item.noOfPcs} onChange={e => handleItemChange(idx, 'noOfPcs', e.target.value)} className="w-16 h-9 px-1 text-center" /></TableCell>
                                            <TableCell>
                                                <Select value={item.ply} onValueChange={v => handleItemChange(idx, 'ply', v)}>
                                                    <SelectTrigger className="h-9"><SelectValue/></SelectTrigger>
                                                    <SelectContent><SelectItem value="3">3</SelectItem><SelectItem value="5">5</SelectItem><SelectItem value="7">7</SelectItem><SelectItem value="9">9</SelectItem></SelectContent>
                                                </Select>
                                            </TableCell>
                                            <TableCell>
                                                <Select value={item.paperType} onValueChange={v => handleItemChange(idx, 'paperType', v)}>
                                                    <SelectTrigger className="h-9"><SelectValue/></SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="KRAFT">Kraft (K)</SelectItem>
                                                        <SelectItem value="VIRGIN">Virgin (V)</SelectItem>
                                                        <SelectItem value="VIRGIN & KRAFT">Mixed (M)</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </TableCell>
                                            <TableCell>
                                                <Select value={normalizeBF(item.paperBf)} onValueChange={v => handleItemChange(idx, 'paperBf', v)}>
                                                    <SelectTrigger className="h-9 w-24"><SelectValue/></SelectTrigger>
                                                    <SelectContent>{bfOptions.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
                                                </Select>
                                            </TableCell>
                                            <TableCell><Input type="number" value={item.wastagePercent} onChange={e => handleItemChange(idx, 'wastagePercent', e.target.value)} className="w-20 h-9 px-1 text-center" /></TableCell>
                                            <TableCell className="border-l"><Input type="number" value={item.topGsm} onChange={e => handleItemChange(idx, 'topGsm', e.target.value)} className="w-20 h-9 px-1 text-center" /></TableCell>
                                            <TableCell><Input type="number" value={item.flute1Gsm} onChange={e => handleItemChange(idx, 'flute1Gsm', e.target.value)} className="w-20 h-9 px-1 text-center" /></TableCell>
                                            {maxPly >= 5 && <TableCell><Input type="number" value={item.flute2Gsm} onChange={e => handleItemChange(idx, 'flute2Gsm', e.target.value)} className="w-20 h-9 px-1 text-center" /></TableCell>}
                                            {maxPly >= 5 && <TableCell><Input type="number" value={item.middleGsm} onChange={e => handleItemChange(idx, 'middleGsm', e.target.value)} className="w-20 h-9 px-1 text-center" /></TableCell>}
                                            <TableCell className="border-r"><Input type="number" value={item.bottomGsm} onChange={e => handleItemChange(idx, 'bottomGsm', e.target.value)} className="w-20 h-9 px-1 text-center" /></TableCell>
                                            <TableCell className="text-center font-medium">{item.calculated?.totalGsm.toFixed(0)}</TableCell>
                                            <TableCell className="text-center font-medium">{item.calculated?.paperWeight.toFixed(0)}</TableCell>
                                            <TableCell className="text-center font-medium">{item.calculated?.totalBoxWeight.toFixed(0)}</TableCell>
                                            <TableCell className="text-center font-medium">{item.calculated?.paperCost.toFixed(2)}</TableCell>
                                            <TableCell className="text-right font-bold pr-6">{(item.calculated?.paperCost + (item.accessories || []).reduce((s, a) => s + (a.calculated?.paperCost || 0), 0)).toFixed(2)}</TableCell>
                                            <TableCell>
                                                <div className="flex gap-1">
                                                    <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-primary/10" onClick={() => { const k = Object.fromEntries(Object.entries(kraftPaperCosts).map(([b, c]) => [normalizeBF(b), Number(c) || 0])); const vi = Number(virginPaperCost) || 0; const co = Number(conversionCost) || 0; const copy = { ...item, id: Date.now().toString(), accessories: (item.accessories || []).map(a => ({...a, id: Math.random().toString()})) }; setItems([...items, { ...copy, calculated: calculateItemCost(copy, k, vi, co) }]); }}><Copy className="h-4 w-4" /></Button>
                                                    <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-destructive/10 text-destructive" onClick={() => setItems(items.filter(i => i.id !== item.id))}><Trash2 className="h-4 w-4" /></Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                        {(item.accessories || []).map((acc, aIdx) => (
                                            <TableRow key={acc.id} className="bg-muted/10 h-14">
                                                <TableCell colSpan={2} className="pl-12">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[10px] text-muted-foreground font-bold">ACC</span>
                                                        <Input value={acc.name} onChange={e => { const k = Object.fromEntries(Object.entries(kraftPaperCosts).map(([b, c]) => [normalizeBF(b), Number(c) || 0])); const vi = Number(virginPaperCost) || 0; const co = Number(conversionCost) || 0; const next = [...items]; next[idx].accessories![aIdx].name = e.target.value; setItems(next); }} className="h-8 text-xs w-48" />
                                                    </div>
                                                </TableCell>
                                                <TableCell className="border-l"><Input type="number" value={acc.l} onChange={e => { const k = Object.fromEntries(Object.entries(kraftPaperCosts).map(([b, c]) => [normalizeBF(b), Number(c) || 0])); const vi = Number(virginPaperCost) || 0; const co = Number(conversionCost) || 0; const next = [...items]; const ac = { ...next[idx].accessories![aIdx], l: e.target.value }; ac.calculated = calculateItemCost(ac, k, vi, co); next[idx].accessories![aIdx] = ac; setItems(next); }} className="w-20 h-8 px-1 text-center" /></TableCell>
                                                <TableCell colSpan={11}></TableCell>
                                                <TableCell className="text-center font-medium text-muted-foreground">{acc.calculated?.paperCost.toFixed(2)}</TableCell>
                                                <TableCell colSpan={2}></TableCell>
                                            </TableRow>
                                        ))}
                                    </React.Fragment>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                    <ScrollBar orientation="horizontal" />
                </ScrollArea>
            </CardContent>
        </Card>
        
        <Dialog open={isCostHistoryDialogOpen} onOpenChange={setIsCostHistoryDialogOpen}><DialogContent className="max-w-xl"><DialogHeader><DialogTitle>Costing History</DialogTitle></DialogHeader><ScrollArea className="h-96">{(costSettings?.history || []).length > 0 ? (<div className="space-y-4 p-4">{[...(costSettings?.history || [])].reverse().map((e, i) => (<div key={i} className="flex justify-between items-center text-sm"><div><p className="font-medium capitalize">{e.costType.replace('Cost', ' Cost')}</p><p className="text-xs text-muted-foreground">{format(new Date(e.date), "PPp")} by {e.setBy}</p></div><div className="text-right"><p>{e.newValue.toLocaleString()}</p><p className="text-xs text-muted-foreground line-through">{e.oldValue.toLocaleString()}</p></div></div>))}</div>) : (<div className="text-center text-muted-foreground p-8">No history found.</div>)}</ScrollArea></DialogContent></Dialog>
        
        <Dialog open={isPartyDialogOpen} onOpenChange={setIsPartyDialogOpen}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader><DialogTitle>Quick Add New Party</DialogTitle></DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="space-y-2"><Label htmlFor="party-name-dialog">Party Name</Label><Input id="party-name-dialog" value={partyForm.name} onChange={e => setPartyForm(p => ({...p, name: e.target.value}))} /></div>
                    <div className="space-y-2"><Label htmlFor="party-type-dialog">Party Type</Label>
                        <Select value={partyForm.type} onValueChange={(v: PartyType) => setPartyForm(p => ({...p, type: v}))}>
                            <SelectTrigger id="party-type-dialog"><SelectValue/></SelectTrigger>
                            <SelectContent><SelectItem value="Vendor">Vendor</SelectItem><SelectItem value="Customer">Customer</SelectItem><SelectItem value="Both">Both</SelectItem></SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2"><Label htmlFor="party-address-dialog">Address</Label><Textarea id="party-address-dialog" value={partyForm.address || ''} onChange={e => setPartyForm(p => ({...p, address: e.target.value}))} /></div>
                </div>
                <DialogFooter><Button variant="outline" onClick={() => setIsPartyDialogOpen(false)}>Cancel</Button><Button onClick={handlePartySubmit}>Add Party</Button></DialogFooter>
            </DialogContent>
        </Dialog>

        <Dialog open={isProductDialogOpen} onOpenChange={setIsProductDialogOpen}>
            <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
                <DialogHeader><DialogTitle>Quick Add New Product</DialogTitle></DialogHeader>
                <ScrollArea className="flex-1">
                    <ProductForm productToEdit={productFormForAdd} onSaveSuccess={handleQuickAddProduct} />
                </ScrollArea>
            </DialogContent>
        </Dialog>

        <QuotationPreviewDialog isOpen={isPreviewOpen} onOpenChange={setIsPreviewOpen} reportNumber={reportNumber} reportDate={reportDate} party={parties.find(p => p.id === selectedPartyId)} items={printableItems} products={products} transportCost={Number(transportCost)} transportCostType={transportCostType} termsAndConditions={termsAndConditions} />
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

    useEffect(() => {
        const unsub = onCostReportsUpdate(setReports);
        const unsubProducts = onProductsUpdate(setProducts);
        const unsubParties = onPartiesUpdate(setParties);
        return () => { unsub(); unsubProducts(); unsubParties(); }
    }, []);

    const handleDelete = async (id: string) => {
        try { await deleteCostReport(id); toast({ title: "Success", description: "Deleted." }); }
        catch { toast({ title: "Error", description: "Failed.", variant: "destructive" }); }
    };
    
    const calculateItemCost = useCallback((item: any, report: CostReport): CalculatedValues => {
        const l = parseFloat(item.l) || 0; const b = parseFloat(item.b) || 0; const h = parseFloat(item.h) || 0; const noOfPcs = parseInt(item.noOfPcs, 10) || 1;
        const isBox = l > 0 && b > 0 && h > 0;
        let sL, sB;
        if (isBox) { const c1 = b + h + 20; const d1 = (2 * l) + (2 * b) + 62; const c2 = l + h + 20; const d2 = (2 * b) + (2 * l) + 62; if (c1 * d1 <= c2 * d2) { sL = c1; sB = d1; } else { sL = c2; sB = d2; } }
        else { const d = [l, b, h].filter(v => v > 0).sort((a, b) => b - a); if (d.length < 2) return initialCalculatedState; sL = d[0]; sB = d[1]; }
        if (sL === 0 || sB === 0) return initialCalculatedState;
        const ply = parseInt(item.ply, 10) || 0;
        const getF = (f: string) => f === 'A' ? 1.55 : 1.35;
        const fT = (item.fluteType || 'B').split('/');
        const f1 = getF(fT[0]); const f2 = getF(fT[1] || fT[0]);
        const top = parseInt(item.topGsm, 10) || 0; const fl1 = parseInt(item.flute1Gsm, 10) || 0; const bot = parseInt(item.bottomGsm, 10) || 0;
        const sArea = (sL * sB) / 1000000;
        let tGsm = 0;
        if (ply === 3) tGsm = top + (fl1 * f1) + bot;
        else if (ply === 5) tGsm = top + (fl1 * f1) + (parseInt(item.middleGsm, 10) || 0) + (parseInt(item.flute2Gsm, 10) || 0) * f2 + bot;
        else tGsm = top + (ply === 2 ? (fl1 * f1) + bot : 0);
        const pWt = (sArea * tGsm) * noOfPcs;
        const tBWt = pWt * (1 + (parseFloat(item.wastagePercent) / 100 || 0));
        const kC = (report.kraftPaperCosts || {})[normalizeBF(item.paperBf)] || 0;
        let pR = 0;
        if (item.paperType === 'VIRGIN') pR = report.virginPaperCost || 0;
        else if (item.paperType === 'VIRGIN & KRAFT' && top > 0) pR = (top * (report.virginPaperCost || 0) + (tGsm - top) * kC) / tGsm;
        else pR = kC;
        const fR = pR + (report.conversionCost || 0);
        return { sheetSizeL: sL, sheetSizeB: sB, sheetArea: sArea, totalGsm: tGsm, paperWeight: pWt, totalBoxWeight: tBWt, paperRate: fR, paperCost: (tBWt / 1000) * fR };
    }, []);

    const printableItems = useMemo(() => {
        if (!reportToPrint) return [];
        return reportToPrint.items.map(i => {
            const accs = (i.accessories || []).map(a => ({ ...a, calculated: calculateItemCost(a, reportToPrint) }));
            const transport = reportToPrint.transportCostType === 'Per Piece' ? (parseInt(i.noOfPcs, 10) || 0) * (reportToPrint.transportCost || 0) : 0;
            return { ...i, accessories: accs, calculated: calculateItemCost(i, reportToPrint), totalItemCost: calculateItemCost(i, reportToPrint).paperCost + accs.reduce((s, a) => s + (a.calculated?.paperCost || 0), 0) + transport };
        });
    }, [reportToPrint, calculateItemCost]);

    return (
        <><Card><CardHeader><CardTitle>Saved Cost Reports</CardTitle></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>Report #</TableHead><TableHead>Date</TableHead><TableHead>Party Name</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader><TableBody>{reports.map(r => (<TableRow key={r.id}><TableCell>{r.reportNumber}</TableCell><TableCell>{toNepaliDate(r.reportDate)}</TableCell><TableCell>{r.partyName}</TableCell><TableCell className="text-right"><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger><DropdownMenuContent><DropdownMenuItem onSelect={() => onEdit(r)}><Edit className="mr-2 h-4 w-4" /> Edit</DropdownMenuItem><DropdownMenuItem onSelect={() => { setReportToPrint(r); setIsPreviewOpen(true); }}><Printer className="mr-2 h-4 w-4" /> Print</DropdownMenuItem><AlertDialog><AlertDialogTrigger asChild><DropdownMenuItem onSelect={e => e.preventDefault()} className="text-destructive"><Trash2 className="mr-2 h-4 w-4" /> Delete</DropdownMenuItem></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Are you sure?</AlertDialogTitle></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => handleDelete(r.id)}>Delete</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></DropdownMenuContent></DropdownMenu></TableCell></TableRow>))}</TableBody></Table></CardContent></Card>{reportToPrint && <QuotationPreviewDialog isOpen={isPreviewOpen} onOpenChange={setIsPreviewOpen} reportNumber={reportToPrint.reportNumber} reportDate={new Date(reportToPrint.reportDate)} party={parties.find(p => p.id === reportToPrint.partyId)} items={printableItems} products={products} transportCost={reportToPrint.transportCost} transportCostType={reportToPrint.transportCostType} termsAndConditions={reportToPrint.termsAndConditions} />}</>
    );
}

function SavedProductsList() {
    const [products, setProducts] = useState<ProductType[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const {toast} = useToast();
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingProduct, setEditingProduct] = useState<ProductType | null>(null);

    useEffect(() => {
        const unsub = onProductsUpdate(setProducts);
        return () => unsub();
    }, []);
    
    const sorted = useMemo(() => products.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()) || (p.materialCode || '').toLowerCase().includes(searchQuery.toLowerCase())).sort((a,b) => a.name.localeCompare(b.name)), [products, searchQuery]);

    const handleProductSave = async (formData: any) => {
        const { id, ...data } = formData;
        if (id) await updateProductService(id, data);
        else await addProductService(data);
        setIsDialogOpen(false);
    };

    return (
      <><Card><CardHeader><div className="flex justify-between items-center"><div><CardTitle>Products for Costing</CardTitle></div><div className="flex gap-2"><Input placeholder="Search..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-64" /><Button onClick={() => { setEditingProduct(null); setIsDialogOpen(true); }}>Add Product</Button></div></div></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>Product Name</TableHead><TableHead>Delivered To</TableHead><TableHead>Dimension</TableHead><TableHead>Ply</TableHead><TableHead>GSM</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader><TableBody>{sorted.map(p => (<TableRow key={p.id}><TableCell>{p.name}</TableCell><TableCell>{p.partyName || 'N/A'}</TableCell><TableCell>{p.specification?.dimension || 'N/A'}</TableCell><TableCell>{p.specification?.ply || 'N/A'}</TableCell><TableCell><CompactGsmDisplay item={p} /></TableCell><TableCell className="text-right"><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4"/></Button></DropdownMenuTrigger><DropdownMenuContent><DropdownMenuItem onSelect={() => { setEditingProduct(p); setIsDialogOpen(true); }}>Edit</DropdownMenuItem><AlertDialog><AlertDialogTrigger asChild><DropdownMenuItem onSelect={e => e.preventDefault()} className="text-destructive">Delete</DropdownMenuItem></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Are you sure?</AlertDialogTitle></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => deleteProductService(p.id)}>Delete</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></DropdownMenuContent></DropdownMenu></TableCell></TableRow>))}</TableBody></Table></CardContent></Card><Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}><DialogContent className="max-w-3xl"><DialogHeader><DialogTitle>{editingProduct ? 'Edit' : 'Add'} Product</DialogTitle></DialogHeader><ProductForm productToEdit={editingProduct} onSaveSuccess={handleProductSave}/></DialogContent></Dialog></>
    );
}

function ProductForm({ productToEdit, onSaveSuccess }: any) {
    const [form, setForm] = useState<any>({ name: '', materialCode: '', partyId: '', specification: { ply: '3', wastagePercent: '3.5', boxType: 'RSC', paperType: 'KRAFT', paperBf: '18 BF', topGsm: '120', flute1Gsm: '100', bottomGsm: '120' }, accessories: [] });
    const [dim, setDim] = useState({ l: '', b: '', h: '' });
    const [parties, setParties] = useState<Party[]>([]);
    const { user } = useAuth();
    const { toast } = useToast();

    useEffect(() => {
        const unsub = onPartiesUpdate(setParties);
        return () => unsub();
    }, []);

    useEffect(() => {
        if (productToEdit) {
            const [l, b, h] = productToEdit.specification?.dimension?.split('x') || ['', '', ''];
            setDim({ l, b, h });
            setForm({ ...productToEdit, specification: { ...productToEdit.specification } });
        } else {
            setDim({ l: '', b: '', h: '' });
            setForm({ name: '', materialCode: '', partyId: '', specification: { ply: '3', wastagePercent: '3.5', boxType: 'RSC', paperType: 'KRAFT', paperBf: '18 BF', topGsm: '120', flute1Gsm: '100', bottomGsm: '120' }, accessories: [] });
        }
    }, [productToEdit]);

    const handleSave = async () => {
        if (!user || !form.name || !form.partyId) {
            toast({ title: 'Validation Error', description: 'Name and Party are required.', variant: 'destructive' });
            return;
        }
        const dimension = `${dim.l}x${dim.b}x${dim.h}`;
        const p = parties.find(p => p.id === form.partyId);
        const data = { 
            ...form, 
            partyName: p?.name || '', 
            partyAddress: p?.address || '',
            specification: { ...form.specification, dimension },
            lastModifiedBy: user.username 
        };
        onSaveSuccess(data);
    };

    const updateSpec = (f: string, v: string) => {
        setForm((prev: any) => ({ ...prev, specification: { ...prev.specification, [f]: v } }));
    };

    const ply = parseInt(form.specification.ply, 10);

    return (
        <div className="p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">General Info</h3>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1"><Label>Product Name</Label><Input value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="e.g. Apple Box" /></div>
                        <div className="space-y-1"><Label>Material Code</Label><Input value={form.materialCode} onChange={e => setForm({...form, materialCode: e.target.value})} placeholder="CODE-123" /></div>
                    </div>
                    <div className="space-y-1">
                        <Label>Party (Customer)</Label>
                        <Select value={form.partyId} onValueChange={v => setForm({...form, partyId: v})}>
                            <SelectTrigger><SelectValue placeholder="Select party..." /></SelectTrigger>
                            <SelectContent>{parties.sort((a,b)=>a.name.localeCompare(b.name)).map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                        </Select>
                    </div>
                </div>

                <div className="space-y-4">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Box Dimensions (mm)</h3>
                    <div className="grid grid-cols-3 gap-2">
                        <div className="space-y-1"><Label>Length</Label><Input type="number" value={dim.l} onChange={e => setDim({...dim, l: e.target.value})} /></div>
                        <div className="space-y-1"><Label>Breadth</Label><Input type="number" value={dim.b} onChange={e => setDim({...dim, b: e.target.value})} /></div>
                        <div className="space-y-1"><Label>Height</Label><Input type="number" value={dim.h} onChange={e => setDim({...dim, h: e.target.value})} /></div>
                    </div>
                </div>
            </div>

            <Separator />

            <div className="space-y-4">
                <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Board Specifications</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="space-y-1">
                        <Label>Ply</Label>
                        <Select value={form.specification.ply} onValueChange={v => updateSpec('ply', v)}>
                            <SelectTrigger><SelectValue/></SelectTrigger>
                            <SelectContent><SelectItem value="3">3</SelectItem><SelectItem value="5">5</SelectItem><SelectItem value="7">7</SelectItem><SelectItem value="9">9</SelectItem></SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-1">
                        <Label>Box Type</Label>
                        <Input value={form.specification.boxType} onChange={e => updateSpec('boxType', e.target.value)} placeholder="RSC" />
                    </div>
                    <div className="space-y-1">
                        <Label>Paper Type</Label>
                        <Select value={form.specification.paperType} onValueChange={v => updateSpec('paperType', v)}>
                            <SelectTrigger><SelectValue/></SelectTrigger>
                            <SelectContent><SelectItem value="KRAFT">Kraft</SelectItem><SelectItem value="VIRGIN">Virgin</SelectItem><SelectItem value="VIRGIN & KRAFT">Mixed</SelectItem></SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-1">
                        <Label>Paper BF</Label>
                        <Select value={normalizeBF(form.specification.paperBf)} onValueChange={v => updateSpec('paperBf', normalizeBF(v))}>
                            <SelectTrigger><SelectValue/></SelectTrigger>
                            <SelectContent>{bfOptions.map(bf => <SelectItem key={bf} value={bf}>{bf}</SelectItem>)}</SelectContent>
                        </Select>
                    </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-5 gap-4 pt-2">
                    <div className="space-y-1"><Label>Top GSM</Label><Input type="number" value={form.specification.topGsm} onChange={e => updateSpec('topGsm', e.target.value)} /></div>
                    <div className="space-y-1"><Label>Flute 1 GSM</Label><Input type="number" value={form.specification.flute1Gsm} onChange={e => updateSpec('flute1Gsm', e.target.value)} /></div>
                    {ply >= 5 && <div className="space-y-1"><Label>Flute 2 GSM</Label><Input type="number" value={form.specification.flute2Gsm} onChange={e => updateSpec('flute2Gsm', e.target.value)} /></div>}
                    {ply >= 5 && <div className="space-y-1"><Label>Middle GSM</Label><Input type="number" value={form.specification.middleGsm} onChange={e => updateSpec('middleGsm', e.target.value)} /></div>}
                    <div className="space-y-1"><Label>Bottom GSM</Label><Input type="number" value={form.specification.bottomGsm} onChange={e => updateSpec('bottomGsm', e.target.value)} /></div>
                    <div className="space-y-1"><Label>Waste %</Label><Input type="number" value={form.specification.wastagePercent} onChange={e => updateSpec('wastagePercent', e.target.value)} /></div>
                </div>
            </div>

            <Button className="w-full mt-4" onClick={handleSave}>{productToEdit ? 'Update Product' : 'Save Product'}</Button>
        </div>
    );
}

function CostingSettingsTab() {
  const [kCosts, setKCosts] = useState<any>(initialKraftCosts);
  const [vCost, setVC] = useState<any>('');
  const [cCost, setCC] = useState<any>('');
  const [terms, setTerms] = useState<any[]>([]);
  const { user } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    return onSettingUpdate('costing', (s) => {
        if (s?.value) {
            setKCosts(s.value.kraftPaperCosts || initialKraftCosts);
            setVC(s.value.virginPaperCost || '');
            setCC(s.value.conversionCost || '');
            setTerms((s.value.termsAndConditions || []).map((t: any) => typeof t === 'string' ? { text: t, isSelected: true } : t));
        }
    });
  }, []);

  const handleSave = async () => {
    if (!user) return;
    try {
        await updateCostSettings({ kraftPaperCosts: kCosts, virginPaperCost: Number(vCost) || 0, conversionCost: Number(cCost) || 0, termsAndConditions: terms }, user.username);
        toast({ title: "Success" });
    } catch { toast({ title: "Error", variant: 'destructive' }); }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6"><div className="lg:col-span-1 space-y-6"><Card><CardHeader><CardTitle>Default Costs</CardTitle></CardHeader><CardContent className="space-y-4"><div className="space-y-4 rounded-lg border p-4"><Label>Kraft Paper Costs</Label>{bfOptions.map(bf => (<div key={bf} className="flex items-center justify-between"><Label className="text-sm">{bf}</Label><Input type="number" className="w-24 h-8" value={kCosts[normalizeBF(bf)] ?? ''} onChange={e => setKCosts({...kCosts, [normalizeBF(bf)]: e.target.value === '' ? '' : parseFloat(e.target.value)})} /></div>))}</div><div><Label>Virgin Rate</Label><Input type="number" value={vCost} onChange={e => setVC(e.target.value === '' ? '' : parseFloat(e.target.value))} /></div><div><Label>Conversion</Label><Input type="number" value={cCost} onChange={e => setCC(e.target.value === '' ? '' : parseFloat(e.target.value))} /></div><Button className="w-full" onClick={handleSave}>Save Settings</Button></CardContent></Card></div></div>
  )
}

export default function CostReportPage() {
    const [activeTab, setActiveTab] = useState("calculator");
    const [reportToEdit, setReportToEdit] = useState<CostReport | null>(null);
    const [products, setProducts] = useState<Product[]>([]);
    
    useEffect(() => { return onProductsUpdate(setProducts); }, []);
    
    return (
        <div className="flex flex-col gap-8"><header><h1 className="text-3xl font-bold">Cost Report Generator</h1></header><Tabs value={activeTab} onValueChange={setActiveTab}><TabsList><TabsTrigger value="calculator">Calculator</TabsTrigger><TabsTrigger value="saved">Saved Reports</TabsTrigger><TabsTrigger value="products">Products</TabsTrigger><TabsTrigger value="costingSettings">Settings</TabsTrigger></TabsList><TabsContent value="calculator" className="pt-4"><CostReportCalculator reportToEdit={reportToEdit} onSaveSuccess={() => { setReportToEdit(null); setActiveTab("saved"); }} onCancelEdit={() => setReportToEdit(null)} products={products} onProductAdd={() => {}}/></TabsContent><TabsContent value="saved" className="pt-4"><SavedReportsList onEdit={r => { setReportToEdit(r); setActiveTab("calculator"); }} /></TabsContent><TabsContent value="products" className="pt-4"><SavedProductsList /></TabsContent><TabsContent value="costingSettings" className="pt-4"><CostingSettingsTab /></TabsContent></Tabs></div>
    );
}
