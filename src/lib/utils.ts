
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { Report, PurchaseOrder, PurchaseOrderStatus, AttendanceStatus, Transaction, DocumentPrefixes, Trip, TdsCalculation, EstimatedInvoice, DocumentType, NumberingRule, Cheque, GsmReport, PaymentTrackerEntry } from './types';
import type { Expense } from './expense-types';
import NepaliDate from 'nepali-date-converter';
import { getSetting } from "@/services/settings-service";
import { format, parse } from 'date-fns';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const createTimestamp = () => new Date().toISOString();

export const generateId = (): string => {
  if (typeof window !== 'undefined' && window.crypto && window.crypto.randomUUID) {
    return window.crypto.randomUUID();
  }
  return Math.random().toString(36).substring(2, 11);
};

/**
 * Normalizes a URL path for consistent tracking and routing comparisons.
 * Trims whitespace, handles query params, ensures leading slash, and removes trailing slash.
 */
export const getNormalizedPath = (path: string | null | undefined): string => {
  if (!path) return '/';
  
  // Remove query strings and hashes
  let cleaned = path.split('?')[0].split('#')[0];
  
  // Clean whitespace and normalize slashes
  cleaned = cleaned.trim();
  
  // Collapse multiple slashes and ensure leading slash
  cleaned = '/' + cleaned.split('/').filter(Boolean).join('/');
  
  return cleaned === '' ? '/' : cleaned;
};

export const normalizeBF = (val: any): string => {
  if (val === undefined || val === null || val === '') return "";
  const trimmed = String(val).trim();
  if (/^\d+$/.test(trimmed)) {
    return `${trimmed} BF`;
  }
  const match = trimmed.match(/^(\d+)\s*bf$/i);
  if (match) {
    return `${match[1]} BF`;
  }
  return trimmed;
};

export const calculateNextSequence = (
  numbers: (string | undefined | null)[],
  prefix: string,
  startingAt: number = 1
): string => {
  let maxNumber = startingAt - 1;
  
  numbers.forEach(num => {
    if (num && typeof num === 'string' && num.startsWith(prefix)) {
      const numPart = parseInt(num.substring(prefix.length), 10);
      if (!isNaN(numPart) && numPart > maxNumber) {
        maxNumber = numPart;
      }
    }
  });
  
  const nextNumber = maxNumber + 1;
  return `${prefix}${nextNumber.toString().padStart(3, '0')}`;
};

/**
 * Standard rule-based numbering logic for ALL document types.
 */
/**
 * Which prefix and starting number apply to a document of this type on this
 * date. Split out so the on-screen preview and the atomic reservation at save
 * time resolve the SAME rule - otherwise a document could be previewed under
 * one fiscal year's prefix and reserved under another's.
 */
export const resolveNumberingRule = async (
  settingKey: DocumentType,
  defaultPrefix: string,
  documentDate?: string
): Promise<{ prefix: string; startNum: number }> => {
  const numberingSetting = await getSetting('documentPrefixes');
  const numberingConfig = (numberingSetting?.value as DocumentPrefixes) || {};
  const rawRules = numberingConfig[settingKey];

  const rules = Array.isArray(rawRules) ? rawRules : [];

  let matchedRule: NumberingRule | undefined;

  if (documentDate) {
    const docDate = new Date(documentDate);
    matchedRule = rules.find(r => {
        const from = new Date(r.effectiveFrom);
        const to = r.effectiveTo ? new Date(r.effectiveTo) : null;
        return docDate >= from && (!to || docDate <= to);
    });
  }

  // Fallback to active rule if no specific date rule found
  if (!matchedRule) {
    matchedRule = rules.find(r => r.status === 'Active');
  }

  return {
    prefix: matchedRule?.prefix || (typeof rawRules === 'string' ? rawRules : defaultPrefix),
    startNum: matchedRule?.startingNumber || 1,
  };
};

/**
 * Pull the document numbers out of a list of records.
 *
 * Voucher-style documents don't all keep their number in the same place -
 * fleet transactions in particular carry it as a referenceId, or only inside
 * the first line's narration. Both the preview (generateNextNumber) and the
 * atomic reservation must read them the same way, or the reservation would be
 * floored against an empty list and reissue a number that is already in use.
 */
