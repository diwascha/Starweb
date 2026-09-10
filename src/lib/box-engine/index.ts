/**
 * Box Construction Engine - public API.
 *
 * `analyzeBox` runs the whole pipeline for one item and is the only thing
 * the UI needs to call:
 *
 *   A. Construction  -> layers.ts     (deriveLayers, resolveGeometry)
 *   B. Material      -> cost.ts       (resolveLayerRate)
 *   C. Weight        -> cost.ts       (calculateLayers)
 *   D. Cost          -> cost.ts       (calculateLayers, calculateTransport)
 *   E. Strength      -> strength.ts   (calculateStrength)
 *   F/G. Requirement -> recommend.ts  (buildRecommendation)
 *
 * Each stage takes the previous stage's output and nothing else, so any one
 * of them can be swapped - a real lab-fed ECT model dropping into stage E,
 * say - without touching the others.
 */

import type { CalculatedValues } from '../types';
import { calculateLayers, calculateTransport, consolidateMaterials } from './cost';
import { deriveLayers, resolveGeometry } from './layers';
import { buildRecommendation } from './recommend';
import { calculateStrength } from './strength';
import type { BoxAnalysis, RateContext, ServiceConditions } from './types';

export * from './types';
export {
  FLUTE_PROFILES, PAPER_MATERIALS, DERATING, DEFAULT_CONDITIONS,
  materialLabel, DEFAULT_FLUTE_PROFILE,
} from './constants';
export {
  deriveLayers, deriveLayersFromLegacy, projectLayersToLegacy, describeLayers,
  makeLayer, sanitizeLayers, isLegacyItem, resolveGeometry, plyToLayerCount,
} from './layers';
export { calculateLayers, consolidateMaterials, resolveLayerRate, layerTakeUp } from './cost';
export { calculateStrength, calculateBurst, calculateEct, calculateCaliper, resolveDerating } from './strength';
export { buildRecommendation } from './recommend';

/** Service conditions live on the item so each box in a quotation can have
 *  its own (a 5 kg carton and a 25 kg carton on the same enquiry are not
 *  stored the same way). */
const readConditions = (item: any): ServiceConditions => ({
  storageDuration: item?.storageDuration,
  humidity: item?.humidity,
  stacking: item?.stacking,
  requiredLoadKg: item?.requiredLoadKg,
});

/** Full analysis of one item. */
export const analyzeBox = (item: any, rates: RateContext): BoxAnalysis => {
  // A. Construction
  const geometry = resolveGeometry(item);
  const layers = deriveLayers(item);
  const wastagePercent = parseFloat(item?.wastagePercent) || 0;

  // B + C + D
  const breakdowns = calculateLayers(layers, geometry, wastagePercent, rates);
  const materials = consolidateMaterials(breakdowns);

  const boxWeightNet = breakdowns.reduce((s, l) => s + l.weightPerBox, 0);
  const totalWeightNet = breakdowns.reduce((s, l) => s + l.weightNet, 0);
  const totalWeightGross = breakdowns.reduce((s, l) => s + l.weightGross, 0);
  const boxWeightGross = boxWeightNet * (1 + wastagePercent / 100);
  const paperCost = breakdowns.reduce((s, l) => s + l.cost, 0);
  const transportCost = calculateTransport(geometry, rates);
  const totalCost = paperCost + transportCost;

  // E
  const conditions = readConditions(item);
  const strength = calculateStrength(layers, geometry, conditions, item?.measuredEct);

  // F + G
  const recommendation = buildRecommendation(strength, layers, conditions);

  return {
    geometry,
    construction: { layers, plyLabel: String(item?.ply || layers.length) },
    layers: breakdowns,
    boxWeightNet,
    boxWeightGross,
    conversionLossPerBox: boxWeightGross - boxWeightNet,
    wastagePercent,
    totalGsm: breakdowns.reduce((s, l) => s + l.effectiveGsm, 0),
    totalWeightNet,
    totalWeightGross,
    materials,
    paperCost,
    transportCost,
    totalCost,
    costPerBox: geometry.pcs > 0 ? totalCost / geometry.pcs : 0,
    rateMissing: breakdowns.some(l => l.rateMissing),
    strength,
    recommendation,
  };
};

/**
 * Collapse an analysis back into the flat `CalculatedValues` the rest of the
 * app already consumes, so the table, the saved-report preview and the PDF
 * export need no changes at all.
 *
 * `paperRate` is a single figure in that old shape but the board may now
 * have several. When every layer shares a rate the exact value is passed
 * through unchanged (which is what keeps historical quotations identical to
 * the rupee); when they differ, the weight-weighted average is reported,
 * since that is the number that actually reproduces the cost.
 */
export const toCalculatedValues = (analysis: BoxAnalysis): CalculatedValues => {
  const rates = analysis.layers.filter(l => l.gsm > 0).map(l => l.effectiveRate);
  const uniform = rates.length > 0 && rates.every(r => r === rates[0]);
  const paperRate = uniform
    ? rates[0]
    : (analysis.totalWeightGross > 0
        ? analysis.paperCost / (analysis.totalWeightGross / 1000)
        : 0);

  return {
    sheetSizeL: analysis.geometry.sheetSizeL,
    sheetSizeB: analysis.geometry.sheetSizeB,
    sheetArea: analysis.geometry.sheetArea,
    totalGsm: analysis.totalGsm,
    paperWeight: analysis.totalWeightNet,
    totalBoxWeight: analysis.totalWeightGross,
    paperRate,
    paperCost: analysis.paperCost,
    transportCost: analysis.transportCost,
    rateMissing: analysis.rateMissing,
  };
};
