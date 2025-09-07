
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import type { Report, PurchaseOrder, PurchaseOrderStatus, AttendanceStatus, User, Transaction } from './types';
import NepaliDate from 'nepali-date-converter';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const generateNextSerialNumber = (reports: Report[]): string => {
  const serialPrefix = '2082/083-';
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

export const generateNextPONumber = (items: { poNumber?: string | null; purchaseNumber?: string | null }[]): string => {
    const poPrefix = 'SPI-';
    let maxNumber = 0;

    items.forEach(item => {
        const numToCheck = item.poNumber || item.purchaseNumber;
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
        case 'Saturday': return 'secondary';
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
