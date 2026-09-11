import type { CalculatedValues } from './types';
import { analyzeBox, toCalculatedValues } from './box-engine';
import type { RateContext } from './box-engine';

/**
 * Single source of truth for the box-costing formula. Used by the live
 * calculator (calculator.tsx), the saved-report preview
 * (cost-report/page.tsx) and the product form, so a formula fix can't drift
 * between them - a saved quotation's preview always recomputes to the exact
 * same numbers the editor would show for the same inputs.
 *
 * This is now a thin adapter over the layer-based engine in ./box-engine.
 * The engine models a board as an ordered stack of layers, each with its own
 * paper, BF and GSM; this function flattens that back into the single
 * `CalculatedValues` shape the older screens expect.
 *
 * Backward compatibility is exact, not approximate. An item with no `layers`
 * array has one derived from its legacy flat GSM fields with its single
 * paperType/paperBf copied onto every layer, and because cost is linear in
 * grammage, summing the layers gives the identical total the old
 * whole-board arithmetic gave. Every quotation already in Firestore
 * therefore reprices to the same rupee.
 */
export const calculateItemCost = (
  item: any,
  globalK: Record<string, number>,
  globalV: number,
  globalC: number,
  globalT: number,
  tType: string,
  isAcc = false,
  globalAC = 0,
  /** NPR/kg for materials outside the kraft/virgin pair (Duplex, White Top,
   *  ...), keyed by uppercase material name. Optional and additive, so every
   *  existing call site keeps working unchanged. */
  globalOther: Record<string, number> = {},
  /** Flute take-up factors for this quotation, keyed by profile. Optional and
   *  additive; omitting it uses the built-in defaults, which is what keeps
   *  every previously-saved report costing exactly as before. */
  globalFluteTakeUps: Record<string, number> = {}
): CalculatedValues => {
  const l = parseFloat(item.l) || 0;
  const b = parseFloat(item.b) || 0;
  // An explicit 0 means "no pieces" - only fall back to 1 when noOfPcs
  // itself doesn't parse (blank/absent).
  const pcsParsed = parseInt(item.noOfPcs, 10);
  const pcs = isNaN(pcsParsed) ? 1 : pcsParsed;

  // Preserved from the original implementation: an item without usable
  // dimensions reports a clean zero rather than a partially-filled row.
  if (l <= 0 || b <= 0 || pcs <= 0) {
    return { sheetSizeL: 0, sheetSizeB: 0, sheetArea: 0, totalGsm: 0, paperWeight: 0, totalBoxWeight: 0, paperRate: 0, paperCost: 0, transportCost: 0 };
  }

  const rates: RateContext = {
    kraftByBf: globalK || {},
    virgin: globalV || 0,
    other: globalOther,
    fluteTakeUps: globalFluteTakeUps,
    conversion: globalC || 0,
    accessoryConversion: globalAC || 0,
    transport: globalT || 0,
    transportType: tType,
    isAccessory: isAcc,
  };

  return toCalculatedValues(analyzeBox(item, rates));
};
