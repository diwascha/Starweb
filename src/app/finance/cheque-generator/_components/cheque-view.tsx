
'use client';

import { toWords, toNepaliDate } from '@/lib/utils';
import { format } from 'date-fns';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';

interface SplitDetail {
  chequeDate: Date;
  chequeNumber: string;
  amount: number | '';
}

interface ChequeViewProps {
  voucherNo: string;
  voucherDate: Date;
  payeeName: string;
  splits: SplitDetail[];
}

export function ChequeView({ voucherNo, voucherDate, payeeName, splits }: ChequeViewProps) {
  const nepaliDate = toNepaliDate(voucherDate.toISOString());
  const adDate = format(voucherDate, 'yyyy-MM-dd');
  
  const totalAmount = splits.reduce((sum, split) => sum + (Number(split.amount) || 0), 0);
  const amountInWords = toWords(totalAmount);
  const formattedTotalAmount = totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 });

  return (
    <div className="cheque-container bg-white text-black p-8 font-sans text-sm space-y-6" style={{ pageBreakAfter: 'always' }}>
        <header className="text-center space-y-1">
            <h1 className="text-xl font-bold">SHIVAM PACKAGING INDUSTRIES PVT LTD.</h1>
            <p className="text-sm">HETAUDA 08, BAGMATI PROVIENCE, NEPAL</p>
            <h2 className="text-lg font-semibold underline mt-1">PAYMENT VOUCHER</h2>
        </header>

        <div className="flex justify-between text-xs">
            <div>
                <p><span className="font-semibold">Voucher No:</span> {voucherNo}</p>
                <p><span className="font-semibold">Payee:</span> {payeeName}</p>
            </div>
            <div className="text-right">
                <p><span className="font-semibold">Voucher Date:</span> {nepaliDate} BS ({adDate})</p>
            </div>
        </div>

        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead className="text-black font-semibold">Cheque No.</TableHead>
                    <TableHead className="text-black font-semibold">Cheque Date</TableHead>
                    <TableHead className="text-black font-semibold text-right">Amount</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {splits.map((split, index) => {
                    const nepaliChequeDate = toNepaliDate(split.chequeDate.toISOString());
                    const adChequeDate = format(split.chequeDate, 'yyyy-MM-dd');
                    const formattedAmount = (Number(split.amount) || 0).toLocaleString(undefined, { minimumFractionDigits: 2 });
                    return (
                        <TableRow key={index}>
                            <TableCell>{split.chequeNumber || 'N/A'}</TableCell>
                            <TableCell>{nepaliChequeDate} ({adChequeDate})</TableCell>
                            <TableCell className="text-right">{formattedAmount}</TableCell>
                        </TableRow>
                    )
                })}
            </TableBody>
            <TableFooter>
                <TableRow className="font-bold text-base">
                    <TableCell colSpan={2} className="text-right">Total</TableCell>
                    <TableCell className="text-right">{formattedTotalAmount}</TableCell>
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
