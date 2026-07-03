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
  RENTAL_PROPERTIES: 'rentalProperties',
  RENTAL_UNITS: 'rentalUnits',
  RENTAL_AGREEMENTS: 'rentalAgreements',
  RENTAL_BILLS: 'rentalBills',
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
  nameEn: "SHIVAM PACKAGING INDUSTRIES PVT LTD.",
  nameNp: "शिवम प्याकेजिङ्ग इन्डस्ट्रिज प्रा.लि.",
  address: "Hetauda 08, Bagmati Province, Nepal",
  phone: "N/A",
  email: "N/A",
  pan: "N/A"
};

export const DEFAULT_FLEET_PROFILE = {
  nameEn: "SIJAN DHUWANI SEWA",
  nameNp: "सिजन ढुवानी सेवा",
  address: "HETAUDA 16, BAGMATI PROVIENCE, NEPAL",
  phone: "N/A",
  email: "N/A",
  pan: "304603712"
};

export const PLY_OPTIONS = ['3', '5', '7', '9'];
export const BF_OPTIONS = ['16 BF', '18 BF', '20 BF', '22 BF'];
