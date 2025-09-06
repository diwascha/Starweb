


















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

export interface Employee {
  id: string;
  name: string;
  wageBasis: WageBasis;
  wageAmount: number;
  createdBy: string;
  createdAt: string; // ISO string
  lastModifiedBy?: string;
  lastModifiedAt?: string; // ISO string
}

export type AttendanceStatus = 'Present' | 'Absent' | 'Public Holiday' | 'Saturday';

export interface AttendanceRecord {
    id: string;
    date: string; // AD Date as ISO string
    bsDate: string;
    employeeName: string;
    onDuty: string | null;
    offDuty: string | null;
    clockIn: string | null;
    clockOut: string | null;
    status: AttendanceStatus;
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

export type PartyType = 'Vendor' | 'Client';

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
    name: string;
    type: AccountType;
    createdBy: string;
    createdAt: string; // ISO string
    lastModifiedBy?: string;
    lastModifiedAt?: string; // ISO string
}

export interface Transaction {
    id: string;
    vehicleId: string;
    date: string; // ISO string
    type: TransactionType;
    amount: number;
    description: string;
    partyId?: string;
    accountId?: string;
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
    freight?: number;
    expenses?: number;
}


export interface Trip {
    id: string;
    date: string; // ISO string
    vehicleId: string;
    partyId: string;
    odometerStart?: number;
    odometerEnd?: number;
    destinations: TripDestination[];
    truckAdvance?: number;
    transport: number;
    fuelEntries: FuelEntry[];
    extraExpenses?: ExtraExpense[];
    returnTrips?: ReturnTrip[];
    detentionStartDate?: string; // ISO string
    detentionEndDate?: string; // ISO string
    numberOfParties?: number;
    dropOffChargeRate?: number;
    detentionChargeRate?: number;
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

    


    