/**
 * Parity + behaviour checks for the layer-based box engine.
 *
 * The first and most important block re-implements the ORIGINAL
 * single-material formula verbatim and asserts the new engine reproduces it
 * exactly across a spread of constructions. That is the guarantee that
 * refactoring the costing did not silently reprice a single saved quotation.
 *
 * Run with:  npx tsx scripts/verify-box-engine.ts
 */

import { calculateItemCost } from '../src/lib/cost-calculator';
import { analyzeBox, makeLayer, deriveLayersFromLegacy, projectLayersToLegacy } from '../src/lib/box-engine';
import type { RateContext, BoxLayer } from '../src/lib/box-engine';

let passed = 0;
let failed = 0;

const check = (label: string, actual: any, expected: any, epsilon = 1e-9) => {
  const ok = typeof expected === 'number'
    ? Math.abs(actual - expected) <= epsilon
    : JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { passed++; console.log(`  PASS  ${label}`); }
  else { failed++; console.log(`  FAIL  ${label}\n        expected ${JSON.stringify(expected)}\n        actual   ${JSON.stringify(actual)}`); }
};

const section = (t: string) => console.log(`\n=== ${t} ===`);

// ---------------------------------------------------------------------------
// The ORIGINAL formula, copied verbatim from git history before the refactor.
// ---------------------------------------------------------------------------
const normalizeBFLocal = (val: any): string => {
  if (val === null || val === undefined) return '';
  const s = String(val).trim();
  if (!s) return '';
  const n = parseFloat(s.replace(/[^0-9.]/g, ''));
  if (isNaN(n)) return '';
  return `${n} BF`;
};

const legacyCalculate = (item: any, globalK: any, globalV: number, globalC: number, globalT: number, tType: string, isAcc = false, globalAC = 0) => {
  const l = parseFloat(item.l) || 0;
  const b = parseFloat(item.b) || 0;
  const h = parseFloat(item.h) || 0;
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
    l1: parseFloat(item.topGsm) || 0, f1: parseFloat(item.flute1Gsm) || 0,
    l2: parseFloat(item.middleGsm) || 0, f2: parseFloat(item.flute2Gsm) || 0,
    l3: parseFloat(item.liner2Gsm) || 0, f3: parseFloat(item.flute3Gsm) || 0,
    l4: parseFloat(item.liner3Gsm) || 0, f4: parseFloat(item.flute4Gsm) || 0,
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
  const kC = globalK[normalizeBFLocal(item.paperBf)] || 0;
  const pRate = item.paperType === 'VIRGIN' ? globalV : kC;
  const finalRate = pRate + (isAcc ? globalAC : globalC);
  const paperCost = (tBWt / 1000) * finalRate;
  let tCost = 0;
  if (tType === 'Per Piece' && !isAcc) tCost = globalT * pcs;
  return { sheetSizeL: sL, sheetSizeB: sB, sheetArea: sArea, totalGsm: tGsm, paperWeight: pWt, totalBoxWeight: tBWt, paperRate: finalRate, paperCost, transportCost: tCost };
};

// ---------------------------------------------------------------------------
const K = { '16 BF': 62, '18 BF': 68, '20 BF': 75, '22 BF': 84 };
const V = 96, C = 22, AC = 18, T = 4.5;

const baseItem = (over: any = {}) => ({
  l: '400', b: '300', h: '250', noOfPcs: '1000', ply: '3',
  fluteType: 'B', paperType: 'KRAFT', paperBf: '18 BF',
  topGsm: '120', flute1Gsm: '100', middleGsm: '', flute2Gsm: '',
  liner2Gsm: '', flute3Gsm: '', liner3Gsm: '', flute4Gsm: '',
  bottomGsm: '120', wastagePercent: '3.5', ...over,
});

section('1. Legacy parity - existing saved quotations must reprice identically');

const cases: [string, any, string, boolean][] = [
  ['3 ply kraft, per-consignment', baseItem(), 'Per Consignment', false],
  ['3 ply kraft, per-piece transport', baseItem(), 'Per Piece', false],
  ['3 ply virgin', baseItem({ paperType: 'VIRGIN' }), 'Per Piece', false],
  ['5 ply', baseItem({ ply: '5', middleGsm: '140', flute2Gsm: '110' }), 'Per Piece', false],
  ['7 ply', baseItem({ ply: '7', middleGsm: '140', flute2Gsm: '110', liner2Gsm: '150', flute3Gsm: '120' }), 'Per Piece', false],
  ['9 ply', baseItem({ ply: '9', middleGsm: '140', flute2Gsm: '110', liner2Gsm: '150', flute3Gsm: '120', liner3Gsm: '160', flute4Gsm: '130' }), 'Per Piece', false],
  ['2 ply fallback branch', baseItem({ ply: '2' }), 'Per Piece', false],
  ['flat pad (no height)', baseItem({ h: '0' }), 'Per Piece', false],
  ['accessory (uses accessory conversion)', baseItem({ h: '0' }), 'Per Piece', true],
  ['zero wastage', baseItem({ wastagePercent: '0' }), 'Per Piece', false],
  ['22 BF, tall narrow box', baseItem({ paperBf: '22 BF', l: '150', b: '120', h: '600' }), 'Per Piece', false],
  ['unconfigured BF -> rate missing', baseItem({ paperBf: '30 BF' }), 'Per Piece', false],
  ['no dimensions -> clean zero', baseItem({ l: '', b: '' }), 'Per Piece', false],
  ['zero pieces -> clean zero', baseItem({ noOfPcs: '0' }), 'Per Piece', false],
];

