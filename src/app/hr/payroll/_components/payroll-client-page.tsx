'use client';

import { useState, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { drawPdfLetterhead } from '@/lib/pdf-letterhead';
import { useToast } from '@/hooks/use-toast';
import { useBusinessProfile } from '@/hooks/use-business-profile';
import type { Payroll, Employee } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Download, Printer, Loader2, View, FileDown, ArrowUpDown, ChevronUp, ChevronDown, X } from 'lucide-react';
import { onPayrollUpdate } from '@/services/payroll-service';
import { onEmployeesUpdate } from '@/services/employee-service';
import { useOwnershipScope } from '@/hooks/use-ownership-scope';
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

type ColumnKey = 'employee' | 'regularHours' | 'otHours' | 'totalHours' | 'absentDays' | 'base' | 'basicPay' | 'otPay' | 'total' | 'deduction' | 'allowance' | 'gross' | 'tds' | 'grossSalary' | 'advance' | 'net' | 'roundedNet' | 'remarks';

/**
 * The source workbooks use two different payroll layouts, and this table has
 * to serve both:
 *
 *   FY 2076/77 - Poush 2082 ("legacy"):
 *     Employee | Total Hour | OT Hrs | Regular Hrs | Base | Basic Pay |
 *     OT Pay | Total | Absent Days | Deduction | Allowance | Gross | TDS |
 *     Gross Salary | Advance | Net | Remarks
 *
 *   Magh 2082 onward (calculated by the VBA code):
 *     Employee | Regular Hrs | OT Hrs | Absent Days | Base | Basic Pay |
 *     OT Pay | Allowance | Gross | TDS | Gross Salary | Advance | Net |
 *     Rounded Net | Remarks
 *
 * The columns below are the union of the two. Which of the format-specific
 * ones are actually shown is decided per period from the data present (see
 * formatHiddenCols), so a legacy month doesn't display an empty "Rounded
 * Net" and a VBA month doesn't display an empty "Total Hour"/"Deduction".
 */
const COLUMN_LABELS: { key: ColumnKey; label: string }[] = [
    { key: 'employee', label: 'Employee' },
    { key: 'regularHours', label: 'Regular Hrs' },
    { key: 'otHours', label: 'OT Hrs' },
    { key: 'totalHours', label: 'Total Hour' },
    { key: 'absentDays', label: 'Absent Days' },
    { key: 'base', label: 'Base (Salary or Rate)' },
    { key: 'basicPay', label: 'Basic Pay' },
    { key: 'otPay', label: 'OT Pay' },
    { key: 'total', label: 'Total' },
    { key: 'deduction', label: 'Deduction' },
    { key: 'allowance', label: 'Allowance' },
    { key: 'gross', label: 'Gross' },
    { key: 'tds', label: 'TDS' },
    { key: 'grossSalary', label: 'Gross Salary' },
    { key: 'advance', label: 'Advance' },
    { key: 'net', label: 'Net' },
    { key: 'roundedNet', label: 'Rounded Net' },
    { key: 'remarks', label: 'Remarks' },
];

/** Columns that only exist in one of the two workbook layouts. */
const FORMAT_SPECIFIC_COLUMNS: ColumnKey[] = ['totalHours', 'total', 'deduction', 'roundedNet'];

type SortKey = 'employeeName' | 'regularHours' | 'otHours' | 'totalHours' | 'absentDays' | 'rate' | 'regularPay' | 'otPay' | 'deduction' | 'allowance' | 'totalPay' | 'tds' | 'salaryTotal' | 'advance' | 'netPayment' | 'roundedNet';

interface PayrollClientPageProps {
    selectedBsYear: string;
    selectedBsMonth: string;
}

