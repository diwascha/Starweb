import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import type { Report, PurchaseOrder } from './types';

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

export const generateNextPONumber = (purchaseOrders: PurchaseOrder[]): string => {
    const poPrefix = 'PO-';
    let maxNumber = 0;

    purchaseOrders.forEach(po => {
        if(po && po.poNumber && po.poNumber.startsWith(poPrefix)) {
            const numPart = parseInt(po.poNumber.substring(poPrefix.length), 10);
            if(!isNaN(numPart) && numPart > maxNumber) {
                maxNumber = numPart;
            }
        }
    });
    
    const nextNumber = maxNumber + 1;
    return `${poPrefix}${nextNumber.toString().padStart(3, '0')}`;
};