export const extractNumbers = (
  items: any[],
  fieldName: string,
  settingKey: DocumentType
): (string | undefined | null)[] => {
  const isVoucherStyle = settingKey === 'paymentReceipt' || settingKey === 'tdsVoucher'
    || settingKey === 'chequeVoucher' || settingKey === 'gsmVoucher' || settingKey === 'paymentTracker';

  return items.map(item => {
    if (isVoucherStyle) {
      if ('voucherNo' in item) return item.voucherNo;
      if ('referenceId' in item) return item.referenceId;
      return (item as Transaction).items?.[0]?.particular?.replace(/ .*/, '');
    }
    return item[fieldName];
  });
};

/**
 * The number a form SHOWS while it is being filled in.
 *
 * This is a preview, not a reservation - it is computed from the caller's
 * local list and two people can see the same suggestion at once. The number
 * that actually goes on the document is reserved atomically at save time via
 * reserveNextNumber (services/number-reservation-service).
 */
export const generateNextNumber = async (
  items: any[],
  fieldName: string,
  settingKey: DocumentType,
  defaultPrefix: string,
  documentDate?: string
): Promise<string> => {
  const { prefix, startNum } = await resolveNumberingRule(settingKey, defaultPrefix, documentDate);

  return calculateNextSequence(extractNumbers(items, fieldName, settingKey), prefix, startNum);
};

export const generateNextSerialNumber = (reports: Pick<Report, 'serialNumber'>[], date?: string) =>
  generateNextNumber(reports, 'serialNumber', 'report', '2082-083-', date);

export const generateNextPONumber = (items: Pick<PurchaseOrder, 'poNumber'>[], date?: string) =>
  generateNextNumber(items, 'poNumber', 'purchaseOrder', 'SPI-', date);

export const generateNextPurchaseNumber = (items: Pick<Transaction, 'purchaseNumber'>[], date?: string) =>
  generateNextNumber(items, 'purchaseNumber', 'purchase', 'PUR-', date);

export const generateNextEstimateInvoiceNumber = (items: Pick<EstimatedInvoice, 'invoiceNumber'>[], date?: string) =>
  generateNextNumber(items, 'invoiceNumber', 'estimateInvoice', 'EST-', date);

export const generateNextSalesNumber = (items: Pick<Trip, 'tripNumber'>[], date?: string) =>
  generateNextNumber(items, 'tripNumber', 'sales', 'SALE-', date);

export const generateNextExpenseNumber = (items: Pick<Expense, 'voucherNo'>[], date?: string) =>
  generateNextNumber(items, 'voucherNo', 'expense', 'EXP-', date);

export const generateNextGsmNumber = (items: Pick<GsmReport, 'voucherNo'>[], date?: string) =>
  generateNextNumber(items, 'voucherNo', 'gsmVoucher', 'GSM-', date);

export const generateNextPaymentTrackerNumber = (items: Pick<PaymentTrackerEntry, 'voucherNo'>[], date?: string) =>
  generateNextNumber(items, 'voucherNo', 'paymentTracker', 'PT-', date);

export const generateNextVoucherNumber = async (items: (TdsCalculation | Transaction | Cheque)[], prefix: string): Promise<string> => {
    // Note: This is now a wrapper for the standardized generateNextNumber but maintains prefix compatibility
    const typeMap: Record<string, DocumentType> = {
        'PRV-': 'paymentReceipt',
        'TDS-': 'tdsVoucher',
        'PDC-': 'chequeVoucher'
    };
    const docType = typeMap[prefix] || 'paymentReceipt';
    return generateNextNumber(items, 'voucherNo', docType, prefix);
};

export const getStatusBadgeVariant = (status: PurchaseOrderStatus) => {
    switch (status) {
      case 'Ordered': return 'default';
      case 'Amended': return 'secondary';
      case 'Delivered': return 'outline';
      case 'Canceled': return 'destructive';
      default: return 'default';
    }
};

/**
 * Row highlight color for an attendance record, reproducing the VBA
 * workbook's HighlightRow calls exactly (same RGB values, same rule order):
 *   - Public Holiday: light green
 *   - Absent on a Saturday: yellow (Saturday's own color, not the red used
 *     for an absence on a working day)
 *   - Absent on a working day: red
 *   - Saturday (worked or not, when not absent): yellow
 *   - "Review Hours" flag on an otherwise-normal working day: dark orange
 *   - Everything else (Present, Leave, etc.): no highlight
 * Purely a display concern - reads already-calculated fields, never alters
 * the record or the calculation that produced it.
 */
