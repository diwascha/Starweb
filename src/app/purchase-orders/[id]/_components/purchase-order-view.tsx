'use client';

import { useEffect, useState, useMemo } from 'react';
import type { PurchaseOrder, PurchaseOrderStatus, PurchaseOrderVersion } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Printer, Loader2, Save, Image as ImageIcon, History, Eye, ArrowLeft, Sparkles } from 'lucide-react';
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
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useToast } from '@/hooks/use-toast';

const paperTypes = ['Kraft Paper', 'Virgin Paper'];

export default function PurchaseOrderView({ initialPurchaseOrder, poId }: { initialPurchaseOrder: PurchaseOrder | null, poId?: string }) {
  const [purchaseOrder, setPurchaseOrder] = useState<PurchaseOrder | null>(initialPurchaseOrder);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [isGeneratingJpg, setIsGeneratingJpg] = useState(false);
  const [includeAmendments, setIncludeAmendments] = useState(true);
  const [selectedVersion, setSelectedVersion] = useState<PurchaseOrderVersion | null>(null);
  const [isVersionDialogOpen, setIsVersionDialogOpen] = useState(false);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  useEffect(() => {
    if (initialPurchaseOrder) {
      setPurchaseOrder(initialPurchaseOrder);
    } else if (poId) {
      getPurchaseOrder(poId).then(setPurchaseOrder);
    }
  }, [initialPurchaseOrder, poId]);
  
  const handleExport = async (format: 'pdf' | 'jpg') => {
    if (!purchaseOrder) return;
    
    if (format === 'jpg') {
        setIsGeneratingJpg(true);
        const printableArea = document.querySelector('.printable-area') as HTMLElement;
        if (!printableArea) {
            setIsGeneratingJpg(false);
            return;
        }
        try {
            const html2canvas = (await import('html2canvas')).default;
            const canvas = await html2canvas(printableArea, {
                scale: 2, useCORS: true, logging: false,
                onclone: (doc) => { if (!includeAmendments) doc.getElementById('amendment-history-section')?.style.setProperty('display', 'none', 'important'); }
            });
            const link = document.createElement('a');
            link.download = `PO-${purchaseOrder.poNumber}.jpg`;
            link.href = canvas.toDataURL('image/jpeg', 0.9);
            link.click();
        } catch (error) {
            console.error(`Error generating JPG`, error);
        } finally {
            setIsGeneratingJpg(false);
        }
    } else { // PDF
        setIsGeneratingPdf(true);
        try {
            const doc = new jsPDF();
            
            // Header
            doc.setFont('Helvetica', 'bold');
            doc.setFontSize(16);
            doc.text('SHIVAM PACKAGING INDUSTRIES PVT LTD.', doc.internal.pageSize.getWidth() / 2, 15, { align: 'center' });
            
            doc.setFont('Helvetica', 'normal');
            doc.setFontSize(10);
            doc.text('HETAUDA 08, BAGMATI PROVIENCE, NEPAL', doc.internal.pageSize.getWidth() / 2, 21, { align: 'center' });

            doc.setFont('Helvetica', 'bold');
            doc.setFontSize(14);
            doc.text('PURCHASE ORDER', doc.internal.pageSize.getWidth() / 2, 30, { align: 'center' });
            
            if (purchaseOrder.amendments && purchaseOrder.amendments.length > 0 && purchaseOrder.amendments[purchaseOrder.amendments.length - 1]) {
                const lastAmendmentDate = new Date(purchaseOrder.amendments[purchaseOrder.amendments.length - 1].date);
                doc.setFontSize(8);
                doc.setFont('Helvetica', 'italic');
                doc.text(`(AMENDED PO-LAST RELEASED-${lastAmendmentDate.toLocaleDateString('en-CA')})`, doc.internal.pageSize.getWidth() / 2, 35, { align: 'center' });
            }

            // Info
            doc.setFontSize(10);
            doc.setFont('Helvetica', 'normal');
            doc.text(`To:`, 14, 45);
            doc.setFont('Helvetica', 'bold');
            doc.text(purchaseOrder.companyName, 14, 50);
            doc.setFont('Helvetica', 'normal');
            if (purchaseOrder.companyAddress) doc.text(purchaseOrder.companyAddress, 14, 55);
            if (purchaseOrder.panNumber) doc.text(`PAN: ${purchaseOrder.panNumber}`, 14, 60);

            doc.text(`PO No: ${purchaseOrder.poNumber}`, doc.internal.pageSize.getWidth() - 14, 45, { align: 'right' });
            const nepaliPoDate = new NepaliDate(new Date(purchaseOrder.poDate)).format('YYYY/MM/DD');
            doc.text(`Date: ${nepaliPoDate} BS`, doc.internal.pageSize.getWidth() - 14, 50, { align: 'right' });
            
            let finalY = 65;

            const groupedItems = purchaseOrder.items.reduce((acc, item) => {
                const key = item.rawMaterialType || 'Other';
                if (!acc[key]) acc[key] = [];
                acc[key].push(item);
                return acc;
            }, {} as Record<string, typeof purchaseOrder.items>);

            for (const [type, items] of Object.entries(groupedItems)) {
                const isPaper = paperTypes.includes(type);
                const head = [['S.N.', 'Description', ...(isPaper ? ['Size (Inch)', 'GSM', 'BF'] : []), 'Quantity']];
                
                const body = items.map((item, index) => [
                    index + 1,
                    item.rawMaterialName,
                    ...(isPaper ? [item.size || '-', item.gsm || '-', item.bf || '-'] : []),
                    `${item.quantity} ${item.unit}`
                ]);

                autoTable(doc, {
                    startY: finalY,
                    head: [[{ content: type, colSpan: head[0].length, styles: { fontStyle: 'bold', fillColor: [230, 230, 230], textColor: 20 } }]],
                    body: [],
                    theme: 'grid',
                    showHead: 'firstPage',
                });
                 
                autoTable(doc, {
                    startY: (doc as any).lastAutoTable.finalY,
                    head: head,
                    body: body,
                    theme: 'grid',
                    headStyles: { fillColor: [240, 240, 240], textColor: 20 },
                });
                
                finalY = (doc as any).lastAutoTable.finalY + 10;
            }
            
            if (includeAmendments && purchaseOrder.amendments && purchaseOrder.amendments.length > 0) {
                finalY += 5;
                doc.setFont('Helvetica', 'bold');
                doc.text("Amendment History", 14, finalY);
                finalY += 5;
                autoTable(doc, {
                    startY: finalY,
                    head: [['#', 'Date & Time', 'Remarks']],
                    body: purchaseOrder.amendments.map((am, i) => [i + 1, new Date(am.date).toLocaleString(), am.remarks]),
                    theme: 'grid',
                    headStyles: { fillColor: [240, 240, 240], textColor: 20 },
                });
                finalY = (doc as any).lastAutoTable.finalY + 10;
            }

            doc.setFontSize(8);
            doc.text("This is a digitally issued document and is valid without a signature.", doc.internal.pageSize.getWidth() / 2, doc.internal.pageSize.getHeight() - 15, { align: 'center' });
            doc.setFontSize(10);
            doc.text("SHIVAM PACKAGING INDUSTRIES PVT LTD.", doc.internal.pageSize.getWidth() / 2, doc.internal.pageSize.getHeight() - 10, { align: 'center' });


            doc.save(`PO-${purchaseOrder.poNumber}.pdf`);

        } catch (error) {
            console.error('PDF export failed:', error);
        } finally {
            setIsGeneratingPdf(false);
        }
    }
  };
  
  const handlePrint = () => {
    const style = document.createElement('style');
    style.id = 'print-style';
    style.innerHTML = `
      @media print {
        #amendment-history-section {
          display: ${includeAmendments ? 'block' : 'none'} !important;
        }
      }
    `;
    document.head.appendChild(style);
    window.print();
    document.getElementById('print-style')?.remove();
  };

  const handleViewVersion = (version: PurchaseOrderVersion) => {
      setSelectedVersion(version);
      setAiSummary(null);
      setIsVersionDialogOpen(true);
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
                    poNumber: version.data.poNumber || purchaseOrder.poNumber,
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
    if (element) {
        element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  if (!purchaseOrder) {
    return (
      <div className="flex justify-center items-center h-full">
        <p>Purchase Order not found or is loading...</p>
      </div>
    );
  }

  const nepaliPoDateString = new NepaliDate(new Date(purchaseOrder.poDate)).format('YYYY/MM/DD');
  
  const showAmendedDate = purchaseOrder.amendments && purchaseOrder.amendments.length > 0;
  const lastAmendment = showAmendedDate ? purchaseOrder.amendments[purchaseOrder.amendments.length - 1] : null;
  const amendedDate = lastAmendment ? new Date(lastAmendment.date) : null;
  const nepaliAmendedDateString = amendedDate ? new NepaliDate(amendedDate).format('YYYY/MM/DD') : '';

  const groupedItems = useMemo(() => {
    return purchaseOrder.items.reduce((acc, item) => {
        const key = item.rawMaterialType || 'Other';
        if (!acc[key]) acc[key] = [];
        acc[key].push(item);
        return acc;
    }, {} as Record<string, typeof purchaseOrder.items>);
  }, [purchaseOrder.items]);

  const getStatusBadgeVariant = (status: PurchaseOrderStatus) => {
    switch (status) {
      case 'Ordered': return 'default';
      case 'Amended': return 'secondary';
      case 'Delivered': return 'outline';
      case 'Canceled': return 'destructive';
      case 'Draft': return 'secondary';
      default: return 'default';
    }
  };
  
  const leadTime = purchaseOrder.deliveryDate
    ? differenceInDays(new Date(purchaseOrder.deliveryDate), new Date(purchaseOrder.poDate))
    : null;

  const groupedVersionItems = useMemo(() => {
    if (!selectedVersion) return {};
    return selectedVersion.data.items.reduce((acc, item) => {
        const key = item.rawMaterialType || 'Other';
        if (!acc[key]) acc[key] = [];
        acc[key].push(item);
        return acc;
    }, {} as Record<string, any>);
  }, [selectedVersion]);

  return (
    <>
      <div className="flex justify-between items-center mb-8 print:hidden">
        <div>
            <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" onClick={() => router.push('/purchase-orders/list')}>
                    <ArrowLeft className="h-5 w-5"/>
                </Button>
                <h1 className="text-3xl font-bold">Purchase Order</h1>
            </div>
            <div className="flex items-center gap-2 mt-2 ml-10">
                <Badge variant={getStatusBadgeVariant(purchaseOrder.status)} className="text-base">
                  {purchaseOrder.status}
                </Badge>
                 {purchaseOrder.status === 'Delivered' && purchaseOrder.deliveryDate && (
                    <p className="text-sm text-muted-foreground">
                        Delivered on {new Date(purchaseOrder.deliveryDate).toLocaleDateString()}
                        {leadTime !== null && ` (${leadTime} days lead time)`}
                    </p>
                )}
            </div>
        </div>
        <div className="space-y-2">
            <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={scrollToHistory}>
                    <History className="mr-2 h-4 w-4"/>
                    History
                </Button>
                <Button variant="outline" onClick={() => router.push(`/purchase-orders/edit?id=${purchaseOrder.id}`)}>Edit</Button>
                <Button variant="outline" onClick={() => handleExport('jpg')} disabled={isGeneratingJpg}>
                    {isGeneratingJpg ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ImageIcon className="mr-2 h-4 w-4" />}
                    {isGeneratingJpg ? 'Saving...' : 'Save as JPG'}
                </Button>
                <Button variant="outline" onClick={() => handleExport('pdf')} disabled={isGeneratingPdf}>
                    {isGeneratingPdf ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    {isGeneratingPdf ? 'Saving...' : 'Save as PDF'}
                </Button>
                <Button onClick={handlePrint}>
                    <Printer className="mr-2 h-4 w-4" />
                    Print
                </Button>
            </div>
            {showAmendedDate && (
                <div className="flex items-center justify-end space-x-2">
                    <Label htmlFor="include-amendments" className="text-sm">Include Amendment History</Label>
                    <Switch
                        id="include-amendments"
                        checked={includeAmendments}
                        onCheckedChange={setIncludeAmendments}
                    />
                </div>
            )}
        </div>
      </div>

      <div className={cn("printable-area space-y-4 p-4 border rounded-lg bg-white text-black")}>
        <header className="text-center space-y-1 mb-4 relative">
            <div className="pt-8">
              <h1 className="text-xl font-bold">SHIVAM PACKAGING INDUSTRIES PVT LTD.</h1>
              <h2 className="text-lg font-semibold"> शिवम प्याकेजिङ्ग इन्डस्ट्रिज प्रा.लि.</h2>
              <p className="text-sm">HETAUDA 08, BAGMATI PROVIENCE, NEPAL</p>
              <h2 className="text-lg font-semibold underline mt-1">PURCHASE ORDER</h2>
              {showAmendedDate && amendedDate && (
                <p className="text-xs italic">
                  (AMENDED PO-LAST RELEASED-{amendedDate.toLocaleDateString('en-CA')})
                </p>
              )}
            </div>
        </header>
        
        <div className="grid grid-cols-2 text-xs mb-2 gap-x-4">
            <div><span className="font-semibold">PO No:</span> {purchaseOrder.poNumber}</div>
            <div className="text-right">
              <span className="font-semibold">Date:</span> {nepaliPoDateString} B.S. ({new Date(purchaseOrder.poDate).toLocaleDateString('en-CA')})
            </div>
             {showAmendedDate && amendedDate && (
              <div className="col-start-2 text-right">
                <span className="font-semibold">Amended Date:</span> {nepaliAmendedDateString} B.S. ({amendedDate.toLocaleDateString('en-CA')})
              </div>
            )}
        </div>
        
        <Separator className="my-2 bg-gray-300"/>

        <Card className="shadow-none border-gray-300">
          <CardHeader className="p-2">
            <CardTitle className="text-base">To: {purchaseOrder.companyName}</CardTitle>
            <p className="text-sm">{purchaseOrder.companyAddress}</p>
            {purchaseOrder.panNumber && <p className="text-sm">PAN: {purchaseOrder.panNumber}</p>}
          </CardHeader>
          <CardContent className="space-y-4 p-2">
            <section className="space-y-2">
              <h2 className="text-base font-semibold">Order Details</h2>
               {Object.entries(groupedItems).map(([type, items]) => {
                  const isPaper = paperTypes.includes(type);

                  const sortedItems = isPaper
                    ? [...items].sort((a, b) => {
                        const gsmA = parseFloat(a.gsm) || 0;
                        const gsmB = parseFloat(b.gsm) || 0;
                        if (gsmA !== gsmB) {
                            return gsmA - gsmB;
                        }
                        const sizeA = parseFloat(a.size) || 0;
                        const sizeB = parseFloat(b.size) || 0;
                        return sizeA - sizeB;
                      })
                    : items;

                  const totals = sortedItems.reduce((acc, item) => {
                      const quantity = parseFloat(item.quantity);
                      if (!isNaN(quantity) && quantity > 0) {
                          acc[item.unit] = (acc[item.unit] || 0) + quantity;
                      }
                      return acc;
                  }, {} as Record<string, number>);

                  return (
                    <div key={type} className="border rounded-lg border-gray-300 mb-4">
                        <Table>
                        <TableHeader>
                            <TableRow className="border-b-gray-300 bg-gray-100">
                                <TableCell colSpan={isPaper ? 6 : 4} className="font-bold text-black h-8 px-2 text-sm">{type}</TableCell>
                            </TableRow>
                            <TableRow className="border-b-gray-300">
                            <TableHead className="text-black font-semibold h-8 px-2 text-xs">S.N.</TableHead>
                            <TableHead className="text-black font-semibold h-8 px-2 text-xs">Description</TableHead>
                            {isPaper && (
                                <>
                                <TableHead className="text-black font-semibold h-8 px-2 text-xs">Size (Inch)</TableHead>
                                <TableHead className="text-black font-semibold h-8 px-2 text-xs">GSM</TableHead>
                                <TableHead className="text-black font-semibold h-8 px-2 text-xs">BF</TableHead>
                                </>
                            )}
                            <TableHead className="text-black font-semibold h-8 px-2 text-xs text-right">Quantity</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {sortedItems.map((item, index) => (
                            <TableRow key={`${''}${item.rawMaterialId}-${index}`} className="border-b-gray-300">
                                <TableCell className="px-2 py-1 text-xs">{index + 1}</TableCell>
                                <TableCell className="px-2 py-1 text-xs">{item.rawMaterialName}</TableCell>
                                {isPaper && (
                                    <>
                                        <TableCell className="px-2 py-1 text-xs">{item.size || '-'}</TableCell>
                                        <TableCell className="px-2 py-1 text-xs">{item.gsm || '-'}</TableCell>
                                        <TableCell className="px-2 py-1 text-xs">{item.bf || '-'}</TableCell>
                                    </>
                                )}
                                <TableCell className="px-2 py-1 text-xs text-right">{item.quantity} {item.unit}</TableCell>
                            </TableRow>
                            ))}
                        </TableBody>
                         <TableFooter>
                            <TableRow className="border-t-2 border-gray-400 font-bold">
                                <TableCell colSpan={isPaper ? 5 : 3} className="text-right px-2 py-1 text-xs">Total</TableCell>
                                <TableCell className="text-right px-2 py-1 text-xs">
                                     {Object.entries(totals).map(([unit, total]) => (
                                        <span key={unit} className="mr-4">{total.toLocaleString()} {unit}</span>
                                    ))}
                                </TableCell>
                            </TableRow>
                        </TableFooter>
                        </Table>
                    </div>
                  );
                })}
            </section>
            <section id="amendment-history-section">
             {showAmendedDate && purchaseOrder.amendments && purchaseOrder.amendments.length > 0 && (
                <div className="amendment-content">
                  <h3 className="text-base font-semibold">Amendment History</h3>
                  <div className="text-xs border-t border-gray-300 mt-1 pt-1 space-y-1">
                    {purchaseOrder.amendments.map((amendment, index) => (
                      <div key={index}>
                        <p className="font-semibold">
                          Amended on: {new Date(amendment.date).toLocaleString()}
                        </p>
                        <p className="pl-4">Remarks: {amendment.remarks}</p>
                      </div>
                    ))}
                  </div>
                </div>
            )}
            </section>
            <div className="mt-12 text-center pt-8 text-xs text-gray-500">
              <p>This is a digitally issued document and is valid without a signature.</p>
              <p className="font-semibold mt-1">SHIVAM PACKAGING INDUSTRIES PVT LTD.</p>
            </div>
          </CardContent>
        </Card>
      </div>

       <div id="po-history-section" className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-8 print:hidden">
            {(purchaseOrder.versions && purchaseOrder.versions.length > 0) || (purchaseOrder.amendments && purchaseOrder.amendments.length > 0) ? (
                <>
                {purchaseOrder.versions && purchaseOrder.versions.length > 0 && (
                    <Card>
                        <CardHeader>
                            <div className="flex items-center gap-2">
                                <History className="h-5 w-5 text-muted-foreground"/>
                                <CardTitle>Version Snapshots</CardTitle>
                            </div>
                            <CardDescription>A complete snapshot of the PO every time it was updated.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Snapshot Time</TableHead>
                                        <TableHead>Modified By</TableHead>
                                        <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {[...(purchaseOrder.versions || [])].reverse().map((version) => (
                                        <TableRow key={version.versionId}>
                                            <TableCell>{new Date(version.replacedAt).toLocaleString()}</TableCell>
                                            <TableCell>{version.replacedBy}</TableCell>
                                            <TableCell className="text-right space-x-2">
                                                <Button variant="ghost" size="sm" onClick={() => handleSummarizeChanges(version)} disabled={isSummarizing}>
                                                    {isSummarizing ? <Loader2 className="h-3 w-3 animate-spin"/> : <Sparkles className="mr-2 h-4 w-4 text-purple-600"/>}
                                                    Compare (AI)
                                                </Button>
                                                <Button variant="ghost" size="sm" onClick={() => handleViewVersion(version)}>
                                                    <Eye className="mr-2 h-4 w-4"/> View
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                )}

                {purchaseOrder.amendments && purchaseOrder.amendments.length > 0 && (
                    <Card>
                        <CardHeader>
                            <CardTitle>Amendment Logs</CardTitle>
                            <CardDescription>Records of manual amendments and remarks.</CardDescription>
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
                                    {purchaseOrder.amendments.map((log, index) => (
                                        <TableRow key={index}>
                                            <TableCell className="whitespace-nowrap">{new Date(log.date).toLocaleString()}</TableCell>
                                            <TableCell>{log.remarks}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                )}
                </>
            ) : (
                <Card className="md:col-span-2">
                    <CardContent className="py-12 text-center text-muted-foreground">
                        <History className="h-12 w-12 mx-auto mb-4 opacity-20"/>
                        <p>No history available for this purchase order yet.</p>
                    </CardContent>
                </Card>
            )}
       </div>

       <Dialog open={isVersionDialogOpen} onOpenChange={setIsVersionDialogOpen}>
            <DialogContent className="max-w-5xl max-h-[90vh] overflow-auto">
                <DialogHeader>
                    <DialogTitle>
                        {aiSummary ? 'Summary of Changes (AI)' : 'Historical Snapshot View'}
                    </DialogTitle>
                    <DialogDescription>
                        {aiSummary 
                            ? `AI analysis of changes between the current PO and the version from ${selectedVersion ? new Date(selectedVersion.replacedAt).toLocaleString() : ''}`
                            : `Full PO state as of ${selectedVersion ? new Date(selectedVersion.replacedAt).toLocaleString() : ''}`}
                    </DialogDescription>
                </DialogHeader>
                
                {aiSummary && (
                    <div className="bg-purple-50 border border-purple-100 p-4 rounded-lg mb-6">
                        <div className="flex items-center gap-2 mb-2">
                            <Sparkles className="h-4 w-4 text-purple-600"/>
                            <span className="font-bold text-purple-900">AI Summary</span>
                        </div>
                        <p className="text-purple-800 whitespace-pre-wrap leading-relaxed">{aiSummary}</p>
                    </div>
                )}

                {selectedVersion && (
                    <div className="space-y-4 p-6 border rounded-lg bg-white text-black text-xs">
                        <header className="text-center space-y-1 mb-4">
                            <h1 className="text-lg font-bold">SHIVAM PACKAGING INDUSTRIES PVT LTD.</h1>
                            <p className="text-xs">HETAUDA 08, BAGMATI PROVIENCE, NEPAL</p>
                            <h2 className="text-base font-semibold underline mt-1">PURCHASE ORDER</h2>
                        </header>
                        
                        <div className="grid grid-cols-2 gap-x-4">
                            <div><span className="font-semibold">PO No:</span> {selectedVersion.data.poNumber || purchaseOrder.poNumber}</div>
                            <div className="text-right">
                                <span className="font-semibold">Date:</span> {new NepaliDate(new Date(selectedVersion.data.poDate)).format('YYYY/MM/DD')} BS ({new Date(selectedVersion.data.poDate).toLocaleDateString('en-CA')})
                            </div>
                        </div>
                        
                        <Separator className="my-2 bg-gray-300"/>

                        <div className="space-y-1 mb-4">
                            <p className="font-bold text-sm">To: {selectedVersion.data.companyName}</p>
                            <p>{selectedVersion.data.companyAddress}</p>
                            {selectedVersion.data.panNumber && <p>PAN: {selectedVersion.data.panNumber}</p>}
                        </div>

                        <div className="space-y-4">
                            {Object.entries(groupedVersionItems).map(([type, items]: [string, any]) => {
                                const isPaper = paperTypes.includes(type);
                                const totals = items.reduce((acc: any, item: any) => {
                                    const quantity = parseFloat(item.quantity);
                                    if (!isNaN(quantity) && quantity > 0) {
                                        acc[item.unit] = (acc[item.unit] || 0) + quantity;
                                    }
                                    return acc;
                                }, {} as Record<string, number>);

                                return (
                                    <div key={type} className="border rounded-lg border-gray-300">
                                        <Table>
                                            <TableHeader>
                                                <TableRow className="bg-gray-50">
                                                    <TableCell colSpan={isPaper ? 6 : 4} className="font-bold h-6 px-2 text-xs">{type}</TableCell>
                                                </TableRow>
                                                <TableRow>
                                                    <TableHead className="h-6 px-2 text-[10px]">S.N.</TableHead>
                                                    <TableHead className="h-6 px-2 text-[10px]">Description</TableHead>
                                                    {isPaper && (
                                                        <>
                                                            <TableHead className="h-6 px-2 text-[10px]">Size</TableHead>
                                                            <TableHead className="h-6 px-2 text-[10px]">GSM</TableHead>
                                                            <TableHead className="h-6 px-2 text-[10px]">BF</TableHead>
                                                        </>
                                                    )}
                                                    <TableHead className="h-6 px-2 text-[10px] text-right">Quantity</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {items.map((item: any, index: number) => (
                                                    <TableRow key={index} className="h-6">
                                                        <TableCell className="px-2 py-0.5">{index + 1}</TableCell>
                                                        <TableCell className="px-2 py-0.5">{item.rawMaterialName}</TableCell>
                                                        {isPaper && (
                                                            <>
                                                                <TableCell className="px-2 py-0.5">{item.size || '-'}</TableCell>
                                                                <TableCell className="px-2 py-0.5">{item.gsm || '-'}</TableCell>
                                                                <TableCell className="px-2 py-0.5">{item.bf || '-'}</TableCell>
                                                            </>
                                                        )}
                                                        <TableCell className="px-2 py-0.5 text-right">{item.quantity} {item.unit}</TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                            <TableFooter>
                                                <TableRow className="font-bold">
                                                    <TableCell colSpan={isPaper ? 5 : 3} className="text-right px-2 py-0.5">Total</TableCell>
                                                    <TableCell className="text-right px-2 py-0.5">
                                                        {Object.entries(totals).map(([unit, total]: [any, any]) => (
                                                            <span key={unit}>{total.toLocaleString()} {unit}</span>
                                                        ))}
                                                    </TableCell>
                                                </TableRow>
                                            </TableFooter>
                                        </Table>
                                    </div>
                                );
                            })}
                        </div>
                        <div className="mt-8 text-center text-[10px] text-gray-500">
                            <p>Snapshot of version replaced by {selectedVersion.replacedBy} on {new Date(selectedVersion.replacedAt).toLocaleString()}</p>
                        </div>
                    </div>
                )}
                <DialogFooter>
                    <Button variant="outline" onClick={() => setIsVersionDialogOpen(false)}>Close</Button>
                </DialogFooter>
            </DialogContent>
       </Dialog>

      <style jsx global>{`
        @media print {
          @page {
            size: A4;
            margin: 0.3in 0.8in 0 0.8in;
          }
          body {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
            background-color: #fff !important;
          }
          body > * {
            visibility: hidden;
          }
          .printable-area, .printable-area * {
            visibility: visible;
          }
          .printable-area {
            position: absolute;
            left: 0; top: 0; width: 100%; height: auto; margin: 0; padding: 0; border: none; font-size: 10px;
          }
           .print\\:hidden {
              display: none !important;
           }
        }
      `}</style>
    </>
  );
}
