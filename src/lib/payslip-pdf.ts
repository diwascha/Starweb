import type { CompanyProfile, Employee, Payroll } from './types';
import { drawPdfLetterhead } from './pdf-letterhead';

/**
 * Payslip figures and vector PDF rendering.
 *
 * Two things live here so they can't drift apart:
 *
 *  1. `computePayslipFigures` - the one place the derived salary numbers are
 *     worked out. The on-screen slip and the PDF both call it, so a printed
 *     payslip can never disagree with the one the user was looking at.
 *
 *  2. `drawPayslip` - draws a slip with real jsPDF text and vector rules.
 *     Both the single-payslip download and the bulk generator use it.
 *
 * Why vector: these exports used to rasterise the slip with html2canvas and
 * embed the bitmap. Even after being switched from lossless PNG to JPEG,
 * that still produces a picture of a payslip - text that can't be selected,
 * searched or copied, blurs when zoomed, and costs hundreds of kilobytes a
 * page. The bulk generator additionally had to mount each slip off-screen in
 * React and wait for layout before capturing it, which is why a large run
 * took so long. Drawing the text directly removes all of that.
 */

/**
 * Matches PR_RoundNet from the payroll VBA module: floors to whole rupees,
 * then rounds the units digit to the nearest 5 (e.g. 15003 -> 15000,
 * 15004 -> 15005, 15008 -> 15010). Only used as a fallback when a record
 * has no stored roundedNet - historical/imported net figures are never
 * recomputed.
 */
export const roundNetToFive = (net: number): number => {
  if (net <= 0) return net;
  const baseInt = Math.floor(net);
  let d = baseInt % 10;
  if (d < 0) d += 10;
  if (d <= 3) return baseInt - d;
  if (d < 8) return baseInt - d + 5;
  return baseInt - d + 10;
};

export interface PayslipFigures {
  basic: number; allowance: number; ot: number; bonus: number;
  tds: number; advance: number;
  grossSalary: number; totalDeductions: number; netSalary: number;
  monthDays: number; leaveDays: number; extraDays: number; presentDays: number;
}

export const computePayslipFigures = (payroll?: Payroll | null): PayslipFigures => {
  const basic = payroll?.regularPay ?? 0;
  const allowance = payroll?.allowance ?? 0;
  const ot = payroll?.otPay ?? 0;
  const bonus = payroll?.bonus ?? 0;
  const tds = payroll?.tds ?? 0;
  const advance = payroll?.advance ?? 0;

  // salaryTotal/netPayment/roundedNet are 0 on historical rows that were
  // never fully computed (0 is never a legitimate real value for a worked
  // month), so `||` deliberately falls through to the derived formula
  // instead of trusting a stored zero the way `??` would.
  const grossSalary = payroll?.salaryTotal || (basic + allowance + ot + bonus - tds);
  const totalDeductions = tds + advance;
  const netSalary = payroll?.roundedNet || roundNetToFive(payroll?.netPayment || (grossSalary - advance));

  const leaveDays = payroll?.leaveDays ?? 0;
  const extraDays = payroll?.extraDays ?? 0;
  const presentDays = payroll?.presentDays ?? 0;

  return {
    basic, allowance, ot, bonus, tds, advance,
    grossSalary, totalDeductions, netSalary,
    monthDays: presentDays + extraDays + leaveDays,
    leaveDays, extraDays, presentDays,
  };
};

