'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import type { 
  Product, 
  Party, 
  PartyType, 
  CostReport, 
  CostReportItem, 
  ProductSpecification, 
  CostSetting, 
  CalculatedValues, 
  CostReportTerm,
  Accessory,
  AccountOwnership,
  Deal,
  QuotationStatus
} from '@/lib/types';
import { addProduct as addProductService, updateProduct } from '@/services/product-service';
import { onPartiesUpdate, addParty } from '@/services/party-service';
import { 
  onCostReportsUpdate, 
  addCostReport, 
  updateCostReport,
  generateNextCostReportNumber, 
  reserveCostReportNumber, 
} from '@/services/cost-report-service';
import { onDealsUpdate } from '@/services/deal-service';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { 
  Plus, 
  Trash2, 
  Check, 
  PlusCircle, 
  Save, 
  Image as ImageIcon, 
  Settings2,
  FileSpreadsheet,
  ChevronsUpDown,
  Calendar as CalendarIcon,
  X,
  Loader2,
  ChevronDown,
  ChevronUp,
  Target,
  Copy,
  AlertTriangle,
  Layers,
  Boxes,
  ChevronRight,
  ChevronsLeftRight,
  Lock,
  Unlock
} from 'lucide-react';
import { 
  Table, 
  TableBody, 
  TableCell,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { cn, toNepaliDate, normalizeBF, generateId } from '@/lib/utils';
import { calculateItemCost as sharedCalculateItemCost } from '@/lib/cost-calculator';
import type { RateContext } from '@/lib/box-engine';
import {
  PAPER_MATERIALS, FLUTE_PROFILES, DEFAULT_FLUTE_PROFILE, deriveLayers,
  projectLayersToLegacy, resolveTakeUp,
} from '@/lib/box-engine';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { onSettingUpdate, updateCostSettings } from '@/services/settings-service';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Textarea } from '@/components/ui/textarea';
import React from 'react';
import { PLY_OPTIONS, BF_OPTIONS } from '@/lib/constants';
import { ProductForm } from './product-form';
import { BoxDesigner } from './box-designer';

const ManageTermsDialog = React.lazy(() => import('./terms-dialog').then(m => ({ default: m.ManageTermsDialog })));

/**
 * One collapsible sub-section of the Quotation Setup panel.
 *
 * The four sections sat open side by side, which is fine on a monitor and a
 * wall of scrolling on a phone where the grid collapses to one column. Each
 * now opens on its own and shows a summary line when shut, so the panel can
 * be read at a glance and only the section being edited takes space.
 */
const SetupSection = ({ title, summary, open, onToggle, action, children }: {
    title: string;
    summary?: React.ReactNode;
    open: boolean;
    onToggle: () => void;
    action?: React.ReactNode;
    children: React.ReactNode;
}) => (
    <Collapsible open={open} onOpenChange={onToggle} className="border rounded-md bg-background xl:border-0 xl:rounded-none xl:bg-transparent">
        <div className="flex items-center border-b xl:pb-1.5">
            <CollapsibleTrigger asChild>
                <button type="button" className="flex-1 min-w-0 flex items-center gap-1.5 px-2.5 py-2 xl:px-0 xl:py-0 text-left hover:bg-muted/40 xl:hover:bg-transparent transition-colors">
                    {open ? <ChevronUp className="h-3 w-3 shrink-0 text-muted-foreground" />
                          : <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />}
                    <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground shrink-0">{title}</span>
                    {!open && summary && (
                        <span className="text-[10px] text-muted-foreground/80 truncate">&middot; {summary}</span>
                    )}
                </button>
            </CollapsibleTrigger>
            {action && <div className="pr-1.5 xl:pr-0 shrink-0">{action}</div>}
        </div>
        <CollapsibleContent>
            <div className="space-y-4 p-2.5 pt-3 xl:p-0 xl:pt-4">{children}</div>
        </CollapsibleContent>
    </Collapsible>
);

/**
 * Clickable header for a collapsible column group.
 *
 * The costing table is ~2200px wide with every group open, which is fine on
 * a monitor and unusable anywhere else. Collapsing a group doesn't hide the
 * data - it swaps that group's columns for a single read-only summary cell,
 * so a row still reads end to end at a glance and only becomes editable
 * again when the group is reopened.
 */
const GroupToggle = ({ label, collapsed, onToggle }: { label: string; collapsed: boolean; onToggle: () => void }) => (
    <button
        type="button"
        onClick={onToggle}
        title={collapsed ? `Expand ${label} columns` : `Collapse ${label} columns to save width`}
        className="w-full h-full px-2 py-1.5 flex items-center justify-center gap-1 hover:bg-black/5 transition-colors"
    >
        <span className="truncate">{label}</span>
        {collapsed
            ? <ChevronRight className="h-3 w-3 shrink-0 opacity-60" />
            : <ChevronsLeftRight className="h-3 w-3 shrink-0 opacity-60" />}
    </button>
);

/**
 * The flute combination of a row, e.g. "B" for a single wall or "B+C" for a
 * double wall whose two mediums differ. Mixed constructions are real (a 5 ply
 * can be B+B, A+A or B+C) and the engine resolves each flute layer's take-up
 * independently, so the summary has to be able to show more than one.
 */
const fluteSummary = (o: any): string => {
    const layers = deriveLayers(o);
    const flutes = layers.filter((l: any) => l.kind === 'flute');
    if (flutes.length === 0) return '-';
    return flutes.map((l: any) => l.fluteProfile || DEFAULT_FLUTE_PROFILE).join('+');
};

/** True when a row's flute layers don't all share one profile - that row
 *  can't be set from the single-value dropdown without flattening it. */
const hasMixedFlutes = (o: any): boolean => {
    const flutes = deriveLayers(o).filter((l: any) => l.kind === 'flute');
    return new Set(flutes.map((l: any) => l.fluteProfile || DEFAULT_FLUTE_PROFILE)).size > 1;
};

/** The GSM stack of a row as "120/100/120", outer to inner, skipping the
 *  slots a lower ply count doesn't use. */
const gsmSummary = (o: any): string => {
    const ply = parseInt(o?.ply, 10) || 0;
    const order = ply >= 9 ? ['topGsm','flute1Gsm','middleGsm','flute2Gsm','liner2Gsm','flute3Gsm','liner3Gsm','flute4Gsm','bottomGsm']
        : ply >= 7 ? ['topGsm','flute1Gsm','middleGsm','flute2Gsm','liner2Gsm','flute3Gsm','bottomGsm']
        : ply >= 5 ? ['topGsm','flute1Gsm','middleGsm','flute2Gsm','bottomGsm']
        : ply >= 3 ? ['topGsm','flute1Gsm','bottomGsm']
        : ['topGsm','bottomGsm'];
    return order.map(f => o?.[f] || 0).join('/');
};

