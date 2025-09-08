

import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import type { Report, PurchaseOrder, PurchaseOrderStatus, AttendanceStatus, User, Transaction, DocumentPrefixes, Trip } from './types';
import NepaliDate from 'nepali-date-converter';
import { getSetting } from "@/services/settings-service";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const generateNextSerialNumber = async (reports: Pick<Report, 'serialNumber'>[]): Promise<string> => {
  const prefixSetting = await getSetting('documentPrefixes');
  const prefixes = prefixSetting?.value as DocumentPrefixes || {};
  const serialPrefix = prefixes.report || '2082/083-';
  
  let maxNumber = 0;

  reports.forEach(report => {
    if (report && report.serialNumber && report.serialNumber.startsWith(serialPrefix)) {
      const numPart = parseInt(report.serialNumber.substring(serialPrefix.length), 10);
      if (!isNaN(numPart) && numPart > maxNumber) {
        maxNumber = numPart;
      }
    }
  });

  const nextNumber = maxNumber + 1;
  return `${serialPrefix}${nextNumber.toString().padStart(3, '0')}`;
};

export const generateNextPONumber = async (items: Pick<PurchaseOrder, 'poNumber'>[]): Promise<string> => {
    const prefixSetting = await getSetting('documentPrefixes');
    const prefixes = prefixSetting?.value as DocumentPrefixes || {};
    const poPrefix = prefixes.purchaseOrder || 'SPI-';
    
    let maxNumber = 0;

    items.forEach(item => {
        const numToCheck = item.poNumber;
        if(numToCheck && numToCheck.startsWith(poPrefix)) {
            const numPart = parseInt(numToCheck.substring(poPrefix.length), 10);
            if(!isNaN(numPart) && numPart > maxNumber) {
                maxNumber = numPart;
            }
        }
    });
    
    const nextNumber = maxNumber + 1;
    return `${poPrefix}${nextNumber.toString().padStart(3, '0')}`;
};

export const generateNextPurchaseNumber = async (items: Pick<Transaction, 'purchaseNumber'>[]): Promise<string> => {
    const prefixSetting = await getSetting('documentPrefixes');
    const prefixes = prefixSetting?.value as DocumentPrefixes || {};
    const purchasePrefix = prefixes.purchase || 'PUR-';
    
    let maxNumber = 0;

    items.forEach(item => {
        const numToCheck = item.purchaseNumber;
        if(numToCheck && numToCheck.startsWith(purchasePrefix)) {
            const numPart = parseInt(numToCheck.substring(purchasePrefix.length), 10);
            if(!isNaN(numPart) && numPart > maxNumber) {
                maxNumber = numPart;
            }
        }
    });
    
    const nextNumber = maxNumber + 1;
    return `${purchasePrefix}${nextNumber.toString().padStart(3, '0')}`;
};

export const generateNextSalesNumber = async (items: Pick<Trip, 'tripNumber'>[]): Promise<string> => {
    const prefixSetting = await getSetting('documentPrefixes');
    const prefixes = prefixSetting?.value as DocumentPrefixes || {};
    const salesPrefix = prefixes.sales || 'SALE-';
    
    let maxNumber = 0;

    items.forEach(item => {
        const numToCheck = item.tripNumber;
        if(numToCheck && numToCheck.startsWith(salesPrefix)) {
            const numPart = parseInt(numToCheck.substring(salesPrefix.length), 10);
            if(!isNaN(numPart) && numPart > maxNumber) {
                maxNumber = numPart;
            }
        }
    });
    
    const nextNumber = maxNumber + 1;
    return `${salesPrefix}${nextNumber.toString().padStart(3, '0')}`;
};

export const generateNextVoucherNumber = async (items: Pick<Transaction, 'items'>[]): Promise<string> => {
    const prefixSetting = await getSetting('documentPrefixes');
    const prefixes = prefixSetting?.value as DocumentPrefixes || {};
    const voucherPrefix = prefixes.paymentReceipt || 'VOU-';
    
    let maxNumber = 0;

    items.forEach(item => {
        const voucherNo = item.items?.[0]?.particular.replace(/ .*/,'');
        if(voucherNo && voucherNo.startsWith(voucherPrefix)) {
            const numPart = parseInt(voucherNo.substring(voucherPrefix.length), 10);
            if(!isNaN(numPart) && numPart > maxNumber) {
                maxNumber = numPart;
            }
        }
    });
    
    const nextNumber = maxNumber + 1;
    return `${voucherPrefix}${nextNumber.toString().padStart(3, '0')}`;
};


export const getStatusBadgeVariant = (status: PurchaseOrderStatus) => {
    switch (status) {
      case 'Ordered':
        return 'default';
      case 'Amended':
        return 'secondary';
      case 'Delivered':
        return 'outline';
      case 'Canceled':
        return 'destructive';
      default:
        return 'default';
    }
};

export const getAttendanceBadgeVariant = (status: AttendanceStatus) => {
    switch (status) {
        case 'Present': return 'outline';
        case 'Absent': return 'destructive';
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

    