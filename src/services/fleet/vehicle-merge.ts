'use client';
/**
 * @fileOverview Merging duplicate vehicles (e.g. one an Excel import created
 * from a misspelt truck number) and splitting a mistaken merge back apart.
 *
 * Merge: every record pointing at the merged-away vehicle is re-pointed to
 * the kept one, its name (and aliases) become aliases of the kept one so
 * future imports match that spelling, and it is deleted. The kept vehicle
 * stores what was merged (the old vehicle and exactly which records moved)
 * in `mergeHistory`, so the merge can be undone.
 *
 * Split: recreates the merged-away vehicle with its original id and details,
 * moves its original records back, and removes the aliases the merge added.
 * Records added later (e.g. by imports matched through the alias) stay on
 * the kept vehicle.
 *
 * Reads only records that reference the vehicles involved, so this is cheap
 * on the Firestore quota.
 */
import { collection, doc, getCountFromServer, getDocs, query, where, writeBatch } from 'firebase/firestore';
import { getFirebase } from '@/lib/firebase';
import { COLLECTIONS } from '@/lib/constants';
import { logAudit } from '@/services/log-service';
import { normalizeName } from '@/lib/name-match';
import type { Vehicle, VehicleMergeEntry } from '@/lib/types';

const REFERENCES: { collection: string; field: string; label: string }[] = [
    { collection: COLLECTIONS.TRANSACTIONS, field: 'vehicleId', label: 'transactions' },
    { collection: COLLECTIONS.TRIPS, field: 'vehicleId', label: 'trips' },
    { collection: COLLECTIONS.EXPENSES, field: 'vehicleId', label: 'expenses' },
    { collection: COLLECTIONS.POLICIES, field: 'memberId', label: 'policies' },
    { collection: COLLECTIONS.VEHICLE_SERVICES, field: 'vehicleId', label: 'service records' },
];

const BATCH_SIZE = 400;

const repoint = async (records: { path: string; field: string }[], toId: string) => {
    const { db } = getFirebase();
    for (let i = 0; i < records.length; i += BATCH_SIZE) {
        const batch = writeBatch(db);
        for (const r of records.slice(i, i + BATCH_SIZE)) {
            batch.update(doc(db, r.path), { [r.field]: toId, lastModifiedAt: new Date().toISOString() });
        }
        await batch.commit();
    }
};

const recordsOf = async (vehicleId: string) => {
    const { db } = getFirebase();
    const out: { path: string; field: string }[] = [];
    for (const ref of REFERENCES) {
        const snap = await getDocs(query(collection(db, ref.collection), where(ref.field, '==', vehicleId)));
        snap.docs.forEach(d => out.push({ path: `${ref.collection}/${d.id}`, field: ref.field }));
    }
    return out;
};

/** How many records of each kind point at a vehicle (one read per kind). */
export async function countVehicleRecords(vehicleId: string): Promise<{ total: number; parts: string[] }> {
    const { db } = getFirebase();
    let total = 0;
    const parts: string[] = [];
    for (const ref of REFERENCES) {
        try {
            const n = (await getCountFromServer(query(collection(db, ref.collection), where(ref.field, '==', vehicleId)))).data().count;
            total += n;
            if (n) parts.push(`${n} ${ref.label}`);
        } catch {
            parts.push(`${ref.label}: not visible to you`);
        }
    }
    return { total, parts };
}

/** Merges `from` into `keep`. Returns how many records were moved. */
export async function mergeVehicles(from: Vehicle, keep: Vehicle, username: string): Promise<number> {
    if (!from?.id || !keep?.id || from.id === keep.id) throw new Error('Choose two different vehicles.');
    const { db } = getFirebase();

    const records = await recordsOf(from.id);
    await repoint(records, keep.id);

    const aliases = [...(keep.aliases || [])];
    const addedAliases: string[] = [];
    for (const name of [from.name, ...(from.aliases || [])]) {
        const n = normalizeName(name);
        if (n && n !== normalizeName(keep.name) && !aliases.some(a => normalizeName(a) === n)) {
            aliases.push(name);
            addedAliases.push(name);
        }
    }
    const { id: _id, ...fromData } = from;
    const entry: VehicleMergeEntry = {
        vehicle: JSON.parse(JSON.stringify({ id: from.id, ...fromData })),
        records,
        addedAliases,
        mergedAt: new Date().toISOString(),
        mergedBy: username,
    };

    const batch = writeBatch(db);
    batch.update(doc(db, COLLECTIONS.VEHICLES, keep.id), {
        aliases,
        mergeHistory: [...(keep.mergeHistory || []), entry],
        lastModifiedBy: username,
        lastModifiedAt: new Date().toISOString(),
    });
    batch.delete(doc(db, COLLECTIONS.VEHICLES, from.id));
    await batch.commit();
    logAudit(`Vehicle merged: "${from.name}" into "${keep.name}" (${records.length} records moved)`, 'Fleet');
    return records.length;
}

/** Undoes one merge into `keep`. Returns how many records were moved back. */
export async function splitVehicle(keep: Vehicle, entry: VehicleMergeEntry, username: string): Promise<number> {
    const { db } = getFirebase();
    // Only move back records that still exist and still point at `keep`.
    const current = new Set((await recordsOf(keep.id)).map(r => r.path));
    const moveBack = entry.records.filter(r => current.has(r.path));

    const { id: restoredId, ...restored } = entry.vehicle;
    const batch = writeBatch(db);
    batch.set(doc(db, COLLECTIONS.VEHICLES, restoredId), { ...restored, lastModifiedBy: username, lastModifiedAt: new Date().toISOString() });
    const removed = new Set(entry.addedAliases.map(normalizeName));
    batch.update(doc(db, COLLECTIONS.VEHICLES, keep.id), {
        aliases: (keep.aliases || []).filter(a => !removed.has(normalizeName(a))),
        mergeHistory: (keep.mergeHistory || []).filter(e => !(e.vehicle.id === restoredId && e.mergedAt === entry.mergedAt)),
        lastModifiedBy: username,
        lastModifiedAt: new Date().toISOString(),
    });
    await batch.commit();
    await repoint(moveBack, restoredId);
    logAudit(`Vehicle split: "${entry.vehicle.name}" restored from "${keep.name}" (${moveBack.length} records moved back)`, 'Fleet');
    return moveBack.length;
}
