import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import type { Report, PurchaseOrder, PurchaseOrderStatus, AttendanceStatus, User, Transaction, DocumentPrefixes, Trip, TdsCalculation, EstimatedInvoice, DocumentType, NumberingRule } from './types';
import type { Expense } from './expense-types';
import NepaliDate from 'nepali-date-converter';
import { getSetting } from "@/services/settings-service";
import { format, parse } from 'date-fns';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const createTimestamp = () => new Date().toISOString();

export const getDirectImageUrl = (url: string | undefined | null): string => {
    if (!url) return '';
    
    let processed = url.trim();

    if (processed.includes('drive.google.com')) {
        const match = processed.match(/\/d\/(.+?)\/(view|edit|preview)/) || processed.match(/id=(.+?)(&|$)/);
        if (match && match[1]) {
            return `https://drive.google.com/uc?export=view&id=${match[1]}`;
        }
    }

    if (processed.includes('dropbox.com')) {
        return processed.replace('www.dropbox.com', 'dl.dropboxusercontent.com').replace(/\?dl=0$/, '');
    }

    return processed;
};

export const generateId = (): string => {
  if (typeof window !== 'undefined' && window.crypto && window.crypto.randomUUID) {
    return window.crypto.randomUUID();
  }
  return Math.random().toString(36).substring(2, 11);
};

export const getNormalizedPath = (path: string): string => {
  if (!path) return '/';
  return path.replace(/\/$/, '') || '/';
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

export const generateNextNumber = async (
  items: any[],
  fieldName: string,
  settingKey: DocumentType,
  defaultPrefix: string,
  documentDate?: string
): Promise<string> => {
  const numberingSetting = await getSetting('documentPrefixes');
  const numberingConfig = numberingSetting?.value as DocumentPrefixes || {};
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
  
  const prefix = matchedRule?.prefix || (typeof rawRules === 'string' ? rawRules : defaultPrefix);
  const startNum = matchedRule?.startingNumber || 1;
  
  const numberStrings = items.map(item => item[fieldName]);
  return calculateNextSequence(numberStrings, prefix, startNum);
};

export const generateNextSerialNumber = (reports: Pick<Report, 'serialNumber'>[], date?: string) =>
  generateNextNumber(reports, 'serialNumber', 'report', '2082/083-', date);

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

export const generateNextVoucherNumber = async (items: (TdsCalculation | Transaction | Cheque)[], prefix: string): Promise<string> => {
    const numberStrings = items.map(item => {
        if ('voucherNo' in item) return item.voucherNo;
        if ('referenceId' in item) return item.referenceId;
        return (item as Transaction).items?.[0]?.particular?.replace(/ .*/, '');
    });
    
    return calculateNextSequence(numberStrings, prefix);
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

export const getAttendanceBadgeVariant = (status: AttendanceStatus) => {
    switch (status) {
        case 'Present': return 'outline';
        case 'Absent': return 'destructive';
        case 'C/I Miss': return 'secondary';
        case 'C/O Miss': return 'secondary';
        case 'Saturday': return 'default';
        case 'Public Holiday': return 'default';
        default: return 'secondary';
    }
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

export const toWords = (num: number): string => {
    if (num === 0) return 'Zero Only.';
    
    const a = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
    const b = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
    
    const inWords = (n: number): string => {
        if (n === 0) return '';
        if (n < 20) return a[n];
        if (n < 100) {
            return `${b[Math.floor(n/10)]} ${a[n % 10]}`.trim();
        }
        if (n < 1000) {
            return `${a[Math.floor(n/100)]} hundred ${inWords(n % 100)}`.trim();
        }
        if (n < 100000) {
            return `${inWords(Math.floor(n/1000))} thousand ${inWords(n % 100)}`.trim();
        }
        if (n < 10000000) {
            return `${inWords(Math.floor(n/100000))} lakh ${inWords(n % 100000)}`.trim();
        }
        return `${inWords(Math.floor(n/10000000))} crore ${inWords(n % 10000000)}`.trim();
    }
    
    const whole = Math.floor(Math.abs(num));
    const decimal = Math.round((Math.abs(num) - whole) * 100);
    
    let str = inWords(whole);
    if (decimal > 0) {
        if (str) str += ' and ';
        str += inWords(decimal) + ' paisa';
    }
    
    if (!str) return 'Zero Only.';

    return str.split(' ').filter(s => s !== '').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ') + ' Only.';
};
