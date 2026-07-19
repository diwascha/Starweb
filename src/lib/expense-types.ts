export type ExpenseType = 'Advance' | 'Maintenance' | 'Purchase' | 'Loan Repayment' | 'Membership Renewal' | 'Shivam / Others';

export interface Expense {
    id: string;
    voucherNo: string; // Added for entry numbering
    date: string; // ISO string
    vehicleId: string;
    expenseType: ExpenseType;
    partyId?: string | null; // For Maintenance, Purchase, Membership
    accountId?: string | null; // For Loan Repayment and Bank payment mode
    itemId?: string | null; // Optional for Purchase
    destination?: string | null; // For Advance/Peski tracking
    amount: number;
    extraAmount?: number; // Added for combined payments (e.g. 5k peski + 1k maintenance)
    extraRemarks?: string | null; // Added to explain extra amounts
    paymentMode: 'Cash' | 'Bank' | 'Mixed'; // Support for split payments
    cashAmount?: number; // Amount paid in cash for Mixed mode
    bankAmount?: number; // Amount paid via bank for Mixed mode
    remarks?: string | null;
    createdBy: string;
    createdAt: string; // ISO string
    lastModifiedBy?: string | null;
    lastModifiedAt?: string | null;
    ownership: string;
}
