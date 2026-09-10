/**
 * Box Construction Engine - stages F and G.
 *
 *   F. Requirement    - what the customer actually asked the box to carry
 *   G. Recommendation - the business call on the engineering numbers
 *
 * This file is deliberately separate from strength.ts. strength.ts answers
 * "how strong is this board"; nothing in it knows or cares what the customer
 * wanted. This file answers "should we quote it", and contains no physics at
 * all - only comparisons and commercial judgement.
 *
 * The commercial judgement matters as much as the safety one. A box that
 * carries three times what the customer asked is not a good box, it is an
 * expensive one that loses the enquiry, so over-specification is called out
 * just as loudly as under-specification.
 */

import { BORDERLINE_RATIO, OVER_SPEC_RATIO } from './constants';
import type {
  BoxLayer, FitVerdict, RecommendationResult, ServiceConditions, StrengthResult,
} from './types';

const num = (v: any): number => {
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
};

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Concrete ways to move the board's edge crush in the direction needed.
 * Ordered cheapest-first, because the cheapest change that clears the
 * requirement is the one worth quoting.
 */
const strengthenSuggestions = (layers: BoxLayer[], targetRatio: number): string[] => {
  const out: string[] = [];
  const liners = layers.filter(l => l.kind === 'liner');
  const flutes = layers.filter(l => l.kind === 'flute');
  const uplift = Math.round((targetRatio - 1) * 100);

  out.push(`Edge crush needs to rise about ${uplift}% for this construction to clear the requirement.`);

  const lowestBfLiner = [...liners].sort((a, b) => num(a.bf) - num(b.bf))[0];
  if (lowestBfLiner) {
    out.push(`Cheapest first: raise the ${num(lowestBfLiner.bf) ? `${lowestBfLiner.bf} ` : ''}liner - a BF or GSM step on the outer and inner liners buys compression at the lowest cost.`);
  }
  if (flutes.length > 0 && targetRatio > 1.15) {
    out.push('Step the flute profile up (B to C, or C to A) - taller flutes add caliper, and compression rises with the square root of board thickness.');
  }
  if (targetRatio > 1.4 && layers.length <= 3) {
    out.push('If a liner upgrade is not enough, move from 3 ply to 5 ply - but price both, because the paper upgrade is usually cheaper than the extra ply.');
  }
  out.push('Re-check the service conditions too: long storage and high humidity together more than triple the derating, so a drier or shorter-stacked assumption may already satisfy the requirement.');
  return out;
};

const economiseSuggestions = (layers: BoxLayer[], ratio: number): string[] => {
  const out: string[] = [];
  const headroom = Math.round((ratio - 1) * 100);
  out.push(`This construction carries about ${headroom}% more than the customer asked for - there is room to take cost out without putting the load at risk.`);

  const heaviestLiner = [...layers.filter(l => l.kind === 'liner')]
    .sort((a, b) => num(b.gsm) - num(a.gsm))[0];
  if (heaviestLiner) {
    out.push(`Try dropping the heaviest liner (currently ${num(heaviestLiner.gsm)} GSM) a step, or moving it from virgin to kraft, then re-check the verdict.`);
  }
  if (layers.length >= 5) {
    out.push('A 5 ply carrying this much headroom is often a 3 ply with better paper - compare the two constructions on cost before quoting.');
  }
  out.push('Only trim if the customer has not specified the board themselves - some buyers require a construction regardless of the load.');
  return out;
};

/** Stages F + G. */
export const buildRecommendation = (
  strength: StrengthResult,
  layers: BoxLayer[],
  conditions: ServiceConditions = {}
): RecommendationResult => {
  const requiredLoadKg = num(conditions.requiredLoadKg);
  const workingLoadKg = strength.workingLoadKg;
  const estimatedCapacityKg = strength.bctKgf;

  const base = {
    requiredLoadKg,
    workingLoadKg,
    estimatedCapacityKg,
    safetyMargin: 0,
  };

  if (strength.bctConfidence === 'unavailable' || workingLoadKg <= 0) {
    return {
      ...base,
      verdict: 'unavailable',
      headline: 'Strength not calculable yet',
      detail: 'Fill in the box dimensions and at least one layer with a GSM and BF before a load assessment can be made.',
      suggestions: strength.limitations,
    };
  }

  if (requiredLoadKg <= 0) {
    return {
      ...base,
      verdict: 'no-requirement',
      headline: `Safe working load about ${round1(workingLoadKg)} kg per box`,
      detail: `Compression estimate ${round1(estimatedCapacityKg)} kg, derated by ${round1(strength.safetyDivisor)}x for the stated storage conditions. Enter the customer's required load to get a fit verdict.`,
      suggestions: [],
    };
  }

  const safetyMargin = workingLoadKg / requiredLoadKg;
  const result = { ...base, safetyMargin };
  const marginPct = Math.round((safetyMargin - 1) * 100);

  let verdict: FitVerdict;
  let headline: string;
  let detail: string;
  let suggestions: string[];

  if (safetyMargin < 1) {
    verdict = 'under-specified';
    headline = 'Under-specified - do not quote as is';
    detail = `The customer needs ${round1(requiredLoadKg)} kg but this construction is only safe to about ${round1(workingLoadKg)} kg under the stated conditions. It is short by roughly ${round1(requiredLoadKg - workingLoadKg)} kg.`;
    suggestions = strengthenSuggestions(layers, requiredLoadKg / workingLoadKg);
  } else if (safetyMargin < BORDERLINE_RATIO) {
    verdict = 'borderline';
    headline = 'Borderline - meets the requirement with little to spare';
    detail = `Safe working load is about ${round1(workingLoadKg)} kg against a requirement of ${round1(requiredLoadKg)} kg - only ${marginPct}% headroom. That leaves nothing for a bad reel or a wet monsoon week.`;
    suggestions = [
      'Take one step up on the outer liner if the customer will accept the price - it turns a marginal pass into a comfortable one.',
      'If the price cannot move, confirm the storage conditions in writing, because the margin depends on them entirely.',
      ...strengthenSuggestions(layers, BORDERLINE_RATIO),
    ];
  } else if (safetyMargin > OVER_SPEC_RATIO) {
    verdict = 'over-specified';
    headline = 'Meets the requirement, but over-specified';
    detail = `Safe working load is about ${round1(workingLoadKg)} kg against a requirement of only ${round1(requiredLoadKg)} kg - ${marginPct}% more than needed. The box is safe; it is also more expensive than the job calls for.`;
    suggestions = economiseSuggestions(layers, safetyMargin);
  } else {
    verdict = 'suitable';
    headline = 'Suitable - safe and economical';
    detail = `Safe working load is about ${round1(workingLoadKg)} kg against a requirement of ${round1(requiredLoadKg)} kg, a ${marginPct}% margin. That is the balanced range: enough headroom to be safe, not so much that paper is being wasted.`;
    suggestions = [];
  }

  // The verdict is only ever as good as the numbers behind it - never let a
  // confident-sounding headline hide an estimated ECT.
  if (strength.bctConfidence === 'estimated') {
    suggestions = [
      ...suggestions,
      'This verdict rests on an ESTIMATED edge crush. Confirm with a board test before committing to a load-critical order.',
    ];
  }

  return { ...result, verdict, headline, detail, suggestions };
};
