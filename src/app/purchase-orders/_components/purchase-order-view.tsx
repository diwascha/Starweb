'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import { useBusinessProfile } from '@/hooks/use-business-profile';
import { DEFAULT_COMPANY_PROFILE } from '@/lib/constants';
import type { PurchaseOrder, PurchaseOrderVersion, CompanyProfile, Amendment } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table';
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
    ZoomIn,
    ZoomOut,
    RefreshCcw
} from 'lucide-react';
import NepaliDate from 'nepali-date-converter';
import { useRouter } from 'next/navigation';
import { normalizeBF } from '@/lib/utils';
import { getPurchaseOrder } from '@/services/purchase-order-service';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
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
    TooltipProvider,
    TooltipContent,
    TooltipTrigger
} from "@/components/ui/tooltip";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { onSettingUpdate } from '@/services/settings-service';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";


const PAPER_TYPES = ['Kraft Paper', 'Virgin Paper'];

function PurchaseOrderDocument({
  purchaseOrder,
  includeAmendments = true,
  containerRef,
  companyProfile
}: {
  purchaseOrder: PurchaseOrderVersion['data'] & Partial<Pick<PurchaseOrder, 'versions'>>,
  includeAmendments?: boolean,
  containerRef?: React.RefObject<HTMLDivElement | null>,
  companyProfile: CompanyProfile
}) {
  const nepaliPoDateString = new NepaliDate(new Date(purchaseOrder.poDate)).format('YYYY/MM/DD');
  const amendmentList = purchaseOrder.amendments || [];
  const hasAmendments = amendmentList.length > 0;
  const lastAmendment = hasAmendments ? amendmentList[amendmentList.length - 1] : null;
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

  const grandTotals = useMemo(() => {
    return (purchaseOrder.items || []).reduce((acc: Record<string, number>, item: any) => {
        const q = parseFloat(item.quantity);
        if (!isNaN(q) && q > 0) acc[item.unit] = (acc[item.unit] || 0) + q;
        return acc;
    }, {});
  }, [purchaseOrder.items]);

  const displayNameFor = (item: any, isPaper: boolean, type: string) => {
    if (!isPaper) return item.rawMaterialName || type;
    return item.grade ? `${type} — ${item.grade}` : type;
  };

  return (
    <div
      ref={containerRef}
      className="po-document bg-white text-neutral-900 font-sans flex flex-col"
      style={{ padding: '14mm 14mm 12mm', fontVariantNumeric: 'tabular-nums' }}
    >
        <header className="flex items-start justify-between pb-5 border-b-2 border-neutral-900">
            <div>
                <h1 className="text-[14px] leading-tight font-extrabold uppercase whitespace-pre">
                    {companyProfile.nameEn.split(' ').filter(Boolean).join('  ')}
                </h1>
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
                                        <td className="py-1.5 font-semibold">{displayNameFor(item, isPaper, type)}</td>
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

            <div className="flex justify-end">
                <div className="border-2 border-neutral-900 px-5 py-2 text-right">
                    <p className="text-[9px] font-bold uppercase text-neutral-500">Total Order Volume</p>
                    {Object.entries(grandTotals).map(([unit, total]: [any, any]) => (
                        <p key={unit} className="text-[15px] font-extrabold">{total.toLocaleString()} {unit}</p>
                    ))}
                </div>
            </div>
        </div>

        <div className="mt-8 text-[10px]">
            <div>
                <p className="font-extrabold uppercase text-[9px] text-neutral-500 mb-1">Delivery Location</p>
                <p className="font-semibold">{companyProfile.address}</p>
            </div>
            {purchaseOrder.remarks && (
                <div className="mt-4">
                    <p className="font-extrabold uppercase text-[9px] text-neutral-500 mb-1">Remarks</p>
                    <p className="font-semibold whitespace-pre-wrap">{purchaseOrder.remarks}</p>
                </div>
            )}
        </div>

        {includeAmendments && hasAmendments && (
            <div className="mt-8 border border-amber-200 bg-amber-50/60 rounded-md px-4 py-3">
                <h3 className="text-[9px] font-extrabold uppercase text-amber-800 mb-2">Amendment History</h3>
                <div className="space-y-1">
                    {amendmentList.map((am: any, i: number) => (
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

        <footer className="pt-4 border-t border-neutral-200 text-center">
            <p className="text-[8px] text-neutral-400 leading-snug">
                Computer-generated document. Valid without physical signature or seal. Produced via StarSutra Enterprise Suite.
            </p>
        </footer>
    </div>
  );
}

export default function PurchaseOrderView({ initialPurchaseOrder, poId }: { initialPurchaseOrder: PurchaseOrder | null, poId?: string }) {
  const [purchaseOrder, setPurchaseOrder] = useState<PurchaseOrder | null>(initialPurchaseOrder);
  const [isExporting, setIsExporting] = useState<Record<string, boolean>>({});
  const [includeAmendments, setIncludeAmendments] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [selectedVersion, setSelectedVersion] = useState<PurchaseOrderVersion | null>(null);
  const [isVersionDialogOpen, setIsVersionDialogOpen] = useState(false);
  // Purchase orders belong to the packaging company; the shared hook resolves
  // that from the route instead of another hand-rolled settings subscription.
  const companyProfile = useBusinessProfile();

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

  /**
   * Pure vector PDF - a real document, not a screenshot of one.
   *
   * This used to rasterise the page with html2canvas at scale 2 and embed it
   * as JPEG, slicing the canvas by hand to paginate. That produced a picture
   * of a purchase order: text a supplier can't select, search or copy, blurry
   * when zoomed, and hundreds of kilobytes a page. autoTable paginates the
   * item table natively and keeps every figure as text.
   *
   * `ref` is no longer read - the PDF is built from the order data directly -
   * but the signature is kept so the JPG export and the buttons stay as they
   * are.
   */
  const handleExportPdf = async (_ref: React.RefObject<HTMLDivElement | null>, poNo: string) => {
    const key = `pdf-${poNo}`;
    const po = purchaseOrder;
    if (!po) return;
    setIsExporting(prev => ({ ...prev, [key]: true }));
    try {
        const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
            import('jspdf'),
            import('jspdf-autotable'),
        ]);

        // Derived here rather than reaching into the document component -
        // this handler builds the PDF from the order data, not the DOM.
        const nepaliPoDateString = new NepaliDate(new Date(po.poDate)).format('YYYY/MM/DD');
        const groupedItems = (po.items || []).reduce((acc: Record<string, any[]>, item: any) => {
            const k = item.rawMaterialType || 'Other';
            (acc[k] = acc[k] || []).push(item);
            return acc;
        }, {});
        const grandTotals = (po.items || []).reduce((acc: Record<string, number>, item: any) => {
            const q = parseFloat(item.quantity);
            if (!isNaN(q) && q > 0) acc[item.unit] = (acc[item.unit] || 0) + q;
            return acc;
        }, {});
        const displayNameFor = (item: any, isPaper: boolean, type: string) => {
            if (!isPaper) return item.rawMaterialName || type;
            return [item.rawMaterialName || type, item.gsm ? `${item.gsm} GSM` : '', normalizeBF(item.bf) || '']
                .filter(Boolean).join(' · ');
        };

        const doc = new jsPDF('p', 'mm', 'a4');
        const pageWidth = doc.internal.pageSize.getWidth();
        const M = 14;
        let y = 16;

        // Letterhead
        doc.setFont('helvetica', 'bold'); doc.setFontSize(13);
        doc.text((companyProfile.nameEn || '').toUpperCase(), pageWidth / 2, y, { align: 'center' });
        if (companyProfile.nameNp) {
            y += 5; doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
            doc.text(companyProfile.nameNp, pageWidth / 2, y, { align: 'center' });
        }
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
        if (companyProfile.address) { y += 4.5; doc.text(companyProfile.address, pageWidth / 2, y, { align: 'center' }); }
        if (companyProfile.pan) { y += 4; doc.text(`PAN: ${companyProfile.pan}`, pageWidth / 2, y, { align: 'center' }); }

        y += 3; doc.setLineWidth(0.5); doc.line(M, y, pageWidth - M, y);
        y += 6;
        doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
        doc.text('PURCHASE ORDER', pageWidth / 2, y, { align: 'center' });

        // Order meta and vendor, side by side
        y += 7;
        const colR = pageWidth / 2 + 4;
        doc.setFontSize(8);
        const line = (label: string, value: string, x: number, yy: number) => {
            doc.setFont('helvetica', 'bold'); doc.setTextColor(120);
            doc.text(label.toUpperCase(), x, yy);
            doc.setFont('helvetica', 'bold'); doc.setTextColor(0);
            doc.text(value || '-', x, yy + 4);
        };
        line('Vendor', po.companyName, M, y);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
        let vy = y + 8;
        if (po.companyAddress) { doc.text(po.companyAddress, M, vy); vy += 4; }
        if (po.panNumber) { doc.text(`PAN: ${po.panNumber}`, M, vy); vy += 4; }

        line('PO Number', `#${po.poNumber}`, colR, y);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
        let my = y + 8;
        doc.text(`Status: ${po.status || 'Issued'}`, colR, my); my += 4;
        doc.text(`Date: ${nepaliPoDateString} BS  (${new Date(po.poDate).toLocaleDateString('en-CA')})`, colR, my); my += 4;
        if (po.deliveryDate) {
            doc.text(`Delivery: ${new Date(po.deliveryDate).toLocaleDateString('en-CA')}`, colR, my); my += 4;
        }
        doc.setTextColor(0);

        // Items, grouped by material type exactly as the on-screen document is
        let cursor = Math.max(vy, my) + 4;
        Object.entries(groupedItems).forEach(([type, itemsOfType]: [string, any]) => {
            const isPaper = String(type).toLowerCase().includes('paper');
            const head = isPaper
                ? [['#', 'Description / Grade', 'Size (in)', 'GSM', 'BF', 'Quantity']]
                : [['#', 'Description / Grade', 'Quantity']];
            const body = (itemsOfType as any[]).map((item, i) => isPaper
                ? [i + 1, displayNameFor(item, true, type), item.size || '-', item.gsm || '-', normalizeBF(item.bf) || '-', `${item.quantity} ${item.unit}`]
                : [i + 1, displayNameFor(item, false, type), `${item.quantity} ${item.unit}`]);

            const totals = (itemsOfType as any[]).reduce((acc: Record<string, number>, it: any) => {
                const q = parseFloat(it.quantity);
                if (!isNaN(q) && q > 0) acc[it.unit] = (acc[it.unit] || 0) + q;
                return acc;
            }, {});
            const totalText = Object.entries(totals).map(([u, t]) => `${(t as number).toLocaleString()} ${u}`).join('  /  ');

            doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(90);
            doc.text(String(type).toUpperCase(), M, cursor);
            doc.setTextColor(0);

            autoTable(doc, {
                startY: cursor + 2,
                head, body,
                foot: [isPaper
                    ? [{ content: `Subtotal - ${type}`, colSpan: 5, styles: { halign: 'right' as const } }, totalText]
                    : [{ content: `Subtotal - ${type}`, colSpan: 2, styles: { halign: 'right' as const } }, totalText]],
                theme: 'grid',
                styles: { fontSize: 8, cellPadding: 1.5, lineColor: [200, 200, 200], lineWidth: 0.1, overflow: 'linebreak' },
                headStyles: { fillColor: [235, 235, 235], textColor: 20, fontStyle: 'bold' },
                footStyles: { fillColor: [248, 248, 248], textColor: 20, fontStyle: 'bold' },
                columnStyles: isPaper
                    ? { 0: { cellWidth: 8, halign: 'center' }, 2: { halign: 'center' }, 3: { halign: 'center' }, 4: { halign: 'center' }, 5: { halign: 'right' } }
                    : { 0: { cellWidth: 8, halign: 'center' }, 2: { halign: 'right' } },
                margin: { left: M, right: M },
            });
            cursor = ((doc as any).lastAutoTable?.finalY || cursor) + 7;
        });

        // Grand total
        const grandText = Object.entries(grandTotals).map(([u, t]) => `${(t as number).toLocaleString()} ${u}`).join('   ');
        doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
        doc.text(`TOTAL ORDER VOLUME:  ${grandText || '-'}`, pageWidth - M, cursor, { align: 'right' });
        cursor += 8;

        const block = (label: string, value: string) => {
            if (!value) return;
            doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(120);
            doc.text(label.toUpperCase(), M, cursor);
            doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(0);
            const wrapped = doc.splitTextToSize(value, pageWidth - M * 2);
            doc.text(wrapped, M, cursor + 4);
            cursor += 4 + wrapped.length * 4 + 4;
        };
        block('Delivery Location', companyProfile.address || '');
        block('Remarks', po.remarks || '');

        if (po.amendments?.length) {
            doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(120);
            doc.text('AMENDMENT HISTORY', M, cursor);
            doc.setTextColor(0);
            autoTable(doc, {
                startY: cursor + 2,
                head: [['Date', 'By', 'Remarks']],
                body: po.amendments.map((am: any) => [
                    new Date(am.date).toLocaleDateString('en-CA'), am.amendedBy || '-', am.remarks || '',
                ]),
                theme: 'grid',
                styles: { fontSize: 7, cellPadding: 1.2, lineColor: [210, 210, 210], lineWidth: 0.1, overflow: 'linebreak' },
                headStyles: { fillColor: [240, 240, 240], textColor: 20, fontStyle: 'bold' },
                columnStyles: { 0: { cellWidth: 24 }, 1: { cellWidth: 30 } },
                margin: { left: M, right: M },
            });
            cursor = ((doc as any).lastAutoTable?.finalY || cursor) + 10;
        }

        // Signatures
        const pageH = doc.internal.pageSize.getHeight();
        const sigY = Math.min(Math.max(cursor + 12, pageH - 30), pageH - 20);
        const sigW = (pageWidth - M * 2 - 20) / 3;
        ['Prepared By', 'Checked By', 'Authorised By'].forEach((role, i) => {
            const x = M + i * (sigW + 10);
            doc.setDrawColor(0); doc.setLineWidth(0.2);
            doc.line(x, sigY, x + sigW, sigY);
            doc.setFont('helvetica', 'bold'); doc.setFontSize(7);
            doc.text(role.toUpperCase(), x, sigY + 4);
        });

        doc.save(`PO-${poNo}.pdf`);
    } catch (error) {
        console.error('PDF export failed', error);
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

            <div className="flex items-center gap-2 bg-white rounded-md border shadow-sm h-10 px-2">
                <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setZoom(prev => Math.max(0.25, prev - 0.25))}>
                                <ZoomOut className="h-4 w-4" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent><p className="text-[10px] uppercase font-black">Zoom Out</p></TooltipContent>
                    </Tooltip>
                    
                    <Select value={String(zoom)} onValueChange={v => setZoom(parseFloat(v))}>
                        <SelectTrigger className="h-8 w-20 text-[10px] font-black border-none bg-muted/30">
                            <SelectValue>{Math.round(zoom * 100)}%</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="0.25">25%</SelectItem>
                            <SelectItem value="0.5">50%</SelectItem>
                            <SelectItem value="0.75">75%</SelectItem>
                            <SelectItem value="1">100%</SelectItem>
                            <SelectItem value="1.25">125%</SelectItem>
                            <SelectItem value="1.5">150%</SelectItem>
                            <SelectItem value="2">200%</SelectItem>
                        </SelectContent>
                    </Select>

                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setZoom(prev => Math.min(3, prev + 0.25))}>
                                <ZoomIn className="h-4 w-4" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent><p className="text-[10px] uppercase font-black">Zoom In</p></TooltipContent>
                    </Tooltip>
                    
                    <Separator orientation="vertical" className="h-4 mx-1" />
                    
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={() => setZoom(1)}>
                                <RefreshCcw className="h-3.5 w-3.5" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent><p className="text-[10px] uppercase font-black">Reset Zoom</p></TooltipContent>
                    </Tooltip>
                </TooltipProvider>
            </div>

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
                                {isExporting[`pdf-${purchaseOrder.poNumber}`] ? <Loader2 className="animate-spin h-3.5 w-3.5"/> : <Save className="mr-2 h-4 w-4"/>}
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

      <ScrollArea className="w-full border rounded-lg bg-muted/20">
        <div className="flex justify-center p-8 min-h-[600px]">
             <div 
                style={{ 
                    width: `${210 * zoom}mm`, 
                    transition: 'width 0.2s ease-in-out',
                    position: 'relative',
                    minHeight: `${297 * zoom}mm`
                }}
                className="shrink-0"
             >
                <div 
                    style={{ 
                        transform: `scale(${zoom})`, 
                        transformOrigin: 'top left',
                        width: '210mm',
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        minHeight: '297mm'
                    }}
                    className="shadow-2xl ring-1 ring-black/5 animate-in fade-in zoom-in-95 duration-500 overflow-hidden bg-white"
                >
                    <PurchaseOrderDocument
                        purchaseOrder={purchaseOrder}
                        includeAmendments={includeAmendments}
                        containerRef={mainPrintRef}
                        companyProfile={companyProfile}
                    />
                </div>
            </div>
        </div>
        <ScrollBar orientation="horizontal" />
        <ScrollBar orientation="vertical" />
      </ScrollArea>

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
                        <div className="mx-auto w-full shadow-2xl bg-white min-h-[297mm]">
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
                                                {isExporting[`pdf-Snapshot-${selectedVersion.versionId}`] ? <Loader2 className="animate-spin h-3.5 w-3.5"/> : <Save className="mr-2 h-4 w-4 text-red-600"/>}
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