export const fmtAmount = (n: number) =>
  (n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Height one slip occupies, so callers can lay two out on a page. */
export const PAYSLIP_HEIGHT_MM = 128;

/**
 * Draw one payslip at `top`, in the same layout as the on-screen slip.
 * Returns the Y coordinate just past the slip.
 */
export const drawPayslip = (
  doc: any,
  opts: {
    employee: Employee;
    payroll: Payroll;
    bsYear: number;
    bsMonthName: string;
    companyProfile: CompanyProfile;
    label: string;
  },
  top: number,
  left = 10,
  width = 190
): number => {
  const { employee, payroll, bsYear, bsMonthName, companyProfile, label } = opts;
  const f = computePayslipFigures(payroll);
  const right = left + width;
  const mid = left + width / 2;
  let y = top;

  const line = (x1: number, y1: number, x2: number, y2: number, w = 0.2) => {
    doc.setLineWidth(w); doc.line(x1, y1, x2, y2);
  };
  const text = (s: string, x: number, yy: number, align: 'left' | 'center' | 'right' = 'left') =>
    doc.text(String(s ?? ''), x, yy, { align });

  doc.setTextColor(0);
  doc.setDrawColor(0);

  // Outer frame
  doc.setLineWidth(0.5);
  doc.rect(left, top, width, PAYSLIP_HEIGHT_MM);

  // Copy label
  y += 4.5;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5);
  doc.setTextColor(110);
  text(`[ ${label} ]`, left + 2, y);
  doc.setTextColor(0);

  // Company header. The name goes through the shared letterhead so the
  // Nepali line appears here exactly as it does on a purchase order or a
  // quotation; the address lines below are payslip-specific.
  y += 5;
  y = drawPdfLetterhead(doc, { ...companyProfile, nameEn: companyProfile.nameEn || 'YOUR COMPANY NAME HERE' }, {
    x: mid, y, align: 'center',
    nameSize: 11, nepaliHeightMm: 3.8,
    showAddress: false, showPan: false,
  });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5);
  [companyProfile.address, companyProfile.addressLine2, companyProfile.phone]
    .filter(Boolean)
    .forEach(l => { y += 3.5; text(l as string, mid, y, 'center'); });

  const notes = [companyProfile.headerNote1, companyProfile.headerNote2].filter(Boolean).join('   ');
  if (notes) { y += 3.5; doc.setFont('helvetica', 'italic'); doc.setFontSize(7); text(notes, mid, y, 'center'); }

  y += 2.5; line(left, y, right, y, 0.3);

  // Title
  y += 5.5;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
  text('Salary Slip', mid, y, 'center');
  y += 2; line(left, y, right, y, 0.3);
  y += 4;
  doc.setFont('helvetica', 'italic'); doc.setFontSize(7.5);
  text(`For the Month of: ${bsMonthName}, ${bsYear} (BS)`, mid, y, 'center');

  // Employee / attendance block
  y += 4;
  const infoTop = y;
  doc.setFontSize(7.5);
  const pair = (lbl: string, val: string, x: number, yy: number, align: 'left' | 'right') => {
    doc.setFont('helvetica', 'bold');
    if (align === 'left') {
      text(`${lbl} :`, x, yy);
      const w = doc.getTextWidth(`${lbl} : `);
      doc.setFont('helvetica', 'normal');
      text(val, x + w, yy);
    } else {
      doc.setFont('helvetica', 'normal');
      const vw = doc.getTextWidth(String(val ?? ''));
      text(val, x, yy, 'right');
      doc.setFont('helvetica', 'bold');
      text(`${lbl} :`, x - vw - 1, yy, 'right');
    }
  };

  const leftRows: [string, string][] = [
    ['Staff Name', employee.name],
    ['Department', employee.department || '-'],
    ['Designation', employee.position || '-'],
    ['Contact', employee.mobileNumber || '-'],
  ];
  const rightRows: [string, string][] = [
    ['Month Days', String(f.monthDays)],
    ['Leave Days', String(f.leaveDays)],
    ['Extra Days', String(f.extraDays)],
    ['Present Days', String(f.presentDays)],
  ];
  leftRows.forEach(([l, v], i) => pair(l, v, left + 2, infoTop + i * 3.6, 'left'));
  rightRows.forEach(([l, v], i) => pair(l, v, right - 2, infoTop + i * 3.6, 'right'));

  y = infoTop + leftRows.length * 3.6;
  line(left, y, right, y, 0.3);

  // Earning / Deduction columns
  const tableTop = y;
  const colW = width / 2;
  const rowH = 4.4;
  const headH = 4.8;

  const drawColumn = (x: number, title: string, rows: [string, number][], totalLabel: string, totalValue: number) => {
    let cy = tableTop;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
    cy += headH; text(title, x + colW / 2, cy - 1.3, 'center');
    line(x, cy, x + colW, cy, 0.3);

    doc.setFontSize(7.5);
    cy += headH; text('Head', x + 2, cy - 1.3); text('Rs.', x + colW - 2, cy - 1.3, 'right');
    line(x, cy, x + colW, cy, 0.3);

    doc.setFont('helvetica', 'normal');
    rows.forEach(([lbl, amt]) => {
      cy += rowH;
      text(lbl, x + 2, cy - 1.3);
      text(fmtAmount(amt), x + colW - 2, cy - 1.3, 'right');
      doc.setDrawColor(190); line(x, cy, x + colW, cy, 0.1); doc.setDrawColor(0);
    });

    // Pad both columns to the same depth - Earning has four rows, Deduction
    // two, and the totals must still line up across the pair.
    return cy;
  };

  const earnRows: [string, number][] = [['Basic', f.basic], ['Allowance', f.allowance], ['OT', f.ot], ['Bonus', f.bonus]];
  const dedRows: [string, number][] = [['Professional Tax / TDS', f.tds], ['Advance', f.advance]];

  drawColumn(left, 'Earning', earnRows, 'Gross Salary', f.grossSalary);
  drawColumn(mid, 'Deduction', dedRows, 'Deductions', f.totalDeductions);

  const bodyBottom = tableTop + headH * 2 + Math.max(earnRows.length, dedRows.length) * rowH;

  // Totals row, shared baseline for both columns
  const totalTop = bodyBottom;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
  doc.setFillColor(238, 238, 238);
  doc.rect(left, totalTop, width, 5.5, 'F');
  doc.rect(left, totalTop, width, 5.5);
  text('Gross Salary', left + 2, totalTop + 3.8);
  text(fmtAmount(f.grossSalary), mid - 2, totalTop + 3.8, 'right');
  text('Deductions', mid + 2, totalTop + 3.8);
  text(fmtAmount(f.totalDeductions), right - 2, totalTop + 3.8, 'right');

  // Column separator + outer box for the two columns
  doc.setLineWidth(0.4);
  doc.rect(left, tableTop, width, bodyBottom - tableTop);
  doc.line(mid, tableTop, mid, bodyBottom);
  doc.line(mid, totalTop, mid, totalTop + 5.5);

  // Net salary bar
  const netTop = totalTop + 5.5;
  doc.setFillColor(219, 219, 219);
  doc.rect(left, netTop, width, 7, 'F');
  doc.setLineWidth(0.5); doc.rect(left, netTop, width, 7);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
  text('Net Salary', left + 2, netTop + 4.8);
  text(fmtAmount(f.netSalary), right - 2, netTop + 4.8, 'right');

  // Signatures
  const sigY = netTop + 20;
  const sigW = (width - 12) / 3;
  doc.setFontSize(7.5);
  [
    [companyProfile.preparedBy, 'Prepared by'],
    [companyProfile.checkedBy, 'Checked by'],
    [companyProfile.authorisedBy, 'Authorised by'],
  ].forEach(([name, role], i) => {
    const x = left + 3 + i * (sigW + 3);
    doc.setFont('helvetica', 'normal');
    if (name) text(name as string, x, sigY - 1.5);
    doc.setDrawColor(0); line(x, sigY, x + sigW, sigY, 0.2);
    doc.setFont('helvetica', 'bold');
    text(role as string, x + sigW, sigY + 3.5, 'right');
  });

  // Footer notes
  const footNotes = [companyProfile.footerNote1, companyProfile.footerNote2].filter(Boolean) as string[];
  if (footNotes.length) {
    let fy = top + PAYSLIP_HEIGHT_MM - 3 - (footNotes.length - 1) * 3;
    line(left, fy - 3.5, right, fy - 3.5, 0.2);
    doc.setFont('helvetica', 'italic'); doc.setFontSize(6.5);
    footNotes.forEach(n => { text(n, left + 2, fy); fy += 3; });
  }

  return top + PAYSLIP_HEIGHT_MM;
};

/** Both copies of one employee's slip, laid out on a single A4 page. */
export const drawPayslipPage = (
  doc: any,
  opts: { employee: Employee; payroll: Payroll; bsYear: number; bsMonthName: string; companyProfile: CompanyProfile }
) => {
  drawPayslip(doc, { ...opts, label: 'Employee Copy' }, 10);
  drawPayslip(doc, { ...opts, label: 'Employer Copy' }, 10 + PAYSLIP_HEIGHT_MM + 8);
};
