/**
 * @fileOverview Matching typed names (truck numbers, party names) against
 * existing records, tolerant of spacing, punctuation, case and small typos.
 */

/** "Na 3 Kha-1234" and "NA3KHA1234" compare equal. */
export const normalizeName = (name: string): string =>
    (name || '').toLowerCase().replace(/[^a-z0-9ऀ-ॿ]/g, '');

const levenshtein = (a: string, b: string): number => {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
        const cur = [i];
        for (let j = 1; j <= b.length; j++) {
            cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        }
        prev = cur;
    }
    return prev[b.length];
};

const digitsOf = (s: string) => s.replace(/\D/g, '');

/**
 * The existing record a typed name most likely means, or null if nothing is
 * close. Close = at most 2 character edits (1 for short names), or the same
 * registration digits (e.g. "Lu 1 Kh 2345" vs "Lu 1 Kha 2345").
 *
 * `confident` is false when the digits differ ("7788" vs "7789"): that may
 * be a typo or a different truck, so it should be suggested, not assumed.
 * `namesOf` returns every name a record goes by (its name plus aliases).
 */
export function closestMatch<T>(name: string, candidates: T[], namesOf: (c: T) => string[]): { match: T; confident: boolean } | null {
    const target = normalizeName(name);
    if (!target) return null;
    const targetDigits = digitsOf(target);
    let best: { match: T; confident: boolean } | null = null;
    let bestScore = Infinity;
    for (const c of candidates) {
        for (const raw of namesOf(c)) {
            const other = normalizeName(raw);
            if (!other) continue;
            const distance = levenshtein(target, other);
            const allowed = Math.min(target.length, other.length) <= 5 ? 1 : 2;
            const sameDigits = targetDigits === digitsOf(other);
            if (distance > allowed && !(sameDigits && targetDigits.length >= 3)) continue;
            const score = sameDigits ? distance - 0.5 : distance;
            if (score < bestScore) { best = { match: c, confident: sameDigits }; bestScore = score; }
        }
    }
    return best;
}

/** A record's name plus its aliases. */
export const allNames = (r: { name: string; aliases?: string[] }): string[] => [r.name, ...(r.aliases || [])];
