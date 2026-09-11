'use client';

import { useState, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useToast } from '@/hooks/use-toast';
import type { Payroll, Employee } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Download, Printer, Loader2, View, FileDown, ArrowUpDown, ChevronUp, ChevronDown, X } from 'lucide-react';
import { onPayrollUpdate } from '@/services/payroll-service';
import { onEmployeesUpdate } from '@/services/employee-service';
import { useRouter } from 'next/navigation';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { NEPALI_MONTHS } from '@/lib/constants';
import { MultiSelectFilter } from '@/components/ui/multi-select-filter';
import { cn } from '@/lib/utils';
import GeneratePayslipsButton from './generate-payslips-button';

const customEmployeeOrder = [
    "Tika Gurung", "Anju Bista", "Madhu Bhandari", "Amrita Lama", "sunil chaudhary",
    "KUMAR SHRESTHA", "Niroj Koirala", "Binod Magar", "SANDEEP CHAUDARY",
    "SANGITA PYAKUREL", "Sunita Gurung"
];

type ColumnKey = 'employee' | 'regularHours' | 'otHours' | 'absentDays' | 'base' | 'basicPay' | 'otPay' | 'allowance' | 'gross' | 'tds' | 'grossSalary' | 'advance' | 'net' | 'roundedNet' | 'remarks';

const COLUMN_LABELS: { key: ColumnKey; label: string }[] = [
    { key: 'employee', label: 'Employee' },
    { key: 'regularHours', label: 'Regular Hrs' },
    { key: 'otHours', label: 'OT Hrs' },
    { key: 'absentDays', label: 'Absent Days' },
    { key: 'base', label: 'Base (Salary or Rate)' },
    { key: 'basicPay', label: 'Basic Pay' },
    { key: 'otPay', label: 'OT Pay' },
    { key: 'allowance', label: 'Allowance' },
    { key: 'gross', label: 'Gross' },
    { key: 'tds', label: 'TDS' },
    { key: 'grossSalary', label: 'Gross Salary' },
    { key: 'advance', label: 'Advance' },
    { key: 'net', label: 'Net' },
    { key: 'roundedNet', label: 'Rounded Net' },
    { key: 'remarks', label: 'Remarks' },
];

type SortKey = 'employeeName' | 'regularHours' | 'otHours' | 'absentDays' | 'rate' | 'regularPay' | 'otPay' | 'allowance' | 'totalPay' | 'tds' | 'salaryTotal' | 'advance' | 'netPayment' | 'roundedNet';

interface PayrollClientPageProps {
    selectedBsYear: string;
    selectedBsMonth: string;
}

