export type ExpenseType = 'Advance' | 'Maintenance' | 'Vendor Purchase' | 'Loan Repayment' | 'Purchase' | 'Membership Renewal' | 'Shivam / Others';

export interface Expense {
    id: string;
    voucherNo: string;
    date: string; // ISO string
    vehicleId: string;
    expenseType: ExpenseType;
    partyId?: string | null;
    accountId?: string | null;
    itemId?: string | null;
    destination?: string | null;
    amount: number;
    extraAmount?: number;
    extraRemarks?: string | null;
    paymentMode: 'Cash' | 'Bank' | 'Mixed' | 'Credit';
    cashAmount?: number;
    bankAmount?: number;
    dueDate?: string | null;
    invoiceNumber?: string | null;
    invoiceDate?: string | null;
    remarks?: string | null;
    createdBy: string;
    createdAt: string; // ISO string
    lastModifiedBy?: string | null;
    lastModifiedAt?: string | null;
    ownership: string;
}
