/**
 * Box Construction Engine - physical constants and calibration.
 *
 * Everything in here is either (a) a published industry-standard value, or
 * (b) an explicitly-labelled calibration constant that should be tuned
 * against your own lab results. Nothing is an unlabelled guess - where a
 * number is an estimate, the code that uses it marks its output
 * `estimated` and records a limitation string that the UI shows.
 */

import type { LayerRole } from './types';

/**
 * Flute profiles.
 *
 * `takeUp` is the ratio of fluted medium consumed per unit of board length.
 *
 * These are DEFAULTS, not fixed law. Mills quote different take-ups and
 * revise them, so every value here can be overridden per quotation from the
 * costing screen (Flute Take-up, stored on the report alongside the paper
 * rates). A saved quotation keeps the factors it was costed with, so
 * changing them later never silently reprices past work.
 *
 * IMPORTANT - B is pinned to 1.35 on purpose. The legacy formula in
 * cost-calculator.ts multiplied EVERY flute's GSM by a hard-coded 1.35, and
 * every record ever saved by this app has fluteType 'B' (it was defaulted in
 * three places and never exposed in the UI). Keeping B at exactly 1.35 means
 * the new engine reproduces every historical quotation to the rupee, while
 * A/C/E become available for new work.
 *
 * `heightMm` is the nominal flute height, used for board caliper.
 */
export const FLUTE_PROFILES: Record<string, { label: string; takeUp: number; heightMm: number }> = {
  A: { label: 'A Flute (coarse)', takeUp: 1.55, heightMm: 4.7 },
  B: { label: 'B Flute (standard)', takeUp: 1.35, heightMm: 2.5 },
  C: { label: 'C Flute (medium)', takeUp: 1.43, heightMm: 3.6 },
  E: { label: 'E Flute (fine)', takeUp: 1.27, heightMm: 1.5 },
  F: { label: 'F Flute (micro)', takeUp: 1.25, heightMm: 0.8 },
};

/** Take-up used when a flute layer has no profile set. Matches legacy B. */
export const DEFAULT_FLUTE_TAKEUP = 1.35;
export const DEFAULT_FLUTE_PROFILE = 'B';

/** Materials the costing knows how to rate. `rateKey` says where the NPR/kg
 *  comes from: the kraft-by-BF table, the single virgin rate, or the
 *  "other materials" rate map (which falls back to a per-layer override). */
export const PAPER_MATERIALS: { value: string; label: string; rateKey: 'kraft-bf' | 'virgin' | 'other' }[] = [
  { value: 'KRAFT', label: 'Kraft', rateKey: 'kraft-bf' },
  { value: 'VIRGIN', label: 'Virgin Kraft', rateKey: 'virgin' },
  { value: 'SEMI_VIRGIN', label: 'Semi Virgin', rateKey: 'other' },
  { value: 'DUPLEX', label: 'Duplex', rateKey: 'other' },
  { value: 'WHITE_TOP', label: 'White Top', rateKey: 'other' },
  { value: 'GOLDEN', label: 'Golden Kraft', rateKey: 'other' },
];

export const MATERIAL_LABELS: Record<string, string> = PAPER_MATERIALS.reduce(
  (acc, m) => { acc[m.value] = m.label; return acc; },
  {} as Record<string, string>
);

export const materialLabel = (v: string) => MATERIAL_LABELS[v] || v || 'Unspecified';

/**
 * Liner bulk, cm^3/g - converts GSM to caliper when no measured caliper is
 * entered. 1.5 is the usual figure for recycled/kraft liner. Only affects
 * the board thickness that feeds McKee, and the result is flagged as an
 * estimate whenever this fallback is used.
 */
export const LINER_BULK_CM3_PER_G = 1.5;

