
'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
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
  CompanyProfile
} from '@/lib/types';
import { onProductsUpdate, addProduct as addProductService, updateProduct, deleteProduct } from '@/services/product-service';
import { onPartiesUpdate, addParty } from '@/services/party-service';
import { 
  onCostReportsUpdate, 
  addCostReport, 
  generateNextCostReportNumber, 
  deleteCostReport
} from '@/services/cost-report-service';
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
  Loader2
} from 'lucide-react';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow,
} from '@/components/ui/table';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { cn, toNepaliDate, normalizeBF, generateId } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { onSettingUpdate, updateCostSettings } from '@/services/settings-service';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Textarea } from '@/components/ui/textarea';
import React from 'react';
import { DEFAULT_COMPANY_PROFILE, PLY_OPTIONS, BF_OPTIONS } from '@/lib/constants';

// Internal Components
import { ProductForm } from './_components/product-form';
import { ProductsList } from './_components/products-list';
import { SavedReportsList } from './_components/reports-list';

// Externalized heavy UI components
const QuotationPreviewDialog = React.lazy(() => import('./_components/quotation-preview').then(m => ({ default: m.QuotationPreviewDialog })));
const ManageTermsDialog = React.lazy(() => import('./_components/terms-dialog').then(m => ({ default: m.ManageTermsDialog })));

