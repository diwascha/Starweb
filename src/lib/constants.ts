/**
 * Centralized constants for the application to ensure consistency and DRY principles.
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
  EXPENSES: 'expenses',
  LOGS: 'logs',
  FILES: 'files',
  RENTAL_PROPERTIES: 'rentalProperties',
  RENTAL_UNITS: 'rentalUnits',
  RENTAL_AGREEMENTS: 'rentalAgreements',
  RENTAL_BILLS: 'rentalBills',
  SYSTEM_USERS: 'system_users',
  USERNAMES: 'usernames',
  RAW_MACHINE_LOGS: 'raw_machine_logs',
  BONUS_LEDGER: 'bonus_ledger',
  BONUS_SUMMARIES: 'bonus_summaries',
  BEHAVIOR_LEDGER: 'behavior_ledger',
  BEHAVIOR_ANALYTICS: 'behavior_analytics',
  ANALYTICS_REPORTS: 'analytics_reports',
  HR_SHIFTS: 'hr_shifts',
  LEAVE_REQUESTS: 'leave_requests',
} as const;

export const NEPALI_MONTHS = [
  { value: 0, name: "Baishakh" },
  { value: 1, name: "Jestha" },
  { value: 2, name: "Ashadh" },
  { value: 3, name: "Shrawan" },
  { value: 4, name: "Bhadra" },
  { value: 5, name: "Ashwin" },
  { value: 6, name: "Kartik" },
  { value: 7, name: "Mangsir" },
  { value: 8, name: "Poush" },
  { value: 9, name: "Magh" },
  { value: 10, name: "Falgun" },
  { value: 11, name: "Chaitra" }
];

export const NEPALI_MONTH_NAMES = NEPALI_MONTHS.map(m => m.name);

export const DEFAULT_COMPANY_PROFILE = {
  nameEn: "GENERIC ENTERPRISE PVT LTD.",
  nameNp: "जेनेरिक इन्टरप्राइज प्रा.लि.",
  address: "ADDRESS NOT CONFIGURED",
  phone: "N/A",
  email: "N/A",
  pan: "N/A"
};

export const DEFAULT_FLEET_PROFILE = {
  nameEn: "GENERIC LOGISTICS SEWA",
  nameNp: "जेनेरिक ढुवानी सेवा",
  address: "ADDRESS NOT CONFIGURED",
  phone: "N/A",
  email: "N/A",
  pan: "N/A"
};

export const PLY_OPTIONS = ['3', '5', '7', '9'];
export const BF_OPTIONS = ['16 BF', '18 BF', '20 BF', '22 BF'];