/**
 * ECT estimation from BF and GSM - CALIBRATION CONSTANTS, NOT A LAW.
 *
 * A rigorous ECT needs the Ring Crush (RCT) or CMT of each component, which
 * this app does not collect today. What it does collect is Bursting Factor
 * and grammage. Compressive strength scales strongly with grammage and more
 * weakly with paper quality, so the fallback used here is:
 *
 *     RCT_layer (kN/m) = COEFF * (gsm / 100) * (bf / REF_BF) ^ EXPONENT
 *     ECT = sum over layers of RCT_layer * takeUp
 *
 * The defaults are calibrated so a common 3 ply 120/100/120 at 18 BF lands
 * near 4.0 kN/m, which matches typical measured board in this range. Treat
 * the output as an INDICATION. Enter measured RCT per layer (or a measured
 * board ECT) and the engine switches to the real calculation and reports
 * confidence `measured`.
 */
export const ECT_ESTIMATION = {
  COEFF: 1.0,
  REF_BF: 16,
  EXPONENT: 0.5,
};

/**
 * McKee short-form constant. Published, standard, not tunable:
 *
 *     BCT (N) = 5.87 * ECT (kN/m) * sqrt( caliper (mm) * perimeter (mm) )
 *
 * (1 kN/m == 1 N/mm, so the units resolve to newtons.)
 */
export const MCKEE_CONSTANT = 5.87;

export const NEWTON_TO_KGF = 1 / 9.80665;

/**
 * Derating factors applied to a lab BCT to get a safe working load.
 *
 * These are the standard corrugated-industry allowances. A BCT figure is a
 * short-duration crush in a conditioned lab; a real pallet sits for weeks in
 * real humidity, so the raw number must never be quoted as a carrying
 * capacity. Each factor below is shown to the user with its reason.
 */
export const DERATING = {
  /** Applied always: general design margin for board variability, box
   *  manufacture, handling shock and score quality. */
  BASE: { factor: 1.5, label: 'Design margin', note: 'Board variability, creasing quality and handling shock' },
  DURATION: {
    short: { factor: 1.0, label: 'Short storage', note: 'Under ~10 days stacked - little creep' },
    medium: { factor: 1.6, label: 'Medium storage', note: 'Up to ~30 days stacked - board loses roughly 35-40% to creep' },
    long: { factor: 2.0, label: 'Long storage', note: 'Months stacked - board loses roughly 50% to creep' },
  },
  HUMIDITY: {
    low: { factor: 1.0, label: 'Dry conditions', note: 'Around 50% RH - reference condition' },
    normal: { factor: 1.3, label: 'Normal humidity', note: 'Around 65-70% RH' },
    high: { factor: 2.0, label: 'High humidity', note: 'Around 85%+ RH or monsoon - board loses roughly half its strength' },
  },
  STACKING: {
    aligned: { factor: 1.0, label: 'Column stacked', note: 'Corners aligned - corners carry the load' },
    interlocked: { factor: 1.5, label: 'Interlocked', note: 'Cross-tied pattern - corners do not line up' },
    overhang: { factor: 1.4, label: 'Pallet overhang', note: 'Box edges unsupported at the pallet edge' },
  },
};

export const DEFAULT_CONDITIONS = {
  storageDuration: 'medium' as const,
  humidity: 'normal' as const,
  stacking: 'aligned' as const,
};

/** Over-specification threshold: a construction whose safe working load
 *  exceeds the requirement by more than this is flagged as costing more
 *  than the job needs. */
export const OVER_SPEC_RATIO = 1.8;
/** Borderline band: meeting the requirement by less than this much headroom
 *  is a pass, but a nervous one. */
export const BORDERLINE_RATIO = 1.1;

/** Human labels for a layer's position in the stack. */
export const roleLabel = (role: LayerRole, kind: string, ordinal: number, totalOfKind: number): string => {
  if (kind === 'flute') return totalOfKind > 1 ? `Flute ${ordinal}` : 'Flute';
  if (role === 'outer') return 'Outer';
  if (role === 'inner') return 'Inner';
  return totalOfKind > 3 ? `Middle ${ordinal - 1}` : 'Middle';
};
