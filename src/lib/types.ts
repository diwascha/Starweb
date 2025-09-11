











export interface ProductSpecification {
  dimension: string;
  ply: string;
  weightOfBox: string;
  gsm: string;
  stapleWidth: string;
  stapling: string;
  overlapWidth: string;
  printing: string;
  moisture: string;
  load: string;
}

export interface Product {
  id: string;
  name: string;
  materialCode: string;
  companyName: string;
  address: string;
  specification: ProductSpecification;
  createdBy: string;
  createdAt: string; // ISO string
  lastModifiedBy?: string | null;
  lastModifiedAt?: string; // ISO string
}

export interface TestResult {
  value: string;
  remark?: string;
}

export type TestResultData = Record<keyof ProductSpecification, TestResult>;

export interface PrintLogEntry {
  date: string;
}

export interface Report {
  id:string;
  serialNumber: string;
  taxInvoiceNumber: string;
  challanNumber: string;
  quantity: string;
  product: Product;
  date: string; // This is the report date, not creation date
  createdAt: string; // ISO string for creation date
  testData: TestResultData;
  printLog?: PrintLogEntry[];
  createdBy: string;
  lastModifiedBy?: string | null;
  lastModifiedAt?: string; // ISO string
}

export interface RawMaterial {
  id: string;
  type: string;
  name: string;
  size: string;
  gsm: string;
  bf: string;
  units: string[];
  createdBy: string;
  createdAt: string; // ISO string
  lastModifiedBy?: string;
  lastModifiedAt?: string; // ISO string
}

export interface PurchaseOrderItem {
  rawMaterialId: string;
  rawMaterialName: string;
  rawMaterialType: string;
  size: string;
  gsm: string;
  bf: string;
  quantity: string;
  unit: string;
}

export interface Amendment {
  date: string; // ISO string
  remarks: string;
  amendedBy: string;
}

export type PurchaseOrderStatus = 'Ordered' | 'Amended' | 'Delivered' | 'Canceled';

export interface PurchaseOrder {
  id: string;
  poNumber: string;
  poDate: string; // ISO string
  createdAt: string; // ISO string
  updatedAt: string; // ISO string
  companyName: string;
  companyAddress: string;
  items: PurchaseOrderItem[];
  amendments?: Amendment[];
  status: PurchaseOrderStatus;
  deliveryDate?: string; // ISO string
  createdBy: string;
  lastModifiedBy?: string;
}

// --- HR Module Types ---
export type WageBasis = 'Monthly' | 'Hourly';
export type Gender = 'Male' | 'Female' | 'Other';
export type IdentityType = 'Citizenship' | 'Voters Card' | 'License';
export type EmployeeStatus = 'Working' | 'Long Leave' | 'Resigned' | 'Dismissed';
export type Department = 'Production' | 'Admin';
export type Position = 'Manager' | 'Supervisor' | 'Machine Operator' | 'Helpers';


export interface Employee {
  id: string;
  name: string;
  status: EmployeeStatus;
  department?: Department;
  position?: Position;
  wageBasis: WageBasis;
  wageAmount: number;
  allowance?: number;
  address?: string;
  gender?: Gender;
  mobileNumber?: string;
  dateOfBirth?: string; // ISO string
  joiningDate?: string; // ISO string
  identityType?: IdentityType;
  documentNumber?: string;
  referredBy?: string;
  photoURL?: string;
  createdBy: string;
  createdAt: string; // ISO string
  lastModifiedBy?: string;
  lastModifiedAt?: string; // ISO string
}

export type AttendanceStatus = 'Present' | 'Absent' | 'Public Holiday' | 'Saturday' | 'C/I Miss' | 'C/O Miss' | 'EXTRAOK';

export interface RawAttendanceRow {
    dateAD?: any; 
    bsDate?: any; 
    employeeName?: any;
    weekday?: any;
    onDuty?: any; 
    offDuty?: any; 
    clockIn?: any; 
    clockOut?: any; 
    status?: any; // Directly from 'Absent' column
    overtimeHours?: any; // Directly from 'Overtime' column
    regularHours?: any; // Directly from 'Regular Hours' column
    remarks?: any;
    
