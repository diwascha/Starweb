
/**
 * Centralized Firestore collection names to ensure consistency across services.
 */
export const COLLECTIONS = {
  REPORTS: 'reports',
  PRODUCTS: 'products',
  PURCHASE_ORDERS: 'purchaseOrders',
  RAW_MATERIALS: 'rawMaterials',
  EMPLOYEES: 'employees',
  ATTENDANCE: 'attendance',
  PAYROLL: 'payroll',
  VEHICLES: 'vehicles',
  DRIVERS: 'drivers',
  POLICIES: 'policies',
  TRANSACTIONS: 'transactions',
  PARTIES: 'parties',
  ACCOUNTS: 'accounts',
  UOM: 'uom',
  DESTINATIONS: 'destinations',
  TRIPS: 'trips',
  SETTINGS: 'settings',
  NOTES: 'notes',
  PAGE_VISITS: 'pageVisits',
  TDS_CALCULATIONS: 'tdsCalculations',
  ESTIMATED_INVOICES: 'estimatedInvoices',
  CHEQUES: 'cheques',
} as const;
