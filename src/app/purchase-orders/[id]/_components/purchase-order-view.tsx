
'use client';

import { useEffect, useState } from 'react';
import useLocalStorage from '@/hooks/use-local-storage';
import type { PurchaseOrder } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Printer } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import Image from 'next/image';
import NepaliDate from 'nepali-date-converter';
import { useRouter } from 'next/navigation';

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

  return (
    <>
      <div className="flex justify-between items-center mb-8 print:hidden">
        <h1 className="text-3xl font-bold">Purchase Order</h1>
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
              <Image src="/logo.png" alt="Company Logo" width={100} height={100} />
            </div>
            <div className="pt-28">
              <h1 className="text-2xl font-bold">SHIVAM PACKAGING INDUSTRIES PVT LTD.</h1>
              <p>HETAUDA 08, BAGMATI PROVIENCE, NEPAL</p>
              <h2 className="text-xl font-semibold underline mt-2">PURCHASE ORDER</h2>
            </div>
        </header>
        
        <div className="grid grid-cols-2 text-sm mb-4 gap-x-4 gap-y-2">
            <div><span className="font-semibold">PO No:</span> {purchaseOrder.poNumber}</div>
            <div className="text-right"><span className="font-semibold">Date:</span> {nepaliDateString} B.S. ({new Date(purchaseOrder.poDate).toLocaleDateString('en-CA')})</div>
        </div>
        
        <Separator className="my-4 bg-gray-300"/>

        <Card className="shadow-none border-gray-300">
          <CardHeader>
            <CardTitle>To: {purchaseOrder.companyName}</CardTitle>
            <p className="text-sm">{purchaseOrder.companyAddress}</p>
          </CardHeader>
          <CardContent className="space-y-6">
            <section>
              <h2 className="text-xl font-semibold mb-2">Order Details</h2>
              <div className="border rounded-lg border-gray-300">
                <Table>
                  <TableHeader>
                    <TableRow className="border-b-gray-300">
                      <TableHead className="text-black font-semibold">S.N.</TableHead>
                      <TableHead className="text-black font-semibold">Particulars</TableHead>
                      <TableHead className="text-black font-semibold text-right">Quantity</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {purchaseOrder.items.map((item, index) => (
                      <TableRow key={item.rawMaterialId} className="border-b-gray-300">
                        <TableCell>{index + 1}</TableCell>
                        <TableCell>{item.rawMaterialName}</TableCell>
                        <TableCell className="text-right">{item.quantity}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </section>
            <div className="mt-16 grid grid-cols-2 gap-8 pt-12 text-sm">
              <div className="text-center">
                <div className="border-t border-black w-48 mx-auto"></div>
                <p className="font-semibold mt-2">Prepared by</p>
              </div>
              <div className="text-center">
                <div className="border-t border-black w-48 mx-auto"></div>
                <p className="font-semibold mt-2">Approved by</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
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