    // Internal properties
    sourceSheet?: string;
    [key: string]: any;
}


export interface AttendanceRecord {
    id: string;
    date: string; // AD Date as ISO string
    bsDate: string;
    employeeName: string;
    onDuty: string | null;
    offDuty: string | null;
    clockIn: string | null;
    clockOut: string | null;
    status: string; // Storing the raw status from Excel
    grossHours: number;
    overtimeHours: number;
    regularHours: number;
    remarks: string | null;
    importedBy: string;
    sourceSheet?: string;
    rawImportData?: Record<string, any>;
}

export interface Payroll {
    id: string;
    bsYear: number;
    bsMonth: number;
    employeeId: string;
    employeeName: string;
    joiningDate?: string;
    totalHours?: number;
    otHours?: number;
    regularHours?: number;
    rate?: number;
    regularPay?: number;
    otPay?: number;
    totalPay?: number;
    absentDays?: number;
    deduction?: number;
    allowance?: number;
    bonus?: number;
    salaryTotal?: number;
    tds?: number;
    gross?: number;
    advance?: number;
    netPayment?: number;
    remark?: string;
    createdBy: string;
    createdAt: string; // ISO string
    rawImportData?: Record<string, any>;
}

export interface PunctualityInsight {
    employeeId: string;
    employeeName: string;
    scheduledDays: number;
    presentDays: number;
    absentDays: number;
    attendanceRate: number;
    lateArrivals: number;
    earlyDepartures: number;
    onTimeDays: number;
    punctualityScore: number;
}

export interface BehaviorInsight {
    employeeId: string;
    employeeName: string;
    punctualityTrend: string;
    absencePattern: string;
    otImpact: string;
    shiftEndBehavior: string;
    performanceInsight: string;
}

export interface PatternInsight {
    finding: string;
    description: string;
}

export interface WorkforceAnalytics {
    employeeId: string;
    employeeName: string;
    overtimeRatio: number;
    onTimeStreak: number;
    saturdaysWorked: number;
}


// --- Fleet Management Types ---
export type VehicleStatus = 'Active' | 'In Maintenance' | 'Decommissioned';

export interface Vehicle {
  id: string;
  name: string;
  make: string;
  model: string;
  year: number;
  vin: string;
  status: VehicleStatus;
  driverId?: string;
  createdBy: string;
  createdAt: string; // ISO string
  lastModifiedBy?: string;
  lastModifiedAt?: string; // ISO string
}

export interface Driver {
    id: string;
    name: string;
    nickname?: string;
    licenseNumber: string;
    contactNumber: string;
    dateOfBirth: string; // ISO string
    photoURL?: string;
    createdBy: string;
    createdAt: string; // ISO string
    lastModifiedBy?: string;
    lastModifiedAt?: string; // ISO string
}

export interface PolicyOrMembership {
    id: string;
    type: string;
    provider: string; // e.g., Insurance company or Membership organization
    policyNumber: string; // Policy or Membership ID
    startDate: string; // ISO string
    endDate: string; // ISO string
    cost: number; // Premium or Membership fee
    memberId: string; // Can be vehicleId or driverId
    memberType: 'Vehicle' | 'Driver';
    createdBy: string;
    createdAt: string; // ISO string
    lastModifiedBy?: string;
    lastModifiedAt?: string; // ISO string
}

export const transactionTypes = ['Purchase', 'Sales', 'Payment', 'Receipt'] as const;
export type TransactionType = typeof transactionTypes[number];

export type PartyType = 'Supplier' | 'Customer' | 'Both';

export interface Party {
    id: string;
    name: string;
    type: PartyType;
    address?: string;
    panNumber?: string;
    createdBy: string;
    createdAt: string; // ISO string
    lastModifiedBy?: string;
    lastModifiedAt?: string; // ISO string
}

export type AccountType = 'Cash' | 'Bank';

export interface Account {
    id: string;
    name: string; // Account holder name or "Cash Account"
    type: AccountType;
    accountNumber?: string;
    bankName?: string;
    branch?: string;
    createdBy: string;
    createdAt: string; // ISO string
    lastModifiedBy?: string;
    lastModifiedAt?: string; // ISO string
}

