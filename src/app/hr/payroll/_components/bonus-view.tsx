'use client';

import { useState, useEffect, useCallback } from 'react';
import type { AnnualBonusSummary, BonusLedgerEntry } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Loader2, ShieldCheck } from 'lucide-react';
import { getFirebase } from '@/lib/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { getEmployees } from '@/services/employee-service';

const customEmployeeOrder = [
    "Tika Gurung", "Anju Bista", "Madhu Bhandari", "Amrita Lama", "sunil chaudhary",
    "KUMAR SHRESTHA", "Niroj Koirala", "Binod Magar", "SANDEEP CHAUDARY",
    "SANGITA PYAKUREL", "Sunita Gurung"
];

function sortByCustomOrder<T extends { employeeName: string }>(items: T[]): T[] {
    return [...items].sort((a, b) => {
        const indexA = customEmployeeOrder.indexOf(a.employeeName);
        const indexB = customEmployeeOrder.indexOf(b.employeeName);
        if (indexA !== -1 && indexB !== -1) return indexA - indexB;
        if (indexA !== -1) return -1;
        if (indexB !== -1) return 1;
        return a.employeeName.localeCompare(b.employeeName);
    });
}

interface BonusViewProps {
    selectedBsYear: string;
    selectedBsMonth: string;
}

