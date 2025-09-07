'use client';

import { useEffect, useState, Fragment } from 'react';
import type { PurchaseOrder, PurchaseOrderStatus } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Printer, Loader2, Save } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import NepaliDate from 'nepali-date-converter';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { differenceInDays } from 'date-fns';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

const paperTypes = ['Kraft Paper', 'Virgin Paper'];

export default function PurchaseOrderView({ initialPurchaseOrder }: { initialPurchaseOrder: PurchaseOrder }) {
  const [purchaseOrder, setPurchaseOrder] = useState<PurchaseOrder>(initialPurchaseOrder);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const router = useRouter();

  useEffect(() => {
    setPurchaseOrder(initialPurchaseOrder);
  }, [initialPurchaseOrder]);
  
  const handleSaveAsPdf = async () => {
    if (!purchaseOrder) return;
    
    setIsGeneratingPdf(true);
    const printableArea = document.querySelector('.printable-area') as HTMLElement;
    if (!printableArea) {
        setIsGeneratingPdf(false);
        return;
    }
    
    try {
        const canvas = await html2canvas(printableArea, {
            scale: 2, // Higher scale for better quality
            useCORS: true,
            logging: false,
        });

        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF({
            orientation: 'portrait',
            unit: 'px',
            format: 'a4',
        });

        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = pdf.internal.pageSize.getHeight();
        const canvasWidth = canvas.width;
        const canvasHeight = canvas.height;
        const ratio = canvasWidth / canvasHeight;
        const height = pdfWidth / ratio;

        // If the content is taller than one page, split it
        let position = 0;
        let remainingHeight = canvasHeight;

        while (remainingHeight > 0) {
            const pageCanvas = document.createElement('canvas');
            const pageCanvasHeight = Math.min(remainingHeight, canvasWidth * (pdfHeight/pdfWidth));
            pageCanvas.width = canvasWidth;
            pageCanvas.height = pageCanvasHeight;

            const ctx = pageCanvas.getContext('2d');
            ctx?.drawImage(canvas, 0, position, canvasWidth, pageCanvasHeight, 0, 0, canvasWidth, pageCanvasHeight);

            const pageImgData = pageCanvas.toDataURL('image/png');
            const pageHeight = pdfWidth * (pageCanvasHeight / canvasWidth);
            
            if (position > 0) {
                pdf.addPage();
            }
            pdf.addImage(pageImgData, 'PNG', 0, 0, pdfWidth, pageHeight);
            
            position += pageCanvasHeight;
            remainingHeight -= pageCanvasHeight;
        }

        pdf.save(`PO-${purchaseOrder.poNumber}.pdf`);
    } catch (error) {
        console.error("Error generating PDF", error);
    } finally {
        setIsGeneratingPdf(false);
    }
  };
  
  const handlePrint = () => {
    setTimeout(() => {
        window.print();
    }, 100);
  };

  if (!purchaseOrder) {
    return (
      <div className="flex justify-center items-center h-full">
        <p>Purchase Order not found or is loading...</p>
      </div>
    );
  }

  const nepaliPoDate = new NepaliDate(new Date(purchaseOrder.poDate));
  const nepaliPoDateString = nepaliPoDate.format('YYYY/MM/DD');
  
  const showAmendedDate = purchaseOrder.amendments && purchaseOrder.amendments.length > 0;
  const amendedDate = showAmendedDate ? new Date(purchaseOrder.updatedAt) : null;
  const nepaliAmendedDateString = amendedDate ? new NepaliDate(amendedDate).format('YYYY/MM/DD') : '';

  
  const groupedItems = purchaseOrder.items.reduce((acc, item) => {
    const key = item.rawMaterialType || 'Other';
    if (!acc[key]) {
      acc[key] = [];
    }
    acc[key].push(item);
    return acc;
  }, {} as Record<string, typeof purchaseOrder.items>);

  const getStatusBadgeVariant = (status: PurchaseOrderStatus) => {
    switch (status) {
      case 'Ordered':
        return 'default';
      case 'Amended':
        return 'secondary';
      case 'Delivered':
        return 'outline';
      case 'Canceled':
        return 'destructive';
      default:
        return 'default';
    }
  };
  
  const leadTime = purchaseOrder.deliveryDate
    ? differenceInDays(new Date(purchaseOrder.deliveryDate), new Date(purchaseOrder.poDate))
    : null;

  return (
    <>
      <div className="flex justify-between items-center mb-8 print:hidden">
        <div>
            <h1 className="text-3xl font-bold">Purchase Order</h1>
            <div className="flex items-center gap-2 mt-2">
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
        <div className="flex gap-2">
            <Button variant="outline" onClick={() => router.push(`/purchase-orders/edit/${purchaseOrder.id}`)}>Edit</Button>
            <Button variant="outline" onClick={handleSaveAsPdf} disabled={isGeneratingPdf}>
                {isGeneratingPdf ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                {isGeneratingPdf ? 'Saving...' : 'Save as PDF'}
            </Button>
            <Button onClick={handlePrint}>
                <Printer className="mr-2 h-4 w-4" />
                Print
            </Button>
        </div>
      </div>

      <div className="printable-area space-y-4 p-4 border rounded-lg bg-white text-black">
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
          </CardHeader>
          <CardContent className="space-y-4 p-2">
            <section className="space-y-2">
              <h2 className="text-base font-semibold">Order Details</h2>
               {Object.entries(groupedItems).map(([type, items]) => {
                  const isPaper = paperTypes.includes(type);
                  return (
                    <div key={type} className="border rounded-lg border-gray-300">
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
                            {items.map((item, index) => (
                            <TableRow key={`${item.rawMaterialId}-${index}`} className="border-b-gray-300">
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
                        </Table>
                    </div>
                  );
                })}
            </section>
             {showAmendedDate && purchaseOrder.amendments && purchaseOrder.amendments.length > 0 && (
                <section>
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
                </section>
            )}
            <div className="mt-12 text-center pt-8 text-xs text-gray-500">
              <p>This is a digitally issued document and is valid without a signature.</p>
              <p className="font-semibold mt-1">SHIVAM PACKAGING INDUSTRIES PVT LTD.</p>
            </div>
          </CardContent>
        </Card>
      </div>
       {purchaseOrder.amendments && purchaseOrder.amendments.length > 0 && (
           <Card className="mt-8 print:hidden">
             <CardHeader>
               <CardTitle>Amendment History</CardTitle>
               <CardDescription>This PO has been amended {purchaseOrder.amendments.length} time(s).</CardDescription>
             </CardHeader>
             <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Amendment #</TableHead>
                            <TableHead>Date & Time</TableHead>
                            <TableHead>Remarks</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {purchaseOrder.amendments.map((log, index) => (
                            <TableRow key={index}>
                                <TableCell>{index + 1}</TableCell>
                                <TableCell>{new Date(log.date).toLocaleString()}</TableCell>
                                <TableCell>{log.remarks}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
             </CardContent>
           </Card>
        )}
      <style jsx global>{`
        @media print {
          @page {
            size: A4;
            margin: 0.3in 0.8in 0 0.8in;
          }
          body {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
            background-color: #fff;
          }
          body * {
            visibility: hidden;
          }
          .printable-area, .printable-area * {
            visibility: visible;
          }
          .printable-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            height: auto;
            margin: 0;
            padding: 0;
            border: none;
            font-size: 10px; /* Smaller base font size for print */
          }
           .print\:hidden {
              display: none;
           }
        }
      `}</style>
    </>
  );
}
