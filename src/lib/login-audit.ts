/**
 * @fileOverview Recording failed sign-in attempts without opening a hole.
 *
 * The `logs` collection used to accept `create: if true`, so the login page
 * could write a "Failed Login" entry while nobody was signed in. That also let
 * any anonymous caller write unlimited documents into the database, so the rule
 * now requires authentication - and a FAILED login is by definition
 * unauthenticated. Those audit writes were being silently denied, which means
 * the one event an administrator most wants to see was no longer recorded.
 *
 * Re-opening the rule is not the answer. Instead each failure is queued in this
 * browser and flushed on the next SUCCESSFUL sign-in, when there is a real
 * session to write under. An administrator still sees "three failures before
 * this login, at these times", which is the pattern worth noticing.
 *
 * Two honest limits:
 *
 *   - An attacker hitting Firebase Auth directly never runs this code. Client
 *     logging has never been the real record; Firebase Authentication's own
 *     logs are. This is for spotting the ordinary case - a member of staff
 *     locked out, or someone guessing at a workstation.
 *   - A failure that is never followed by a success on the same browser is
 *     never flushed. That is the trade for not letting strangers write to the
 *     database.
 */

import { logAudit } from '@/services/log-service';

const QUEUE_KEY = 'starsutra:pendingLoginAudits';

/** Keep the queue small: it lives in localStorage and is only ever a hint. */
const MAX_QUEUED = 20;

export interface PendingLoginFailure {
    identifier: string;
    code?: string;
    at: string;
}

/**
 * Mask an attempted identifier before it is stored or logged.
 *
 * People type their password into the username box. Recording that verbatim
 * would put a live credential into an audit log that every administrator can
 * read. Keeping the first and last characters leaves it recognisable to
 * someone who knows their staff, without preserving the secret.
 */
export const maskIdentifier = (raw: string): string => {
    const value = (raw || '').trim();
    if (!value) return '(blank)';

    const at = value.indexOf('@');
    if (at > 0) {
        // An email address: the domain is not sensitive and helps an admin.
        return `${maskIdentifier(value.slice(0, at))}@${value.slice(at + 1)}`;
    }
    if (value.length <= 2) return `${value[0]}*`;
    return `${value[0]}${'*'.repeat(Math.min(value.length - 2, 8))}${value[value.length - 1]}`;
};

const read = (): PendingLoginFailure[] => {
    try {
        const raw = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
        return Array.isArray(raw) ? raw : [];
    } catch {
        return [];
    }
};

/** Remember a failed attempt until someone signs in successfully here. */
export const queueFailedLogin = (identifier: string, code?: string): void => {
    try {
        const queue = read();
        queue.push({ identifier: maskIdentifier(identifier), code, at: new Date().toISOString() });
        localStorage.setItem(QUEUE_KEY, JSON.stringify(queue.slice(-MAX_QUEUED)));
    } catch {
        /* private window: the attempt simply goes unrecorded */
    }
};

/**
 * Write any queued failures to the audit log. Call only once signed in.
 *
 * Returns how many were flushed, so the caller can mention it.
 */
export const flushFailedLogins = (): number => {
    const queue = read();
    if (queue.length === 0) return 0;

    // Clear first. A failure to write must not leave entries that get
    // duplicated on every subsequent login.
    try { localStorage.removeItem(QUEUE_KEY); } catch { /* nothing to clear */ }

    for (const entry of queue) {
        logAudit(
            `Failed Login: ${entry.identifier}`,
            'Security',
            { code: entry.code, attemptedAt: entry.at, recordedOnNextLogin: true }
        );
    }
    return queue.length;
};
