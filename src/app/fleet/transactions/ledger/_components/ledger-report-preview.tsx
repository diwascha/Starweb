'use client';

import React, { useState } from 'react';
import type { CompanyProfile } from '@/lib/types';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Printer, FileDown, Loader2, X } from 'lucide-react';
import { toNepaliDate } from '@/lib/utils';
import { format } from 'date-fns';

interface LedgerData {
    entries: any[]; // display order: latest first
    stats: { opening: number; debit: number; credit: number; net: number; closing: number; count: number };
}

interface LedgerReportPreviewProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    ledgerData: LedgerData;
    fleetProfile: CompanyProfile;
    filters: { period: string; parties: string; vehicles: string; paymentModes?: string };
}

const money = (n: number) => Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2 });
const drcr = (n: number) => (n >= 0 ? 'Dr' : 'Cr');

export function LedgerReportPreview({ isOpen, onOpenChange, ledgerData, fleetProfile, filters }: LedgerReportPreviewProps) {
    const [isExporting, setIsExporting] = useState(false);

    // Preview + print + export all read oldest-first.
    const chronological = [...ledgerData.entries].reverse();

    const handleExportPdf = async () => {
        setIsExporting(true);
        try {
            const { jsPDF } = await import('jspdf');
            const { default: autoTable } = await import('jspdf-autotable');
            const doc = new jsPDF('l', 'mm', 'a4');
            const width = doc.internal.pageSize.getWidth();
            const nowStr = format(new Date(), 'PPP p');

            doc.setFont('helvetica', 'bold'); doc.setFontSize(16);
            doc.text(fleetProfile.nameEn.toUpperCase(), width / 2, 14, { align: 'center' });
            doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(110);
            doc.text(`${fleetProfile.address}  |  PAN: ${fleetProfile.pan}`, width / 2, 20, { align: 'center' });
            doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(20);
            doc.text('FLEET TRANSACTION LEDGER', 14, 30);
            doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(90);
            let y = 36;
            doc.text(`Period: ${filters.period}`, 14, y); y += 4.5;
            doc.text(`Parties: ${filters.parties}`, 14, y); y += 4.5;
            doc.text(`Vehicles: ${filters.vehicles}`, 14, y); y += 4.5;
            if (filters.paymentModes) { doc.text(`Modes: ${filters.paymentModes}`, 14, y); y += 4.5; }
            doc.text(`Generated: ${nowStr}`, 14, y); y += 4;

            autoTable(doc, {
                startY: y + 2,
                head: [['Date (BS)', 'Ref No.', 'Particulars / Description', 'Vehicle', 'Category', 'Debit', 'Credit', 'Balance']],
                body: [
                    ['', '', 'Balance B/F (Opening)', '-', '-', '-', '-', `${money(ledgerData.stats.opening)} ${drcr(ledgerData.stats.opening)}`],
                    ...chronological.map(e => [
                        toNepaliDate(e.date), e.refNo,
                        `${e.remarks || e.type}${e.lineItemsSummary ? `\n${e.lineItemsSummary}` : ''}`,
                        e.vehicleName, e.categoryDisplay,
                        e.debit ? money(e.debit) : '-', e.credit ? money(e.credit) : '-',
                        `${money(e.balance)} ${drcr(e.balance)}`,
                    ]),
                ],
                foot: [[
                    { content: 'Total period movement', colSpan: 5, styles: { halign: 'right', fontStyle: 'bold' } },
                    { content: money(ledgerData.stats.debit), styles: { halign: 'right', fontStyle: 'bold' } },
                    { content: money(ledgerData.stats.credit), styles: { halign: 'right', fontStyle: 'bold' } },
                    { content: `${money(ledgerData.stats.closing)} ${drcr(ledgerData.stats.closing)}`, styles: { halign: 'right', fontStyle: 'bold' } },
                ]],
                theme: 'grid',
                headStyles: { fillColor: [33, 37, 41], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
                bodyStyles: { fontSize: 7, textColor: [20, 20, 20] },
                footStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0] },
                alternateRowStyles: { fillColor: [248, 249, 250] },
                columnStyles: { 2: { cellWidth: 78 }, 5: { halign: 'right' }, 6: { halign: 'right' }, 7: { halign: 'right', fontStyle: 'bold' } },
            });
            doc.save(`Fleet_Ledger_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
        } catch (error) {
            console.error('PDF export failed:', error);
        } finally {
            setIsExporting(false);
        }
    };

    const handlePrint = () => {
        const rows = chronological.map(e => `
            <tr>
                <td>${toNepaliDate(e.date)}</td>
                <td class="mono">${e.refNo}</td>
                <td><div class="b">${e.remarks || e.type}</div>${e.lineItemsSummary ? `<div class="sub">${e.lineItemsSummary}</div>` : ''}</td>
                <td>${e.vehicleName}</td>
                <td class="center">${e.categoryDisplay}</td>
                <td class="right">${e.debit ? money(e.debit) : '-'}</td>
                <td class="right">${e.credit ? money(e.credit) : '-'}</td>
                <td class="right b">${money(e.balance)} ${drcr(e.balance)}</td>
            </tr>`).join('');

        const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Fleet Ledger</title>
        <style>
            * { box-sizing: border-box; }
            body { font-family: system-ui, -apple-system, sans-serif; padding: 16px; color: #111; margin: 0; }
            .head { text-align: center; border-bottom: 2px solid #222; padding-bottom: 12px; margin-bottom: 14px; }
            .head h1 { margin: 0; font-size: 20px; text-transform: uppercase; letter-spacing: .5px; }
            .head .np { font-weight: 600; margin: 2px 0; }
            .head p { margin: 1px 0; font-size: 11px; color: #666; }
            .head h2 { margin: 10px 0 0; font-size: 13px; letter-spacing: 2px; }
            .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 14px; font-size: 10px; }
            .meta .r { text-align: right; }
            .meta b { color: #555; text-transform: uppercase; font-size: 9px; letter-spacing: .5px; }
            table { width: 100%; border-collapse: collapse; font-size: 10px; }
            th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; vertical-align: top; }
            th { background: #f4f5f6; font-weight: 700; font-size: 9px; text-transform: uppercase; letter-spacing: .4px; }
            tbody tr:nth-child(even) { background: #fafbfc; }
            .right { text-align: right; }
            .center { text-align: center; }
            .b { font-weight: 700; }
            .mono { font-family: ui-monospace, monospace; }
            .sub { font-size: 8px; color: #777; font-style: italic; margin-top: 2px; }
            tfoot td { background: #f4f5f6; font-weight: 700; }
            .foot { margin-top: 28px; font-size: 9px; color: #888; text-align: center; border-top: 1px dashed #ccc; padding-top: 8px; }
            @media print { @page { size: A4 landscape; margin: 10mm; } body { padding: 0; } }
        </style></head><body>
            <div class="head">
                <h1>${fleetProfile.nameEn}</h1>
                ${fleetProfile.nameNp ? `<div class="np">${fleetProfile.nameNp}</div>` : ''}
                <p>${fleetProfile.address}</p>
                <p>PAN: ${fleetProfile.pan}</p>
                <h2>TRANSACTION LEDGER</h2>
            </div>
            <div class="meta">
                <div>
                    <p><b>Period:</b> ${filters.period}</p>
                    <p><b>Entities:</b> ${filters.parties} | ${filters.vehicles}</p>
                    ${filters.paymentModes ? `<p><b>Payment Modes:</b> ${filters.paymentModes}</p>` : ''}
                </div>
                <div class="r"><p><b>Generated:</b> ${format(new Date(), 'PPP p')}</p></div>
            </div>
            <table>
                <thead>
                    <tr>
                        <th>Date (BS)</th><th>Ref No.</th><th>Particulars / Description</th><th>Vehicle</th>
                        <th>Category</th><th class="right">Debit</th><th class="right">Credit</th><th class="right">Balance</th>
                    </tr>
                </thead>
                <tbody>
                    <tr class="b">
                        <td colspan="2"></td><td>Balance B/F (Opening)</td><td class="center">-</td><td class="center">-</td>
                        <td class="right">-</td><td class="right">-</td>
                        <td class="right">${money(ledgerData.stats.opening)} ${drcr(ledgerData.stats.opening)}</td>
                    </tr>
                    ${rows}
                </tbody>
                <tfoot>
                    <tr>
                        <td colspan="5" class="right">Total period movement</td>
                        <td class="right">${money(ledgerData.stats.debit)}</td>
                        <td class="right">${money(ledgerData.stats.credit)}</td>
                        <td class="right">${money(ledgerData.stats.closing)} ${drcr(ledgerData.stats.closing)}</td>
                    </tr>
                </tfoot>
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
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-6xl w-[95vw] h-[90vh] flex flex-col p-0">
                <DialogHeader className="p-5 border-b">
                    <div className="flex items-center justify-between">
                        <div>
                            <DialogTitle>Ledger preview</DialogTitle>
                            <DialogDescription>Landscape A4 · print or save to PDF</DialogDescription>
                        </div>
                        <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)}><X className="h-4 w-4" /></Button>
                    </div>
                </DialogHeader>

                <ScrollArea className="flex-1 bg-muted/20 p-6">
                    <div className="w-[277mm] mx-auto bg-white shadow-xl p-10 min-h-[190mm] text-black">
                        <div className="text-center border-b-2 border-neutral-800 pb-3 mb-4">
                            <h1 className="text-xl font-bold uppercase tracking-wide">{fleetProfile.nameEn}</h1>
                            {fleetProfile.nameNp && <p className="font-semibold text-sm">{fleetProfile.nameNp}</p>}
                            <p className="text-[11px] text-neutral-500">{fleetProfile.address}</p>
                            <p className="text-[11px] text-neutral-500">PAN: {fleetProfile.pan}</p>
                            <h2 className="mt-2 text-[13px] font-bold tracking-[2px]">TRANSACTION LEDGER</h2>
                        </div>

                        <div className="grid grid-cols-2 gap-4 mb-4 text-[10px]">
                            <div className="space-y-0.5">
                                <p><span className="font-bold uppercase text-[9px] text-neutral-500">Period:</span> {filters.period}</p>
                                <p><span className="font-bold uppercase text-[9px] text-neutral-500">Entities:</span> {filters.parties} | {filters.vehicles}</p>
                                {filters.paymentModes && <p><span className="font-bold uppercase text-[9px] text-neutral-500">Payment modes:</span> {filters.paymentModes}</p>}
                            </div>
                            <div className="text-right">
                                <p><span className="font-bold uppercase text-[9px] text-neutral-500">Generated:</span> {format(new Date(), 'PPP p')}</p>
                            </div>
                        </div>

                        <table className="w-full border-collapse text-[10px]">
                            <thead>
                                <tr className="bg-neutral-100">
                                    <th className="border border-neutral-300 p-1.5 text-left">Date (BS)</th>
                                    <th className="border border-neutral-300 p-1.5 text-left">Ref no.</th>
                                    <th className="border border-neutral-300 p-1.5 text-left">Particulars / Description</th>
                                    <th className="border border-neutral-300 p-1.5 text-left">Vehicle</th>
                                    <th className="border border-neutral-300 p-1.5 text-left">Category</th>
                                    <th className="border border-neutral-300 p-1.5 text-right">Debit</th>
                                    <th className="border border-neutral-300 p-1.5 text-right">Credit</th>
                                    <th className="border border-neutral-300 p-1.5 text-right">Balance</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr className="font-bold bg-neutral-50">
                                    <td className="border border-neutral-300 p-1.5" colSpan={2} />
                                    <td className="border border-neutral-300 p-1.5">Balance B/F (Opening)</td>
                                    <td className="border border-neutral-300 p-1.5 text-center">-</td>
                                    <td className="border border-neutral-300 p-1.5 text-center">-</td>
                                    <td className="border border-neutral-300 p-1.5 text-right">-</td>
                                    <td className="border border-neutral-300 p-1.5 text-right">-</td>
                                    <td className="border border-neutral-300 p-1.5 text-right">{money(ledgerData.stats.opening)} {drcr(ledgerData.stats.opening)}</td>
                                </tr>
                                {chronological.map((e, i) => (
                                    <tr key={e.rowKey || i} className={i % 2 ? 'bg-neutral-50/60' : ''}>
                                        <td className="border border-neutral-300 p-1.5 whitespace-nowrap">{toNepaliDate(e.date)}</td>
                                        <td className="border border-neutral-300 p-1.5 font-mono">{e.refNo}</td>
                                        <td className="border border-neutral-300 p-1.5">
                                            <div className="font-bold">{e.remarks || e.type}</div>
                                            {e.lineItemsSummary && <div className="text-[8px] text-neutral-500 italic">{e.lineItemsSummary}</div>}
                                        </td>
                                        <td className="border border-neutral-300 p-1.5">{e.vehicleName}</td>
                                        <td className="border border-neutral-300 p-1.5 text-center">{e.categoryDisplay}</td>
                                        <td className="border border-neutral-300 p-1.5 text-right">{e.debit ? money(e.debit) : '-'}</td>
                                        <td className="border border-neutral-300 p-1.5 text-right">{e.credit ? money(e.credit) : '-'}</td>
                                        <td className="border border-neutral-300 p-1.5 text-right font-bold">{money(e.balance)} {drcr(e.balance)}</td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr className="font-bold bg-neutral-100">
                                    <td className="border border-neutral-300 p-1.5 text-right" colSpan={5}>TOTAL PERIOD MOVEMENT</td>
                                    <td className="border border-neutral-300 p-1.5 text-right">{money(ledgerData.stats.debit)}</td>
                                    <td className="border border-neutral-300 p-1.5 text-right">{money(ledgerData.stats.credit)}</td>
                                    <td className="border border-neutral-300 p-1.5 text-right">{money(ledgerData.stats.closing)} {drcr(ledgerData.stats.closing)}</td>
                                </tr>
                            </tfoot>
                        </table>

                        <div className="mt-8 pt-2 border-t border-dashed border-neutral-300 text-center text-[9px] text-neutral-400">
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
                            <Button variant="secondary" onClick={() => onOpenChange(false)}>Close</Button>
                            <Button onClick={handlePrint} className="px-6"><Printer className="mr-2 h-4 w-4" /> Print</Button>
                        </div>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}