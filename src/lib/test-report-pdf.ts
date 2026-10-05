/**
 * @fileOverview The quality test report as a vector PDF (text and a real
 * table), replacing the html2canvas screenshot: sharp at any zoom, searchable,
 * and a fraction of the size. Same letterhead as every other document.
 */

import { toNepaliDate } from './utils';
import { drawPdfLetterhead } from './pdf-letterhead';
import { formatParameterLabel, testParameterKeys } from '@/services/report-service';
import type { CompanyProfile, Report, ProductSpecification } from './types';

export const buildTestReportPdf = async (report: Report, companyProfile: CompanyProfile) => {
    const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
        import('jspdf'),
        import('jspdf-autotable'),
    ]);

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
    const isCoc = report.kind === 'coc';
    const title = isCoc ? 'Certificate of Conformance' : 'Quality Test Report';
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(20);
    doc.text(title, mid, y, { align: 'center' });
    const titleWidth = doc.getTextWidth(title);
    doc.setLineWidth(0.4);
    doc.line(mid - titleWidth / 2, y + 1.5, mid + titleWidth / 2, y + 1.5);

    y += 5;
    doc.setDrawColor(20);
    doc.setLineWidth(0.6);
    doc.line(M, y, right, y);

    // Header fields, as on the paper format: Date / Deliver To / Invoice No /
    // Challan No / Supplied Quantity / Name of Item.
    const p = report.product || ({} as Report['product']);
    const field = (label: string, value: string, x: number, yy: number, align: 'left' | 'right' = 'left') => {
        doc.setFontSize(9.5);
        doc.setTextColor(20);
        doc.setFont('helvetica', 'bold');
        const text = `${label}: `;
        if (align === 'right') {
            doc.setFont('helvetica', 'normal');
            const vw = doc.getTextWidth(value || '-');
            doc.text(value || '-', x, yy, { align: 'right' });
            doc.setFont('helvetica', 'bold');
            doc.text(text, x - vw, yy, { align: 'right' });
        } else {
            doc.text(text, x, yy);
            const lw = doc.getTextWidth(text);
            doc.setFont('helvetica', 'normal');
            doc.text(value || '-', x + lw, yy);
        }
    };
    y += 8;
    field('Deliver To', p.partyName || '-', M, y);
    field('Date', toNepaliDate(report.date), right, y, 'right');
    y += 6.5;
    field('Invoice No', report.taxInvoiceNumber || '-', M, y);
    field('Report No', report.serialNumber, right, y, 'right');
    y += 6.5;
    field('Challan No', report.challanNumber || '-', M, y);
    y += 6.5;
    field('Supplied Quantity', report.quantity || '-', M, y);
    y += 6.5;
    field('Name of Item', p.name || '-', M, y);
    y += 6;

    // Ordered like the paper format; any extra saved keys follow.
    const testData = (report.testData || {}) as Record<string, any>;
    const ordered = testParameterKeys(p.specification).filter(k => k in testData);
    const keys = [...ordered, ...Object.keys(testData).filter(k => !ordered.includes(k))];
    const specOf = (key: string) => String(p.specification?.[key as keyof ProductSpecification] ?? '') || '-';
    const tableStyle = {
        theme: 'grid' as const,
        styles: { fontSize: 9.5, cellPadding: 2.2, lineColor: [20, 20, 20] as [number, number, number], lineWidth: 0.2, textColor: 20, valign: 'middle' as const },
        headStyles: { fillColor: [235, 235, 235] as [number, number, number], textColor: 20, fontStyle: 'bold' as const },
        margin: { left: M, right: M },
    };
    if (isCoc) {
        // Specification only: a certificate makes no claim of measured results.
        autoTable(doc, {
            ...tableStyle,
            startY: y,
            head: [['Particular', 'Specification']],
            body: keys.map(key => [formatParameterLabel(key), specOf(key)]),
            columnStyles: { 0: { cellWidth: 70, fontStyle: 'bold' }, 1: { halign: 'center' } },
        });
    } else {
        autoTable(doc, {
            ...tableStyle,
            startY: y,
            head: [['Particular', 'Specification', 'Result', 'Remarks']],
            body: keys.map(key => {
                const t = testData[key];
                const mark = t?.result === 'Low' || t?.result === 'High' ? t.result : '';
                return [formatParameterLabel(key), specOf(key), t?.value || '-', [mark, t?.remark || ''].filter(Boolean).join(' - ')];
            }),
            columnStyles: {
                0: { cellWidth: 45, fontStyle: 'bold' },
                1: { cellWidth: 42, halign: 'center' },
                2: { cellWidth: 42, halign: 'center', fontStyle: 'bold' },
            },
        });
    }

    if (isCoc) {
        const after = ((doc as any).lastAutoTable?.finalY || y) + 8;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9.5);
        doc.setTextColor(20);
        doc.text(
            doc.splitTextToSize(`We certify that the goods supplied against the above invoice and challan are manufactured to the specification stated above.`, pageWidth - M * 2),
            M, after
        );
        (doc as any).lastAutoTable.finalY = after + 6;
    }

    y = ((doc as any).lastAutoTable?.finalY || y) + 30;
    if (y > pageHeight - 15) { doc.addPage(); y = 40; }

    // Signatures, as on the paper format.
    doc.setDrawColor(120);
    doc.setLineWidth(0.2);
    doc.line(M, y, M + 55, y);
    doc.line(right - 55, y, right, y);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(20);
    doc.text('Prepared by', M, y + 4.5);
    doc.text('Approved by', right, y + 4.5, { align: 'right' });

    return doc;
};

export const exportTestReportPdf = async (report: Report, companyProfile: CompanyProfile) => {
    const doc = await buildTestReportPdf(report, companyProfile);
    doc.save(`QT-Report-${report.serialNumber || 'draft'}.pdf`);
};
