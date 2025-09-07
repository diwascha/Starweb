
'use client';

import { useEffect, useState, use } from 'react';
import { getTransaction } from '@/services/transaction-service';
import type { Transaction, Vehicle, Party, Account } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Printer, Loader2, Edit } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { toNepaliDate } from '@/lib/utils';
import { onVehiclesUpdate } from '@/services/vehicle-service';
import { onPartiesUpdate } from '@/services/party-service';
import { onAccountsUpdate } from '@/services/account-service';
import { format } from 'date-fns';
import { useRouter } from 'next/navigation';

export default function PurchaseViewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [transaction, setTransaction] = useState<Transaction | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getTransaction(id),
      new Promise<Vehicle[]>(resolve => onVehiclesUpdate(resolve)),
      new Promise<Party[]>(resolve => onPartiesUpdate(resolve)),
      new Promise<Account[]>(resolve => onAccountsUpdate(resolve)),
    ]).then(([txn, vehiclesData, partiesData, accountsData]) => {
      setTransaction(txn);
      setVehicles(vehiclesData);
      setParties(partiesData);
      setAccounts(accountsData);
      setIsLoading(false);
    });
  }, [id]);
  
  const handlePrint = () => {
    setTimeout(() => {
        window.print();
    }, 100);
  };
  
  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-full">
        <p>Loading transaction...</p>
      </div>
    );
  }

  if (!transaction) {
    return (
      <div className="flex justify-center items-center h-full">
        <p>Transaction not found.</p>
      </div>
    );
  }

  const vehiclesById = new Map(vehicles.map(v => [v.id, v.name]));
  const partiesById = new Map(parties.map(p => [p.id, p.name]));
  const accountsById = new Map(accounts.map(a => [a.id, a.bankName ? `${a.bankName} - ${a.accountNumber}` : a.name]));
  
  const subtotal = transaction.items.reduce((sum, item) => sum + item.quantity * item.rate, 0);
  const vatAmount = transaction.invoiceType === 'Taxable' ? subtotal * 0.13 : 0;
  
  return (
    <>
       <div className="flex justify-between items-center mb-8 print:hidden">
        <div>
            <h1 className="text-3xl font-bold">Purchase Details</h1>
            <p className="text-muted-foreground">Purchase #: {transaction.purchaseNumber || 'N/A'}</p>
        </div>
        <div className="flex gap-2">
            <Button variant="outline" onClick={() => router.push(`/fleet/transactions/purchase/edit/${id}`)}>
                <Edit className="mr-2 h-4 w-4" /> Edit
            </Button>
            <Button onClick={handlePrint}>
                <Printer className="mr-2 h-4 w-4" /> Print
            </Button>
        </div>
      </div>

       <div className="printable-area space-y-4 p-4 border rounded-lg bg-white text-black">
            <header className="text-center space-y-1 mb-4">
                <h1 className="text-xl font-bold">SHIVAM PACKAGING INDUSTRIES PVT LTD.</h1>
                <h2 className="text-lg font-semibold">PURCHASE VOUCHER</h2>
            </header>
            
            <div className="grid grid-cols-2 text-xs mb-2 gap-x-4">
                <div><span className="font-semibold">Purchase No:</span> {transaction.purchaseNumber || 'N/A'}</div>
                <div className="text-right"><span className="font-semibold">Date:</span> {toNepaliDate(transaction.date)} ({format(new Date(transaction.date), 'yyyy-MM-dd')})</div>
                <div><span className="font-semibold">Vehicle:</span> {vehiclesById.get(transaction.vehicleId) || 'N/A'}</div>
                <div className="text-right"><span className="font-semibold">Invoice No:</span> {transaction.invoiceNumber || 'N/A'}</div>
                <div className="text-right"><span className="font-semibold">Invoice Date:</span> {transaction.invoiceDate ? toNepaliDate(transaction.invoiceDate) : 'N/A'}</div>
            </div>

            <Separator className="my-2 bg-gray-300"/>

            <div className="text-xs mb-2"><span className="font-semibold">Vendor:</span> {partiesById.get(transaction.partyId!) || 'N/A'}</div>
            
            {transaction.billingType === 'Bank' && (
                <div className="grid grid-cols-3 text-xs mb-2 gap-x-4">
                    <div><span className="font-semibold">Bank:</span> {accountsById.get(transaction.accountId!)}</div>
                    <div><span className="font-semibold">Cheque No:</span> {transaction.chequeNumber}</div>
                    <div><span className="font-semibold">Cheque Date:</span> {transaction.chequeDate ? format(new Date(transaction.chequeDate), 'yyyy-MM-dd') : 'N/A'}</div>
                </div>
            )}
            
            <Table>
                <TableHeader>
                    <TableRow className="border-b-gray-300">
                        <TableHead className="text-black font-semibold h-8 px-2 text-xs">S.N.</TableHead>
                        <TableHead className="text-black font-semibold h-8 px-2 text-xs">Particulars</TableHead>
                        <TableHead className="text-black font-semibold h-8 px-2 text-xs">Qty</TableHead>
                        <TableHead className="text-black font-semibold h-8 px-2 text-xs">UOM</TableHead>
                        <TableHead className="text-black font-semibold h-8 px-2 text-xs text-right">Rate</TableHead>
                        <TableHead className="text-black font-semibold h-8 px-2 text-xs text-right">Amount</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {transaction.items.map((item, index) => (
                        <TableRow key={index} className="border-b-gray-300">
                            <TableCell className="px-2 py-1 text-xs">{index + 1}</TableCell>
                            <TableCell className="px-2 py-1 text-xs">{item.particular}</TableCell>
                            <TableCell className="px-2 py-1 text-xs">{item.quantity}</TableCell>
                            <TableCell className="px-2 py-1 text-xs">{item.uom || ''}</TableCell>
                            <TableCell className="px-2 py-1 text-xs text-right">{item.rate.toLocaleString()}</TableCell>
                            <TableCell className="px-2 py-1 text-xs text-right">{(item.quantity * item.rate).toLocaleString()}</TableCell>
                        </TableRow>
                    ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                      <TableCell colSpan={5} className="text-right font-semibold">Subtotal</TableCell>
                      <TableCell className="text-right font-semibold">{subtotal.toLocaleString()}</TableCell>
                  </TableRow>
                  {transaction.invoiceType === 'Taxable' && (
                      <TableRow>
                          <TableCell colSpan={5} className="text-right font-semibold">VAT (13%)</TableCell>
                          <TableCell className="text-right font-semibold">{vatAmount.toLocaleString()}</TableCell>
                      </TableRow>
                  )}
                  <TableRow className="border-t-2 border-black">
                      <TableCell colSpan={5} className="text-right font-bold">Grand Total</TableCell>
                      <TableCell className="text-right font-bold">{transaction.amount.toLocaleString()}</TableCell>
                  </TableRow>
                </TableFooter>
            </Table>
            <div className="text-xs mt-2"><span className="font-semibold">Remarks:</span> {transaction.remarks}</div>

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
