/**
 * @fileOverview Judging a measured test value against the product spec, and
 * moisture-correcting GSM / box weight. Pure functions, no Firestore.
 */

export type QcMark = 'Pass' | 'Low' | 'High';

const nums = (s: string): number[] =>
    (String(s || '').match(/\d+(?:\.\d+)?/g) || []).map(Number);

/** Parameters with a ± tolerance, and the unit it is entered in. Load is a
 *  minimum and moisture a range, so neither takes one. */
export const TOLERANCE_PARAMETERS: { key: string; label: string; unit: 'mm' | '%' }[] = [
    { key: 'dimension', label: 'Box size', unit: 'mm' },
    { key: 'gsm', label: 'GSM', unit: '%' },
    { key: 'weightOfBox', label: 'Weight of Box', unit: '%' },
    { key: 'stapleWidth', label: 'Staple Width', unit: 'mm' },
    { key: 'overlapWidth', label: 'Overlap Width', unit: 'mm' },
];

/**
 * Per-parameter tolerance: a number = ± that much (in the parameter's unit),
 * null = not applicable (never judged automatically), missing = built-in default.
 */
export type ToleranceValues = Partial<Record<string, number | null>>;

/** Used where neither the customer nor the default sets a value. */
export const BUILT_IN_TOLERANCES: Record<string, number> = {
    dimension: 3, gsm: 5, weightOfBox: 5, stapleWidth: 2, overlapWidth: 2,
};

/** The tolerance in force for one parameter: the product's own, else built-in. */
export function resolveTolerance(key: string, product?: ToleranceValues): { value: number | null; source: 'product' | 'built-in' } {
    if (product && product[key] !== undefined) return { value: product[key] ?? null, source: 'product' };
    return { value: BUILT_IN_TOLERANCES[key] ?? null, source: 'built-in' };
}

/** Parameters that are checked by eye against the spec, not measured. */
export const VISUAL_PARAMETERS = new Set(['ply', 'stapling', 'printing']);

/**
 * The mark a measured value earns against its spec, or null when it can't be
 * judged automatically (text specs, blank or unreadable values, or a
 * tolerance marked not applicable for this product).
 * `tolerance` is ± in the parameter's unit (mm for sizes, % for GSM/weight).
 */
export function autoMark(key: string, spec: string, measured: string, tolerance: number | null = BUILT_IN_TOLERANCES[key] ?? null): QcMark | null {
    if (VISUAL_PARAMETERS.has(key)) return null;
    const s = nums(spec);
    const m = nums(measured);
    if (!s.length || !m.length) return null;
    const v = m[0];

    // A range such as moisture "6-10", and load as a minimum, need no tolerance.
    if (s.length >= 2 && key !== 'dimension' && /\d\s*(-|–|to)\s*\d/.test(spec)) {
        const [lo, hi] = [Math.min(s[0], s[1]), Math.max(s[0], s[1])];
        return v < lo ? 'Low' : v > hi ? 'High' : 'Pass';
    }
    if (key === 'load') return v < s[0] ? 'Low' : 'Pass';

    if (tolerance == null) return null; // not applicable for this product
    const unit = TOLERANCE_PARAMETERS.find(p => p.key === key)?.unit ?? '%';

    if (key === 'dimension') {
        if (s.length !== m.length) return null;
        if (m.some((x, i) => x < s[i] - tolerance)) return 'Low';
        if (m.some((x, i) => x > s[i] + tolerance)) return 'High';
        return 'Pass';
    }
    const band = unit === '%' ? (s[0] * tolerance) / 100 : tolerance;
    return v < s[0] - band ? 'Low' : v > s[0] + band ? 'High' : 'Pass';
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
