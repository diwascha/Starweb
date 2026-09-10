/**
 * Box Construction Engine - data model.
 *
 * The old costing model assumed a box was made from ONE paper spec: a
 * single `paperType` + `paperBf` applied to every ply, with the GSM of each
 * ply held in flat fields (topGsm, flute1Gsm, middleGsm, ...). Real
 * enquiries aren't like that - a 3 ply box can be Virgin Kraft 20BF 150gsm
 * outside, Kraft 18BF 140gsm in the middle and Duplex 16BF 100gsm inside.
 *
 * This module models a box as an ORDERED LIST OF LAYERS, outer to inner,
 * where every layer carries its own material. Nothing here is hard-coded to
 * 3 ply: 2, 3, 5, 7, 9 and arbitrary custom stacks all use the same shape.
 *
 * The pipeline is deliberately split so each stage stays independently
 * testable and replaceable (see index.ts `analyzeBox`):
 *
 *   A. Construction  -> the layer stack + geometry            (this file)
 *   B. Material      -> what paper, at what rate              (cost.ts)
 *   C. Weight        -> grams per layer, per box, per order   (cost.ts)
 *   D. Cost          -> NPR per layer, per box, per order     (cost.ts)
 *   E. Strength      -> burst / ECT / BCT                     (strength.ts)
 *   F. Requirement   -> what the customer actually asked for  (recommend.ts)
 *   G. Recommendation-> business verdict on E vs F            (recommend.ts)
 */

/** A layer is either a flat facing sheet, or fluted (corrugated) medium. */
export type LayerKind = 'liner' | 'flute';

/**
 * Where a layer sits in the stack. Derived from position, never stored, so
 * it stays correct when layers are added, removed or reordered.
 */
export type LayerRole = 'outer' | 'middle' | 'inner' | 'flute';

/** One physical layer of the board. */
export interface BoxLayer {
  id: string;
  kind: LayerKind;
  /** Paper/material family: KRAFT, VIRGIN, DUPLEX, ... Free-form so new
   *  materials don't need a code change. */
  paperType: string;
  /** Bursting Factor, stored in the app's usual "18 BF" display form. */
  bf: string;
  gsm: string;
  /** Flute profile (A/B/C/E/F) - only meaningful when kind === 'flute'.
   *  Drives the take-up factor and the board caliper. */
  fluteProfile?: string;
  /** Optional grade/finish note, e.g. "Semi Virgin", "White Top". */
  grade?: string;
  /** Measured caliper in microns. Optional - falls back to a GSM-derived
   *  estimate for board thickness. */
  caliperMicron?: string;
  /** Measured Ring Crush (RCT) in kN/m. When supplied for every layer the
   *  ECT becomes a real measured-input calculation instead of an estimate. */
  rctKnPerM?: string;
  /** NPR/kg override, for materials the global rate table doesn't cover
   *  (e.g. Duplex). Beats the global lookup when set. */
  rateOverride?: string;
  /** Link to a raw material record, for purchase ordering. */
  materialRef?: string;
  supplier?: string;
  note?: string;
}

/** The full construction of one box. */
export interface BoxConstruction {
  layers: BoxLayer[];
  /** Kept for display/compat: '3', '5', '7', '9'. Derived from layers.length
   *  when layers are present. */
  plyLabel: string;
}

/** Stage A output - resolved geometry, shared by every downstream stage. */
export interface BoxGeometry {
  l: number;
  b: number;
  h: number;
  pcs: number;
  /** Cut sheet size in mm. */
  sheetSizeL: number;
  sheetSizeB: number;
  /** Sheet area in m^2 (one box). */
  sheetArea: number;
  /** True when h > 0 - a box rather than a flat sheet/pad. */
  isBox: boolean;
}

/** Stage B/C/D output for a single layer. */
export interface LayerBreakdown {
  layerId: string;
  position: number;
  role: LayerRole;
  roleLabel: string;
  kind: LayerKind;
  paperType: string;
  bf: string;
  gsm: number;
  /** Take-up factor: 1 for liners, flute profile factor for medium. */
  takeUp: number;
  /** gsm * takeUp - the grammage this layer actually contributes. */
  effectiveGsm: number;
  /** Net grams for ONE box (before wastage). */
  weightPerBox: number;
  /** Net grams for the whole run (weightPerBox * pcs). */
  weightNet: number;
  /** Gross grams for the run, including wastage. This is what gets bought. */
  weightGross: number;
  /** Resolved NPR/kg for the paper alone (before conversion). */
  paperRate: number;
  /** Where that rate came from - useful for explaining a surprising cost. */
  rateSource: 'kraft-bf' | 'virgin' | 'other-global' | 'override' | 'none';
  /** paperRate + conversion cost. */
  effectiveRate: number;
  /** NPR for this layer across the whole run. */
  cost: number;
  /** True when no rate could be resolved - cost is understated, not free. */
  rateMissing: boolean;
}