for (const [label, item, tType, isAcc] of cases) {
  const legacy: any = legacyCalculate(item, K, V, C, T, tType, isAcc, AC);
  const next: any = calculateItemCost(item, K, V, C, T, tType, isAcc, AC);
  for (const field of ['sheetSizeL', 'sheetSizeB', 'sheetArea', 'totalGsm', 'paperWeight', 'totalBoxWeight', 'paperRate', 'paperCost', 'transportCost']) {
    check(`${label} :: ${field}`, next[field], legacy[field], 1e-9);
  }
}

section('2. Mixed-material construction - the case the old model could not express');

const rates: RateContext = {
  kraftByBf: K, virgin: V, other: { DUPLEX: 55 },
  conversion: C, transport: T, transportType: 'Per Piece',
};

const mixed = {
  ...baseItem(),
  layers: [
    makeLayer('liner', { paperType: 'VIRGIN', bf: '20 BF', gsm: '150' }),
    makeLayer('flute', { paperType: 'KRAFT', bf: '18 BF', gsm: '140' }),
    makeLayer('liner', { paperType: 'DUPLEX', bf: '16 BF', gsm: '100' }),
  ],
  requiredLoadKg: '10',
};

const a = analyzeBox(mixed, rates);
check('three distinct layers', a.layers.length, 3);
check('roles are outer/flute/inner', a.layers.map(l => l.roleLabel), ['Outer', 'Flute', 'Inner']);
check('outer priced at virgin rate', a.layers[0].paperRate, V);
check('flute priced at 18 BF kraft rate', a.layers[1].paperRate, K['18 BF']);
check('inner priced at duplex rate', a.layers[2].paperRate, 55);
check('flute take-up applied to middle only', a.layers.map(l => l.takeUp), [1, 1.35, 1]);
check('total GSM = 150 + 140*1.35 + 100', a.totalGsm, 150 + 140 * 1.35 + 100, 1e-9);

const layerCostSum = a.layers.reduce((s, l) => s + l.cost, 0);
check('layer costs sum to paper cost', a.paperCost, layerCostSum, 1e-9);
console.log(`        layer costs: ${a.layers.map(l => `${l.roleLabel} Rs.${l.cost.toFixed(2)}`).join(' | ')}`);
console.log(`        box weight: ${a.boxWeightNet.toFixed(1)} g net, ${a.boxWeightGross.toFixed(1)} g gross`);

section('3. Uniform layers must equal the lump-sum arithmetic');

const uniform = {
  ...baseItem(),
  layers: [
    makeLayer('liner', { paperType: 'KRAFT', bf: '18 BF', gsm: '120' }),
    makeLayer('flute', { paperType: 'KRAFT', bf: '18 BF', gsm: '100' }),
    makeLayer('liner', { paperType: 'KRAFT', bf: '18 BF', gsm: '120' }),
  ],
};
const uniformA = analyzeBox(uniform, { ...rates, transportType: 'Per Consignment' });
const lump: any = legacyCalculate(baseItem(), K, V, C, T, 'Per Consignment');
check('explicit uniform layers == legacy lump sum', uniformA.paperCost, lump.paperCost, 1e-9);

section('4. Material consolidation for purchase');

const repeated = {
  ...baseItem(),
  layers: [
    makeLayer('liner', { paperType: 'KRAFT', bf: '18 BF', gsm: '140' }),
    makeLayer('flute', { paperType: 'KRAFT', bf: '16 BF', gsm: '100' }),
    makeLayer('liner', { paperType: 'KRAFT', bf: '18 BF', gsm: '140' }),
  ],
};
const ra = analyzeBox(repeated, rates);
check('identical outer+inner collapse to one purchase line', ra.materials.length, 2);
check('consolidated line covers layers 1 and 3', ra.materials[0].layerPositions, [1, 3]);
check('consolidated weight is the sum of both layers', ra.materials[0].weightPerBox, ra.layers[0].weightPerBox + ra.layers[2].weightPerBox, 1e-9);
check('per-layer detail is still intact', ra.layers.length, 3);
console.log(`        purchase lines: ${ra.materials.map(m => `${m.paperType} ${m.bf} ${m.gsm}gsm -> ${m.totalKg.toFixed(1)} kg`).join(' | ')}`);

