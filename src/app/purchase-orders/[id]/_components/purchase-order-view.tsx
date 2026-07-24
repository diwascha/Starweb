'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import type { PurchaseOrder, PurchaseOrderStatus, PurchaseOrderVersion, CompanyProfile } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { 
    Printer, 
    Save, 
    Image as ImageIcon, 
    History, 
    Eye, 
    ArrowLeft, 
    X, 
    Edit, 
    Loader2,
    FileText,
    CheckCircle2,
    Download
} from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import NepaliDate from 'nepali-date-converter';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { cn, normalizeBF } from '@/lib/utils';
import { getPurchaseOrder } from '@/services/purchase-order-service';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { 
    Dialog, 
    DialogContent, 
    DialogHeader, 
    DialogTitle, 
    DialogDescription, 
    DialogFooter 
} from '@/components/ui/dialog';
import { 
    Tooltip, 
    TooltipContent, 
    TooltipProvider, 
    TooltipTrigger 
} from "@/components/ui/tooltip";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { onSettingUpdate } from '@/services/settings-service';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

const DEFAULT_COMPANY_PROFILE_LOCAL: CompanyProfile = {
  nameEn: "Shivam Packaging Industry Private Limited",
  nameNp: "शिवम प्याकेजिङ्ग इन्डस्ट्रिज प्रा.लि.",
  address: "Hetauda 08, Bagmati Province, Nepal",
  phone: "N/A",
  email: "N/A",
  pan: "N/A"
};

const PAPER_TYPES = ['Kraft Paper', 'Virgin Paper'];

/**
 * Reusable component to render the PO document structure with professional digital framing
 */
