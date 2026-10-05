/**
 * @fileOverview Judging a measured test value against the product spec, and
 * moisture-correcting GSM / box weight. Pure functions, no Firestore.
 */

export type QcMark = 'Pass' | 'Low' | 'High';

const nums = (s: string): number[] =>
    (String(s || '').match(/\d+(?:\.\d+)?/g) || []).map(Number);

/** Relative tolerance for a single-number spec (GSM, weight, widths). */
const TOLERANCE = 0.05;
/** Allowed deviation per side for box dimensions, in the spec's unit (mm). */
const DIMENSION_TOLERANCE = 3;

/** Parameters that are checked by eye against the spec, not measured. */
export const VISUAL_PARAMETERS = new Set(['ply', 'stapling', 'printing']);

/**
 * The mark a measured value earns against its spec, or null when it can't be
 * judged automatically (text specs, blank or unreadable values).
 */
export function autoMark(key: string, spec: string, measured: string): QcMark | null {
    if (VISUAL_PARAMETERS.has(key)) return null;
    const s = nums(spec);
    const m = nums(measured);
    if (!s.length || !m.length) return null;

    if (key === 'dimension') {
        if (s.length !== m.length) return null;
        if (m.some((v, i) => v < s[i] - DIMENSION_TOLERANCE)) return 'Low';
        if (m.some((v, i) => v > s[i] + DIMENSION_TOLERANCE)) return 'High';
        return 'Pass';
    }
    const v = m[0];
    // A range such as moisture "6-10".
    if (s.length >= 2 && /\d\s*(-|–|to)\s*\d/.test(spec)) {
        const [lo, hi] = [Math.min(s[0], s[1]), Math.max(s[0], s[1])];
        return v < lo ? 'Low' : v > hi ? 'High' : 'Pass';
    }
    // Load is a minimum: stronger is never a fault.
    if (key === 'load') return v < s[0] ? 'Low' : 'Pass';
    const lo = s[0] * (1 - TOLERANCE), hi = s[0] * (1 + TOLERANCE);
    return v < lo ? 'Low' : v > hi ? 'High' : 'Pass';
}

/**
 * Converts a value measured at one moisture to another, keeping the dry
 * fibre weight constant: value × (100 − measured%) ÷ (100 − target%).
 */
export function moistureCorrect(value: number, measuredMoisture: number, targetMoisture: number): number | null {
    if (![value, measuredMoisture, targetMoisture].every(Number.isFinite)) return null;
    if (measuredMoisture < 0 || measuredMoisture >= 100 || targetMoisture < 0 || targetMoisture >= 100) return null;
    return (value * (100 - measuredMoisture)) / (100 - targetMoisture);
}

/** Midpoint of a moisture spec ("6-10" → 8), the default correction target. */
export function moistureTarget(spec: string): number | null {
    const s = nums(spec);
    if (!s.length) return null;
    return s.length >= 2 ? (s[0] + s[1]) / 2 : s[0];
}

export const firstNumber = (s: string): number | null => {
    const n = nums(s);
    return n.length ? n[0] : null;
};
