
'use client';

import type { Employee, Payroll } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Printer, Save, Loader2, ArrowLeft } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { toNepaliDate } from '@/lib/utils';
import { format } from 'date-fns';
import { Table, TableBody, TableCell, TableRow, TableHeader, TableHead } from '@/components/ui/table';
import { useState } from 'react';
import NepaliDate from 'nepali-date-converter';
import { useRouter } from 'next/navigation';


interface PayslipViewProps {
  employee: Employee;
  payroll: Payroll;
  bsYear: number;
  bsMonthName: string;
}

// Function to convert number to words (simple implementation)
const toWords = (num: number): string => {
    const a = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
    const b = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
    
    const inWords = (n: number): string => {
        if (n < 20) return a[n];
        let digit = n % 10;
        return `${b[Math.floor(n/10)]} ${a[digit]}`.trim();
    }
    
    let n = Math.floor(num);
    let str = '';
    str += n > 9999999 ? `${inWords(Math.floor(n/10000000))} crore ` : '';
    n %= 10000000;
    str += n > 99999 ? `${inWords(Math.floor(n/100000))} lakh ` : '';
    n %= 100000;
    str += n > 999 ? `${inWords(Math.floor(n/1000))} thousand ` : '';
    n %= 1000;
    str += n > 99 ? `${inWords(Math.floor(n/100))} hundred ` : '';
    n %= 100;
    str += inWords(n);
    
    return str.split(' ').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ') + ' Only.';
};


