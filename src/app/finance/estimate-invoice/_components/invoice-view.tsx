'use client';

import { Party, EstimateInvoiceItem } from '@/lib/types';
import { cn, toNepaliDate } from '@/lib/utils';
import { format } from 'date-fns';

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';

import { useBusinessProfile } from '@/hooks/use-business-profile';


interface InvoiceViewProps {
  invoiceNumber: string;
  date: string;
  party: Party | null;
  items: EstimateInvoiceItem[];
  grossTotal: number;
  vatTotal: number;
  netTotal: number;
  amountInWords: string;
  /** On-screen preview: reflow for phone widths. Leave off for the A4
   *  export/print copy, which must look the same on every device. */
  responsive?: boolean;
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
  responsive = false,
}: InvoiceViewProps) {
  const companyProfile = useBusinessProfile();

  const nepaliDate = toNepaliDate(date);
  const adDate = format(new Date(date), 'yyyy-MM-dd');
  const totalQuantity = items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
  // Responsive classes only apply to the on-screen preview.
  // Both arguments are literal class lists so Tailwind can see them.
  const r = (responsiveClasses: string, fixedClasses: string) => (responsive ? responsiveClasses : fixedClasses);
  const num = 'whitespace-nowrap tabular-nums';

  return (
    <div className={cn("bg-white text-black font-sans", r('p-4 text-xs sm:p-8 sm:text-sm', 'p-8 text-sm'))}>
        <div id="invoice-header">
            <header className="text-center space-y-1 mb-6">
                <h1 className={cn("font-bold uppercase", r('text-lg leading-tight sm:text-2xl', 'text-2xl'))}>{companyProfile.nameEn}</h1>
                <p className={r('text-xs sm:text-base', 'text-base')}>{companyProfile.address}</p>
                <h2 className={cn("font-bold underline mt-2", r('text-base sm:text-xl', 'text-xl'))}>ESTIMATE INVOICE</h2>
            </header>

            <div className={cn("grid text-xs mb-4", r('grid-cols-1 gap-1 sm:grid-cols-2 sm:gap-0', 'grid-cols-2'))}>
                <div>
                    <p><span className="font-semibold">Invoice No:</span> {invoiceNumber}</p>
                    <p><span className="font-semibold">Party Name:</span> {party?.name}</p>
                    {party?.address && <p><span className="font-semibold">Address:</span> {party?.address}</p>}
                    {party?.panNumber && <p><span className="font-semibold">PAN/VAT No:</span> {party?.panNumber}</p>}
                </div>
                <div className={r('text-left sm:text-right', 'text-right')}>
                    <p><span className="font-semibold">Date:</span> {nepaliDate} BS ({adDate})</p>
                </div>
            </div>
        </div>
        
        <Table>
            <TableHeader>
                <TableRow className="border-y border-black">
                    <TableHead className="text-black font-semibold h-8 px-2 text-xs">S.N.</TableHead>
                    <TableHead className="text-black font-semibold h-8 px-2 text-xs">Particulars</TableHead>
                    <TableHead className="text-black font-semibold h-8 px-2 text-right">Quantity</TableHead>
                    <TableHead className="text-black font-semibold h-8 px-2 text-right">Rate</TableHead>
                    <TableHead className="text-black font-semibold h-8 px-2 text-right">Amount</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {items.map((item, index) => (
                    <TableRow key={item.id} className="border-b border-gray-400">
                        <TableCell className="px-2 py-1 text-xs">{index + 1}</TableCell>
                        <TableCell className="px-2 py-1 text-xs">{item.productName}</TableCell>
                        <TableCell className={cn("px-2 py-1 text-right", num)}>{item.quantity}</TableCell>
                        <TableCell className={cn("px-2 py-1 text-right", num)}>{item.rate.toLocaleString('en-IN', {minimumFractionDigits: 2})}</TableCell>
                        <TableCell className={cn("px-2 py-1 text-right", num)}>{item.gross.toLocaleString('en-IN', {minimumFractionDigits: 2})}</TableCell>
                    </TableRow>
                ))}
            </TableBody>
            <TableFooter>
                <TableRow>
                    <TableCell colSpan={2} className="text-right font-bold">Total Quantity</TableCell>
                    <TableCell className={cn("font-bold text-right", num)}>{totalQuantity.toLocaleString('en-IN')}</TableCell>
                    <TableCell className="text-right font-bold">Gross Total</TableCell>
                    <TableCell className={cn("text-right font-bold", num)}>{grossTotal.toLocaleString('en-IN', {minimumFractionDigits: 2})}</TableCell>
                </TableRow>
                 <TableRow>
                    <TableCell colSpan={4} className="text-right font-bold">VAT (13%)</TableCell>
                    <TableCell className={cn("text-right font-bold", num)}>{vatTotal.toLocaleString('en-IN', {minimumFractionDigits: 2})}</TableCell>
                </TableRow>
                 <TableRow className="border-t-2 border-black font-bold text-base">
                    <TableCell colSpan={4} className="text-right">Net Total</TableCell>
                    <TableCell className={cn("text-right", num)}>{netTotal.toLocaleString('en-IN', {minimumFractionDigits: 2})}</TableCell>
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