export default function PayrollClientPage({ selectedBsYear, selectedBsMonth }: PayrollClientPageProps) {
    const [allPayroll, setAllPayroll] = useState<Payroll[]>([]);
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const router = useRouter();

    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' } | null>(null);
    const [filterEmployeeIds, setFilterEmployeeIds] = useState<string[]>([]);

    const [exportDialogOpen, setExportDialogOpen] = useState(false);
    const [exportMode, setExportMode] = useState<'pdf' | 'print' | 'xlsx' | null>(null);
    const [exportColumns, setExportColumns] = useState<Record<ColumnKey, boolean>>(
        () => Object.fromEntries(COLUMN_LABELS.map(c => [c.key, true])) as Record<ColumnKey, boolean>
    );
    const [isExportingPdf, setIsExportingPdf] = useState(false);
    const { toast } = useToast();
    const printableRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const unsubPayroll = onPayrollUpdate((payrolls) => {
            setAllPayroll(payrolls);
            setIsLoading(false);
        });
        const unsubEmployees = onEmployeesUpdate(setEmployees);
        return () => {
            unsubPayroll();
            unsubEmployees();
        };
    }, []);

    const requestSort = (key: SortKey) => {
        setSortConfig(prev => ({ key, direction: prev?.key === key && prev.direction === 'asc' ? 'desc' : 'asc' }));
    };

    const monthlyPayrollUnfiltered = useMemo(() => {
        if (!selectedBsYear || selectedBsMonth === '' || isLoading) return [];
        const year = parseInt(selectedBsYear);
        const month = parseInt(selectedBsMonth);
        return allPayroll
            .filter(p => p.bsYear === year && p.bsMonth === month)
            // A payroll row with no present/absent days and no pay at all is a
            // ghost record from before recalculation started skipping
            // employees with zero attendance for the month - it means the
            // employee didn't actually work this period, so it's hidden here
            // rather than waiting for every historical period to be
            // recalculated.
            .filter(p => (p.presentDays || 0) > 0 || (p.absentDays || 0) > 0 || (p.totalPay || 0) !== 0 || (p.netPayment || 0) !== 0);
    }, [allPayroll, selectedBsYear, selectedBsMonth, isLoading]);

    const employeeFilterOptions = useMemo(
        () => [...monthlyPayrollUnfiltered].sort((a, b) => a.employeeName.localeCompare(b.employeeName)).map(p => ({ value: p.employeeId, label: p.employeeName })),
        [monthlyPayrollUnfiltered]
    );

    const monthlyPayroll = useMemo(() => {
        let filtered = filterEmployeeIds.length === 0
            ? monthlyPayrollUnfiltered
            : monthlyPayrollUnfiltered.filter(p => filterEmployeeIds.includes(p.employeeId));

        filtered = [...filtered];
        if (sortConfig) {
            filtered.sort((a, b) => {
                const aVal = a[sortConfig.key] ?? (sortConfig.key === 'employeeName' ? '' : 0);
                const bVal = b[sortConfig.key] ?? (sortConfig.key === 'employeeName' ? '' : 0);
                if (aVal === bVal) return 0;
                const cmp = aVal < bVal ? -1 : 1;
                return sortConfig.direction === 'asc' ? cmp : -cmp;
            });
        } else {
            filtered.sort((a, b) => {
                const indexA = customEmployeeOrder.indexOf(a.employeeName);
                const indexB = customEmployeeOrder.indexOf(b.employeeName);
                if (indexA !== -1 && indexB !== -1) return indexA - indexB;
                if (indexA !== -1) return -1;
                if (indexB !== -1) return 1;
                return a.employeeName.localeCompare(b.employeeName);
            });
        }
        return filtered;
    }, [monthlyPayrollUnfiltered, filterEmployeeIds, sortConfig]);

    const totals = useMemo(() => {
        if (!monthlyPayroll || monthlyPayroll.length === 0) return null;
        return monthlyPayroll.reduce((acc, curr) => ({
            regularHours: acc.regularHours + (curr.regularHours || 0),
            otHours: acc.otHours + (curr.otHours || 0),
            absentDays: acc.absentDays + (curr.absentDays || 0),
            regularPay: acc.regularPay + (curr.regularPay || 0),
            otPay: acc.otPay + (curr.otPay || 0),
            allowance: acc.allowance + (curr.allowance || 0),
            totalPay: acc.totalPay + (curr.totalPay || 0),
            tds: acc.tds + (curr.tds || 0),
            salaryTotal: acc.salaryTotal + (curr.salaryTotal || 0),
            advance: acc.advance + (curr.advance || 0),
            netPayment: acc.netPayment + (curr.netPayment || 0),
            roundedNet: acc.roundedNet + (curr.roundedNet ?? curr.netPayment ?? 0),
        }), {
            regularHours: 0, otHours: 0, absentDays: 0, regularPay: 0, otPay: 0, allowance: 0,
            totalPay: 0, tds: 0, salaryTotal: 0, advance: 0, netPayment: 0, roundedNet: 0
        });
    }, [monthlyPayroll]);

    const hasActiveFilters = filterEmployeeIds.length > 0;

    const openExportDialog = (mode: 'pdf' | 'print' | 'xlsx') => {
        setExportMode(mode);
        setExportDialogOpen(true);
    };

    const runExport = async () => {
        setExportDialogOpen(false);
        if (exportMode === 'xlsx') {
            await handleExportXlsx();
        } else if (exportMode === 'print') {
            setTimeout(() => window.print(), 100);
        } else if (exportMode === 'pdf') {
            await handleExportPdf();
        }
        setExportMode(null);
    };

    // Shared by both exports so the PDF and the spreadsheet can never disagree
    // about which columns are included or what a column contains.
    const fieldMap: Record<ColumnKey, (p: Payroll) => any> = {
            employee: p => p.employeeName,
            regularHours: p => p.regularHours,
            otHours: p => p.otHours,
            absentDays: p => p.absentDays,
            base: p => p.base || p.rate,
            basicPay: p => p.regularPay,
            otPay: p => p.otPay,
            allowance: p => p.allowance,
            gross: p => p.totalPay,
            tds: p => p.tds,
            grossSalary: p => p.salaryTotal,
            advance: p => p.advance,
            net: p => p.netPayment,
            roundedNet: p => p.roundedNet ?? p.netPayment,
            remarks: p => p.remark,
    };

    const handleExportXlsx = async () => {
        const XLSX = (await import('xlsx'));
        const selectedCols = COLUMN_LABELS.filter(c => exportColumns[c.key]);
        const payrollExport = monthlyPayroll.map(p => {
            const row: Record<string, any> = {};
            selectedCols.forEach(c => { row[c.label] = fieldMap[c.key](p); });
            return row;
        });

        const worksheet = XLSX.utils.json_to_sheet(payrollExport);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Payroll");
        XLSX.writeFile(workbook, `Payroll-${selectedBsYear}-${NEPALI_MONTHS[parseInt(selectedBsMonth)].name}.xlsx`);
    };

    /**
     * Pure vector PDF - a real table, not a screenshot of one.
     *
     * The old version rasterised the whole registry with html2canvas and then,
     * to paginate, re-added THE SAME full-height image once per page at a
     * different offset - so a five-page registry embedded the entire bitmap
     * five times. autoTable paginates natively, repeats the header row on each
     * page, and keeps every figure as selectable, searchable text.
     *
     * Columns come from the same fieldMap and exportColumns the spreadsheet
     * export uses, so the two always agree.
     */
    const handleExportPdf = async () => {
        setIsExportingPdf(true);
        try {
            const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
                import('jspdf'),
                import('jspdf-autotable'),
            ]);
            const monthName = NEPALI_MONTHS[parseInt(selectedBsMonth)].name;
            const selectedCols = COLUMN_LABELS.filter(c => exportColumns[c.key]);

            const pdf = new jsPDF({ orientation: 'l', unit: 'mm', format: 'a4' });
            const pageWidth = pdf.internal.pageSize.getWidth();

            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(13);
            pdf.text('PAYROLL REGISTRY', pageWidth / 2, 13, { align: 'center' });
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(9);
            pdf.text(`${monthName} ${selectedBsYear} (BS)`, pageWidth / 2, 19, { align: 'center' });

            const isNumericCol = (key: ColumnKey) => key !== 'employee' && key !== 'remarks';
            const cell = (p: Payroll, key: ColumnKey) => {
                const v = fieldMap[key](p);
                if (v === undefined || v === null || v === '') return '';
                return isNumericCol(key) && typeof v === 'number'
                    ? v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                    : String(v);
            };

            autoTable(pdf, {
                startY: 24,
                head: [selectedCols.map(c => c.label)],
                body: monthlyPayroll.map(p => selectedCols.map(c => cell(p, c.key))),
                // A totals row matching the on-screen footer, so the printed
                // registry reconciles without re-adding the column by hand.
                foot: [selectedCols.map(c => (
                    c.key === 'employee' ? 'TOTAL'
                    : isNumericCol(c.key)
                        ? (monthlyPayroll.reduce((sum, p) => sum + (Number(fieldMap[c.key](p)) || 0), 0))
                            .toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                        : ''
                ))],
                theme: 'grid',
                styles: { fontSize: 6.5, cellPadding: 1, lineColor: [200, 200, 200], lineWidth: 0.1, overflow: 'linebreak' },
                headStyles: { fillColor: [235, 235, 235], textColor: 20, fontStyle: 'bold', fontSize: 6.5 },
                footStyles: { fillColor: [245, 245, 245], textColor: 20, fontStyle: 'bold', fontSize: 6.5 },
                columnStyles: Object.fromEntries(selectedCols.map((c, i) => [
                    i, isNumericCol(c.key) ? { halign: 'right' } : { halign: 'left' },
                ])) as any,
                margin: { left: 8, right: 8 },
                didDrawPage: (data: any) => {
                    const h = pdf.internal.pageSize.getHeight();
                    pdf.setFont('helvetica', 'normal');
                    pdf.setFontSize(7);
                    pdf.setTextColor(130);
                    pdf.text(`Page ${data.pageNumber}`, pageWidth - 10, h - 5, { align: 'right' });
                    pdf.setTextColor(0);
                },
            });

            pdf.save(`Payroll-${selectedBsYear}-${NEPALI_MONTHS[parseInt(selectedBsMonth)].name}.pdf`);
        } catch (error) {
            console.error('PDF export failed', error);
            toast({ title: 'PDF Export Failed', variant: 'destructive' });
        } finally {
            setIsExportingPdf(false);
        }
    };

    const toggleExportColumn = (key: ColumnKey) => {
        setExportColumns(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const hiddenCols = COLUMN_LABELS.filter(c => !exportColumns[c.key]).map(c => c.key);

    return (
        <Card className="shadow-lg border-gray-100 bg-white overflow-hidden">
            <CardContent className="pt-6">
                <div className="mb-4 flex flex-wrap justify-between items-center gap-2 print:hidden">
                    <div className="flex items-center gap-2">
                        {hasActiveFilters && (
                            <>
                                <span className="text-[10px] font-bold text-primary">{filterEmployeeIds.length} employee(s) filtered</span>
                                <Button variant="ghost" size="sm" onClick={() => setFilterEmployeeIds([])} className="h-8 text-[10px] font-bold uppercase text-muted-foreground">
                                    <X className="mr-1.5 h-3.5 w-3.5" /> Reset Filters
                                </Button>
                            </>
                        )}
                    </div>
                    <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => openExportDialog('xlsx')} disabled={monthlyPayroll.length === 0} className="h-8 font-black text-[10px] uppercase tracking-widest border-gray-300">
                            <Download className="mr-1.5 h-3.5 w-3.5" /> Export XLSX
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => openExportDialog('pdf')} disabled={monthlyPayroll.length === 0 || isExportingPdf} className="h-8 font-black text-[10px] uppercase tracking-widest border-gray-300">
                            {isExportingPdf ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <FileDown className="mr-1.5 h-3.5 w-3.5" />} Export PDF
                        </Button>
                        <GeneratePayslipsButton
                            payrollRecords={monthlyPayroll}
                            employees={employees}
                            bsYear={parseInt(selectedBsYear)}
                            bsMonthName={NEPALI_MONTHS[parseInt(selectedBsMonth)]?.name || ''}
                        />
                        <Button size="sm" onClick={() => openExportDialog('print')} disabled={monthlyPayroll.length === 0} className="h-8 font-black text-[10px] uppercase tracking-widest">
                            <Printer className="mr-1.5 h-3.5 w-3.5" /> Print Sheet
                        </Button>
                    </div>
                </div>

                <div className="printable-area" ref={printableRef}>
                    <header className="hidden print:block text-center space-y-1 mb-8">
                        <h1 className="text-2xl font-black uppercase">SHIVAM PACKAGING INDUSTRIES PVT LTD.</h1>
                        <p className="text-sm font-bold text-muted-foreground uppercase">HETAUDA 08, BAGMATI PROVIENCE, NEPAL</p>
                        <h2 className="text-lg font-black underline mt-2 uppercase tracking-tighter">
                            Workforce Financial Registry: {NEPALI_MONTHS[parseInt(selectedBsMonth)]?.name}, {selectedBsYear}
                        </h2>
                    </header>

                    <ScrollArea className="w-full whitespace-nowrap border rounded-xl overflow-hidden shadow-inner bg-gray-50/20">
                        <Table className="text-[11px] border-collapse">
                            <TableHeader>
                                <TableRow className="bg-muted/50 font-black h-11 border-b-2">
                                    <SortableTh colKey="employee" label="Employee" sortKey="employeeName" sortConfig={sortConfig} onSort={requestSort} hiddenCols={hiddenCols} className="sticky left-0 bg-background z-20 border-r min-w-[160px] text-gray-900 uppercase tracking-tighter text-left">
                                        <MultiSelectFilter label="Employee" options={employeeFilterOptions} selected={filterEmployeeIds} onChange={setFilterEmployeeIds} />
                                    </SortableTh>
                                    <SortableTh colKey="regularHours" label="Regular Hrs" sortKey="regularHours" sortConfig={sortConfig} onSort={requestSort} hiddenCols={hiddenCols} />
                                    <SortableTh colKey="otHours" label="OT Hrs" sortKey="otHours" sortConfig={sortConfig} onSort={requestSort} hiddenCols={hiddenCols} />
                                    <SortableTh colKey="absentDays" label="Absent Days" sortKey="absentDays" sortConfig={sortConfig} onSort={requestSort} hiddenCols={hiddenCols} className="text-red-600" />
                                    <SortableTh colKey="base" label="Base (Salary or Rate)" sortKey="rate" sortConfig={sortConfig} onSort={requestSort} hiddenCols={hiddenCols} className="text-muted-foreground" />
                                    <SortableTh colKey="basicPay" label="Basic Pay" sortKey="regularPay" sortConfig={sortConfig} onSort={requestSort} hiddenCols={hiddenCols} className="font-bold text-blue-900" />
                                    <SortableTh colKey="otPay" label="OT Pay" sortKey="otPay" sortConfig={sortConfig} onSort={requestSort} hiddenCols={hiddenCols} />
                                    <SortableTh colKey="allowance" label="Allowance" sortKey="allowance" sortConfig={sortConfig} onSort={requestSort} hiddenCols={hiddenCols} />
                                    <SortableTh colKey="gross" label="Gross" sortKey="totalPay" sortConfig={sortConfig} onSort={requestSort} hiddenCols={hiddenCols} className="font-black bg-muted/20" />
                                    <SortableTh colKey="tds" label="TDS" sortKey="tds" sortConfig={sortConfig} onSort={requestSort} hiddenCols={hiddenCols} className="text-red-600" />
                                    <SortableTh colKey="grossSalary" label="Gross Salary" sortKey="salaryTotal" sortConfig={sortConfig} onSort={requestSort} hiddenCols={hiddenCols} className="font-bold" />
                                    <SortableTh colKey="advance" label="Advance" sortKey="advance" sortConfig={sortConfig} onSort={requestSort} hiddenCols={hiddenCols} className="font-black text-orange-600" />
                                    <SortableTh colKey="net" label="Net" sortKey="netPayment" sortConfig={sortConfig} onSort={requestSort} hiddenCols={hiddenCols} className="font-black" />
                                    <SortableTh colKey="roundedNet" label="Rounded Net" sortKey="roundedNet" sortConfig={sortConfig} onSort={requestSort} hiddenCols={hiddenCols} className="font-black text-emerald-700 bg-emerald-50/30" />
                                    <TableHead data-col="remarks" className="min-w-[150px] uppercase px-3 text-left">Remarks</TableHead>
                                    <TableHead data-col="actions" className="print:hidden sticky right-0 bg-background z-10 border-l"></TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLoading ? (
                                    <TableRow><TableCell colSpan={16} className="text-center py-20"><Loader2 className="mr-2 h-8 w-8 animate-spin inline-block opacity-20" /></TableCell></TableRow>
                                ) : monthlyPayroll.length === 0 ? (
                                    <TableRow><TableCell colSpan={16} className="text-center py-20 text-muted-foreground italic">No financial records for this period.</TableCell></TableRow>
                                ) : monthlyPayroll.map(p => (
                                    <TableRow key={p.id} className="hover:bg-muted/30 h-12 border-b transition-colors group">
                                        <TableCell data-col="employee" className="font-black sticky left-0 bg-background z-10 border-r text-gray-900 group-hover:text-primary">{p.employeeName}</TableCell>
                                        <TableCell data-col="regularHours" className="text-right tabular-nums px-3">{p.regularHours?.toFixed(1) || '0.0'}</TableCell>
                                        <TableCell data-col="otHours" className="text-right tabular-nums px-3 font-bold text-blue-700">+{p.otHours?.toFixed(1) || '0.0'}</TableCell>
                                        <TableCell data-col="absentDays" className="text-right tabular-nums px-3 text-red-600 font-bold">{p.absentDays || 0}</TableCell>
                                        <TableCell data-col="base" className="text-right tabular-nums px-3 text-muted-foreground font-medium">{p.base || (p.rate || 0).toLocaleString()}</TableCell>
                                        <TableCell data-col="basicPay" className="text-right tabular-nums px-3 font-bold text-gray-900">{(p.regularPay || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                        <TableCell data-col="otPay" className="text-right tabular-nums px-3">{(p.otPay || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                        <TableCell data-col="allowance" className="text-right tabular-nums px-3">{(p.allowance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                        <TableCell data-col="gross" className="text-right tabular-nums px-3 font-black bg-muted/10">{(p.totalPay || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                        <TableCell data-col="tds" className="text-right tabular-nums px-3 text-red-600 font-medium">{(p.tds || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                        <TableCell data-col="grossSalary" className="text-right tabular-nums px-3 font-bold">{(p.salaryTotal || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                        <TableCell data-col="advance" className="text-right tabular-nums px-3 text-orange-600 font-bold">{(p.advance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                        <TableCell data-col="net" className="text-right tabular-nums px-3 font-bold">{(p.netPayment || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                        <TableCell data-col="roundedNet" className="text-right tabular-nums px-3 font-black text-emerald-700 bg-emerald-50/20">{(p.roundedNet ?? p.netPayment ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                        <TableCell data-col="remarks" className="text-[10px] text-muted-foreground italic truncate max-w-[150px] px-3">{p.remark}</TableCell>
                                        <TableCell data-col="actions" className="print:hidden sticky right-0 bg-background z-10 border-l px-2">
                                            <Button variant="ghost" size="icon" className="h-7 w-7 text-primary" onClick={() => router.push(`/hr/payslip?employeeId=${p.employeeId}&year=${selectedBsYear}&month=${selectedBsMonth}`)}>
                                                <View className="h-3.5 w-3.5" />
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                            {totals && monthlyPayroll.length > 0 && (
                                <TableFooter className="bg-muted/50 font-black h-12 border-t-2">
                                    <TableRow>
                                        <TableCell data-col="employee" className="sticky left-0 bg-background z-20 border-r text-gray-900 uppercase tracking-tighter">TOTALS</TableCell>
                                        <TableCell data-col="regularHours" className="text-right tabular-nums px-3">{totals.regularHours.toFixed(1)}</TableCell>
                                        <TableCell data-col="otHours" className="text-right tabular-nums px-3">{totals.otHours.toFixed(1)}</TableCell>
                                        <TableCell data-col="absentDays" className="text-right tabular-nums px-3">{totals.absentDays}</TableCell>
                                        <TableCell data-col="base" className="text-right"></TableCell>
                                        <TableCell data-col="basicPay" className="text-right tabular-nums px-3">{totals.regularPay.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                        <TableCell data-col="otPay" className="text-right tabular-nums px-3">{totals.otPay.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                        <TableCell data-col="allowance" className="text-right tabular-nums px-3">{totals.allowance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                        <TableCell data-col="gross" className="text-right tabular-nums px-3">{totals.totalPay.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                        <TableCell data-col="tds" className="text-right tabular-nums px-3">{totals.tds.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                        <TableCell data-col="grossSalary" className="text-right tabular-nums px-3">{totals.salaryTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                        <TableCell data-col="advance" className="text-right tabular-nums px-3">{totals.advance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                        <TableCell data-col="net" className="text-right tabular-nums px-3">{totals.netPayment.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                        <TableCell data-col="roundedNet" className="text-right tabular-nums px-3 text-emerald-700">{totals.roundedNet.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                        <TableCell data-col="remarks" colSpan={2} className="print:hidden"></TableCell>
                                    </TableRow>
                                </TableFooter>
                            )}
                        </Table>
                        <ScrollBar orientation="horizontal" />
                    </ScrollArea>
                </div>
            </CardContent>

            <Dialog open={exportDialogOpen} onOpenChange={setExportDialogOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-black text-gray-900">Choose Columns</DialogTitle>
                        <DialogDescription>
                            Select which columns to include in the {exportMode === 'xlsx' ? 'Excel export' : exportMode === 'pdf' ? 'PDF export' : 'printed sheet'}. This uses the currently filtered and sorted {monthlyPayroll.length} record(s).
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid grid-cols-2 gap-2 py-2 max-h-[320px] overflow-y-auto">
                        {COLUMN_LABELS.map(c => (
                            <label key={c.key} className="flex items-center gap-2 text-xs py-1 cursor-pointer">
                                <Checkbox checked={exportColumns[c.key]} onCheckedChange={() => toggleExportColumn(c.key)} disabled={c.key === 'employee'} />
                                {c.label}
                            </label>
                        ))}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setExportDialogOpen(false)}>Cancel</Button>
                        <Button onClick={runExport} className="font-black text-xs uppercase tracking-widest">Continue</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <style jsx global>{`
                @media print {
                  @page { size: A4 landscape; margin: 0.3in; }
                  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; background-color: #fff; }
                  body * { visibility: hidden; }
                  .printable-area, .printable-area * { visibility: visible; }
                  /* Plain office printers are black & white - colored badges/
                     text read as childish and print as muddy gray anyway, so
                     force a clean grayscale render instead of leaving it to
                     chance. */
                  .printable-area { position: absolute; left: 0; top: 0; width: 100%; height: auto; margin: 0; padding: 0; border: none; font-size: 8px; filter: grayscale(1); }
                  .print\\:hidden { display: none !important; }
                  ${hiddenCols.map(k => `.printable-area [data-col="${k}"] { display: none !important; }`).join('\n                  ')}
                }
            `}</style>
        </Card>
    );
}

function SortableTh({ colKey, label, sortKey, sortConfig, onSort, className, hiddenCols, children }: {
    colKey: ColumnKey;
    label: string;
    sortKey: SortKey;
    sortConfig: { key: SortKey; direction: 'asc' | 'desc' } | null;
    onSort: (key: SortKey) => void;
    className?: string;
    hiddenCols: ColumnKey[];
    children?: ReactNode;
}) {
    const isActive = sortConfig?.key === sortKey;
    return (
        <TableHead data-col={colKey} className={cn("uppercase px-3 text-right", className)}>
            <span className="inline-flex items-center gap-1">
                <button onClick={() => onSort(sortKey)} className={cn("inline-flex items-center gap-1 hover:text-primary transition-colors", isActive && "text-primary")}>
                    {label}
                    {isActive ? (sortConfig!.direction === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-30" />}
                </button>
                {children}
            </span>
        </TableHead>
    );
}

