/**
 * @fileOverview The cheque payment voucher PDF.
 *
 * Was html2canvas at scale 2 embedded as a JPEG - a ~295 KB picture of the
 * voucher, in which not one cheque number or figure could be selected,
 * searched or copied. Setting jsPDF's `compress` does nothing for a JPEG,
 * which is already compressed, so the only real fix was to stop rasterising.
 *
 * Mirrors ChequeView section for section: letterhead, boxed PAYMENT VOUCHER
 * with number and date, the meta strip, the instrument schedule, amount in
 * words, remarks, and two signature blocks.
 */

import { toNepaliDate, toWords } from './utils';
import { drawPdfLetterhead } from './pdf-letterhead';
import type { CompanyProfile } from './types';

const money = (n: number) =>
    (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export interface ChequeVoucherPdfInput {
    voucherNo: string;
    voucherDate: Date;
    payeeName: string;
    payeeAddress?: string;
    payeePan?: string;
    remarks?: string;
    account?: { type?: string; bankName?: string; accountNumber?: string } | null;
    splits: { chequeNumber?: string; chequeDate: Date; amount: number | string }[];
}

export const buildChequeVoucherPdf = async (
    v: ChequeVoucherPdfInput,
    companyProfile: CompanyProfile
) => {
    const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
        import('jspdf'),
        import('jspdf-autotable'),
    ]);

    const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4', compress: true });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const M = 16;
    const right = pageWidth - M;
    const RULE = 205;
    const SUB = 130;

    const isBank = !!v.account && v.account.type === 'Bank';
    const total = v.splits.reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
    const nepaliDate = toNepaliDate(v.voucherDate.toISOString());
    const adDate = v.voucherDate.toLocaleDateString('en-CA');

    // Letterhead left, boxed voucher label right - as on screen.
    const boxW = 42, boxH = 7;
    doc.setDrawColor(RULE);
    doc.setLineWidth(0.3);
    doc.rect(right - boxW, 15, boxW, boxH);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(20);
    doc.text('PAYMENT VOUCHER', right - boxW / 2, 19.8, { align: 'center' });
    doc.setFont('courier', 'bold');
    doc.setFontSize(11);
    doc.text(`#${v.voucherNo}`, right, 28, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(SUB);
    doc.text(`${nepaliDate} BS · ${adDate}`, right, 32.5, { align: 'right' });

    let y = drawPdfLetterhead(doc, companyProfile, {
        x: M, y: 20, align: 'left', nameSize: 12, detailSize: 8,
    });

    y = Math.max(y, 34) + 5;
    doc.setDrawColor(RULE);
    doc.setLineWidth(0.3);
    doc.line(M, y, right, y);

    // Meta strip
    y += 7;
    const field = (label: string, value: string, x: number, width: number) => {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.2);
        doc.setTextColor(SUB);
        doc.text(label.toUpperCase(), x, y);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(20);
        doc.text(doc.splitTextToSize(value || '-', width), x, y + 4.5);
    };

    const colW = (pageWidth - M * 2) / 4;
    field('Paid to', v.payeeName, M, colW * 2 - 6);
    let sub = y + 9;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(110);
    if (v.payeeAddress) { doc.text(v.payeeAddress, M, sub); sub += 3.6; }
    if (v.payeePan) { doc.text(`PAN: ${v.payeePan}`, M, sub); sub += 3.6; }

    field('Payment mode', isBank ? 'Bank / Cheque' : 'Cash', M + colW * 2, colW - 6);
    field('Instruments', `${v.splits.length} cheque${v.splits.length === 1 ? '' : 's'}`, M + colW * 3, colW - 6);

    y = Math.max(sub, y + 12) + 4;
    if (isBank) {
        field('Drawee bank', v.account!.bankName || '-', M, colW * 2 - 6);
        field('Account number', v.account!.accountNumber || '-', M + colW * 2, colW - 6);
        y += 11;
    }
    field('Voucher date (BS)', nepaliDate, M, colW - 6);
    field('Voucher date (AD)', adDate, M + colW, colW - 6);
    y += 10;

    doc.setDrawColor(RULE);
    doc.line(M, y, right, y);

    // Instrument schedule
    y += 8;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(SUB);
    doc.text('INSTRUMENT SCHEDULE', M, y);
    doc.setTextColor(20);

    autoTable(doc, {
        startY: y + 2.5,
        head: [['#', 'Cheque no.', 'Cheque date (BS)', 'Cheque date (AD)', 'Amount (NPR)']],
        body: v.splits.map((s, i) => [
            String(i + 1).padStart(2, '0'),
            s.chequeNumber || '—',
            toNepaliDate(s.chequeDate.toISOString()),
            s.chequeDate.toLocaleDateString('en-CA'),
            money(Number(s.amount)),
        ]),
        foot: [[
            { content: 'TOTAL PAYABLE', colSpan: 4, styles: { halign: 'right' as const } },
            `Rs. ${money(total)}`,
        ]],
        theme: 'plain',
        styles: { fontSize: 8.5, cellPadding: { top: 1.8, bottom: 1.8, left: 2, right: 2 }, textColor: 20 },
        headStyles: {
            fontStyle: 'bold', fontSize: 6.5, textColor: 20, fillColor: false as any,
            lineWidth: { top: 0.3, bottom: 0.3 }, lineColor: [RULE, RULE, RULE],
        },
        bodyStyles: { lineWidth: { bottom: 0.2 }, lineColor: [RULE, RULE, RULE] },
        footStyles: {
            fontStyle: 'bold', fontSize: 10, textColor: 20, fillColor: false as any,
            lineWidth: { bottom: 0.6 }, lineColor: [RULE, RULE, RULE],
        },
        columnStyles: {
            0: { cellWidth: 12, textColor: SUB },
            1: { fontStyle: 'bold' },
            4: { cellWidth: 34, halign: 'right', fontStyle: 'bold' },
        },
        margin: { left: M, right: M },
    });

    y = ((doc as any).lastAutoTable?.finalY || y) + 9;

    // Amount in words, with the view's left rule
    doc.setDrawColor(RULE);
    doc.setLineWidth(1);
    const wordsText = doc.splitTextToSize(toWords(total), pageWidth - M * 2 - 8);
    const wordsH = 6 + wordsText.length * 4;
    doc.line(M, y, M, y + wordsH);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.2);
    doc.setTextColor(SUB);
    doc.text('AMOUNT IN WORDS', M + 3, y + 4);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(20);
    doc.text(wordsText, M + 3, y + 9);
    y += wordsH + 6;

    if (v.remarks) {
        doc.setDrawColor(RULE);
        doc.setLineWidth(0.3);
        doc.line(M, y, right, y);
        y += 5;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.2);
        doc.setTextColor(SUB);
        doc.text('REMARKS / NOTES', M, y);
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(8);
        doc.setTextColor(20);
        const rem = doc.splitTextToSize(v.remarks, pageWidth - M * 2);
        doc.text(rem, M, y + 4.5);
        y += 4.5 + rem.length * 4 + 4;
    }

    // Signatures, pinned near the foot as the view's 26mm gap intends
    const sigY = Math.min(Math.max(y + 26, pageHeight - 42), pageHeight - 28);
    const sigW = (pageWidth - M * 2 - 30) / 2;
    ["Receiver's signature", 'Authorised signature'].forEach((label, i) => {
        const x = M + i * (sigW + 30);
        doc.setDrawColor(RULE);
        doc.setLineWidth(0.3);
        doc.line(x, sigY, x + sigW, sigY);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.5);
        doc.setTextColor(20);
        doc.text(label.toUpperCase(), x + sigW / 2, sigY + 4, { align: 'center' });
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6);
        doc.setTextColor(SUB);
        doc.text('Name / Date', x + sigW / 2, sigY + 8, { align: 'center' });
    });

    return doc;
};

export const exportChequeVoucherPdf = async (
    v: ChequeVoucherPdfInput,
    companyProfile: CompanyProfile
) => {
    const doc = await buildChequeVoucherPdf(v, companyProfile);
    doc.save(`Voucher-${v.voucherNo || 'draft'}.pdf`);
};
