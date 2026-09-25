import { collection, getCountFromServer, query, where } from 'firebase/firestore';
import { getFirebase } from '@/lib/firebase';
import type { AccountOwnership } from '@/lib/types';

/**
 * How many documents in a collection belong to the given ownership scopes,
 * counted by Firestore itself. An aggregation query is billed at about one
 * read per 1,000 documents, instead of one read per document for fetching
 * them all just to take `.length`.
 *
 * Records with no ownership are not counted, matching useOwnershipScope's
 * `inScope`, which also excludes them.
 */
export const countInOwnershipScope = async (
    collectionName: string,
    ownerships: AccountOwnership[],
): Promise<number> => {
    if (ownerships.length === 0) return 0;
    const { db } = getFirebase();
    // `in` accepts up to 30 values; ownership categories are a handful.
    const q = query(collection(db, collectionName), where('ownership', 'in', ownerships.slice(0, 30)));
    const snapshot = await getCountFromServer(q);
    return snapshot.data().count;
};
