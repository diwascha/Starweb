
/**
 * Centralized constants for the application to ensure consistency and DRY principles.
 */

export const COLLECTIONS = {
  REPORTS: 'reports',
  PRODUCTS: 'products',
  PURCHASE_ORDERS: 'purchaseOrders',
  NUMBER_COUNTERS: 'numberCounters',
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
  GSM_REPORTS: 'gsm_reports',
  PAYMENT_TRACKER: 'payment_tracker',
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


// Re-exported from the business entity registry, which is the single place
// each company's letterhead defaults are defined. Kept here so the many
// existing `from '@/lib/constants'` imports keep working.
export { DEFAULT_COMPANY_PROFILE, DEFAULT_FLEET_PROFILE } from './business-entities';

export const PLY_OPTIONS = ['3', '5', '7', '9'];
export const BF_OPTIONS = ['16 BF', '18 BF', '20 BF', '22 BF'];

// Single source of truth for HR operational rules, matching the legacy VBA
// workbook's Rates sheet ("CALCULATE HOUR" / "CALCULATE PAYROLL" / "BONUS
// RULES" sections). Used both as the HR Setting page's initial form state
// and as the fallback when no hr_config setting has been saved yet - keep
// both consumers reading from here so the two can't drift apart.
export const DEFAULT_HR_CONFIG = {
  hours: {
    baseDayHours: 8,
    roundStep: 0.5,
    graceMin: 5,
    blockMin: 30,
    freeLate: 1,
    freeLatePeriod: 'WEEKLY' as const,
    freeEarly: 1,
    freeEarlyPeriod: 'WEEKLY' as const,
    reviewThresh: 8.5,
    breakStart: '12:00',
    breakEnd: '13:00',
  },
  payroll: {
    defaultHourly: 83.5,
    fallbackHourly: 100,
    tdsRate: 0.01,
    monthDays: 30,
    stdWorkdays: 26,
    attendReqPct: 90,
    punctHighPct: 95,
    punctMidPct: 85,
    lateDaysHigh: 6,
    lateDaysMid: 3,
    otHighHours: 15,
    otMidHours: 5,
    dowLateHighPct: 15,
    dowLateMidPct: 5,
  },
  bonus: {
    bonusEligReq: 70,
    bonusAbsFactor: 1,
  },
};