export default function PayslipView({ employee, payroll, bsYear, bsMonthName }: PayslipViewProps) {
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const router = useRouter();
  const generationDate = new Date();
  const nepaliGenerationDate = new NepaliDate(generationDate);
  
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
        pdf.save(`Payslip-${employee.name}-${bsMonthName}-${bsYear}.pdf`);
    } catch (error) {
        console.error("Error generating PDF", error);
    } finally {
        setIsGeneratingPdf(false);
    }
  };
  
  const earnings = [
      { label: "Normal Pay", amount: payroll.regularPay },
      { label: "Overtime Pay", amount: payroll.otPay },
      { label: "Allowance", amount: payroll.allowance },
  ];
  
  const deductions = [
      { label: "Absent Deduction", amount: payroll.deduction },
      { label: "TDS (1%)", amount: payroll.tds },
      { label: "Advance", amount: payroll.advance },
  ];

  const totalEarnings = earnings.reduce((sum, item) => sum + item.amount, 0);
  const totalDeductions = deductions.reduce((sum, item) => sum + item.amount, 0);

  return (
    <>
      <div className="flex justify-between items-center mb-8 print:hidden">
        <div>
            <h1 className="text-3xl font-bold">Employee Payslip</h1>
             <p className="text-muted-foreground">Payslip for {employee.name} for {bsMonthName}, {bsYear}</p>
        </div>
        <div className="flex gap-2">
            <Button variant="outline" onClick={() => router.back()}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
            </Button>
            <Button variant="outline" onClick={handleSaveAsPdf} disabled={isGeneratingPdf}>
                {isGeneratingPdf ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                {isGeneratingPdf ? 'Saving...' : 'Save as PDF'}
            </Button>
            <Button onClick={handlePrint}>
                <Printer className="mr-2 h-4 w-4" />
                Print
            </Button>
        </div>
      </div>
      
       <div className="printable-area space-y-4 p-4 border rounded-lg bg-white text-black">
        <header className="text-center space-y-1 mb-4">
            <h1 className="text-xl font-bold">SHIVAM PACKAGING INDUSTRIES PVT LTD.</h1>
            <h2 className="text-lg font-semibold">शिवम प्याकेजिङ्ग इन्डस्ट्रिज प्रा.लि.</h2>
            <p className="text-sm">HETAUDA 08, BAGMATI PROVIENCE, NEPAL</p>
            <h2 className="text-lg font-semibold">Payslip for {bsMonthName}, {bsYear}</h2>
        </header>
        
        <div className="text-right text-xs">
          <span className="font-semibold">Date:</span> {nepaliGenerationDate.format('YYYY/MM/DD')} B.S. ({format(generationDate, 'yyyy-MM-dd')})
        </div>

        <Separator className="my-2 bg-gray-300"/>

        <div className="grid grid-cols-2 text-xs mb-2 gap-x-4">
            <div><span className="font-semibold">Employee Name:</span> {employee.name}</div>
            <div><span className="font-semibold">Department:</span> {employee.department}</div>
            <div><span className="font-semibold">Position:</span> {employee.position}</div>
        </div>

        <Separator className="my-2 bg-gray-300"/>
        
        <div className="grid grid-cols-2 gap-4">
            <div className="border border-gray-300 rounded-md">
                 <Table>
                    <TableHeader>
                        <TableRow className="bg-gray-100 font-bold">
                            <TableHead colSpan={2} className="h-8 px-2 text-xs text-black">Earnings</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {earnings.map(item => (
                            <TableRow key={item.label} className="border-b-gray-300">
                                <TableCell className="px-2 py-1 text-xs">{item.label}</TableCell>
                                <TableCell className="px-2 py-1 text-xs text-right">{item.amount.toLocaleString(undefined, {minimumFractionDigits: 2})}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                 </Table>
            </div>
             <div className="border border-gray-300 rounded-md">
                 <Table>
                     <TableHeader>
                      <TableRow className="bg-gray-100 font-bold">
                        <TableHead colSpan={2} className="h-8 px-2 text-xs text-black">Deductions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                        {deductions.map(item => (
                            <TableRow key={item.label} className="border-b-gray-300">
                                <TableCell className="px-2 py-1 text-xs">{item.label}</TableCell>
                                <TableCell className="px-2 py-1 text-xs text-right">{item.amount.toLocaleString(undefined, {minimumFractionDigits: 2})}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                 </Table>
            </div>
        </div>
        
        <div className="grid grid-cols-2 gap-4 mt-2">
            <div className="border border-gray-300 rounded-md bg-gray-50">
                <Table>
                    <TableBody>
                        <TableRow className="font-bold">
                            <TableCell className="h-8 px-2 text-xs">Total Earnings</TableCell>
                            <TableCell className="h-8 px-2 text-xs text-right">{totalEarnings.toLocaleString(undefined, {minimumFractionDigits: 2})}</TableCell>
                        </TableRow>
                    </TableBody>
                </Table>
            </div>
             <div className="border border-gray-300 rounded-md bg-gray-50">
                <Table>
                    <TableBody>
                        <TableRow className="font-bold">
                            <TableCell className="h-8 px-2 text-xs">Total Deductions</TableCell>
                            <TableCell className="h-8 px-2 text-xs text-right">{totalDeductions.toLocaleString(undefined, {minimumFractionDigits: 2})}</TableCell>
                        </TableRow>
                    </TableBody>
                </Table>
            </div>
        </div>
        
        <div className="mt-4 p-2 bg-blue-100 border border-blue-300 rounded-md text-center">
            <p className="font-semibold text-sm">Net Salary: NPR {payroll.netPayment.toLocaleString(undefined, {minimumFractionDigits: 2})}</p>
            <p className="text-xs font-medium">In Words: {toWords(payroll.netPayment)}</p>
        </div>


        <div className="mt-8 grid grid-cols-2 gap-8 pt-16 text-xs">
            <div className="text-center"><div className="border-t border-black w-36 mx-auto"></div><p className="font-semibold mt-1">Employer's Signature</p></div>
            <div className="text-center"><div className="border-t border-black w-36 mx-auto"></div><p className="font-semibold mt-1">Employee's Signature</p></div>
        </div>
        
         <div className="mt-8 text-center pt-8 text-xs text-gray-500">
              <p>This is a computer-generated payslip and does not require a signature.</p>
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
