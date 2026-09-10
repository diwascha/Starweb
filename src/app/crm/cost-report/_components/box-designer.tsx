'use client';

/**
 * Box Designer - the UI over src/lib/box-engine.
 *
 * Layout rules that drive every decision in here:
 *  - The answer comes first. A sticky summary sits at the top and never
 *    scrolls away, so the weight, cost, load capacity and verdict are
 *    visible without hunting.
 *  - Layers collapse. A 9 ply box must not be a nine-screen form, so each
 *    layer is a one-line card showing material, BF, GSM and its weight, and
 *    only opens when it is being edited.
 *  - Technical depth is opt-in. Per-layer arithmetic, derating factors and
 *    the ECT method live behind "Calculation Details" rather than being
 *    dumped on screen.
 *  - One column on a phone, two on a desktop. Nothing here needs a wide
 *    viewport.
 */

import { useMemo, useState } from 'react';
import {
  ChevronDown, ChevronUp, Plus, Trash2, Copy, ArrowUp, ArrowDown,
  Layers as LayersIcon, AlertTriangle, CheckCircle2, Info, TrendingDown, Scale,
} from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { BF_OPTIONS } from '@/lib/constants';
import {
  analyzeBox, deriveLayers, projectLayersToLegacy, makeLayer, sanitizeLayers,
  FLUTE_PROFILES, PAPER_MATERIALS, materialLabel,
} from '@/lib/box-engine';
import type { BoxAnalysis, BoxLayer, RateContext, FitVerdict } from '@/lib/box-engine';

