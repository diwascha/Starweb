

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
  date: string;
  testData: TestResultData;
  printLog?: PrintLogEntry[];
}

export interface RawMaterial {
  id: string;
  type: string;
  name: string;
  size: string;
  gsm: string;
  bf: string;
  units: string[];
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
  deliveryDate?: string; // ISO string for delivery date
}

// --- HR Module Types ---
export type WageBasis = 'Monthly' | 'Hourly';

export interface Employee {
  id: string;
  name: string;
  wageBasis: WageBasis;
  wageAmount: number;
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
}

// --- Fleet Management Types ---
export type VehicleStatus = 'Active' | 'In Maintenance' | 'Decommissioned';

export interface Vehicle {
  id: string;
  name: string;
  licensePlate: string;
  make: string;
  model: string;
  year: number;
  vin: string;
  status: VehicleStatus;
}

export interface Driver {
    id: string;
    name: string;
    licenseNumber: string;
    contactNumber: string;
}

export interface InsurancePolicy {
    id: string;
    vehicleId: string; // Link to a vehicle
    provider: string;
    policyNumber: string;
    startDate: string; // ISO string
    endDate: string; // ISO string
    premium: number;
}

export interface Membership {
    id: string;
    organization: string;
    membershipId: string;
    startDate: string; // ISO string
    endDate: string; // ISO string
    cost: number;
    memberId: string; // Can be vehicleId or driverId
    memberType: 'Vehicle' | 'Driver';
}

export const expenseCategories = ['Fuel', 'Maintenance', 'Insurance', 'Tires', 'Repairs', 'Tolls', 'Permits', 'Other'] as const;
export type ExpenseCategory = typeof expenseCategories[number];

export const incomeSources = ['Freight', 'Leasing', 'Sale', 'Other'] as const;
export type IncomeSource = typeof incomeSources[number];

export type TransactionType = 'Income' | 'Expense';

export interface Transaction {
    id: string;
    vehicleId: string;
    date: string; // ISO string
    type: TransactionType;
    category: ExpenseCategory | IncomeSource;
    amount: number;
    description: string;
}


// RBAC Types
export const modules = ['dashboard', 'reports', 'products', 'purchaseOrders', 'rawMaterials', 'settings', 'hr', 'fleet'] as const;
export type Module = typeof modules[number];

export const actions = ['view', 'create', 'edit', 'delete'] as const;
export type Action = typeof actions[number];

export type Permissions = {
  [key in Module]?: Action[];
};

export interface Role {
  id: string;
  name: string;
  permissions: Permissions;
}

export interface User {
  id: string;
  username: string;
  password?: string;
  roleId: string; // 'admin' or 'user'
  permissions?: Permissions;
}
