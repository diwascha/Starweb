'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Printer, FileDown, FileSpreadsheet, ChevronDown, Loader2, X, Eye } from 'lucide-react';
import { format } from 'date-fns';
import { onSettingUpdate } from '@/services/settings-service';
import { DEFAULT_FLEET_PROFILE } from '@/lib/constants';
import type { CompanyProfile } from '@/lib/types';
import { cn } from '@/lib/utils';

export interface LedgerColumn<T> {
    header: string;
    align?: 'left' | 'right' | 'center';
    value: (row: T) => string | number;
}

interface LedgerToolbarProps<T> {
    title: string;
    subtitle?: string;
    columns: LedgerColumn<T>[];
    rows: T[];
    filenamePrefix: string;
}

export function LedgerToolbar<T,>({ title, subtitle, columns, rows, filenamePrefix }: LedgerToolbarProps<T>) {
    const [fleetProfile, setFleetProfile] = useState<CompanyProfile>(DEFAULT_FLEET_PROFILE as CompanyProfile);
    const [isPreviewOpen, setIsPreviewOpen] = useState(false);
    const [isExporting, setIsExporting] = useState(false);

    useEffect(() => {
        return onSettingUpdate('fleetCompanyProfile', (s) => { if (s?.value) setFleetProfile(s.value); });
    }, []);

    const cellValue = (row: T, col: LedgerColumn<T>): string | number => {
        const v = col.value(row);
        return v === null || v === undefined || v === '' ? '-' : v;
    };

    const handleExportExcel = async () => {
        setIsExporting(true);
        try {
            const XLSX = await import('xlsx');
            const sheet: (string | number)[][] = [
                [fleetProfile.nameEn],
                [fleetProfile.address],
                [`PAN: ${fleetProfile.pan}`],
                [],
                [title],
                ...(subtitle ? [[subtitle]] : []),
                [`Generated: ${format(new Date(), 'PPP p')}`],
                [],
                columns.map(c => c.header),
                ...rows.map(r => columns.map(c => cellValue(r, c))),
            ];
            const ws = XLSX.utils.aoa_to_sheet(sheet);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, title.slice(0, 28));
            XLSX.writeFile(wb, `${filenamePrefix}_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
        } catch (error) {
            console.error('Excel export failed:', error);
        } finally {
            setIsExporting(false);
        }
    };

    const handleExportPdf = async () => {
        setIsExporting(true);
        try {
            const { jsPDF } = await import('jspdf');
            const { default: autoTable } = await import('jspdf-autotable');
            const doc = new jsPDF('l', 'mm', 'a4');
            const width = doc.internal.pageSize.getWidth();

            doc.setFont('helvetica', 'bold'); doc.setFontSize(16);
            doc.text(fleetProfile.nameEn.toUpperCase(), width / 2, 14, { align: 'center' });
            doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(110);
            doc.text(`${fleetProfile.address}  |  PAN: ${fleetProfile.pan}`, width / 2, 20, { align: 'center' });
            doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(20);
            doc.text(title.toUpperCase(), 14, 30);
            doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(90);
            let y = 36;
            if (subtitle) { doc.text(subtitle, 14, y); y += 4.5; }
            doc.text(`Generated: ${format(new Date(), 'PPP p')}`, 14, y); y += 4;

            autoTable(doc, {
                startY: y + 2,
                head: [columns.map(c => c.header)],
                body: rows.map(r => columns.map(c => String(cellValue(r, c)))),
                theme: 'grid',
                headStyles: { fillColor: [33, 37, 41], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
                bodyStyles: { fontSize: 7, textColor: [20, 20, 20] },
                alternateRowStyles: { fillColor: [248, 249, 250] },
                columnStyles: Object.fromEntries(columns.map((c, i) => [i, { halign: c.align || 'left' }])),
            });
            doc.save(`${filenamePrefix}_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
        } catch (error) {
            console.error('PDF export failed:', error);
        } finally {
            setIsExporting(false);
        }
    };

    const handlePrint = () => {
        const rowsHtml = rows.map(r => `<tr>${columns.map(c => `<td class="${c.align === 'right' ? 'right' : c.align === 'center' ? 'center' : ''}">${cellValue(r, c)}</td>`).join('')}</tr>`).join('');
        const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>
        <style>
            * { box-sizing: border-box; }
            body { font-family: system-ui, -apple-system, sans-serif; padding: 16px; color: #111; margin: 0; }
            .head { text-align: center; border-bottom: 2px solid #222; padding-bottom: 12px; margin-bottom: 14px; }
            .head h1 { margin: 0; font-size: 20px; text-transform: uppercase; letter-spacing: .5px; }
            .head .np { font-weight: 600; margin: 2px 0; }
            .head p { margin: 1px 0; font-size: 11px; color: #666; }
            .head h2 { margin: 10px 0 0; font-size: 13px; letter-spacing: 2px; }
            .meta { display: flex; justify-content: space-between; margin-bottom: 14px; font-size: 10px; color: #555; }
            table { width: 100%; border-collapse: collapse; font-size: 10px; }
            th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; vertical-align: top; }
            th { background: #f4f5f6; font-weight: 700; font-size: 9px; text-transform: uppercase; letter-spacing: .4px; }
            tbody tr:nth-child(even) { background: #fafbfc; }
            .right { text-align: right; }
            .center { text-align: center; }
            .foot { margin-top: 28px; font-size: 9px; color: #888; text-align: center; border-top: 1px dashed #ccc; padding-top: 8px; }
            @media print { @page { size: A4 landscape; margin: 10mm; } body { padding: 0; } }
        </style></head><body>
            <div class="head">
                <h1>${fleetProfile.nameEn}</h1>
                ${fleetProfile.nameNp ? `<div class="np">${fleetProfile.nameNp}</div>` : ''}
                <p>${fleetProfile.address}</p>
                <p>PAN: ${fleetProfile.pan}</p>
                <h2>${title.toUpperCase()}</h2>
            </div>
            <div class="meta">
                <div>${subtitle || ''}</div>
                <div>Generated: ${format(new Date(), 'PPP p')}</div>
            </div>
            <table>
                <thead><tr>${columns.map(c => `<th class="${c.align === 'right' ? 'right' : c.align === 'center' ? 'center' : ''}">${c.header}</th>`).join('')}</tr></thead>
                <tbody>${rowsHtml}</tbody>
            </table>
            <div class="foot"><p>System-generated statement for ${fleetProfile.nameEn}. No signature required.</p></div>
        </body></html>`;

        const w = window.open('', '', 'height=800,width=1100');
        if (!w) return;
        w.document.write(html);
        w.document.close();
        w.focus();
        setTimeout(() => { w.print(); w.close(); }, 400);
    };

    return (
        <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-9 text-xs" onClick={() => setIsPreviewOpen(true)}>
                <Eye className="h-3.5 w-3.5 mr-2" /> Print Preview
            </Button>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-9 text-xs" disabled={isExporting}>
                        {isExporting ? <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" /> : <FileDown className="h-3.5 w-3.5 mr-2" />}
                        Export <ChevronDown className="h-3 w-3 ml-1 opacity-70" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={handleExportExcel}><FileSpreadsheet className="h-4 w-4 mr-2 text-emerald-600" /> Excel (.xlsx)</DropdownMenuItem>
                    <DropdownMenuItem onSelect={handleExportPdf}><FileDown className="h-4 w-4 mr-2 text-red-600" /> PDF</DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>

            <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
                <DialogContent className="max-w-6xl w-[95vw] h-[90vh] flex flex-col p-0">
                    <DialogHeader className="p-5 border-b">
                        <div className="flex items-center justify-between">
                            <div>
                                <DialogTitle>{title} - Preview</DialogTitle>
                                <DialogDescription>Landscape A4 · print or save to PDF</DialogDescription>
                            </div>
                            <Button variant="ghost" size="icon" onClick={() => setIsPreviewOpen(false)}><X className="h-4 w-4" /></Button>
                        </div>
                    </DialogHeader>

                    <ScrollArea className="flex-1 bg-muted/20 p-6">
                        <div className="w-[277mm] mx-auto bg-white shadow-xl p-10 min-h-[190mm] text-black">
                            <div className="text-center border-b-2 border-neutral-800 pb-3 mb-4">
                                <h1 className="text-xl font-bold uppercase tracking-wide">{fleetProfile.nameEn}</h1>
                                {fleetProfile.nameNp && <p className="font-semibold text-sm">{fleetProfile.nameNp}</p>}
                                <p className="text-[0.6875rem] text-neutral-500">{fleetProfile.address}</p>
                                <p className="text-[0.6875rem] text-neutral-500">PAN: {fleetProfile.pan}</p>
                                <h2 className="mt-2 text-[0.8125rem] font-bold tracking-[2px]">{title.toUpperCase()}</h2>
                            </div>

                            <div className="flex justify-between mb-4 text-[0.625rem] text-neutral-500">
                                <p>{subtitle}</p>
                                <p>Generated: {format(new Date(), 'PPP p')}</p>
                            </div>

                            <table className="w-full border-collapse text-[0.625rem]">
                                <thead>
                                    <tr className="bg-neutral-100">
                                        {columns.map((c, i) => (
                                            <th key={i} className={cn('border border-neutral-300 p-1.5', c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : 'text-left')}>{c.header}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map((r, i) => (
                                        <tr key={i} className={i % 2 ? 'bg-neutral-50/60' : ''}>
                                            {columns.map((c, j) => (
                                                <td key={j} className={cn('border border-neutral-300 p-1.5', c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : 'text-left')}>{cellValue(r, c)}</td>
                                            ))}
                                        </tr>
                                    ))}
                                    {rows.length === 0 && (
                                        <tr><td colSpan={columns.length} className="border border-neutral-300 p-4 text-center text-neutral-400 italic">No records to display.</td></tr>
                                    )}
                                </tbody>
                            </table>

                            <div className="mt-8 pt-2 border-t border-dashed border-neutral-300 text-center text-[0.5625rem] text-neutral-400">
                                <p>System-generated statement for {fleetProfile.nameEn}. No signature required.</p>
                            </div>
                        </div>
                        <ScrollBar orientation="horizontal" />
                    </ScrollArea>

                    <DialogFooter className="p-5 border-t bg-muted/10">
                        <div className="flex w-full justify-between items-center">
                            <Button variant="outline" onClick={handleExportPdf} disabled={isExporting}>
                                {isExporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileDown className="mr-2 h-4 w-4 text-red-600" />}
                                Save as PDF
                            </Button>
                            <div className="flex gap-2">
                                <Button variant="secondary" onClick={() => setIsPreviewOpen(false)}>Close</Button>
                                <Button onClick={handlePrint} className="px-6"><Printer className="mr-2 h-4 w-4" /> Print</Button>
                            </div>
                        </div>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
