export interface RateHistoryEntry {
  rate: number;
  date: string; // ISO string when the rate was set
  setBy: string; // Username of who set the rate
}

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
  paperType?: string;
  paperShade?: string; // NS
  boxType?: string; // RSC
  paperBf?: string;
  topGsm?: string;
  flute1Gsm?: string;
  middleGsm?: string;
  flute2Gsm?: string;
  bottomGsm?: string;
  liner2Gsm?: string;
  flute3Gsm?: string;
  liner3Gsm?: string;
  flute4Gsm?: string;
  liner4Gsm?: string;
  wastagePercent?: string;
}

export interface ProductAccessory {
  id: string; // Unique within the product
  name: string;
  l: string;
  b: string;
  h: string;
  noOfPcs: string;
  ply: string;
  fluteType: string;
  paperType: string;
  paperBf: string;
  paperShade: string;
  boxType: string;
  topGsm: string;
  flute1Gsm: string;
  middleGsm: string;
  flute2Gsm: string;
  bottomGsm: string;
  liner2Gsm: string;
  flute3Gsm: string;
  liner3Gsm: string;
  flute4Gsm: string;
  liner4Gsm: string;
  wastagePercent: string;
}

export interface Product {
  id: string;
  name: string;
  materialCode?: string;
  partyId?: string;
  partyName?: string; 
  partyAddress?: string; // Optional for costing products
  rate?: number;
  rateHistory?: RateHistoryEntry[];
  specification: Partial<ProductSpecification>;
  accessories?: ProductAccessory[]; // Added to store default accessories
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
  lastModifiedAt?: string | null;
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

export type PurchaseOrderStatus = 'Draft' | 'Ordered' | 'Amended' | 'Delivered' | 'Canceled';

export interface PurchaseOrderVersion {
  versionId: string;
  replacedAt: string;
  replacedBy: string;
  data: {
    poNumber: string;
    poDate: string;
    items: PurchaseOrderItem[];
    companyName: string;
    companyAddress: string;
    panNumber?: string;
    status: PurchaseOrderStatus;
    deliveryDate?: string;
    amendments?: Amendment[];
  };
}

export interface PurchaseOrder {
  id: string;
  poNumber: string;
  poDate: string; // ISO string
  createdAt: string; // ISO string
  updatedAt: string; // ISO string
  partyId: string;
  companyName: string;
  companyAddress: string;
  panNumber?: string;
  items: PurchaseOrderItem[];
  amendments?: Amendment[];
  versions?: PurchaseOrderVersion[];
  status: PurchaseOrderStatus;
  isDraft: boolean;
  deliveryDate?: string; // ISO string
  createdBy: string;
  lastModifiedBy?: string;
}

// --- HR Module Types ---
export type WageBasis = 'Monthly' | 'Hourly';
export type Gender = 'Male' | 'Female' | 'Other';
export type IdentityType = 'Citizenship' | 'Voters Card' | 'License' | 'Passport';
export type EmployeeStatus = 'Working' | 'Long Leave' | 'Resigned' | 'Dismissed';
export type Department = 'Production' | 'Admin';
export type Position = 'Manager' | 'Supervisor' | 'Machine Operator' | 'Helpers' | 'Staff';
export type BloodGroup = 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-';

export interface EmployeeDocument {
    id: string;
    name: string;
    url: string;
    type: string; // MIME type
    category: 'ID Proof' | 'Contract' | 'Education' | 'Other';
    uploadedAt: string;
}

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
  email?: string;
  dateOfBirth?: string; // ISO string
  joiningDate?: string; // ISO string
  identityType?: IdentityType;
  documentNumber?: string;
  referredBy?: string;
  photoURL?: string;
  
  // Advanced HR Fields
  bloodGroup?: BloodGroup;
  emergencyContactName?: string;
  emergencyContactNumber?: string;
  qualification?: string;
  documents?: EmployeeDocument[];
  
  createdBy: string;
  createdAt: string; // ISO string
  lastModifiedBy?: string;
  lastModifiedAt?: string; // ISO string
}

