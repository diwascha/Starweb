'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TableEmptyState } from '@/components/ui/table-empty-state';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Upload, FileSpreadsheet, Loader2, AlertTriangle, CheckCircle2, Truck, Users } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { onVehiclesUpdate, addVehicle } from '@/services/vehicle-service';
import { onPartiesUpdate, addParty } from '@/services/party-service';
import { onTransactionsUpdate } from '@/services/transaction-service';
import type { Vehicle, Party, Transaction } from '@/lib/types';
import {
    parsePartyTypeMap,
    parseTripSheet,
    candidateSignature,
    commitTripSheetImport,
    type TripSheetCandidate,
    type ResolvedCandidate,
} from '@/services/fleet/trip-sheet-import';
import { toNepaliDate } from '@/lib/utils';

type PreviewStatus = 'new' | 'duplicate' | 'new-vehicle';

interface PreviewRow extends TripSheetCandidate {
    status: PreviewStatus;
}

export default function FleetImportPage() {
    const { user } = useAuth();
    const { toast } = useToast();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [parties, setParties] = useState<Party[]>([]);
    const [transactions, setTransactions] = useState<Transaction[]>([]);

    const [isParsing, setIsParsing] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const [fileName, setFileName] = useState<string | null>(null);
    const [candidates, setCandidates] = useState<TripSheetCandidate[]>([]);
    const [warnings, setWarnings] = useState<string[]>([]);
    const [importResult, setImportResult] = useState<{ created: number; skipped: number } | null>(null);

    useEffect(() => {
        const unsubV = onVehiclesUpdate(setVehicles);
        const unsubP = onPartiesUpdate(setParties);
        const unsubT = onTransactionsUpdate(setTransactions);
        return () => { unsubV(); unsubP(); unsubT(); };
    }, []);

    const vehicleMap = useMemo(() => new Map(vehicles.map(v => [v.name.trim().toLowerCase(), v.id])), [vehicles]);
    const partyMap = useMemo(() => new Map(parties.map(p => [p.name.trim().toLowerCase(), p.id])), [parties]);

    const existingSignatures = useMemo(() => {
        const set = new Set<string>();
        for (const t of transactions) {
            if (!t.vehicleId) continue;
            set.add(candidateSignature(t.vehicleId, t.date, t.category || '', t.amount));
        }
        return set;
    }, [transactions]);

    const previewRows = useMemo<PreviewRow[]>(() => {
        return candidates.map(c => {
            const vehicleId = vehicleMap.get(c.vehicleText.toLowerCase());
            if (!vehicleId) return { ...c, status: 'new-vehicle' as const };
            const signature = candidateSignature(vehicleId, c.dateIso, c.category, c.amount);
            return { ...c, status: existingSignatures.has(signature) ? 'duplicate' as const : 'new' as const };
        });
    }, [candidates, vehicleMap, existingSignatures]);

    const missingVehicles = useMemo(() => {
        const names = new Set<string>();
        for (const c of candidates) if (!vehicleMap.has(c.vehicleText.toLowerCase())) names.add(c.vehicleText);
        return Array.from(names);
    }, [candidates, vehicleMap]);

    const missingParties = useMemo(() => {
        const names = new Set<string>();
        for (const c of candidates) if (c.partyName && !partyMap.has(c.partyName.toLowerCase())) names.add(c.partyName);
        return Array.from(names);
    }, [candidates, partyMap]);

    const summary = useMemo(() => {
        const toImport = previewRows.filter(r => r.status !== 'duplicate');
        const duplicates = previewRows.filter(r => r.status === 'duplicate');
        const totalAmount = toImport.reduce((s, r) => s + r.amount, 0);
        return { toImportCount: toImport.length, duplicateCount: duplicates.length, totalAmount };
    }, [previewRows]);

    const resetImport = () => {
        setFileName(null);
        setCandidates([]);
        setWarnings([]);
        setImportResult(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setIsParsing(true);
        setImportResult(null);
        try {
            const XLSX = await import('xlsx');
            const buffer = await file.arrayBuffer();
            const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });

            const tripSheetName = workbook.SheetNames.find(n => n.trim().toLowerCase().includes('trip sheet'));
            if (!tripSheetName) {
                toast({ title: 'No Trip Sheet found', description: 'This file has no tab named "Trip Sheet".', variant: 'destructive' });
                setIsParsing(false);
                return;
            }
            const setupSheetName = workbook.SheetNames.find(n => n.trim().toLowerCase() === 'setup');

            const tripGrid = XLSX.utils.sheet_to_json<any[]>(workbook.Sheets[tripSheetName], { header: 1, defval: null });
            const setupGrid = setupSheetName ? XLSX.utils.sheet_to_json<any[]>(workbook.Sheets[setupSheetName], { header: 1, defval: null }) : null;

            const partyTypeMap = parsePartyTypeMap(setupGrid);
            const { candidates: parsed, warnings: parseWarnings } = parseTripSheet(tripGrid, partyTypeMap);

            setFileName(file.name);
            setCandidates(parsed);
            setWarnings(parseWarnings);

            if (parsed.length === 0) {
                toast({ title: 'Nothing to import', description: 'No trip rows with an amount were found.', variant: 'destructive' });
            }
        } catch (error: any) {
            toast({ title: 'Could not read file', description: error.message, variant: 'destructive' });
        } finally {
            setIsParsing(false);
        }
    };

    const handleConfirmImport = async () => {
        if (!user) return;
        setIsImporting(true);
        try {
            // 1. Create any vehicles/parties this file references but the app doesn't have yet.
            const localVehicleMap = new Map(vehicleMap);
            for (const name of missingVehicles) {
                const id = await addVehicle({
                    name,
                    make: 'Imported', model: 'Imported', year: new Date().getFullYear(), vin: '',
                    status: 'Active', ownership: 'Sijan', createdBy: user.username, createdAt: new Date().toISOString(),
                });
                localVehicleMap.set(name.toLowerCase(), id);
            }
            const localPartyMap = new Map(partyMap);
            for (const name of missingParties) {
                const id = await addParty({ name, type: 'Vendor', ownership: 'Sijan', createdBy: user.username });
                localPartyMap.set(name.toLowerCase(), id);
            }

            // 2. Resolve every candidate to its final vehicleId/partyId now that
            // anything missing has been created.
            const resolved: ResolvedCandidate[] = candidates.map(c => ({
                ...c,
                vehicleId: localVehicleMap.get(c.vehicleText.toLowerCase())!,
                partyId: c.partyName ? localPartyMap.get(c.partyName.toLowerCase()) : undefined,
            }));

            const result = await commitTripSheetImport(resolved, existingSignatures, user.username);
            setImportResult(result);
            toast({ title: 'Import complete', description: `${result.created} record(s) created, ${result.skipped} already on record and skipped.` });
        } catch (error: any) {
            toast({ title: 'Import failed', description: error.message, variant: 'destructive' });
        } finally {
            setIsImporting(false);
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-black tracking-tight flex items-center gap-2"><FileSpreadsheet className="h-6 w-6 text-primary" /> Import Fleet Data from Excel</h1>
                <p className="text-sm text-muted-foreground">Upload the monthly "Trip Sheet" workbook to bring freight income, advances, transport and party expenses straight into the ledger - no manual re-entry.</p>
            </div>

            <Card>
                <CardContent className="pt-6">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                        <input ref={fileInputRef} type="file" accept=".xlsx,.xlsm,.xls" onChange={handleFileUpload} className="hidden" id="fleet-import-file" />
                        <Button asChild variant="outline" className="h-10">
                            <label htmlFor="fleet-import-file" className="cursor-pointer flex items-center gap-2">
                                {isParsing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                                {fileName ? 'Choose a different file' : 'Choose Excel file (.xlsx / .xlsm)'}
                            </label>
                        </Button>
                        {fileName && <span className="text-sm text-muted-foreground">{fileName} - {candidates.length} line(s) found</span>}
                    </div>
                </CardContent>
            </Card>

            {warnings.length > 0 && (
                <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Some rows need attention</AlertTitle>
                    <AlertDescription>
                        <ul className="list-disc pl-4 mt-1 space-y-0.5">
                            {warnings.slice(0, 10).map((w, i) => <li key={i}>{w}</li>)}
                        </ul>
                    </AlertDescription>
                </Alert>
            )}

            {candidates.length > 0 && !importResult && (
                <>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        <Card><CardHeader className="pb-2"><CardDescription>Will Import</CardDescription><CardTitle className="text-2xl text-emerald-600">{summary.toImportCount}</CardTitle></CardHeader></Card>
                        <Card><CardHeader className="pb-2"><CardDescription>Already Recorded</CardDescription><CardTitle className="text-2xl text-muted-foreground">{summary.duplicateCount}</CardTitle></CardHeader></Card>
                        <Card><CardHeader className="pb-2"><CardDescription className="flex items-center gap-1"><Truck className="h-3.5 w-3.5" /> New Trucks</CardDescription><CardTitle className="text-2xl">{missingVehicles.length}</CardTitle></CardHeader></Card>
                        <Card><CardHeader className="pb-2"><CardDescription className="flex items-center gap-1"><Users className="h-3.5 w-3.5" /> New Parties</CardDescription><CardTitle className="text-2xl">{missingParties.length}</CardTitle></CardHeader></Card>
                    </div>

                    {(missingVehicles.length > 0 || missingParties.length > 0) && (
                        <Alert>
                            <AlertTriangle className="h-4 w-4" />
                            <AlertTitle>New records will be created</AlertTitle>
                            <AlertDescription className="space-y-1">
                                {missingVehicles.length > 0 && <p><strong>Trucks:</strong> {missingVehicles.join(', ')}</p>}
                                {missingParties.length > 0 && <p><strong>Parties:</strong> {missingParties.join(', ')}</p>}
                                <p className="text-xs">These are created with minimal defaults - edit their details afterward in Vehicles &amp; Drivers / Companies.</p>
                            </AlertDescription>
                        </Alert>
                    )}

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">Preview</CardTitle>
                            <CardDescription>Nothing is written until you confirm. Rows already on record (matching truck, date, category and amount) are skipped automatically.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="max-h-[500px] overflow-auto rounded-md border">
                                <Table>
                                    <TableHeader className="sticky top-0 bg-background">
                                        <TableRow>
                                            <TableHead>Date</TableHead>
                                            <TableHead>Truck</TableHead>
                                            <TableHead>Type</TableHead>
                                            <TableHead>Category</TableHead>
                                            <TableHead className="text-right">Amount</TableHead>
                                            <TableHead>Status</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {previewRows.length === 0 && <TableEmptyState colSpan={6} message="No rows parsed." />}
                                        {previewRows.map((r, i) => (
                                            <TableRow key={i}>
                                                <TableCell className="text-xs whitespace-nowrap">{toNepaliDate(r.dateIso)}</TableCell>
                                                <TableCell className="text-xs">{r.vehicleText}</TableCell>
                                                <TableCell className="text-xs">{r.kind}</TableCell>
                                                <TableCell className="text-xs">{r.category}{r.partyName ? ` - ${r.partyName}` : ''}</TableCell>
                                                <TableCell className="text-right text-xs tabular-nums">Rs. {r.amount.toLocaleString()}</TableCell>
                                                <TableCell>
                                                    {r.status === 'duplicate' && <Badge variant="outline" className="text-[9px]">Already Recorded</Badge>}
                                                    {r.status === 'new' && <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[9px]">New</Badge>}
                                                    {r.status === 'new-vehicle' && <Badge className="bg-amber-50 text-amber-700 border-amber-200 text-[9px]">New Truck</Badge>}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        </CardContent>
                        <CardFooter className="flex justify-between items-center">
                            <span className="text-sm text-muted-foreground">Total value to import: <strong>Rs. {summary.totalAmount.toLocaleString()}</strong></span>
                            <div className="flex gap-2">
                                <Button variant="outline" onClick={resetImport} disabled={isImporting}>Cancel</Button>
                                <Button onClick={handleConfirmImport} disabled={isImporting || summary.toImportCount === 0}>
                                    {isImporting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Importing...</> : `Import ${summary.toImportCount} Record(s)`}
                                </Button>
                            </div>
                        </CardFooter>
                    </Card>
                </>
            )}

            {importResult && (
                <Alert className="border-emerald-200 bg-emerald-50">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    <AlertTitle className="text-emerald-800">Import complete</AlertTitle>
                    <AlertDescription className="text-emerald-700">
                        {importResult.created} record(s) created, {importResult.skipped} already on record and skipped.
                        Check the Truck P&amp;L and Expense History pages to see the results, or <button className="underline font-semibold" onClick={resetImport}>import another file</button>.
                    </AlertDescription>
                </Alert>
            )}
        </div>
    );
}
