'use client';

import React, { useRef, useState } from 'react';
import type { CompanyProfile } from '@/lib/types';
import { 
    Dialog, 
    DialogContent, 
    DialogHeader, 
    DialogTitle, 
    DialogFooter,
    DialogDescription
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { Printer, FileDown, Loader2, X } from 'lucide-react';
import { toNepaliDate } from '@/lib/utils';
import { format } from 'date-fns';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface LedgerReportPreviewProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  ledgerData: {
    entries: any[];
    stats: any;
  };
  fleetProfile: CompanyProfile;
  filters: {
    period: string;
    parties: string;
    vehicles: string;
  };
}

export function LedgerReportPreview({ 
  isOpen, 
  onOpenChange, 
  ledgerData, 
  fleetProfile,
  filters
}: LedgerReportPreviewProps) {
  const printRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);

  const handlePrint = () => {
    const printableArea = printRef.current;
    if (!printableArea) return;

    const printWindow = window.open('', '', 'height=800,width=1000');
    if (!printWindow) return;

    printWindow.document.write('<html><head><title>Fleet Ledger Report</title>');
    printWindow.document.write('<style>');
    printWindow.document.write(`
        body { font-family: sans-serif; padding: 20px; color: black; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 10px; }
        th, td { border: 1px solid #ddd; padding: 6px; text-align: left; }
        th { background-color: #f5f5f5; font-weight: bold; }
        .text-right { text-align: right; }
        .text-center { text-align: center; }
        .font-bold { font-weight: bold; }
        .header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #333; padding-bottom: 10px; }
        .header h1 { margin: 0; font-size: 20px; text-transform: uppercase; }
        .header p { margin: 2px 0; font-size: 12px; color: #666; }
        .meta { display: grid; grid-template-cols: 1fr 1fr; gap: 20px; margin-bottom: 15px; font-size: 10px; }
        .meta-item b { color: #555; text-transform: uppercase; font-size: 9px; }
        .footer { margin-top: 40px; font-size: 9px; color: #888; text-align: center; border-top: 1px dashed #ccc; pt: 10px; }
        @media print {
            @page { size: A4 landscape; margin: 10mm; }
            body { padding: 0; }
        }
    `);
    printWindow.document.write('</style></head><body>');
    printWindow.document.write(printableArea.innerHTML);
    printWindow.document.write('</body></html>');
    printWindow.document.close();
    printWindow.focus();

    // Small delay to ensure styles are applied
    setTimeout(() => {
        printWindow.print();
        printWindow.close();
    }, 500);
  };

  const handleExportPdf = async () => {
    setIsExporting(true);
    try {
        const doc = new jsPDF('l', 'mm', 'a4');
        const width = doc.internal.pageSize.getWidth();

        // Professional Header
        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(18);
        doc.text(fleetProfile.nameEn.toUpperCase(), width / 2, 15, { align: 'center' });
        
        doc.setFont('Helvetica', 'normal');
        doc.setFontSize(10);
        doc.setTextColor(100);
        doc.text(`${fleetProfile.address} | PAN: ${fleetProfile.pan}`, width / 2, 21, { align: 'center' });
        
        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(14);
        doc.setTextColor(0);
        doc.text('FLEET TRANSACTION LEDGER', 14, 32);
        
        doc.setFontSize(9);
        doc.setTextColor(80);
        doc.text(`Period: ${filters.period}`, 14, 38);
        doc.text(`Parties: ${filters.parties}`, 14, 43);
        doc.text(`Vehicles: ${filters.vehicles}`, 14, 48);

        const body = [
            ['', '', 'Balance B/F (Opening)', '-', '-', '-', '-', `${Math.abs(ledgerData.stats.opening).toLocaleString(undefined, {minimumFractionDigits: 2})} ${ledgerData.stats.opening >= 0 ? 'Dr' : 'Cr'}`],
            ...ledgerData.entries.map(e => [
                toNepaliDate(e.date),
                e.refNo,
                `${e.remarks || e.type}\n${e.lineItemsSummary}`,
                e.vehicleName,
                e.categoryDisplay,
                e.debit ? e.debit.toLocaleString(undefined, {minimumFractionDigits: 2}) : '-',
                e.credit ? e.credit.toLocaleString(undefined, {minimumFractionDigits: 2}) : '-',
                `${Math.abs(e.balance).toLocaleString(undefined, {minimumFractionDigits: 2})} ${e.balance >= 0 ? 'Dr' : 'Cr'}`
            ])
        ];

        autoTable(doc, {
            startY: 55,
            head: [['Date (BS)', 'Ref No.', 'Particulars / Description', 'Vehicle', 'Category', 'Debit (Dr)', 'Credit (Cr)', 'Balance']],
            body: body,
            theme: 'grid',
            headStyles: { fillColor: [40, 40, 40], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
            styles: { fontSize: 7, cellPadding: 2 },
            columnStyles: {
                2: { cellWidth: 80 },
                5: { halign: 'right' },
                6: { halign: 'right' },
                7: { halign: 'right', fontStyle: 'bold' }
            },
            foot: [[
                { content: 'TOTAL PERIOD MOVEMENT', colSpan: 5, styles: { halign: 'right', fontStyle: 'bold' } },
                { content: ledgerData.stats.debit.toLocaleString(undefined, {minimumFractionDigits: 2}), styles: { halign: 'right', fontStyle: 'bold' } },
                { content: ledgerData.stats.credit.toLocaleString(undefined, {minimumFractionDigits: 2}), styles: { halign: 'right', fontStyle: 'bold' } },
                { content: `${Math.abs(ledgerData.stats.closing).toLocaleString(undefined, {minimumFractionDigits: 2})} ${ledgerData.stats.closing >= 0 ? 'Dr' : 'Cr'}`, styles: { halign: 'right', fontStyle: 'bold' } }
            ]],
            footStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0] }
        });

        doc.save(`Fleet_Ledger_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
    } catch (error) {
        console.error("PDF Export Error:", error);
    } finally {
        setIsExporting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl w-[95vw] h-[90vh] flex flex-col p-0">
        <DialogHeader className="p-6 border-b">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle>Ledger Report Preview</DialogTitle>
              <DialogDescription>Format: Landscape A4 Accounting Standard</DialogDescription>
            </div>
            <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)}>
                <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>

        <ScrollArea className="flex-1 bg-muted/20 p-8">
            <div ref={printRef} className="w-[277mm] mx-auto bg-white shadow-2xl p-12 min-h-[190mm]">
                <div className="header">
                    <h1>{fleetProfile.nameEn}</h1>
                    <p className="font-bold">{fleetProfile.nameNp}</p>
                    <p>{fleetProfile.address}</p>
                    <p>PAN: {fleetProfile.pan}</p>
                    <h2 style={{ marginTop: '15px', textDecoration: 'underline' }}>TRANSACTION LEDGER</h2>
                </div>

                <div className="meta">
                    <div className="meta-item">
                        <p><b>Period:</b> {filters.period}</p>
                        <p><b>Entities:</b> {filters.parties} | {filters.vehicles}</p>
                    </div>
                    <div className="meta-item text-right">
                        <p><b>Generated:</b> {format(new Date(), 'PPP p')}</p>
                    </div>
                </div>

                <table>
                    <thead>
                        <tr>
                            <th>Date (BS)</th>
                            <th>Ref No.</th>
                            <th>Particulars / Description</th>
                            <th>Vehicle</th>
                            <th>Category</th>
                            <th className="text-right">Debit (Dr)</th>
                            <th className="text-right">Credit (Cr)</th>
                            <th className="text-right">Balance</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr className="font-bold bg-muted/5">
                            <td colSpan={2}></td>
                            <td>Balance B/F (Opening)</td>
                            <td className="text-center">-</td>
                            <td className="text-center">-</td>
                            <td className="text-right">-</td>
                            <td className="text-right">-</td>
                            <td className="text-right">
                                {Math.abs(ledgerData.stats.opening).toLocaleString(undefined, {minimumFractionDigits: 2})} {ledgerData.stats.opening >= 0 ? 'Dr' : 'Cr'}
                            </td>
                        </tr>
                        {ledgerData.entries.map((e, i) => (
                            <tr key={i}>
                                <td>{toNepaliDate(e.date)}</td>
                                <td className="font-mono">{e.refNo}</td>
                                <td>
                                    <div className="font-bold">{e.remarks || e.type}</div>
                                    <div style={{ fontSize: '8px', color: '#666', fontStyle: 'italic' }}>{e.lineItemsSummary}</div>
                                </td>
                                <td>{e.vehicleName}</td>
                                <td className="text-center">{e.categoryDisplay}</td>
                                <td className="text-right">{e.debit ? e.debit.toLocaleString(undefined, {minimumFractionDigits: 2}) : '-'}</td>
                                <td className="text-right">{e.credit ? e.credit.toLocaleString(undefined, {minimumFractionDigits: 2}) : '-'}</td>
                                <td className="text-right font-bold">
                                    {Math.abs(e.balance).toLocaleString(undefined, {minimumFractionDigits: 2})} {e.balance >= 0 ? 'Dr' : 'Cr'}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                    <tfoot>
                        <tr className="font-bold" style={{ backgroundColor: '#f9f9f9' }}>
                            <td colSpan={5} className="text-right">TOTAL PERIOD MOVEMENT</td>
                            <td className="text-right">{ledgerData.stats.debit.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                            <td className="text-right">{ledgerData.stats.credit.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                            <td className="text-right">
                                {Math.abs(ledgerData.stats.closing).toLocaleString(undefined, {minimumFractionDigits: 2})} {ledgerData.stats.closing >= 0 ? 'Dr' : 'Cr'}
                            </td>
                        </tr>
                    </tfoot>
                </table>

                <div className="footer">
                    <p>This is a system-generated statement for {fleetProfile.nameEn}. No signature is required.</p>
                </div>
            </div>
            <ScrollBar orientation="horizontal" />
        </ScrollArea>

        <DialogFooter className="p-6 border-t bg-muted/10">
            <div className="flex w-full justify-between items-center">
                <Button variant="outline" onClick={handleExportPdf} disabled={isExporting}>
                    {isExporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileDown className="mr-2 h-4 w-4 text-red-600" />}
                    Save as PDF
                </Button>
                <div className="flex gap-2">
                    <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button onClick={handlePrint} className="px-8">
                        <Printer className="mr-2 h-4 w-4" /> Print Ledger
                    </Button>
                </div>
            </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