const CostingTableRow = React.memo(({
    item,
    index,
    maxPly,
    products,
    onItemChange,
    onAddAccessory,
    onRemoveItem,
    onDuplicateItem,
    onOpenDesigner,
    onFluteChange,
    collapsedGroups,
    onTogglePrint,
    selectedForPrint,
    onOpenQuickAddProduct
}: any) => {
    const [isProductPopoverOpen, setIsProductPopoverOpen] = useState(false);
    const [quickProductSearch, setQuickProductSearch] = useState('');

    const calc = item.calculated || { paperCost: 0, transportCost: 0, totalGsm: 0, paperWeight: 0 };
    const totalRowCost = (calc.paperCost || 0) +
        (calc.transportCost || 0) +
        (item.accessories || []).reduce((sum: number, acc: any) => sum + (acc.calculated?.paperCost || 0), 0);
    // Flags a row that has no dimensions yet (still costs Rs. 0 and would
    // silently save that way) so it's visually distinct from a row that's
    // genuinely priced at zero.
    const isIncomplete = (parseFloat(item.l) || 0) <= 0 || (parseFloat(item.b) || 0) <= 0;

    return (
        <React.Fragment>
            <TableRow className={cn("h-14 hover:bg-muted/30 border-b", isIncomplete && "bg-amber-50/40")} title={isIncomplete ? "Missing Length/Width - this row will cost Rs. 0 until filled in" : undefined}>
                <TableCell className="px-2 border-r">
                    <Checkbox
                        checked={selectedForPrint.has(item.id)}
                        onCheckedChange={v => onTogglePrint(item.id, !!v)}
                    />
                </TableCell>
                <TableCell className="border-r pr-2">
                    <div className="flex gap-1.5 items-center">
                        {isIncomplete && <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />}
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" title="Add Accessory"><Plus className="h-3.5 w-3.5" /></Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start">
                                <DropdownMenuItem onSelect={() => onAddAccessory(index, 'Honeycomb Partition')}>Honeycomb Partition</DropdownMenuItem>
                                <DropdownMenuItem onSelect={() => onAddAccessory(index, 'Layer Plate')}>Layer Plate</DropdownMenuItem>
                                <DropdownMenuItem onSelect={() => onAddAccessory(index, 'Corner Protectors')}>Corner Protectors</DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onSelect={() => onAddAccessory(index, 'Manual Entry')}>Manual Entry</DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                        <Popover open={isProductPopoverOpen} onOpenChange={setIsProductPopoverOpen}>
                            <PopoverTrigger asChild>
                                <Button variant="outline" role="combobox" className="h-8 text-[11px] w-full px-2 justify-between font-normal bg-white">
                                    <span className="truncate">{item.productId ? products.find((p: Product) => p.id === item.productId)?.name : "Select product..."}</span>
                                    <ChevronDown className="h-3 w-3 opacity-50 shrink-0" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="p-0 w-[300px]">
                                <Command>
                                    <CommandInput placeholder="Search catalog..." value={quickProductSearch} onValueChange={setQuickProductSearch} />
                                    <CommandList>
                                        <CommandEmpty>
                                            <Button 
                                                variant="ghost" 
                                                className="w-full justify-start text-[11px] text-primary font-bold" 
                                                onClick={() => {
                                                    onOpenQuickAddProduct(index, quickProductSearch);
                                                    setIsProductPopoverOpen(false);
                                                }}
                                            >
                                                <PlusCircle className="mr-2 h-3.5 w-3.5" /> Add "{quickProductSearch}" to catalog
                                            </Button>
                                        </CommandEmpty>
                                        <CommandGroup>
                                            {products.map((p: Product) => (
                                                <CommandItem 
                                                    key={p.id} 
                                                    value={p.name} 
                                                    onSelect={() => {
                                                        onItemChange(index, 'productId', p.id);
                                                        setIsProductPopoverOpen(false);
                                                    }}
                                                    className="text-[11px]"
                                                >
                                                    <Check className={cn("mr-2 h-3.5 w-3.5", item.productId === p.id ? "opacity-100" : "opacity-0")} />
                                                    {p.name}
                                                </CommandItem>
                                            ))}
                                        </CommandGroup>
                                    </CommandList>
                                </Command>
                            </PopoverContent>
                        </Popover>
                    </div>
                </TableCell>
                {collapsedGroups.spec ? (
                    <TableCell className="border-x px-2 text-[10px] leading-tight text-center bg-blue-50/20">
                        <div className="font-bold tabular-nums">{item.l || 0}&times;{item.b || 0}&times;{item.h || 0}</div>
                        <div className="text-muted-foreground tabular-nums">{item.noOfPcs || 0} pcs &middot; {item.ply || 0} ply &middot; {fluteSummary(item)}</div>
                        <div className="text-muted-foreground truncate">{(item.paperType || '').charAt(0) || '-'} {normalizeBF(item.paperBf) || '-'} &middot; {item.wastagePercent || 0}%</div>
                    </TableCell>
                ) : (<>
                <TableCell className="border-r p-0"><Input type="number" value={item.l ?? ''} onChange={e => onItemChange(index, 'l', e.target.value)} className="h-14 text-center px-0 w-full border-none focus-visible:ring-0 rounded-none bg-transparent" /></TableCell>
                <TableCell className="border-r p-0"><Input type="number" value={item.b ?? ''} onChange={e => onItemChange(index, 'b', e.target.value)} className="h-14 text-center px-0 w-full border-none focus-visible:ring-0 rounded-none bg-transparent" /></TableCell>
                <TableCell className="border-r p-0"><Input type="number" value={item.h ?? ''} onChange={e => onItemChange(index, 'h', e.target.value)} className="h-14 text-center px-0 w-full border-none focus-visible:ring-0 rounded-none bg-transparent" /></TableCell>
                <TableCell className="border-r p-0"><Input type="number" value={item.noOfPcs ?? ''} onChange={e => onItemChange(index, 'noOfPcs', e.target.value)} className="h-14 text-center px-0 w-full border-none focus-visible:ring-0 rounded-none bg-transparent" /></TableCell>
                <TableCell className="border-r px-2">
                    <Select value={item.ply ?? '3'} onValueChange={v => onItemChange(index, 'ply', v)}>
                        <SelectTrigger className="h-8 text-center px-1"><SelectValue/></SelectTrigger>
                        <SelectContent>{PLY_OPTIONS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                    </Select>
                </TableCell>
                <TableCell className="border-r px-2">
                    {hasMixedFlutes(item) ? (
                        // A mixed construction can't be expressed by one dropdown -
                        // flattening it here would silently rewrite the other flute.
                        <button
                            type="button"
                            onClick={() => onOpenDesigner(index)}
                            title="Mixed flute construction - open the Box Designer to edit each layer"
                            className="h-8 w-full text-[11px] font-bold rounded border bg-white hover:bg-muted/40"
                        >
                            {fluteSummary(item)}
                        </button>
                    ) : (
                        <Select value={fluteSummary(item) === '-' ? DEFAULT_FLUTE_PROFILE : fluteSummary(item)} onValueChange={v => onFluteChange(index, v)}>
                            <SelectTrigger className="h-8 px-2 text-[10px]"><SelectValue/></SelectTrigger>
                            <SelectContent>
                                {Object.entries(FLUTE_PROFILES).map(([k, p]) => (
                                    <SelectItem key={k} value={k}>{k} &middot; {p.takeUp}x</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    )}
                </TableCell>
                <TableCell className="border-r px-2">
                    <Select value={item.paperType ?? 'KRAFT'} onValueChange={v => onItemChange(index, 'paperType', v)}>
                        <SelectTrigger className="h-8 px-2 text-[10px]"><SelectValue/></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="KRAFT">Kraft (K)</SelectItem>
                            <SelectItem value="VIRGIN">Virgin (V)</SelectItem>
                            <SelectItem value="VIRGIN & KRAFT">Mixed (M)</SelectItem>
                        </SelectContent>
                    </Select>
                </TableCell>
                <TableCell className="border-r px-2">
                    <Select value={normalizeBF(item.paperBf)} onValueChange={v => onItemChange(index, 'paperBf', v)}>
                        <SelectTrigger className="h-8 px-2"><SelectValue/></SelectTrigger>
                        <SelectContent>{BF_OPTIONS.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
                    </Select>
                </TableCell>
                <TableCell className="border-r p-0"><Input type="number" value={item.wastagePercent ?? ''} onChange={e => onItemChange(index, 'wastagePercent', e.target.value)} className="h-14 text-center px-0 w-full border-none focus-visible:ring-0 rounded-none bg-transparent" /></TableCell>
                </>)}
                {collapsedGroups.gsm ? (
                    <TableCell className="border-x px-2 text-[10px] text-center bg-orange-50/20 tabular-nums font-medium">
                        {gsmSummary(item)}
                    </TableCell>
                ) : (<>
                <TableCell className="border-r p-0 bg-orange-50/10"><Input type="number" value={item.topGsm ?? ''} onChange={e => onItemChange(index, 'topGsm', e.target.value)} className="h-14 text-center px-0 w-full border-none focus-visible:ring-0 rounded-none bg-transparent" /></TableCell>
                <TableCell className="border-r p-0 bg-orange-50/10"><Input type="number" value={item.flute1Gsm ?? ''} onChange={e => onItemChange(index, 'flute1Gsm', e.target.value)} className="h-14 text-center px-0 w-full border-none focus-visible:ring-0 rounded-none bg-transparent" /></TableCell>
                {maxPly >= 5 && (
                    <>
                        <TableCell className="border-r p-0 bg-orange-50/10"><Input type="number" value={item.middleGsm ?? ''} onChange={e => onItemChange(index, 'middleGsm', e.target.value)} className={cn("h-14 text-center px-0 w-full border-none focus-visible:ring-0 rounded-none", parseInt(item.ply, 10) < 5 ? "bg-muted/20" : "bg-transparent")} disabled={parseInt(item.ply, 10) < 5} /></TableCell>
                        <TableCell className="border-r p-0 bg-orange-50/10"><Input type="number" value={item.flute2Gsm ?? ''} onChange={e => onItemChange(index, 'flute2Gsm', e.target.value)} className={cn("h-14 text-center px-0 w-full border-none focus-visible:ring-0 rounded-none", parseInt(item.ply, 10) < 5 ? "bg-muted/20" : "bg-transparent")} disabled={parseInt(item.ply, 10) < 5} /></TableCell>
                    </>
                )}
                {maxPly >= 7 && (
                    <>
                        <TableCell className="border-r p-0 bg-orange-50/10"><Input type="number" value={item.liner2Gsm ?? ''} onChange={e => onItemChange(index, 'liner2Gsm', e.target.value)} className={cn("h-14 text-center px-0 w-full border-none focus-visible:ring-0 rounded-none", parseInt(item.ply, 10) < 7 ? "bg-muted/20" : "bg-transparent")} disabled={parseInt(item.ply, 10) < 7} /></TableCell>
                        <TableCell className="border-r p-0 bg-orange-50/10"><Input type="number" value={item.flute3Gsm ?? ''} onChange={e => onItemChange(index, 'flute3Gsm', e.target.value)} className={cn("h-14 text-center px-0 w-full border-none focus-visible:ring-0 rounded-none", parseInt(item.ply, 10) < 7 ? "bg-muted/20" : "bg-transparent")} disabled={parseInt(item.ply, 10) < 7} /></TableCell>
                    </>
                )}
                {maxPly >= 9 && (
                    <>
                        <TableCell className="border-r p-0 bg-orange-50/10"><Input type="number" value={item.liner3Gsm ?? ''} onChange={e => onItemChange(index, 'liner3Gsm', e.target.value)} className={cn("h-14 text-center px-0 w-full border-none focus-visible:ring-0 rounded-none", parseInt(item.ply, 10) < 9 ? "bg-muted/20" : "bg-transparent")} disabled={parseInt(item.ply, 10) < 9} /></TableCell>
                        <TableCell className="border-r p-0 bg-orange-50/10"><Input type="number" value={item.flute4Gsm ?? ''} onChange={e => onItemChange(index, 'flute4Gsm', e.target.value)} className={cn("h-14 text-center px-0 w-full border-none focus-visible:ring-0 rounded-none", parseInt(item.ply, 10) < 9 ? "bg-muted/20" : "bg-transparent")} disabled={parseInt(item.ply, 10) < 9} /></TableCell>
                    </>
                )}
                <TableCell className="border-r p-0 bg-orange-50/10"><Input type="number" value={item.bottomGsm ?? ''} onChange={e => onItemChange(index, 'bottomGsm', e.target.value)} className="h-14 text-center px-0 w-full border-none focus-visible:ring-0 rounded-none bg-transparent" /></TableCell>
                </>)}
                {collapsedGroups.calc ? (
                    <TableCell className={cn("border-x px-2 text-[10px] leading-tight text-center", calc.rateMissing ? "bg-destructive/10 text-destructive" : "bg-primary/5")} title={calc.rateMissing ? "No global rate configured for this paper type/BF - costed at Rs. 0" : undefined}>
                        <div className="text-muted-foreground tabular-nums">{(calc.totalGsm || 0).toFixed(0)} gsm &middot; {(calc.paperWeight || 0).toFixed(0)} g</div>
                        <div className="font-bold tabular-nums">Rs. {(calc.paperCost || 0).toFixed(2)}{calc.rateMissing && ' ⚠'}</div>
                        {(calc.transportCost || 0) > 0 && <div className="text-muted-foreground tabular-nums">+ Rs. {(calc.transportCost || 0).toFixed(2)} tpt</div>}
                    </TableCell>
                ) : (<>
                <TableCell className="text-center font-medium bg-muted/20 border-r">{(calc.totalGsm || 0).toFixed(0)}</TableCell>
                <TableCell className="text-center font-medium bg-muted/20 border-r">{(calc.paperWeight || 0).toFixed(1)}</TableCell>
                <TableCell className={cn("text-center font-bold border-r", calc.rateMissing ? "bg-destructive/10 text-destructive" : "bg-primary/5")} title={calc.rateMissing ? "No global rate configured for this paper type/BF - costed at Rs. 0" : undefined}>
                    Rs. {(calc.paperCost || 0).toFixed(2)}{calc.rateMissing && ' ⚠'}
                </TableCell>
                <TableCell className="text-center font-bold border-r bg-primary/5">Rs. {(calc.transportCost || 0).toFixed(2)}</TableCell>
                </>)}
                <TableCell className="text-right font-bold pr-6 bg-primary/10">Rs. {totalRowCost.toFixed(2)}</TableCell>
                <TableCell className="px-2">
                    <div className="flex items-center gap-0.5">
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-primary" title="Box Designer - layer construction, materials and load capacity" onClick={() => onOpenDesigner(index)}><Boxes className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" title="Duplicate row" onClick={() => onDuplicateItem(index)}><Copy className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" title="Delete row" onClick={() => onRemoveItem(item.id)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                </TableCell>
            </TableRow>
            {(item.accessories || []).map((acc: any, aIdx: number) => {
                const accCalc = acc.calculated || { paperCost: 0, transportCost: 0, totalGsm: 0, paperWeight: 0 };
                return (
                    <TableRow key={acc.id} className="h-12 bg-muted/10 border-b border-dashed">
                        <TableCell></TableCell>
                        <TableCell className="border-r pr-2 pl-6">
                            <Input value={acc.name} onChange={e => onItemChange(index, 'acc_name', { aIdx, v: e.target.value })} className="h-8 text-[10px] w-full bg-white font-semibold" placeholder="Accessory name..." />
                        </TableCell>
                        {collapsedGroups.spec ? (
                            <TableCell className="border-x px-2 text-[10px] leading-tight text-center text-muted-foreground">
                                <div className="tabular-nums">{acc.l || 0}&times;{acc.b || 0}</div>
                                <div className="tabular-nums">{acc.noOfPcs || 0} pcs &middot; {acc.ply || 0} ply &middot; {acc.fluteType || DEFAULT_FLUTE_PROFILE}</div>
                            </TableCell>
                        ) : (<>
                        <TableCell className="border-r p-0"><Input type="number" value={acc.l ?? ''} onChange={e => onItemChange(index, 'acc_l', { aIdx, v: e.target.value })} className="h-12 text-center px-0 w-full border-none bg-transparent" /></TableCell>
                        <TableCell className="border-r p-0"><Input type="number" value={acc.b ?? ''} onChange={e => onItemChange(index, 'acc_b', { aIdx, v: e.target.value })} className="h-12 text-center px-0 w-full border-none bg-transparent" /></TableCell>
                        <TableCell className="border-r p-0 bg-muted/20"><Input readOnly value="0" className="h-12 text-center px-0 w-full border-none bg-transparent" /></TableCell>
                        <TableCell className="border-r p-0"><Input type="number" value={acc.noOfPcs ?? ''} onChange={e => onItemChange(index, 'acc_noOfPcs', { aIdx, v: e.target.value })} className="h-12 text-center px-0 w-full border-none bg-transparent" /></TableCell>
                        <TableCell className="border-r px-2">
                            <Select value={acc.ply ?? '3'} onValueChange={v => onItemChange(index, 'acc_ply', { aIdx, v })}>
                                <SelectTrigger className="h-8 text-center px-1"><SelectValue/></SelectTrigger>
                                <SelectContent>{PLY_OPTIONS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                            </Select>
                        </TableCell>
                        <TableCell className="border-r px-2">
                            <Select value={acc.fluteType || DEFAULT_FLUTE_PROFILE} onValueChange={v => onItemChange(index, 'acc_fluteType', { aIdx, v })}>
                                <SelectTrigger className="h-8 px-2 text-[10px]"><SelectValue/></SelectTrigger>
                                <SelectContent>
                                    {Object.keys(FLUTE_PROFILES).map(k => <SelectItem key={k} value={k}>{k}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </TableCell>
                        <TableCell className="border-r px-2">
                            <Select value={acc.paperType ?? 'KRAFT'} onValueChange={v => onItemChange(index, 'acc_paperType', { aIdx, v })}>
                                <SelectTrigger className="h-8 px-2 text-[10px]"><SelectValue/></SelectTrigger>
                                <SelectContent><SelectItem value="KRAFT">Kraft (K)</SelectItem><SelectItem value="VIRGIN">Virgin (V)</SelectItem></SelectContent>
                            </Select>
                        </TableCell>
                        <TableCell className="border-r px-2">
                            <Select value={normalizeBF(acc.paperBf)} onValueChange={v => onItemChange(index, 'acc_paperBf', { aIdx, v })}>
                                <SelectTrigger className="h-8 px-2"><SelectValue/></SelectTrigger>
                                <SelectContent>{BF_OPTIONS.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
                            </Select>
                        </TableCell>
                        <TableCell className="border-r p-0"><Input type="number" value={acc.wastagePercent ?? ''} onChange={e => onItemChange(index, 'acc_wastagePercent', { aIdx, v: e.target.value })} className="h-12 text-center px-0 w-full border-none bg-transparent" /></TableCell>
                        </>)}
                        {collapsedGroups.gsm ? (
                            <TableCell className="border-x px-2 text-[10px] text-center text-muted-foreground tabular-nums">
                                {gsmSummary(acc)}
                            </TableCell>
                        ) : (<>
                        <TableCell className="border-r p-0 bg-orange-50/10"><Input type="number" value={acc.topGsm ?? ''} onChange={e => onItemChange(index, 'acc_topGsm', { aIdx, v: e.target.value })} className="h-12 text-center px-0 w-full border-none bg-transparent" /></TableCell>
                        <TableCell className="border-r p-0 bg-orange-50/10"><Input type="number" value={acc.flute1Gsm ?? ''} onChange={e => onItemChange(index, 'acc_flute1Gsm', { aIdx, v: e.target.value })} className="h-12 text-center px-0 w-full border-none bg-transparent" /></TableCell>
                        {maxPly >= 5 && (
                            <>
                                <TableCell className="border-r p-0 bg-orange-50/10"><Input type="number" value={acc.middleGsm ?? ''} onChange={e => onItemChange(index, 'acc_middleGsm', { aIdx, v: e.target.value })} className={cn("h-12 text-center px-0 w-full border-none", parseInt(acc.ply, 10) < 5 ? "bg-muted/20" : "bg-transparent")} disabled={parseInt(acc.ply, 10) < 5} /></TableCell>
                                <TableCell className="border-r p-0 bg-orange-50/10"><Input type="number" value={acc.flute2Gsm ?? ''} onChange={e => onItemChange(index, 'acc_flute2Gsm', { aIdx, v: e.target.value })} className={cn("h-12 text-center px-0 w-full border-none", parseInt(acc.ply, 10) < 5 ? "bg-muted/20" : "bg-transparent")} disabled={parseInt(acc.ply, 10) < 5} /></TableCell>
                            </>
                        )}
                        {maxPly >= 7 && (
                            <>
                                <TableCell className="border-r p-0 bg-orange-50/10"><Input type="number" value={acc.liner2Gsm ?? ''} onChange={e => onItemChange(index, 'acc_liner2Gsm', { aIdx, v: e.target.value })} className={cn("h-12 text-center px-0 w-full border-none", parseInt(acc.ply, 10) < 7 ? "bg-muted/20" : "bg-transparent")} disabled={parseInt(acc.ply, 10) < 7} /></TableCell>
                                <TableCell className="border-r p-0 bg-orange-50/10"><Input type="number" value={acc.flute3Gsm ?? ''} onChange={e => onItemChange(index, 'acc_flute3Gsm', { aIdx, v: e.target.value })} className={cn("h-12 text-center px-0 w-full border-none", parseInt(acc.ply, 10) < 7 ? "bg-muted/20" : "bg-transparent")} disabled={parseInt(acc.ply, 10) < 7} /></TableCell>
                            </>
                        )}
                        {maxPly >= 9 && (
                            <>
                                <TableCell className="border-r p-0 bg-orange-50/10"><Input type="number" value={acc.liner3Gsm ?? ''} onChange={e => onItemChange(index, 'acc_liner3Gsm', { aIdx, v: e.target.value })} className={cn("h-12 text-center px-0 w-full border-none", parseInt(acc.ply, 10) < 9 ? "bg-muted/20" : "bg-transparent")} disabled={parseInt(acc.ply, 10) < 9} /></TableCell>
                                <TableCell className="border-r p-0 bg-orange-50/10"><Input type="number" value={acc.flute4Gsm ?? ''} onChange={e => onItemChange(index, 'acc_flute4Gsm', { aIdx, v: e.target.value })} className={cn("h-12 text-center px-0 w-full border-none", parseInt(acc.ply, 10) < 9 ? "bg-muted/20" : "bg-transparent")} disabled={parseInt(acc.ply, 10) < 9} /></TableCell>
                            </>
                        )}
                        <TableCell className="border-r p-0 bg-orange-50/10"><Input type="number" value={acc.bottomGsm ?? ''} onChange={e => onItemChange(index, 'acc_bottomGsm', { aIdx, v: e.target.value })} className="h-12 text-center px-0 w-full border-none bg-transparent" /></TableCell>
                        </>)}
                        {collapsedGroups.calc ? (
                            <TableCell className={cn("border-x px-2 text-[10px] leading-tight text-center", accCalc.rateMissing && "bg-destructive/10 text-destructive")} title={accCalc.rateMissing ? "No global rate configured for this paper type/BF - costed at Rs. 0" : undefined}>
                                <div className="text-muted-foreground tabular-nums">{(accCalc.totalGsm || 0).toFixed(0)} gsm &middot; {(accCalc.paperWeight || 0).toFixed(0)} g</div>
                                <div className="tabular-nums">Rs. {(accCalc.paperCost || 0).toFixed(2)}{accCalc.rateMissing && ' ⚠'}</div>
                            </TableCell>
                        ) : (<>
                        <TableCell className="text-center bg-muted/20 border-r">{(accCalc.totalGsm || 0).toFixed(0)}</TableCell>
                        <TableCell className="text-center bg-muted/20 border-r">{(accCalc.paperWeight || 0).toFixed(1)}</TableCell>
                        <TableCell className={cn("text-center border-r", accCalc.rateMissing && "bg-destructive/10 text-destructive")} title={accCalc.rateMissing ? "No global rate configured for this paper type/BF - costed at Rs. 0" : undefined}>
                            Rs. {(accCalc.paperCost || 0).toFixed(2)}{accCalc.rateMissing && ' ⚠'}
                        </TableCell>
                        <TableCell className="text-center border-r"></TableCell>
                        </>)}
                        <TableCell className="text-right pr-6"></TableCell>
                        <TableCell className="px-2">
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive/70" onClick={() => onItemChange(index, 'acc_remove', aIdx)}><X className="h-3.5 w-3.5" /></Button>
                        </TableCell>
                    </TableRow>
                );
            })}
        </React.Fragment>
    );
});
CostingTableRow.displayName = 'CostingTableRow';

/**
 * Mobile counterpart to CostingTableRow - the same 15+ column Excel-style
 * row doesn't fit a phone screen, so this stacks the same fields into one
 * card with the GSM composition tucked behind a "Show" toggle (the part
 * that only needs touching once per product, not every time). Shares the
 * exact same onItemChange/onAddAccessory handlers as the desktop table so
 * there's one calculation path, not two.
 */
const CostingItemCard = React.memo(({
    item,
    index,
    maxPly,
    products,
    onItemChange,
    onAddAccessory,
    onRemoveItem,
    onDuplicateItem,
    onOpenDesigner,
    onFluteChange,
    collapsedGroups,
    onOpenQuickAddProduct
}: any) => {
    const [isProductPopoverOpen, setIsProductPopoverOpen] = useState(false);
    const [quickProductSearch, setQuickProductSearch] = useState('');
    const [isGsmOpen, setIsGsmOpen] = useState(false);

    const calc = item.calculated || { paperCost: 0, transportCost: 0, totalGsm: 0, paperWeight: 0 };
    const totalRowCost = (calc.paperCost || 0) +
        (calc.transportCost || 0) +
        (item.accessories || []).reduce((sum: number, acc: any) => sum + (acc.calculated?.paperCost || 0), 0);
    const isIncomplete = (parseFloat(item.l) || 0) <= 0 || (parseFloat(item.b) || 0) <= 0;

    const gsmFieldDefs = [
        { key: 'topGsm', label: 'Top' },
        { key: 'flute1Gsm', label: 'F1' },
        ...(maxPly >= 5 ? [{ key: 'middleGsm', label: 'Mid1' }, { key: 'flute2Gsm', label: 'F2' }] : []),
        ...(maxPly >= 7 ? [{ key: 'liner2Gsm', label: 'Mid2' }, { key: 'flute3Gsm', label: 'F3' }] : []),
        ...(maxPly >= 9 ? [{ key: 'liner3Gsm', label: 'Mid3' }, { key: 'flute4Gsm', label: 'F4' }] : []),
        { key: 'bottomGsm', label: 'Bot' },
    ];

    return (
        <Card className={cn("border shadow-sm", isIncomplete && "border-amber-300 bg-amber-50/40")}>
            <CardContent className="p-3 space-y-3">
                <div className="flex items-start justify-between gap-2">
                    <Popover open={isProductPopoverOpen} onOpenChange={setIsProductPopoverOpen}>
                        <PopoverTrigger asChild>
                            <Button variant="outline" role="combobox" className="h-9 text-xs flex-1 justify-between font-normal bg-white min-w-0">
                                <span className="truncate">{item.productId ? products.find((p: Product) => p.id === item.productId)?.name : "Select product..."}</span>
                                <ChevronDown className="h-3.5 w-3.5 opacity-50 shrink-0" />
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="p-0 w-[300px]">
                            <Command>
                                <CommandInput placeholder="Search catalog..." value={quickProductSearch} onValueChange={setQuickProductSearch} />
                                <CommandList>
                                    <CommandEmpty>
                                        <Button
                                            variant="ghost"
                                            className="w-full justify-start text-[11px] text-primary font-bold"
                                            onClick={() => {
                                                onOpenQuickAddProduct(index, quickProductSearch);
                                                setIsProductPopoverOpen(false);
                                            }}
                                        >
                                            <PlusCircle className="mr-2 h-3.5 w-3.5" /> Add "{quickProductSearch}" to catalog
                                        </Button>
                                    </CommandEmpty>
                                    <CommandGroup>
                                        {products.map((p: Product) => (
                                            <CommandItem
                                                key={p.id}
                                                value={p.name}
                                                onSelect={() => {
                                                    onItemChange(index, 'productId', p.id);
                                                    setIsProductPopoverOpen(false);
                                                }}
                                                className="text-[11px]"
                                            >
                                                <Check className={cn("mr-2 h-3.5 w-3.5", item.productId === p.id ? "opacity-100" : "opacity-0")} />
                                                {p.name}
                                            </CommandItem>
                                        ))}
                                    </CommandGroup>
                                </CommandList>
                            </Command>
                        </PopoverContent>
                    </Popover>
                    <div className="flex gap-0.5 shrink-0">
                        <Button variant="ghost" size="icon" className="h-9 w-9 text-primary" title="Box Designer" onClick={() => onOpenDesigner(index)}><Boxes className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" className="h-9 w-9" title="Duplicate" onClick={() => onDuplicateItem(index)}><Copy className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" className="h-9 w-9 text-destructive" title="Delete" onClick={() => onRemoveItem(item.id)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                </div>

                {isIncomplete && (
                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-amber-700"><AlertTriangle className="h-3 w-3" /> Missing Length/Width - this row costs Rs. 0 until filled in</div>
                )}

                <div className="grid grid-cols-4 gap-2">
                    <div><Label className="text-[9px]">L (mm)</Label><Input type="number" value={item.l ?? ''} onChange={e => onItemChange(index, 'l', e.target.value)} className="h-9 text-xs" /></div>
                    <div><Label className="text-[9px]">B (mm)</Label><Input type="number" value={item.b ?? ''} onChange={e => onItemChange(index, 'b', e.target.value)} className="h-9 text-xs" /></div>
                    <div><Label className="text-[9px]">H (mm)</Label><Input type="number" value={item.h ?? ''} onChange={e => onItemChange(index, 'h', e.target.value)} className="h-9 text-xs" /></div>
                    <div><Label className="text-[9px]">Pcs</Label><Input type="number" value={item.noOfPcs ?? ''} onChange={e => onItemChange(index, 'noOfPcs', e.target.value)} className="h-9 text-xs" /></div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                    <div>
                        <Label className="text-[9px]">Ply</Label>
                        <Select value={item.ply ?? '3'} onValueChange={v => onItemChange(index, 'ply', v)}>
                            <SelectTrigger className="h-9 text-xs"><SelectValue/></SelectTrigger>
                            <SelectContent>{PLY_OPTIONS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                        </Select>
                    </div>
                    <div>
                        <Label className="text-[9px]">Flute</Label>
                        {hasMixedFlutes(item) ? (
                            <button type="button" onClick={() => onOpenDesigner(index)}
                                title="Mixed flute construction - edit per layer in the Box Designer"
                                className="h-9 w-full text-xs font-bold rounded border bg-white">
                                {fluteSummary(item)}
                            </button>
                        ) : (
                            <Select value={fluteSummary(item) === '-' ? DEFAULT_FLUTE_PROFILE : fluteSummary(item)} onValueChange={v => onFluteChange(index, v)}>
                                <SelectTrigger className="h-9 text-xs"><SelectValue/></SelectTrigger>
                                <SelectContent>
                                    {Object.entries(FLUTE_PROFILES).map(([k, pr]) => (
                                        <SelectItem key={k} value={k}>{k} &middot; {pr.takeUp}x</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        )}
                    </div>
                    <div>
                        <Label className="text-[9px]">Paper Type</Label>
                        <Select value={item.paperType ?? 'KRAFT'} onValueChange={v => onItemChange(index, 'paperType', v)}>
                            <SelectTrigger className="h-9 text-xs"><SelectValue/></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="KRAFT">Kraft (K)</SelectItem>
                                <SelectItem value="VIRGIN">Virgin (V)</SelectItem>
                                <SelectItem value="VIRGIN & KRAFT">Mixed (M)</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                    <div>
                        <Label className="text-[9px]">Paper BF</Label>
                        <Select value={normalizeBF(item.paperBf)} onValueChange={v => onItemChange(index, 'paperBf', v)}>
                            <SelectTrigger className="h-9 text-xs"><SelectValue/></SelectTrigger>
                            <SelectContent>{BF_OPTIONS.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
                        </Select>
                    </div>
                    <div><Label className="text-[9px]">Waste %</Label><Input type="number" value={item.wastagePercent ?? ''} onChange={e => onItemChange(index, 'wastagePercent', e.target.value)} className="h-9 text-xs" /></div>
                </div>

                <Collapsible open={isGsmOpen} onOpenChange={setIsGsmOpen}>
                    <CollapsibleTrigger asChild>
                        <Button variant="outline" size="sm" className="w-full h-8 text-[10px] font-bold uppercase tracking-wide justify-between">
                            <span className="flex items-center gap-1.5"><Layers className="h-3 w-3" /> GSM Composition</span>
                            {isGsmOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                        </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="pt-2">
                        <div className="grid grid-cols-3 gap-2 p-2 bg-orange-50/30 rounded border">
                            {gsmFieldDefs.map(({ key, label }) => (
                                <div key={key}><Label className="text-[9px]">{label}</Label><Input type="number" value={(item as any)[key] ?? ''} onChange={e => onItemChange(index, key, e.target.value)} className="h-8 text-xs" /></div>
                            ))}
                        </div>
                    </CollapsibleContent>
                </Collapsible>

                {(item.accessories || []).length > 0 && (
                    <div className="space-y-1.5 pt-1">
                        <Label className="text-[9px] text-muted-foreground uppercase">Accessories</Label>
                        {item.accessories.map((acc: any, aIdx: number) => (
                            <div key={acc.id} className="flex items-center gap-2 bg-muted/20 rounded px-2 py-1.5">
                                <Input value={acc.name} onChange={e => onItemChange(index, 'acc_name', { aIdx, v: e.target.value })} className="h-7 text-[10px] flex-1 bg-white" placeholder="Accessory name..." />
                                <span className="text-[10px] font-bold shrink-0">Rs. {(acc.calculated?.paperCost || 0).toFixed(0)}</span>
                                <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive/70 shrink-0" onClick={() => onItemChange(index, 'acc_remove', aIdx)}><X className="h-3 w-3" /></Button>
                            </div>
                        ))}
                    </div>
                )}
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="w-full h-7 text-[10px] font-bold text-muted-foreground"><Plus className="mr-1 h-3 w-3" /> Add Accessory</Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                        <DropdownMenuItem onSelect={() => onAddAccessory(index, 'Honeycomb Partition')}>Honeycomb Partition</DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => onAddAccessory(index, 'Layer Plate')}>Layer Plate</DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => onAddAccessory(index, 'Corner Protectors')}>Corner Protectors</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onSelect={() => onAddAccessory(index, 'Manual Entry')}>Manual Entry</DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>

                <div className="grid grid-cols-2 gap-2 pt-2 border-t text-[10px] text-muted-foreground">
                    <span>T.GSM: <span className="font-bold text-foreground">{(calc.totalGsm || 0).toFixed(0)}</span></span>
                    <span className="text-right">Weight: <span className="font-bold text-foreground">{(calc.paperWeight || 0).toFixed(1)}g</span></span>
                </div>
                <div className="flex items-center justify-between pt-1">
                    <span className="text-[10px] font-bold uppercase text-muted-foreground">Row Total</span>
                    <span className="text-base font-black text-primary">Rs. {totalRowCost.toFixed(2)}</span>
                </div>
            </CardContent>
        </Card>
    );
});
CostingItemCard.displayName = 'CostingItemCard';

export function CostReportCalculator({ reportToEdit, initialPartyId, onSaveSuccess, products, onPreview }: any) {
  const [parties, setParties] = useState<Party[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [costReports, setCostReports] = useState<CostReport[]>([]);
  const [selectedPartyId, setSelectedPartyId] = useState('');
  const [selectedDealId, setSelectedDealId] = useState('');
  const [reportNumber, setReportNumber] = useState('');
  const [reportDate, setReportDate] = useState<Date>(new Date());
  const [validUntilBS, setValidUntilBS] = useState('');
  const [remarks, setRemarks] = useState('');
  const [status, setStatus] = useState<QuotationStatus>('Draft');
  
  const [kraftPaperCosts, setKraftPaperCosts] = useState<Record<string, number>>({});
  const [virginPaperCost, setVirginCost] = useState<number | ''>('');
  const [conversionCost, setConversionCost] = useState<number | ''>('');
  const [accessoryConversionCost, setAccessoryConversionCost] = useState<number | ''>('');
  const [transportCost, setTransportCost] = useState<number | ''>('');
  const [transportCostType, setTransportCostType] = useState<'Per Piece' | 'Per Consignment'>('Per Consignment');
  
  const [termsAndConditions, setTermsAndConditions] = useState<CostReportTerm[]>([]);
  const [items, setItems] = useState<CostReportItem[]>([]);
  const [selectedForPrint, setSelectedForPrint] = useState(new Set<string>());
  
  const [isSaving, setIsSaving] = useState(false);
  // Collapsed by default when opening an existing report (its setup is
  // already filled in) - expanded by default for a brand new one, so the
  // required fields are visible on mobile without a wall of scrolling.
  const [isSetupOpen, setIsSetupOpen] = useState(!reportToEdit);
  // Which row the Box Designer is open on, or null when it's closed.
  const [designerIndex, setDesignerIndex] = useState<number | null>(null);
  // Collapsed column groups. All three start open on a fresh session; the
  // choice is remembered per browser because it's a working preference, not
  // quotation data - someone on a laptop keeps Costing collapsed all day.
  // Read in an effect rather than a useState initialiser: this component is
  // server-rendered first, and seeding state from localStorage during render
  // makes the server and client markup disagree on hydration.
  const [collapsedGroups, setCollapsedGroups] = useState({ spec: false, gsm: false, calc: false });

  // Which Quotation Setup sub-sections are open. Only Report Identity starts
  // open - it's the one a new quotation always needs - and the rest show a
  // summary line until opened. Remembered per browser like the column groups.
  const [openSetupSections, setOpenSetupSections] = useState<Record<string, boolean>>({ identity: true });

  const toggleSetupSection = useCallback((key: string) => {
    setOpenSetupSections(prev => {
      const next = { ...prev, [key]: !prev[key] };
      try { localStorage.setItem('costing-setup-sections', JSON.stringify(next)); } catch { /* not worth failing an edit over */ }
      return next;
    });
  }, []);

  // Take-up factors are a mill parameter, changed once in a long while and
  // wrong-by-accident is expensive, so the inputs start locked every time.
  // Deliberately not persisted: unlocking is meant to be a per-sitting act.
  const [takeUpLocked, setTakeUpLocked] = useState(true);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('costing-collapsed-groups');
      if (saved) setCollapsedGroups(prev => ({ ...prev, ...JSON.parse(saved) }));
      const savedSections = localStorage.getItem('costing-setup-sections');
      if (savedSections) setOpenSetupSections(prev => ({ ...prev, ...JSON.parse(savedSections) }));
    } catch { /* private mode, or a corrupt value - the defaults are fine */ }
  }, []);

  const toggleGroup = useCallback((key: 'spec' | 'gsm' | 'calc') => {
    setCollapsedGroups(prev => {
      const next = { ...prev, [key]: !prev[key] };
      try { localStorage.setItem('costing-collapsed-groups', JSON.stringify(next)); } catch { /* not worth failing an edit over */ }
      return next;
    });
  }, []);
  // NPR/kg for papers outside the kraft/virgin pair (Duplex, White Top, ...).
  // Kraft is rated by BF and virgin has a single rate; anything else had no
  // home until layers could each carry their own material.
  const [otherPaperCosts, setOtherPaperCosts] = useState<Record<string, number>>({});
  // Flute take-up factors for this quotation. Mills quote different figures
  // (B+B 1.35, A+A 1.55 is one mill's table) and revise them, so they are
  // editable here and stored on the report - a saved quotation keeps the
  // factors it was costed with rather than silently repricing later.
  const [fluteTakeUps, setFluteTakeUps] = useState<Record<string, number>>({});
  const [isPartyDialogOpen, setIsPartyDialogOpen] = useState(false);
  const [partyForm, setPartyForm] = useState({ name: '', type: 'Customer' as PartyType, address: '', panNumber: '', ownership: 'Shivam' as AccountOwnership });
  const [isPartyPopoverOpen, setIsPartyPopoverOpen] = useState(false);
  const [partySearch, setPartySearch] = useState('');
  
  const [isProductDialogOpen, setIsProductDialogOpen] = useState(false);
  const [quickProductSearch, setQuickProductSearch] = useState('');
  const [activeRowIndexForProduct, setActiveRowIndexForProduct] = useState<number | null>(null);
  const [isBatchAddDialogOpen, setIsBatchAddDialogOpen] = useState(false);
  const [isManageTermsDialogOpen, setIsManageTermsDialogOpen] = useState(false);
  const [selectedBatchProductIds, setSelectedBatchProductIds] = useState<Set<string>>(new Set());
  
  const [costSettings, setCostSettings] = useState<CostSetting | null>(null);
  const { toast } = useToast();
  const { user } = useAuth();

  const calculateItemCost = useCallback((item: any, globalK: any, globalV: number, globalC: number, globalT: number, tType: string, isAcc = false): CalculatedValues => {
    return sharedCalculateItemCost(item, globalK, globalV, globalC, globalT, tType, isAcc, Number(accessoryConversionCost) || 0, otherPaperCosts, fluteTakeUps);
  }, [accessoryConversionCost, otherPaperCosts, fluteTakeUps]);

  useEffect(() => {
    if (items.length === 0) return;

    setItems(prevItems => {
        const kCosts = kraftPaperCosts;
        const vCost = Number(virginPaperCost) || 0;
        const cCost = Number(conversionCost) || 0;
        const tCost = Number(transportCost) || 0;
        const tType = transportCostType;

        return prevItems.map(item => {
            const newCalculated = calculateItemCost(item, kCosts, vCost, cCost, tCost, tType);
            return {
                ...item,
                calculated: newCalculated,
                accessories: (item.accessories || []).map((acc: any) => ({
                    ...acc,
                    calculated: calculateItemCost(acc, kCosts, vCost, cCost, tCost, tType, true)
                }))
            };
        });
    });
  }, [kraftPaperCosts, virginPaperCost, conversionCost, transportCost, transportCostType, calculateItemCost]);

  // Rates in the shape the box engine wants. The Designer reads this to
  // price each layer independently instead of the whole board at one rate.
  const rateContext = useMemo<RateContext>(() => ({
    kraftByBf: kraftPaperCosts,
    virgin: Number(virginPaperCost) || 0,
    other: otherPaperCosts,
    fluteTakeUps,
    conversion: Number(conversionCost) || 0,
    accessoryConversion: Number(accessoryConversionCost) || 0,
    transport: Number(transportCost) || 0,
    transportType: transportCostType,
    isAccessory: false,
  }), [kraftPaperCosts, virginPaperCost, otherPaperCosts, fluteTakeUps, conversionCost, accessoryConversionCost, transportCost, transportCostType]);

  useEffect(() => {
    const unsubCostSettings = onSettingUpdate('costing', (s) => {
        if (s?.value) {
            setCostSettings(s.value);
            setKraftPaperCosts(s.value.kraftPaperCosts || {});
            setVirginCost(s.value.virginPaperCost || '');
            setConversionCost(s.value.conversionCost || '');
            setAccessoryConversionCost(s.value.accessoryConversionCost || '');
            setOtherPaperCosts(s.value.otherPaperCosts || {});
            setFluteTakeUps(s.value.fluteTakeUps || {});
            setTermsAndConditions(prev => prev.length === 0 ? (s.value.termsAndConditions || []) : prev);
        }
    });
    const unsubParties = onPartiesUpdate(setParties);
    const unsubDeals = onDealsUpdate(setDeals);
    const unsubReports = onCostReportsUpdate(setCostReports);
    return () => { unsubCostSettings(); unsubParties(); unsubDeals(); unsubReports(); };
  }, []);

  const handleSaveMasterTerms = async (newTerms: CostReportTerm[]) => {
      if (!user) return;
      try {
          await updateCostSettings({ termsAndConditions: newTerms }, user.username);
          setTermsAndConditions(newTerms);
          toast({ title: 'Terms Updated', description: 'Master list has been updated.' });
      } catch {
          toast({ title: 'Error', description: 'Failed to update master terms.', variant: 'destructive' });
      }
  };

  useEffect(() => {
      if (!reportToEdit) {
          generateNextCostReportNumber(costReports).then(setReportNumber);
          if (initialPartyId) setSelectedPartyId(initialPartyId);
      } else {
          setReportNumber(reportToEdit.reportNumber);
          setReportDate(new Date(reportToEdit.reportDate));
          setSelectedPartyId(reportToEdit.partyId);
          setSelectedDealId(reportToEdit.dealId || '');
          setValidUntilBS(reportToEdit.validUntilBS || '');
          setRemarks(reportToEdit.remarks || '');
          setStatus(reportToEdit.status || 'Draft');
          setTermsAndConditions(reportToEdit.termsAndConditions || []);
          setOtherPaperCosts(reportToEdit.otherPaperCosts || {});
          setFluteTakeUps(reportToEdit.fluteTakeUps || {});
          const kCosts = reportToEdit.kraftPaperCosts || {};
          const vCost = Number(reportToEdit.virginPaperCost) || 0;
          const cCost = Number(reportToEdit.conversionCost) || 0;
          const tCost = Number(reportToEdit.transportCost) || 0;
          const tType = reportToEdit.transportCostType || 'Per Consignment';

          setItems(reportToEdit.items.map((item: any) => ({
              ...item,
              calculated: calculateItemCost(item, kCosts, vCost, cCost, tCost, tType),
              accessories: (item.accessories || []).map((acc: any) => ({
                  ...acc,
                  calculated: calculateItemCost(acc, kCosts, vCost, cCost, tCost, tType, true)
              }))
          })));
      }
  }, [reportToEdit, costReports, calculateItemCost, initialPartyId]);

  const mapProductToItem = useCallback((product: Product): CostReportItem => {
    const spec = product.specification || {};
    const [dimL, dimB, dimH] = (spec.dimension || '').split('x');
    const base: any = {
        id: generateId(),
        productId: product.id,
        l: dimL || '',
        b: dimB || '',
        h: dimH || '',
        noOfPcs: '1',
        ply: spec.ply || '3',
        fluteType: 'B',
        paperType: spec.paperType || 'KRAFT',
        paperBf: spec.paperBf || '18 BF',
        paperShade: spec.paperShade || 'NS',
        boxType: spec.boxType || 'RSC',
        topGsm: spec.topGsm || '120',
        flute1Gsm: spec.flute1Gsm || '100',
        middleGsm: spec.middleGsm || '',
        flute2Gsm: spec.flute2Gsm || '',
        liner2Gsm: spec.liner2Gsm || '',
        flute3Gsm: spec.flute3Gsm || '',
        liner3Gsm: spec.liner3Gsm || '',
        flute4Gsm: spec.flute4Gsm || '',
        bottomGsm: spec.bottomGsm || '120',
        liner4Gsm: spec.liner4Gsm || '',
        wastagePercent: spec.wastagePercent || '3.5',
        ...(product.layers?.length ? { layers: product.layers } : {}),
        accessories: (product.accessories || []).map(acc => ({
            ...acc,
            calculated: calculateItemCost(acc, kraftPaperCosts, Number(virginPaperCost) || 0, Number(accessoryConversionCost) || 0, Number(transportCost) || 0, transportCostType, true)
        }))
    };
    return { ...base, calculated: calculateItemCost(base, kraftPaperCosts, Number(virginPaperCost) || 0, Number(conversionCost) || 0, Number(transportCost) || 0, transportCostType) };
  }, [calculateItemCost, kraftPaperCosts, virginPaperCost, conversionCost, accessoryConversionCost, transportCost, transportCostType]);

  const handleAddItem = () => {
    const base: any = { id: generateId(), productId: '', l:'', b:'', h:'', noOfPcs:'1', ply:'3', fluteType: 'B', paperType: 'KRAFT', paperBf:'18 BF', paperShade: 'NS', boxType: 'RSC', topGsm:'120', flute1Gsm:'100', middleGsm:'', flute2Gsm:'', bottomGsm:'120', liner2Gsm:'', flute3Gsm:'', liner3Gsm:'', flute4Gsm:'', liner4Gsm:'', wastagePercent:'3.5', accessories: [] };
    const newItem = { ...base, calculated: calculateItemCost(base, kraftPaperCosts, Number(virginPaperCost) || 0, Number(conversionCost) || 0, Number(transportCost) || 0, transportCostType) };
    setItems([...items, newItem]);
    setSelectedForPrint(new Set(selectedForPrint).add(newItem.id));
  };

  // Clones a row (dimensions, paper spec, accessories) with a fresh id -
  // the fast path for a quotation with several similar box sizes instead
  // of re-entering every GSM/ply field from scratch.
  const handleDuplicateItem = useCallback((idx: number) => {
    setItems(prev => {
        const source = prev[idx];
        if (!source) return prev;
        const clone = {
            ...source,
            id: generateId(),
            accessories: (source.accessories || []).map((acc: any) => ({ ...acc, id: generateId() }))
        };
        const next = [...prev];
        next.splice(idx + 1, 0, clone);
        return next;
    });
  }, []);

  const handleAddAccessory = useCallback((idx: number, typeName: string = 'Internal Pad') => {
    const parent = items[idx];
    const newAcc: Accessory = {
        id: generateId(),
        name: typeName === 'Manual Entry' ? '' : typeName,
        l: parent.l,
        b: parent.b,
        h: '0',
        noOfPcs: '1',
        ply: '3',
        fluteType: 'B',
        paperType: 'KRAFT',
        paperBf: '18 BF',
        paperShade: 'NS',
        boxType: typeName === 'Corner Protectors' ? 'CORNER' : 'PAD',
        topGsm: '120',
        flute1Gsm: '100',
        middleGsm: '',
        flute2Gsm: '',
        bottomGsm: '120',
        liner2Gsm: '',
        flute3Gsm: '',
        liner3Gsm: '',
        flute4Gsm: '',
        liner4Gsm: '',
        wastagePercent: '2.5',
        calculated: { sheetSizeL: 0, sheetSizeB: 0, sheetArea: 0, totalGsm: 0, paperWeight: 0, totalBoxWeight: 0, paperRate: 0, paperCost: 0, transportCost: 0 }
    };
    newAcc.calculated = calculateItemCost(newAcc, kraftPaperCosts, Number(virginPaperCost) || 0, Number(conversionCost) || 0, Number(transportCost) || 0, transportCostType, true);
    const next = [...items];
    next[idx] = { ...next[idx], accessories: [...(next[idx].accessories || []), newAcc] };
    setItems(next);
  }, [items, calculateItemCost, kraftPaperCosts, virginPaperCost, conversionCost, transportCost, transportCostType]);

  const handleBatchLoad = () => {
    const selectedProducts = products.filter((p: Product) => selectedBatchProductIds.has(p.id));
    const newItems = selectedProducts.map((p: Product) => mapProductToItem(p));
    setItems([...items, ...newItems]);
    const newSelectedForPrint = new Set(selectedForPrint);
    newItems.forEach((i: CostReportItem) => newSelectedForPrint.add(i.id));
    setSelectedForPrint(newSelectedForPrint);
    setIsBatchAddDialogOpen(false);
    setSelectedBatchProductIds(new Set());
  };

  const handleItemChange = useCallback((idx: number, f: string, v: any) => {
    setItems(prev => {
        const next = [...prev];
        let item = { ...next[idx] };
        
        if (f.startsWith('acc_')) {
            const accIdx = v.aIdx;
            const subField = f.replace('acc_', '');
            if (subField === 'remove') {
                item.accessories = item.accessories?.filter((_: any, i: number) => i !== v);
            } else {
                const acc = { ...item.accessories![accIdx], [subField]: v.v };
                acc.calculated = calculateItemCost(acc, kraftPaperCosts, Number(virginPaperCost) || 0, Number(conversionCost) || 0, Number(transportCost) || 0, transportCostType, true);
                item.accessories![accIdx] = acc;
            }
        } else {
            item = { ...item, [f]: f === 'paperBf' ? normalizeBF(v) : v };
            if (f === 'productId') {
                const product = products.find((p: Product) => p.id === v);
                if (product) item = mapProductToItem(product);
            }
            item.calculated = calculateItemCost(item, kraftPaperCosts, Number(virginPaperCost) || 0, Number(conversionCost) || 0, Number(transportCost) || 0, transportCostType);
        }
        
        next[idx] = item;
        return next;
    });
  }, [products, calculateItemCost, kraftPaperCosts, virginPaperCost, conversionCost, transportCost, transportCostType, mapProductToItem]);

  /**
   * Apply several fields to one row at once and recost it. The Box Designer
   * edits a whole layer stack in a single interaction (a layer change also
   * rewrites the legacy flat GSM fields and the ply), which the
   * one-field-at-a-time handleItemChange can't express without a burst of
   * intermediate renders each recalculating the row.
   */
  const handleItemPatch = useCallback((idx: number, patch: Record<string, any>) => {
    setItems(prev => {
        const next = [...prev];
        if (!next[idx]) return prev;
        const item: any = { ...next[idx], ...patch };
        item.calculated = calculateItemCost(item, kraftPaperCosts, Number(virginPaperCost) || 0, Number(conversionCost) || 0, Number(transportCost) || 0, transportCostType);
        next[idx] = item;
        return next;
    });
  }, [calculateItemCost, kraftPaperCosts, virginPaperCost, conversionCost, transportCost, transportCostType]);

  /**
   * Set the flute profile for a row from the table.
   *
   * Writing item.fluteType alone isn't enough once a row has an explicit
   * layer stack - deriveLayers returns that stack, so the legacy field would
   * be ignored. Every flute layer is updated to match, which is exactly what
   * a single-value dropdown means. Rows with mixed flutes don't reach here;
   * the table sends those to the Box Designer instead of flattening them.
   */
  const handleFluteChange = useCallback((idx: number, profile: string) => {
    setItems(prev => {
        const item: any = prev[idx];
        if (!item) return prev;
        const patch: Record<string, any> = { fluteType: profile };
        if (item.layers?.length) {
            const nextLayers = item.layers.map((l: any) =>
                l.kind === 'flute' ? { ...l, fluteProfile: profile } : l);
            Object.assign(patch, { layers: nextLayers, ...projectLayersToLegacy(nextLayers) });
            // projectLayersToLegacy also rewrites ply/paperType from the stack;
            // fluteType is the field we actually mean to change here.
            patch.fluteType = profile;
        }
        const next = [...prev];
        next[idx] = { ...item, ...patch };
        next[idx].calculated = calculateItemCost(next[idx], kraftPaperCosts, Number(virginPaperCost) || 0, Number(conversionCost) || 0, Number(transportCost) || 0, transportCostType);
        return next;
    });
  }, [calculateItemCost, kraftPaperCosts, virginPaperCost, conversionCost, transportCost, transportCostType]);

  const handleSubmitParty = async () => {
    if (!user) return;
    if (!partyForm.name) {
        toast({ title: 'Error', description: 'Party name is required.', variant: 'destructive' });
        return;
    }
    try {
        const newPartyId = await addParty({ ...partyForm, createdBy: user.username });
        setSelectedPartyId(newPartyId);
        toast({ title: 'Success', description: 'New party added.' });
        setIsPartyDialogOpen(false);
        setPartyForm({ name: '', type: 'Customer', address: '', panNumber: '', ownership: 'Shivam' });
    } catch {
        toast({ title: 'Error', description: 'Failed to add party.', variant: 'destructive' });
    }
  };

  const handleSaveReport = async () => {
    if (!user || !selectedPartyId || items.length === 0) {
        toast({ title: 'Error', description: 'Party and at least one item are required.', variant: 'destructive' });
        return;
    }
    const incompleteCount = items.filter(i => (parseFloat(i.l) || 0) <= 0 || (parseFloat(i.b) || 0) <= 0).length;
    if (incompleteCount > 0) {
        toast({
            title: 'Heads up',
            description: `${incompleteCount} row(s) are missing Length/Width and will save at Rs. 0 - they're highlighted in the table.`,
        });
    }
    setIsSaving(true);
    try {
        const party = parties.find(p => p.id === selectedPartyId);
        // An edit keeps its number; a new quotation claims one atomically here.
        // The number on screen is only a preview computed from the local list,
        // so two people saving at once would otherwise both get it.
        const finalReportNumber = reportToEdit
            ? reportNumber
            : await reserveCostReportNumber(costReports);

        const reportData: Omit<CostReport, 'id' | 'createdAt'> = {
            reportNumber: finalReportNumber,
            reportDate: reportDate.toISOString(),
            partyId: selectedPartyId,
            partyName: party?.name || 'N/A',
            kraftPaperCosts,
            virginPaperCost: Number(virginPaperCost) || 0,
            conversionCost: Number(conversionCost) || 0,
            accessoryConversionCost: Number(accessoryConversionCost) || 0,
            otherPaperCosts,
            fluteTakeUps,
            transportCost: Number(transportCost) || 0,
            transportCostType,
            termsAndConditions,
            items: items.map(({ calculated, ...rest }) => rest),
            totalCost: items.reduce((sum, i) => sum + i.calculated.paperCost + i.calculated.transportCost + (i.accessories?.reduce((aSum, a) => aSum + a.calculated.paperCost, 0) || 0), 0) + (transportCostType === 'Per Consignment' ? (Number(transportCost) || 0) : 0),
            createdBy: reportToEdit?.createdBy || user.username,
            ownership: party?.ownership || 'Shivam',
            status,
            dealId: (selectedDealId && selectedDealId !== 'none' ? selectedDealId : undefined) as string | undefined,
            validUntilBS,
            remarks
        };
        
        if (reportToEdit) {
            await updateCostReport(reportToEdit.id, reportData);
        } else {
            await addCostReport(reportData);
        }

        // Persist global rates to settings
        await updateCostSettings({
            kraftPaperCosts,
            virginPaperCost: Number(virginPaperCost) || 0,
            conversionCost: Number(conversionCost) || 0,
            accessoryConversionCost: Number(accessoryConversionCost) || 0,
            otherPaperCosts,
            fluteTakeUps,
        }, user.username);

        const updatePromises: any[] = [];
        let skippedRateSync = 0;
        let createdProducts = 0;
        // Rows that had no catalog entry get one created here; their new ids
        // are written back into state afterwards so a second save updates
        // that product instead of creating a duplicate of it.
        const newProductIds: Record<string, string> = {};

        /**
         * Everything about a costed row that belongs in the catalog's
         * specification. Deliberately wider than the GSM fields alone: the
         * PackSpec data sheet prints box type, shade, board grammage, unit
         * weight and rated load, and those were previously never written, so
         * a quotation could refine a spec and the catalog would keep showing
         * the stale one.
         */
        const specFromItem = (item: any, base: Partial<ProductSpecification> = {}): Partial<ProductSpecification> => {
            const pcsParsed = parseInt(item.noOfPcs, 10);
            const pcs = isNaN(pcsParsed) || pcsParsed <= 0 ? 1 : pcsParsed;
            // calculated.totalBoxWeight is the gross weight for the whole run,
            // so it has to come back down to one box for the catalog.
            const perBoxWeight = (item.calculated?.totalBoxWeight || 0) / pcs;
            return {
                ...base,
                dimension: `${item.l}x${item.b}x${item.h}`,
                ply: item.ply,
                paperType: item.paperType,
                paperBf: item.paperBf,
                paperShade: item.paperShade || base.paperShade || '',
                boxType: item.boxType || base.boxType || '',
                topGsm: item.topGsm,
                flute1Gsm: item.flute1Gsm,
                middleGsm: item.middleGsm,
                flute2Gsm: item.flute2Gsm,
                liner2Gsm: item.liner2Gsm,
                flute3Gsm: item.flute3Gsm,
                liner3Gsm: item.liner3Gsm,
                flute4Gsm: item.flute4Gsm,
                bottomGsm: item.bottomGsm,
                wastagePercent: item.wastagePercent,
                gsm: item.calculated?.totalGsm ? String(Math.round(item.calculated.totalGsm)) : (base.gsm || ''),
                weightOfBox: perBoxWeight > 0 ? perBoxWeight.toFixed(1) : (base.weightOfBox || ''),
                load: item.requiredLoadKg || base.load || '',
            };
        };

        items.forEach(item => {
            // A row that was never linked to a catalog product used to be
            // dropped here entirely, so a quotation built from scratch left
            // PackSpec empty. Create the product instead - but only once the
            // row has real dimensions, so blank rows don't litter the catalog.
            if (!item.productId) {
                const hasDimensions = (parseFloat(item.l) || 0) > 0 && (parseFloat(item.b) || 0) > 0;
                if (!hasDimensions) return;

                const derivedName = [
                    item.boxType || 'BOX',
                    `${item.l}x${item.b}${(parseFloat(item.h) || 0) > 0 ? `x${item.h}` : ''}`,
                    `${item.ply || 3} Ply`,
                ].join(' ');

                createdProducts++;
                updatePromises.push(
                    addProductService({
                        name: derivedName,
                        partyId: selectedPartyId,
                        partyName: party?.name || '',
                        specification: specFromItem(item),
                        ...(item.layers?.length ? { layers: item.layers } : {}),
                        accessories: item.accessories?.map(({ calculated, ...rest }: any) => rest),
                        createdBy: user.username,
                        createdAt: new Date().toISOString(),
                        ownership: party?.ownership || 'Shivam',
                    } as any).then((newId: string) => { newProductIds[item.id] = newId; })
                );
                return;
            }

            const product = products.find((p: Product) => p.id === item.productId);
            if (!product) return;

            const updatedSpec: Partial<ProductSpecification> = specFromItem(item, product.specification);

            // Row's paperCost/transportCost are for the whole noOfPcs run, not
            // a single unit - divide back down before writing to the
            // catalog's per-unit `rate`. Never sync when a rate is missing
            // (would poison the catalog with a bogus Rs. 0-based figure) or
            // when there are no pieces to derive a unit rate from.
            const pcsParsed = parseInt(item.noOfPcs, 10);
            const pcs = isNaN(pcsParsed) ? 1 : pcsParsed;
            const hasMissingRate = item.calculated?.rateMissing || item.accessories?.some(a => a.calculated?.rateMissing);

            if (pcs <= 0 || hasMissingRate) {
                skippedRateSync++;
                updatePromises.push(updateProduct(item.productId, {
                    specification: updatedSpec,
                    // Only write layers when the row actually has them - an
                    // undefined field makes the Firestore write throw.
                    ...(item.layers?.length ? { layers: item.layers } : {}),
                    accessories: item.accessories?.map(({ calculated, ...rest }: any) => rest),
                    lastModifiedBy: user.username
                }));
                return;
            }

            const itemRate = ((item.calculated?.paperCost || 0) +
                             (item.calculated?.transportCost || 0) +
                             (item.accessories?.reduce((sum, a) => sum + (a.calculated?.paperCost || 0), 0) || 0)) / pcs;

            updatePromises.push(updateProduct(item.productId, {
                rate: parseFloat(itemRate.toFixed(2)),
                specification: updatedSpec,
                ...(item.layers?.length ? { layers: item.layers } : {}),
                accessories: item.accessories?.map(({ calculated, ...rest }: any) => rest),
                lastModifiedBy: user.username
            }));
        });

        await Promise.all(updatePromises);

        // Link the rows that just created a catalog entry to it, so saving
        // again updates that product rather than creating another one.
        if (Object.keys(newProductIds).length > 0) {
            setItems(prev => prev.map(i => (newProductIds[i.id] ? { ...i, productId: newProductIds[i.id] } : i)));
        }

        const notes: string[] = [];
        if (createdProducts > 0) notes.push(`${createdProducts} new product(s) added to PackSpec.`);
        if (skippedRateSync > 0) notes.push(`${skippedRateSync} item(s) had a missing rate or zero pieces, so their catalog rate was left unchanged.`);
        toast({
            title: 'Success',
            description: notes.length > 0
                ? `Report saved. ${notes.join(' ')}`
                : 'Report saved, specifications and rates synchronized to PackSpec.'
        });
        onSaveSuccess();
    } catch (error) {
        console.error("Save error:", error);
        toast({ title: 'Error', description: 'Failed to save record.', variant: 'destructive' });
    } finally {
        setIsSaving(false);
    }
  };

  const handleManualPreview = () => {
    onPreview({
        reportNumber,
        reportDate,
        party: parties.find(p => p.id === selectedPartyId),
        items: items.filter(i => selectedForPrint.has(i.id)).map(i => ({...i, totalItemCost: (i.calculated.paperCost || 0) + (i.calculated.transportCost || 0) + (i.accessories?.reduce((sum: number, a: any) => sum + (a.calculated?.paperCost || 0), 0) || 0)})),
        termsAndConditions,
        transportCost: Number(transportCost) || 0,
        transportCostType: transportCostType
    });
  };

  const companyProducts = useMemo(() => {
    if (!selectedPartyId) return [];
    return products.filter((p: Product) => p.partyId === selectedPartyId).sort((a: Product, b: Product) => a.name.localeCompare(b.name));
  }, [products, selectedPartyId]);

  const maxPly = useMemo(() => {
      let max = 3;
      items.forEach(i => {
          max = Math.max(max, parseInt(i.ply, 10) || 3);
          i.accessories?.forEach(a => max = Math.max(max, parseInt(a.ply, 10) || 3));
      });
      return max;
  }, [items]);

  // The table's min-width has to shrink with the groups, or collapsing one
  // just leaves white space instead of removing the horizontal scroll.
  const tableMinWidth = useMemo(() => {
    const ALWAYS = 10 + 280 + 140 + 80;             // checkbox, product, total, actions
    const spec = collapsedGroups.spec ? 170 : 980;  // L/B/H + pcs/ply/flute/type/bf/waste
    const gsm = collapsedGroups.gsm ? 150 : maxPly * 100;
    const calc = collapsedGroups.calc ? 150 : 430;  // T.GSM, weight, gross, transport
    return ALWAYS + spec + gsm + calc;
  }, [collapsedGroups, maxPly]);

  const handleTogglePrint = useCallback((id: string, checked: boolean) => {
    setSelectedForPrint(prev => {
        const next = new Set(prev);
        if (checked) next.add(id);
        else next.delete(id);
        return next;
    });
  }, []);

  const filteredParties = useMemo(() => {
    return parties
        .filter(p => p.ownership === 'Shivam' || p.ownership === 'Both')
        .sort((a, b) => a.name.localeCompare(b.name));
  }, [parties]);

  const filteredDeals = useMemo(() => {
    if (!selectedPartyId) return [];
    return deals.filter(d => d.partyId === selectedPartyId && d.stage !== 'Won' && d.stage !== 'Lost');
  }, [deals, selectedPartyId]);

  return (
    <div className="space-y-6">
        <Collapsible open={isSetupOpen} onOpenChange={setIsSetupOpen}>
          <Card className="shadow-sm overflow-hidden">
            <CollapsibleTrigger asChild>
                <button type="button" className="w-full flex items-center justify-between gap-3 px-4 py-3 border-b bg-muted/5 text-left hover:bg-muted/10 transition-colors">
                    <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xs font-bold uppercase tracking-wider shrink-0">Quotation Setup</span>
                        {!isSetupOpen && (
                            <span className="text-[11px] text-muted-foreground truncate">
                                &bull; {selectedPartyId ? (parties.find(p => p.id === selectedPartyId)?.name || 'Client selected') : 'No client selected'}
                                {' '}&bull; {reportNumber}
                                {validUntilBS && ` · Valid until ${validUntilBS}`}
                            </span>
                        )}
                    </div>
                    {isSetupOpen ? <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />}
                </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
                <CardContent className="pt-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-x-6 gap-y-6">
                        <SetupSection
                            title="Report Identity"
                            open={!!openSetupSections.identity}
                            onToggle={() => toggleSetupSection('identity')}
                            summary={`${parties.find(p => p.id === selectedPartyId)?.name || 'No client'} · ${reportNumber || '-'}`}
                        >
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1"><Label className="text-[10px] font-bold">Report No</Label><Input value={reportNumber} readOnly className="h-8 text-xs bg-muted font-mono" /></div>
                                <div className="space-y-1"><Label className="text-[10px] font-bold">Date</Label><Button variant="outline" className="w-full h-8 text-xs font-normal justify-start"><CalendarIcon className="mr-2 h-3.5 w-3.5" /> {toNepaliDate(reportDate.toISOString())}</Button></div>
                            </div>
                            <div className="space-y-1">
                                <Label className="text-[10px] font-bold">Party Name</Label>
                                <Popover open={isPartyPopoverOpen} onOpenChange={setIsPartyPopoverOpen}>
                                    <PopoverTrigger asChild>
                                        <Button variant="outline" role="combobox" className="w-full justify-between h-8 text-xs">
                                            <span className="truncate">{selectedPartyId ? parties.find(p => p.id === selectedPartyId)?.name : "Select customer..."}</span>
                                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="p-0">
                                        <Command>
                                            <CommandInput placeholder="Search customer..." value={partySearch} onValueChange={setPartySearch} />
                                            <CommandList>
                                                <CommandEmpty>
                                                    <Button variant="ghost" className="w-full justify-start text-xs" onClick={() => { setPartyForm({ name: partySearch, type: 'Customer', address: '', panNumber: '', ownership: 'Shivam' }); setIsPartyDialogOpen(true); setIsPartyPopoverOpen(false); }}>
                                                        <PlusCircle className="mr-2 h-4 w-4" /> Add "{partySearch}"
                                                    </Button>
                                                </CommandEmpty>
                                                <CommandGroup>
                                                    {filteredParties.map(p => (
                                                        <CommandItem key={p.id} value={p.name} onSelect={() => { setSelectedPartyId(p.id); setSelectedDealId(''); setIsPartyPopoverOpen(false); }}>
                                                            <Check className={cn("mr-2 h-4 w-4", selectedPartyId === p.id ? "opacity-100" : "opacity-0")} />
                                                            {p.name}
                                                        </CommandItem>
                                                    ))}
                                                </CommandGroup>
                                            </CommandList>
                                        </Command>
                                    </PopoverContent>
                                </Popover>
                            </div>
                            {selectedPartyId && (
                                <div className="space-y-1 animate-in fade-in slide-in-from-top-1">
                                    <Label className="text-[10px] font-bold flex items-center gap-1.5 text-primary"><Target className="h-3 w-3"/> Link to Opportunity</Label>
                                    <Select value={selectedDealId} onValueChange={setSelectedDealId}>
                                        <SelectTrigger className="h-8 text-[10px] bg-white border-primary/20"><SelectValue placeholder="Associate with deal..." /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="none">Standalone (No Deal)</SelectItem>
                                            {filteredDeals.map(d => (
                                                <SelectItem key={d.id} value={d.id}>{d.title} (Rs.{d.value.toLocaleString()})</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            )}
                        </SetupSection>

                        <SetupSection
                            title="Global Rates (NPR)"
                            open={!!openSetupSections.rates}
                            onToggle={() => toggleSetupSection('rates')}
                            summary={`${Object.keys(kraftPaperCosts).length} BF rates · conv ${conversionCost || 0}`}
                        >
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2 col-span-2">
                                    <Label className="text-[10px] font-bold text-muted-foreground">KRAFT BF RATES</Label>
                                    <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                                        {BF_OPTIONS.map(bf => (
                                            <div key={bf} className="flex items-center gap-2">
                                                <span className="text-[10px] w-12 font-medium">{bf}</span>
                                                <Input type="number" className="h-8 text-xs px-2" value={kraftPaperCosts[normalizeBF(bf)] ?? ''} onChange={e => setKraftPaperCosts({...kraftPaperCosts, [normalizeBF(bf)]: e.target.value === '' ? 0 : parseFloat(e.target.value)})} />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <div className="space-y-1"><Label className="text-[10px] font-bold">Virgin Rate</Label><Input type="number" value={virginPaperCost ?? ''} onChange={e => setVirginCost(e.target.value === '' ? '' : parseFloat(e.target.value))} className="h-8 text-xs" /></div>
                                <div className="space-y-1"><Label className="text-[10px] font-bold">Conversion</Label><Input type="number" value={conversionCost ?? ''} onChange={e => setConversionCost(e.target.value === '' ? '' : parseFloat(e.target.value))} className="h-8 text-xs" /></div>
                            </div>
                            {/* Kraft is priced by BF and virgin has one rate. Anything
                                else a layer might be made of needs its own rate, or
                                that layer silently costs nothing. */}
                            {/* Take-up factors. Mills quote different figures for the
                                same profile and revise them, so these are editable and
                                saved with the quotation - re-opening an old report
                                costs it with the factors it was quoted at. */}
                            <div>
                                <div className="flex items-center justify-between gap-2">
                                    <Label className="text-[10px] font-bold text-muted-foreground">Flute Take-up Factor</Label>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setTakeUpLocked(v => !v)}
                                        title={takeUpLocked
                                            ? 'Locked - these are mill parameters and rarely change. Click to edit.'
                                            : 'Unlocked - click to lock again. Locks itself next time the page opens.'}
                                        className={cn('h-6 px-1.5 text-[9px] font-black uppercase tracking-widest gap-1',
                                            takeUpLocked ? 'text-muted-foreground' : 'text-amber-600')}
                                    >
                                        {takeUpLocked ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
                                        {takeUpLocked ? 'Locked' : 'Editing'}
                                    </Button>
                                </div>
                                <div className="grid grid-cols-2 gap-1.5 mt-1">
                                    {Object.entries(FLUTE_PROFILES).map(([k, p]) => {
                                        const effective = resolveTakeUp(k, fluteTakeUps);
                                        const isOverridden = effective !== p.takeUp;
                                        return (
                                            <div key={k} className="flex items-center gap-1">
                                                <span className={cn("text-[10px] w-10 shrink-0 font-bold", isOverridden && "text-primary")} title={`${p.label} - default ${p.takeUp}x`}>
                                                    {k}{isOverridden && '*'}
                                                </span>
                                                <Input
                                                    type="number"
                                                    step="0.01"
                                                    disabled={takeUpLocked}
                                                    className={cn('h-8 text-xs px-2', takeUpLocked && 'bg-muted/50 cursor-not-allowed')}
                                                    placeholder={String(p.takeUp)}
                                                    value={fluteTakeUps[k] ?? ''}
                                                    onChange={e => {
                                                        const v = e.target.value;
                                                        setFluteTakeUps(prev => {
                                                            const next = { ...prev };
                                                            // Clearing the box returns that profile to its
                                                            // default rather than costing it at zero.
                                                            if (v === '') delete next[k]; else next[k] = parseFloat(v);
                                                            return next;
                                                        });
                                                    }}
                                                />
                                            </div>
                                        );
                                    })}
                                </div>
                                <p className="text-[9px] text-muted-foreground mt-1 leading-tight">
                                    {takeUpLocked
                                        ? 'Unlock to change. Blank uses the default.'
                                        : 'Blank uses the default. Saved with this quotation, so changing it later won\u2019t reprice past reports.'}
                                </p>
                            </div>

                            <div>
                                <Label className="text-[10px] font-bold text-muted-foreground">Other Papers (NPR/kg)</Label>
                                <div className="grid grid-cols-2 gap-1.5 mt-1">
                                    {PAPER_MATERIALS.filter(m => m.rateKey === 'other').map(m => (
                                        <div key={m.value} className="flex items-center gap-1">
                                            <span className="text-[10px] w-16 shrink-0 truncate" title={m.label}>{m.label}</span>
                                            <Input
                                                type="number"
                                                className="h-8 text-xs px-2"
                                                value={otherPaperCosts[m.value] ?? ''}
                                                onChange={e => setOtherPaperCosts({ ...otherPaperCosts, [m.value]: e.target.value === '' ? 0 : parseFloat(e.target.value) })}
                                            />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </SetupSection>

                        <SetupSection
                            title="T&C and Logistics"
                            open={!!openSetupSections.terms}
                            onToggle={() => toggleSetupSection('terms')}
                            summary={`${termsAndConditions.filter(t => t.isSelected).length} terms · transport ${transportCost || 0} ${transportCostType === 'Per Piece' ? '/pc' : '/consignment'}`}
                            action={<Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setIsManageTermsDialogOpen(true)} title="Manage Master Terms"><Settings2 className="h-3 w-3" /></Button>}
                        >
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1"><Label className="text-[10px] font-bold">Transport</Label><Input type="number" value={transportCost ?? ''} onChange={e => setTransportCost(e.target.value === '' ? '' : parseFloat(e.target.value))} className="h-8 text-xs" /></div>
                                <div className="space-y-1"><Label className="text-[10px] font-bold">Basis</Label>
                                    <Select value={transportCostType} onValueChange={(v: any) => setTransportCostType(v)}>
                                        <SelectTrigger className="h-8 text-xs"><SelectValue/></SelectTrigger>
                                        <SelectContent><SelectItem value="Per Piece">Per Piece</SelectItem><SelectItem value="Per Consignment">Lump Sum</SelectItem></SelectContent>
                                    </Select>
                                </div>
                            </div>
                            <div className="space-y-1">
                                <Label className="text-[10px] font-bold text-muted-foreground uppercase">Selected Terms</Label>
                                <ScrollArea className="h-20 border rounded bg-muted/5 p-2">
                                    {termsAndConditions.length > 0 ? (
                                        <div className="space-y-1.5">
                                            {termsAndConditions.map((term, idx) => (
                                                <div key={idx} className="flex items-center space-x-2">
                                                    <Checkbox
                                                        id={`term-${idx}`}
                                                        checked={term.isSelected}
                                                        onCheckedChange={(v) => {
                                                            const next = [...termsAndConditions];
                                                            next[idx].isSelected = !!v;
                                                            setTermsAndConditions(next);
                                                        }}
                                                    />
                                                    <Label htmlFor={`term-${idx}`} className="text-[10px] leading-tight cursor-pointer line-clamp-1">{term.text}</Label>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-[9px] text-center text-muted-foreground py-4 italic">No terms in master list.</p>
                                    )}
                                    <ScrollBar orientation="vertical" />
                                </ScrollArea>
                            </div>
                        </SetupSection>

                        <SetupSection
                            title="Quotation Meta"
                            open={!!openSetupSections.meta}
                            onToggle={() => toggleSetupSection('meta')}
                            summary={`${status}${validUntilBS ? ` · valid ${validUntilBS}` : ''}`}
                        >
                            <div className="space-y-1">
                                <Label className="text-[10px] font-bold">Valid Until (BS)</Label>
                                <Input value={validUntilBS} onChange={e => setValidUntilBS(e.target.value)} placeholder="YYYY/MM/DD" className="h-8 text-xs font-mono" />
                            </div>
                            <div className="space-y-1">
                                <Label className="text-[10px] font-bold">Internal Remarks</Label>
                                <Textarea value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="Pricing logic, discounts..." className="min-h-[60px] text-xs resize-none" />
                            </div>
                            <div className="space-y-1">
                                <Label className="text-[10px] font-bold">Lifecycle Status</Label>
                                <Select value={status} onValueChange={(v: QuotationStatus) => setStatus(v)}>
                                    <SelectTrigger className="h-8 text-xs font-bold"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="Draft">Draft</SelectItem>
                                        <SelectItem value="Sent">Sent to Client</SelectItem>
                                        <SelectItem value="Accepted">Accepted</SelectItem>
                                        <SelectItem value="Rejected">Rejected</SelectItem>
                                        <SelectItem value="Expired">Expired</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </SetupSection>
                    </div>
                </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        <Card className="shadow-lg overflow-hidden border-t-4 border-t-primary">
            <CardHeader className="flex flex-col sm:flex-row sm:items-center gap-3 bg-muted/20 py-4 px-4 sm:px-6">
                <div>
                    <CardTitle className="text-base font-bold">Costing Dashboard</CardTitle>
                    <CardDescription className="text-[11px]">Technical analysis and weight calculation</CardDescription>
                </div>
                <div className="flex flex-wrap gap-2 sm:ml-auto">
                    <Button size="sm" variant="outline" onClick={handleAddItem} className="h-9"><Plus className="mr-2 h-4 w-4" /> Add Item</Button>
                    <Button size="sm" variant="outline" onClick={() => setIsBatchAddDialogOpen(true)} disabled={!selectedPartyId} className="h-9">
                        <FileSpreadsheet className="mr-2 h-4 w-4" /> Load from List
                    </Button>
                    <Button size="sm" variant="outline" onClick={handleManualPreview} className="h-9"><ImageIcon className="mr-2 h-4 w-4" /> Preview</Button>
                    <Button size="sm" onClick={handleSaveReport} disabled={isSaving} className="h-9">
                        {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                        {reportToEdit ? 'Update Record' : 'Commit Quotation'}
                    </Button>
                </div>
            </CardHeader>
            <CardContent className="p-0">
                {/* Mobile: one stacked card per item, all fields reachable without horizontal scrolling */}
                <div className="md:hidden p-4 space-y-3">
                    {items.map((item: CostReportItem, idx: number) => (
                        <CostingItemCard
                            key={item.id}
                            item={item}
                            index={idx}
                            maxPly={maxPly}
                            products={companyProducts}
                            onItemChange={handleItemChange}
                            onAddAccessory={handleAddAccessory}
                            onRemoveItem={(id: string) => setItems(prev => prev.filter(i => i.id !== id))}
                            onDuplicateItem={handleDuplicateItem}
                            onOpenDesigner={setDesignerIndex}
                            onFluteChange={handleFluteChange}
                            collapsedGroups={collapsedGroups}
                            onOpenQuickAddProduct={(idx: number, search: string) => {
                                setActiveRowIndexForProduct(idx);
                                setQuickProductSearch(search);
                                setIsProductDialogOpen(true);
                            }}
                        />
                    ))}
                    {items.length === 0 && (
                        <div className="py-12 text-center text-muted-foreground text-xs italic">No items yet - tap "Add Item" above.</div>
                    )}
                </div>

                {/* Desktop: Excel-style row-per-item table */}
                <ScrollArea className="w-full hidden md:block">
                    <div className="p-4">
                        <Table className="text-[11px] border border-collapse" style={{ minWidth: `${tableMinWidth}px` }}>
                            <TableHeader className="bg-muted/80">
                                <TableRow>
                                    <th rowSpan={2} className="w-10 px-2"></th>
                                    <th rowSpan={2} className="min-w-[280px] font-bold text-black border-r">Item Name / Product</th>

                                    {/* Specification: size through waste %. Collapsing it swaps
                                        eight input columns for one read-only summary cell. */}
                                    <th
                                        rowSpan={collapsedGroups.spec ? 2 : 1}
                                        colSpan={collapsedGroups.spec ? 1 : 9}
                                        className={cn('text-center border-x font-bold text-black bg-blue-50/50 p-0', collapsedGroups.spec && 'min-w-[170px]')}
                                    >
                                        <GroupToggle label="Specification" collapsed={collapsedGroups.spec} onToggle={() => toggleGroup('spec')} />
                                    </th>

                                    {/* GSM composition: one column per layer. */}
                                    <th
                                        rowSpan={collapsedGroups.gsm ? 2 : 1}
                                        colSpan={collapsedGroups.gsm ? 1 : maxPly}
                                        className={cn('text-center border-x font-bold text-black bg-orange-50/50 p-0', collapsedGroups.gsm && 'min-w-[150px]')}
                                    >
                                        <GroupToggle label="GSM Composition" collapsed={collapsedGroups.gsm} onToggle={() => toggleGroup('gsm')} />
                                    </th>

                                    {/* Costing: T.GSM through transport. */}
                                    <th
                                        rowSpan={collapsedGroups.calc ? 2 : 1}
                                        colSpan={collapsedGroups.calc ? 1 : 4}
                                        className={cn('text-center border-x font-bold text-black bg-primary/5 p-0', collapsedGroups.calc && 'min-w-[150px]')}
                                    >
                                        <GroupToggle label="Costing" collapsed={collapsedGroups.calc} onToggle={() => toggleGroup('calc')} />
                                    </th>

                                    <th rowSpan={2} className="text-right min-w-[140px] pr-6 bg-primary/10 font-bold">Total NPR</th>
                                    <th rowSpan={2} className="w-20"></th>
                                </TableRow>
                                <TableRow>
                                    {!collapsedGroups.spec && <>
                                        <th className="text-center border-l min-w-[110px] bg-blue-50/30">L</th>
                                        <th className="text-center min-w-[110px] bg-blue-50/30">B</th>
                                        <th className="text-center min-w-[110px] bg-blue-50/30">H</th>
                                        <th className="text-center min-w-[80px] bg-blue-50/30" title="Number of pieces">Pcs</th>
                                        <th className="text-center min-w-[80px] bg-blue-50/30" title="Number of paper layers in the board (3/5/7/9-ply corrugated)">Ply</th>
                                        <th className="text-center min-w-[110px] bg-blue-50/30" title="Flute profile. Sets the take-up factor applied to every fluted layer - a double wall shows both, e.g. B+C. Take-up factors are editable under Global Rates.">Flute</th>
                                        <th className="text-center min-w-[150px] bg-blue-50/30" title="Paper type: Kraft, Virgin, or Mixed">Type (K/V/M)</th>
                                        <th className="text-center min-w-[130px] bg-blue-50/30" title="Burst Factor rating of the kraft paper - looked up against the Global Rates on the left">Paper BF</th>
                                        <th className="text-center border-r min-w-[100px] bg-blue-50/30" title="Extra paper weight added on top to account for production wastage">Waste %</th>
                                    </>}
                                    {!collapsedGroups.gsm && <>
                                        <th className="text-center border-l min-w-[100px] bg-orange-50/30" title="Outer liner GSM">Top</th>
                                        <th className="text-center min-w-[100px] bg-orange-50/30" title="1st flute (corrugated medium) GSM">F1</th>
                                        {maxPly >= 5 && <th className="text-center min-w-[100px] bg-orange-50/30" title="1st middle liner GSM (5-ply and up)">Mid1</th>}
                                        {maxPly >= 5 && <th className="text-center min-w-[100px] bg-orange-50/30" title="2nd flute GSM (5-ply and up)">F2</th>}
                                        {maxPly >= 7 && <th className="text-center min-w-[100px] bg-orange-50/30" title="2nd middle liner GSM (7-ply and up)">Mid2</th>}
                                        {maxPly >= 7 && <th className="text-center min-w-[100px] bg-orange-50/30" title="3rd flute GSM (7-ply and up)">F3</th>}
                                        {maxPly >= 9 && <th className="text-center min-w-[100px] bg-orange-50/30" title="3rd middle liner GSM (9-ply)">Mid3</th>}
                                        {maxPly >= 9 && <th className="text-center min-w-[100px] bg-orange-50/30" title="4th flute GSM (9-ply)">F4</th>}
                                        <th className="text-center border-r min-w-[100px] bg-orange-50/30" title="Inner liner GSM">Bot</th>
                                    </>}
                                    {!collapsedGroups.calc && <>
                                        <th className="text-center border-l min-w-[90px] bg-muted/20" title="Total GSM: outer/inner liners plus flutes (weighted 1.35x for corrugation) - drives the paper weight below">T.GSM</th>
                                        <th className="text-center min-w-[100px] bg-muted/20" title="Total paper weight for all pieces in this row, including wastage">Weight (g)</th>
                                        <th className="text-center min-w-[120px] bg-primary/5 font-bold">Gross</th>
                                        <th className="text-center border-r min-w-[120px] bg-primary/5 font-bold">Transport</th>
                                    </>}
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {items.map((item: CostReportItem, idx: number) => (
                                    <CostingTableRow 
                                        key={item.id} 
                                        item={item} 
                                        index={idx} 
                                        maxPly={maxPly} 
                                        products={companyProducts} 
                                        onItemChange={handleItemChange} 
                                        onAddAccessory={handleAddAccessory} 
                                        onRemoveItem={(id: string) => setItems(prev => prev.filter(i => i.id !== id))}
                                        onDuplicateItem={handleDuplicateItem}
                                        onOpenDesigner={setDesignerIndex}
                                        onFluteChange={handleFluteChange}
                                        collapsedGroups={collapsedGroups}
                                        onTogglePrint={handleTogglePrint}
                                        selectedForPrint={selectedForPrint}
                                        onOpenQuickAddProduct={(idx: number, search: string) => {
                                            setActiveRowIndexForProduct(idx);
                                            setQuickProductSearch(search);
                                            setIsProductDialogOpen(true);
                                        }}
                                    />
                                ))}
                            </TableBody>
                        </Table>
                        <ScrollBar orientation="horizontal" />
                        <ScrollBar orientation="vertical" />
                    </div>
                </ScrollArea>
            </CardContent>
        </Card>

        {/* Batch Load Dialog */}
        <Dialog open={isBatchAddDialogOpen} onOpenChange={isBatchAddDialogOpen ? () => setIsBatchAddDialogOpen(false) : undefined}>
            <DialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col p-0">
                <DialogHeader className="p-6 pb-0">
                    <DialogTitle>Load Products from List</DialogTitle>
                    <DialogDescription>Select multiple products for the current party to add to the calculator.</DialogDescription>
                </DialogHeader>
                <div className="flex-1 overflow-y-auto p-6">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <th className="w-12"></th>
                                <th>Product Name</th>
                                <th>Specs</th>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {companyProducts.map((p: Product) => (
                                <TableRow key={p.id}>
                                    <TableCell>
                                        <Checkbox 
                                            checked={selectedBatchProductIds.has(p.id)} 
                                            onCheckedChange={(v) => {
                                                const next = new Set(selectedBatchProductIds);
                                                if (v) next.add(p.id);
                                                else next.delete(p.id);
                                                setSelectedBatchProductIds(next);
                                            }}
                                        />
                                    </TableCell>
                                    <TableCell className="font-medium">{p.name}</TableCell>
                                    <TableCell className="text-xs text-muted-foreground">
                                        {p.specification?.dimension || 'N/A'} • {p.specification?.ply} Ply • {p.specification?.paperType}
                                    </TableCell>
                                </TableRow>
                            ))}
                            {companyProducts.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                                        No products found for this party.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
                <DialogFooter className="p-6 border-t">
                    <Button variant="outline" onClick={() => setIsBatchAddDialogOpen(false)}>Cancel</Button>
                    <Button onClick={handleBatchLoad} disabled={selectedBatchProductIds.size === 0}>
                        Load Selected ({selectedBatchProductIds.size})
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>

        <Dialog open={isPartyDialogOpen} onOpenChange={isPartyDialogOpen ? () => setIsPartyDialogOpen(false) : undefined}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader><DialogTitle>Quick Add Party</DialogTitle></DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="space-y-2"><Label>Party Name</Label><Input value={partyForm.name ?? ''} onChange={e => setPartyForm({...partyForm, name: e.target.value})} /></div>
                    <div className="space-y-2">
                        <Label>Ownership</Label>
                        <Select value={partyForm.ownership} onValueChange={(v: AccountOwnership) => setPartyForm({...partyForm, ownership: v})}>
                            <SelectTrigger><SelectValue/></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="Sijan">Sijan Dhuwani</SelectItem>
                                <SelectItem value="Shivam">Shivam Packaging</SelectItem>
                                <SelectItem value="Both">Both</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2"><Label>PAN Number</Label><Input value={partyForm.panNumber ?? ''} onChange={e => setPartyForm({...partyForm, panNumber: e.target.value})} /></div>
                    <div className="space-y-2"><Label>Address</Label><Textarea value={partyForm.address ?? ''} onChange={e => setPartyForm({...partyForm, address: e.target.value})} /></div>
                </div>
                <DialogFooter><Button onClick={handleSubmitParty}>Add Party</Button></DialogFooter>
            </DialogContent>
        </Dialog>

        <Dialog open={isProductDialogOpen} onOpenChange={isProductDialogOpen ? () => setIsProductDialogOpen(false) : undefined}>
            <DialogContent className="sm:max-w-5xl max-h-[95vh] flex flex-col p-0">
                <DialogHeader className="p-6 pb-0"><DialogTitle>Quick Add Product</DialogTitle></DialogHeader>
                <div className="flex-1 overflow-y-auto px-6 pb-6">
                    <ProductForm 
                        initialName={quickProductSearch}
                        onSaveSuccess={(data: any) => { 
                            const party = parties.find(p => p.id === data.partyId);
                            addProductService({...data, ownership: party?.ownership || 'Shivam', createdBy: user?.username, createdAt: new Date().toISOString()}).then((newId) => {
                                if (activeRowIndexForProduct !== null) {
                                    handleItemChange(activeRowIndexForProduct, 'productId', newId);
                                }
                                setIsProductDialogOpen(false);
                                setQuickProductSearch('');
                                toast({ title: 'Product Added' });
                            }); 
                        }} 
                    />
                </div>
            </DialogContent>
        </Dialog>

        {designerIndex !== null && items[designerIndex] && (
            <BoxDesigner
                open={designerIndex !== null}
                onOpenChange={(v: boolean) => { if (!v) setDesignerIndex(null); }}
                item={items[designerIndex]}
                rates={rateContext}
                onChange={(patch: Record<string, any>) => handleItemPatch(designerIndex, patch)}
                title={
                    (products.find((p: Product) => p.id === items[designerIndex].productId)?.name || `Row ${designerIndex + 1}`)
                    + ` · ${items[designerIndex].l || 0}×${items[designerIndex].b || 0}×${items[designerIndex].h || 0} mm · ${items[designerIndex].noOfPcs || 0} pcs`
                }
            />
        )}

        <React.Suspense fallback={<Loader2 className="animate-spin" />}>
            <ManageTermsDialog 
                isOpen={isManageTermsDialogOpen} 
                onOpenChange={setIsManageTermsDialogOpen} 
                masterTerms={costSettings?.termsAndConditions || []} 
                onSave={handleSaveMasterTerms} 
            />
        </React.Suspense>
    </div>
  );
}