export default function PayrollClientPage({ selectedBsYear, selectedBsMonth }: PayrollClientPageProps) {
    const [allPayroll, setAllPayroll] = useState<Payroll[]>([]);
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const router = useRouter();
    const { inScope } = useOwnershipScope('hr');

    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' } | null>(null);
    const [filterEmployeeIds, setFilterEmployeeIds] = useState<string[]>([]);

    const [exportDialogOpen, setExportDialogOpen] = useState(false);
    const [exportMode, setExportMode] = useState<'pdf' | 'print' | 'xlsx' | null>(null);
    const [exportColumns, setExportColumns] = useState<Record<ColumnKey, boolean>>(
        () => Object.fromEntries(COLUMN_LABELS.map(c => [c.key, true])) as Record<ColumnKey, boolean>
    );
    const [isExportingPdf, setIsExportingPdf] = useState(false);
    const { toast } = useToast();
    const companyProfile = useBusinessProfile();
    const printableRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        // This table only ever renders the selected year and month, so the
        // listener is scoped to that BS year instead of the whole collection.
        const unsubPayroll = onPayrollUpdate({ bsYears: [parseInt(selectedBsYear)] }, (payrolls) => {
            setAllPayroll(payrolls.filter(p => inScope(p.ownership)));
            setIsLoading(false);
        });
        const unsubEmployees = onEmployeesUpdate((data) => setEmployees(data.filter(e => inScope(e.ownership))));
        return () => {
            unsubPayroll();
            unsubEmployees();
        };
    }, [inScope, selectedBsYear]);

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
            totalHours: acc.totalHours + (curr.totalHours || 0),
            absentDays: acc.absentDays + (curr.absentDays || 0),
            regularPay: acc.regularPay + (curr.regularPay || 0),
            otPay: acc.otPay + (curr.otPay || 0),
            total: acc.total + (curr.regularPay || 0) + (curr.otPay || 0),
            deduction: acc.deduction + (curr.deduction || 0),
            allowance: acc.allowance + (curr.allowance || 0),
            totalPay: acc.totalPay + (curr.totalPay || 0),
            tds: acc.tds + (curr.tds || 0),
            salaryTotal: acc.salaryTotal + (curr.salaryTotal || 0),
            advance: acc.advance + (curr.advance || 0),
            netPayment: acc.netPayment + (curr.netPayment || 0),
            roundedNet: acc.roundedNet + (curr.roundedNet ?? curr.netPayment ?? 0),
        }), {
            regularHours: 0, otHours: 0, totalHours: 0, absentDays: 0, regularPay: 0, otPay: 0,
            total: 0, deduction: 0, allowance: 0,
            totalPay: 0, tds: 0, salaryTotal: 0, advance: 0, netPayment: 0, roundedNet: 0
        });
    }, [monthlyPayroll]);

    /**
     * Which layout this period's records came from, read from the data rather
     * than from the date: a month is only as "legacy" as the columns its rows
     * actually carry, and that also keeps recalculated periods (which have
     * neither layout's extra columns) from showing empty ones.
     */
    const formatHiddenCols = useMemo(() => {
        const rows = monthlyPayrollUnfiltered;
        // Total Hour and Deduction exist only in the legacy layout, so either
        // one carrying a figure identifies the period as one of those sheets.
        const isLegacyLayout = rows.some(p => (p.totalHours || 0) > 0 || (p.deduction || 0) > 0);
        // netPayment is always present, so only an explicitly stored
        // roundedNet proves the sheet really had that column. Shown for
        // anything that isn't a legacy sheet (the VBA layout and periods
        // recalculated in-app both belong there) and never hidden when a row
        // actually carries one, so a mixed period can't lose real data.
        const hasRoundedNet = rows.some(p => p.roundedNet !== undefined);

        const shown: Record<string, boolean> = {
            totalHours: isLegacyLayout,
            deduction: isLegacyLayout,
            // "Total" is Basic Pay + OT Pay - a subtotal the legacy sheet
            // prints but never stored on its own, so it rides with that layout.
            total: isLegacyLayout,
            roundedNet: !isLegacyLayout || hasRoundedNet,
        };
        return FORMAT_SPECIFIC_COLUMNS.filter(key => !shown[key]);
    }, [monthlyPayrollUnfiltered]);

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

    // One definition per column, used by the header, every body row, the
    // totals row AND both exports. The on-screen table used to be written out
    // by hand while the exports were generated from a map, so the two could
    // drift: hiding a single header cell without hiding its body cell shifted
    // every value one column away from its label, which is how Rounded Net
    // ended up printed under "Remarks". Rendering all four from this one list
    // makes that impossible - a column either exists everywhere or nowhere.
    const money = (v: number | undefined | null) =>
        (v || 0).toLocaleString(undefined, { minimumFractionDigits: 2 });

    type PayrollColumn = {
        key: ColumnKey;
        label: string;
        sortKey?: SortKey;
        headClassName?: string;
        cellClassName?: string;
        footClassName?: string;
        cell: (p: Payroll) => ReactNode;
        foot?: (t: NonNullable<typeof totals>) => ReactNode;
        exportValue: (p: Payroll) => any;
    };

    const ALL_COLUMNS: PayrollColumn[] = [
        {
            key: 'employee', label: 'Employee', sortKey: 'employeeName',
            headClassName: 'sticky left-0 bg-background z-20 border-r min-w-[160px] text-foreground uppercase tracking-tighter text-left',
            cellClassName: 'font-black sticky left-0 bg-background z-10 border-r text-foreground group-hover:text-primary',
            footClassName: 'sticky left-0 bg-background z-20 border-r text-foreground uppercase tracking-tighter',
            cell: p => p.employeeName,
            foot: () => 'TOTALS',
            exportValue: p => p.employeeName,
        },
        {
            key: 'regularHours', label: 'Regular Hrs', sortKey: 'regularHours',
            cellClassName: 'text-right tabular-nums px-3',
            cell: p => p.regularHours?.toFixed(1) || '0.0',
            foot: t => t.regularHours.toFixed(1),
            exportValue: p => p.regularHours,
        },
        {
            key: 'otHours', label: 'OT Hrs', sortKey: 'otHours',
            cellClassName: 'text-right tabular-nums px-3 font-bold text-blue-700',
            cell: p => `+${p.otHours?.toFixed(1) || '0.0'}`,
            foot: t => t.otHours.toFixed(1),
            exportValue: p => p.otHours,
        },
        {
            key: 'totalHours', label: 'Total Hour', sortKey: 'totalHours',
            cellClassName: 'text-right tabular-nums px-3',
            cell: p => p.totalHours?.toFixed(1) || '0.0',
            foot: t => t.totalHours.toFixed(1),
            exportValue: p => p.totalHours,
        },
        {
            key: 'absentDays', label: 'Absent Days', sortKey: 'absentDays',
            headClassName: 'text-red-600',
            cellClassName: 'text-right tabular-nums px-3 text-red-600 font-bold',
            cell: p => p.absentDays || 0,
            foot: t => t.absentDays,
            exportValue: p => p.absentDays,
        },
        {
            key: 'base', label: 'Base (Salary or Rate)', sortKey: 'rate',
            headClassName: 'text-muted-foreground',
            cellClassName: 'text-right tabular-nums px-3 text-muted-foreground font-medium',
            cell: p => p.base || (p.rate || 0).toLocaleString(),
            exportValue: p => p.base || p.rate,
        },
        {
            key: 'basicPay', label: 'Basic Pay', sortKey: 'regularPay',
            headClassName: 'font-bold text-blue-900',
            cellClassName: 'text-right tabular-nums px-3 font-bold text-foreground',
            cell: p => money(p.regularPay),
            foot: t => money(t.regularPay),
            exportValue: p => p.regularPay,
        },
        {
            key: 'otPay', label: 'OT Pay', sortKey: 'otPay',
            cellClassName: 'text-right tabular-nums px-3',
            cell: p => money(p.otPay),
            foot: t => money(t.otPay),
            exportValue: p => p.otPay,
        },
        {
            key: 'total', label: 'Total',
            cellClassName: 'text-right tabular-nums px-3 font-bold',
            cell: p => money((p.regularPay || 0) + (p.otPay || 0)),
            foot: t => money(t.total),
            exportValue: p => (p.regularPay || 0) + (p.otPay || 0),
        },
        {
            key: 'deduction', label: 'Deduction', sortKey: 'deduction',
            headClassName: 'text-red-600',
            cellClassName: 'text-right tabular-nums px-3 text-red-600 font-medium',
            cell: p => money(p.deduction),
            foot: t => money(t.deduction),
            exportValue: p => p.deduction,
        },
        {
            key: 'allowance', label: 'Allowance', sortKey: 'allowance',
            cellClassName: 'text-right tabular-nums px-3',
            cell: p => money(p.allowance),
            foot: t => money(t.allowance),
            exportValue: p => p.allowance,
        },
        {
            key: 'gross', label: 'Gross', sortKey: 'totalPay',
            headClassName: 'font-black bg-muted/20',
            cellClassName: 'text-right tabular-nums px-3 font-black bg-muted/10',
            cell: p => money(p.totalPay),
            foot: t => money(t.totalPay),
            exportValue: p => p.totalPay,
        },
        {
            key: 'tds', label: 'TDS', sortKey: 'tds',
            headClassName: 'text-red-600',
            cellClassName: 'text-right tabular-nums px-3 text-red-600 font-medium',
            cell: p => money(p.tds),
            foot: t => money(t.tds),
            exportValue: p => p.tds,
        },
        {
            key: 'grossSalary', label: 'Gross Salary', sortKey: 'salaryTotal',
            headClassName: 'font-bold',
            cellClassName: 'text-right tabular-nums px-3 font-bold',
            cell: p => money(p.salaryTotal),
            foot: t => money(t.salaryTotal),
            exportValue: p => p.salaryTotal,
        },
        {
            key: 'advance', label: 'Advance', sortKey: 'advance',
            headClassName: 'font-black text-orange-600',
            cellClassName: 'text-right tabular-nums px-3 text-orange-600 font-bold',
            cell: p => money(p.advance),
            foot: t => money(t.advance),
            exportValue: p => p.advance,
        },
        {
            key: 'net', label: 'Net', sortKey: 'netPayment',
            headClassName: 'font-black',
            cellClassName: 'text-right tabular-nums px-3 font-bold',
            cell: p => money(p.netPayment),
            foot: t => money(t.netPayment),
            exportValue: p => p.netPayment,
        },
        {
            key: 'roundedNet', label: 'Rounded Net', sortKey: 'roundedNet',
            headClassName: 'font-black text-emerald-700 bg-emerald-50/30',
            cellClassName: 'text-right tabular-nums px-3 font-black text-emerald-700 bg-emerald-50/20',
            cell: p => money(p.roundedNet ?? p.netPayment),
            foot: t => money(t.roundedNet),
            exportValue: p => p.roundedNet ?? p.netPayment,
        },
        {
            key: 'remarks', label: 'Remarks',
            headClassName: 'min-w-[150px] text-left',
            cellClassName: 'text-[10px] text-muted-foreground italic truncate max-w-[150px] px-3',
            cell: p => p.remark,
            exportValue: p => p.remark,
        },
    ];

    // Columns this period's layout has at all. Dropped from the array rather
    // than hidden with CSS, so header, body, totals and export all lose them
    // together.
    const visibleColumns = ALL_COLUMNS.filter(c => !formatHiddenCols.includes(c.key));

    const handleExportXlsx = async () => {
        const XLSX = (await import('xlsx'));
        const selectedCols = visibleColumns.filter(c => exportColumns[c.key]);
        const payrollExport = monthlyPayroll.map(p => {
            const row: Record<string, any> = {};
            selectedCols.forEach(c => { row[c.label] = c.exportValue(p); });
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
            const selectedCols = visibleColumns.filter(c => exportColumns[c.key]);

            const pdf = new jsPDF({ orientation: 'l', unit: 'mm', format: 'a4', compress: true });
            const pageWidth = pdf.internal.pageSize.getWidth();

            // Landscape registry: the address and PAN belong on the payslip,
            // not here, but the company's own name should read the same on
            // both scripts as it does everywhere else.
            const headEnd = drawPdfLetterhead(pdf, companyProfile, {
                x: pageWidth / 2, y: 12, align: 'center',
                nameSize: 13, showAddress: false, showPan: false,
            });
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(10);
            pdf.text('PAYROLL REGISTRY', pageWidth / 2, headEnd + 5.5, { align: 'center' });
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(9);
            pdf.text(`${monthName} ${selectedBsYear} (BS)`, pageWidth / 2, headEnd + 10.5, { align: 'center' });

            const isNumericCol = (key: ColumnKey) => key !== 'employee' && key !== 'remarks';
            const cell = (p: Payroll, col: PayrollColumn) => {
                const v = col.exportValue(p);
                if (v === undefined || v === null || v === '') return '';
                return isNumericCol(col.key) && typeof v === 'number'
                    ? v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                    : String(v);
            };

            autoTable(pdf, {
                startY: 27,
                head: [selectedCols.map(c => c.label)],
                body: monthlyPayroll.map(p => selectedCols.map(c => cell(p, c))),
                // A totals row matching the on-screen footer, so the printed
                // registry reconciles without re-adding the column by hand.
                foot: [selectedCols.map(c => (
                    c.key === 'employee' ? 'TOTAL'
                    : isNumericCol(c.key)
                        ? (monthlyPayroll.reduce((sum, p) => sum + (Number(c.exportValue(p)) || 0), 0))
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

    // A column is hidden either because the operator unticked it, or
    // because this period's layout has no such column at all.
    // Only the operator's export/print choice. Columns this period's layout
    // lacks are never rendered in the first place, so they need no CSS.
    const hiddenCols = visibleColumns.filter(c => !exportColumns[c.key]).map(c => c.key);

    return (
        <Card className="shadow-lg border-border bg-card overflow-hidden">
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
                        <Button variant="outline" size="sm" onClick={() => openExportDialog('xlsx')} disabled={monthlyPayroll.length === 0} className="h-8 font-black text-[10px] uppercase tracking-widest border-border">
                            <Download className="mr-1.5 h-3.5 w-3.5" /> Export XLSX
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => openExportDialog('pdf')} disabled={monthlyPayroll.length === 0 || isExportingPdf} className="h-8 font-black text-[10px] uppercase tracking-widest border-border">
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
                        <h1 className="text-2xl font-black uppercase">{companyProfile.nameEn}</h1>
                        <p className="text-sm font-bold text-muted-foreground uppercase">{companyProfile.address}</p>
                        <h2 className="text-lg font-black underline mt-2 uppercase tracking-tighter">
                            Workforce Financial Registry: {NEPALI_MONTHS[parseInt(selectedBsMonth)]?.name}, {selectedBsYear}
                        </h2>
                    </header>

                    <ScrollArea className="w-full whitespace-nowrap border rounded-xl overflow-hidden shadow-inner bg-muted/20">
                        <Table className="text-[11px] border-collapse">
                            <TableHeader>
                                <TableRow className="bg-muted/50 font-black h-11 border-b-2">
                                    {visibleColumns.map(c => c.sortKey ? (
                                        <SortableTh key={c.key} colKey={c.key} label={c.label} sortKey={c.sortKey} sortConfig={sortConfig} onSort={requestSort} className={c.headClassName}>
                                            {c.key === 'employee' ? (
                                                <MultiSelectFilter label="Employee" options={employeeFilterOptions} selected={filterEmployeeIds} onChange={setFilterEmployeeIds} />
                                            ) : null}
                                        </SortableTh>
                                    ) : (
                                        <TableHead key={c.key} data-col={c.key} className={cn('uppercase px-3 text-right', c.headClassName)}>{c.label}</TableHead>
                                    ))}
                                    <TableHead data-col="actions" className="print:hidden sticky right-0 bg-background z-10 border-l"></TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLoading ? (
                                    <TableRow><TableCell colSpan={visibleColumns.length + 1} className="text-center py-20"><Loader2 className="mr-2 h-8 w-8 animate-spin inline-block opacity-20" /></TableCell></TableRow>
                                ) : monthlyPayroll.length === 0 ? (
                                    <TableRow><TableCell colSpan={visibleColumns.length + 1} className="text-center py-20 text-muted-foreground italic">No financial records for this period.</TableCell></TableRow>
                                ) : monthlyPayroll.map(p => (
                                    <TableRow key={p.id} className="hover:bg-muted/30 h-12 border-b transition-colors group">
                                        {visibleColumns.map(c => (
                                            <TableCell key={c.key} data-col={c.key} className={c.cellClassName}>{c.cell(p)}</TableCell>
                                        ))}
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
                                        {visibleColumns.map(c => (
                                            <TableCell key={c.key} data-col={c.key} className={c.footClassName ?? c.cellClassName}>
                                                {c.foot ? c.foot(totals) : null}
                                            </TableCell>
                                        ))}
                                        <TableCell data-col="actions" className="print:hidden sticky right-0 bg-background z-10 border-l"></TableCell>
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
                        <DialogTitle className="text-xl font-black text-foreground">Choose Columns</DialogTitle>
                        <DialogDescription>
                            Select which columns to include in the {exportMode === 'xlsx' ? 'Excel export' : exportMode === 'pdf' ? 'PDF export' : 'printed sheet'}. This uses the currently filtered and sorted {monthlyPayroll.length} record(s).
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid grid-cols-2 gap-2 py-2 max-h-[320px] overflow-y-auto">
                        {visibleColumns.map(c => (
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

function SortableTh({ colKey, label, sortKey, sortConfig, onSort, className, children }: {
    colKey: ColumnKey;
    label: string;
    sortKey: SortKey;
    sortConfig: { key: SortKey; direction: 'asc' | 'desc' } | null;
    onSort: (key: SortKey) => void;
    className?: string;
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

