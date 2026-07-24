export type ExpenseType = 'Advance' | 'Maintenance' | 'Loan Repayment' | 'General Expense';

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
    paymentMode: 'Cash' | 'Bank' | 'Mixed';
    cashAmount?: number;
    bankAmount?: number;
    remarks?: string | null;
    createdBy: string;
    createdAt: string; // ISO string
    lastModifiedBy?: string | null;
    lastModifiedAt?: string | null;
    ownership: string;
}
