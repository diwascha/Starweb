'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import { useBusinessProfile } from '@/hooks/use-business-profile';

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

import { buildPoDocumentModel, describeAmendments } from '@/lib/purchase-order-document';
import { drawPdfLetterhead } from '@/lib/pdf-letterhead';
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
  const { amendmentList, hasAmendments, amendedDate } = describeAmendments(purchaseOrder.amendments);
  const nepaliAmendedDateString = amendedDate ? new NepaliDate(amendedDate).format('YYYY/MM/DD') : '';

  // The same model the PDF export draws from, so the two can no longer
  // disagree about grouping, ordering or what each column says.
  const model = useMemo(() => buildPoDocumentModel(purchaseOrder), [purchaseOrder]);

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
            {model.groups.map(group => (
                <div key={group.type}>
                    <div className="flex items-baseline justify-between mb-1.5">
                        <h3 className="text-[11px] font-extrabold uppercase">{group.type}</h3>
                        <span className="text-[9px] font-bold uppercase text-neutral-400">{group.lineItemLabel}</span>
                    </div>
                    <table className="w-full text-[11px] border-collapse">
                        <thead>
                            <tr className="border-y border-neutral-900 text-left">
                                <th className="py-1.5 w-8 font-bold text-center">#</th>
                                <th className="py-1.5 font-bold">Description / Grade</th>
                                {group.isPaper && (
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
                            {group.rows.map(row => (
                                <tr key={row.index} className="border-b border-neutral-200">
                                    <td className="py-1.5 text-center text-neutral-400">{row.index}</td>
                                    <td className="py-1.5 font-semibold">{row.description}</td>
                                    {group.isPaper && (
                                        <>
                                            <td className="py-1.5 text-center font-semibold">{row.size}</td>
                                            <td className="py-1.5 text-center font-semibold">{row.gsm}</td>
                                            <td className="py-1.5 text-center text-neutral-600">{row.bf}</td>
                                        </>
                                    )}
                                    <td className="py-1.5 text-right font-bold">{row.quantity}</td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot>
                            <tr className="border-b-2 border-neutral-900">
                                <td colSpan={group.isPaper ? 5 : 2} className="py-1.5 text-right text-[9px] font-bold uppercase text-neutral-500 pr-4">Subtotal &mdash; {group.type}</td>
                                <td className="py-1.5 text-right font-extrabold">{group.subtotalText}</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            ))}

            <div className="flex justify-end">
                <div className="border-2 border-neutral-900 px-5 py-2 text-right">
                    <p className="text-[9px] font-bold uppercase text-neutral-500">Total Order Volume</p>
                    {model.grandTotals.map(([unit, total]) => (
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
   * Pure vector PDF, drawn to match the document on screen.
   *
   * This is still a real document rather than a screenshot - the supplier can
   * select, search and copy every figure, and it stays sharp at any zoom. But
   * it previously re-invented the layout from scratch while the image export
   * rasterised the styled component, so the same order exported two ways
   * produced two visibly different documents. The layout below follows
   * PurchaseOrderDocument section for section, and both now take their
   * content from the shared model in lib/purchase-order-document.
   *
   * `ref` is not read - the PDF is built from the order data, not the DOM -
   * but the signature matches the JPG export so the buttons stay uniform.
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

        const model = buildPoDocumentModel(po);
        const nepaliPoDateString = new NepaliDate(new Date(po.poDate)).format('YYYY/MM/DD');
        const { amendmentList, hasAmendments, amendedDate } = describeAmendments(po.amendments);
        const nepaliAmendedDateString = amendedDate ? new NepaliDate(amendedDate).format('YYYY/MM/DD') : '';

        // compress: true deflates the page content streams and, critically, the
        // image samples. jsPDF stores decoded samples rather than the source
        // PNG, so without this the one Devanagari strip in the letterhead went
        // into the file uncompressed and took the export past 1.5 MB.
        const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4', compress: true });
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const M = 14;
        const right = pageWidth - M;
        const INK = 20;
        const MUTED = 130;
        let y = 18;

        const setText = (size: number, style: 'normal' | 'bold' = 'normal', shade = INK) => {
            doc.setFont('helvetica', style);
            doc.setFontSize(size);
            doc.setTextColor(shade);
        };

        // ---- Letterhead: name left, boxed PURCHASE ORDER right ----
        const boxW = 46, boxH = 11;
        const boxX = right - boxW;
        doc.setDrawColor(INK); doc.setLineWidth(0.7);
        doc.rect(boxX, y - 4, boxW, boxH);
        setText(13, 'bold');
        doc.text('PURCHASE ORDER', boxX + boxW / 2, y + 3.2, { align: 'center' });

        // Shared with every other export, so the issuing company reads the
        // same on a PO, a quotation, a spec sheet and a payslip.
        const headY = drawPdfLetterhead(doc, companyProfile, {
            x: M, y, align: 'left', nameSize: 11.5, detailSize: 8.5,
        });

        if (hasAmendments && amendedDate) {
            setText(7.5, 'bold', 0);
            doc.setTextColor(180, 83, 9); // amber-700, matching the document
            doc.text(
                `AMENDED — REV. ${nepaliAmendedDateString} BS (${amendedDate.toLocaleDateString('en-CA')})`,
                right, y + 12, { align: 'right' }
            );
            doc.setTextColor(INK);
        }

        y = Math.max(headY, y + 12) + 5;
        doc.setDrawColor(INK); doc.setLineWidth(0.7);
        doc.line(M, y, right, y);

        // ---- Three-column meta block ----
        y += 7;
        const colW = (pageWidth - M * 2) / 3;
        const col2 = M + colW;
        const col3 = M + colW * 2;

        const label = (text: string, x: number, yy: number, align: 'left' | 'right' = 'left') => {
            setText(6.8, 'bold', MUTED);
            doc.text(text.toUpperCase(), align === 'right' ? right : x, yy, { align });
        };

        label('PO Reference', M, y);
        setText(12, 'bold');
        doc.text(`#${po.poNumber}`, M, y + 5.5);
        label('Status', M, y + 13);
        setText(9, 'bold');
        doc.text((po.status || 'Issued').toUpperCase(), M, y + 18);

        label('Supplier', col2, y);
        setText(10.5, 'bold');
        const supplierLines = doc.splitTextToSize(po.companyName || '-', colW - 6);
        doc.text(supplierLines, col2, y + 5);
        let sy = y + 5 + supplierLines.length * 4.6;
        if (po.companyAddress) {
            setText(8.5, 'normal', 90);
            doc.text(po.companyAddress, col2, sy); sy += 4.2;
        }
        if (po.panNumber) {
            setText(8, 'normal', INK);
            doc.text(`PAN:  ${po.panNumber}`, col2, sy);
        }

        label('Issue Date', col3, y, 'right');
        setText(10.5, 'bold');
        doc.text(`${nepaliPoDateString} BS`, right, y + 5, { align: 'right' });
        setText(8, 'normal', MUTED);
        doc.text(`${new Date(po.poDate).toLocaleDateString('en-CA')} AD`, right, y + 9.5, { align: 'right' });
        if (po.deliveryDate) {
            label('Delivery By', col3, y + 16, 'right');
            setText(9, 'bold', INK);
            doc.text(new Date(po.deliveryDate).toLocaleDateString('en-CA'), right, y + 21, { align: 'right' });
        }

        y = Math.max(y + 24, sy + 4);
        doc.setDrawColor(210); doc.setLineWidth(0.2);
        doc.line(M, y, right, y);
        y += 9;

        // ---- Item groups: ruled rows, no grid, matching the document ----
        model.groups.forEach(group => {
            setText(9, 'bold', INK);
            doc.text(group.type.toUpperCase(), M, y);
            setText(7, 'bold', 165);
            doc.text(group.lineItemLabel.toUpperCase(), right, y, { align: 'right' });

            const head = group.isPaper
                ? [['#', 'Description / Grade', 'Size (in)', 'GSM', 'BF', 'Quantity']]
                : [['#', 'Description / Grade', 'Quantity']];
            const body = group.rows.map(r => group.isPaper
                ? [r.index, r.description, r.size, r.gsm, r.bf, r.quantity]
                : [r.index, r.description, r.quantity]);

            autoTable(doc, {
                startY: y + 2.5,
                head, body,
                foot: [group.isPaper
                    ? [{ content: `SUBTOTAL — ${group.type.toUpperCase()}`, colSpan: 5, styles: { halign: 'right' as const } }, group.subtotalText]
                    : [{ content: `SUBTOTAL — ${group.type.toUpperCase()}`, colSpan: 2, styles: { halign: 'right' as const } }, group.subtotalText]],
                theme: 'plain',
                styles: { fontSize: 8.5, cellPadding: { top: 1.6, bottom: 1.6, left: 1, right: 1 }, textColor: INK, overflow: 'linebreak' },
                headStyles: {
                    fontStyle: 'bold', textColor: INK, fillColor: false as any,
                    lineWidth: { top: 0.4, bottom: 0.4 }, lineColor: [INK, INK, INK],
                },
                bodyStyles: { lineWidth: { bottom: 0.1 }, lineColor: [220, 220, 220] },
                footStyles: {
                    fontStyle: 'bold', textColor: INK, fillColor: false as any, fontSize: 8.5,
                    lineWidth: { bottom: 0.7 }, lineColor: [INK, INK, INK],
                },
                columnStyles: group.isPaper
                    ? {
                        0: { cellWidth: 8, halign: 'center', textColor: 170 },
                        1: { fontStyle: 'bold' },
                        2: { cellWidth: 20, halign: 'center', fontStyle: 'bold' },
                        3: { cellWidth: 16, halign: 'center', fontStyle: 'bold' },
                        4: { cellWidth: 16, halign: 'center', textColor: 110 },
                        5: { cellWidth: 24, halign: 'right', fontStyle: 'bold' },
                    }
                    : {
                        0: { cellWidth: 8, halign: 'center', textColor: 170 },
                        1: { fontStyle: 'bold' },
                        2: { cellWidth: 24, halign: 'right', fontStyle: 'bold' },
                    },
                margin: { left: M, right: M },
            });
            y = ((doc as any).lastAutoTable?.finalY || y) + 9;
        });

        // ---- Boxed grand total, right aligned ----
        const totalLines = model.grandTotals.length || 1;
        const tBoxW = 52;
        const tBoxH = 8 + totalLines * 6;
        if (y + tBoxH > pageHeight - 30) { doc.addPage(); y = 20; }
        doc.setDrawColor(INK); doc.setLineWidth(0.7);
        doc.rect(right - tBoxW, y, tBoxW, tBoxH);
        setText(6.8, 'bold', MUTED);
        doc.text('TOTAL ORDER VOLUME', right - 4, y + 5, { align: 'right' });
        setText(13, 'bold', INK);
        let ty = y + 12;
        (model.grandTotals.length ? model.grandTotals : [['', 0] as [string, number]]).forEach(([unit, total]) => {
            doc.text(unit ? `${total.toLocaleString()} ${unit}` : '-', right - 4, ty, { align: 'right' });
            ty += 6;
        });
        y += tBoxH + 12;

        // ---- Delivery location and remarks ----
        const block = (heading: string, value: string) => {
            if (!value) return;
            if (y > pageHeight - 34) { doc.addPage(); y = 20; }
            setText(6.8, 'bold', MUTED);
            doc.text(heading.toUpperCase(), M, y);
            setText(9, 'bold', INK);
            const wrapped = doc.splitTextToSize(value, pageWidth - M * 2);
            doc.text(wrapped, M, y + 5);
            y += 5 + wrapped.length * 4.4 + 6;
        };
        block('Delivery Location', companyProfile.address || '');
        block('Remarks', po.remarks || '');

        // ---- Amendment history, in the document's amber panel ----
        if (includeAmendments && hasAmendments) {
            const entries = amendmentList.map((am: any, i: number) =>
                `Rev ${i + 1}   |   ${new Date(am.date).toLocaleString()}   |   ${am.remarks || ''}`);
            const wrapped = entries.flatMap((line: string) => doc.splitTextToSize(line, pageWidth - M * 2 - 10));
            const panelH = 10 + wrapped.length * 4.2;
            if (y + panelH > pageHeight - 24) { doc.addPage(); y = 20; }

            doc.setFillColor(254, 252, 232);
            doc.setDrawColor(253, 230, 138);
            doc.setLineWidth(0.3);
            doc.roundedRect(M, y, pageWidth - M * 2, panelH, 1.5, 1.5, 'FD');
            doc.setTextColor(146, 64, 14);
            doc.setFont('helvetica', 'bold'); doc.setFontSize(6.8);
            doc.text('AMENDMENT HISTORY', M + 5, y + 6);
            doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5);
            doc.setTextColor(90);
            doc.text(wrapped, M + 5, y + 11.5);
            y += panelH + 10;
            doc.setTextColor(INK);
        }

        // ---- Footer on every page, as on screen ----
        const pageCount = doc.getNumberOfPages();
        for (let p = 1; p <= pageCount; p++) {
            doc.setPage(p);
            doc.setDrawColor(225); doc.setLineWidth(0.2);
            doc.line(M, pageHeight - 16, right, pageHeight - 16);
            setText(6.5, 'normal', 165);
            doc.text(
                'Computer-generated document. Valid without physical signature or seal. Produced via StarSutra Enterprise Suite.',
                pageWidth / 2, pageHeight - 11, { align: 'center' }
            );
        }

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
