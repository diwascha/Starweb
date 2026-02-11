'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import type { PurchaseOrder, PurchaseOrderStatus, PurchaseOrderVersion } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Printer, Loader2, Save, Image as ImageIcon, History, Eye, ArrowLeft, Sparkles, X, Edit } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import NepaliDate from 'nepali-date-converter';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { differenceInDays } from 'date-fns';
import { getPurchaseOrder } from '@/services/purchase-order-service';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import jsPDF from 'jsPDF';
import autoTable from 'jspdf-autotable';
import { useToast } from '@/hooks/use-toast';

const paperTypes = ['Kraft Paper', 'Virgin Paper'];

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

/**
 * Reusable component to render the PO document structure
 */
function PurchaseOrderDocument({ 
  po, 
  includeAmendments = true,
  containerRef
}: { 
  po: any, 
  includeAmendments?: boolean,
  containerRef?: React.RefObject<HTMLDivElement | null>
}) {
  const nepaliPoDateString = new NepaliDate(new Date(po.poDate)).format('YYYY/MM/DD');
  const showAmendedDate = po.amendments && po.amendments.length > 0;
  const lastAmendment = showAmendedDate ? po.amendments[po.amendments.length - 1] : null;
  const amendedDate = lastAmendment ? new Date(lastAmendment.date) : null;
  const nepaliAmendedDateString = amendedDate ? new NepaliDate(amendedDate).format('YYYY/MM/DD') : '';

  const groupedItems = useMemo(() => {
    return (po.items || []).reduce((acc: any, item: any) => {
        const key = item.rawMaterialType || 'Other';
        if (!acc[key]) acc[key] = [];
        acc[key].push(item);
        return acc;
    }, {} as Record<string, any>);
  }, [po.items]);

  return (
    <div ref={containerRef} className="bg-white text-black p-8 font-sans">
        <header className="text-center space-y-1 mb-6">
            <h1 className="text-2xl font-bold">SHIVAM PACKAGING INDUSTRIES PVT LTD.</h1>
            <h2 className="text-xl font-semibold">शिवम प्याकेजिङ्ग इन्डस्ट्रिज प्रा.लि.</h2>
            <p className="text-base">HETAUDA 08, BAGMATI PROVIENCE, NEPAL</p>
            <h2 className="text-xl font-bold underline mt-2">PURCHASE ORDER</h2>
            {showAmendedDate && amendedDate && (
                <p className="text-xs italic text-gray-600">
                    (AMENDED PO-LAST RELEASED-{amendedDate.toLocaleDateString('en-CA')})
                </p>
            )}
        </header>
        
        <div className="grid grid-cols-2 text-sm mb-4">
            <div>
                <p><span className="font-semibold">PO No:</span> {po.poNumber}</p>
                <div className="mt-4">
                    <p className="font-bold">To:</p>
                    <p className="font-bold text-lg">{po.companyName}</p>
                    <p>{po.companyAddress}</p>
                    {po.panNumber && <p>PAN: {po.panNumber}</p>}
                </div>
            </div>
            <div className="text-right flex flex-col justify-between">
                <div>
                    <p><span className="font-semibold">Date:</span> {nepaliPoDateString} B.S.</p>
                    <p className="text-xs text-gray-500">({new Date(po.poDate).toLocaleDateString('en-CA')})</p>
                    {showAmendedDate && amendedDate && (
                        <div className="mt-2">
                            <p><span className="font-semibold">Amended:</span> {nepaliAmendedDateString} B.S.</p>
                            <p className="text-xs text-gray-500">({amendedDate.toLocaleDateString('en-CA')})</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
        
        <Separator className="my-4 bg-gray-300"/>

        <div className="space-y-6">
            {Object.entries(groupedItems).map(([type, items]: [string, any]) => {
                const isPaper = paperTypes.includes(type);
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
                    <div key={type} className="border rounded-lg border-gray-300 overflow-hidden">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-gray-100 border-b-gray-300">
                                    <TableCell colSpan={isPaper ? 6 : 4} className="font-bold text-black py-2 px-3 text-sm">{type}</TableCell>
                                </TableRow>
                                <TableRow className="border-b-gray-300">
                                    <TableHead className="text-black font-semibold h-8 px-3 text-xs">S.N.</TableHead>
                                    <TableHead className="text-black font-semibold h-8 px-3 text-xs">Description</TableHead>
                                    {isPaper && (
                                        <>
                                            <TableHead className="text-black font-semibold h-8 px-3 text-xs text-center">Size (Inch)</TableHead>
                                            <TableHead className="text-black font-semibold h-8 px-3 text-xs text-center">GSM</TableHead>
                                            <TableHead className="text-black font-semibold h-8 px-3 text-xs text-center">BF</TableHead>
                                        </>
                                    )}
                                    <TableHead className="text-black font-semibold h-8 px-3 text-xs text-right">Quantity</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {sortedItems.map((item: any, index: number) => (
                                    <TableRow key={index} className="border-b-gray-300">
                                        <TableCell className="px-3 py-2 text-xs">{index + 1}</TableCell>
                                        <TableCell className="px-3 py-2 text-xs">{item.rawMaterialName}</TableCell>
                                        {isPaper && (
                                            <>
                                                <TableCell className="px-3 py-2 text-xs text-center">{item.size || '-'}</TableCell>
                                                <TableCell className="px-3 py-2 text-xs text-center">{item.gsm || '-'}</TableCell>
                                                <TableCell className="px-3 py-2 text-xs text-center">{normalizeBF(item.bf) || '-'}</TableCell>
                                            </>
                                        )}
                                        <TableCell className="px-3 py-2 text-xs text-right font-medium">{item.quantity} {item.unit}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                            <TableFooter className="bg-gray-50">
                                <TableRow className="font-bold border-t-gray-400">
                                    <TableCell colSpan={isPaper ? 5 : 3} className="text-right px-3 py-2 text-xs">Total</TableCell>
                                    <TableCell className="text-right px-3 py-2 text-xs">
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

        {includeAmendments && po.amendments && po.amendments.length > 0 && (
            <div className="mt-8 border-t border-gray-300 pt-4">
                <h3 className="text-sm font-bold uppercase mb-2">Amendment History</h3>
                <div className="space-y-2">
                    {po.amendments.map((am: any, i: number) => (
                        <div key={i} className="text-[10px] text-gray-700">
                            <span className="font-bold">{i + 1}. Amended on:</span> {new Date(am.date).toLocaleString()}
                            <p className="ml-4 italic">Remarks: {am.remarks}</p>
                        </div>
                    ))}
                </div>
            </div>
        )}

        <div className="mt-16 text-center text-xs text-gray-500 border-t border-gray-200 pt-8">
            <p>This is a digitally issued document and is valid without a signature.</p>
            <p className="font-bold mt-1 text-black">SHIVAM PACKAGING INDUSTRIES PVT LTD.</p>
        </div>
    </div>
  );
}

export default function PurchaseOrderView({ initialPurchaseOrder, poId }: { initialPurchaseOrder: PurchaseOrder | null, poId?: string }) {
  const [purchaseOrder, setPurchaseOrder] = useState<PurchaseOrder | null>(initialPurchaseOrder);
  const [isExporting, setIsExporting] = useState<Record<string, boolean>>({});
  const [includeAmendments, setIncludeAmendments] = useState(true);
  const [selectedVersion, setSelectedVersion] = useState<PurchaseOrderVersion | null>(null);
  const [isVersionDialogOpen, setIsVersionDialogOpen] = useState(false);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [isSummarizing, setIsSummarizing] = useState(false);
  
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
  
  const handleExportPdf = async (targetPo: any, poNo: string) => {
    const key = `pdf-${poNo}`;
    setIsExporting(prev => ({ ...prev, [key]: true }));
    try {
        const doc = new jsPDF();
        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(16);
        doc.text('SHIVAM PACKAGING INDUSTRIES PVT LTD.', doc.internal.pageSize.getWidth() / 2, 15, { align: 'center' });
        doc.setFont('Helvetica', 'normal');
        doc.setFontSize(10);
        doc.text('HETAUDA 08, BAGMATI PROVIENCE, NEPAL', doc.internal.pageSize.getWidth() / 2, 21, { align: 'center' });
        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(14);
        doc.text('PURCHASE ORDER', doc.internal.pageSize.getWidth() / 2, 30, { align: 'center' });
        
        doc.setFontSize(10);
        doc.setFont('Helvetica', 'normal');
        doc.text(`To:`, 14, 45);
        doc.setFont('Helvetica', 'bold');
        doc.text(targetPo.companyName, 14, 50);
        doc.setFont('Helvetica', 'normal');
        if (targetPo.companyAddress) doc.text(targetPo.companyAddress, 14, 55);
        if (targetPo.panNumber) doc.text(`PAN: ${targetPo.panNumber}`, 14, 60);
        doc.text(`PO No: ${targetPo.poNumber}`, doc.internal.pageSize.getWidth() - 14, 45, { align: 'right' });
        const nepaliPoDate = new NepaliDate(new Date(targetPo.poDate)).format('YYYY/MM/DD');
        doc.text(`Date: ${nepaliPoDate} BS`, doc.internal.pageSize.getWidth() - 14, 50, { align: 'right' });
        
        let finalY = 65;
        const groupedItems = targetPo.items.reduce((acc: any, item: any) => {
            const key = item.rawMaterialType || 'Other';
            if (!acc[key]) acc[key] = [];
            acc[key].push(item);
            return acc;
        }, {} as Record<string, any>);

        for (const [type, items] of Object.entries(groupedItems) as [string, any][]) {
            const isPaper = paperTypes.includes(type);
            const head = [['S.N.', 'Description', ...(isPaper ? ['Size', 'GSM', 'BF'] : []), 'Quantity']];
            const body = items.map((item: any, index: number) => [
                index + 1, item.rawMaterialName, ...(isPaper ? [item.size || '-', item.gsm || '-', normalizeBF(item.bf) || '-'] : []), `${item.quantity} ${item.unit}`
            ]);
            autoTable(doc, {
                startY: finalY,
                head: [[{ content: type, colSpan: head[0].length, styles: { fontStyle: 'bold', fillColor: [230, 230, 230] } }]],
                theme: 'grid',
            });
            autoTable(doc, {
                startY: (doc as any).lastAutoTable.finalY,
                head: head,
                body: body,
                theme: 'grid',
            });
            finalY = (doc as any).lastAutoTable.finalY + 10;
        }
        doc.save(`PO-${poNo}.pdf`);
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
        const link = document.createElement('a');
        link.download = `PO-${poNo}.jpg`;
        link.href = canvas.toDataURL('image/jpeg', 0.9);
        link.click();
    } catch (error) {
        toast({ title: 'Image Export Failed', variant: 'destructive' });
    } finally {
        setIsExporting(prev => ({ ...prev, [key]: false }));
    }
  };

  const handlePrint = (ref: React.RefObject<HTMLDivElement | null>) => {
    if (!ref.current) return;
    const printWindow = window.open('', '', 'height=800,width=800');
    printWindow?.document.write('<html><head><title>Print PO</title>');
    // Simple inline styles for basic layout persistence
    printWindow?.document.write('<style>body{font-family:sans-serif;}table{width:100%;border-collapse:collapse;margin-bottom:1rem;}th,td{border:1px solid #ddd;padding:8px;text-align:left;}th{background-color:#f2f2f2;}.text-right{text-align:right;}</style>');
    printWindow?.document.write('</head><body>');
    printWindow?.document.write(ref.current.innerHTML);
    printWindow?.document.write('</body></html>');
    printWindow?.document.close();
    printWindow?.focus();
    setTimeout(() => {
        printWindow?.print();
        printWindow?.close();
    }, 250);
  };

  const handleSummarizeChanges = async (version: PurchaseOrderVersion) => {
    if (!purchaseOrder) return;
    setIsSummarizing(true);
    setAiSummary(null);
    try {
        const response = await fetch('/api/summarize-po', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                originalPO: {
                    poNumber: version.data.poNumber,
                    poDate: version.data.poDate,
                    companyName: version.data.companyName,
                    items: version.data.items,
                },
                updatedPO: {
                    poNumber: purchaseOrder.poNumber,
                    poDate: purchaseOrder.poDate,
                    companyName: purchaseOrder.companyName,
                    items: purchaseOrder.items,
                }
            })
        });
        
        if (!response.ok) throw new Error('Failed to summarize');
        const result = await response.json();
        setAiSummary(result.summary);
        setSelectedVersion(version);
        setIsVersionDialogOpen(true);
    } catch (error) {
        toast({ title: 'AI Summary Failed', description: 'Could not generate summary of changes.', variant: 'destructive' });
    } finally {
        setIsSummarizing(false);
    }
  };

  const scrollToHistory = () => {
    const element = document.getElementById('po-history-section');
    if (element) element.scrollIntoView({ behavior: 'smooth' });
  };

  if (!purchaseOrder) return <div className="p-8 text-center">Loading...</div>;

  return (
    <div className="flex flex-col gap-8 max-w-6xl mx-auto">
      <div className="flex justify-between items-center print:hidden">
        <div>
            <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" onClick={() => router.push('/purchase-orders/list')}>
                    <ArrowLeft className="h-5 w-5"/>
                </Button>
                <h1 className="text-3xl font-bold">Purchase Order</h1>
            </div>
            <div className="flex items-center gap-2 mt-2 ml-10">
                <Badge variant={purchaseOrder.status === 'Delivered' ? 'outline' : 'default'} className="text-base">
                  {purchaseOrder.status}
                </Badge>
            </div>
        </div>
        <div className="space-y-2 flex flex-col items-end">
            <div className="flex gap-2">
                <Button variant="outline" onClick={scrollToHistory}><History className="mr-2 h-4 w-4"/> History</Button>
                <Button variant="outline" onClick={() => router.push(`/purchase-orders/edit?id=${purchaseOrder.id}`)}><Edit className="mr-2 h-4 w-4"/> Edit</Button>
                <Button variant="outline" onClick={() => handleExportJpg(mainPrintRef, purchaseOrder.poNumber)} disabled={isExporting[`jpg-${purchaseOrder.poNumber}`]}>
                    {isExporting[`jpg-${purchaseOrder.poNumber}`] ? <Loader2 className="animate-spin h-4 w-4"/> : <ImageIcon className="h-4 w-4"/>}
                </Button>
                <Button variant="outline" onClick={() => handleExportPdf(purchaseOrder, purchaseOrder.poNumber)} disabled={isExporting[`pdf-${purchaseOrder.poNumber}`]}>
                    {isExporting[`pdf-${purchaseOrder.poNumber}`] ? <Loader2 className="animate-spin h-4 w-4"/> : <Save className="h-4 w-4"/>}
                </Button>
                <Button onClick={() => handlePrint(mainPrintRef)}><Printer className="mr-2 h-4 w-4" /> Print</Button>
            </div>
            <div className="flex items-center gap-2">
                <Label htmlFor="main-include-amendments" className="text-xs text-muted-foreground">Include History in Export</Label>
                <Switch id="main-include-amendments" checked={includeAmendments} onCheckedChange={setIncludeAmendments} />
            </div>
        </div>
      </div>

      <Card className="border shadow-lg">
        <PurchaseOrderDocument 
            po={purchaseOrder} 
            includeAmendments={includeAmendments} 
            containerRef={mainPrintRef}
        />
      </Card>

       <div id="po-history-section" className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-12 print:hidden">
            <Card>
                <CardHeader>
                    <div className="flex items-center gap-2">
                        <History className="h-5 w-5 text-muted-foreground"/>
                        <CardTitle>Version Snapshots</CardTitle>
                    </div>
                    <CardDescription>Snapshots captured before every update.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Snapshot Time</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {purchaseOrder.versions && purchaseOrder.versions.length > 0 ? (
                                [...purchaseOrder.versions].reverse().map((version) => (
                                    <TableRow key={version.versionId}>
                                        <TableCell>
                                            <div className="text-sm font-medium">{new Date(version.replacedAt).toLocaleString()}</div>
                                            <div className="text-xs text-muted-foreground">Replaced by {version.replacedBy}</div>
                                        </TableCell>
                                        <TableCell className="text-right space-x-2">
                                            <Button variant="ghost" size="sm" onClick={() => handleSummarizeChanges(version)} disabled={isSummarizing}>
                                                {isSummarizing ? <Loader2 className="h-3 w-3 animate-spin"/> : <Sparkles className="mr-2 h-4 w-4 text-purple-600"/>}
                                                Compare
                                            </Button>
                                            <Button variant="ghost" size="sm" onClick={() => { setSelectedVersion(version); setAiSummary(null); setIsVersionDialogOpen(true); }}>
                                                <Eye className="mr-2 h-4 w-4"/> View
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow><TableCell colSpan={2} className="text-center py-8 text-muted-foreground">No versions yet.</TableCell></TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Amendment Logs</CardTitle>
                    <CardDescription>Manual amendment records.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Date & Time</TableHead>
                                <TableHead>Remarks</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {purchaseOrder.amendments && purchaseOrder.amendments.length > 0 ? (
                                purchaseOrder.amendments.map((log, index) => (
                                    <TableRow key={index}>
                                        <TableCell className="whitespace-nowrap text-xs">{new Date(log.date).toLocaleString()}</TableCell>
                                        <TableCell className="text-xs">{log.remarks}</TableCell>
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow><TableCell colSpan={2} className="text-center py-8 text-muted-foreground">No manual amendments.</TableCell></TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
       </div>

       <Dialog open={isVersionDialogOpen} onOpenChange={setIsVersionDialogOpen}>
            <DialogContent className="max-w-5xl max-h-[95vh] overflow-auto p-0">
                <DialogHeader className="p-6 pb-0">
                    <DialogTitle className="flex items-center justify-between">
                        <span>{aiSummary ? 'Change Summary' : 'Snapshot Preview'}</span>
                        <Button variant="ghost" size="icon" onClick={() => setIsVersionDialogOpen(false)}><X className="h-4 w-4"/></Button>
                    </DialogTitle>
                    <DialogDescription>
                        {selectedVersion ? `As of ${new Date(selectedVersion.replacedAt).toLocaleString()}` : ''}
                    </DialogDescription>
                </DialogHeader>
                
                <div className="p-6 space-y-6">
                    {aiSummary && (
                        <div className="bg-purple-50 border border-purple-100 p-4 rounded-lg">
                            <div className="flex items-center gap-2 mb-2">
                                <Sparkles className="h-4 w-4 text-purple-600"/>
                                <span className="font-bold text-purple-900">AI Comparison Summary</span>
                            </div>
                            <p className="text-purple-800 whitespace-pre-wrap text-sm leading-relaxed">{aiSummary}</p>
                        </div>
                    )}

                    {selectedVersion && (
                        <div className="border rounded-lg shadow-inner overflow-hidden">
                            <PurchaseOrderDocument 
                                po={selectedVersion.data} 
                                includeAmendments={false} 
                                containerRef={snapshotPrintRef}
                            />
                        </div>
                    )}
                </div>

                <DialogFooter className="p-6 bg-muted/20 border-t sticky bottom-0">
                    <div className="flex w-full justify-between items-center">
                        <div className="flex gap-2">
                            {selectedVersion && (
                                <>
                                    <Button variant="outline" size="sm" onClick={() => handleExportJpg(snapshotPrintRef, `Snapshot-${selectedVersion.versionId}`)}>
                                        <ImageIcon className="mr-2 h-4 w-4"/> Image
                                    </Button>
                                    <Button variant="outline" size="sm" onClick={() => handleExportPdf(selectedVersion.data, `Snapshot-${selectedVersion.versionId}`)}>
                                        <Save className="mr-2 h-4 w-4"/> PDF
                                    </Button>
                                    <Button variant="outline" size="sm" onClick={() => handlePrint(snapshotPrintRef)}>
                                        <Printer className="mr-2 h-4 w-4"/> Print
                                    </Button>
                                </>
                            )}
                        </div>
                        <Button variant="secondary" onClick={() => setIsVersionDialogOpen(false)}>Close</Button>
                    </div>
                </DialogFooter>
            </DialogContent>
       </Dialog>
    </div>
  );
}
