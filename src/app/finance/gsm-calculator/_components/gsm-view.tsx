
'use client';

import { useState, useEffect } from 'react';
import type { GsmReport, CompanyProfile } from '@/lib/types';
import { toNepaliDate, toWords } from '@/lib/utils';
import { format } from 'date-fns';
import { onSettingUpdate } from '@/services/settings-service';
import { DEFAULT_COMPANY_PROFILE } from '@/lib/constants';
import { Separator } from '@/components/ui/separator';

export function GsmReportView({ report }: { report: GsmReport }) {
    const [companyProfile, setCompanyProfile] = useState<CompanyProfile>(DEFAULT_COMPANY_PROFILE);

    useEffect(() => {
        const unsub = onSettingUpdate('companyProfile', (s) => setCompanyProfile(s?.value || DEFAULT_COMPANY_PROFILE));
        return () => unsub();
    }, []);

    return (
        <div className="gsm-voucher bg-white text-black p-12 font-sans border-2 border-neutral-900 mx-auto" style={{ width: '210mm', minHeight: '148mm' }}>
            <header className="text-center space-y-1 mb-8 border-b-2 border-neutral-900 pb-4">
                <h1 className="text-2xl font-black uppercase tracking-tight">{companyProfile.nameEn}</h1>
                <p className="text-sm font-bold">{companyProfile.address}</p>
                <h2 className="text-lg font-black underline mt-4 uppercase tracking-[0.2em]">GSM VERIFICATION VOUCHER</h2>
            </header>

            <div className="grid grid-cols-2 gap-x-12 gap-y-4 text-sm mb-10">
                <div className="space-y-2">
                    <p><span className="font-bold uppercase text-[10px] text-muted-foreground block">Verification No:</span> <span className="font-black text-lg">{report.voucherNo}</span></p>
                    <p><span className="font-bold uppercase text-[10px] text-muted-foreground block">Supplier:</span> <span className="font-black text-base">{report.vendorName}</span></p>
                    <p><span className="font-bold uppercase text-[10px] text-muted-foreground block">Reel / Batch:</span> <span className="font-bold">{report.reelNumber || 'N/A'}</span></p>
                </div>
                <div className="text-right space-y-2">
                    <p><span className="font-bold uppercase text-[10px] text-muted-foreground block">Date (BS):</span> <span className="font-black">{toNepaliDate(report.date)}</span></p>
                    <p><span className="font-bold uppercase text-[10px] text-muted-foreground block">Date (AD):</span> <span className="text-muted-foreground">{format(new Date(report.date), 'PP')}</span></p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
                <div className="p-6 rounded-2xl bg-neutral-50 border-2 border-neutral-100 space-y-4">
                    <h3 className="text-[10px] font-black uppercase text-neutral-500 tracking-[0.2em] border-b pb-2">Measured Inputs</h3>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                        <div className="space-y-0.5">
                            <p className="text-[9px] font-bold text-neutral-400 uppercase">Sample Weight</p>
                            <p className="font-black text-sm">{report.weight} grams</p>
                        </div>
                        <div className="space-y-0.5">
                            <p className="text-[9px] font-bold text-neutral-400 uppercase">Unit System</p>
                            <p className="font-black text-sm uppercase">{report.unit === 'cm' ? 'Metric (CM)' : 'Imperial (IN)'}</p>
                        </div>
                        <div className="space-y-0.5">
                            <p className="text-[9px] font-bold text-neutral-400 uppercase">Sample Length</p>
                            <p className="font-black text-sm">{report.length} {report.unit}</p>
                        </div>
                        <div className="space-y-0.5">
                            <p className="text-[9px] font-bold text-neutral-400 uppercase">Sample Width</p>
                            <p className="font-black text-sm">{report.width} {report.unit}</p>
                        </div>
                    </div>
                </div>

                <div className="flex flex-col items-center justify-center p-6 border-4 border-neutral-900 rounded-3xl bg-white shadow-xl">
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-neutral-400 mb-2">Calculated Grammage</p>
                    <div className="text-6xl font-black tabular-nums">{report.gsm.toFixed(2)}</div>
                    <p className="text-xs font-black uppercase tracking-widest mt-1">GSM</p>
                </div>
            </div>

            <footer className="mt-20 grid grid-cols-2 gap-24 text-center">
                <div className="space-y-3">
                    <div className="border-t-2 border-neutral-900 w-full" />
                    <p className="font-black uppercase text-[10px] tracking-widest">Quality Inspector</p>
                </div>
                <div className="space-y-3">
                    <div className="border-t-2 border-neutral-900 w-full" />
                    <p className="font-black uppercase text-[10px] tracking-widest">Authorized Seal</p>
                </div>
            </footer>
        </div>
    );
}
