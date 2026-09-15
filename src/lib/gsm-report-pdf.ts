/**
 * @fileOverview The GSM verification report PDF.
 *
 * This was a screenshot: html2canvas at scale 2, embedded as a JPEG. That
 * gave a ~295 KB picture of a report whose every figure a supplier might
 * want to select, search or copy, and which blurs the moment anyone zooms.
 * Enabling jsPDF's stream compression does not help a JPEG - it is already
 * compressed - so the only real fix is to stop rasterising.
 *
 * Drawn as text and a real table, the same report is around 20 KB.
 */

import { toNepaliDate } from './utils';
import { drawPdfLetterhead } from './pdf-letterhead';
import type { CompanyProfile, GsmReport } from './types';

export const buildGsmReportPdf = async (
    report: GsmReport,
    companyProfile: CompanyProfile
) => {
    const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
        import('jspdf'),
        import('jspdf-autotable'),
    ]);

    // compress: true for the content streams - the letterhead's Nepali line
    // is an image (see lib/devanagari-pdf).
    const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4', compress: true });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const M = 16;
    const right = pageWidth - M;
    const mid = pageWidth / 2;

    let y = drawPdfLetterhead(doc, companyProfile, {
        x: mid, y: 20, align: 'center', nameSize: 15, detailSize: 9, showPan: false,
    });

    y += 9;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(20);
    doc.text('GSM QUALITY VERIFICATION REPORT', mid, y, { align: 'center' });
    const titleWidth = doc.getTextWidth('GSM QUALITY VERIFICATION REPORT');
    doc.setLineWidth(0.4);
    doc.line(mid - titleWidth / 2, y + 1.5, mid + titleWidth / 2, y + 1.5);

    y += 5;
    doc.setDrawColor(20);
    doc.setLineWidth(0.6);
    doc.line(M, y, right, y);

    // Report / supplier on the left, dates on the right - as on screen.
    y += 8;
    const caption = (text: string, x: number, align: 'left' | 'right' = 'left') => {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.8);
        doc.setTextColor(150);
        doc.text(text.toUpperCase(), x, y, { align });
    };
    const value = (text: string, x: number, size: number, align: 'left' | 'right' = 'left') => {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(size);
        doc.setTextColor(20);
        doc.text(text || '-', x, y + 5, { align });
    };

    caption('Report No', M);
    caption('Date (BS)', right, 'right');
    value(report.voucherNo || '-', M, 12);
    value(toNepaliDate(report.date), right, 10, 'right');

    y += 11;
    caption('Supplier', M);
    caption('Date (AD)', right, 'right');
    value(report.vendorName || '-', M, 10);
    value(new Date(report.date).toLocaleDateString('en-CA'), right, 9, 'right');

    y += 12;

    autoTable(doc, {
        startY: y,
        head: [['S.N.', 'Reel / Batch ID', 'Weight (g)', 'Size (mm/in)', 'Result (GSM)']],
        body: (report.entries || []).map((e: any, i: number) => [
            i + 1,
            (e.reelNumber || 'N/A').toString().toUpperCase(),
            e.weight,
            `${e.length} x ${e.width} ${e.unit}`,
            Number(e.gsm || 0).toFixed(2),
        ]),
        theme: 'grid',
        styles: { fontSize: 8.5, cellPadding: 1.8, lineColor: [200, 200, 200], lineWidth: 0.1, textColor: 20 },
        headStyles: { fillColor: [240, 240, 240], textColor: 20, fontStyle: 'bold', fontSize: 7.5, lineColor: [20, 20, 20], lineWidth: 0.2 },
        columnStyles: {
            0: { cellWidth: 14, halign: 'center' },
            1: { fontStyle: 'bold' },
            2: { cellWidth: 26, halign: 'center' },
            3: { cellWidth: 38, halign: 'center' },
            4: { cellWidth: 30, halign: 'right', fontStyle: 'bold' },
        },
        margin: { left: M, right: M },
    });

    y = ((doc as any).lastAutoTable?.finalY || y) + 12;

    if (y > pageHeight - 40) { doc.addPage(); y = 24; }

    doc.setDrawColor(215);
    doc.setLineWidth(0.2);
    doc.setFillColor(250, 250, 250);
    doc.roundedRect(M, y, pageWidth - M * 2, 20, 1.5, 1.5, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.8);
    doc.setTextColor(150);
    doc.text('TECHNICAL STANDARDS', M + 4, y + 6);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8);
    doc.setTextColor(90);
    doc.text(
        doc.splitTextToSize(
            'Measurements performed using calibrated weighing scale and precision ruler. Formulas applied for standard grammage calculation.',
            pageWidth - M * 2 - 8
        ),
        M + 4, y + 11
    );
    doc.setTextColor(20);

    return doc;
};

export const exportGsmReportPdf = async (report: GsmReport, companyProfile: CompanyProfile) => {
    const doc = await buildGsmReportPdf(report, companyProfile);
    doc.save(`GSM-Report-${report.voucherNo || 'draft'}.pdf`);
};
