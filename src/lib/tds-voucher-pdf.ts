/**
 * @fileOverview The TDS voucher PDF.
 *
 * There were two export buttons producing two different documents from the
 * same record. The history tab exported five rows (voucher, party, base,
 * TDS, net); the calculator dialog exported two (voucher, net). Neither
 * carried a letterhead, neither showed VAT or the rate, and neither
 * resembled the TdsVoucherView rendered on screen - the history one even
 * started its table at y=50mm, leaving a blank band where a header should
 * have been.
 *
 * One function now draws the voucher, mirroring what the screen shows:
 * letterhead, voucher/party/date block, the taxable -> VAT -> TDS -> net
 * breakdown, and the amount in words.
 */

import { toNepaliDate, toWords } from './utils';
import { drawPdfLetterhead } from './pdf-letterhead';
import type { CompanyProfile, TdsCalculation } from './types';

const money = (n: number) =>
    (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const buildTdsVoucherPdf = async (
    calculation: TdsCalculation,
    companyProfile: CompanyProfile
) => {
    const { default: jsPDF } = await import('jspdf');

    // A5 portrait, as both old exports used - it is a half-page voucher.
    // compress: true because the letterhead carries the Nepali name as an
    // image (see lib/devanagari-pdf).
    const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a5', compress: true });
    const pageWidth = doc.internal.pageSize.getWidth();
    const M = 12;
    const right = pageWidth - M;
    const mid = pageWidth / 2;

    let y = drawPdfLetterhead(doc, companyProfile, {
        x: mid, y: 16, align: 'center',
        nameSize: 11, detailSize: 7.5, nepaliHeightMm: 3.8, showPan: false,
    });

    y += 8;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(20);
    doc.text('TDS ESTIMATE VOUCHER', mid, y, { align: 'center' });
    doc.setLineWidth(0.4);
    doc.line(mid - 26, y + 1.4, mid + 26, y + 1.4);

    // Voucher / party / date block
    y += 9;
    doc.setFontSize(8);
    const label = (t: string, x: number, align: 'left' | 'right' = 'left') => {
        doc.setFont('helvetica', 'bold');
        doc.text(t, align === 'right' ? right : x, y, { align });
    };
    doc.setFont('helvetica', 'bold');
    doc.text('Voucher No: ', M, y);
    const vwidth = doc.getTextWidth('Voucher No: ');
    doc.setFont('helvetica', 'normal');
    doc.text(calculation.voucherNo || '-', M + vwidth, y);

    doc.setFont('helvetica', 'bold');
    const dateText = `${toNepaliDate(calculation.date)} (${new Date(calculation.date).toLocaleDateString('en-CA')})`;
    doc.text('Date: ', right - doc.getTextWidth(dateText) - doc.getTextWidth('Date: '), y);
    doc.setFont('helvetica', 'normal');
    doc.text(dateText, right, y, { align: 'right' });

    y += 5;
    doc.setFont('helvetica', 'bold');
    doc.text('Party Name: ', M, y);
    const pwidth = doc.getTextWidth('Party Name: ');
    doc.setFont('helvetica', 'normal');
    doc.text(calculation.partyName || '-', M + pwidth, y);

    y += 3.5;
    doc.setDrawColor(200);
    doc.setLineWidth(0.2);
    doc.line(M, y, right, y);

    // The money breakdown, in the same order the screen shows it.
    y += 7;
    const row = (labelText: string, value: string, opts: { bold?: boolean; size?: number; rule?: boolean } = {}) => {
        const { bold = false, size = 9, rule = false } = opts;
        doc.setFont('helvetica', bold ? 'bold' : 'normal');
        doc.setFontSize(size);
        doc.text(labelText, M + 2, y);
        doc.text(value, right - 2, y, { align: 'right' });
        y += size * 0.62;
        if (rule) {
            doc.setDrawColor(210);
            doc.setLineWidth(0.2);
            doc.line(M, y - 2.6, right, y - 2.6);
            y += 1.2;
        }
    };

    row('Taxable Amount', money(calculation.taxableAmount));
    if (calculation.vatAmount > 0) row('VAT (13%)', `+ ${money(calculation.vatAmount)}`);
    row('Total with VAT', money(calculation.taxableAmount + calculation.vatAmount), { bold: true, rule: true });
    row(`TDS (${calculation.tdsRate}%)`, `- ${money(calculation.tdsAmount)}`, { rule: true });

    y += 1.5;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Net Payable Amount', M + 2, y);
    doc.text(`NPR ${money(calculation.netPayable)}`, right - 2, y, { align: 'right' });

    y += 8;
    doc.setDrawColor(200);
    doc.setLineWidth(0.2);
    doc.line(M, y - 4, right, y - 4);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.text('In Words:', M, y);
    doc.setFont('helvetica', 'normal');
    const words = doc.splitTextToSize(toWords(calculation.netPayable), pageWidth - M * 2 - 16);
    doc.text(words, M + 16, y);

    return doc;
};

/** Build and download the voucher. */
export const exportTdsVoucherPdf = async (
    calculation: TdsCalculation,
    companyProfile: CompanyProfile
) => {
    const doc = await buildTdsVoucherPdf(calculation, companyProfile);
    doc.save(`TDS-Voucher-${calculation.voucherNo || 'draft'}.pdf`);
};
