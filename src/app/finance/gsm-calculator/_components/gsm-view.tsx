'use client';

import { useState, useEffect } from 'react';
import type { GsmReport, CompanyProfile } from '@/lib/types';
import { toNepaliDate, toWords } from '@/lib/utils';
import { format } from 'date-fns';
import { onSettingUpdate } from '@/services/settings-service';
import { DEFAULT_COMPANY_PROFILE } from '@/lib/constants';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export function GsmReportView({ report }: { report: GsmReport }) {
    const [companyProfile, setCompanyProfile] = useState<CompanyProfile>(DEFAULT_COMPANY_PROFILE);

    useEffect(() => {
        const unsub = onSettingUpdate('companyProfile', (s) => setCompanyProfile(s?.value || DEFAULT_COMPANY_PROFILE));
        return () => unsub();
    }, []);

    return (
        <div className="gsm-voucher bg-white text-black p-12 font-sans border-2 border-neutral-900 mx-auto" style={{ width: '210mm', minHeight: '297mm' }}>
            <header className="text-center space-y-1 mb-8 border-b-2 border-neutral-900 pb-4">
                <h1 className="text-2xl font-black uppercase tracking-tight">{companyProfile.nameEn}</h1>
                <p className="text-sm font-bold">{companyProfile.address}</p>
                <h2 className="text-lg font-black underline mt-4 uppercase tracking-[0.2em]">GSM QUALITY VERIFICATION REPORT</h2>
            </header>

            <div className="grid grid-cols-2 gap-x-12 gap-y-4 text-sm mb-10">
                <div className="space-y-2">
                    <p><span className="font-bold uppercase text-[10px] text-neutral-400 block">Report No:</span> <span className="font-black text-lg">{report.voucherNo}</span></p>
                    <p><span className="font-bold uppercase text-[10px] text-neutral-400 block">Supplier:</span> <span className="font-black text-base">{report.vendorName}</span></p>
                </div>
                <div className="text-right space-y-2">
                    <p><span className="font-bold uppercase text-[10px] text-neutral-400 block">Date (BS):</span> <span className="font-black">{toNepaliDate(report.date)}</span></p>
                    <p><span className="font-bold uppercase text-[10px] text-neutral-400 block">Date (AD):</span> <span className="text-muted-foreground">{format(new Date(report.date), 'PP')}</span></p>
                </div>
            </div>

            <Table className="border-2 border-neutral-900 mb-10">
                <TableHeader className="bg-neutral-100 border-b-2 border-neutral-900">
                    <TableRow className="hover:bg-transparent">
                        <TableHead className="text-black font-black uppercase text-[10px] h-10 border-r border-neutral-300">S.N.</TableHead>
                        <TableHead className="text-black font-black uppercase text-[10px] h-10 border-r border-neutral-300">Reel / Batch ID</TableHead>
                        <TableHead className="text-black font-black uppercase text-[10px] h-10 text-center border-r border-neutral-300">Weight (g)</TableHead>
                        <TableHead className="text-black font-black uppercase text-[10px] h-10 text-center border-r border-neutral-300">Size (mm/in)</TableHead>
                        <TableHead className="text-black font-black uppercase text-[10px] h-10 text-right">Result (GSM)</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {(report.entries || []).map((e, i) => (
                        <TableRow key={e.id} className="h-10 hover:bg-transparent border-b border-neutral-200">
                            <TableCell className="border-r border-neutral-200 text-center">{i + 1}</TableCell>
                            <TableCell className="border-r border-neutral-200 font-bold uppercase">{e.reelNumber || 'N/A'}</TableCell>
                            <TableCell className="border-r border-neutral-200 text-center tabular-nums">{e.weight}</TableCell>
                            <TableCell className="border-r border-neutral-200 text-center">{e.length} x {e.width} {e.unit}</TableCell>
                            <TableCell className="text-right font-black tabular-nums">{e.gsm.toFixed(2)}</TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10 pt-6">
                <div className="p-4 rounded-xl bg-neutral-50 border border-neutral-200">
                    <h3 className="text-[10px] font-black uppercase text-neutral-400 tracking-[0.2em] mb-2">Technical Standards</h3>
                    <p className="text-[11px] leading-relaxed italic text-neutral-600">
                        Measurements performed using calibrated weighing scale and precision ruler. Formulas applied for standard grammage calculation.
                    </p>
                </div>
            </div>
        </div>
    );
}
