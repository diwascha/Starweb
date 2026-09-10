import type { CalculatedValues } from './types';
import { normalizeBF } from './utils';

/**
 * Single source of truth for the box-costing formula (sheet sizing,
 * GSM/ply weighting with the corrugation flute factor, wastage, rate
 * lookup). Used by both the live calculator (calculator.tsx) and the
 * saved-report preview (cost-report/page.tsx) so a formula fix can't
 * drift between the two - a saved quotation's preview always recomputes
 * to the exact same numbers the editor would show for the same inputs.
 */
export const calculateItemCost = (
  item: any,
  globalK: Record<string, number>,
  globalV: number,
  globalC: number,
  globalT: number,
  tType: string,
  isAcc = false,
  globalAC = 0
): CalculatedValues => {
  const l = parseFloat(item.l) || 0;
  const b = parseFloat(item.b) || 0;
  const h = parseFloat(item.h) || 0;
  // An explicit 0 means "no pieces" - only fall back to 1 when noOfPcs
  // itself doesn't parse (blank/absent).
  const pcsParsed = parseInt(item.noOfPcs, 10);
  const pcs = isNaN(pcsParsed) ? 1 : pcsParsed;

  if (l <= 0 || b <= 0 || pcs <= 0) {
    return { sheetSizeL: 0, sheetSizeB: 0, sheetArea: 0, totalGsm: 0, paperWeight: 0, totalBoxWeight: 0, paperRate: 0, paperCost: 0, transportCost: 0 };
  }

  const isBox = h > 0;
  let sL = 0, sB = 0;
  if (isBox) {
    const c1 = b + h + 20, d1 = (2 * l) + (2 * b) + 62, c2 = l + h + 20, d2 = (2 * b) + (2 * l) + 62;
    if (c1 * d1 <= c2 * d2) { sL = c1; sB = d1; } else { sL = c2; sB = d2; }
  } else {
    const d = [l, b].sort((x, y) => y - x);
    sL = d[0]; sB = d[1];
  }

  const ply = parseInt(item.ply, 10) || 0;
  const gsm = {
    l1: parseFloat(item.topGsm) || 0,
    f1: parseFloat(item.flute1Gsm) || 0,
    l2: parseFloat(item.middleGsm) || 0,
    f2: parseFloat(item.flute2Gsm) || 0,
    l3: parseFloat(item.liner2Gsm) || 0,
    f3: parseFloat(item.flute3Gsm) || 0,
    l4: parseFloat(item.liner3Gsm) || 0,
    f4: parseFloat(item.flute4Gsm) || 0,
    l5: parseFloat(item.bottomGsm) || 0,
  };

  let tGsm = 0;
  const factor = 1.35;
  if (ply === 3) tGsm = gsm.l1 + (gsm.f1 * factor) + gsm.l5;
  else if (ply === 5) tGsm = gsm.l1 + (gsm.f1 * factor) + gsm.l2 + (gsm.f2 * factor) + gsm.l5;
  else if (ply === 7) tGsm = gsm.l1 + (gsm.f1 * factor) + gsm.l2 + (gsm.f2 * factor) + gsm.l3 + (gsm.f3 * factor) + gsm.l5;
  else if (ply === 9) tGsm = gsm.l1 + (gsm.f1 * factor) + gsm.l2 + (gsm.f2 * factor) + gsm.l3 + (gsm.f3 * factor) + gsm.l4 + (gsm.f4 * factor) + gsm.l5;
  else tGsm = gsm.l1 + gsm.l5;

  const sArea = (sL * sB) / 1000000;
  const pWt = sArea * tGsm * pcs;
  const tBWt = pWt * (1 + (parseFloat(item.wastagePercent) / 100 || 0));
  const kC = globalK[normalizeBF(item.paperBf)] || 0;
  let pRate = item.paperType === 'VIRGIN' ? globalV : kC;
  // A resolved rate of 0 means no global rate is configured for this paper
  // type/BF - not that paper is genuinely free.
  const rateMissing = pRate <= 0;
  const finalRate = pRate + (isAcc ? globalAC : globalC);

  const paperCost = (tBWt / 1000) * finalRate;
  let tCost = 0;
  if (tType === 'Per Piece' && !isAcc) {
    tCost = globalT * pcs;
  }

  return {
    sheetSizeL: sL, sheetSizeB: sB, sheetArea: sArea, totalGsm: tGsm,
    paperWeight: pWt, totalBoxWeight: tBWt, paperRate: finalRate,
    paperCost,
    transportCost: tCost,
    rateMissing
  };
};
