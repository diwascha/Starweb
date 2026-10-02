'use client';
/**
 * @fileOverview Folds a duplicate vehicle (e.g. one an Excel import created
 * from a misspelt truck number) into the real one: every record pointing at
 * the duplicate is re-pointed, the duplicate's name (and aliases) are kept
 * as aliases of the real one so future imports match that spelling, then the
 * duplicate is deleted.
 *
 * Reads only the records that reference the duplicate (one query per
 * collection), so it is cheap on the Firestore quota.
 */
import { collection, doc, getDocs, query, where, writeBatch } from 'firebase/firestore';
import { getFirebase } from '@/lib/firebase';
import { COLLECTIONS } from '@/lib/constants';
import { logAudit } from '@/services/log-service';
import { normalizeName } from '@/lib/name-match';
import type { Vehicle } from '@/lib/types';

const REFERENCES: { collection: string; field: string }[] = [
    { collection: COLLECTIONS.TRANSACTIONS, field: 'vehicleId' },
    { collection: COLLECTIONS.TRIPS, field: 'vehicleId' },
    { collection: COLLECTIONS.EXPENSES, field: 'vehicleId' },
    { collection: COLLECTIONS.POLICIES, field: 'memberId' },
    { collection: COLLECTIONS.VEHICLE_SERVICES, field: 'vehicleId' },
];

const BATCH_SIZE = 400;

/** Returns how many records were moved to `into`. */
export async function mergeVehicles(from: Vehicle, into: Vehicle, username: string): Promise<number> {
    if (!from?.id || !into?.id || from.id === into.id) throw new Error('Choose two different vehicles.');
    const fromId = from.id, intoId = into.id;
    const { db } = getFirebase();

    const updates: { path: string; field: string }[] = [];
    for (const ref of REFERENCES) {
        const snap = await getDocs(query(collection(db, ref.collection), where(ref.field, '==', fromId)));
        snap.docs.forEach(d => updates.push({ path: `${ref.collection}/${d.id}`, field: ref.field }));
    }

    for (let i = 0; i < updates.length; i += BATCH_SIZE) {
        const batch = writeBatch(db);
        for (const u of updates.slice(i, i + BATCH_SIZE)) {
            batch.update(doc(db, u.path), { [u.field]: intoId, lastModifiedAt: new Date().toISOString() });
        }
        await batch.commit();
    }

    const aliases = [...(into.aliases || [])];
    for (const name of [from.name, ...(from.aliases || [])]) {
        const n = normalizeName(name);
        if (n && n !== normalizeName(into.name) && !aliases.some(a => normalizeName(a) === n)) aliases.push(name);
    }
    const intoBatch = writeBatch(db);
    intoBatch.update(doc(db, COLLECTIONS.VEHICLES, intoId), { aliases, lastModifiedBy: username, lastModifiedAt: new Date().toISOString() });
    intoBatch.delete(doc(db, COLLECTIONS.VEHICLES, fromId));
    await intoBatch.commit();
    logAudit(`Vehicle merged: "${from.name}" into "${into.name}" (${updates.length} records moved)`, 'Fleet');
    return updates.length;
}