export interface TransactionItem {
    particular: string;
    quantity: number;
    uom?: string;
    rate: number;
}

export type BillingType = 'Cash' | 'Bank' | 'Credit';
export type InvoiceType = 'Taxable' | 'Normal';

export interface Transaction {
    id: string;
    purchaseNumber?: string;
    vehicleId: string;
    date: string; // Posting Date (ISO string)
    invoiceNumber?: string | null;
    invoiceDate?: string | null;
    invoiceType: InvoiceType;
    billingType: BillingType;
    chequeNumber?: string | null;
    chequeDate?: string | null;
    dueDate?: string | null;
    partyId?: string | null; // Supplier
    accountId?: string | null;
    items: TransactionItem[];
    amount: number; // This will be the grand total
    remarks: string | null;
    tripId?: string; // Link to the trip
    type: TransactionType; // Purchase, Sales, etc.
    voucherId?: string; // To group payment/receipt transactions
    createdBy: string;
    createdAt: string; // ISO string
    lastModifiedBy?: string;
    lastModifiedAt?: string; // ISO string
}


export interface TripDestination {
    name: string;
    freight: number;
}

export interface FuelEntry {
    partyId: string;
    amount: number;
    liters?: number;
    invoiceNumber?: string;
    invoiceDate?: string; // ISO String
    purchaseTransactionId?: string;
}

export interface ExtraExpense {
    description: string;
    amount: number;
    partyId?: string;
}

export interface Destination {
    id: string;
    name: string;
    createdBy: string;
    createdAt: string; // ISO string
    lastModifiedBy?: string;
    lastModifiedAt?: string; // ISO string
}

export interface ReturnTrip {
    date?: string; // ISO string
    from?: string;
    to?: string;
    clientName?: string;
    freight?: number;
    expenses?: number;
}


export interface Trip {
    id: string;
    tripNumber: string;
    date: string; // ISO string
    vehicleId: string;
    partyId: string;
    odometerStart?: number;
    odometerEnd?: number;
    destinations: TripDestination[];
    truckAdvance?: number;
    transport: number;
    fuelEntries: FuelEntry[];
    extraExpenses: ExtraExpense[];
    returnTrips: ReturnTrip[];
    detentionStartDate?: string; // ISO string
    detentionEndDate?: string; // ISO string
    numberOfParties?: number;
    dropOffChargeRate?: number;
    detentionChargeRate?: number;
    salesTransactionId?: string; // Link to the main sales transaction
    createdBy: string;
    createdAt: string; // ISO string
    lastModifiedBy?: string;
    lastModifiedAt?: string; // ISO string
}


// RBAC Types
export const modules = ['dashboard', 'reports', 'products', 'purchaseOrders', 'rawMaterials', 'settings', 'hr', 'fleet'] as const;
export type Module = typeof modules[number];

export const actions = ['view', 'create', 'edit', 'delete'] as const;
export type Action = typeof actions[number];

export type Permissions = {
  [key in Module]?: Action[];
};

export interface User {
  id: string;
  username: string;
  password?: string;
  permissions: Permissions;
  passwordLastUpdated?: string; // ISO Date string
}

// Settings Types
export interface UnitOfMeasurement {
    id: string;
    name: string;
    abbreviation: string;
    createdBy: string;
    createdAt: string; // ISO string
    lastModifiedBy?: string;
    lastModifiedAt?: string; // ISO string
}

export interface AppSetting {
    id: string;
    value: any;
}

export const documentTypes = ['report', 'purchaseOrder', 'sales', 'purchase', 'paymentReceipt'] as const;
export type DocumentType = typeof documentTypes[number];

export interface DocumentPrefixes {
    report?: string;
    purchaseOrder?: string;
    sales?: string;
    purchase?: string;
    paymentReceipt?: string;
}

export const getDocumentName = (type: DocumentType): string => {
    switch (type) {
        case 'report':
            return 'Test Report';
        case 'purchaseOrder':
            return 'Purchase Order';
        case 'sales':
            return 'Sales (Trip Sheet)';
        case 'purchase':
            return 'Purchase Voucher';
        case 'paymentReceipt':
            return 'Payment/Receipt Voucher';
        default:
            return 'Document';
    }
}
