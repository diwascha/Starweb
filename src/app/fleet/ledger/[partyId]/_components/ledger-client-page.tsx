
'use client';

import { useState, useMemo } from 'react';
import type { Party, Transaction, Account } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Printer, Download } from 'lucide-react';
import { toNepaliDate } from '@/lib/utils';
import { format } from 'date-fns';

interface LedgerClientPageProps {
  initialParty: Party;
  initialTransactions: Transaction[];
  initialAccounts: Account[];
}

export default function LedgerClientPage({ initialParty, initialTransactions, initialAccounts }: LedgerClientPageProps) {
  const [party] = useState<Party>(initialParty);
  const [transactions] = useState<Transaction[]>(initialTransactions);
  const [accounts] = useState<Account[]>(initialAccounts);

  const handlePrint = () => {
    setTimeout(() => window.print(), 100);
  };
  
  const handleExport = async () => {
    const XLSX = await import('xlsx');
    const dataToExport = ledgerData.map(entry => ({
        'Date (BS)': entry.dateBS,
        'Date (AD)': entry.dateAD,
        'Particulars': entry.particulars,
        'Voucher Type': entry.voucherType,
        'Voucher No.': entry.voucherNo,
        'Debit': entry.debit,
        'Credit': entry.credit,
        'Balance': entry.balance,
    }));
    
    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Ledger");
    XLSX.writeFile(workbook, `Ledger-${party.name}-${new Date().toISOString().split('T')[0]}.xlsx`);
  };


  const ledgerData = useMemo(() => {
    let runningBalance = 0;
    
    const sortedTransactions = [...transactions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    return sortedTransactions.map(t => {
      let debit = 0;
      let credit = 0;

      if (t.type === 'Sales') debit = t.amount;
      if (t.type === 'Receipt') credit = t.amount;
      if (t.type === 'Purchase') credit = t.amount;
      if (t.type === 'Payment') debit = t.amount;
      
      runningBalance += (debit - credit);

      let particulars = t.remarks || t.type;
      if(t.type === 'Sales' || t.type === 'Purchase') {
        particulars = `${t.type} #${t.purchaseNumber || t.tripNumber || ''}`;
      }
       if (t.type === 'Receipt' || t.type === 'Payment') {
        const account = accounts.find(a => a.id === t.accountId);
        if (t.billingType === 'Bank' && account) {
            particulars = `${t.type} via ${account.bankName} Chq #${t.chequeNumber}`;
        } else if (t.billingType === 'Cash') {
            particulars = `${t.type} via Cash`;
        }
      }


      return {
        id: t.id,
        dateBS: toNepaliDate(t.date),
        dateAD: format(new Date(t.date), 'yyyy-MM-dd'),
        particulars,
        voucherType: t.type,
        voucherNo: t.purchaseNumber || t.tripNumber || t.voucherId || 'N/A',
        debit,
        credit,
        balance: runningBalance,
      };
    });
  }, [transactions, accounts]);

  const closingBalance = ledgerData.length > 0 ? ledgerData[ledgerData.length - 1].balance : 0;
  const totalDebit = ledgerData.reduce((sum, item) => sum + item.debit, 0);
  const totalCredit = ledgerData.reduce((sum, item) => sum + item.credit, 0);

  return (
    <>
      <div className="flex justify-between items-center mb-8 print:hidden">
        <div>
          <h1 className="text-3xl font-bold">Party Ledger</h1>
          <p className="text-muted-foreground">Statement of account for {party.name}</p>
        </div>
        <div className="flex gap-2">
            <Button variant="outline" onClick={handleExport}>
                <Download className="mr-2 h-4 w-4" /> Export
            </Button>
            <Button onClick={handlePrint}>
                <Printer className="mr-2 h-4 w-4" /> Print
            </Button>
        </div>
      </div>
      <div className="printable-area space-y-4 p-4 border rounded-lg bg-white text-black">
        <header className="text-center space-y-1 mb-4">
            <h1 className="text-xl font-bold">SHIVAM PACKAGING INDUSTRIES PVT LTD.</h1>
            <p className="text-sm">HETAUDA 08, BAGMATI PROVIENCE, NEPAL</p>
            <h2 className="text-lg font-semibold underline mt-1">Party Ledger</h2>
        </header>
        <div className="text-sm font-semibold">
            Statement of: {party.name}
        </div>
        <Table>
            <TableHeader>
                <TableRow className="border-b-gray-300">
                    <TableHead className="text-black font-semibold h-8 px-2 text-xs">Date (BS)</TableHead>
                    <TableHead className="text-black font-semibold h-8 px-2 text-xs">Particulars</TableHead>
                    <TableHead className="text-black font-semibold h-8 px-2 text-xs text-right">Debit</TableHead>
                    <TableHead className="text-black font-semibold h-8 px-2 text-xs text-right">Credit</TableHead>
                    <TableHead className="text-black font-semibold h-8 px-2 text-xs text-right">Balance</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {ledgerData.map(entry => (
                    <TableRow key={entry.id} className="border-b-gray-300">
                        <TableCell className="px-2 py-1 text-xs">{entry.dateBS}</TableCell>
                        <TableCell className="px-2 py-1 text-xs">{entry.particulars}</TableCell>
                        <TableCell className="px-2 py-1 text-xs text-right">{entry.debit > 0 ? entry.debit.toLocaleString() : '-'}</TableCell>
                        <TableCell className="px-2 py-1 text-xs text-right">{entry.credit > 0 ? entry.credit.toLocaleString() : '-'}</TableCell>
                        <TableCell className="px-2 py-1 text-xs text-right">{entry.balance.toLocaleString()}</TableCell>
                    </TableRow>
                ))}
            </TableBody>
            <TableFooter>
                <TableRow className="font-bold border-t-2 border-black">
                    <TableCell colSpan={2} className="text-right">Total / Closing Balance</TableCell>
                    <TableCell className="text-right">{totalDebit.toLocaleString()}</TableCell>
                    <TableCell className="text-right">{totalCredit.toLocaleString()}</TableCell>
                    <TableCell className="text-right">{closingBalance.toLocaleString()}</TableCell>
                </TableRow>
            </TableFooter>
        </Table>
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
