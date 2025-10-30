
'use client';

import type { Party, EstimateInvoiceItem } from '@/lib/types';
import { toNepaliDate } from '@/lib/utils';
import { format } from 'date-fns';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';


interface InvoiceViewProps {
  invoiceNumber: string;
  date: string;
  party: Party | null;
  items: EstimateInvoiceItem[];
  grossTotal: number;
  vatTotal: number;
  netTotal: number;
  amountInWords: string;
}

export function InvoiceView({
  invoiceNumber,
  date,
  party,
  items,
  grossTotal,
  vatTotal,
  netTotal,
  amountInWords,
}: InvoiceViewProps) {
  
  const nepaliDate = toNepaliDate(date);
  const adDate = format(new Date(date), 'yyyy-MM-dd');
  const totalQuantity = items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);

  return (
    <div className="bg-white text-black p-8 font-sans text-sm">
        <header className="text-center space-y-1 mb-6">
            <h1 className="text-2xl font-bold">SHIVAM PACKAGING INDUSTRIES PVT LTD.</h1>
            <h2 className="text-xl font-semibold">शिवम प्याकेजिङ्ग इन्डस्ट्रिज प्रा.लि.</h2>
            <p className="text-base">HETAUDA 08, BAGMATI PROVIENCE, NEPAL</p>
            <h2 className="text-xl font-bold underline mt-2">ESTIMATE INVOICE</h2>
        </header>

        <div className="grid grid-cols-2 text-xs mb-4">
            <div>
                <p><span className="font-semibold">Invoice No:</span> {invoiceNumber}</p>
                <p><span className="font-semibold">Party Name:</span> {party?.name}</p>
                <p><span className="font-semibold">Address:</span> {party?.address}</p>
                <p><span className="font-semibold">PAN/VAT No:</span> {party?.panNumber}</p>
            </div>
            <div className="text-right">
                <p><span className="font-semibold">Date:</span> {nepaliDate} BS ({adDate})</p>
            </div>
        </div>
        
        <Table>
            <TableHeader>
                <TableRow className="border-y border-black">
                    <TableHead className="text-black font-semibold h-8 px-2">S.N.</TableHead>
                    <TableHead className="text-black font-semibold h-8 px-2">Particulars</TableHead>
                    <TableHead className="text-black font-semibold h-8 px-2">Quantity</TableHead>
                    <TableHead className="text-black font-semibold h-8 px-2 text-right">Rate</TableHead>
                    <TableHead className="text-black font-semibold h-8 px-2 text-right">Amount</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {items.map((item, index) => (
                    <TableRow key={item.id} className="border-b border-gray-400">
                        <TableCell className="px-2 py-1">{index + 1}</TableCell>
                        <TableCell className="px-2 py-1">{item.productName}</TableCell>
                        <TableCell className="px-2 py-1">{item.quantity}</TableCell>
                        <TableCell className="px-2 py-1 text-right">{item.rate.toLocaleString(undefined, {minimumFractionDigits: 2})}</TableCell>
                        <TableCell className="px-2 py-1 text-right">{item.gross.toLocaleString(undefined, {minimumFractionDigits: 2})}</TableCell>
                    </TableRow>
                ))}
            </TableBody>
            <TableFooter>
                <TableRow>
                    <TableCell colSpan={2} className="text-right font-bold">Total Quantity</TableCell>
                    <TableCell className="font-bold">{totalQuantity.toLocaleString()}</TableCell>
                    <TableCell className="text-right font-bold">Gross Total</TableCell>
                    <TableCell className="text-right font-bold">{grossTotal.toLocaleString(undefined, {minimumFractionDigits: 2})}</TableCell>
                </TableRow>
                 <TableRow>
                    <TableCell colSpan={4} className="text-right font-bold">VAT (13%)</TableCell>
                    <TableCell className="text-right font-bold">{vatTotal.toLocaleString(undefined, {minimumFractionDigits: 2})}</TableCell>
                </TableRow>
                 <TableRow className="border-t-2 border-black font-bold text-base">
                    <TableCell colSpan={4} className="text-right">Net Total</TableCell>
                    <TableCell className="text-right">{netTotal.toLocaleString(undefined, {minimumFractionDigits: 2})}</TableCell>
                </TableRow>
            </TableFooter>
        </Table>

        <div className="mt-4">
            <p><span className="font-semibold">In Words:</span> {amountInWords}</p>
        </div>

        <div className="mt-8 text-center text-xs text-gray-700">
            <p className="font-bold">Disclaimer:</p>
            <p>This is an estimate for discussion purposes and not a substitute for a formal VAT invoice.</p>
        </div>
    </div>
  );
}
