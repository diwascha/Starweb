'use client';

import { useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Button } from '@/components/ui/button';
import { FileStack, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { Employee, Payroll, CompanyProfile } from '@/lib/types';
import { SlipCopy, defaultCompanyProfile } from '@/app/hr/payslip/_components/payslip-view';
import { getSetting } from '@/services/settings-service';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';

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
    const [isSelectOpen, setIsSelectOpen] = useState(false);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const { toast } = useToast();
    const hostRef = useRef<HTMLDivElement>(null);

    const sortedRecords = useMemo(
        () => [...payrollRecords].sort((a, b) => a.employeeName.localeCompare(b.employeeName)),
        [payrollRecords]
    );

    const openSelectDialog = () => {
        if (payrollRecords.length === 0) {
            toast({ title: 'Nothing to Generate', description: 'No payroll records for this period.', variant: 'destructive' });
            return;
        }
        setSelectedIds(sortedRecords.map(p => p.employeeId));
        setIsSelectOpen(true);
    };

    const toggleSelected = (employeeId: string) => {
        setSelectedIds(prev => prev.includes(employeeId) ? prev.filter(id => id !== employeeId) : [...prev, employeeId]);
    };

    const handleGenerate = async () => {
        const recordsToGenerate = payrollRecords.filter(p => selectedIds.includes(p.employeeId));
        if (recordsToGenerate.length === 0) {
            toast({ title: 'Nothing to Generate', description: 'Select at least one employee.', variant: 'destructive' });
            return;
        }
        setIsSelectOpen(false);
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
            const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4', compress: true });
            let pageAdded = false;

            const host = hostRef.current;
            if (!host) return;

            for (const payroll of recordsToGenerate) {
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

                // scale 1.5 + JPEG instead of PNG at scale 2: a run of 30-40
                // employees at lossless PNG is what produced the ~400MB file -
                // JPEG at this quality is a fraction of that per page while
                // staying sharp enough to read and print.
                const canvas = await html2canvas(container, { scale: 1.5 });
                const imgData = canvas.toDataURL('image/jpeg', 0.85);
                const pdfWidth = pdf.internal.pageSize.getWidth();
                const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
                if (pageAdded) pdf.addPage();
                pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight, undefined, 'FAST');
                pageAdded = true;

                root.unmount();
                host.removeChild(container);
            }

            if (!pageAdded) {
                toast({ title: 'Nothing to Generate', description: 'No matching employee records found for this period.', variant: 'destructive' });
                return;
            }

            pdf.save(`Payslips-${bsMonthName}-${bsYear}.pdf`);
            toast({ title: 'Payslips Generated', description: `${recordsToGenerate.length} payslip(s) exported to one PDF.` });
        } catch (error) {
            console.error('Error generating payslips', error);
            toast({ title: 'Generation Failed', description: 'Could not generate payslips.', variant: 'destructive' });
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <>
            <Button variant="outline" size="sm" onClick={openSelectDialog} disabled={isGenerating || payrollRecords.length === 0} className="h-8 font-black text-[10px] uppercase tracking-widest border-gray-300">
                {isGenerating ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <FileStack className="mr-1.5 h-3.5 w-3.5" />}
                Generate Payslips
            </Button>
            <div ref={hostRef} style={{ position: 'fixed', top: 0, left: '-9999px', zIndex: -1 }} />

            <Dialog open={isSelectOpen} onOpenChange={setIsSelectOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-black text-gray-900">Generate Payslips</DialogTitle>
                        <DialogDescription>
                            Choose which employees to include. Each generates a 2-page slip (Employee + Employer copy) in one combined PDF.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] font-black uppercase text-muted-foreground">{selectedIds.length} of {sortedRecords.length} selected</span>
                            <div className="flex items-center gap-3">
                                <button type="button" className="text-[10px] font-bold uppercase text-primary hover:underline" onClick={() => setSelectedIds(sortedRecords.map(p => p.employeeId))}>Select All</button>
                                <button type="button" className="text-[10px] font-bold uppercase text-muted-foreground hover:underline" onClick={() => setSelectedIds([])}>Clear</button>
                            </div>
                        </div>
                        <ScrollArea className="h-[280px] rounded-lg border p-2">
                            {sortedRecords.map(p => (
                                <label key={p.employeeId} className="flex items-center gap-2 px-2 py-2 rounded hover:bg-muted/50 cursor-pointer text-xs">
                                    <Checkbox checked={selectedIds.includes(p.employeeId)} onCheckedChange={() => toggleSelected(p.employeeId)} />
                                    <span className="font-bold">{p.employeeName}</span>
                                </label>
                            ))}
                        </ScrollArea>
                    </div>
                    <DialogFooter>
                        <Button onClick={handleGenerate} disabled={isGenerating || selectedIds.length === 0} className="w-full h-11 font-black text-xs uppercase tracking-widest shadow-xl shadow-primary/20">
                            {isGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <FileStack className="mr-2 h-4 w-4"/>}
                            {isGenerating ? 'Generating...' : `Generate ${selectedIds.length} Payslip(s)`}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
