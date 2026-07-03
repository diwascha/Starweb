export type ExpenseType = 'Advance' | 'Maintenance' | 'Purchase' | 'Loan Repayment' | 'Membership Renewal' | 'Shivam / Others';

export interface Expense {
    id: string;
    voucherNo: string; // Added for entry numbering
    date: string; // ISO string
    vehicleId: string;
    expenseType: ExpenseType;
    partyId?: string; // For Maintenance, Purchase, Membership
    accountId?: string; // For Loan Repayment and Bank payment mode
    itemId?: string; // Optional for Purchase
    destination?: string; // For Advance/Peski tracking
    amount: number;
    extraAmount?: number; // Added for combined payments (e.g. 5k peski + 1k maintenance)
    extraRemarks?: string; // Added to explain extra amounts
    paymentMode: 'Cash' | 'Bank' | 'Mixed'; // Support for split payments
    cashAmount?: number; // Amount paid in cash for Mixed mode
    bankAmount?: number; // Amount paid via bank for Mixed mode
    remarks?: string;
    createdBy: string;
    createdAt: string; // ISO string
}