export type AttendanceStatus = 'Present' | 'Absent' | 'Public Holiday' | 'Saturday' | 'C/I Miss' | 'C/O Miss' | 'EXTRAOK' | 'Leave';

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

/**
 * Represents a raw dump of machine data before any system calculation.
 */
export interface RawMachineLog {
    id: string;
    date: string; // AD Date ISO
    dateBS: string; // Full BS string YYYY/MM/DD
    bsYear: number;
    bsMonth: number;
    employeeName: string;
    onDuty: string | null;
    offDuty: string | null;
    clockIn: string | null;
    clockOut: string | null;
    statusFromMachine: string;
    regularHoursFromMachine: number;
    overtimeHoursFromMachine: number;
    remarks: string | null;
    importId: string;
    importedAt: string;
    importedBy: string;
    sourceSheet: string;
    rawPayload: Record<string, any>;
    rowIndex?: number; // Preserves Excel row order
    isManual?: boolean;
}

export interface AttendanceRecord {
    id: string;
    date: string; // AD Date as ISO string
    bsDate: string;
    bsYear: number;
    bsMonth: number;
    employeeName: string;
    employeeId: string;
    onDuty: string | null;
    offDuty: string | null;
    clockIn: string | null;
    clockOut: string | null;
    status: string; 
    grossHours: number;
    overtimeHours: number;
    regularHours: number;
    calculatedAt: string;
    calculatedBy: string;
    remarks: string | null;
    sourceLogId?: string; // Link to the raw machine log
    rowIndex?: number; // Preserves original import order
}

export interface HrShift {
    id: string;
    name: string;
    onDuty: string; // HH:mm
    offDuty: string; // HH:mm
    breakStart: string; // HH:mm
    breakEnd: string; // HH:mm
    isDefault: boolean;
    createdAt: string;
    createdBy: string;
}

export interface PublicHoliday {
    id: string;
    name: string;
    date: string; // ISO
    isRecurring: boolean;
    createdAt: string;
    createdBy: string;
}