function PurchaseOrderDocument({ 
  purchaseOrder, 
  includeAmendments = true,
  containerRef,
  companyProfile
}: { 
  purchaseOrder: any, 
  includeAmendments?: boolean,
  containerRef?: React.RefObject<HTMLDivElement | null>,
  companyProfile: CompanyProfile
}) {
  const nepaliPoDateString = new NepaliDate(new Date(purchaseOrder.poDate)).format('YYYY/MM/DD');
  const showAmendedDate = purchaseOrder.amendments && purchaseOrder.amendments.length > 0;
  const lastAmendment = showAmendedDate ? purchaseOrder.amendments[purchaseOrder.amendments.length - 1] : null;
  const amendedDate = lastAmendment ? new Date(lastAmendment.date) : null;
  const nepaliAmendedDateString = amendedDate ? new NepaliDate(amendedDate).format('YYYY/MM/DD') : '';

  const groupedItems = useMemo(() => {
    return (purchaseOrder.items || []).reduce((acc: any, item: any) => {
        const key = item.rawMaterialType || 'Other';
        if (!acc[key]) acc[key] = [];
        acc[key].push(item);
        return acc;
    }, {} as Record<string, any>);
  }, [purchaseOrder.items]);

  return (
    <div ref={containerRef} className="bg-white text-black p-12 font-sans min-h-[297mm] flex flex-col border shadow-inner">
        <header className="text-center space-y-1 mb-10 border-b-2 border-black pb-6">
            <h1 className="text-2xl font-black uppercase tracking-tight">{companyProfile.nameEn}</h1>
            <h2 className="text-lg font-semibold">{companyProfile.nameNp}</h2>
            <p className="text-sm font-bold uppercase tracking-widest text-gray-600">{companyProfile.address}</p>
            <p className="text-xs font-mono">PAN: {companyProfile.pan}</p>
            <h2 className="text-xl font-black underline mt-8 uppercase tracking-[0.2em]">Purchase Order</h2>
            {showAmendedDate && amendedDate && (
                <p className="text-[10px] font-black italic text-amber-600 uppercase mt-2">
                    (Amended PO - Last Revision: {amendedDate.toLocaleDateString('en-CA')})
                </p>
            )}
        </header>
        
        <div className="grid grid-cols-2 text-sm mb-8">
            <div className="space-y-6">
                <div>
                    <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">PO Reference</Label>
                    <p className="font-black text-lg tracking-tight">#{purchaseOrder.poNumber}</p>
                </div>
                <div>
                    <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Supplier Entity</Label>
                    <p className="font-black text-xl text-gray-900 leading-tight">{purchaseOrder.companyName}</p>
                    <p className="text-xs text-gray-600 mt-1 max-w-[250px]">{purchaseOrder.companyAddress}</p>
                    {purchaseOrder.panNumber && <p className="text-xs font-mono mt-1 font-bold">PAN: {purchaseOrder.panNumber}</p>}
                </div>
            </div>
            <div className="text-right flex flex-col justify-start space-y-6">
                <div>
                    <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Issue Date (BS)</Label>
                    <p className="font-black text-lg">{nepaliPoDateString} BS</p>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">({new Date(purchaseOrder.poDate).toLocaleDateString('en-CA')})</p>
                </div>
                {showAmendedDate && amendedDate && (
                    <div className="animate-in fade-in slide-in-from-right-2">
                        <Label className="text-[10px] font-black uppercase text-amber-600 tracking-widest">Revision Date</Label>
                        <p className="font-black text-base text-amber-700">{nepaliAmendedDateString} BS</p>
                    </div>
                )}
            </div>
        </div>

        <div className="space-y-8 flex-1">
            {Object.entries(groupedItems).map(([type, items]: [string, any]) => {
                const isPaper = PAPER_TYPES.includes(type);
                const sortedItems = isPaper
                    ? [...items].sort((a, b) => {
                        const gsmA = parseFloat(a.gsm) || 0;
                        const gsmB = parseFloat(b.gsm) || 0;
                        if (gsmA !== gsmB) return gsmA - gsmB;
                        const sizeA = parseFloat(a.size) || 0;
                        const sizeB = parseFloat(b.size) || 0;
                        return sizeA - sizeB;
                    })
                    : items;

                const totals = sortedItems.reduce((acc: any, item: any) => {
                    const quantity = parseFloat(item.quantity);
                    if (!isNaN(quantity) && quantity > 0) {
                        acc[item.unit] = (acc[item.unit] || 0) + quantity;
                    }
                    return acc;
                }, {} as Record<string, number>);

                return (
                    <div key={type} className="border border-black/10 rounded-xl overflow-hidden shadow-sm">
                        <Table className="text-xs">
                            <TableHeader>
                                <TableRow className="bg-gray-50 border-b border-black/10 h-10">
                                    <TableCell colSpan={isPaper ? 6 : 4} className="font-black text-gray-900 uppercase tracking-widest px-4">{type}</TableCell>
                                </TableRow>
                                <TableRow className="border-b border-black/5 bg-white/50 h-10">
                                    <TableHead className="font-bold text-black w-12 text-center">S.N.</TableHead>
                                    <TableHead className="font-bold text-black">Description / Grade</TableHead>
                                    {isPaper && (
                                        <>
                                            <TableHead className="font-bold text-black text-center">Size (Inch)</TableHead>
                                            <TableHead className="font-bold text-black text-center">GSM</TableHead>
                                            <TableHead className="font-bold text-black text-center">BF</TableHead>
                                        </>
                                    )}
                                    <TableHead className="font-bold text-black text-right pr-6">Quantity</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {sortedItems.map((item: any, index: number) => (
                                    <TableRow key={index} className="border-b border-black/5 hover:bg-transparent h-10">
                                        <TableCell className="text-center font-medium text-gray-400">{index + 1}</TableCell>
                                        <TableCell className="font-black text-gray-900">{item.rawMaterialName}</TableCell>
                                        {isPaper && (
                                            <>
                                                <TableCell className="text-center font-bold text-blue-900">{item.size || '-'}</TableCell>
                                                <TableCell className="text-center font-bold">{item.gsm || '-'}</TableCell>
                                                <TableCell className="text-center font-medium text-gray-600">{normalizeBF(item.bf) || '-'}</TableCell>
                                            </>
                                        )}
                                        <TableCell className="text-right pr-6 font-black text-gray-900">{item.quantity} {item.unit}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                            <TableFooter className="bg-gray-50/50 border-t border-black/10 h-10">
                                <TableRow className="hover:bg-transparent">
                                    <TableCell colSpan={isPaper ? 5 : 3} className="text-right font-bold uppercase text-[10px] text-gray-500 tracking-widest">Total Volume</TableCell>
                                    <TableCell className="text-right pr-6 font-black text-blue-900">
                                        {Object.entries(totals).map(([unit, total]: [any, any]) => (
                                            <div key={unit}>{total.toLocaleString()} {unit}</div>
                                        ))}
                                    </TableCell>
                                </TableRow>
                            </TableFooter>
                        </Table>
                    </div>
                );
            })}
        </div>

        {includeAmendments && purchaseOrder.amendments && purchaseOrder.amendments.length > 0 && (
            <div className="mt-12 border-t border-dashed border-black/10 pt-6">
                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-700 mb-3">Amendment Logs</h3>
                <div className="space-y-2">
                    {purchaseOrder.amendments.map((am: any, i: number) => (
                        <div key={i} className="text-[9px] text-gray-500 flex gap-2">
                            <span className="font-black text-gray-900">{i + 1}.</span>
                            <div className="flex-1">
                                <span className="font-bold uppercase tracking-tighter">Revised on:</span> {new Date(am.date).toLocaleString()} &middot; <span className="italic">Note: {am.remarks}</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        )}

        <div className="flex-1 min-h-[40px]" />

        <footer className="mt-20 pt-10 border-t border-gray-200 flex justify-between items-end">
            <div className="text-[10px] text-muted-foreground uppercase tracking-widest space-y-1">
                <p>Digital PO Verification ID: <span className="font-black text-gray-900">{purchaseOrder.id.substring(0, 8).toUpperCase()}</span></p>
                <p>Issued via StarSutra Procurement</p>
            </div>
            <div className="text-right max-w-[350px]">
                <p className="text-[9px] font-bold text-gray-400 uppercase italic leading-tight">
                    This computer-generated document is valid without a physical signature or seal.
                </p>
            </div>
        </footer>
    </div>
  );
}

export default function PurchaseOrderView({ initialPurchaseOrder, poId }: { initialPurchaseOrder: PurchaseOrder | null, poId?: string }) {
  const [purchaseOrder, setPurchaseOrder] = useState<PurchaseOrder | null>(initialPurchaseOrder);
  const [isExporting, setIsExporting] = useState<Record<string, boolean>>({});
  const [includeAmendments, setIncludeAmendments] = useState(true);
  const [selectedVersion, setSelectedVersion] = useState<PurchaseOrderVersion | null>(null);
  const [isVersionDialogOpen, setIsVersionDialogOpen] = useState(false);
  const [companyProfile, setCompanyProfile] = useState<CompanyProfile>(DEFAULT_COMPANY_PROFILE_LOCAL);
  
  const mainPrintRef = useRef<HTMLDivElement>(null);
  const snapshotPrintRef = useRef<HTMLDivElement>(null);
  
  const router = useRouter();
  const { toast } = useToast();

  useEffect(() => {
    if (initialPurchaseOrder) {
      setPurchaseOrder(initialPurchaseOrder);
    } else if (poId) {
      getPurchaseOrder(poId).then(setPurchaseOrder);
    }
  }, [initialPurchaseOrder, poId]);

  useEffect(() => {
    const unsub = onSettingUpdate('companyProfile', (s) => setCompanyProfile(s?.value || DEFAULT_COMPANY_PROFILE_LOCAL));
    return () => unsub();
  }, []);
  
  const handleExportPdf = async (targetPurchaseOrder: any, poNo: string) => {
    const key = `pdf-${poNo}`;
    setIsExporting(prev => ({ ...prev, [key]: true }));
    try {
        const html2canvas = (await import('html2canvas')).default;
        const { jsPDF } = await import('jspdf');
        
        const element = mainPrintRef.current;
        if (!element) return;

        const canvas = await html2canvas(element, { scale: 2, useCORS: true });
        const imgData = canvas.toDataURL('image/jpeg', 1.0);
        const pdf = new jsPDF('p', 'mm', 'a4');
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
        
        pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
        
        // Save as Blob for high mobile compatibility
        const blob = pdf.output('blob');
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `PO-${poNo}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

    } catch (error) {
        toast({ title: 'PDF Export Failed', variant: 'destructive' });
    } finally {
        setIsExporting(prev => ({ ...prev, [key]: false }));
    }
  };

  const handleExportJpg = async (ref: React.RefObject<HTMLDivElement | null>, poNo: string) => {
    const key = `jpg-${poNo}`;
    if (!ref.current) return;
    setIsExporting(prev => ({ ...prev, [key]: true }));
    try {
        const html2canvas = (await import('html2canvas')).default;
        const canvas = await html2canvas(ref.current, { scale: 2, useCORS: true });
        
        // Robust Blob-based download for mobile and desktop
        canvas.toBlob((blob) => {
            if (!blob) throw new Error('Blob conversion failed');
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.download = `PO-${poNo}.jpg`;
            link.href = url;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        }, 'image/jpeg', 0.9);

    } catch (error) {
        toast({ title: 'Image Export Failed', variant: 'destructive' });
    } finally {
        setIsExporting(prev => ({ ...prev, [key]: false }));
    }
  };

  const handlePrint = (ref: React.RefObject<HTMLDivElement | null>) => {
    if (!ref.current) return;
    const printWindow = window.open('', '', 'height=800,width=800');
    if (!printWindow) return;

    printWindow.document.write('<html><head><title>Print PO</title>');
    printWindow.document.write('<style>body{margin:0;padding:0;} .border{border:none !important;} .shadow-inner{box-shadow:none !important;}</style>');
    printWindow.document.write('</head><body>');
    printWindow.document.write(ref.current.innerHTML);
    printWindow.document.write('</body></html>');
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
        printWindow.print();
        printWindow.close();
    }, 500);
  };

  if (!purchaseOrder) return <div className="p-8 text-center flex flex-col items-center gap-4"><Loader2 className="animate-spin h-8 w-8 text-primary"/>Loading Order...</div>;

  return (
    <div className="flex flex-col gap-8 max-w-6xl mx-auto pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 print:hidden bg-muted/30 p-6 rounded-2xl border border-dashed">
        <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => router.push('/purchase-orders/list')} className="h-10 w-10 bg-white shadow-sm border">
                <ArrowLeft className="h-5 w-5"/>
            </Button>
            <div>
                <h1 className="text-2xl font-black text-gray-900 tracking-tight uppercase">PO Viewer</h1>
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">{purchaseOrder.poNumber} &middot; {purchaseOrder.status}</p>
            </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" size="sm" onClick={() => router.push(`/purchase-orders/edit?id=${purchaseOrder.id}`)} className="h-10 px-4 font-bold text-[10px] uppercase tracking-widest"><Edit className="mr-2 h-3.5 w-3.5"/> Amend Order</Button>
            
            <div className="flex border rounded-md overflow-hidden bg-white shadow-sm h-10">
                <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" onClick={() => handleExportJpg(mainPrintRef, purchaseOrder.poNumber)} disabled={isExporting[`jpg-${purchaseOrder.poNumber}`]} className="h-full w-10 border-r rounded-none">
                                {isExporting[`jpg-${purchaseOrder.poNumber}`] ? <Loader2 className="animate-spin h-3.5 w-3.5"/> : <ImageIcon className="h-4 w-4"/>}
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent><p className="text-[10px] uppercase font-black">Export Image</p></TooltipContent>
                    </Tooltip>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" onClick={() => handleExportPdf(purchaseOrder, purchaseOrder.poNumber)} disabled={isExporting[`pdf-${purchaseOrder.poNumber}`]} className="h-full w-10 border-r rounded-none">
                                {isExporting[`pdf-${purchaseOrder.poNumber}`] ? <Loader2 className="animate-spin h-3.5 w-3.5"/> : <Save className="h-4 w-4"/>}
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent><p className="text-[10px] uppercase font-black">Export PDF</p></TooltipContent>
                    </Tooltip>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" onClick={() => handlePrint(mainPrintRef)} className="h-full w-10 rounded-none">
                                <Printer className="h-4 w-4" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent><p className="text-[10px] uppercase font-black">Print Document</p></TooltipContent>
                    </Tooltip>
                </TooltipProvider>
            </div>

            <div className="flex items-center gap-2 px-3 h-10 bg-white rounded-md border shadow-sm">
                <Switch id="inc-amend" checked={includeAmendments} onCheckedChange={setIncludeAmendments} className="scale-75" />
                <Label htmlFor="inc-amend" className="text-[9px] font-black uppercase text-muted-foreground cursor-pointer">Append Logs</Label>
            </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-[210mm] shadow-2xl ring-1 ring-black/5 animate-in fade-in zoom-in-95 duration-500">
        <PurchaseOrderDocument 
            purchaseOrder={purchaseOrder} 
            includeAmendments={includeAmendments} 
            containerRef={mainPrintRef}
            companyProfile={companyProfile}
        />
      </div>

       <div id="po-history-section" className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-12 print:hidden">
            <Card className="shadow-sm border-gray-100 bg-white">
                <CardHeader className="bg-muted/10 border-b">
                    <div className="flex items-center gap-2">
                        <History className="h-5 w-5 text-muted-foreground"/>
                        <CardTitle className="text-sm font-black uppercase tracking-tight">Version Snapshots</CardTitle>
                    </div>
                    <CardDescription className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Immutable states captured before every revision.</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                    <Table className="text-xs">
                        <TableBody>
                            {purchaseOrder.versions && purchaseOrder.versions.length > 0 ? (
                                [...purchaseOrder.versions].reverse().map((version) => (
                                    <TableRow key={version.versionId} className="h-12 hover:bg-muted/5">
                                        <TableCell className="pl-6">
                                            <div className="flex flex-col">
                                                <span className="font-bold text-gray-900">{format(new Date(version.replacedAt), "PPp")}</span>
                                                <span className="text-[9px] text-muted-foreground uppercase font-black">Archived by {version.replacedBy}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-right pr-6">
                                            <Button variant="outline" size="sm" onClick={() => { setSelectedVersion(version); setIsVersionDialogOpen(true); }} className="h-7 text-[9px] font-black uppercase tracking-tighter">
                                                <Eye className="mr-1 h-3 w-3"/> Review State
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow><TableCell colSpan={2} className="text-center py-12 text-muted-foreground italic text-xs uppercase font-black tracking-widest opacity-40">No historical versions.</TableCell></TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            <Card className="shadow-sm border-gray-100 bg-white">
                <CardHeader className="bg-muted/10 border-b">
                    <div className="flex items-center gap-2">
                        <FileText className="h-5 w-5 text-amber-600"/>
                        <CardTitle className="text-sm font-black uppercase tracking-tight">Amendment Logs</CardTitle>
                    </div>
                    <CardDescription className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Manual revision reasons provided by staff.</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                    <Table className="text-xs">
                        <TableBody>
                            {purchaseOrder.amendments && purchaseOrder.amendments.length > 0 ? (
                                purchaseOrder.amendments.map((log, index) => (
                                    <TableRow key={index} className="h-12 hover:bg-muted/5 border-b">
                                        <TableCell className="pl-6 font-medium text-gray-500 whitespace-nowrap">{format(new Date(log.date), "PP")}</TableCell>
                                        <TableCell className="font-bold text-gray-700">{log.remarks}</TableCell>
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow><TableCell colSpan={2} className="text-center py-12 text-muted-foreground italic text-xs uppercase font-black tracking-widest opacity-40">No manual amendments logged.</TableCell></TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
       </div>

       <Dialog open={isVersionDialogOpen} onOpenChange={setIsVersionDialogOpen}>
            <DialogContent className="max-w-5xl h-[95vh] flex flex-col p-0 border-none shadow-2xl overflow-hidden">
                <DialogHeader className="p-6 border-b bg-muted/5 shrink-0">
                    <div className="flex items-center justify-between">
                        <div className="space-y-1">
                            <DialogTitle className="text-xl font-black uppercase tracking-tight flex items-center gap-2">
                                <History className="h-5 w-5 text-primary"/>
                                Historical Snapshot Preview
                            </DialogTitle>
                            <DialogDescription className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                                {selectedVersion ? `Captured on ${format(new Date(selectedVersion.replacedAt), "PPPP p")}` : ''}
                            </DialogDescription>
                        </div>
                        <Button variant="ghost" size="icon" onClick={() => setIsVersionDialogOpen(false)} className="h-8 w-8"><X className="h-4 w-4"/></Button>
                    </div>
                </DialogHeader>
                
                <ScrollArea className="flex-1 bg-muted/20 p-4 sm:p-12">
                    {selectedVersion && (
                        <div className="mx-auto w-full shadow-2xl">
                            <PurchaseOrderDocument 
                                purchaseOrder={selectedVersion.data} 
                                includeAmendments={false} 
                                containerRef={snapshotPrintRef}
                                companyProfile={companyProfile}
                            />
                        </div>
                    )}
                    <ScrollBar orientation="horizontal" />
                </ScrollArea>

                <DialogFooter className="p-6 bg-white border-t shrink-0">
                    <div className="flex w-full justify-between items-center">
                        <div className="flex gap-2">
                            {selectedVersion && (
                                <TooltipProvider>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Button variant="outline" size="sm" onClick={() => handleExportJpg(snapshotPrintRef, `Snapshot-${selectedVersion.versionId}`)} disabled={isExporting[`jpg-Snapshot-${selectedVersion.versionId}`]} className="h-10 px-4">
                                                {isExporting[`jpg-Snapshot-${selectedVersion.versionId}`] ? <Loader2 className="animate-spin h-3.5 w-3.5"/> : <ImageIcon className="h-4 w-4 text-blue-600"/>}
                                                <span className="ml-2 text-[10px] font-black uppercase">Save Image</span>
                                            </Button>
                                        </TooltipTrigger>
                                        <TooltipContent><p>Download current snapshot as JPEG</p></TooltipContent>
                                    </Tooltip>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Button variant="outline" size="sm" onClick={() => handleExportPdf(selectedVersion.data, `Snapshot-${selectedVersion.versionId}`)} disabled={isExporting[`pdf-Snapshot-${selectedVersion.versionId}`]} className="h-10 px-4">
                                                {isExporting[`pdf-Snapshot-${selectedVersion.versionId}`] ? <Loader2 className="animate-spin h-3.5 w-3.5"/> : <Save className="h-4 w-4 text-red-600"/>}
                                                <span className="ml-2 text-[10px] font-black uppercase">Save PDF</span>
                                            </Button>
                                        </TooltipTrigger>
                                        <TooltipContent><p>Download current snapshot as PDF</p></TooltipContent>
                                    </Tooltip>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Button variant="outline" size="sm" onClick={() => handlePrint(snapshotPrintRef)} className="h-10 px-4">
                                                <Printer className="h-4 w-4 text-gray-600"/>
                                                <span className="ml-2 text-[10px] font-black uppercase">Direct Print</span>
                                            </Button>
                                        </TooltipTrigger>
                                        <TooltipContent><p>Print this historical version</p></TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
                            )}
                        </div>
                        <Button variant="secondary" onClick={() => setIsVersionDialogOpen(false)} className="h-10 px-6 font-black text-[10px] uppercase">Close Audit</Button>
                    </div>
                </DialogFooter>
            </DialogContent>
       </Dialog>
    </div>
  );
}
