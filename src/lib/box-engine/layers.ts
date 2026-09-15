/**
 * Box Construction Engine - layer stack construction and legacy bridging.
 *
 * The whole app used to store a board as nine flat GSM fields on the item
 * (topGsm, flute1Gsm, middleGsm, flute2Gsm, liner2Gsm, flute3Gsm,
 * liner3Gsm, flute4Gsm, bottomGsm) plus ONE paperType and ONE paperBf for
 * all of them. Every saved quotation in Firestore is in that shape.
 *
 * Rather than migrate the database, this module treats the flat fields as a
 * projection of the layer list:
 *
 *   - `deriveLayers` reads an item. If it has `layers`, they win. If it
 *     doesn't, the flat fields are expanded into an equivalent stack with
 *     the item's single paperType/BF copied onto every layer. Old records
 *     therefore calculate exactly as they always did, and the moment the
 *     user changes one layer's material the record becomes a real
 *     multi-material construction.
 *
 *   - `projectLayersToLegacy` writes the stack back out to the flat fields
 *     on save, so the quotation preview, the product catalog and the PDF
 *     export keep working untouched.
 */

import { generateId, normalizeBF } from '../utils';
import { DEFAULT_FLUTE_PROFILE } from './constants';
import { roleLabel } from './constants';
import type { BoxGeometry, BoxLayer, LayerRole } from './types';

/**
 * The legacy flat fields in physical order, outer to inner. `bottomGsm` is
 * always the innermost liner and is appended separately, which is why it is
 * not in this list.
 */
const LEGACY_STACK: { field: string; kind: 'liner' | 'flute' }[] = [
  { field: 'topGsm', kind: 'liner' },
  { field: 'flute1Gsm', kind: 'flute' },
  { field: 'middleGsm', kind: 'liner' },
  { field: 'flute2Gsm', kind: 'flute' },
  { field: 'liner2Gsm', kind: 'liner' },
  { field: 'flute3Gsm', kind: 'flute' },
  { field: 'liner3Gsm', kind: 'liner' },
  { field: 'flute4Gsm', kind: 'flute' },
];

/** How many entries of LEGACY_STACK a given ply count uses before the
 *  closing bottom liner. Mirrors the ply branches of the original formula
 *  exactly - including the fallback, which only ever used top + bottom. */
const legacyDepthForPly = (ply: number): number => {
  if (ply === 3) return 2;
  if (ply === 5) return 4;
  if (ply === 7) return 6;
  if (ply === 9) return 8;
  return 0;
};

export const plyToLayerCount = (ply: number): number => {
  const depth = legacyDepthForPly(ply);
  return depth > 0 ? depth + 1 : 2;
};

/** Expand an old-style item into an explicit layer stack. */
export const deriveLayersFromLegacy = (item: any): BoxLayer[] => {
  const ply = parseInt(item?.ply, 10) || 0;
  const depth = legacyDepthForPly(ply);
  const paperType = item?.paperType || 'KRAFT';
  const bf = normalizeBF(item?.paperBf) || '';
  const fluteProfile = item?.fluteType || DEFAULT_FLUTE_PROFILE;

  const make = (field: string, kind: 'liner' | 'flute'): BoxLayer => ({
    id: `legacy-${field}`,
    kind,
    paperType,
    bf,
    gsm: item?.[field] != null && item[field] !== '' ? String(item[field]) : '0',
    ...(kind === 'flute' ? { fluteProfile } : {}),
  });

  // depth 0 is the original formula's fallback branch (`else tGsm = l1 + l5`),
  // which counted the top and bottom liners and nothing in between - so the
  // stack there is exactly those two, not just the bottom one.
  const layers = depth > 0
    ? LEGACY_STACK.slice(0, depth).map(s => make(s.field, s.kind))
    : [make('topGsm', 'liner')];
  layers.push(make('bottomGsm', 'liner'));
  return layers;
};

/**
 * The single entry point for "what layers does this item have".
 * An explicit `layers` array always wins; otherwise we synthesise one.
 */
export const deriveLayers = (item: any): BoxLayer[] => {
  if (Array.isArray(item?.layers) && item.layers.length > 0) return item.layers;
  return deriveLayersFromLegacy(item);
};

/** True when the item is still on the old single-material representation. */
export const isLegacyItem = (item: any): boolean =>
  !Array.isArray(item?.layers) || item.layers.length === 0;

/**
 * Write a layer stack back into the flat legacy fields so untouched
 * consumers (quotation preview, product catalog sync, PDF export) keep
 * reading sensible values. Materials can't be represented per-layer in the
 * old shape, so the outer liner's material is used as the item-level
 * paperType/BF - that is the one a customer-facing spec sheet quotes.
 */
