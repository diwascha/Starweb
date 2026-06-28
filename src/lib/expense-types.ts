
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
    paymentMode: 'Cash' | 'Bank';
    remarks?: string;
    createdBy: string;
    createdAt: string; // ISO string
}
