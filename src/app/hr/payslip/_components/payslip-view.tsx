'use client';

import type { Employee, Payroll, CompanyProfile } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Printer, Save, Loader2, ArrowLeft } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { onSettingUpdate } from '@/services/settings-service';

export const defaultCompanyProfile: CompanyProfile = {
  nameEn: "SHIVAM PACKAGING INDUSTRIES PVT LTD.",
  nameNp: "शिवम प्याकेजिङ्ग इन्डस्ट्रिज प्रा.लि.",
  address: "Hetauda 08, Bagmati Province, Nepal",
  phone: "N/A",
  email: "N/A",
  pan: "N/A"
};

/**
 * Matches PR_RoundNet from the payroll VBA module: floors to whole rupees,
 * then rounds the units digit to the nearest 5 (e.g. 15003 -> 15000,
 * 15004 -> 15005, 15008 -> 15010). Only used as a fallback when a record
 * has no stored roundedNet - historical/imported net figures are never
 * recomputed.
 */
const roundNetToFive = (net: number): number => {
  if (net <= 0) return net;
  const baseInt = Math.floor(net);
  let d = baseInt % 10;
  if (d < 0) d += 10;
  if (d <= 3) return baseInt - d;
  if (d < 8) return baseInt - d + 5;
  return baseInt - d + 10;
};

interface PayslipViewProps {
  employee: Employee;
  payroll: Payroll;
  bsYear: number;
  bsMonthName: string;
}

