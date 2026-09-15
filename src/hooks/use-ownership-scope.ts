'use client';

import { useCallback, useMemo } from 'react';
import { useAuth } from '@/hooks/use-auth';
import type { Module, AccountOwnership } from '@/lib/types';

/**
 * The one canonical way to apply ownership-scope filtering to a module's
 * data. Call this once per page/component, then run every fetched array of
 * ownership-bearing records (Vehicle, Party, Account, Transaction, Trip,
 * Expense, etc.) through `inScope` or `filter` BEFORE it reaches state or a
 * table - not just when populating a dropdown.
 *
 * A record with `ownership: 'Both'` is visible to everyone; anything else is
 * visible only to a user whose `permissions[module].ownerships` includes it
 * (admins see everything). This is a UI-layer filter only - it narrows what
 * renders, not what Firestore itself will return to a determined client.
 *
 * Usage:
 *   const { inScope } = useOwnershipScope('fleet');
 *   onTransactionsUpdate(data => setTransactions(data.filter(t => inScope(t.ownership))));
 */
export function useOwnershipScope(module: Module) {
    const { getAllowedOwnerships } = useAuth();
    const allowedOwnerships = useMemo(() => getAllowedOwnerships(module), [getAllowedOwnerships, module]);

    const inScope = useCallback(
        (ownership: AccountOwnership | null | undefined) => ownership === 'Both' || (!!ownership && allowedOwnerships.includes(ownership)),
        [allowedOwnerships]
    );

    const filter = useCallback(
        <T extends { ownership: AccountOwnership }>(records: T[]): T[] => records.filter(r => inScope(r.ownership)),
        [inScope]
    );

    return { allowedOwnerships, inScope, filter };
}
