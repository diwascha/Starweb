'use client';

/**
 * @fileOverview Sign a user out after a period of inactivity.
 *
 * This app runs on shop-floor and office machines that are shared, left
 * unlocked, and walked away from. Firebase persists the session to
 * localStorage by default, so without this a signed-in browser stays signed
 * in indefinitely - across restarts, for anyone who sits down at it. The
 * Tauri desktop wrapper is the same webview, so it has the same exposure and
 * gets the same treatment from this one hook.
 *
 * Design notes, because idle timers are easy to get subtly wrong:
 *
 *   - Activity is recorded into a ref (and mirrored to localStorage), and a
 *     single interval does the checking. Resetting a setTimeout on every
 *     mousemove would churn timers hundreds of times a minute.
 *   - The deadline is stored, not just held in memory. A laptop that sleeps
 *     for two hours has not "been active"; on wake the stored timestamp is
 *     old and the session ends immediately. An in-memory timer would happily
 *     resume as if nothing happened.
 *   - The timestamp is shared across tabs through the storage event, so
 *     working in one tab does not let another tab log you out.
 *   - A warning fires shortly before the deadline. Silently discarding a
 *     half-filled purchase order is its own kind of bug.
 */

import { useEffect, useRef } from 'react';

/** Inactivity permitted before the session ends. */
export const IDLE_TIMEOUT_MS = 30 * 60 * 1000;

/** How long before the deadline the user is warned. */
export const IDLE_WARNING_MS = 2 * 60 * 1000;

/** How often the deadline is evaluated. */
const CHECK_INTERVAL_MS = 15 * 1000;

/** Activity within this window is not re-recorded, so a moving mouse does not
 *  hammer localStorage. */
const RECORD_THROTTLE_MS = 5 * 1000;

const LAST_ACTIVITY_KEY = 'starsutra:lastActivity';

const ACTIVITY_EVENTS = [
    'mousedown', 'mousemove', 'keydown', 'touchstart', 'wheel', 'scroll',
] as const;

const readStoredActivity = (): number | null => {
    try {
        const raw = localStorage.getItem(LAST_ACTIVITY_KEY);
        if (!raw) return null;
        const n = Number(raw);
        return Number.isFinite(n) ? n : null;
    } catch {
        return null;
    }
};

const writeStoredActivity = (ts: number) => {
    try {
        localStorage.setItem(LAST_ACTIVITY_KEY, String(ts));
    } catch {
        /* private window - the in-memory ref still drives the timer */
    }
};

export const clearStoredActivity = () => {
    try {
        localStorage.removeItem(LAST_ACTIVITY_KEY);
    } catch {
        /* nothing to do */
    }
};

export interface IdleLogoutOptions {
    /** Only armed while someone is signed in. */
    enabled: boolean;
    onIdle: () => void;
    onWarning?: (msSinceActivity: number) => void;
    timeoutMs?: number;
    warningMs?: number;
}

export const useIdleLogout = ({
    enabled,
    onIdle,
    onWarning,
    timeoutMs = IDLE_TIMEOUT_MS,
    warningMs = IDLE_WARNING_MS,
}: IdleLogoutOptions) => {
    const lastActivityRef = useRef<number>(Date.now());
    const warnedRef = useRef(false);
    const firedRef = useRef(false);
    const onIdleRef = useRef(onIdle);
    const onWarningRef = useRef(onWarning);

    onIdleRef.current = onIdle;
    onWarningRef.current = onWarning;

    useEffect(() => {
        if (!enabled) return;

        // Adopt a stored timestamp from a previous run or another tab, so a
        // session left open overnight is already past its deadline here.
        const stored = readStoredActivity();
        lastActivityRef.current = stored ?? Date.now();
        if (stored === null) writeStoredActivity(lastActivityRef.current);
        warnedRef.current = false;
        firedRef.current = false;

        let lastRecorded = 0;
        const record = () => {
            const now = Date.now();
            lastActivityRef.current = now;
            warnedRef.current = false;
            if (now - lastRecorded >= RECORD_THROTTLE_MS) {
                lastRecorded = now;
                writeStoredActivity(now);
            }
        };

        // Returning to the tab is activity; so is another tab reporting it.
        const onVisibility = () => { if (!document.hidden) record(); };
        const onStorage = (e: StorageEvent) => {
            if (e.key !== LAST_ACTIVITY_KEY || !e.newValue) return;
            const n = Number(e.newValue);
            if (Number.isFinite(n) && n > lastActivityRef.current) {
                lastActivityRef.current = n;
                warnedRef.current = false;
            }
        };

        ACTIVITY_EVENTS.forEach(evt =>
            window.addEventListener(evt, record, { passive: true })
        );
        document.addEventListener('visibilitychange', onVisibility);
        window.addEventListener('focus', record);
        window.addEventListener('storage', onStorage);

        const tick = () => {
            if (firedRef.current) return;
            const idleFor = Date.now() - lastActivityRef.current;

            if (idleFor >= timeoutMs) {
                firedRef.current = true;
                clearStoredActivity();
                onIdleRef.current();
                return;
            }
            if (!warnedRef.current && idleFor >= timeoutMs - warningMs) {
                warnedRef.current = true;
                onWarningRef.current?.(idleFor);
            }
        };

        // Check once immediately: this is what ends a session that was left
        // open while the machine slept.
        tick();
        const interval = setInterval(tick, CHECK_INTERVAL_MS);

        return () => {
            clearInterval(interval);
            ACTIVITY_EVENTS.forEach(evt => window.removeEventListener(evt, record));
            document.removeEventListener('visibilitychange', onVisibility);
            window.removeEventListener('focus', record);
            window.removeEventListener('storage', onStorage);
        };
    }, [enabled, timeoutMs, warningMs]);
};
