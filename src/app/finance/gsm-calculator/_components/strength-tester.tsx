'use client';

/**
 * Board Strength Tester.
 *
 * A scratchpad for the question "will this board carry what the customer
 * asked for", with no quotation, party or costing attached. Same engine as
 * the Box Designer in the quotation calculator (src/lib/box-engine), so a
 * construction tested here and then quoted gives the same numbers - but
 * nothing typed here is saved, which is the point: it's for trying
 * combinations before committing to one.
 *
 * Honesty rules carried over from the engine, and visible in the UI:
 *  - Burst is a real calculation from BF and GSM.
 *  - ECT is an ESTIMATE unless measured RCT or a measured board ECT is
 *    entered, and is labelled as such on the result card.
 *  - The safe working load is never the raw BCT - the derating chain that
 *    separates them is listed line by line.
 */

import { useMemo, useState } from 'react';
import {
    Plus, Trash2, Copy, ArrowUp, ArrowDown, ChevronDown, ChevronUp,
    AlertTriangle, CheckCircle2, Info, TrendingDown, Scale, RotateCcw,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { BF_OPTIONS } from '@/lib/constants';
import {
    calculateStrength, buildRecommendation, resolveGeometry, makeLayer, describeLayers,
    calculateLayers, FLUTE_PROFILES, PAPER_MATERIALS, materialLabel,
} from '@/lib/box-engine';
import type { BoxLayer, FitVerdict, ServiceConditions } from '@/lib/box-engine';

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

/** Build an alternating liner/flute stack of `ply` layers at one spec. */
const preset = (ply: number, gsmLiner = '120', gsmFlute = '100', bf = '18 BF'): BoxLayer[] =>
    Array.from({ length: ply }, (_, i) =>
        makeLayer(i % 2 === 1 ? 'flute' : 'liner', {
            paperType: 'KRAFT', bf, gsm: i % 2 === 1 ? gsmFlute : gsmLiner,
        }));

const Field = ({ label, children, hint }: any) => (
    <div className="space-y-1">
        <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</Label>
        {children}
        {hint && <p className="text-[10px] text-muted-foreground leading-tight">{hint}</p>}
    </div>
);

const LayerRow = ({ layer, info, weightPerBox, index, total, onUpdate, onRemove, onMove, onDuplicate }: any) => {
    const [open, setOpen] = useState(false);
    const isFlute = layer.kind === 'flute';

    return (
        <Collapsible open={open} onOpenChange={setOpen}>
            <Card className="border shadow-sm overflow-hidden">
                <CollapsibleTrigger asChild>
                    <button type="button" className="w-full text-left px-3 py-2 hover:bg-muted/40 transition-colors">
                        <div className="flex items-center gap-2">
                            {open ? <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
                                  : <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />}
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-xs font-bold">Layer {index + 1} &mdash; {info.roleLabel}</span>
                                    {isFlute && <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4">{layer.fluteProfile || 'B'} flute</Badge>}
                                    {layer.rctKnPerM && <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 border-emerald-400 text-emerald-700">RCT set</Badge>}
                                </div>
                                <div className="text-[11px] text-muted-foreground truncate">
                                    {materialLabel(layer.paperType)}{layer.bf ? ` · ${layer.bf}` : ''} · {layer.gsm || 0} GSM
                                </div>
                            </div>
                            <div className="text-right shrink-0">
                                <div className="text-xs font-bold tabular-nums">{n1(weightPerBox)} g</div>
                                <div className="text-[10px] text-muted-foreground">per box</div>
                            </div>
                        </div>
                    </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                    <CardContent className="px-3 pb-3 pt-3 space-y-3 border-t bg-muted/10">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
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
                                <Select value={layer.paperType} onValueChange={(v: string) => onUpdate({ paperType: v })}>
                                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        {PAPER_MATERIALS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </Field>
                            <Field label="BF">
                                <Select value={layer.bf} onValueChange={(v: string) => onUpdate({ bf: v })}>
                                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="BF" /></SelectTrigger>
                                    <SelectContent>{BF_OPTIONS.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
                                </Select>
                            </Field>
                            <Field label="GSM">
                                <Input type="number" className="h-8 text-xs" value={layer.gsm ?? ''} onChange={e => onUpdate({ gsm: e.target.value })} />
                            </Field>
                        </div>

                        {isFlute && (
                            <Field label="Flute Profile" hint={`Take-up ${FLUTE_PROFILES[layer.fluteProfile || 'B']?.takeUp ?? 1.35}x · height ${FLUTE_PROFILES[layer.fluteProfile || 'B']?.heightMm ?? 2.5} mm`}>
                                <Select value={layer.fluteProfile || 'B'} onValueChange={(v: string) => onUpdate({ fluteProfile: v })}>
                                    <SelectTrigger className="h-8 text-xs sm:max-w-xs"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        {Object.entries(FLUTE_PROFILES).map(([k, p]) => <SelectItem key={k} value={k}>{p.label}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </Field>
                        )}

                        <div className="grid grid-cols-2 gap-2">
                            <Field label="RCT (kN/m)" hint="Measured ring crush - makes ECT a real calculation">
                                <Input type="number" step="0.01" className="h-8 text-xs" value={layer.rctKnPerM ?? ''}
                                    onChange={e => onUpdate({ rctKnPerM: e.target.value })} placeholder="estimated" />
                            </Field>
                            <Field label="Caliper (micron)" hint="Measured thickness">
                                <Input type="number" className="h-8 text-xs" value={layer.caliperMicron ?? ''}
                                    onChange={e => onUpdate({ caliperMicron: e.target.value })} placeholder="estimated" />
                            </Field>
                        </div>

                        <div className="flex justify-end gap-1 pt-1 border-t">
                            <Button variant="ghost" size="icon" className="h-7 w-7" title="Move up" disabled={index === 0} onClick={() => onMove(-1)}><ArrowUp className="h-3.5 w-3.5" /></Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" title="Move down" disabled={index === total - 1} onClick={() => onMove(1)}><ArrowDown className="h-3.5 w-3.5" /></Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" title="Duplicate" onClick={onDuplicate}><Copy className="h-3.5 w-3.5" /></Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" title="Remove" disabled={total <= 1} onClick={onRemove}><Trash2 className="h-3.5 w-3.5" /></Button>
                        </div>
                    </CardContent>
                </CollapsibleContent>
            </Card>
        </Collapsible>
    );
};

export function BoardStrengthTester() {
    const [dims, setDims] = useState({ l: '400', b: '300', h: '250' });
    const [layers, setLayers] = useState<BoxLayer[]>(() => preset(3));
    const [conditions, setConditions] = useState<ServiceConditions>({
        storageDuration: 'medium', humidity: 'normal', stacking: 'aligned', requiredLoadKg: '',
    });
    const [measuredEct, setMeasuredEct] = useState('');
    const [showDetails, setShowDetails] = useState(false);

    const geometry = useMemo(
        () => resolveGeometry({ ...dims, noOfPcs: '1' }),
        [dims]
    );

    const strength = useMemo(
        () => calculateStrength(layers, geometry, conditions, measuredEct),
        [layers, geometry, conditions, measuredEct]
    );

    const recommendation = useMemo(
        () => buildRecommendation(strength, layers, conditions),
        [strength, layers, conditions]
    );

    // Weights only, at a zero rate - this screen is about strength, so the
    // cost side of the engine is deliberately not wired up here.
    const breakdowns = useMemo(
        () => calculateLayers(layers, geometry, 0, {
            kraftByBf: {}, virgin: 0, conversion: 0, transport: 0, transportType: 'Per Consignment',
        }),
        [layers, geometry]
    );

    const described = useMemo(() => describeLayers(layers), [layers]);
    const boxWeight = breakdowns.reduce((s, l) => s + l.weightPerBox, 0);
    const totalGsm = breakdowns.reduce((s, l) => s + l.effectiveGsm, 0);

    const updateLayer = (id: string, patch: Partial<BoxLayer>) =>
        setLayers(prev => prev.map(l => (l.id === id ? { ...l, ...patch } : l)));
    const removeLayer = (id: string) => setLayers(prev => prev.filter(l => l.id !== id));
    const duplicateLayer = (id: string) => setLayers(prev => {
        const i = prev.findIndex(l => l.id === id);
        if (i < 0) return prev;
        const next = [...prev];
        next.splice(i + 1, 0, makeLayer(prev[i].kind, prev[i]));
        return next;
    });
    const moveLayer = (id: string, dir: -1 | 1) => setLayers(prev => {
        const i = prev.findIndex(l => l.id === id);
        const t = i + dir;
        if (i < 0 || t < 0 || t >= prev.length) return prev;
        const next = [...prev];
        [next[i], next[t]] = [next[t], next[i]];
        return next;
    });
    const addLayer = (kind: 'liner' | 'flute') => setLayers(prev => {
        const seed = [...prev].reverse().find(l => l.kind === kind) || prev[prev.length - 1];
        return [...prev, makeLayer(kind, { ...seed, id: undefined } as any)];
    });

    const style = VERDICT_STYLE[recommendation.verdict];
    const VerdictIcon = style.icon;

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* ------------------------- INPUTS ------------------------- */}
            <div className="space-y-4">
                <Card className="shadow-sm">
                    <CardHeader className="py-3 px-4">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                            <div>
                                <CardTitle className="text-sm">Box &amp; Construction</CardTitle>
                                <CardDescription className="text-xs">Nothing here is saved &mdash; it is a scratchpad for trying combinations.</CardDescription>
                            </div>
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="outline" size="sm" className="h-8 text-xs">
                                        <RotateCcw className="h-3.5 w-3.5 mr-1" /> Preset
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    <DropdownMenuItem onClick={() => setLayers(preset(3))}>3 Ply &mdash; 120/100/120 @ 18 BF</DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => setLayers(preset(5))}>5 Ply &mdash; 120/100 @ 18 BF</DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => setLayers(preset(7))}>7 Ply &mdash; 120/100 @ 18 BF</DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => setLayers(preset(3, '150', '140', '20 BF'))}>3 Ply heavy &mdash; 150/140 @ 20 BF</DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    </CardHeader>
                    <CardContent className="px-4 pb-4 space-y-3">
                        <div className="grid grid-cols-3 gap-2">
                            <Field label="Length (mm)">
                                <Input type="number" className="h-9 text-sm" value={dims.l} onChange={e => setDims({ ...dims, l: e.target.value })} />
                            </Field>
                            <Field label="Width (mm)">
                                <Input type="number" className="h-9 text-sm" value={dims.b} onChange={e => setDims({ ...dims, b: e.target.value })} />
                            </Field>
                            <Field label="Height (mm)">
                                <Input type="number" className="h-9 text-sm" value={dims.h} onChange={e => setDims({ ...dims, h: e.target.value })} />
                            </Field>
                        </div>

                        <div className="space-y-2">
                            {layers.map((layer, i) => (
                                <LayerRow
                                    key={layer.id}
                                    layer={layer}
                                    info={described[i]}
                                    weightPerBox={breakdowns[i]?.weightPerBox || 0}
                                    index={i}
                                    total={layers.length}
                                    onUpdate={(patch: Partial<BoxLayer>) => updateLayer(layer.id, patch)}
                                    onRemove={() => removeLayer(layer.id)}
                                    onMove={(d: -1 | 1) => moveLayer(layer.id, d)}
                                    onDuplicate={() => duplicateLayer(layer.id)}
                                />
                            ))}
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="outline" size="sm" className="h-8 text-xs"><Plus className="h-3.5 w-3.5 mr-1" /> Add Layer</Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="start">
                                    <DropdownMenuItem onClick={() => addLayer('liner')}>Liner (flat sheet)</DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => addLayer('flute')}>Flute (corrugated medium)</DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                            <span className="text-[10px] text-muted-foreground">
                                {layers.length} ply &middot; {n1(totalGsm)} g/m&sup2; &middot; {n1(boxWeight)} g/box
                            </span>
                        </div>
                    </CardContent>
                </Card>

                <Card className="shadow-sm">
                    <CardHeader className="py-3 px-4">
                        <CardTitle className="text-sm">Requirement &amp; Service Conditions</CardTitle>
                        <CardDescription className="text-xs">Storage and humidity change the safe load more than most people expect.</CardDescription>
                    </CardHeader>
                    <CardContent className="px-4 pb-4 space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <Field label="Customer Required Load (kg/box)">
                                <Input type="number" className="h-9 text-sm font-bold" placeholder="e.g. 10"
                                    value={conditions.requiredLoadKg ?? ''}
                                    onChange={e => setConditions({ ...conditions, requiredLoadKg: e.target.value })} />
                            </Field>
                            <Field label="Measured Board ECT (kN/m)" hint="From a lab report - replaces the estimate">
                                <Input type="number" step="0.01" className="h-9 text-sm" placeholder="optional"
                                    value={measuredEct} onChange={e => setMeasuredEct(e.target.value)} />
                            </Field>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            <Field label="Storage Duration">
                                <Select value={conditions.storageDuration} onValueChange={(v: any) => setConditions({ ...conditions, storageDuration: v })}>
                                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="short">Short (under 10 days)</SelectItem>
                                        <SelectItem value="medium">Medium (up to 30 days)</SelectItem>
                                        <SelectItem value="long">Long (months)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </Field>
                            <Field label="Humidity">
                                <Select value={conditions.humidity} onValueChange={(v: any) => setConditions({ ...conditions, humidity: v })}>
                                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="low">Dry (~50% RH)</SelectItem>
                                        <SelectItem value="normal">Normal (65-70% RH)</SelectItem>
                                        <SelectItem value="high">High / monsoon (85%+)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </Field>
                            <Field label="Stacking">
                                <Select value={conditions.stacking} onValueChange={(v: any) => setConditions({ ...conditions, stacking: v })}>
                                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="aligned">Column (aligned)</SelectItem>
                                        <SelectItem value="interlocked">Interlocked</SelectItem>
                                        <SelectItem value="overhang">Pallet overhang</SelectItem>
                                    </SelectContent>
                                </Select>
                            </Field>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* ------------------------- RESULTS ------------------------- */}
            <div className="space-y-4">
                <div className={cn('rounded-md border px-3 py-2.5 flex items-start gap-2', style.cls)}>
                    <VerdictIcon className="h-4 w-4 shrink-0 mt-0.5" />
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

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                        { label: 'Burst', value: n2(strength.burstKgfPerCm2), unit: 'kgf/cm²', conf: 'measured' as const },
                        { label: 'Edge Crush', value: n2(strength.ectKnPerM), unit: 'kN/m', conf: strength.ectConfidence },
                        { label: 'Caliper', value: n2(strength.caliperMm), unit: 'mm', conf: strength.caliperConfidence },
                        { label: 'Compression', value: n0(strength.bctKgf), unit: 'kgf (BCT)', conf: strength.bctConfidence },
                    ].map(s => (
                        <div key={s.label} className="border rounded-md px-2 py-1.5 bg-background">
                            <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{s.label}</div>
                            <div className="text-base font-bold tabular-nums">{s.value}</div>
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

                <Card className="shadow-sm">
                    <CardHeader className="py-3 px-4">
                        <CardTitle className="text-sm">Safety Derating &mdash; {n1(strength.safetyDivisor)}&times; total</CardTitle>
                        <CardDescription className="text-xs">A lab BCT is a fast crush of a dry box. These factors bridge it to real storage.</CardDescription>
                    </CardHeader>
                    <CardContent className="px-4 pb-4 space-y-1">
                        {strength.derating.map(d => (
                            <div key={d.label} className="flex items-start gap-2 text-[10px]">
                                <span className="font-bold tabular-nums w-10 shrink-0">{d.factor.toFixed(2)}&times;</span>
                                <span className="font-semibold w-24 sm:w-28 shrink-0">{d.label}</span>
                                <span className="text-muted-foreground">{d.note}</span>
                            </div>
                        ))}
                        <div className="flex items-center gap-2 text-[11px] border-t pt-2 mt-1 font-bold">
                            <Scale className="h-3.5 w-3.5 shrink-0" />
                            <span className="tabular-nums">
                                {n0(strength.bctKgf)} kgf &divide; {n1(strength.safetyDivisor)} = {n1(strength.workingLoadKg)} kg safe working load
                            </span>
                        </div>
                    </CardContent>
                </Card>

                {recommendation.suggestions.length > 0 && (
                    <Card className="shadow-sm">
                        <CardHeader className="py-3 px-4"><CardTitle className="text-sm">Recommendation</CardTitle></CardHeader>
                        <CardContent className="px-4 pb-4">
                            <ul className="space-y-1">
                                {recommendation.suggestions.map((sg, i) => (
                                    <li key={i} className="text-[11px] flex items-start gap-1.5 leading-snug">
                                        <span className="text-muted-foreground mt-0.5">&rarr;</span><span>{sg}</span>
                                    </li>
                                ))}
                            </ul>
                        </CardContent>
                    </Card>
                )}

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
                                Sheet {n0(geometry.sheetSizeL)} &times; {n0(geometry.sheetSizeB)} mm = <b>{geometry.sheetArea.toFixed(4)} m&sup2;</b> per box
                                &middot; perimeter {n0(strength.perimeterMm)} mm
                            </div>
                            {breakdowns.map(l => (
                                <div key={l.layerId} className="border-t pt-1.5">
                                    <div className="font-bold">Layer {l.position} &mdash; {l.roleLabel}</div>
                                    <div className="text-muted-foreground leading-relaxed">
                                        {geometry.sheetArea.toFixed(4)} m&sup2; &times; {n0(l.gsm)} GSM
                                        {l.takeUp !== 1 && ` × ${l.takeUp} take-up`} = <b>{n1(l.weightPerBox)} g/box</b>
                                    </div>
                                </div>
                            ))}
                            <div className="border-t pt-1.5 text-muted-foreground leading-relaxed">
                                <b>Board:</b> {n1(totalGsm)} g/m&sup2; &middot; {n1(boxWeight)} g/box
                                <br />
                                <b>Burst:</b> sum over liners of BF &times; GSM &divide; 1000 = <b>{n2(strength.burstKgfPerCm2)} kgf/cm&sup2;</b>
                                <br />
                                <b>BCT (McKee):</b> 5.87 &times; {n2(strength.ectKnPerM)} kN/m &times; &radic;({n2(strength.caliperMm)} mm &times; {n0(strength.perimeterMm)} mm)
                                {' = '}<b>{n0(strength.bctKgf)} kgf</b>
                            </div>
                        </div>
                    </CollapsibleContent>
                </Collapsible>

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
            </div>
        </div>
    );
}
