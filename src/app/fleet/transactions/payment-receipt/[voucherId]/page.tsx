
'use client';

import { useEffect, useState, use } from 'react';
import { getVoucherTransactions } from '@/services/transaction-service';
import type { Transaction, Vehicle, Party, Account } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Printer, Loader2 } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { toNepaliDate, cn } from '@/lib/utils';
import { onVehiclesUpdate } from '@/services/vehicle-service';
import { onPartiesUpdate } from '@/services/party-service';
import { onAccountsUpdate } from '@/services/account-service';
import { format } from 'date-fns';

export default function VoucherViewPage({ params }: { params: Promise<{ voucherId: string }> }) {
  const { voucherId } = use(params);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getVoucherTransactions(voucherId),
      new Promise<Vehicle[]>(resolve => onVehiclesUpdate(resolve)),
      new Promise<Party[]>(resolve => onPartiesUpdate(resolve)),
      new Promise<Account[]>(resolve => onAccountsUpdate(resolve)),
    ]).then(([voucherTransactions, vehiclesData, partiesData, accountsData]) => {
      setTransactions(voucherTransactions);
      setVehicles(vehiclesData);
      setParties(partiesData);
      setAccounts(accountsData);
      setIsLoading(false);
    });
  }, [voucherId]);
  
  const handlePrint = () => {
    setTimeout(() => {
        window.print();
    }, 100);
  };
  
  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-full">
        <p>Loading voucher...</p>
      </div>
    );
  }

  if (transactions.length === 0) {
    return (
      <div className="flex justify-center items-center h-full">
        <p>Voucher not found.</p>
      </div>
    );
  }

  const voucher = transactions[0];
  const totalAmount = transactions.reduce((sum, t) => sum + t.amount, 0);

  const vehiclesById = new Map(vehicles.map(v => [v.id, v.name]));
  const partiesById = new Map(parties.map(p => [p.id, p.name]));
  const accountsById = new Map(accounts.map(a => [a.id, a.bankName ? `${a.bankName} - ${a.accountNumber}` : a.name]));

  return (
    <>
       <div className="flex justify-between items-center mb-8 print:hidden">
        <div>
            <h1 className="text-3xl font-bold">{voucher.type} Voucher</h1>
             <p className="text-muted-foreground">Voucher #: {voucher.items[0]?.particular.replace(/ .*/,'')}</p>
        </div>
        <div className="flex gap-2">
            <Button onClick={handlePrint}>
                <Printer className="mr-2 h-4 w-4" />
                Print
            </Button>
        </div>
      </div>

       <div className="printable-area space-y-4 p-4 border rounded-lg bg-white text-black">
        <header className="text-center space-y-1 mb-4">
            <h1 className="text-xl font-bold">SHIVAM PACKAGING INDUSTRIES PVT LTD.</h1>
            <h2 className="text-lg font-semibold">{voucher.type.toUpperCase()} VOUCHER</h2>
        </header>
        
        <div className="grid grid-cols-2 text-xs mb-2 gap-x-4">
            <div><span className="font-semibold">Voucher No:</span> {voucher.items[0]?.particular.replace(/ .*/,'')}</div>
            <div className="text-right"><span className="font-semibold">Date:</span> {toNepaliDate(voucher.date)} ({format(new Date(voucher.date), 'yyyy-MM-dd')})</div>
        </div>

        <Separator className="my-2 bg-gray-300"/>

        {voucher.billingType === 'Bank' && (
            <div className="grid grid-cols-3 text-xs mb-2 gap-x-4">
                <div><span className="font-semibold">Bank:</span> {accountsById.get(voucher.accountId!)}</div>
                <div><span className="font-semibold">Cheque No:</span> {voucher.chequeNumber}</div>
                <div><span className="font-semibold">Cheque Date:</span> {voucher.chequeDate ? format(new Date(voucher.chequeDate), 'yyyy-MM-dd') : 'N/A'}</div>
            </div>
        )}
        
        <Table>
            <TableHeader>
                <TableRow className="border-b-gray-300">
                    <TableHead className="text-black font-semibold h-8 px-2 text-xs">S.N.</TableHead>
                    <TableHead className="text-black font-semibold h-8 px-2 text-xs">Particulars (Ledger)</TableHead>
                    <TableHead className="text-black font-semibold h-8 px-2 text-xs">Vehicle</TableHead>
                    <TableHead className="text-black font-semibold h-8 px-2 text-xs">Narration</TableHead>
                    <TableHead className="text-black font-semibold h-8 px-2 text-xs text-right">Amount</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {transactions.map((txn, index) => (
                    <TableRow key={txn.id} className="border-b-gray-300">
                        <TableCell className="px-2 py-1 text-xs">{index + 1}</TableCell>
                        <TableCell className="px-2 py-1 text-xs">{partiesById.get(txn.partyId!)}</TableCell>
                        <TableCell className="px-2 py-1 text-xs">{vehiclesById.get(txn.vehicleId)}</TableCell>
                        <TableCell className="px-2 py-1 text-xs">{txn.remarks}</TableCell>
                        <TableCell className="px-2 py-1 text-xs text-right">{txn.amount.toLocaleString()}</TableCell>
                    </TableRow>
                ))}
            </TableBody>
            <TableRow>
                <TableCell colSpan={4} className="text-right font-bold">Total</TableCell>
                <TableCell className="text-right font-bold">{totalAmount.toLocaleString()}</TableCell>
            </TableRow>
        </Table>

        <div className="mt-8 grid grid-cols-3 gap-8 pt-16 text-xs">
            <div className="text-center"><div className="border-t border-black w-36 mx-auto"></div><p className="font-semibold mt-1">Prepared By</p></div>
            <div className="text-center"><div className="border-t border-black w-36 mx-auto"></div><p className="font-semibold mt-1">Checked By</p></div>
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
          .print\:hidden { display: none; }
        }
      `}</style>
    </>
  );
}
