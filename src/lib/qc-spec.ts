/**
 * @fileOverview Product specification helpers for QT reports: the moisture
 * class a product is specified at, the GSM / box weight / load expected at
 * that moisture, and suggesting stapling / overlap from similar boxes.
 *
 * These produce SPECIFICATION (target) values for the product catalog. They
 * never fill in measured test results.
 */

import { analyzeBox } from './box-engine';
import type { Product } from './types';

export type MoistureClass = 'low' | 'normal' | 'high';

export const MOISTURE_CLASSES: Record<MoistureClass, { label: string; range: string; mid: number }> = {
    low: { label: 'Low', range: '6-6.9', mid: 6.45 },
    normal: { label: 'Normal', range: '7-7.9', mid: 7.45 },
    high: { label: 'High', range: '8-10', mid: 9 },
};

/** Moisture the paper's nominal GSM and the strength model refer to. */
export const REFERENCE_MOISTURE = 7.5;
/** Compression strength lost per percentage point of extra moisture (and
 *  gained per point drier). Industry rule of thumb is roughly 8-9%. */
export const STRENGTH_LOSS_PER_POINT = 0.08;

/** The class a stored moisture spec belongs to ("7-7.9" -> normal). */
export const moistureClassOf = (spec?: string): MoistureClass | null => {
    const n = (String(spec || '').match(/\d+(?:\.\d+)?/g) || []).map(Number);
    if (!n.length) return null;
    const mid = n.length >= 2 ? (n[0] + n[1]) / 2 : n[0];
    return mid < 7 ? 'low' : mid < 8 ? 'normal' : 'high';
};

/**
 * Board GSM, box weight (g) and load (BCT, kgf) expected at a moisture class,
 * from the product's construction and dimensions. Water adds weight and
 * takes away strength:
 *   GSM, weight  x (100 - 7.5) / (100 - moisture)
 *   load         x (1 - 8%) ^ (moisture - 7.5)
 * Returns null when dimensions or layer GSMs are missing.
 */
export function specAtMoisture(item: Record<string, any>, cls: MoistureClass) {
    const analysis = analyzeBox({ ...item, noOfPcs: '1' }, {
        kraftByBf: {}, virgin: 0, other: {}, conversion: 0, transport: 0, transportType: 'Per Consignment',
    });
    if (!analysis.totalGsm || !analysis.totalWeightNet) return null;
    const m = MOISTURE_CLASSES[cls].mid;
    const waterFactor = (100 - REFERENCE_MOISTURE) / (100 - m);
    const strengthFactor = Math.pow(1 - STRENGTH_LOSS_PER_POINT, m - REFERENCE_MOISTURE);
    return {
        gsm: Math.round(analysis.totalGsm * waterFactor),
        weightOfBox: Math.round(analysis.totalWeightNet * waterFactor),
        load: analysis.strength.bctKgf > 0 ? Math.round(analysis.strength.bctKgf * strengthFactor) : null,
    };
}

export const COPYABLE_FROM_SIMILAR = ['stapleWidth', 'stapling', 'overlapWidth'] as const;

const dims = (d?: string) => (String(d || '').match(/\d+(?:\.\d+)?/g) || []).map(Number).slice(0, 3);

/**
 * For each of staple width / stapling / overlap width, the value used on the
 * catalog product most like this one: same ply first, then closest
 * dimensions. Nothing is invented - a field no similar product has stays out.
 */
export function suggestFromSimilar(
    spec: Record<string, any>, catalog: Product[], excludeId?: string,
): Partial<Record<(typeof COPYABLE_FROM_SIMILAR)[number], { value: string; from: string }>> {
    const [l, b, h] = dims(spec.dimension);
    const ply = String(spec.ply || '');
    const score = (p: Product) => {
        const [pl, pb, ph] = dims(p.specification?.dimension);
        const sizeGap = [l - (pl ?? 0), b - (pb ?? 0), h - (ph ?? 0)].reduce((s, x) => s + Math.abs(x || 0), 0);
        return (String(p.specification?.ply || '') === ply ? 0 : 100000) + sizeGap;
    };
    const ranked = catalog.filter(p => p.id !== excludeId).sort((a, b2) => score(a) - score(b2));
    const out: ReturnType<typeof suggestFromSimilar> = {};
    for (const key of COPYABLE_FROM_SIMILAR) {
        const hit = ranked.find(p => String(p.specification?.[key] ?? '').trim());
        if (hit) out[key] = { value: String(hit.specification![key]), from: hit.name };
    }
    return out;
}
