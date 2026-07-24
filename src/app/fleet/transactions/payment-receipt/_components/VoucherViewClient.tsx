'use client';

import type { Transaction, Vehicle, Party, Account, CompanyProfile } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Printer, Loader2, Save, ArrowLeft, Edit } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { toNepaliDate, toWords } from '@/lib/utils';
import { format } from 'date-fns';
import { Table, TableBody, TableCell, TableRow, TableHeader, TableHead } from '@/components/ui/table';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { onSettingUpdate } from '@/services/settings-service';
import { DEFAULT_FLEET_PROFILE } from '@/lib/constants';

interface VoucherViewClientProps {
  initialTransactions: Transaction[];
  vehicles: Vehicle[];
  parties: Party[];
  accounts: Account[];
}

export default function VoucherViewClient({
  initialTransactions,
  vehicles,
  parties,
  accounts,
}: VoucherViewClientProps) {
  const router = useRouter();
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [companyProfile, setCompanyProfile] = useState<CompanyProfile>(DEFAULT_FLEET_PROFILE);
  const transaction = initialTransactions?.[0];

  useEffect(() => {
    const unsub = onSettingUpdate('fleetCompanyProfile', (s) => {
        if (s?.value) setCompanyProfile(s.value);
    });
    return () => unsub();
  }, []);

  const handlePrint = () => {
    setTimeout(() => {
      window.print();
    }, 100);
  };

  const handleSaveAsPdf = async () => {
    if (!transaction) return;
    setIsGeneratingPdf(true);
    const printableArea = document.querySelector('.printable-area') as HTMLElement;
    if (!printableArea) {
      setIsGeneratingPdf(false);
      return;
    }

    try {
        const jsPDF = (await import('jspdf')).default;
        const html2canvas = (await import('html2canvas')).default;

        const canvas = await html2canvas(printableArea, { 
            scale: 2,
            useCORS: true,
            logging: false,
            backgroundColor: '#ffffff'
        });
        
        const imgData = canvas.toDataURL('image/jpeg', 0.95);
        const pdf = new jsPDF('p', 'mm', 'a4');
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
        
        pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
        pdf.save(`Voucher-${transaction.referenceId || 'Voucher'}.pdf`);
    } catch (error) {
      console.error("Error generating PDF", error);
    } finally {
      setIsGeneratingPdf(false);
    }
  };
  
  if (!transaction) {
    return (
        <div className="p-8 text-center">
            <p className="text-muted-foreground">Voucher data not available.</p>
            <Button variant="link" onClick={() => router.back()}>Go Back</Button>
        </div>
    );
  }

  const voucherNo = transaction.referenceId || 'N/A';

  return (
    <>
      <div className="flex justify-between items-center mb-8 print:hidden">
        <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => router.back()}>
                <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold">Voucher Details</h1>
              <p className="text-muted-foreground">Voucher #{voucherNo}</p>
            </div>
        </div>
        <div className="flex gap-2">
            <Button variant="outline" onClick={() => router.push(`/fleet/transactions/payment-receipt/edit?voucherId=${transaction.voucherId}`)}>
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
            <h1 className="text-xl font-bold uppercase">{companyProfile.nameEn}</h1>
            <h2 className="text-lg font-semibold">{companyProfile.nameNp}</h2>
            <p className="text-sm">{companyProfile.address}</p>
            <p className="text-xs">PAN: {companyProfile.pan}</p>
            <h2 className="text-lg font-semibold underline mt-1">PAYMENT/RECEIPT VOUCHER</h2>
        </header>

        <div className="grid grid-cols-2 text-xs mb-2 gap-x-4">
            <div><span className="font-semibold">Voucher No:</span> {voucherNo}</div>
            <div className="text-right"><span className="font-semibold">Date:</span> {toNepaliDate(transaction.date)} ({format(new Date(transaction.date), 'yyyy-MM-dd')})</div>
        </div>

        <Separator className="my-2 bg-gray-300"/>
        
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead className="text-black font-semibold h-8 px-2 text-xs">A/C Particulars</TableHead>
                    <TableHead className="text-black font-semibold h-8 px-2 text-xs text-right">Debit</TableHead>
                    <TableHead className="text-black font-semibold h-8 px-2 text-xs text-right">Credit</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {initialTransactions.map((t) => (
                    <TableRow key={t.id} className="border-b-gray-300">
                        <TableCell className="px-2 py-1 text-xs">
                            <div className="flex flex-col">
                                <span className="font-bold">{parties.find(p => p.id === t.partyId)?.name || 'Unassigned'}</span>
                                {t.vehicleId && <span className="text-[10px] text-gray-500">{vehicles.find(v => v.id === t.vehicleId)?.name}</span>}
                            </div>
                        </TableCell>
                        <TableCell className="px-2 py-1 text-xs text-right">{t.type === 'Payment' ? t.amount.toLocaleString(undefined, {minimumFractionDigits: 2}) : ''}</TableCell>
                        <TableCell className="px-2 py-1 text-xs text-right">{t.type === 'Receipt' ? t.amount.toLocaleString(undefined, {minimumFractionDigits: 2}) : ''}</TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>

        <div className="text-xs mt-2">
            <span className="font-semibold">In Words:</span> {toWords(initialTransactions.reduce((sum, t) => sum + t.amount, 0))}
        </div>
        
        <div className="mt-16 text-center pt-8 border-t border-dashed border-gray-200">
            <p className="text-[9px] font-bold text-gray-400 uppercase italic">
                This is a computer-generated document authorized by {companyProfile.nameEn}. 
                Produced via StarSutra and valid without manual signature.
            </p>
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