export interface LeaveRequest {
    id: string;
    employeeId: string;
    employeeName: string;
    leaveType: 'Paid' | 'Unpaid';
    startDate: string; // ISO
    endDate: string; // ISO
    totalDays: number;
    reason: string;
    status: 'Pending' | 'Approved' | 'Rejected';
    createdAt: string;
    createdBy: string;
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
    regularPay?: number; // Basic Pay
    otPay?: number;
    allowance?: number;
    totalPay?: number; // Gross (Basic + OT + Allowance)
    absentDays?: number;
    deduction?: number; // Absent Amt
    tds?: number;
    salaryTotal?: number; // Gross Salary (Gross - TDS)
    advance?: number;
    net?: number; // Net (Gross Salary - Advance)
    roundedNet?: number; // Rounded Net
    bonus?: number;
    netPayment?: number; // Final Net (Rounded Net + Bonus)
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

export interface HrConfig {
  hours: {
    baseDayHours: number;
    roundStep: number;
    graceMin: number;
    blockMin: number;
    freeLate: number;
    freeLatePeriod: 'WEEKLY' | 'MONTHLY';
    freeEarly: number;
    freeEarlyPeriod: 'WEEKLY' | 'MONTHLY';
    reviewThresh: number;
    breakStart?: string;
    breakEnd?: string;
  };
  payroll: {
    defaultHourly: number;
    fallbackHourly: number;
    tdsRate: number;
    monthDays: number;
    stdWorkdays: number;
    attendReqPct: number;
    punctHighPct: number;
    punctMidPct: number;
    lateDaysHigh: number;
    lateDaysMid: number;
    otHighHours: number;
    otMidHours: number;
    dowLateHighPct: number;
    dowLateMidPct: number;
  };
  bonus: {
    bonusEligReq: number;
    bonusAbsFactor: number;
  };
  lastModifiedBy?: string;
  lastModifiedAt?: string;
}

/**
 * Interface for imported behavioral analytics reports.
 */
export interface AnalyticsReport {
    id: string; // bsYear-bsMonth
    bsYear: number;
    bsMonth: number;
    behavioralPatterns: any[];
    enhancedInsights: any[];
    patternInsights: string[];
    dayOfWeekPatterns: any[];
    monthToMonthComparison: any[];
    importedAt: string;
    importedBy: string;
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

export type PolicyStatus = 'Active' | 'Renewed' | 'Archived';

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
  renewedFromId?: string | null;
  renewedToId?: string | null;   // 
  status?: PolicyStatus;
}


export const transactionTypes = ['Purchase', 'Sales', 'Payment', 'Receipt'] as const;
export type TransactionType = typeof transactionTypes[number];

export type PartyType = 'Supplier' | 'Customer' | 'Vendor' | 'Tenant' | 'Both';

export type AccountType = 'Cash' | 'Bank';
export type BankAccountType = 'Saving' | 'Current' | 'Over Draft';
export type AccountOwnership = 'Sijan' | 'Shivam' | 'Rental' | 'Both';

export interface Party {
    id: string;
    name: string;
    type: PartyType;
    ownership: AccountOwnership; // Added categorization
    address?: string;
    panNumber?: string;
    photoURL?: string; // Support for tenant/customer photos
    identityType?: string;
    documentNumber?: string;
    issueDate?: string;
    expiryDate?: string;
    createdBy: string;
    createdAt: string; // ISO string
    lastModifiedBy?: string;
    lastModifiedAt?: string; // ISO string
}

export interface Account {
    id: string;
    name: string; // Account holder name or "Cash Account"
    type: AccountType;
    ownership: AccountOwnership; // Mandatory ownership tag
    accountNumber?: string;
    bankName?: string;
    branch?: string;
    bankAccountType?: BankAccountType;
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

export type BillingType = 'Cash' | 'Bank' | 'Credit' | string;
export type InvoiceType = 'Taxable' | 'Normal';

export interface Transaction {
    id: string;
    purchaseNumber?: string | null;
    vehicleId?: string | null;
    date: string; // Posting Date (ISO string)
    invoiceNumber?: string | null;
    invoiceDate?: string | null;
    invoiceType: InvoiceType;
    billingType: BillingType;
    chequeNumber?: string | null;
    chequeDate?: string | null;
    dueDate?: string | null;
    partyId?: string | null; // Supplier/Tenant
    accountId?: string | null;
    items: TransactionItem[];
    amount: number; // This will be the grand total
    remarks: string | null;
    tripId?: string | null; // Link to the trip
    type: TransactionType;
    category?: string | null; // Category for easier auditing (Maintenance, Renewal, Rent, etc.)
    referenceType?: string | null; // e.g. "Trip Sheet", "Rental Bill", "Voucher"
    referenceId?: string | null; // The ID of the source document
    voucherId?: string | null; // To group payment/receipt transactions
    createdBy: string;
    createdAt: string; // ISO string
    lastModifiedBy?: string | null;
    lastModifiedAt?: string | null;
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
    standardAdvanceAmount?: number; // Added to store default routes advance
    remarks?: string; // Optional notes about the route
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


// RBAC Types - Compact Specification
export const modules = [
    'dashboard', 
    'finance', 
    'reports', 
    'products',
    'purchaseOrders', 
    'rawMaterials', 
    'crm', 
    'hr', 
    'fleet', 
    'rental', 
    'notes', 
    'settings'
] as const;
export type Module = typeof modules[number];

export const actions = ['view', 'add', 'edit', 'delete', 'all'] as const;
export type Action = typeof actions[number];

export type Permissions = {
  [key in Module]?: Action[];
};

export interface User {
  id: string;
  username: string;
  email?: string;
  isApproved?: boolean;
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

export const documentTypes = ['report', 'purchaseOrder', 'sales', 'purchase', 'paymentReceipt', 'tdsVoucher', 'estimateInvoice', 'expense', 'rentalBill'] as const;
export type DocumentType = typeof documentTypes[number];

export interface DocumentPrefixes {
    report?: string;
    purchaseOrder?: string;
    sales?: string;
    purchase?: string;
    paymentReceipt?: string;
    tdsVoucher?: string;
    estimateInvoice?: string;
    expense?: string;
    rentalBill?: string;
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
        case 'tdsVoucher':
            return 'TDS Voucher';
        case 'estimateInvoice':
            return 'Estimate Invoice';
        case 'expense':
            return 'Expense Voucher';
        case 'rentalBill':
            return 'Rental Bill';
        default:
            return 'Document';
    }
}

export type NoteItemType = 'Todo' | 'Note' | 'Reminder';

export interface NoteItem {
  id: string;
  type: NoteItemType;
  title: string;
  content?: string;
  isCompleted: boolean;
  completedAt?: string | null; // ISO string
  dueDate?: string | null; // ISO string
  createdBy: string;
  createdAt: string; // ISO string
  lastModifiedBy?: string;
  lastModifiedAt?: string; // ISO string
}

// Finance Types
export type ChequeStatus = 'Due' | 'Paid' | 'Canceled' | 'Partially Paid';

export interface PartialPayment {
  id: string;
  date: string; // ISO string
  amount: number;
  remarks?: string;
}

export interface ChequeSplit {
    id: string;
    chequeDate: Date;
    chequeNumber: string;
    amount: number | '';
    remarks: string;
    interval: number;
    status: ChequeStatus;
    partialPayments?: PartialPayment[];
    cancellationReason?: string;
}

export interface Cheque {
    id: string;
    voucherNo: string;
    paymentDate: string; // ISO string for the overall record date
    invoiceDate?: string; // ISO string
    invoiceNumber?: string;
    partyName: string;
    payeeName: string;
    amount: number; // Total amount
    amountInWords: string;
    accountId?: string;
    splits: {
        id: string;
        chequeDate: string; // ISO string
        chequeNumber: string;
        amount: number;
        remarks: string;
        status: ChequeStatus;
        partialPayments?: PartialPayment[];
        cancellationReason?: string;
    }[];
    createdBy: string;
    createdAt: string; // ISO string
    lastModifiedBy?: string;
    lastModifiedAt?: string;
}


export interface TdsRate {
  value: string;
  label: string;
  description: string;
}

export interface TdsCalculation {
  id: string;
  voucherNo: string;
  date: string; // ISO string
  partyName?: string;
  taxableAmount: number;
  tdsRate: number;
  tdsAmount: number;
  vatAmount: number;
  netPayable: number;
  createdBy: string;
  createdAt: string; // ISO string
  lastModifiedBy?: string;
  lastModifiedAt?: string;
}

export interface EstimateInvoiceItem {
    id: string;
    productName: string;
    quantity: number;
    rate: number;
    gross: number;
}

export interface EstimatedInvoice {
    id: string;
    invoiceNumber: string;
    date: string; // ISO
    partyName: string;
    panNumber?: string;
    items: EstimateInvoiceItem[];
    grossTotal: number;
    vatTotal: number;
    netTotal: number;
    amountInWords: string;
    createdBy: string;
    createdAt: string; // ISO
}

// CRM Types

export interface Accessory extends ProductAccessory {
  calculated: CalculatedValues;
}


export interface CalculatedValues {
    sheetSizeL: number;
    sheetSizeB: number;
    sheetArea: number;
    totalGsm: number;
    paperWeight: number;
    totalBoxWeight: number;
    paperRate: number;
    paperCost: number;
    transportCost: number;
}

export interface CostReportItem {
  id: string;
  productId: string;
  l: string;
  b: string;
  h: string;
  noOfPcs: string;
  ply: string;
  fluteType: string;
  paperType: string;
  paperBf: string;
  paperShade: string; // Add this
  boxType: string; // Add this
  topGsm: string;
  flute1Gsm: string;
  middleGsm: string;
  flute2Gsm: string;
  bottomGsm: string;
  liner2Gsm: string;
  flute3Gsm: string;
  liner3Gsm: string;
  flute4Gsm: string;
  liner4Gsm: string;
  wastagePercent: string;
  accessories?: Accessory[];
  calculated: CalculatedValues;
}

export interface CostReportTerm {
    text: string;
    isSelected: boolean;
}

export interface CostReport {
  id: string;
  reportNumber: string;
  reportDate: string; // ISO string
  partyId: string;
  partyName: string;
  kraftPaperCosts: Record<string, number>;
  virginPaperCost: number;
  conversionCost: number;
  transportCost: number;
  transportCostType: 'Per Piece' | 'Per Consignment';
  items: Omit<CostReportItem, 'calculated'>[]; // We only store the inputs, not the calculated values
  totalCost: number;
  termsAndConditions?: CostReportTerm[];
  createdBy: string;
  createdAt: string;
}

export interface CostSettingHistoryEntry {
    costType: 'kraftPaperCost' | 'virginPaperCost' | 'conversionCost' | 'accessoryConversionCost' | string; // Allow string for dynamic kraft cost keys
    oldValue: number;
    newValue: number;
    date: string; // ISO
    setBy: string;
}

export interface CostSetting {
    kraftPaperCosts: Record<string, number>;
    virginPaperCost: number;
    conversionCost: number;
    accessoryConversionCost: number; // Added
    termsAndConditions?: CostReportTerm[];
    history: CostSettingHistoryEntry[];
    createdBy?: string;
    createdAt?: string; // ISO
    lastModifiedBy?: string;
    lastModifiedAt?: string; // ISO
}

export interface PageVisit {
  id: string;
  path: string;
  count: number;
  lastVisited: string; // ISO
}

export interface CompanyProfile {
  nameEn: string;
  nameNp: string;
  address: string;
  phone: string;
  email: string;
  pan: string;
  logoURL?: string;
  lastModifiedBy?: string;
  lastModifiedAt?: string;
}

export interface AppBranding {
  appName: string;
  appMotto: string;
  appLogoURL?: string;
}

// --- Rental Property Management Types ---

export interface RentalProperty {
  id: string;
  name: string;
  address: string;
  totalUnits: number;
  createdBy: string;
  createdAt: string;
  lastModifiedBy?: string;
  lastModifiedAt?: string;
}

export type RentalUnitStatus = 'Occupied' | 'Vacant' | 'Reserved' | 'Under Maintenance';

export interface RentalUnit {
  id: string;
  propertyId: string;
  propertyName?: string;
  unitNumber: string;
  floor: string;
  type: string; // e.g., Apartment, Shop, Warehouse
  monthlyRent: number;
  status: RentalUnitStatus;
  tenantId?: string; // Link to PartyId
  tenantName?: string;
  outstandingBalance: number;
  createdBy: string;
  createdAt: string;
  lastModifiedBy?: string;
  lastModifiedAt?: string;
}

export interface RentalAgreement {
  id: string;
  unitId: string;
  unitNumber?: string;
  propertyId: string;
  propertyName?: string;
  tenantId: string;
  tenantName?: string;
  monthlyRent: number;
  securityDeposit: number;
  billingDate: number; // Day of month (1-31)
  lateFee: number;
  startDate: string;
  endDate: string;
  status: 'Active' | 'Pending' | 'Expired' | 'Terminated';
  createdBy: string;
  createdAt: string;
  lastModifiedBy?: string;
  lastModifiedAt?: string;
}

export type RentalBillType = 'Rent' | 'Electricity' | 'Water' | 'Internet' | 'Maintenance' | 'Parking' | 'Other';

export interface RentalBill {
  id: string;
  agreementId: string;
  tenantId: string;
  tenantName: string;
  unitId: string;
  unitNumber: string;
  propertyId: string;
  propertyName: string;
  type: RentalBillType;
  amount: number;
  billingMonth: number; // 0-11
  billingYear: number;
  dueDate: string;
  status: 'Paid' | 'Unpaid' | 'Partial';
  transactionId?: string; // Link to Transaction entity
  remarks?: string;
  createdBy: string;
  createdAt: string;
}
