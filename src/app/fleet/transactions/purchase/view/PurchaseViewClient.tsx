'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type { Transaction, Vehicle, Party, Account } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Printer, Loader2, Save, ArrowLeft, Edit } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { toNepaliDate, toWords } from '@/lib/utils';
import { format } from 'date-fns';
import { Table, TableBody, TableCell, TableRow, TableHeader, TableHead } from '@/components/ui/table';
import { useRouter } from 'next/navigation';

interface PurchaseViewClientProps {
  initialTransaction: Transaction;
  vehicles: Vehicle[];
  parties: Party[];
  accounts: Account[];
}

export default function PurchaseViewClient({
  initialTransaction,
  vehicles,
  parties,
  accounts,
}: PurchaseViewClientProps) {
  const router = useRouter();
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  
  const vehicle = vehicles.find(v => v.id === initialTransaction.vehicleId);
  const party = parties.find(p => p.id === initialTransaction.partyId);
  const account = accounts.find(a => a.id === initialTransaction.accountId);

  const subtotal = initialTransaction.items.reduce((sum, item) => sum + item.quantity * item.rate, 0);
  const vatAmount = initialTransaction.invoiceType === 'Taxable' ? subtotal * 0.13 : 0;
  const totalAmount = subtotal + vatAmount;

  const handlePrint = () => {
    setTimeout(() => {
      window.print();
    }, 100);
  };
  
  const handleSaveAsPdf = async () => {
    setIsGeneratingPdf(true);
    const printableArea = document.querySelector('.printable-area') as HTMLElement;
    if (!printableArea) {
      setIsGeneratingPdf(false);
      return;
    }
    
    try {
        const jsPDF = (await import('jspdf')).default;
        const html2canvas = (await import('html2canvas')).default;
        
        const canvas = await html2canvas(printableArea, { scale: 2 });
        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF('p', 'mm', 'a4');
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
        pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
        pdf.save(`Purchase-${initialTransaction.purchaseNumber}.pdf`);
    } catch (error) {
        console.error("Error generating PDF", error);
    } finally {
        setIsGeneratingPdf(false);
    }
  };

  return (
    <>
      <div className="flex justify-between items-center mb-8 print:hidden">
        <div>
          <h1 className="text-3xl font-bold">Purchase Details</h1>
          <p className="text-muted-foreground">Purchase #{initialTransaction.purchaseNumber}</p>
        </div>
        <div className="flex gap-2">
            <Button variant="outline" onClick={() => router.push(`/fleet/transactions/purchase/edit/${initialTransaction.id}`)}>
                <Edit className="mr-2 h-4 w-4" /> Edit
            </Button>
            <Button variant="outline" onClick={handleSaveAsPdf} disabled={isGeneratingPdf}>
                {isGeneratingPdf ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                {isGeneratingPdf ? 'Saving...' : 'Save as PDF'}
            </Button>
            <Button onClick={handlePrint}>
                <Printer className="mr-2 h-4 w-4" /> Print
            </Button>
        </div>
      </div>
      
       <div className="printable-area space-y-4 p-4 border rounded-lg bg-white text-black">
        <header className="text-center space-y-1 mb-4">
            <h1 className="text-xl font-bold">SIJAN DHUWANI SEWA</h1>
            <p className="text-sm">HETAUDA 16, BAGMATI PROVIENCE, NEPAL</p>
            <p className="text-xs">PAN: 304603712</p>
            <h2 className="text-lg font-semibold underline mt-1">PURCHASE VOUCHER</h2>
        </header>

        <div className="grid grid-cols-2 text-xs mb-2 gap-x-4">
            <div><span className="font-semibold">Purchase No:</span> {initialTransaction.purchaseNumber}</div>
            <div className="text-right"><span className="font-semibold">Posting Date:</span> {toNepaliDate(initialTransaction.date)} ({format(new Date(initialTransaction.date), 'yyyy-MM-dd')})</div>
            <div><span className="font-semibold">Invoice No:</span> {initialTransaction.invoiceNumber}</div>
            <div className="text-right"><span className="font-semibold">Invoice Date:</span> {initialTransaction.invoiceDate ? `${toNepaliDate(initialTransaction.invoiceDate)} (${format(new Date(initialTransaction.invoiceDate), 'yyyy-MM-dd')})` : 'N/A'}</div>
            <div><span className="font-semibold">Vehicle No:</span> {vehicle?.name}</div>
        </div>

        <Separator className="my-2 bg-gray-300"/>

        <div className="grid grid-cols-2 text-xs mb-2 gap-x-4">
            <div><p className="font-semibold">Supplier Details</p>
                <p>{party?.name}</p>
                <p>{party?.address}</p>
                <p>PAN: {party?.panNumber}</p>
            </div>
            <div className="text-right"><p className="font-semibold">Payment Details</p>
                <p>Mode: {initialTransaction.billingType}</p>
                {initialTransaction.billingType === 'Bank' && (
                    <>
                        <p>Bank: {account?.bankName}</p>
                        <p>Cheque: {initialTransaction.chequeNumber}</p>
                    </>
                )}
                 {initialTransaction.billingType === 'Credit' && initialTransaction.dueDate && (
                    <p>Due Date: {toNepaliDate(initialTransaction.dueDate)}</p>
                 )}
            </div>
        </div>
        
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead className="text-black font-semibold h-8 px-2 text-xs">S.N.</TableHead>
                    <TableHead className="text-black font-semibold h-8 px-2 text-xs">Particulars</TableHead>
                    <TableHead className="text-black font-semibold h-8 px-2 text-xs text-right">Quantity</TableHead>
                    <TableHead className="text-black font-semibold h-8 px-2 text-xs text-right">Rate</TableHead>
                    <TableHead className="text-black font-semibold h-8 px-2 text-xs text-right">Amount</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {initialTransaction.items.map((item, index) => (
                    <TableRow key={index} className="border-b-gray-300">
                        <TableCell className="px-2 py-1 text-xs">{index + 1}</TableCell>
                        <TableCell className="px-2 py-1 text-xs">{item.particular}</TableCell>
                        <TableCell className="px-2 py-1 text-xs text-right">{item.quantity} {item.uom}</TableCell>
                        <TableCell className="px-2 py-1 text-xs text-right">{item.rate.toLocaleString()}</TableCell>
                        <TableCell className="px-2 py-1 text-xs text-right">{(item.quantity * item.rate).toLocaleString()}</TableCell>
                    </TableRow>
                ))}
            </TableBody>
             <TableFooter>
                <TableRow>
                    <TableCell colSpan={4} className="text-right font-bold text-xs">Subtotal</TableCell>
                    <TableCell className="text-right font-bold text-xs">{subtotal.toLocaleString(undefined, {minimumFractionDigits: 2})}</TableCell>
                </TableRow>
                 {initialTransaction.invoiceType === 'Taxable' && (
                    <TableRow>
                        <TableCell colSpan={4} className="text-right font-bold text-xs">VAT (13%)</TableCell>
                        <TableCell className="text-right font-bold text-xs">{vatAmount.toLocaleString(undefined, {minimumFractionDigits: 2})}</TableCell>
                    </TableRow>
                 )}
                 <TableRow className="border-t-2 border-black font-bold text-base">
                    <TableCell colSpan={4} className="text-right">Grand Total</TableCell>
                    <TableCell className="text-right">{totalAmount.toLocaleString(undefined, {minimumFractionDigits: 2})}</TableCell>
                </TableRow>
            </TableFooter>
        </Table>

        <div className="text-xs mt-2">
            <span className="font-semibold">In Words:</span> {toWords(totalAmount)}
        </div>
        
         <div className="mt-8 grid grid-cols-2 gap-8 pt-16 text-xs">
            <div className="text-center"><div className="border-t border-black w-36 mx-auto"></div><p className="font-semibold mt-1">Prepared By</p></div>
            <div className="text-center"><div className="border-t border-black w-36 mx-auto"></div><p className="font-semibold mt-1">Approved By</p></div>
        </div>

      </div>
      
       <style jsx global>{`
        @media print {
          @page { size: A4; margin: 0.5in; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; background-color: #fff; }
          body * { visibility: hidden; }
          .printable-area, .printable-area * { visibility: visible; }
          .printable-area { position: absolute; left: 0; top: 0; width: 100%; height: auto; margin: 0; padding: 0; border: none; font-size: 10px; }
          .print\\:hidden { display: none; }
        }
      `}</style>
    </>
  );
}
