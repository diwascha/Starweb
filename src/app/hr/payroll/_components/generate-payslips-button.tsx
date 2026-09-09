'use client';

import { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Button } from '@/components/ui/button';
import { FileStack, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { Employee, Payroll, CompanyProfile } from '@/lib/types';
import { SlipCopy, defaultCompanyProfile } from '@/app/hr/payslip/_components/payslip-view';
import { getSetting } from '@/services/settings-service';

interface GeneratePayslipsButtonProps {
    payrollRecords: Payroll[];
    employees: Employee[];
    bsYear: number;
    bsMonthName: string;
}

/**
 * Bulk equivalent of the VBA workbook's "Generate Payslips" button: builds
 * one combined PDF with every employee's dual-copy (Employee + Employer)
 * slip for the currently selected period, one page per employee.
 */
export default function GeneratePayslipsButton({ payrollRecords, employees, bsYear, bsMonthName }: GeneratePayslipsButtonProps) {
    const [isGenerating, setIsGenerating] = useState(false);
    const { toast } = useToast();
    const hostRef = useRef<HTMLDivElement>(null);

    const handleGenerate = async () => {
        if (payrollRecords.length === 0) {
            toast({ title: 'Nothing to Generate', description: 'No payroll records for this period.', variant: 'destructive' });
            return;
        }
        setIsGenerating(true);
        try {
            const [jsPDFModule, html2canvasModule, companySetting] = await Promise.all([
                import('jspdf'),
                import('html2canvas'),
                getSetting('companyProfile'),
            ]);
            const jsPDF = jsPDFModule.default;
            const html2canvas = html2canvasModule.default;
            const companyProfile: CompanyProfile = companySetting?.value || defaultCompanyProfile;

            const employeeMap = new Map(employees.map(e => [e.id, e]));
            const pdf = new jsPDF('p', 'mm', 'a4');
            let pageAdded = false;

            const host = hostRef.current;
            if (!host) return;

            for (const payroll of payrollRecords) {
                const employee = employeeMap.get(payroll.employeeId);
                if (!employee) continue;

                const container = document.createElement('div');
                container.style.width = '800px';
                host.appendChild(container);
                const root = createRoot(container);
                root.render(
                    <div className="space-y-2 bg-white">
                        <SlipCopy label="Employee Copy" employee={employee} payroll={payroll} bsYear={bsYear} bsMonthName={bsMonthName} companyProfile={companyProfile} />
                        <SlipCopy label="Employer Copy" employee={employee} payroll={payroll} bsYear={bsYear} bsMonthName={bsMonthName} companyProfile={companyProfile} />
                    </div>
                );
                // Let React commit and the browser lay out the off-screen node before capture.
                await new Promise(resolve => setTimeout(resolve, 50));

                const canvas = await html2canvas(container, { scale: 2 });
                const imgData = canvas.toDataURL('image/png');
                const pdfWidth = pdf.internal.pageSize.getWidth();
                const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
                if (pageAdded) pdf.addPage();
                pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
                pageAdded = true;

                root.unmount();
                host.removeChild(container);
            }

            if (!pageAdded) {
                toast({ title: 'Nothing to Generate', description: 'No matching employee records found for this period.', variant: 'destructive' });
                return;
            }

            pdf.save(`Payslips-${bsMonthName}-${bsYear}.pdf`);
            toast({ title: 'Payslips Generated', description: `${payrollRecords.length} payslip(s) exported to one PDF.` });
        } catch (error) {
            console.error('Error generating payslips', error);
            toast({ title: 'Generation Failed', description: 'Could not generate payslips.', variant: 'destructive' });
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <>
            <Button variant="outline" size="sm" onClick={handleGenerate} disabled={isGenerating || payrollRecords.length === 0} className="h-8 font-black text-[10px] uppercase tracking-widest border-gray-300">
                {isGenerating ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <FileStack className="mr-1.5 h-3.5 w-3.5" />}
                Generate Payslips
            </Button>
            <div ref={hostRef} style={{ position: 'fixed', top: 0, left: '-9999px', zIndex: -1 }} />
        </>
    );
}
