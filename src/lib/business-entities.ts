import type { CompanyProfile } from './types';

/**
 * Business entity registry.
 *
 * This app is an ERP for several separate businesses that happen to share
 * one installation - they are NOT one company with several departments:
 *
 *   Shivam Packaging   the packaging business (CRM, HR, Finance, Purchasing)
 *   Sijan Dhuwani Sewa the transport business (Fleet)
 *   Personal           the private rental book (Rental)
 *
 * Each owns a distinct set of modules and prints its own letterhead, so a
 * Fleet document must never carry Shivam's name and vice versa.
 *
 * Before this registry existed, that was handled by copy-pasting a default
 * profile into whichever file needed one. The result was three competing
 * "company" defaults spelling the company name three different ways - none
 * of them the correct legal name - plus three files that hardcoded the name
 * as a string literal and ignored the configured profile entirely.
 *
 * ADDING A COMPANY (e.g. Makwanpur Food Industry) is an entry in the array
 * below plus its module paths. Nothing else changes: the Settings page
 * renders a profile form per entity, and any page under a mapped path picks
 * up the right letterhead automatically via useBusinessProfile().
 */

export type BusinessEntityId = string;

export interface BusinessEntity {
  id: BusinessEntityId;
  /** Shown as the Settings card title. */
  label: string;
  /** Firestore settings key holding the editable profile for this entity. */
  settingKey: string;
  /** Top-level route segments this entity owns, e.g. 'fleet' for /fleet/... */
  modules: string[];
  /** Fallback used only until a profile is saved in Settings. */
  defaults: CompanyProfile;
  /** Which profile fields the Settings form offers. Payslips and invoices
   *  need signatories and header/footer notes; a transport voucher doesn't. */
  extendedFields?: boolean;
}

const BLANK = { phone: 'N/A', email: 'N/A', pan: 'N/A' };

export const BUSINESS_ENTITIES: BusinessEntity[] = [
  {
    id: 'shivam',
    label: 'Shivam Packaging',
    settingKey: 'companyProfile',
    // Everything that isn't explicitly another entity's belongs here, but
    // list them so the mapping is readable rather than implied.
    modules: [
      'crm', 'hr', 'finance', 'products', 'purchase-orders', 'raw-materials',
      'report', 'reports', 'dashboard', 'notes', 'filesystem', 'settings',
    ],
    extendedFields: true,
    defaults: {
      nameEn: 'SHIVAM PACKAGING INDUSTRY PRIVATE LIMITED',
      nameNp: 'शिवम प्याकेजिङ्ग इन्डस्ट्री प्राइभेट लिमिटेड',
      address: 'Hetauda 08, Bagmati Province, Nepal',
      ...BLANK,
    },
  },
  {
    id: 'sijan',
    label: 'Sijan Dhuwani Sewa',
    settingKey: 'fleetCompanyProfile',
    modules: ['fleet'],
    defaults: {
      nameEn: 'SIJAN DHUWANI SEWA',
      nameNp: 'सिजन ढुवानी सेवा',
      address: 'Hetauda, Bagmati Province, Nepal',
      ...BLANK,
    },
  },
  {
    id: 'personal',
    label: 'Personal (Rental)',
    settingKey: 'personalProfile',
    modules: ['rental'],
    defaults: {
      nameEn: '',
      nameNp: '',
      address: '',
      ...BLANK,
    },
  },
];

/** The entity every unmapped module falls back to. */
export const PRIMARY_ENTITY_ID = 'shivam';

export const getEntity = (id: BusinessEntityId): BusinessEntity =>
  BUSINESS_ENTITIES.find(e => e.id === id)
  || BUSINESS_ENTITIES.find(e => e.id === PRIMARY_ENTITY_ID)!;

/**
 * Which business a route belongs to, from its first path segment.
 * `/fleet/trip-sheets/view` -> sijan, `/crm/pack-spec` -> shivam.
 */
export const resolveEntityForPath = (pathname?: string | null): BusinessEntity => {
  const segment = (pathname || '').split('?')[0].split('/').filter(Boolean)[0];
  if (segment) {
    const match = BUSINESS_ENTITIES.find(e => e.modules.includes(segment));
    if (match) return match;
  }
  return getEntity(PRIMARY_ENTITY_ID);
};

/** Convenience for the two entities referenced by name across the app. */
export const DEFAULT_COMPANY_PROFILE = getEntity('shivam').defaults;
export const DEFAULT_FLEET_PROFILE = getEntity('sijan').defaults;
