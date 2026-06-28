export type ExpenseType = 'Advance' | 'Maintenance' | 'Purchase' | 'Loan Repayment' | 'Membership Renewal';

export interface Expense {
    id: string;
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
    paymentMode: 'Cash' | 'Bank';
    remarks?: string;
    createdBy: string;
    createdAt: string; // ISO string
}
