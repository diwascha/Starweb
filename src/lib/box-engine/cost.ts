/**
 * Box Construction Engine - stages B, C and D.
 *
 *   B. Material - resolve each layer's paper and its NPR/kg
 *   C. Weight   - grams per layer, per box and per order
 *   D. Cost     - NPR per layer, per box and per order
 *
 * The arithmetic per layer is the same arithmetic the old single-material
 * formula did in one lump:
 *
 *     weight = sheetArea * (gsm * takeUp) * pcs
 *     gross  = weight * (1 + wastage)
 *     cost   = gross / 1000 * (paperRate + conversion)
 *
 * Because cost is linear in grammage, summing it layer by layer gives the
 * identical total to the old whole-board calculation whenever every layer
 * shares one material - which is what makes this a safe refactor rather
 * than a formula change. The difference is that layers may now each carry
 * their own rate, which the old lump-sum arithmetic could not express.
 */

import { normalizeBF } from '../utils';
import { DEFAULT_FLUTE_PROFILE, DEFAULT_FLUTE_TAKEUP, FLUTE_PROFILES, PAPER_MATERIALS } from './constants';
import { describeLayers } from './layers';
import type {
  BoxGeometry, BoxLayer, LayerBreakdown, MaterialRequirementLine, RateContext,
} from './types';

const num = (v: any): number => {
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
};

/**
 * Take-up for one flute profile, honouring a per-quotation override.
 *
 * Different mills quote different take-ups for the same profile and revise
 * them over time, so the built-in table is only a default. `overrides` comes
 * from the report's own stored factors, which is what lets a historical
 * quotation keep costing exactly as it did when it was quoted.
 */
export const resolveTakeUp = (
  profileKey: string | undefined,
  overrides?: Record<string, number>
): number => {
  const key = profileKey || DEFAULT_FLUTE_PROFILE;
  const override = overrides?.[key];
  if (typeof override === 'number' && override > 0) return override;
  return FLUTE_PROFILES[key]?.takeUp ?? DEFAULT_FLUTE_TAKEUP;
};

/** Take-up: liners lie flat, fluted medium consumes extra paper. Each flute
 *  layer resolves independently, so a double wall can be B+B, A+A, or a
 *  mixed B+C without the engine treating them as one profile. */
export const layerTakeUp = (layer: BoxLayer, overrides?: Record<string, number>): number => {
  if (layer.kind !== 'flute') return 1;
  return resolveTakeUp(layer.fluteProfile, overrides);
};

const rateKeyFor = (paperType: string): 'kraft-bf' | 'virgin' | 'other' =>
  PAPER_MATERIALS.find(m => m.value === paperType)?.rateKey || 'other';

/**
 * Stage B. Resolve one layer's paper rate.
 *
 * A per-layer override always wins - that is how a material the global rate
 * table has never heard of (Duplex, a one-off imported reel) gets priced
 * without waiting for a settings change. A resolved rate of 0 means no rate
 * was configured, NOT that the paper is free, and is reported as such so the
 * UI can warn and the catalog sync can refuse to write a bogus figure.
 */
export const resolveLayerRate = (
  layer: BoxLayer,
  rates: RateContext
): { rate: number; source: LayerBreakdown['rateSource'] } => {
  const override = num(layer.rateOverride);
  if (override > 0) return { rate: override, source: 'override' };

  switch (rateKeyFor(layer.paperType)) {
    case 'kraft-bf': {
      const rate = rates.kraftByBf?.[normalizeBF(layer.bf)] || 0;
      return rate > 0 ? { rate, source: 'kraft-bf' } : { rate: 0, source: 'none' };
    }
    case 'virgin':
      return rates.virgin > 0 ? { rate: rates.virgin, source: 'virgin' } : { rate: 0, source: 'none' };
    default: {
      const rate = rates.other?.[(layer.paperType || '').toUpperCase()] || 0;
      return rate > 0 ? { rate, source: 'other-global' } : { rate: 0, source: 'none' };
    }
  }
};

/** Stages B + C + D for the whole stack. */
export const calculateLayers = (
  layers: BoxLayer[],
  geometry: BoxGeometry,
  wastagePercent: number,
  rates: RateContext
): LayerBreakdown[] => {
  const conversion = rates.isAccessory
    ? (rates.accessoryConversion || 0)
    : (rates.conversion || 0);
  const wastageMultiplier = 1 + (wastagePercent / 100);

  return describeLayers(layers).map(({ layer, position, role, roleLabel: label }) => {
    const gsm = num(layer.gsm);
    const takeUp = layerTakeUp(layer, rates.fluteTakeUps);
    const effectiveGsm = gsm * takeUp;

    const weightPerBox = geometry.sheetArea * effectiveGsm;
    const weightNet = weightPerBox * geometry.pcs;
    const weightGross = weightNet * wastageMultiplier;

    const { rate, source } = resolveLayerRate(layer, rates);
    const effectiveRate = rate + conversion;

    return {
      layerId: layer.id,
      position,
      role,
      roleLabel: label,
      kind: layer.kind,
      paperType: layer.paperType,
      bf: normalizeBF(layer.bf),
      gsm,
      takeUp,
      effectiveGsm,
      weightPerBox,
      weightNet,
      weightGross,
      paperRate: rate,
      rateSource: source,
      effectiveRate,
      cost: (weightGross / 1000) * effectiveRate,
      // Only a layer that actually contributes paper can be "missing" a
      // rate - a 0 gsm placeholder row shouldn't raise an alarm.
      rateMissing: source === 'none' && gsm > 0,
    };
  });
};

/**
 * Consolidate layers into purchase lines.
 *
 * Two layers of the same material at the same BF and GSM are the same reel
 * and must be bought as one quantity, so they collapse into a single line.
 * `layerPositions` and `roleLabels` keep the trail back to the individual
 * layers, so consolidating for the purchase order never loses the
 * construction detail.
 */
export const consolidateMaterials = (breakdowns: LayerBreakdown[]): MaterialRequirementLine[] => {
  const byKey = new Map<string, MaterialRequirementLine>();

  breakdowns.forEach(b => {
    if (b.gsm <= 0) return;
    const key = `${b.paperType}|${b.bf}|${b.gsm}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.layerPositions.push(b.position);
      existing.roleLabels.push(b.roleLabel);
      existing.weightPerBox += b.weightPerBox;
      existing.totalKg += b.weightGross / 1000;
      existing.cost += b.cost;
      existing.rateMissing = existing.rateMissing || b.rateMissing;
    } else {
      byKey.set(key, {
        key,
        paperType: b.paperType,
        bf: b.bf,
        gsm: b.gsm,
        layerPositions: [b.position],
        roleLabels: [b.roleLabel],
        weightPerBox: b.weightPerBox,
        totalKg: b.weightGross / 1000,
        cost: b.cost,
        rateMissing: b.rateMissing,
      });
    }
  });

  return Array.from(byKey.values()).sort((a, b) => a.layerPositions[0] - b.layerPositions[0]);
};

/** Transport, unchanged from the original rule: per-piece transport applies
 *  to the box itself, never to its accessories (they ride in the same box);
 *  per-consignment transport is added once at report level, not here. */
export const calculateTransport = (geometry: BoxGeometry, rates: RateContext): number => {
  if (rates.transportType !== 'Per Piece' || rates.isAccessory) return 0;
  return (rates.transport || 0) * geometry.pcs;
};
