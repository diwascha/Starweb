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
} from 'lucide-react';
import NepaliDate from 'nepali-date-converter';
import { useRouter } from 'next/navigation';
import { normalizeBF } from '@/lib/utils';
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

/* -------------------------------------------------------------------------
 * PO DOCUMENT
 * NOTE: Avoid `tracking-*` (letter-spacing) and `italic` inside this
 * component. html2canvas collapses spaces when letter-spacing is applied,
 * which caused words like "AMENDED PO" to render as "AMENDEDPO".
 * ---------------------------------------------------------------------- */
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
  const hasAmendments = purchaseOrder.amendments && purchaseOrder.amendments.length > 0;
  const lastAmendment = hasAmendments ? purchaseOrder.amendments[purchaseOrder.amendments.length - 1] : null;
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

  /** Grand total across all groups, per unit */
  const grandTotals = useMemo(() => {
    return (purchaseOrder.items || []).reduce((acc: Record<string, number>, item: any) => {
        const q = parseFloat(item.quantity);
        if (!isNaN(q) && q > 0) acc[item.unit] = (acc[item.unit] || 0) + q;
        return acc;
    }, {});
  }, [purchaseOrder.items]);

  /** For paper items the size/GSM/BF live in their own columns —
   *  show only the material type in Description to avoid duplication. */
  const descriptionFor = (item: any, isPaper: boolean, type: string) => {
    if (!isPaper) return item.rawMaterialName || type;
    return item.grade ? `${type} — ${item.grade}` : type;
  };

  return (
    <div
      ref={containerRef}
      className="po-document bg-white text-neutral-900 font-sans min-h-[297mm] flex flex-col"
      style={{ padding: '14mm 14mm 12mm', fontVariantNumeric: 'tabular-nums' }}
    >
        {/* ---------------- HEADER ---------------- */}
        <header className="flex items-start justify-between pb-5 border-b-2 border-neutral-900">
            <div>
                <h1 className="text-[22px] leading-tight font-extrabold uppercase">{companyProfile.nameEn}</h1>
                <h2 className="text-[13px] font-semibold text-neutral-700">{companyProfile.nameNp}</h2>
                <p className="text-[11px] text-neutral-600 mt-1">{companyProfile.address}</p>
                <p className="text-[10px] font-mono text-neutral-600">PAN: {companyProfile.pan}</p>
            </div>
            <div className="text-right shrink-0 pl-6">
                <div className="inline-block border-2 border-neutral-900 px-4 py-2">
                    <p className="text-[16px] font-extrabold uppercase leading-none">Purchase Order</p>
                </div>
                {hasAmendments && amendedDate && (
                    <p className="text-[9px] font-bold text-amber-700 uppercase mt-2">
                        Amended &mdash; Rev. {nepaliAmendedDateString} BS ({amendedDate.toLocaleDateString('en-CA')})
                    </p>
                )}
            </div>
        </header>

        {/* ---------------- META GRID ---------------- */}
        <div className="grid grid-cols-3 gap-6 py-5 border-b border-neutral-200 text-[11px]">
            <div>
                <p className="text-[9px] font-bold uppercase text-neutral-500 mb-1">PO Reference</p>
                <p className="font-extrabold text-[14px]">#{purchaseOrder.poNumber}</p>
                <p className="text-[9px] font-bold uppercase text-neutral-500 mt-3 mb-1">Status</p>
                <p className="font-bold uppercase">{purchaseOrder.status || 'Issued'}</p>
            </div>
            <div>
                <p className="text-[9px] font-bold uppercase text-neutral-500 mb-1">Supplier</p>
                <p className="font-extrabold text-[13px] leading-snug">{purchaseOrder.companyName}</p>
                <p className="text-neutral-600 mt-0.5">{purchaseOrder.companyAddress}</p>
                {purchaseOrder.panNumber && (
                    <p className="font-mono text-[10px] mt-1">PAN: {purchaseOrder.panNumber}</p>
                )}
            </div>
            <div className="text-right">
                <p className="text-[9px] font-bold uppercase text-neutral-500 mb-1">Issue Date</p>
                <p className="font-extrabold text-[13px]">{nepaliPoDateString} BS</p>
                <p className="text-[10px] text-neutral-500">{new Date(purchaseOrder.poDate).toLocaleDateString('en-CA')} AD</p>
                {purchaseOrder.deliveryDate && (
                    <>
                        <p className="text-[9px] font-bold uppercase text-neutral-500 mt-3 mb-1">Delivery By</p>
                        <p className="font-bold">{new Date(purchaseOrder.deliveryDate).toLocaleDateString('en-CA')}</p>
                    </>
                )}
            </div>
        </div>

        {/* ---------------- ITEM TABLES ---------------- */}
        <div className="mt-6 space-y-6">
            {Object.entries(groupedItems).map(([type, items]: [string, any]) => {
                const isPaper = PAPER_TYPES.includes(type);
                const sortedItems = isPaper
                    ? [...items].sort((a, b) => {
                        const gsmA = parseFloat(a.gsm) || 0;
                        const gsmB = parseFloat(b.gsm) || 0;
                        if (gsmA !== gsmB) return gsmA - gsmB;
                        return (parseFloat(a.size) || 0) - (parseFloat(b.size) || 0);
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
                    <div key={type}>
                        <div className="flex items-baseline justify-between mb-1.5">
                            <h3 className="text-[11px] font-extrabold uppercase">{type}</h3>
                            <span className="text-[9px] font-bold uppercase text-neutral-400">{sortedItems.length} line item{sortedItems.length > 1 ? 's' : ''}</span>
                        </div>
                        <table className="w-full text-[11px] border-collapse">
                            <thead>
                                <tr className="border-y border-neutral-900 text-left">
                                    <th className="py-1.5 w-8 font-bold text-center">#</th>
                                    <th className="py-1.5 font-bold">Description / Grade</th>
                                    {isPaper && (
                                        <>
                                            <th className="py-1.5 w-20 font-bold text-center">Size (in)</th>
                                            <th className="py-1.5 w-16 font-bold text-center">GSM</th>
                                            <th className="py-1.5 w-16 font-bold text-center">BF</th>
                                        </>
                                    )}
                                    <th className="py-1.5 w-24 font-bold text-right">Quantity</th>
                                </tr>
                            </thead>
                            <tbody>
                                {sortedItems.map((item: any, index: number) => (
                                    <tr key={index} className="border-b border-neutral-200">
                                        <td className="py-1.5 text-center text-neutral-400">{index + 1}</td>
                                        <td className="py-1.5 font-semibold">{descriptionFor(item, isPaper, type)}</td>
                                        {isPaper && (
                                            <>
                                                <td className="py-1.5 text-center font-semibold">{item.size || '—'}</td>
                                                <td className="py-1.5 text-center font-semibold">{item.gsm || '—'}</td>
                                                <td className="py-1.5 text-center text-neutral-600">{normalizeBF(item.bf) || '—'}</td>
                                            </>
                                        )}
                                        <td className="py-1.5 text-right font-bold">{item.quantity} {item.unit}</td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr className="border-b-2 border-neutral-900">
                                    <td colSpan={isPaper ? 5 : 2} className="py-1.5 text-right text-[9px] font-bold uppercase text-neutral-500 pr-4">Subtotal — {type}</td>
                                    <td className="py-1.5 text-right font-extrabold">
                                        {Object.entries(totals).map(([unit, total]: [any, any]) => (
                                            <div key={unit}>{total.toLocaleString()} {unit}</div>
                                        ))}
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                );
            })}

            {/* Grand total */}
            <div className="flex justify-end">
                <div className="border-2 border-neutral-900 px-5 py-2 text-right">
                    <p className="text-[9px] font-bold uppercase text-neutral-500">Total Order Volume</p>
                    {Object.entries(grandTotals).map(([unit, total]: [any, any]) => (
                        <p key={unit} className="text-[15px] font-extrabold">{total.toLocaleString()} {unit}</p>
                    ))}
                </div>
            </div>
        </div>

        {/* ---------------- TERMS ---------------- */}
        <div className="mt-8 text-[10px]">
            <div>
                <p className="font-extrabold uppercase text-[9px] text-neutral-500 mb-1">Delivery Location</p>
                <p className="font-semibold">{purchaseOrder.deliveryLocation || companyProfile.address}</p>
            </div>
            {purchaseOrder.remarks && (
                <div className="mt-4">
                    <p className="font-extrabold uppercase text-[9px] text-neutral-500 mb-1">Remarks</p>
                    <p className="font-semibold whitespace-pre-wrap">{purchaseOrder.remarks}</p>
                </div>
            )}
        </div>

        {/* ---------------- AMENDMENT LOGS ---------------- */}
        {includeAmendments && hasAmendments && (
            <div className="mt-8 border border-amber-200 bg-amber-50/60 rounded-md px-4 py-3">
                <h3 className="text-[9px] font-extrabold uppercase text-amber-800 mb-2">Amendment History</h3>
                <div className="space-y-1">
                    {purchaseOrder.amendments.map((am: any, i: number) => (
                        <p key={i} className="text-[9px] text-neutral-600">
                            <span className="font-extrabold text-neutral-900">Rev {i + 1}</span>
                            <span className="mx-1.5 text-neutral-300">|</span>
                            {new Date(am.date).toLocaleString()}
                            <span className="mx-1.5 text-neutral-300">|</span>
                            {am.remarks}
                        </p>
                    ))}
                </div>
            </div>
        )}

        <div className="flex-1 min-h-[24px]" />

        {/* ---------------- FOOTER ---------------- */}
        <footer className="pt-4 border-t border-neutral-200 text-center">
            <p className="text-[8px] text-neutral-400 leading-snug">
                Computer-generated and electronically authorized by {companyProfile.nameEn} via the StarSutra Enterprise Suite. Valid without signature or seal.
            </p>
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

  /* ------------------------------------------------------------------
   * PDF export — html2canvas with letterRendering to prevent word
   * merging, plus multi-page slicing for long POs.
   * ---------------------------------------------------------------- */
  const handleExportPdf = async (ref: React.RefObject<HTMLDivElement | null>, poNo: string) => {
    const key = `pdf-${poNo}`;
    const element = ref.current;
    if (!element) return;
    setIsExporting(prev => ({ ...prev, [key]: true }));
    try {
        const html2canvas = (await import('html2canvas')).default;
        const { jsPDF } = await import('jspdf');

        const canvas = await html2canvas(element, {
            scale: 2,
            useCORS: true,
            letterRendering: true,
            backgroundColor: '#ffffff',
        } as any);

        const pdf = new jsPDF('p', 'mm', 'a4');
        const pageWidth = pdf.internal.pageSize.getWidth();   // 210
        const pageHeight = pdf.internal.pageSize.getHeight(); // 297
        const imgHeight = (canvas.height * pageWidth) / canvas.width;

        if (imgHeight <= pageHeight + 1) {
            pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, pageWidth, imgHeight);
        } else {
            // Slice the canvas into A4-height pages
            const pageCanvasHeight = Math.floor((pageHeight * canvas.width) / pageWidth);
            let renderedHeight = 0;
            let pageIndex = 0;
            while (renderedHeight < canvas.height) {
                const sliceHeight = Math.min(pageCanvasHeight, canvas.height - renderedHeight);
                const pageCanvas = document.createElement('canvas');
                pageCanvas.width = canvas.width;
                pageCanvas.height = sliceHeight;
                const ctx = pageCanvas.getContext('2d')!;
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
                ctx.drawImage(canvas, 0, renderedHeight, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);

                if (pageIndex > 0) pdf.addPage();
                pdf.addImage(
                    pageCanvas.toDataURL('image/jpeg', 0.95),
                    'JPEG', 0, 0, pageWidth, (sliceHeight * pageWidth) / canvas.width
                );
                renderedHeight += sliceHeight;
                pageIndex++;
            }
        }

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
        const canvas = await html2canvas(ref.current, {
            scale: 2,
            useCORS: true,
            letterRendering: true,
            backgroundColor: '#ffffff',
        } as any);

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
        }, 'image/jpeg', 0.92);
    } catch (error) {
        toast({ title: 'Image Export Failed', variant: 'destructive' });
    } finally {
        setIsExporting(prev => ({ ...prev, [key]: false }));
    }
  };

  /* ------------------------------------------------------------------
   * Print — clones all page stylesheets into the print window so the
   * document keeps its Tailwind styling (previous version printed
   * completely unstyled HTML).
   * ---------------------------------------------------------------- */
  const handlePrint = (ref: React.RefObject<HTMLDivElement | null>) => {
    if (!ref.current) return;
    const printWindow = window.open('', '', 'height=900,width=800');
    if (!printWindow) return;

    const styleTags = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
        .map(node => node.outerHTML)
        .join('\n');

    printWindow.document.write(`<!DOCTYPE html><html><head><title>PO Print</title>${styleTags}
        <style>
            @page { size: A4; margin: 0; }
            body { margin: 0; padding: 0; background: #fff; }
            .po-document { box-shadow: none !important; border: none !important; }
        </style>
    </head><body>${ref.current.outerHTML}</body></html>`);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
        printWindow.print();
        printWindow.close();
    }, 700);
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
                            <Button variant="ghost" size="icon" onClick={() => handleExportPdf(mainPrintRef, purchaseOrder.poNumber)} disabled={isExporting[`pdf-${purchaseOrder.poNumber}`]} className="h-full w-10 border-r rounded-none">
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
                                            <Button variant="outline" size="sm" onClick={() => handleExportPdf(snapshotPrintRef, `Snapshot-${selectedVersion.versionId}`)} disabled={isExporting[`pdf-Snapshot-${selectedVersion.versionId}`]} className="h-10 px-4">
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