export function SlipCopy({ label, employee, payroll, bsYear, bsMonthName, companyProfile }: {
  label: string;
  employee: Employee;
  payroll: Payroll;
  bsYear: number;
  bsMonthName: string;
  companyProfile: CompanyProfile;
}) {
  const basic = payroll?.regularPay ?? 0;
  const allowance = payroll?.allowance ?? 0;
  const ot = payroll?.otPay ?? 0;
  const bonus = payroll?.bonus ?? 0;
  const tds = payroll?.tds ?? 0;
  const advance = payroll?.advance ?? 0;

  const grossSalary = payroll?.salaryTotal ?? (basic + allowance + ot + bonus - tds);
  const totalDeductions = tds + advance;
  const netSalary = payroll?.roundedNet ?? roundNetToFive(payroll?.netPayment ?? (grossSalary - advance));

  const monthDays = (payroll?.presentDays ?? 0) + (payroll?.extraDays ?? 0) + (payroll?.leaveDays ?? 0);

  const fmt = (n: number) => (n || 0).toLocaleString(undefined, { minimumFractionDigits: 2 });

  return (
    <div className="border-2 border-black text-black text-[11px] px-3 py-2">
      <p className="text-[8px] font-bold text-gray-500 mb-1">[ {label} ]</p>

      <header className="text-center space-y-0.5 mb-1 pb-1 border-b border-black">
        <h1 className="text-sm font-bold uppercase">{companyProfile.nameEn || 'YOUR COMPANY NAME HERE'}</h1>
        {companyProfile.address && <p className="text-[10px]">{companyProfile.address}</p>}
        {companyProfile.addressLine2 && <p className="text-[10px]">{companyProfile.addressLine2}</p>}
        {companyProfile.phone && <p className="text-[10px]">{companyProfile.phone}</p>}
        {(companyProfile.headerNote1 || companyProfile.headerNote2) && (
          <p className="text-[9px] italic">
            {[companyProfile.headerNote1, companyProfile.headerNote2].filter(Boolean).join('   ')}
          </p>
        )}
      </header>

      <div className="text-center font-bold text-[13px] border-b border-black pb-1 mb-1">Salary Slip</div>
      <div className="text-center italic text-[10px] mb-1">For the Month of: {bsMonthName}, {bsYear} (BS)</div>

      <div className="grid grid-cols-2 gap-x-4 text-[10px] mb-1 pb-1 border-b border-black">
        <div className="space-y-0.5">
          <div><span className="font-bold">Staff Name :</span> {employee.name}</div>
          <div><span className="font-bold">Department :</span> {employee.department || '—'}</div>
          <div><span className="font-bold">Designation :</span> {employee.position || '—'}</div>
          <div><span className="font-bold">Contact :</span> {employee.mobileNumber || '—'}</div>
        </div>
        <div className="space-y-0.5 text-right">
          <div><span className="font-bold">Month Days :</span> {monthDays}</div>
          <div><span className="font-bold">Leave Days :</span> {payroll?.leaveDays ?? 0}</div>
          <div><span className="font-bold">Extra Days :</span> {payroll?.extraDays ?? 0}</div>
          <div><span className="font-bold">Present Days :</span> {payroll?.presentDays ?? 0}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 border-2 border-black">
        <div className="border-r border-black">
          <div className="text-center font-bold border-b border-black py-0.5">Earning</div>
          <div className="grid grid-cols-2 font-bold text-center border-b border-black">
            <div className="border-r border-black py-0.5">Head</div>
            <div className="py-0.5">Rs.</div>
          </div>
          {[
            ['Basic', basic],
            ['Allowance', allowance],
            ['OT', ot],
            ['Bonus', bonus],
          ].map(([lbl, amt]) => (
            <div key={lbl as string} className="grid grid-cols-2 border-b border-dotted border-gray-400">
              <div className="border-r border-black px-1">{lbl}</div>
              <div className="text-right px-1">{fmt(amt as number)}</div>
            </div>
          ))}
          <div className="grid grid-cols-2 h-[17px]">
            <div className="border-r border-black"></div>
            <div></div>
          </div>
          <div className="grid grid-cols-2 font-bold border-t border-b border-black bg-gray-100">
            <div className="border-r border-black px-1">Gross Salary</div>
            <div className="text-right px-1">{fmt(grossSalary)}</div>
          </div>
        </div>
        <div>
          <div className="text-center font-bold border-b border-black py-0.5">Deduction</div>
          <div className="grid grid-cols-2 font-bold text-center border-b border-black">
            <div className="border-r border-black py-0.5">Head</div>
            <div className="py-0.5">Rs.</div>
          </div>
          {[
            ['Professional Tax / TDS', tds],
            ['Advance', advance],
          ].map(([lbl, amt]) => (
            <div key={lbl as string} className="grid grid-cols-2 border-b border-dotted border-gray-400">
              <div className="border-r border-black px-1">{lbl}</div>
              <div className="text-right px-1">{fmt(amt as number)}</div>
            </div>
          ))}
          <div className="grid grid-cols-2 h-[34px]">
            <div className="border-r border-black"></div>
            <div></div>
          </div>
          <div className="grid grid-cols-2 font-bold border-t border-b border-black bg-gray-100">
            <div className="border-r border-black px-1">Deductions</div>
            <div className="text-right px-1">{fmt(totalDeductions)}</div>
          </div>
        </div>
      </div>

      <div className="font-bold text-[12px] border-2 border-t-0 border-black bg-gray-200 px-2 py-1 flex justify-between">
        <span>Net Salary</span>
        <span>{fmt(netSalary)}</span>
      </div>

      <div className="grid grid-cols-3 gap-4 mt-4 text-[10px]">
        <div><div className="border-t border-black pt-0.5">{companyProfile.preparedBy || ' '}</div><p className="text-right font-bold">Prepared by</p></div>
        <div><div className="border-t border-black pt-0.5">{companyProfile.checkedBy || ' '}</div><p className="text-right font-bold">Checked by</p></div>
        <div><div className="border-t border-black pt-0.5">{companyProfile.authorisedBy || ' '}</div><p className="text-right font-bold">Authorised by</p></div>
      </div>

      {(companyProfile.footerNote1 || companyProfile.footerNote2) && (
        <div className="mt-2 pt-1 border-t border-black text-[8px] italic">
          {companyProfile.footerNote1 && <p>{companyProfile.footerNote1}</p>}
          {companyProfile.footerNote2 && <p>{companyProfile.footerNote2}</p>}
        </div>
      )}
    </div>
  );
}

export default function PayslipView({ employee, payroll, bsYear, bsMonthName }: PayslipViewProps) {
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [companyProfile, setCompanyProfile] = useState<CompanyProfile>(defaultCompanyProfile);
  const router = useRouter();

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

      <div className="printable-area space-y-2 bg-white">
        <SlipCopy label="Employee Copy" employee={employee} payroll={payroll} bsYear={bsYear} bsMonthName={bsMonthName} companyProfile={companyProfile} />
        <SlipCopy label="Employer Copy" employee={employee} payroll={payroll} bsYear={bsYear} bsMonthName={bsMonthName} companyProfile={companyProfile} />
      </div>
       <style jsx global>{`
        @media print {
          @page { size: A4; margin: 0.2in; }
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
