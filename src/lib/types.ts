
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
  id: string;
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
  name: string;
  category: string;
}

export interface PurchaseOrderItem {
  rawMaterialId: string;
  rawMaterialName: string;
  quantity: string;
}

export interface PurchaseOrder {
  id: string;
  poNumber: string;
  poDate: string; // ISO string
  companyName: string;
  companyAddress: string;
  items: PurchaseOrderItem[];
}
