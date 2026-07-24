export type ExpenseType = 'Advance' | 'Maintenance' | 'Purchase' | 'Loan Repayment' | 'Membership Renewal' | 'Shivam / Others';

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
    paymentMode: 'Cash' | 'Bank' | 'Mixed' | 'Credit'; // Added Credit
    cashAmount?: number;
    bankAmount?: number;
    dueDate?: string | null; // Added for Credit terms
    remarks?: string | null;
    createdBy: string;
    createdAt: string; // ISO string
    lastModifiedBy?: string | null;
    lastModifiedAt?: string | null;
    ownership: string;
}
