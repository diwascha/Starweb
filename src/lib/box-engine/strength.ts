/**
 * Box Construction Engine - stage E, strength.
 *
 * READ THIS BEFORE TRUSTING A NUMBER OUT OF THIS FILE.
 *
 * Three figures come out of here, and they are NOT equally solid:
 *
 * 1. BURST STRENGTH - solid. Bursting Factor is defined as burst strength
 *    divided by grammage, so `BF * GSM / 1000` recovers a layer's burst in
 *    kgf/cm^2 directly from data this app already collects. Summing the
 *    liners is the standard combined-board approximation (fluted medium
 *    contributes very little to a Mullen burst).
 *
 * 2. ECT - depends on the inputs. Edge crush is governed by the compressive
 *    strength (RCT/CMT) of each component, which this app does not collect
 *    today. If the user supplies a measured board ECT, or a measured RCT for
 *    every layer, the calculation is real and reports confidence `measured`.
 *    Otherwise a calibratable BF/GSM correlation fills the gap and the result
 *    is reported as `estimated`, with the reason recorded in `limitations`.
 *
 * 3. BCT - the McKee short formula, which is published and standard. It is
 *    only ever as good as the ECT and caliper fed into it, so it inherits
 *    the weaker of their two confidences.
 *
 * The working load is deliberately NOT the BCT. A BCT is a fast crush of a
 * conditioned box in a lab. A real box sits under a pallet for weeks in real
 * humidity. The derating factors that bridge that gap are listed
 * individually so the user can see exactly why the safe number is far below
 * the lab number, rather than being handed one unexplained figure.
 */

import {
  DERATING, DEFAULT_CONDITIONS, ECT_ESTIMATION, FLUTE_PROFILES,
  LINER_BULK_CM3_PER_G, MCKEE_CONSTANT, NEWTON_TO_KGF,
} from './constants';
import { layerTakeUp } from './cost';
import type {
  BoxGeometry, BoxLayer, ServiceConditions, StrengthConfidence, StrengthResult,
} from './types';

const num = (v: any): number => {
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
};

/** BF is usually stored as "18 BF". */
const bfValue = (bf: string): number => num(String(bf || '').replace(/[^0-9.]/g, ''));

/**
 * Combined board burst, kgf/cm^2.
 * Bursting Factor = burst strength / grammage * 1000, so a layer's burst is
 * BF * GSM / 1000. Only the liners are summed - this is the usual combined
 * board approximation, and it is conservative.
 */
export const calculateBurst = (layers: BoxLayer[]): number =>
  layers
    .filter(l => l.kind === 'liner')
    .reduce((sum, l) => sum + (bfValue(l.bf) * num(l.gsm)) / 1000, 0);

/**
 * Board caliper in mm: nominal flute heights plus liner thickness. A layer
 * with a measured caliper uses it; otherwise liner thickness comes from
 * grammage and a typical bulk, which makes the result an estimate.
 */
export const calculateCaliper = (
  layers: BoxLayer[]
): { caliperMm: number; confidence: StrengthConfidence; estimatedLayers: number } => {
  let caliper = 0;
  let estimatedLayers = 0;

  layers.forEach(layer => {
    const measured = num(layer.caliperMicron);
    if (measured > 0) {
      caliper += measured / 1000;
      return;
    }
    if (layer.kind === 'flute') {
      const profile = layer.fluteProfile && FLUTE_PROFILES[layer.fluteProfile];
      caliper += profile ? profile.heightMm : FLUTE_PROFILES.B.heightMm;
      // A nominal flute height is a real specification, not a guess.
      return;
    }
    caliper += (num(layer.gsm) * LINER_BULK_CM3_PER_G) / 1000;
    estimatedLayers += 1;
  });

  return {
    caliperMm: caliper,
    confidence: estimatedLayers > 0 ? 'estimated' : 'measured',
    estimatedLayers,
  };
};

/**
 * Estimated Ring Crush for one layer, kN/m.
 *
 * CALIBRATION, NOT PHYSICS. See ECT_ESTIMATION in constants.ts for the
 * reasoning and for how to tune it against your own lab results.
 */
export const estimateLayerRct = (layer: BoxLayer): number => {
  const gsm = num(layer.gsm);
  if (gsm <= 0) return 0;
  const bf = bfValue(layer.bf) || ECT_ESTIMATION.REF_BF;
  return ECT_ESTIMATION.COEFF
    * (gsm / 100)
    * Math.pow(bf / ECT_ESTIMATION.REF_BF, ECT_ESTIMATION.EXPONENT);
};

/**
 * ECT in kN/m by component summation: each layer's ring crush, with fluted
 * medium scaled by its take-up because more paper per unit length is
 * standing on edge.
 */