section('5. Arbitrary ply counts');

for (const n of [2, 3, 5, 7, 9, 11]) {
  const layers = Array.from({ length: n }, (_, i) =>
    makeLayer(i % 2 === 1 ? 'flute' : 'liner', { paperType: 'KRAFT', bf: '18 BF', gsm: i % 2 === 1 ? '100' : '120' }));
  const r = analyzeBox({ ...baseItem(), layers }, rates);
  check(`${n} layers analysed`, r.layers.length, n);
  check(`${n} layers produce a positive cost`, r.paperCost > 0, true);
}

section('6. Strength - burst is rigorous, ECT is flagged when estimated');

const s = a.strength;
// Burst = sum over liners of BF * GSM / 1000 = (20*150 + 16*100)/1000
check('combined burst from BF x GSM', s.burstKgfPerCm2, (20 * 150 + 16 * 100) / 1000, 1e-9);
check('ECT reported as estimated (no RCT supplied)', s.ectConfidence, 'estimated');
check('BCT inherits the estimated confidence', s.bctConfidence, 'estimated');
check('a limitation was recorded for the estimate', s.limitations.length > 0, true);
console.log(`        ECT ${s.ectKnPerM.toFixed(2)} kN/m, caliper ${s.caliperMm.toFixed(2)} mm, BCT ${s.bctKgf.toFixed(1)} kgf`);
console.log(`        derating ${s.safetyDivisor.toFixed(2)}x -> working load ${s.workingLoadKg.toFixed(1)} kg`);

const measured = analyzeBox({
  ...mixed,
  layers: mixed.layers.map((l: BoxLayer) => ({ ...l, rctKnPerM: '1.4', caliperMicron: l.kind === 'flute' ? '2500' : '180' })),
}, rates);
check('supplying RCT + caliper upgrades confidence to measured', measured.strength.ectConfidence, 'measured');
check('BCT then reads as measured too', measured.strength.bctConfidence, 'measured');

section('7. Calibration sanity - a common 3 ply should land in a believable range');

const common = analyzeBox(baseItem(), rates);
const ect = common.strength.ectKnPerM;
check(`3 ply 120/100/120 @18BF gives ECT in 3-5 kN/m (got ${ect.toFixed(2)})`, ect > 3 && ect < 5, true);
check(`caliper in 2.5-3.5 mm (got ${common.strength.caliperMm.toFixed(2)})`, common.strength.caliperMm > 2.5 && common.strength.caliperMm < 3.5, true);
check(`BCT in 100-250 kgf (got ${common.strength.bctKgf.toFixed(0)})`, common.strength.bctKgf > 100 && common.strength.bctKgf < 250, true);

section('8. Verdicts - under, suitable and over specification');

const verdictFor = (requiredKg: string, layers?: any[]) =>
  analyzeBox({ ...baseItem(), ...(layers ? { layers } : {}), requiredLoadKg: requiredKg }, rates).recommendation;

const wl = common.strength.workingLoadKg;
console.log(`        baseline working load ${wl.toFixed(1)} kg`);
check('requirement far above capacity -> under-specified', verdictFor(String(Math.round(wl * 3))).verdict, 'under-specified');
check('requirement just under capacity -> suitable', verdictFor((wl / 1.4).toFixed(1)).verdict, 'suitable');
check('requirement far below capacity -> over-specified', verdictFor((wl / 5).toFixed(1)).verdict, 'over-specified');
// Just inside capacity: a pass, but with almost no headroom.
check('requirement at capacity -> borderline', verdictFor(String(wl / 1.05)).verdict, 'borderline');
check('no requirement entered -> no verdict', verdictFor('').verdict, 'no-requirement');
check('under-specified carries actionable suggestions', verdictFor(String(Math.round(wl * 3))).suggestions.length > 0, true);
check('over-specified carries cost-down suggestions', verdictFor((wl / 5).toFixed(1)).suggestions.length > 0, true);

section('9. Legacy round-trip');

const derived = deriveLayersFromLegacy(baseItem({ ply: '5', middleGsm: '140', flute2Gsm: '110' }));
check('5 ply legacy expands to 5 layers', derived.length, 5);
check('kinds alternate liner/flute', derived.map(l => l.kind), ['liner', 'flute', 'liner', 'flute', 'liner']);
check('GSM order preserved outer to inner', derived.map(l => l.gsm), ['120', '100', '140', '110', '120']);
const projected = projectLayersToLegacy(derived);
check('projects back to topGsm', projected.topGsm, '120');
check('projects back to middleGsm', projected.middleGsm, '140');
check('projects back to bottomGsm', projected.bottomGsm, '120');
check('projects back to flute2Gsm', projected.flute2Gsm, '110');

console.log(`\n${'='.repeat(60)}\n${passed} passed, ${failed} failed\n${'='.repeat(60)}`);
process.exit(failed > 0 ? 1 : 0);
