'use client';

/**
 * QC tolerances per customer: how far a reading may differ from the spec
 * before the test report marks it Low / High. Each customer sets only what
 * applies to them; a blank cell uses the Default row, "NA" means that
 * parameter is never judged automatically for that customer.
 */
import { useEffect, useMemo, useState } from 'react';
import { Loader2, Save, Ruler, Search } from 'lucide-react';
import type { Product } from '@/lib/types';
import { onProductsUpdate } from '@/services/product-service';
import { onQcTolerancesUpdate, saveQcTolerance, DEFAULT_TOLERANCE_ID, type QcToleranceDoc } from '@/services/qc-tolerance-service';
import { TOLERANCE_PARAMETERS, BUILT_IN_TOLERANCES, type ToleranceValues } from '@/lib/qc-check';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

type Draft = Record<string, string>; // per parameter: '' | 'NA' | number text

const toDraft = (v?: ToleranceValues): Draft =>
    Object.fromEntries(TOLERANCE_PARAMETERS.map(p => {
        const x = v?.[p.key];
        return [p.key, x === undefined ? '' : x === null ? 'NA' : String(x)];
    }));

const fromDraft = (d: Draft): { values: ToleranceValues; error?: string } => {
    const values: ToleranceValues = {};
    for (const p of TOLERANCE_PARAMETERS) {
        const raw = (d[p.key] || '').trim();
        if (!raw) continue;
        if (/^n\/?a$/i.test(raw) || raw === '-') { values[p.key] = null; continue; }
        const n = Number(raw.replace(/[±+\s]|mm|%/gi, ''));
        if (!Number.isFinite(n) || n < 0) return { values, error: `${p.label}: "${raw}" is not a number (use a number, NA, or leave blank).` };
        values[p.key] = n;
    }
    return { values };
};

export default function QcTolerancesPage() {
    const { user, hasPermission } = useAuth();
    const { toast } = useToast();
    const [products, setProducts] = useState<Product[]>([]);
    const [docs, setDocs] = useState<QcToleranceDoc[] | null>(null);
    const [drafts, setDrafts] = useState<Record<string, Draft>>({});
    const [search, setSearch] = useState('');
    const canEdit = hasPermission('reports', 'edit') || hasPermission('reports', 'create');

    useEffect(() => onProductsUpdate(setProducts), []);
    useEffect(() => onQcTolerancesUpdate(setDocs), []);

    // One row per customer that has products in the catalog, plus any
    // customer that already has tolerances saved.
    const rows = useMemo(() => {
        const byId = new Map<string, string>();
        for (const p of products) if (p.partyId) byId.set(p.partyId, p.partyName || p.partyId);
        for (const d of docs || []) if (d.id !== DEFAULT_TOLERANCE_ID) byId.set(d.id, d.partyName || byId.get(d.id) || d.id);
        const list = [...byId.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
        const q = search.trim().toLowerCase();
        return [{ id: DEFAULT_TOLERANCE_ID, name: 'Default (all other customers)' }, ...list.filter(r => !q || r.name.toLowerCase().includes(q))];
    }, [products, docs, search]);

    const saved = useMemo(() => new Map((docs || []).map(d => [d.id, d])), [docs]);
    const draftOf = (id: string) => drafts[id] ?? toDraft(saved.get(id)?.values);
    const isDirty = (id: string) => drafts[id] !== undefined && JSON.stringify(drafts[id]) !== JSON.stringify(toDraft(saved.get(id)?.values));

    const save = (id: string, name: string) => {
        const { values, error } = fromDraft(draftOf(id));
        if (error) { toast({ title: 'Check the values', description: error, variant: 'destructive' }); return; }
        saveQcTolerance(id, id === DEFAULT_TOLERANCE_ID ? 'Default' : name, values, user?.username);
        setDrafts(prev => { const n = { ...prev }; delete n[id]; return n; });
        toast({ title: 'Tolerances saved', description: name });
    };

    if (docs === null) return <div className="p-12 flex justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

    return (
        <div className="max-w-6xl mx-auto space-y-6 pb-16">
            <header>
                <h1 className="text-2xl sm:text-3xl font-black tracking-tight uppercase flex items-center gap-2"><Ruler className="h-6 w-6 text-primary" /> QC Tolerances</h1>
                <p className="text-muted-foreground text-sm mt-1">
                    How far a reading may be from the specification before the test report marks it Low / High. Set only what applies to each customer.
                </p>
            </header>

            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-sm">How to fill</CardTitle>
                    <CardDescription className="text-xs space-y-1">
                        <span className="block"><b>Number</b> = ± that much (mm for sizes, % for GSM and weight). Example: Unilever box size 2, Antarctic 10.</span>
                        <span className="block"><b>Blank</b> = use the Default row. <b>NA</b> = not checked for that customer (you set OK / Low / High yourself).</span>
                        <span className="block">Moisture is judged against its range and Load as a minimum, so they need no tolerance.</span>
                    </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="px-4 pb-3">
                        <div className="relative max-w-xs">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search customer..." className="pl-8 h-9" />
                        </div>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-muted/40 text-[0.625rem] uppercase tracking-wider text-muted-foreground">
                                <tr>
                                    <th className="p-2 text-left min-w-[12rem]">Customer</th>
                                    {TOLERANCE_PARAMETERS.map(p => <th key={p.key} className="p-2 text-left whitespace-nowrap">{p.label} (± {p.unit})</th>)}
                                    <th className="p-2" />
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map(r => {
                                    const d = draftOf(r.id);
                                    const isDefault = r.id === DEFAULT_TOLERANCE_ID;
                                    return (
                                        <tr key={r.id} className={cn('border-t', isDefault && 'bg-muted/20')}>
                                            <td className="p-2 font-bold">{r.name}</td>
                                            {TOLERANCE_PARAMETERS.map(p => (
                                                <td key={p.key} className="p-2">
                                                    <Input
                                                        value={d[p.key]}
                                                        disabled={!canEdit}
                                                        onChange={e => setDrafts(prev => ({ ...prev, [r.id]: { ...draftOf(r.id), [p.key]: e.target.value } }))}
                                                        placeholder={isDefault ? String(BUILT_IN_TOLERANCES[p.key] ?? '') : 'default'}
                                                        className="h-9 w-24"
                                                    />
                                                </td>
                                            ))}
                                            <td className="p-2">
                                                <Button size="sm" variant={isDirty(r.id) ? 'default' : 'outline'} disabled={!canEdit || !isDirty(r.id)} onClick={() => save(r.id, r.name)}>
                                                    <Save className="h-3.5 w-3.5 mr-1" /> Save
                                                </Button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