/** A consolidated purchase line. Identical material+BF+GSM across several
 *  layers collapses into one line, while `layerPositions` keeps the trail
 *  back to the individual layers. */
export interface MaterialRequirementLine {
  key: string;
  paperType: string;
  bf: string;
  gsm: number;
  /** Which layer positions contributed (1-based, outer first). */
  layerPositions: number[];
  roleLabels: string[];
  /** Net grams of this material in ONE box. */
  weightPerBox: number;
  /** Gross kg for the whole run, wastage included. */
  totalKg: number;
  cost: number;
  rateMissing: boolean;
}

/** Confidence in a strength figure. `measured` means every input came from
 *  real test data; `estimated` means a correlation filled a gap. */
export type StrengthConfidence = 'measured' | 'estimated' | 'unavailable';

/** Stage E output. */
export interface StrengthResult {
  /** Combined board burst strength, kgf/cm^2. Computed directly from BF and
   *  GSM, which the app already collects - this figure is not a guess. */
  burstKgfPerCm2: number;
  /** Edge Crush Test, kN/m. */
  ectKnPerM: number;
  ectConfidence: StrengthConfidence;
  /** Board caliper in mm, summed from flute profiles + liner calipers. */
  caliperMm: number;
  caliperConfidence: StrengthConfidence;
  /** Box perimeter in mm (2 * (l + b)). */
  perimeterMm: number;
  /** Box Compression Test estimate via McKee, kgf. */
  bctKgf: number;
  bctConfidence: StrengthConfidence;
  /** Total derating divisor applied to BCT to get a safe working load. */
  safetyDivisor: number;
  /** Breakdown of where the divisor came from, for transparency. */
  derating: { label: string; factor: number; note: string }[];
  /** BCT / safetyDivisor, kgf - the load one box may safely carry when
   *  stacked, for the configured conditions. */
  workingLoadKg: number;
  /** Anything that weakened confidence, shown verbatim in the UI. */
  limitations: string[];
}

/** Stage G verdict. */
export type FitVerdict =
  | 'no-requirement'
  | 'suitable'
  | 'borderline'
  | 'under-specified'
  | 'over-specified'
  | 'unavailable';

/** Stage F/G output. */
export interface RecommendationResult {
  requiredLoadKg: number;
  workingLoadKg: number;
  estimatedCapacityKg: number;
  /** workingLoad / required. >1 means headroom. */
  safetyMargin: number;
  verdict: FitVerdict;
  headline: string;
  detail: string;
  /** Concrete, actionable next steps - never a bare "make it stronger". */
  suggestions: string[];
}

/** Conditions the box will actually live in. These drive the derating
 *  factors, and are the difference between a lab number and a usable one. */
export interface ServiceConditions {
  /** How long the load sits stacked. Creep is the single biggest derate. */
  storageDuration?: 'short' | 'medium' | 'long';
  /** Ambient humidity during storage/transit. */
  humidity?: 'low' | 'normal' | 'high';
  /** How boxes are stacked on the pallet. */
  stacking?: 'aligned' | 'interlocked' | 'overhang';
  /** Customer's stated load requirement, kg per box. */
  requiredLoadKg?: string;
}

/** Global rate inputs, mirroring the existing costing settings. */
export interface RateContext {
  kraftByBf: Record<string, number>;
  virgin: number;
  /** Rates for materials outside the kraft/virgin pair, keyed by uppercase
   *  material name (e.g. DUPLEX). */
  other?: Record<string, number>;
  conversion: number;
  transport: number;
  transportType: string;
  isAccessory?: boolean;
  accessoryConversion?: number;
}

/** The complete analysis of one item. */
export interface BoxAnalysis {
  geometry: BoxGeometry;
  construction: BoxConstruction;
  layers: LayerBreakdown[];
  /** Net grams for ONE box, before wastage. */
  boxWeightNet: number;
  /** Gross grams for ONE box, wastage included. */
  boxWeightGross: number;
  /** Grams lost to wastage/conversion for ONE box. */
  conversionLossPerBox: number;
  wastagePercent: number;
  /** Combined grammage of the board, g/m^2 (sum of effective GSM). */
  totalGsm: number;
  /** Net grams across the whole run. */
  totalWeightNet: number;
  /** Gross grams across the whole run. */
  totalWeightGross: number;
  materials: MaterialRequirementLine[];
  paperCost: number;
  transportCost: number;
  totalCost: number;
  costPerBox: number;
  rateMissing: boolean;
  strength: StrengthResult;
  recommendation: RecommendationResult;
}
