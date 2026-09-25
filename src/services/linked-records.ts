/**
 * @fileOverview Checks whether a master record (party, account, vehicle,
 * driver, employee) is still referenced before it is deleted.
 *
 * Deleting a master that other records point at leaves those records
 * orphaned: reports show blank names and ledgers stop adding up. Each check
 * is a server-side count (about one read per 1,000 documents), so this costs
 * a handful of reads per delete. A count we are not allowed to run is treated
 * as "in use" - we cannot prove the record is safe to delete.
 */
import { collection, getCountFromServer, limit, query, where } from 'firebase/firestore';
import { getFirebase } from '@/lib/firebase';
import { COLLECTIONS } from '@/lib/constants';
import { toast } from '@/hooks/use-toast';

export type LinkedKind = 'party' | 'account' | 'vehicle' | 'driver' | 'employee';

type Ref = { collection: string; field: string; label: string };

const REFERENCES: Record<LinkedKind, Ref[]> = {
    party: [
        { collection: COLLECTIONS.TRANSACTIONS, field: 'partyId', label: 'Transactions' },
        { collection: COLLECTIONS.TRIPS, field: 'partyId', label: 'Trips' },
        { collection: COLLECTIONS.EXPENSES, field: 'partyId', label: 'Expenses' },
        { collection: COLLECTIONS.PURCHASE_ORDERS, field: 'partyId', label: 'Purchase orders' },
        { collection: 'costReports', field: 'partyId', label: 'Cost reports' },
        { collection: COLLECTIONS.PRODUCTS, field: 'partyId', label: 'Products' },
        { collection: 'crm_deals', field: 'partyId', label: 'Deals' },
        { collection: 'crm_contacts', field: 'partyId', label: 'Contacts' },
        { collection: COLLECTIONS.RENTAL_AGREEMENTS, field: 'tenantId', label: 'Rental agreements' },
        { collection: COLLECTIONS.RENTAL_BILLS, field: 'partyId', label: 'Rental bills' },
    ],
    account: [
        { collection: COLLECTIONS.TRANSACTIONS, field: 'accountId', label: 'Transactions' },
        { collection: COLLECTIONS.CHEQUES, field: 'accountId', label: 'Cheques' },
        { collection: COLLECTIONS.EXPENSES, field: 'accountId', label: 'Expenses' },
    ],
    vehicle: [
        { collection: COLLECTIONS.TRIPS, field: 'vehicleId', label: 'Trips' },
        { collection: COLLECTIONS.TRANSACTIONS, field: 'vehicleId', label: 'Transactions' },
        { collection: COLLECTIONS.EXPENSES, field: 'vehicleId', label: 'Expenses' },
        { collection: COLLECTIONS.POLICIES, field: 'memberId', label: 'Policies' },
    ],
    driver: [
        { collection: COLLECTIONS.VEHICLES, field: 'driverId', label: 'Vehicles' },
        { collection: COLLECTIONS.POLICIES, field: 'memberId', label: 'Policies' },
    ],
    employee: [
        { collection: COLLECTIONS.PAYROLL, field: 'employeeId', label: 'Payroll' },
        { collection: COLLECTIONS.ATTENDANCE, field: 'employeeId', label: 'Attendance' },
        { collection: COLLECTIONS.LEAVE_REQUESTS, field: 'employeeId', label: 'Leave requests' },
        { collection: COLLECTIONS.BONUS_LEDGER, field: 'employeeId', label: 'Bonus ledger' },
    ],
};

/**
 * Labels of the places that still reference the record, e.g.
 * ["Transactions (12)", "Trips (3)"]. Empty means it is safe to delete.
 */
export const findLinkedRecords = async (kind: LinkedKind, id: string): Promise<string[]> => {
    const { db } = getFirebase();
    const results = await Promise.all(REFERENCES[kind].map(async (ref) => {
        try {
            const q = query(collection(db, ref.collection), where(ref.field, '==', id), limit(1000));
            const count = (await getCountFromServer(q)).data().count;
            return count > 0 ? `${ref.label} (${count >= 1000 ? '1000+' : count})` : null;
        } catch {
            return `${ref.label} (could not check)`;
        }
    }));
    return results.filter((r): r is string => r !== null);
};

/** One-line message for a blocked delete. */
export const linkedRecordsMessage = (name: string, links: string[], extra?: string): string =>
    `"${name}" is still used in: ${links.join(', ')}. Remove or reassign those first${extra ? ` - ${extra}` : ''}.`;

/**
 * Call before deleting. Shows why the delete is blocked and returns false
 * when the record is still referenced; returns true when it is safe.
 */
export const confirmNoLinkedRecords = async (kind: LinkedKind, id: string, name: string, extra?: string): Promise<boolean> => {
    const links = await findLinkedRecords(kind, id);
    if (links.length === 0) return true;
    toast({ title: 'Cannot delete', description: linkedRecordsMessage(name, links, extra), variant: 'destructive' });
    return false;
};