export default function BonusView({ selectedBsYear, selectedBsMonth }: BonusViewProps) {
    const [isLoading, setIsLoading] = useState(true);
    const [monthlyLedger, setMonthlyLedger] = useState<BonusLedgerEntry[]>([]);
    const [annualSummary, setAnnualSummary] = useState<AnnualBonusSummary[]>([]);

    const fetchBonusData = useCallback(async (year: number, month: number) => {
        setIsLoading(true);
        const { db } = getFirebase();
        try {
            const [ledgerSnap, summarySnap, currentEmployees] = await Promise.all([
                getDocs(query(
                    collection(db, 'bonus_ledger'),
                    where('bsYear', '==', year),
                    where('bsMonth', '==', month)
                )),
                // AnnualBonusSummary is a running cumulative total, not period-scoped,
                // so it's fetched in full rather than filtered by bsYear/bsMonth.
                getDocs(collection(db, 'bonus_summaries')),
                getEmployees(),
            ]);

            // Cross-filter against real employee IDs/names to strip out any
            // orphaned garbage documents left behind by earlier bad imports
            // (e.g. from parsing the wrong sheet before the sheet-name fix).
            const validIds = new Set(currentEmployees.map(e => e.id));
            const validNames = new Set(currentEmployees.map(e => e.name.toLowerCase().trim()));
            const isGenuine = (id: string, name: string) =>
                validIds.has(id) && validNames.has((name || '').toLowerCase().trim());

            setMonthlyLedger(sortByCustomOrder(
                ledgerSnap.docs
                    .map(d => ({ id: d.id, ...d.data() } as BonusLedgerEntry))
                    .filter(e => isGenuine(e.employeeId, e.employeeName))
            ));
            setAnnualSummary(sortByCustomOrder(
                summarySnap.docs
                    .map(d => ({ id: d.id, ...d.data() } as AnnualBonusSummary))
                    .filter(s => isGenuine(s.id, s.employeeName))
            ));
        } catch (e) {
            console.error('Bonus ledger fetch failed', e);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!selectedBsYear || selectedBsMonth === '') return;
        fetchBonusData(parseInt(selectedBsYear, 10), parseInt(selectedBsMonth, 10));
    }, [selectedBsYear, selectedBsMonth, fetchBonusData]);

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-1 shadow-sm h-fit">
                <CardHeader className="py-4 border-b bg-muted/5">
                    <CardTitle className="text-xs uppercase font-black tracking-widest">Annual Bonus Summary</CardTitle>
                    <CardDescription className="text-[10px] uppercase font-bold text-muted-foreground">
                        Cumulative running total from master ledger.
                    </CardDescription>
                </CardHeader>
                <CardContent className="p-0 divide-y">
                    {annualSummary.length > 0 ? annualSummary.map(s => (
                        <div key={`summary-${s.id}`} className="p-4 space-y-1">
                            <div className="flex justify-between items-baseline">
                                <span className="font-black text-[11px] text-gray-900 uppercase tracking-tighter">{s.employeeName}</span>
                                <span className="font-black text-sm text-emerald-700">Rs. {s.accruedYTD?.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                            </div>
                            <p className="text-[10px] text-muted-foreground">
                                Eligible {s.eligibleMonths}/{s.monthsWorked} months &middot; Avg. Attendance {s.avgAttendancePct?.toFixed(1)}%
                            </p>
                        </div>
                    )) : (
                        <div className="text-center py-16 text-muted-foreground italic text-xs">
                            {isLoading ? <Loader2 className="h-5 w-5 animate-spin mx-auto" /> : 'No annual bonus summary imported yet.'}
                        </div>
                    )}
                </CardContent>
            </Card>

            <Card className="lg:col-span-2 shadow-sm border-gray-100 bg-white overflow-hidden">
                <CardHeader className="py-4 border-b bg-muted/5 flex flex-row items-center justify-between">
                    <div>
                        <CardTitle className="text-xs uppercase font-black tracking-widest">Monthly Bonus Ledger</CardTitle>
                        <CardDescription className="text-[10px] uppercase font-bold text-muted-foreground">
                            Accruals for the selected period, from master ledger.
                        </CardDescription>
                    </div>
                    <Badge variant="outline" className="bg-white px-3 font-black text-[9px] uppercase tracking-tighter text-blue-600 border-blue-200">
                        <ShieldCheck className="mr-1 h-3 w-3" /> Cloud Verified
                    </Badge>
                </CardHeader>
                <CardContent className="p-0">
                    <Table className="text-xs">
                        <TableHeader className="bg-muted/30">
                            <TableRow className="h-10 hover:bg-transparent">
                                <TableHead className="pl-6 font-bold uppercase">Employee Name</TableHead>
                                <TableHead className="text-center font-bold uppercase">Basis</TableHead>
                                <TableHead className="text-center font-bold uppercase">Attendance %</TableHead>
                                <TableHead className="text-center font-bold uppercase">Eligible</TableHead>
                                <TableHead className="text-right font-bold uppercase">Accrual</TableHead>
                                <TableHead className="pr-6 font-bold uppercase">Note</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableRow><TableCell colSpan={6} className="h-40 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto opacity-30" /></TableCell></TableRow>
                            ) : monthlyLedger.length > 0 ? monthlyLedger.map(item => (
                                <TableRow key={item.id} className="h-12 border-b hover:bg-muted/10 transition-colors">
                                    <TableCell className="pl-6 font-black text-gray-900 uppercase tracking-tight">{item.employeeName}</TableCell>
                                    <TableCell className="text-center">{item.basis}</TableCell>
                                    <TableCell className="text-center font-bold tabular-nums text-blue-900">{item.attendancePct?.toFixed(1)}%</TableCell>
                                    <TableCell className="text-center">
                                        {item.isEligible ?
                                            <Badge variant="outline" className="text-green-600 border-green-600 font-black uppercase text-[8px] h-4">YES</Badge> :
                                            <Badge variant="outline" className="text-red-400 border-red-100 font-black uppercase text-[8px] h-4">NO</Badge>
                                        }
                                    </TableCell>
                                    <TableCell className="text-right font-black text-gray-900 tabular-nums">
                                        {item.isEligible ? `Rs. ${item.accrual?.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '—'}
                                    </TableCell>
                                    <TableCell className="pr-6 text-[10px] text-muted-foreground italic truncate max-w-[220px]">{item.note}</TableCell>
                                </TableRow>
                            )) : (
                                <TableRow><TableCell colSpan={6} className="h-40 text-center text-muted-foreground italic">No bonus ledger entries found for this period.</TableCell></TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}