export const getAttendanceRowHighlight = (record: { date: string; status: string; remarks?: string | null }): string | null => {
    const isSaturday = new Date(record.date).getDay() === 6;
    if (record.status === 'Public Holiday') return '#C6EFCE';
    if (record.status === 'Absent') return isSaturday ? '#FFFF99' : '#FFC7CE';
    if (record.status === 'Saturday') return '#FFFF99';
    if (record.remarks && record.remarks.includes('Review Hours')) return '#FF8C00';
    return null;
};


export const toNepaliDate = (isoDate: string): string => {
    try {
        const date = new Date(isoDate);
        if (isNaN(date.getTime())) return "Invalid Date";
        return new NepaliDate(date).format('YYYY/MM/DD');
    } catch (e) {
        return "Invalid Date";
    }
};

export const formatTimeForDisplay = (timeString: string | null | undefined): string => {
    if (!timeString) return '-';
    if (/^\d{2}:\d{2}:\d{2}$/.test(timeString)) return timeString;
    try {
        const date = new Date(timeString);
        if (!isNaN(date.getTime())) return format(date, 'HH:mm:ss');
    } catch {
        try {
            const parsed = parse(timeString, 'HH:mm', new Date());
            if (!isNaN(parsed.getTime())) return format(parsed, 'HH:mm:ss');
        } catch {
            return timeString;
        }
    }
    return timeString;
};

/**
 * An amount in words, in the Nepali/Indian numbering system.
 *
 * This is not a cosmetic field. It is printed on the cheque leaf itself, on
 * cheque and TDS vouchers, and on estimate invoices - and on a cheque the words
 * govern over the figures. Two defects here were writing the wrong amount:
 *
 *   - The thousands branch recursed on `n % 100` instead of `n % 1000`, which
 *     silently dropped the hundreds digit. Rs 1,500 printed as "One Thousand
 *     Only"; Rs 1,234 as "One Thousand Thirty Four Only".
 *   - A non-finite input matched none of the range comparisons (every
 *     comparison against NaN is false), fell through to the crore branch and
 *     recursed on NaN forever, taking the tab down with a stack overflow
 *     instead of printing a voucher.
 *
 * Amounts are resolved in paisa to keep the rounding honest: 99.999 has to
 * carry into "One Hundred", not produce "Ninety Nine and One Hundred Paisa".
 */
export const toWords = (num: number): string => {
    if (!Number.isFinite(num)) return '';

    const a = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
    const b = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

    const inWords = (n: number): string => {
        // Guard the recursion itself, not just the entry point.
        if (!Number.isFinite(n) || n <= 0) return '';
        n = Math.floor(n);
        if (n < 20) return a[n];
        if (n < 100) return `${b[Math.floor(n / 10)]} ${a[n % 10]}`.trim();
        if (n < 1000) return `${a[Math.floor(n / 100)]} hundred ${inWords(n % 100)}`.trim();
        if (n < 100000) return `${inWords(Math.floor(n / 1000))} thousand ${inWords(n % 1000)}`.trim();
        if (n < 10000000) return `${inWords(Math.floor(n / 100000))} lakh ${inWords(n % 100000)}`.trim();
        return `${inWords(Math.floor(n / 10000000))} crore ${inWords(n % 10000000)}`.trim();
    };

    // Work in paisa so the rupee/paisa split cannot disagree after rounding.
    const totalPaisa = Math.round(Math.abs(num) * 100);
    const whole = Math.floor(totalPaisa / 100);
    const paisa = totalPaisa % 100;

    if (totalPaisa === 0) return 'Zero Only.';

    let str = inWords(whole);
    if (paisa > 0) {
        if (str) str += ' and ';
        str += `${inWords(paisa)} paisa`;
    }
    if (!str) return 'Zero Only.';

    const words = str.split(' ').filter(Boolean)
        .map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ');

    // A negative amount is a correction or reversal; saying so beats printing
    // the absolute value as though it were a payment.
    return `${num < 0 ? 'Minus ' : ''}${words} Only.`;
};
