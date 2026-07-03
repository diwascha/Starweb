'use client';

import type { Employee, Payroll, CompanyProfile } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Printer, Save, Loader2, ArrowLeft } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { toWords } from '@/lib/utils';
import { format } from 'date-fns';
import { Table, TableBody, TableCell, TableRow, TableHeader, TableHead } from '@/components/ui/table';
import { useState, useEffect } from 'react';
import NepaliDate from 'nepali-date-converter';
import { useRouter } from 'next/navigation';
import { onSettingUpdate } from '@/services/settings-service';

const defaultCompanyProfile: CompanyProfile = {
  nameEn: "SHIVAM PACKAGING INDUSTRIES PVT LTD.",
  nameNp: "शिवम प्याकेजिङ्ग इन्डस्ट्रिज प्रा.लि.",
  address: "Hetauda 08, Bagmati Province, Nepal",
  phone: "N/A",
  email: "N/A",
  pan: "N/A"
};

interface PayslipViewProps {
  employee: Employee;
  payroll: Payroll;
  bsYear: number;
  bsMonthName: string;
}

export default function PayslipView({ employee, payroll, bsYear, bsMonthName }: PayslipViewProps) {
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [companyProfile, setCompanyProfile] = useState<CompanyProfile>(defaultCompanyProfile);
  const router = useRouter();
  const generationDate = new Date();
  const nepaliGenerationDate = new NepaliDate(generationDate);

  useEffect(() => {
    const unsub = onSettingUpdate('companyProfile', (s) => setCompanyProfile(s?.value || defaultCompanyProfile));
    return () => unsub();
  }, []);
  
  const handlePrint = () => {
    setTimeout(() => {
        window.print();
    }, 100);
  };
  
  const handleSaveAsPdf = async () => {
    const printableArea = document.querySelector('.printable-area') as HTMLElement;
    if (!printableArea) return;
    
    setIsGeneratingPdf(true);
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
      { label: "Normal Pay", amount: payroll?.regularPay ?? 0 },
      { label: "Overtime Pay", amount: payroll?.otPay ?? 0 },
      { label: "Allowance", amount: payroll?.allowance ?? 0 },
      { label: "Bonus", amount: payroll?.bonus ?? 0 },
  ];
  
  const deductions = [
      { label: "Absent Deduction", amount: payroll?.deduction ?? 0 },
      { label: "TDS (1%)", amount: payroll?.tds ?? 0 },
      { label: "Advance", amount: payroll?.advance ?? 0 },
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
            <Button variant="outline" onClick={() => router.back()}><ArrowLeft className="mr-2 h-4 w-4" />Back</Button>
            <Button variant="outline" onClick={handleSaveAsPdf} disabled={isGeneratingPdf}>
                {isGeneratingPdf ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Save as PDF
            </Button>
            <Button onClick={handlePrint}><Printer className="mr-2 h-4 w-4" />Print</Button>
        </div>
      </div>
      
       <div className="printable-area space-y-4 p-4 border rounded-lg bg-white text-black">
        <header className="text-center space-y-1 mb-4">
            <h1 className="text-xl font-bold uppercase">{companyProfile.nameEn}</h1>
            <h2 className="text-lg font-semibold">{companyProfile.nameNp}</h2>
            <p className="text-sm">{companyProfile.address}</p>
            <h2 className="text-lg font-semibold underline mt-1">Payslip for {bsMonthName}, {bsYear}</h2>
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
                                <TableCell className="px-2 py-1 text-xs text-right">{(item.amount || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</TableCell>
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
                                <TableCell className="px-2 py-1 text-xs text-right">{(item.amount || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                 </Table>
            </div>
        </div>
        
        <div className="grid grid-cols-2 gap-4 mt-2">
            <div className="border border-gray-300 rounded-md bg-gray-50">
                <Table><TableBody><TableRow className="font-bold">
                    <TableCell className="h-8 px-2 text-xs">Total Earnings</TableCell>
                    <TableCell className="h-8 px-2 text-xs text-right">{totalEarnings.toLocaleString(undefined, {minimumFractionDigits: 2})}</TableCell>
                </TableRow></TableBody></Table>
            </div>
             <div className="border border-gray-300 rounded-md bg-gray-50">
                <Table><TableBody><TableRow className="font-bold">
                    <TableCell className="h-8 px-2 text-xs">Total Deductions</TableCell>
                    <TableCell className="h-8 px-2 text-xs text-right">{totalDeductions.toLocaleString(undefined, {minimumFractionDigits: 2})}</TableCell>
                </TableRow></TableBody></Table>
            </div>
        </div>
        
        <div className="mt-4 p-2 bg-blue-100 border border-blue-300 rounded-md text-center">
            <p className="font-semibold text-sm">Net Salary: NPR {(payroll?.netPayment ?? 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</p>
            <p className="text-xs font-medium">In Words: {toWords(payroll?.netPayment ?? 0)}</p>
        </div>

        <div className="mt-8 grid grid-cols-2 gap-8 pt-16 text-xs text-center">
            <div><div className="border-t border-black w-36 mx-auto"></div><p className="font-semibold mt-1">Employer's Signature</p></div>
            <div><div className="border-t border-black w-36 mx-auto"></div><p className="font-semibold mt-1">Employee's Signature</p></div>
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
