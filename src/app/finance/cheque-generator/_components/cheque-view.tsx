
'use client';

import { toWords, toNepaliDate } from '@/lib/utils';
import { format } from 'date-fns';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';

interface ChequeViewProps {
  chequeDate: Date;
  payeeName: string;
  amount: number;
}

export function ChequeView({ chequeDate, payeeName, amount }: ChequeViewProps) {
  const nepaliDate = toNepaliDate(chequeDate.toISOString());
  const adDate = format(chequeDate, 'yyyy-MM-dd');
  const amountInWords = toWords(amount);
  const formattedAmount = amount.toLocaleString(undefined, { minimumFractionDigits: 2 });

  return (
    <div className="cheque-container bg-white text-black p-8 font-sans text-sm space-y-6" style={{ pageBreakAfter: 'always' }}>
        <header className="text-center space-y-1">
            <h1 className="text-xl font-bold">SHIVAM PACKAGING INDUSTRIES PVT LTD.</h1>
            <p className="text-sm">HETAUDA 08, BAGMATI PROVIENCE, NEPAL</p>
            <h2 className="text-lg font-semibold underline mt-1">PAYMENT VOUCHER</h2>
        </header>

        <div className="flex justify-between text-xs">
            <div>
                <span className="font-semibold">Payee:</span> {payeeName}
            </div>
            <div>
                <span className="font-semibold">Date:</span> {nepaliDate} BS ({adDate})
            </div>
        </div>

        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead className="text-black font-semibold">Description</TableHead>
                    <TableHead className="text-black font-semibold text-right">Amount</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                <TableRow>
                    <TableCell>Payment to {payeeName}</TableCell>
                    <TableCell className="text-right">{formattedAmount}</TableCell>
                </TableRow>
            </TableBody>
            <TableFooter>
                <TableRow className="font-bold text-base">
                    <TableCell className="text-right">Total</TableCell>
                    <TableCell className="text-right">{formattedAmount}</TableCell>
                </TableRow>
            </TableFooter>
        </Table>
        
        <div>
             <p><span className="font-semibold">In Words:</span> {amountInWords}</p>
        </div>

        <div className="mt-16 grid grid-cols-2 gap-8 pt-16 text-xs">
            <div className="text-center"><div className="border-t border-black w-48 mx-auto"></div><p className="font-semibold mt-1">Receiver's Signature</p></div>
            <div className="text-center"><div className="border-t border-black w-48 mx-auto"></div><p className="font-semibold mt-1">Authorized Signature</p></div>
        </div>
    </div>
  );
}