export const projectLayersToLegacy = (layers: BoxLayer[]): Record<string, string> => {
  const out: Record<string, string> = {
    topGsm: '', flute1Gsm: '', middleGsm: '', flute2Gsm: '', liner2Gsm: '',
    flute3Gsm: '', liner3Gsm: '', flute4Gsm: '', bottomGsm: '', liner4Gsm: '',
  };
  if (!layers.length) return out;

  const inner = layers[layers.length - 1];
  const body = layers.slice(0, Math.max(0, layers.length - 1));
  body.forEach((layer, i) => {
    const slot = LEGACY_STACK[i];
    if (slot) out[slot.field] = String(layer.gsm ?? '');
  });
  out.bottomGsm = String(inner.gsm ?? '');

  const outer = layers[0];
  out.paperType = outer.paperType || 'KRAFT';
  out.paperBf = normalizeBF(outer.bf) || '';
  const firstFlute = layers.find(l => l.kind === 'flute');
  out.fluteType = firstFlute?.fluteProfile || DEFAULT_FLUTE_PROFILE;
  out.ply = String(layers.length);
  return out;
};

/** Role of each layer, derived from position so reordering can't corrupt it. */
export const describeLayers = (layers: BoxLayer[]) => {
  const liners = layers.filter(l => l.kind === 'liner');
  const flutes = layers.filter(l => l.kind === 'flute');
  let linerSeen = 0;
  let fluteSeen = 0;

  return layers.map((layer, index) => {
    let role: LayerRole;
    let ordinal: number;
    let totalOfKind: number;

    if (layer.kind === 'flute') {
      fluteSeen += 1;
      role = 'flute';
      ordinal = fluteSeen;
      totalOfKind = flutes.length;
    } else {
      linerSeen += 1;
      ordinal = linerSeen;
      totalOfKind = liners.length;
      // A single-liner stack is odd but possible mid-edit; call it the outer.
      if (linerSeen === 1) role = 'outer';
      else if (linerSeen === liners.length) role = 'inner';
      else role = 'middle';
    }

    return {
      layer,
      position: index + 1,
      role,
      roleLabel: roleLabel(role, layer.kind, ordinal, totalOfKind),
    };
  });
};

/**
 * Drop keys whose value is `undefined`.
 *
 * Firestore throws synchronously on an undefined field and the project's
 * `stripUndefined` helper is shallow, so it would never reach a layer nested
 * two levels down inside `items[].layers[]`. Optional layer fields must
 * therefore be absent rather than undefined, or saving a quotation that
 * contains a freshly added layer would fail.
 */
const omitUndefined = <T extends Record<string, any>>(obj: T): T => {
  const out = {} as T;
  for (const key in obj) if (obj[key] !== undefined) out[key] = obj[key];
  return out;
};

/** A fresh layer, seeded from a sibling so adding one to a 5-ply stack
 *  doesn't mean retyping the whole spec. */
export const makeLayer = (kind: 'liner' | 'flute', seed?: Partial<BoxLayer>): BoxLayer =>
  omitUndefined({
    id: generateId(),
    kind,
    paperType: seed?.paperType || 'KRAFT',
    bf: seed?.bf || '18 BF',
    gsm: seed?.gsm || (kind === 'flute' ? '100' : '120'),
    ...(kind === 'flute' ? { fluteProfile: seed?.fluteProfile || DEFAULT_FLUTE_PROFILE } : {}),
    grade: seed?.grade,
    caliperMicron: seed?.caliperMicron,
    rctKnPerM: seed?.rctKnPerM,
    rateOverride: seed?.rateOverride,
    materialRef: seed?.materialRef,
    supplier: seed?.supplier,
  });

/** Belt-and-braces for the same hazard: run a whole stack through this
 *  before it goes anywhere near a Firestore write. */
export const sanitizeLayers = (layers: BoxLayer[]): BoxLayer[] => layers.map(omitUndefined);

/**
 * Sheet geometry. Lifted verbatim from the original cost-calculator so the
 * numbers cannot drift: an RSC blank is evaluated both ways round and the
 * smaller-area orientation wins; a flat pad just sorts its two dimensions.
 */
export const resolveGeometry = (item: any): BoxGeometry => {
  const l = parseFloat(item?.l) || 0;
  const b = parseFloat(item?.b) || 0;
  const h = parseFloat(item?.h) || 0;
  // An explicit 0 means "no pieces" - only fall back to 1 when noOfPcs
  // itself doesn't parse (blank/absent).
  const pcsParsed = parseInt(item?.noOfPcs, 10);
  const pcs = isNaN(pcsParsed) ? 1 : pcsParsed;

  const empty: BoxGeometry = {
    l, b, h, pcs, sheetSizeL: 0, sheetSizeB: 0, sheetArea: 0, isBox: h > 0,
  };
  if (l <= 0 || b <= 0 || pcs <= 0) return empty;

  const isBox = h > 0;
  let sL = 0, sB = 0;
  if (isBox) {
    const c1 = b + h + 20, d1 = (2 * l) + (2 * b) + 62;
    const c2 = l + h + 20, d2 = (2 * b) + (2 * l) + 62;
    if (c1 * d1 <= c2 * d2) { sL = c1; sB = d1; } else { sL = c2; sB = d2; }
  } else {
    const d = [l, b].sort((x, y) => y - x);
    sL = d[0]; sB = d[1];
  }

  return { l, b, h, pcs, sheetSizeL: sL, sheetSizeB: sB, sheetArea: (sL * sB) / 1000000, isBox };
};
