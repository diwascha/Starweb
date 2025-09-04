
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import type { Report, PurchaseOrder, PurchaseOrderStatus, AttendanceStatus } from './types';
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

const ADMIN_CREDS_KEY = 'admin_credentials';

const defaultAdminCreds = { 
  username: 'Administrator', 
  password: 'Admin@123',
  passwordLastUpdated: new Date().toISOString(),
};

export const getAdminCredentials = (): { username: string, password?: string, passwordLastUpdated?: string } => {
  if (typeof window === 'undefined') {
    return defaultAdminCreds;
  }
  const storedCreds = localStorage.getItem(ADMIN_CREDS_KEY);
  if (storedCreds) {
    try {
      const parsed = JSON.parse(storedCreds);
      // Ensure passwordLastUpdated exists
      if (!parsed.passwordLastUpdated) {
        parsed.passwordLastUpdated = new Date().toISOString();
        localStorage.setItem(ADMIN_CREDS_KEY, JSON.stringify(parsed));
      }
      return parsed;
    } catch {
      // Fallback if parsing fails
      localStorage.setItem(ADMIN_CREDS_KEY, JSON.stringify(defaultAdminCreds));
      return defaultAdminCreds;
    }
  }
  localStorage.setItem(ADMIN_CREDS_KEY, JSON.stringify(defaultAdminCreds));
  return defaultAdminCreds;
};

export const setAdminPassword = (newPassword: string, passwordLastUpdated: string): void => {
  if (typeof window !== 'undefined') {
    const creds = getAdminCredentials();
    creds.password = newPassword;
    creds.passwordLastUpdated = passwordLastUpdated;
    localStorage.setItem(ADMIN_CREDS_KEY, JSON.stringify(creds));
  }
};

export const validatePassword = (password: string, isRequired: boolean = true): { isValid: boolean, error?: string } => {
    if (!isRequired && !password) {
        return { isValid: true };
    }

    if (isRequired && !password) {
        return { isValid: false, error: 'Password is required.' };
    }

    if (password.length < 8) {
        return { isValid: false, error: 'Password must be at least 8 characters long.' };
    }
    if (!/[a-z]/.test(password)) {
        return { isValid: false, error: 'Password must contain a lowercase letter.' };
    }
    if (!/[A-Z]/.test(password)) {
        return { isValid: false, error: 'Password must contain an uppercase letter.' };
    }
    if (!/[0-9]/.test(password)) {
        return { isValid: false, error: 'Password must contain a number.' };
    }
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
        return { isValid: false, error: 'Password must contain a special character.' };
    }
    return { isValid: true };
}

    