const n0 = (v: number) => (isFinite(v) ? v : 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
const n1 = (v: number) => (isFinite(v) ? v : 0).toLocaleString('en-IN', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const n2 = (v: number) => (isFinite(v) ? v : 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const VERDICT_STYLE: Record<FitVerdict, { cls: string; icon: any; chip: string }> = {
  'suitable':        { cls: 'border-emerald-300 bg-emerald-50', icon: CheckCircle2,  chip: 'bg-emerald-600' },
  'borderline':      { cls: 'border-amber-300 bg-amber-50',     icon: AlertTriangle, chip: 'bg-amber-600' },
  'under-specified': { cls: 'border-red-300 bg-red-50',         icon: AlertTriangle, chip: 'bg-red-600' },
  'over-specified':  { cls: 'border-sky-300 bg-sky-50',         icon: TrendingDown,  chip: 'bg-sky-600' },
  'no-requirement':  { cls: 'border-muted bg-muted/30',         icon: Info,          chip: 'bg-muted-foreground' },
  'unavailable':     { cls: 'border-muted bg-muted/30',         icon: Info,          chip: 'bg-muted-foreground' },
};

const VERDICT_LABEL: Record<FitVerdict, string> = {
  'suitable': 'SUITABLE',
  'borderline': 'BORDERLINE',
  'under-specified': 'UNDER-SPECIFIED',
  'over-specified': 'OVER-SPECIFIED',
  'no-requirement': 'NO REQUIREMENT SET',
  'unavailable': 'INCOMPLETE',
};

const Field = ({ label, children, hint }: any) => (
  <div className="space-y-1">
    <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</Label>
    {children}
    {hint && <p className="text-[10px] text-muted-foreground leading-tight">{hint}</p>}
  </div>
);

/* ------------------------------------------------------------------ */
/* One layer: a single collapsed line, a full form when opened.        */
/* ------------------------------------------------------------------ */

const LayerCard = ({
  layer, breakdown, index, total, onUpdate, onRemove, onMove, onDuplicate,
}: {
  layer: BoxLayer;
  breakdown: any;
  index: number;
  total: number;
  onUpdate: (patch: Partial<BoxLayer>) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
  onDuplicate: () => void;
}) => {
  const [open, setOpen] = useState(false);
  const isFlute = layer.kind === 'flute';

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card className={cn('border shadow-sm overflow-hidden', breakdown?.rateMissing && 'border-amber-300')}>
        <CollapsibleTrigger asChild>
          <button type="button" className="w-full text-left px-3 py-2.5 hover:bg-muted/40 transition-colors">
            <div className="flex items-center gap-2">
              {open ? <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
                    : <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold">
                    Layer {index + 1} &mdash; {breakdown?.roleLabel || (isFlute ? 'Flute' : 'Liner')}
                  </span>
                  {isFlute && (
                    <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4">
                      {layer.fluteProfile || 'B'} flute
                    </Badge>
                  )}
                  {breakdown?.rateMissing && (
                    <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 border-amber-400 text-amber-700">
                      no rate
                    </Badge>
                  )}
                </div>
                {/* Collapsed summary: the three things worth seeing at a glance. */}
                <div className="text-[11px] text-muted-foreground truncate">
                  {materialLabel(layer.paperType)}
                  {layer.bf ? ` · ${layer.bf}` : ''}
                  {` · ${layer.gsm || 0} GSM`}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-xs font-bold tabular-nums">{n1(breakdown?.weightPerBox || 0)} g</div>
                <div className="text-[10px] text-muted-foreground">per box</div>
              </div>
            </div>
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="px-3 pb-3 pt-0 space-y-3 border-t bg-muted/10">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-3">
              <Field label="Type">
                <Select value={layer.kind} onValueChange={(v: any) => onUpdate({ kind: v })}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="liner">Liner (flat)</SelectItem>
                    <SelectItem value="flute">Flute (corrugated)</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Material">
                <Select value={layer.paperType} onValueChange={v => onUpdate({ paperType: v })}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PAPER_MATERIALS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="BF">
                <Select value={layer.bf} onValueChange={v => onUpdate({ bf: v })}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="BF" /></SelectTrigger>
                  <SelectContent>
                    {BF_OPTIONS.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="GSM">
                <Input type="number" className="h-8 text-xs" value={layer.gsm ?? ''}
                  onChange={e => onUpdate({ gsm: e.target.value })} />
              </Field>
            </div>

            {isFlute && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Field label="Flute Profile" hint={`Take-up ${FLUTE_PROFILES[layer.fluteProfile || 'B']?.takeUp ?? 1.35}x · height ${FLUTE_PROFILES[layer.fluteProfile || 'B']?.heightMm ?? 2.5} mm`}>
                  <Select value={layer.fluteProfile || 'B'} onValueChange={v => onUpdate({ fluteProfile: v })}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(FLUTE_PROFILES).map(([k, p]) => (
                        <SelectItem key={k} value={k}>{p.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
            )}

            {/* Optional precision inputs. Filling these in is what turns the
                strength estimate into a real calculation, so the hint says so. */}
            <Collapsible>
              <CollapsibleTrigger asChild>
                <button type="button" className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground flex items-center gap-1">
                  <ChevronDown className="h-3 w-3" /> Lab data &amp; rate override (optional)
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-2">
                  <Field label="RCT (kN/m)" hint="Measured ring crush">
                    <Input type="number" step="0.01" className="h-8 text-xs" value={layer.rctKnPerM ?? ''}
                      onChange={e => onUpdate({ rctKnPerM: e.target.value })} placeholder="est." />
                  </Field>
                  <Field label="Caliper (micron)" hint="Measured thickness">
                    <Input type="number" className="h-8 text-xs" value={layer.caliperMicron ?? ''}
                      onChange={e => onUpdate({ caliperMicron: e.target.value })} placeholder="est." />
                  </Field>
                  <Field label="Rate NPR/kg" hint="Overrides global rate">
                    <Input type="number" className="h-8 text-xs" value={layer.rateOverride ?? ''}
                      onChange={e => onUpdate({ rateOverride: e.target.value })}
                      placeholder={breakdown?.paperRate ? n0(breakdown.paperRate) : 'not set'} />
                  </Field>
                </div>
              </CollapsibleContent>
            </Collapsible>

            <div className="flex items-center justify-between gap-2 pt-1 border-t">
              <div className="text-[10px] text-muted-foreground">
                {n1(breakdown?.effectiveGsm || 0)} g/m&sup2; effective
                {breakdown?.takeUp > 1 && ` (${layer.gsm} × ${breakdown.takeUp})`}
                {' · '}Rs. {n2(breakdown?.cost || 0)}
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" className="h-7 w-7" title="Move up"
                  disabled={index === 0} onClick={() => onMove(-1)}><ArrowUp className="h-3.5 w-3.5" /></Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" title="Move down"
                  disabled={index === total - 1} onClick={() => onMove(1)}><ArrowDown className="h-3.5 w-3.5" /></Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" title="Duplicate layer"
                  onClick={onDuplicate}><Copy className="h-3.5 w-3.5" /></Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" title="Remove layer"
                  disabled={total <= 1} onClick={onRemove}><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
};

/* ------------------------------------------------------------------ */
/* Sticky summary - the answer, always on screen.                      */
/* ------------------------------------------------------------------ */

const BoxSummary = ({ analysis }: { analysis: BoxAnalysis }) => {
  const { geometry, strength, recommendation } = analysis;
  const style = VERDICT_STYLE[recommendation.verdict];
  const Icon = style.icon;

  return (
    <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="px-4 py-3 space-y-2.5">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-2">
          <div>
            <div className="text-[9px] uppercase tracking-wider text-muted-foreground">Construction</div>
            <div className="text-sm font-bold">{analysis.layers.length} Ply</div>
            <div className="text-[10px] text-muted-foreground tabular-nums">
              {geometry.l || 0} &times; {geometry.b || 0} &times; {geometry.h || 0}
            </div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-muted-foreground">Box Weight</div>
            <div className="text-sm font-bold tabular-nums">{n1(analysis.boxWeightGross)} g</div>
            <div className="text-[10px] text-muted-foreground tabular-nums">
              {n1(analysis.boxWeightNet)} g + {n1(analysis.conversionLossPerBox)} g loss
            </div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-muted-foreground">Cost / Box</div>
            <div className={cn('text-sm font-bold tabular-nums', analysis.rateMissing && 'text-amber-600')}>
              Rs. {n2(analysis.costPerBox)}
            </div>
            <div className="text-[10px] text-muted-foreground tabular-nums">
              Rs. {n0(analysis.totalCost)} for {n0(geometry.pcs)}
            </div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-muted-foreground">Safe Working Load</div>
            <div className="text-sm font-bold tabular-nums">
              {strength.bctConfidence === 'unavailable' ? '—' : `${n1(strength.workingLoadKg)} kg`}
            </div>
            <div className="text-[10px] text-muted-foreground tabular-nums">
              {strength.bctConfidence === 'unavailable' ? 'needs dimensions' : `BCT ${n0(strength.bctKgf)} kg ÷ ${n1(strength.safetyDivisor)}`}
            </div>
          </div>
        </div>

        <div className={cn('rounded-md border px-3 py-2 flex items-start gap-2', style.cls)}>
          <Icon className="h-4 w-4 shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={cn('text-[9px] font-bold text-white px-1.5 py-0.5 rounded', style.chip)}>
                {VERDICT_LABEL[recommendation.verdict]}
              </span>
              <span className="text-xs font-bold">{recommendation.headline}</span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{recommendation.detail}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */

export const BoxDesigner = ({
  open, onOpenChange, item, rates, onChange, title,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  item: any;
  rates: RateContext;
  onChange: (patch: Record<string, any>) => void;
  title?: string;
}) => {
  const [showDetails, setShowDetails] = useState(false);

  const layers = useMemo(() => deriveLayers(item), [item]);
  const analysis = useMemo(() => analyzeBox(item, rates), [item, rates]);

  /**
   * Every layer edit writes the new stack AND its legacy projection in one
   * patch. That keeps topGsm/flute1Gsm/paperType/ply correct for the
   * quotation preview, the PDF export and the product catalog sync without
   * any of them knowing layers exist.
   */
  const commit = (next: BoxLayer[]) => {
    const clean = sanitizeLayers(next);
    onChange({ layers: clean, ...projectLayersToLegacy(clean) });
  };

  const updateLayer = (id: string, patch: Partial<BoxLayer>) =>
    commit(layers.map(l => (l.id === id ? { ...l, ...patch } : l)));

  const removeLayer = (id: string) => commit(layers.filter(l => l.id !== id));

  const duplicateLayer = (id: string) => {
    const idx = layers.findIndex(l => l.id === id);
    if (idx < 0) return;
    const next = [...layers];
    next.splice(idx + 1, 0, makeLayer(layers[idx].kind, layers[idx]));
    commit(next);
  };

  const moveLayer = (id: string, dir: -1 | 1) => {
    const idx = layers.findIndex(l => l.id === id);
    const target = idx + dir;
    if (idx < 0 || target < 0 || target >= layers.length) return;
    const next = [...layers];
    [next[idx], next[target]] = [next[target], next[idx]];
    commit(next);
  };

  const addLayer = (kind: 'liner' | 'flute') => {
    // Seed from the nearest same-kind layer so adding a ply to a 5 ply stack
    // doesn't mean retyping the whole spec.
    const seed = [...layers].reverse().find(l => l.kind === kind) || layers[layers.length - 1];
    commit([...layers, makeLayer(kind, { ...seed, id: undefined } as any)]);
  };

  const strength = analysis.strength;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl p-0 flex flex-col gap-0">
        <SheetHeader className="px-4 py-3 border-b shrink-0">
          <SheetTitle className="text-sm flex items-center gap-2">
            <LayersIcon className="h-4 w-4" /> Box Designer
          </SheetTitle>
          <SheetDescription className="text-xs">
            {title || 'Layer-by-layer construction, material requirement and load assessment.'}
          </SheetDescription>
        </SheetHeader>

        {/* The summary never scrolls away. */}
        <BoxSummary analysis={analysis} />

        <Tabs defaultValue="construction" className="flex-1 flex flex-col min-h-0">
          <TabsList className="mx-4 mt-3 grid grid-cols-3 h-9 shrink-0">
            <TabsTrigger value="construction" className="text-xs">Construction</TabsTrigger>
            <TabsTrigger value="materials" className="text-xs">Materials</TabsTrigger>
            <TabsTrigger value="strength" className="text-xs">Strength</TabsTrigger>
          </TabsList>

          <ScrollArea className="flex-1 min-h-0">
            {/* ---------------- Construction ---------------- */}
            <TabsContent value="construction" className="px-4 py-3 space-y-2 mt-0">
              {analysis.layers.map((b, i) => {
                const layer = layers[i];
                if (!layer) return null;
                return (
                  <LayerCard
                    key={layer.id}
                    layer={layer}
                    breakdown={b}
                    index={i}
                    total={layers.length}
                    onUpdate={patch => updateLayer(layer.id, patch)}
                    onRemove={() => removeLayer(layer.id)}
                    onMove={dir => moveLayer(layer.id, dir)}
                    onDuplicate={() => duplicateLayer(layer.id)}
                  />
                );
              })}

              <div className="flex flex-wrap gap-2 pt-1">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8 text-xs">
                      <Plus className="h-3.5 w-3.5 mr-1" /> Add Layer
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuItem onClick={() => addLayer('liner')}>Liner (flat sheet)</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => addLayer('flute')}>Flute (corrugated medium)</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <div className="text-[10px] text-muted-foreground self-center">
                  Board grammage {n1(analysis.totalGsm)} g/m&sup2; &middot; sheet {n0(analysis.geometry.sheetSizeL)} &times; {n0(analysis.geometry.sheetSizeB)} mm
                </div>
              </div>
            </TabsContent>

            {/* ---------------- Materials ---------------- */}
            <TabsContent value="materials" className="px-4 py-3 space-y-3 mt-0">
              <div>
                <h3 className="text-[10px] font-black uppercase tracking-wider text-muted-foreground border-b pb-1.5 mb-2">
                  Material Requirement &mdash; {n0(analysis.geometry.pcs)} boxes
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-[11px] border-collapse">
                    <thead>
                      <tr className="border-b bg-muted/40">
                        <th className="text-left py-1.5 px-2 font-bold">Material</th>
                        <th className="text-center py-1.5 px-2 font-bold">BF</th>
                        <th className="text-center py-1.5 px-2 font-bold">GSM</th>
                        <th className="text-right py-1.5 px-2 font-bold">g/Box</th>
                        <th className="text-right py-1.5 px-2 font-bold">Total kg</th>
                        <th className="text-right py-1.5 px-2 font-bold">Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analysis.materials.map(m => (
                        <tr key={m.key} className="border-b hover:bg-muted/20">
                          <td className="py-1.5 px-2">
                            <div className="font-semibold">{materialLabel(m.paperType)}</div>
                            {/* Consolidation never hides which layers it came from. */}
                            <div className="text-[9px] text-muted-foreground">{m.roleLabels.join(' + ')}</div>
                          </td>
                          <td className="text-center py-1.5 px-2 tabular-nums">{m.bf || '—'}</td>
                          <td className="text-center py-1.5 px-2 tabular-nums">{n0(m.gsm)}</td>
                          <td className="text-right py-1.5 px-2 tabular-nums">{n1(m.weightPerBox)}</td>
                          <td className="text-right py-1.5 px-2 tabular-nums font-semibold">{n2(m.totalKg)}</td>
                          <td className={cn('text-right py-1.5 px-2 tabular-nums', m.rateMissing && 'text-amber-600')}>
                            {m.rateMissing ? 'no rate' : n0(m.cost)}
                          </td>
                        </tr>
                      ))}
                      {analysis.materials.length === 0 && (
                        <tr><td colSpan={6} className="py-4 text-center text-muted-foreground">Add a layer with a GSM to see the material requirement.</td></tr>
                      )}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 font-bold bg-muted/20">
                        <td colSpan={4} className="py-1.5 px-2 text-right">Total (incl. {n1(analysis.wastagePercent)}% wastage)</td>
                        <td className="text-right py-1.5 px-2 tabular-nums">{n2(analysis.totalWeightGross / 1000)}</td>
                        <td className="text-right py-1.5 px-2 tabular-nums">{n0(analysis.paperCost)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                {analysis.rateMissing && (
                  <p className="text-[10px] text-amber-700 mt-2 flex items-start gap-1">
                    <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                    One or more materials have no rate configured. Their cost reads as zero, which understates the total &mdash; set a global rate, or a per-layer rate override on that layer.
                  </p>
                )}
              </div>

              {/* Transparency: how every gram was arrived at. */}
              <Collapsible open={showDetails} onOpenChange={setShowDetails}>
                <CollapsibleTrigger asChild>
                  <button type="button" className="w-full flex items-center justify-between px-3 py-2 border rounded-md bg-muted/20 hover:bg-muted/40 text-left">
                    <span className="text-[10px] font-black uppercase tracking-wider">Calculation Details</span>
                    {showDetails ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="border border-t-0 rounded-b-md px-3 py-2 space-y-2 text-[10px]">
                    <div className="text-muted-foreground">
                      Sheet {n0(analysis.geometry.sheetSizeL)} &times; {n0(analysis.geometry.sheetSizeB)} mm
                      = <b>{analysis.geometry.sheetArea.toFixed(4)} m&sup2;</b> per box
                      &middot; {n0(analysis.geometry.pcs)} pcs &middot; wastage {n1(analysis.wastagePercent)}%
                    </div>
                    {analysis.layers.map(l => (
                      <div key={l.layerId} className="border-t pt-1.5">
                        <div className="font-bold">Layer {l.position} &mdash; {l.roleLabel}</div>
                        <div className="text-muted-foreground leading-relaxed">
                          {analysis.geometry.sheetArea.toFixed(4)} m&sup2; &times; {n0(l.gsm)} GSM
                          {l.takeUp !== 1 && ` × ${l.takeUp} take-up`}
                          {' = '}<b>{n1(l.weightPerBox)} g/box</b>
                          <br />
                          {n1(l.weightPerBox)} g &times; {n0(analysis.geometry.pcs)} pcs &times; {(1 + analysis.wastagePercent / 100).toFixed(3)}
                          {' = '}<b>{n2(l.weightGross / 1000)} kg</b>
                          <br />
                          {n2(l.weightGross / 1000)} kg &times; Rs. {n2(l.effectiveRate)}/kg
                          {l.paperRate > 0 && ` (${n0(l.paperRate)} paper + ${n0(l.effectiveRate - l.paperRate)} conversion)`}
                          {' = '}<b>Rs. {n2(l.cost)}</b>
                        </div>
                      </div>
                    ))}
                    <div className="border-t pt-1.5 font-bold">
                      Total {n1(analysis.boxWeightGross)} g/box &middot; {n2(analysis.totalWeightGross / 1000)} kg
                      &middot; Rs. {n2(analysis.paperCost)} paper
                      {analysis.transportCost > 0 && ` + Rs. ${n2(analysis.transportCost)} transport`}
                    </div>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </TabsContent>

            {/* ---------------- Strength ---------------- */}
            <TabsContent value="strength" className="px-4 py-3 space-y-3 mt-0">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Field label="Customer Required Load (kg/box)" hint="What the customer told you the box must carry">
                  <Input type="number" className="h-9 text-sm font-bold" value={item.requiredLoadKg ?? ''}
                    onChange={e => onChange({ requiredLoadKg: e.target.value })} placeholder="e.g. 10" />
                </Field>
                <Field label="Measured Board ECT (kN/m)" hint="From a lab report - replaces the estimate entirely">
                  <Input type="number" step="0.01" className="h-9 text-sm" value={item.measuredEct ?? ''}
                    onChange={e => onChange({ measuredEct: e.target.value })} placeholder="optional" />
                </Field>
              </div>

              <div>
                <h3 className="text-[10px] font-black uppercase tracking-wider text-muted-foreground border-b pb-1.5 mb-2">
                  Service Conditions
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <Field label="Storage Duration">
                    <Select value={item.storageDuration || 'medium'} onValueChange={v => onChange({ storageDuration: v })}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="short">Short (under 10 days)</SelectItem>
                        <SelectItem value="medium">Medium (up to 30 days)</SelectItem>
                        <SelectItem value="long">Long (months)</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Humidity">
                    <Select value={item.humidity || 'normal'} onValueChange={v => onChange({ humidity: v })}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Dry (~50% RH)</SelectItem>
                        <SelectItem value="normal">Normal (65-70% RH)</SelectItem>
                        <SelectItem value="high">High / monsoon (85%+)</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Stacking">
                    <Select value={item.stacking || 'aligned'} onValueChange={v => onChange({ stacking: v })}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="aligned">Column (aligned)</SelectItem>
                        <SelectItem value="interlocked">Interlocked</SelectItem>
                        <SelectItem value="overhang">Pallet overhang</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { label: 'Burst', value: `${n2(strength.burstKgfPerCm2)}`, unit: 'kgf/cm²', conf: 'measured' as const },
                  { label: 'Edge Crush', value: n2(strength.ectKnPerM), unit: 'kN/m', conf: strength.ectConfidence },
                  { label: 'Caliper', value: n2(strength.caliperMm), unit: 'mm', conf: strength.caliperConfidence },
                  { label: 'Compression', value: n0(strength.bctKgf), unit: 'kgf (BCT)', conf: strength.bctConfidence },
                ].map(s => (
                  <div key={s.label} className="border rounded-md px-2 py-1.5">
                    <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{s.label}</div>
                    <div className="text-sm font-bold tabular-nums">{s.value}</div>
                    <div className="text-[9px] text-muted-foreground">{s.unit}</div>
                    <Badge variant="outline" className={cn(
                      'text-[8px] px-1 py-0 h-3.5 mt-0.5',
                      s.conf === 'measured' ? 'border-emerald-400 text-emerald-700' : 'border-amber-400 text-amber-700'
                    )}>
                      {s.conf === 'measured' ? 'calculated' : s.conf === 'unavailable' ? 'n/a' : 'estimated'}
                    </Badge>
                  </div>
                ))}
              </div>

              {/* Why the safe number is far below the lab number. */}
              <div>
                <h3 className="text-[10px] font-black uppercase tracking-wider text-muted-foreground border-b pb-1.5 mb-2">
                  Safety Derating &mdash; {n1(strength.safetyDivisor)}&times; total
                </h3>
                <div className="space-y-1">
                  {strength.derating.map(d => (
                    <div key={d.label} className="flex items-start gap-2 text-[10px]">
                      <span className="font-bold tabular-nums w-10 shrink-0">{d.factor.toFixed(2)}&times;</span>
                      <span className="font-semibold w-28 shrink-0">{d.label}</span>
                      <span className="text-muted-foreground">{d.note}</span>
                    </div>
                  ))}
                  <div className="flex items-center gap-2 text-[11px] border-t pt-1.5 font-bold">
                    <Scale className="h-3.5 w-3.5" />
                    {n0(strength.bctKgf)} kgf BCT &divide; {n1(strength.safetyDivisor)} = {n1(strength.workingLoadKg)} kg safe working load
                  </div>
                </div>
              </div>

              {analysis.recommendation.suggestions.length > 0 && (
                <div>
                  <h3 className="text-[10px] font-black uppercase tracking-wider text-muted-foreground border-b pb-1.5 mb-2">
                    Recommendation
                  </h3>
                  <ul className="space-y-1">
                    {analysis.recommendation.suggestions.map((s, i) => (
                      <li key={i} className="text-[11px] flex items-start gap-1.5 leading-snug">
                        <span className="text-muted-foreground mt-0.5">&rarr;</span>
                        <span>{s}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {strength.limitations.length > 0 && (
                <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2">
                  <div className="text-[10px] font-black uppercase tracking-wider text-amber-800 mb-1 flex items-center gap-1">
                    <Info className="h-3 w-3" /> Limits of this estimate
                  </div>
                  <ul className="space-y-1">
                    {strength.limitations.map((l, i) => (
                      <li key={i} className="text-[10px] text-amber-900 leading-snug">&bull; {l}</li>
                    ))}
                  </ul>
                </div>
              )}
            </TabsContent>
          </ScrollArea>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
};