export const calculateEct = (
  layers: BoxLayer[],
  measuredBoardEct?: string,
  fluteTakeUps?: Record<string, number>
): { ectKnPerM: number; confidence: StrengthConfidence; estimatedLayers: number } => {
  const boardEct = num(measuredBoardEct);
  if (boardEct > 0) {
    return { ectKnPerM: boardEct, confidence: 'measured', estimatedLayers: 0 };
  }

  let ect = 0;
  let estimatedLayers = 0;

  layers.forEach(layer => {
    if (num(layer.gsm) <= 0) return;
    const measuredRct = num(layer.rctKnPerM);
    const rct = measuredRct > 0 ? measuredRct : estimateLayerRct(layer);
    if (measuredRct <= 0) estimatedLayers += 1;
    ect += rct * layerTakeUp(layer, fluteTakeUps);
  });

  return {
    ectKnPerM: ect,
    confidence: estimatedLayers > 0 ? 'estimated' : 'measured',
    estimatedLayers,
  };
};

/** Resolve the derating chain for the stated service conditions. */
export const resolveDerating = (conditions: ServiceConditions = {}) => {
  const duration = conditions.storageDuration || DEFAULT_CONDITIONS.storageDuration;
  const humidity = conditions.humidity || DEFAULT_CONDITIONS.humidity;
  const stacking = conditions.stacking || DEFAULT_CONDITIONS.stacking;

  const entries = [
    DERATING.BASE,
    DERATING.DURATION[duration] || DERATING.DURATION.medium,
    DERATING.HUMIDITY[humidity] || DERATING.HUMIDITY.normal,
    DERATING.STACKING[stacking] || DERATING.STACKING.aligned,
  ];

  return {
    entries: entries.map(e => ({ label: e.label, factor: e.factor, note: e.note })),
    divisor: entries.reduce((acc, e) => acc * e.factor, 1),
  };
};

const weakest = (...c: StrengthConfidence[]): StrengthConfidence => {
  if (c.includes('unavailable')) return 'unavailable';
  if (c.includes('estimated')) return 'estimated';
  return 'measured';
};

/** Stage E. */
export const calculateStrength = (
  layers: BoxLayer[],
  geometry: BoxGeometry,
  conditions: ServiceConditions = {},
  measuredBoardEct?: string,
  fluteTakeUps?: Record<string, number>
): StrengthResult => {
  const limitations: string[] = [];

  const burstKgfPerCm2 = calculateBurst(layers);
  const { ectKnPerM, confidence: ectConfidence, estimatedLayers: ectEstimated } =
    calculateEct(layers, measuredBoardEct, fluteTakeUps);
  const { caliperMm, confidence: caliperConfidence, estimatedLayers: calEstimated } =
    calculateCaliper(layers);

  const perimeterMm = 2 * (geometry.l + geometry.b);
  const { entries, divisor } = resolveDerating(conditions);

  // McKee short form: BCT(N) = 5.87 * ECT(kN/m) * sqrt(caliper_mm * perimeter_mm).
  // 1 kN/m is 1 N/mm, so sqrt(mm * mm) = mm cancels the /mm and leaves N.
  let bctKgf = 0;
  let bctConfidence: StrengthConfidence = 'unavailable';

  if (geometry.l > 0 && geometry.b > 0 && ectKnPerM > 0 && caliperMm > 0) {
    const bctNewtons = MCKEE_CONSTANT * ectKnPerM * Math.sqrt(caliperMm * perimeterMm);
    bctKgf = bctNewtons * NEWTON_TO_KGF;
    bctConfidence = weakest(ectConfidence, caliperConfidence);
  } else {
    if (geometry.l <= 0 || geometry.b <= 0) {
      limitations.push('Box length and width are needed before compression strength can be estimated.');
    }
    if (ectKnPerM <= 0) {
      limitations.push('No usable GSM/BF on any layer, so edge crush could not be calculated.');
    }
  }

  if (ectConfidence === 'estimated' && ectKnPerM > 0) {
    limitations.push(
      `Edge crush is ESTIMATED from BF and GSM for ${ectEstimated} layer(s). ` +
      'BF measures bursting, not compression, so this is an indication only. ' +
      'Enter a measured RCT per layer, or a measured board ECT, to make this a real calculation.'
    );
  }
  if (caliperConfidence === 'estimated' && calEstimated > 0) {
    limitations.push(
      `Board thickness for ${calEstimated} liner(s) is derived from grammage rather than measured. ` +
      'Enter a measured caliper for a more accurate compression figure.'
    );
  }
  if (!geometry.isBox && geometry.l > 0) {
    limitations.push('This item has no height, so it is costed as a flat sheet/pad - compression figures do not apply to it as a box.');
  }

  return {
    burstKgfPerCm2,
    ectKnPerM,
    ectConfidence,
    caliperMm,
    caliperConfidence,
    perimeterMm,
    bctKgf,
    bctConfidence,
    safetyDivisor: divisor,
    derating: entries,
    workingLoadKg: divisor > 0 ? bctKgf / divisor : 0,
    limitations,
  };
};
