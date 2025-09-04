
'use client';

import { useEffect, useState, Fragment } from 'react';
import useLocalStorage from '@/hooks/use-local-storage';
import type { PurchaseOrder, PurchaseOrderStatus } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Printer } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import NepaliDate from 'nepali-date-converter';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { differenceInDays } from 'date-fns';
import Image from 'next/image';

const paperTypes = ['Kraft Paper', 'Virgin Paper'];

export default function PurchaseOrderView({ poId }: { poId: string }) {
  const [purchaseOrders] = useLocalStorage<PurchaseOrder[]>('purchaseOrders', []);
  const [purchaseOrder, setPurchaseOrder] = useState<PurchaseOrder | null>(null);
  const router = useRouter();

  useEffect(() => {
    const found = purchaseOrders.find(p => p.id === poId);
    setPurchaseOrder(found || null);
  }, [poId, purchaseOrders]);

  if (!purchaseOrder) {
    return (
      <div className="flex justify-center items-center h-full">
        <p>Purchase Order not found or is loading...</p>
      </div>
    );
  }

  const nepaliDate = new NepaliDate(new Date(purchaseOrder.poDate));
  const nepaliDateString = nepaliDate.format('YYYY/MM/DD');
  
  const createdDate = new Date(purchaseOrder.createdAt);
  const amendedDate = new Date(purchaseOrder.updatedAt);

  const showAmendedDate = purchaseOrder.amendments && purchaseOrder.amendments.length > 0;
  
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
            <Button variant="outline" onClick={() => router.push(`/purchase-orders/edit/${poId}`)}>Edit</Button>
            <Button onClick={() => window.print()}>
            <Printer className="mr-2 h-4 w-4" />
            Print or Save as PDF
            </Button>
        </div>
      </div>

      <div className="printable-area space-y-8 p-4 border rounded-lg bg-white text-black">
        <header className="text-center space-y-2 mb-8 relative">
            <div className="absolute top-0 left-1/2 -translate-x-1/2">
                <Image src="/logo.png" alt="Company Logo" width={100} height={100} className="mx-auto" />
            </div>
            <div className="pt-8">
              <h1 className="text-2xl font-bold">SHIVAM PACKAGING INDUSTRIES PVT LTD.</h1>
              <p>HETAUDA 08, BAGMATI PROVIENCE, NEPAL</p>
              <h2 className="text-xl font-semibold underline mt-2">PURCHASE ORDER</h2>
            </div>
        </header>
        
        <div className="grid grid-cols-2 text-sm mb-4 gap-x-4 gap-y-2">
            <div><span className="font-semibold">PO No:</span> {purchaseOrder.poNumber}</div>
            <div className="text-right">
              <span className="font-semibold">Date:</span> {nepaliDateString} B.S. ({new Date(purchaseOrder.poDate).toLocaleDateString('en-CA')})
            </div>
            <div>
              <span className="font-semibold">Created Date:</span> {createdDate.toLocaleDateString('en-CA')}
            </div>
             {showAmendedDate && (
              <div className="text-right">
                <span className="font-semibold">Amended Date:</span> {amendedDate.toLocaleDateString('en-CA')}
              </div>
            )}
        </div>
        
        <Separator className="my-4 bg-gray-300"/>

        <Card className="shadow-none border-gray-300">
          <CardHeader>
            <CardTitle>To: {purchaseOrder.companyName}</CardTitle>
            <p className="text-sm">{purchaseOrder.companyAddress}</p>
          </CardHeader>
          <CardContent className="space-y-6">
            <section className="space-y-4">
              <h2 className="text-xl font-semibold">Order Details</h2>
               {Object.entries(groupedItems).map(([type, items]) => {
                  const isPaper = paperTypes.includes(type);
                  return (
                    <div key={type} className="border rounded-lg border-gray-300">
                        <Table>
                        <TableHeader>
                            <TableRow className="border-b-gray-300 bg-gray-100">
                                <TableCell colSpan={isPaper ? 6 : 4} className="font-bold text-black">{type}</TableCell>
                            </TableRow>
                            <TableRow className="border-b-gray-300">
                            <TableHead className="text-black font-semibold">S.N.</TableHead>
                            <TableHead className="text-black font-semibold">Description</TableHead>
                            {isPaper && (
                                <>
                                <TableHead className="text-black font-semibold">Size (Inch)</TableHead>
                                <TableHead className="text-black font-semibold">GSM</TableHead>
                                <TableHead className="text-black font-semibold">BF</TableHead>
                                </>
                            )}
                            <TableHead className="text-black font-semibold text-right">Quantity</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {items.map((item, index) => (
                            <TableRow key={`${item.rawMaterialId}-${index}`} className="border-b-gray-300">
                                <TableCell>{index + 1}</TableCell>
                                <TableCell>{item.rawMaterialName}</TableCell>
                                {isPaper && (
                                    <>
                                        <TableCell>{item.size || '-'}</TableCell>
                                        <TableCell>{item.gsm || '-'}</TableCell>
                                        <TableCell>{item.bf || '-'}</TableCell>
                                    </>
                                )}
                                <TableCell className="text-right">{item.quantity} {item.unit}</TableCell>
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
                  <h3 className="text-lg font-semibold">Amendment History</h3>
                  <div className="text-sm border-t border-gray-300 mt-2 pt-2 space-y-2">
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
            <div className="mt-16 text-center pt-12 text-xs text-gray-500">
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
          body {
            background-color: #fff;
          }
          .printable-area {
            visibility: visible;
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            margin: 0;
            padding: 1.5rem;
            border: none;
            color: #000;
          }
           .printable-area * {
            visibility: visible;
            font-family: 'Times New Roman', Times, serif;
           }
           .print\:hidden {
              display: none;
           }
        }
      `}</style>
    </>
  );
}