const CostingTableRow = React.memo(({ 
    item, 
    index, 
    maxPly, 
    products, 
    onItemChange, 
    onAddAccessory, 
    onRemoveItem, 
    onTogglePrint, 
    selectedForPrint,
    onAddProductQuickly
}: any) => {
    // Safety check for calculation values
    const calc = item.calculated || { paperCost: 0, transportCost: 0, totalGsm: 0, paperWeight: 0 };
    
    // Calculate total cost for this row (Main Item Gross + Main Item Transport + all its Accessories Gross)
    const totalRowCost = (calc.paperCost || 0) + 
        (calc.transportCost || 0) +
        (item.accessories || []).reduce((sum: number, acc: any) => sum + (acc.calculated?.paperCost || 0), 0);

    return (
        <React.Fragment>
            <TableRow className="h-14 hover:bg-muted/30 border-b">
                <TableCell className="px-2 border-r">
                    <Checkbox 
                        checked={selectedForPrint.has(item.id)} 
                        onCheckedChange={v => onTogglePrint(item.id, !!v)} 
                    />
                </TableCell>
                <TableCell className="border-r pr-2">
                    <div className="flex gap-1.5 items-center">
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
                        <Select value={item.productId || ''} onValueChange={v => onItemChange(index, 'productId', v)}>
                            <SelectTrigger className="h-8 text-[11px] w-full px-2">
                                <SelectValue placeholder="Select product..." />
                            </SelectTrigger>
                            <SelectContent>
                                {products.map((p: any) => (
                                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </TableCell>
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
                <TableCell className="text-center font-medium bg-muted/20 border-r">{(calc.totalGsm || 0).toFixed(0)}</TableCell>
                <TableCell className="text-center font-medium bg-muted/20 border-r">{(calc.paperWeight || 0).toFixed(1)}</TableCell>
                <TableCell className="text-center font-bold border-r bg-primary/5">Rs. {(calc.paperCost || 0).toFixed(2)}</TableCell>
                <TableCell className="text-center font-bold border-r bg-primary/5">Rs. {(calc.transportCost || 0).toFixed(2)}</TableCell>
                <TableCell className="text-right font-bold pr-6 bg-primary/10">Rs. {totalRowCost.toFixed(2)}</TableCell>
                <TableCell className="px-2">
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => onRemoveItem(item.id)}><Trash2 className="h-4 w-4" /></Button>
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
                        <TableCell className="text-center bg-muted/20 border-r">{(accCalc.totalGsm || 0).toFixed(0)}</TableCell>
                        <TableCell className="text-center bg-muted/20 border-r">{(accCalc.paperWeight || 0).toFixed(1)}</TableCell>
                        <TableCell className="text-center border-r">Rs. {(accCalc.paperCost || 0).toFixed(2)}</TableCell>
                        <TableCell className="text-center border-r"></TableCell>
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

function CostReportCalculator({ reportToEdit, onSaveSuccess, products, onPreview, companyProfile }: any) {
  const [parties, setParties] = useState<Party[]>([]);
  const [costReports, setCostReports] = useState<CostReport[]>([]);
  const [selectedPartyId, setSelectedPartyId] = useState('');
  const [reportNumber, setReportNumber] = useState('');
  const [reportDate, setReportDate] = useState<Date>(new Date());
  
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
  const [isPartyDialogOpen, setIsPartyDialogOpen] = useState(false);
  const [partyForm, setPartyForm] = useState({ name: '', type: 'Customer' as PartyType, address: '', panNumber: '' });
  const [isPartyPopoverOpen, setIsPartyPopoverOpen] = useState(false);
  const [partySearch, setPartySearch] = useState('');
  
  const [isProductDialogOpen, setIsProductDialogOpen] = useState(false);
  const [isBatchAddDialogOpen, setIsBatchAddDialogOpen] = useState(false);
  const [isManageTermsDialogOpen, setIsManageTermsDialogOpen] = useState(false);
  const [selectedBatchProductIds, setSelectedBatchProductIds] = useState<Set<string>>(new Set());
  
  const [costSettings, setCostSettings] = useState<CostSetting | null>(null);
  const { toast } = useToast();
  const { user } = useAuth();

  const calculateItemCost = useCallback((item: any, globalK: any, globalV: number, globalC: number, globalT: number, tType: string, isAcc = false): CalculatedValues => {
    const l = parseFloat(item.l) || 0;
    const b = parseFloat(item.b) || 0;
    const h = parseFloat(item.h) || 0;
    const pcs = parseInt(item.noOfPcs, 10) || 1;
    
    if (l <= 0 || b <= 0) {
        return { sheetSizeL: 0, sheetSizeB: 0, sheetArea: 0, totalGsm: 0, paperWeight: 0, totalBoxWeight: 0, paperRate: 0, paperCost: 0, transportCost: 0 };
    }
    
    const isBox = h > 0;
    let sL = 0, sB = 0;
    if (isBox) {
        const c1 = b + h + 20, d1 = (2 * l) + (2 * b) + 62, c2 = l + h + 20, d2 = (2 * b) + (2 * l) + 62;
        if (c1 * d1 <= c2 * d2) { sL = c1; sB = d1; } else { sL = c2; sB = d2; }
    } else { const d = [l, b].sort((x, y) => y - x); sL = d[0]; sB = d[1]; }
    
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
    const finalRate = pRate + (isAcc ? Number(accessoryConversionCost) || 0 : globalC);
    
    let paperCost = (tBWt / 1000) * finalRate;
    let tCost = 0;
    if (tType === 'Per Piece' && !isAcc) {
        tCost = globalT * pcs;
    }
    
    return { 
        sheetSizeL: sL, sheetSizeB: sB, sheetArea: sArea, totalGsm: tGsm, 
        paperWeight: pWt, totalBoxWeight: tBWt, paperRate: finalRate, 
        paperCost: paperCost,
        transportCost: tCost
    };
  }, [accessoryConversionCost]);

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

  useEffect(() => {
    const unsubCostSettings = onSettingUpdate('costing', (s) => {
        if (s?.value) {
            setCostSettings(s.value);
            setKraftPaperCosts(s.value.kraftPaperCosts || {});
            setVirginCost(s.value.virginPaperCost || '');
            setConversionCost(s.value.conversionCost || '');
            setAccessoryConversionCost(s.value.accessoryConversionCost || '');
            setTermsAndConditions(prev => prev.length === 0 ? (s.value.termsAndConditions || []) : prev);
        }
    });
    const unsubParties = onPartiesUpdate(setParties);
    const unsubReports = onCostReportsUpdate(setCostReports);
    return () => { unsubCostSettings(); unsubParties(); unsubReports(); };
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
      } else {
          setReportNumber(reportToEdit.reportNumber);
          setReportDate(new Date(reportToEdit.reportDate));
          setSelectedPartyId(reportToEdit.partyId);
          setTermsAndConditions(reportToEdit.termsAndConditions || []);
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
  }, [reportToEdit, costReports, calculateItemCost]);

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
    const newItems = selectedProducts.map(p => mapProductToItem(p));
    setItems([...items, ...newItems]);
    const newSelectedForPrint = new Set(selectedForPrint);
    newItems.forEach(i => newSelectedForPrint.add(i.id));
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
                item.accessories = item.accessories?.filter((_, i) => i !== v);
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
        setPartyForm({ name: '', type: 'Customer', address: '', panNumber: '' });
    } catch {
        toast({ title: 'Error', description: 'Failed to add party.', variant: 'destructive' });
    }
  };

  const handleSaveReport = async () => {
    if (!user || !selectedPartyId || items.length === 0) {
        toast({ title: 'Error', description: 'Party and at least one item are required.', variant: 'destructive' });
        return;
    }
    setIsSaving(true);
    try {
        const reportData = {
            reportNumber,
            reportDate: reportDate.toISOString(),
            partyId: selectedPartyId,
            partyName: parties.find(p => p.id === selectedPartyId)?.name || 'N/A',
            kraftPaperCosts,
            virginPaperCost: Number(virginPaperCost) || 0,
            conversionCost: Number(conversionCost) || 0,
            accessoryConversionCost: Number(accessoryConversionCost) || 0,
            transportCost: Number(transportCost) || 0,
            transportCostType,
            termsAndConditions,
            items: items.map(({ calculated, ...rest }) => rest),
            totalCost: items.reduce((sum, i) => sum + i.calculated.paperCost + i.calculated.transportCost + (i.accessories?.reduce((aSum, a) => aSum + a.calculated.paperCost, 0) || 0), 0) + (transportCostType === 'Per Consignment' ? (Number(transportCost) || 0) : 0),
            createdBy: user.username
        };
        await addCostReport(reportData);

        // Persist global rates to settings
        await updateCostSettings({
            kraftPaperCosts,
            virginPaperCost: Number(virginPaperCost) || 0,
            conversionCost: Number(conversionCost) || 0,
            accessoryConversionCost: Number(accessoryConversionCost) || 0,
        }, user.username);

        // Batch update product specs
        const updatePromises: any[] = [];
        items.forEach(item => {
            if (!item.productId) return;
            const product = products.find((p: Product) => p.id === item.productId);
            if (!product) return;
            
            const updatedSpec: Partial<ProductSpecification> = {
                ...product.specification,
                dimension: `${item.l}x${item.b}x${item.h}`,
                ply: item.ply,
                paperType: item.paperType,
                paperBf: item.paperBf,
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
            };
            
            updatePromises.push(updateProduct(item.productId, { 
                specification: updatedSpec, 
                accessories: item.accessories?.map(({ calculated, ...rest }: any) => rest),
                lastModifiedBy: user.username 
            }));
        });
        
        await Promise.all(updatePromises);
        toast({ title: 'Success', description: 'Report saved and specifications updated.' });
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
        items: items.filter(i => selectedForPrint.has(i.id)).map(i => ({...i, totalItemCost: i.calculated.paperCost + i.calculated.transportCost + (i.accessories?.reduce((sum, a) => sum + a.calculated.paperCost, 0) || 0)})),
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

  const handleTogglePrint = useCallback((id: string, checked: boolean) => {
    setSelectedForPrint(prev => {
        const next = new Set(prev);
        if (checked) next.add(id);
        else next.delete(id);
        return next;
    });
  }, []);

  return (
    <div className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="shadow-sm">
                <CardHeader className="py-3 px-4 border-b bg-muted/5"><CardTitle className="text-xs uppercase tracking-wider">Report Identity</CardTitle></CardHeader>
                <CardContent className="pt-4 space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1"><Label className="text-[10px] font-bold">Report No</Label><Input value={reportNumber ?? ''} readOnly className="h-8 text-xs bg-muted font-mono" /></div>
                        <div className="space-y-1"><Label className="text-[10px] font-bold">Date</Label><Button variant="outline" className="w-full h-8 text-xs font-normal justify-start"><CalendarIcon className="mr-2 h-3.5 w-3.5" /> {toNepaliDate(reportDate.toISOString())}</Button></div>
                    </div>
                    <div className="space-y-1">
                        <Label className="text-[10px] font-bold">Party Name</Label>
                        <Popover open={isPartyPopoverOpen} onOpenChange={setIsPartyPopoverOpen}>
                            <PopoverTrigger asChild>
                                <Button variant="outline" role="combobox" className="w-full justify-between h-8 text-xs">
                                    {selectedPartyId ? parties.find(p => p.id === selectedPartyId)?.name : "Select customer..."}
                                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="p-0">
                                <Command>
                                    <CommandInput placeholder="Search customer..." value={partySearch} onValueChange={setPartySearch} />
                                    <CommandList>
                                        <CommandEmpty>
                                            <Button variant="ghost" className="w-full justify-start text-xs" onClick={() => { setPartyForm({ name: partySearch, type: 'Customer', address: '', panNumber: '' }); setIsPartyDialogOpen(true); setIsPartyPopoverOpen(false); }}>
                                                <PlusCircle className="mr-2 h-4 w-4" /> Add "{partySearch}"
                                            </Button>
                                        </CommandEmpty>
                                        <CommandGroup>
                                            {parties.sort((a,b)=>a.name.localeCompare(b.name)).map(p => (
                                                <CommandItem key={p.id} value={p.name} onSelect={() => { setSelectedPartyId(p.id); setIsPartyPopoverOpen(false); }}>
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
                </CardContent>
            </Card>

            <Card className="shadow-sm">
                <CardHeader className="py-3 px-4 border-b bg-muted/5"><CardTitle className="text-xs uppercase tracking-wider">Global Rates (NPR)</CardTitle></CardHeader>
                <CardContent className="pt-4 grid grid-cols-2 gap-4">
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
                    <div className="space-y-1 col-span-2"><Label className="text-[10px] font-bold">Acc. Conversion</Label><Input type="number" value={accessoryConversionCost ?? ''} onChange={e => setAccessoryConversionCost(e.target.value === '' ? '' : parseFloat(e.target.value))} className="h-8 text-xs" placeholder="Rate for honeycomb, plates, etc." /></div>
                </CardContent>
            </Card>

            <Card className="shadow-sm">
                <CardHeader className="py-3 px-4 border-b bg-muted/5 flex flex-row items-center justify-between">
                    <CardTitle className="text-xs uppercase tracking-wider">T&C and Logistics</CardTitle>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setIsManageTermsDialogOpen(true)} title="Manage Master Terms"><Settings2 className="h-3 w-3" /></Button>
                </CardHeader>
                <CardContent className="pt-4 space-y-4">
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
                </CardContent>
            </Card>
        </div>

        <Card className="shadow-lg overflow-hidden border-t-4 border-t-primary">
            <CardHeader className="flex flex-row items-center gap-4 bg-muted/20 py-4 px-6">
                <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={handleAddItem} className="h-9"><Plus className="mr-2 h-4 w-4" /> Add Item</Button>
                    <Button size="sm" variant="outline" onClick={() => setIsBatchAddDialogOpen(true)} disabled={!selectedPartyId} className="h-9">
                        <FileSpreadsheet className="mr-2 h-4 w-4" /> Load from List
                    </Button>
                    <Button size="sm" onClick={handleSaveReport} disabled={isSaving} className="h-9">
                        {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} 
                        Save Report
                    </Button>
                    <Button size="sm" variant="outline" onClick={handleManualPreview} className="h-9"><ImageIcon className="mr-2 h-4 w-4" /> Preview Quotation</Button>
                </div>
                <div className="ml-auto text-right">
                    <CardTitle className="text-base font-bold">Costing Dashboard</CardTitle>
                    <CardDescription className="text-[11px]">Technical analysis and weight calculation</CardDescription>
                </div>
            </CardHeader>
            <CardContent className="p-0">
                <ScrollArea className="w-full">
                    <div className="p-4">
                        <Table className="text-[11px] border border-collapse min-w-[2200px]">
                            <TableHeader className="bg-muted/80">
                                <TableRow>
                                    <TableHead rowSpan={2} className="w-10 px-2"></TableHead>
                                    <TableHead rowSpan={2} className="min-w-[280px] font-bold text-black border-r">Item Name / Product</TableHead>
                                    <TableHead colSpan={3} className="text-center border-x font-bold text-black bg-blue-50/50">Size (mm)</TableHead>
                                    <TableHead rowSpan={2} className="text-center min-w-[80px] border-r">Pcs</TableHead>
                                    <TableHead rowSpan={2} className="text-center min-w-[80px] border-r">Ply</TableHead>
                                    <TableHead rowSpan={2} className="text-center min-w-[150px] border-r">Type (K/V/M)</TableHead>
                                    <TableHead rowSpan={2} className="text-center min-w-[130px] border-r">Paper BF</TableHead>
                                    <TableHead rowSpan={2} className="text-center min-w-[100px] border-r">Waste %</TableHead>
                                    <TableHead colSpan={maxPly} className="text-center border-x font-bold text-black bg-orange-50/50">GSM Composition</TableHead>
                                    <TableHead rowSpan={2} className="text-center min-w-[90px] border-r bg-muted/20">T.GSM</TableHead>
                                    <TableHead rowSpan={2} className="text-center min-w-[100px] border-r bg-muted/20">Weight (g)</TableHead>
                                    <TableHead rowSpan={2} className="text-center min-w-[120px] border-r bg-primary/5 font-bold">Gross</TableHead>
                                    <TableHead rowSpan={2} className="text-center min-w-[120px] border-r bg-primary/5 font-bold">Transport</TableHead>
                                    <TableHead rowSpan={2} className="text-right min-w-[140px] pr-6 bg-primary/10 font-bold">Total NPR</TableHead>
                                    <TableHead rowSpan={2} className="w-20"></TableHead>
                                </TableRow>
                                <TableRow>
                                    <TableHead className="text-center border-l min-w-[110px] bg-blue-50/30">L</TableHead>
                                    <TableHead className="text-center min-w-[110px] bg-blue-50/30">B</TableHead>
                                    <TableHead className="text-center border-r min-w-[110px] bg-blue-50/30">H</TableHead>
                                    <TableHead className="text-center border-l min-w-[100px] bg-orange-50/30">Top</TableHead>
                                    <TableHead className="text-center min-w-[100px] bg-orange-50/30">F1</TableHead>
                                    {maxPly >= 5 && <TableHead className="text-center min-w-[100px] bg-orange-50/30">Mid1</TableHead>}
                                    {maxPly >= 5 && <TableHead className="text-center min-w-[100px] bg-orange-50/30">F2</TableHead>}
                                    {maxPly >= 7 && <TableHead className="text-center min-w-[100px] bg-orange-50/30">Mid2</TableHead>}
                                    {maxPly >= 7 && <TableHead className="text-center min-w-[100px] bg-orange-50/30">F3</TableHead>}
                                    {maxPly >= 9 && <TableHead className="text-center min-w-[100px] bg-orange-50/30">Mid3</TableHead>}
                                    {maxPly >= 9 && <TableHead className="text-center min-w-[100px] bg-orange-50/30">F4</TableHead>}
                                    <TableHead className="text-center border-r min-w-[100px] bg-orange-50/30">Bot</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {items.map((item, idx) => (
                                    <CostingTableRow 
                                        key={item.id} 
                                        item={item} 
                                        index={idx} 
                                        maxPly={maxPly} 
                                        products={companyProducts} 
                                        onItemChange={handleItemChange} 
                                        onAddAccessory={handleAddAccessory} 
                                        onRemoveItem={(id: string) => setItems(prev => prev.filter(i => i.id !== id))} 
                                        onTogglePrint={handleTogglePrint} 
                                        selectedForPrint={selectedForPrint}
                                        onAddProductQuickly={() => setIsProductDialogOpen(true)}
                                    />
                                ))}
                            </TableBody>
                        </Table>
                        <ScrollBar orientation="horizontal" />
                        <ScrollBar orientation="vertical" />
                    </div>
                </ScrollArea>
                <div className="p-6 bg-muted/10 border-t flex justify-end">
                    <div className="space-y-2 w-64">
                         {transportCostType === 'Per Consignment' && (
                            <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">Transport Charges</span>
                                <span>Rs. {(Number(transportCost) || 0).toLocaleString()}</span>
                            </div>
                        )}
                    </div>
                </div>
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
                                <TableHead className="w-12"></TableHead>
                                <TableHead>Product Name</TableHead>
                                <TableHead>Specs</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {companyProducts.map((p: any) => (
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
                    <ProductForm onSaveSuccess={(data: any) => { 
                        addProductService({...data, createdBy: user?.username}).then(() => {
                            setIsProductDialogOpen(false);
                            toast({ title: 'Product Added' });
                        }); 
                    }} />
                </div>
            </DialogContent>
        </Dialog>

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

export default function CostReportPage() {
    const [activeTab, setActiveTab] = useState("calculator");
    const [reportToEdit, setReportToEdit] = useState<CostReport | null>(null);
    const [productToEdit, setProductToEdit] = useState<Product | null>(null);
    const [isProductEditorOpen, setIsProductEditorOpen] = useState(false);
    const [isPreviewOpen, setIsPreviewOpen] = useState(false);
    const [previewData, setPreviewData] = useState<any>(null);
    const [products, setProducts] = useState<Product[]>([]);
    const [companyProfile, setCompanyProfile] = useState<CompanyProfile>(DEFAULT_COMPANY_PROFILE);
    const { user } = useAuth();
    const { toast } = useToast();

    useEffect(() => {
        const unsubProducts = onProductsUpdate(setProducts);
        const unsubProfile = onSettingUpdate('companyProfile', (s) => setCompanyProfile(s?.value || DEFAULT_COMPANY_PROFILE));
        return () => {
            unsubProducts();
            unsubProfile();
        };
    }, []);

    const handleProductEdit = (product: Product) => {
        setProductToEdit(product);
        setIsProductEditorOpen(true);
    };

    const handleDeleteProduct = async (id: string) => {
        try {
            await deleteProduct(id);
            toast({ title: 'Product Deleted' });
        } catch {
            toast({ title: 'Error', variant: 'destructive' });
        }
    };

    const handlePreviewFromList = (report: CostReport) => {
        const kCosts = report.kraftPaperCosts || {};
        const vCost = report.virginPaperCost || 0;
        const cCost = report.conversionCost || 0;
        const aCCost = report.accessoryConversionCost || 0;
        const tCost = report.transportCost || 0;
        const tType = report.transportCostType || 'Per Consignment';
        
        const calc = (item: any, isAcc = false) => {
            const l = parseFloat(item.l) || 0, b = parseFloat(item.b) || 0, h = parseFloat(item.h) || 0, pcs = parseInt(item.noOfPcs, 10) || 1;
            const isBox = h > 0;
            let sL = 0, sB = 0;
            if (isBox) {
                const c1 = b + h + 20, d1 = (2 * l) + (2 * b) + 62, c2 = l + h + 20, d2 = (2 * b) + (2 * l) + 62;
                if (c1 * d1 <= c2 * d2) { sL = c1; sB = d1; } else { sL = c2; sB = d2; }
            } else { const d = [l, b].sort((x, y) => y - x); sL = d[0]; sB = d[1]; }
            const ply = parseInt(item.ply, 10) || 0;
            const g = { l1: parseFloat(item.topGsm) || 0, f1: parseFloat(item.flute1Gsm) || 0, l2: parseFloat(item.middleGsm) || 0, f2: parseFloat(item.flute2Gsm) || 0, l3: parseFloat(item.liner2Gsm) || 0, f3: parseFloat(item.flute3Gsm) || 0, l4: parseFloat(item.liner3Gsm) || 0, f4: parseFloat(item.flute4Gsm) || 0, l5: parseFloat(item.bottomGsm) || 0 };
            let tGsm = 0; const factor = 1.35;
            if (ply === 3) tGsm = g.l1 + (g.f1 * factor) + g.l5;
            else if (ply === 5) tGsm = g.l1 + (g.f1 * factor) + g.l2 + (g.f2 * factor) + g.l5;
            else if (ply === 7) tGsm = g.l1 + (g.f1 * factor) + g.l2 + (g.f2 * factor) + g.l3 + (g.f3 * factor) + g.l5;
            else if (ply === 9) tGsm = g.l1 + (g.f1 * factor) + g.l2 + (g.f2 * factor) + g.l3 + (g.f3 * factor) + g.l4 + (g.f4 * factor) + g.l5;
            else tGsm = g.l1 + g.l5;
            const sArea = (sL * sB) / 1000000;
            const pWt = sArea * tGsm * pcs;
            const tBWt = pWt * (1 + (parseFloat(item.wastagePercent) / 100 || 0));
            let pRate = item.paperType === 'VIRGIN' ? vCost : (kCosts[normalizeBF(item.paperBf)] || 0);
            const finalRate = pRate + (isAcc ? aCCost : cCost);
            let paperCost = (tBWt / 1000) * finalRate;
            let tAmount = 0;
            if (tType === 'Per Piece' && !isAcc) {
                tAmount = tCost * pcs;
            }
            return { paperCost: paperCost, transportCost: tAmount };
        };

        const itemsWithCost = report.items.map((item: any) => {
            const calculated = calc(item);
            const accessories = (item.accessories || []).map((acc: any) => ({
                ...acc,
                calculated: calc(acc, true)
            }));
            return {
                ...item,
                accessories,
                totalItemCost: (calculated.paperCost || 0) + (calculated.transportCost || 0) + accessories.reduce((sum: number, a: any) => sum + (a.calculated?.paperCost || 0), 0)
            };
        });

        setPreviewData({
            reportNumber: report.reportNumber,
            reportDate: new Date(report.reportDate),
            party: { id: report.partyId, name: report.partyName },
            items: itemsWithCost,
            termsAndConditions: report.termsAndConditions || [],
            transportCost: report.transportCost || 0,
            transportCostType: report.transportCostType || 'Per Consignment'
        });
        setIsPreviewOpen(true);
    };

    const handleDeleteReport = async (id: string) => {
        try {
            await deleteCostReport(id);
            toast({ title: 'Report Deleted' });
        } catch {
            toast({ title: 'Error', description: 'Failed to delete report.', variant: 'destructive' });
        }
    };

    return (
        <div className="flex flex-col gap-8">
            <header>
                <h1 className="text-3xl font-bold tracking-tight">Cost Report Generator</h1>
                <p className="text-muted-foreground">Estimate product manufacturing costs and generate quotations.</p>
            </header>
            <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="mb-4">
                    <TabsTrigger value="calculator">Calculator</TabsTrigger>
                    <TabsTrigger value="saved">Saved Reports History</TabsTrigger>
                    <TabsTrigger value="products">Product Catalog</TabsTrigger>
                </TabsList>
                <TabsContent value="calculator" className="pt-0">
                    <CostReportCalculator 
                        reportToEdit={reportToEdit} 
                        products={products} 
                        companyProfile={companyProfile}
                        onSaveSuccess={() => { setReportToEdit(null); setActiveTab("saved"); }} 
                        onPreview={(data: any) => { setPreviewData(data); setIsPreviewOpen(true); }}
                    />
                </TabsContent>
                <TabsContent value="saved" className="pt-0">
                    <SavedReportsList 
                        onEdit={(r: any) => { setReportToEdit(r); setActiveTab("calculator"); }} 
                        onPreview={handlePreviewFromList}
                        onDelete={handleDeleteReport}
                    />
                </TabsContent>
                <TabsContent value="products" className="pt-0">
                    <ProductsList products={products} onEdit={handleProductEdit} onDelete={handleDeleteProduct} />
                </TabsContent>
            </Tabs>

            <Dialog open={isProductEditorOpen} onOpenChange={isProductEditorOpen ? () => setIsProductEditorOpen(false) : undefined}>
                <DialogContent className="sm:max-w-5xl max-h-[95vh] flex flex-col p-0">
                    <DialogHeader className="p-6 pb-0">
                        <DialogTitle>Edit Product Record</DialogTitle>
                        <DialogDescription>Update the technical specifications for this product.</DialogDescription>
                    </DialogHeader>
                    <div className="flex-1 overflow-y-auto px-6 pb-6">
                        <ProductForm 
                            productToEdit={productToEdit} 
                            onSaveSuccess={(data: any) => {
                                if (productToEdit) {
                                    updateProduct(productToEdit.id, { ...data, lastModifiedBy: user?.username }).then(() => {
                                        setIsProductEditorOpen(false);
                                        setProductToEdit(null);
                                        toast({ title: 'Product Updated' });
                                    });
                                }
                            }} 
                        />
                    </div>
                </DialogContent>
            </Dialog>

            <React.Suspense fallback={<Loader2 className="animate-spin" />}>
                <QuotationPreviewDialog 
                    isOpen={isPreviewOpen} 
                    onOpenChange={setIsPreviewOpen} 
                    reportNumber={previewData?.reportNumber || ''}
                    reportDate={previewData?.reportDate || new Date()}
                    party={previewData?.party}
                    items={previewData?.items || []}
                    products={products}
                    termsAndConditions={previewData?.termsAndConditions}
                    companyProfile={companyProfile}
                    transportCost={previewData?.transportCost}
                    transportCostType={previewData?.transportCostType}
                />
            </React.Suspense>
        </div>
  );
}
