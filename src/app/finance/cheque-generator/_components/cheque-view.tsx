'use client';

import { toWords, toNepaliDate } from '@/lib/utils';
import { format } from 'date-fns';
import type { Account, CompanyProfile } from '@/lib/types';
import { useState, useEffect } from 'react';
import { onSettingUpdate } from '@/services/settings-service';
import { DEFAULT_COMPANY_PROFILE } from '@/lib/constants';

interface SplitDetail {
  chequeDate: Date;
  chequeNumber: string;
  amount: number | '';
}

interface ChequeViewProps {
  voucherNo: string;
  voucherDate: Date;
  payeeName: string;
  account?: Account | null;
  splits: SplitDetail[];
}

/** Mono print palette. Explicit hex only — html2canvas cannot parse oklch(). */
const INK = '#000000';
const SUB = '#444444';
const RULE = '#000000';

const money = (n: number) =>
  Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function MetaField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[8px] font-bold uppercase tracking-[0.18em]" style={{ color: SUB }}>
        {label}
      </div>
      <div className="mt-0.5 text-[11px] font-semibold leading-snug">{children}</div>
    </div>
  );
}

export function ChequeView({ voucherNo, voucherDate, payeeName, account, splits }: ChequeViewProps) {
  const [companyProfile, setCompanyProfile] = useState<CompanyProfile>(DEFAULT_COMPANY_PROFILE);

  useEffect(() => {
    const unsub = onSettingUpdate('companyProfile', (s) => setCompanyProfile(s?.value || DEFAULT_COMPANY_PROFILE));
    return () => unsub();
  }, []);

  const nepaliDate = toNepaliDate(voucherDate.toISOString());
  const adDate = format(voucherDate, 'dd MMM yyyy');

  const totalAmount = splits.reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
  const amountInWords = toWords(totalAmount);
  const isBank = !!account && account.type === 'Bank';

  return (
    <div
      className="relative bg-white font-sans"
      style={{ color: INK, padding: '14mm 13mm', breakInside: 'avoid' }}
    >
      {/* Letterhead — rule instead of a filled band */}
      <header
        className="flex items-start justify-between gap-6 pb-4"
        style={{ borderBottom: `2px solid ${RULE}` }}
      >
        <div className="min-w-0">
          <h1 className="text-[17px] font-bold uppercase leading-tight tracking-tight">
            {companyProfile.nameEn}
          </h1>
          <p className="mt-1 text-[10px] leading-relaxed" style={{ color: SUB }}>
            {companyProfile.address}
          </p>
        </div>

        <div className="shrink-0 text-right">
          <div
            className="inline-block px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.2em]"
            style={{ border: `1px solid ${RULE}` }}
          >
            Payment Voucher
          </div>
          <div className="mt-2 font-mono text-[13px] font-bold tracking-tight">#{voucherNo}</div>
          <div className="text-[9px] uppercase tracking-widest" style={{ color: SUB }}>
            {nepaliDate} BS &middot; {adDate}
          </div>
        </div>
      </header>

      {/* Meta strip — ruled, unfilled */}
      <section
        className="grid grid-cols-4 gap-x-6 gap-y-4 py-4"
        style={{ borderBottom: `1px solid ${RULE}` }}
      >
        <div className="col-span-2">
          <MetaField label="Paid to">
            <span className="text-[13px] font-bold uppercase tracking-tight">{payeeName}</span>
          </MetaField>
        </div>
        <MetaField label="Payment mode">{isBank ? 'Bank / Cheque' : 'Cash'}</MetaField>
        <MetaField label="Instruments">
          {splits.length} cheque{splits.length === 1 ? '' : 's'}
        </MetaField>

        {isBank && (
          <>
            <MetaField label="Drawee bank">{account!.bankName}</MetaField>
            <MetaField label="Account number">
              <span className="font-mono">{account!.accountNumber}</span>
            </MetaField>
          </>
        )}
        <MetaField label="Voucher date (BS)">{nepaliDate}</MetaField>
        <MetaField label="Voucher date (AD)">{adDate}</MetaField>
      </section>

      {/* Instrument schedule — ruled rows, no striping */}
      <section className="mt-6">
        <div className="text-[9px] font-bold uppercase tracking-[0.2em]" style={{ color: SUB }}>
          Instrument schedule
        </div>

        <table className="mt-2 w-full border-collapse text-[11px]">
          <thead>
            <tr style={{ borderTop: `1px solid ${RULE}`, borderBottom: `1px solid ${RULE}` }}>
              <th className="px-2 py-2 text-left text-[9px] font-bold uppercase tracking-widest" style={{ width: '8%' }}>
                #
              </th>
              <th className="px-2 py-2 text-left text-[9px] font-bold uppercase tracking-widest">Cheque no.</th>
              <th className="px-2 py-2 text-left text-[9px] font-bold uppercase tracking-widest">Cheque date (BS)</th>
              <th className="px-2 py-2 text-left text-[9px] font-bold uppercase tracking-widest">Cheque date (AD)</th>
              <th className="px-2 py-2 text-right text-[9px] font-bold uppercase tracking-widest">Amount (NPR)</th>
            </tr>
          </thead>

          <tbody>
            {splits.map((split, i) => (
              <tr key={`${split.chequeNumber || 'na'}-${i}`} style={{ borderBottom: `1px solid ${RULE}` }}>
                <td className="px-2 py-2.5 font-mono" style={{ color: SUB }}>
                  {String(i + 1).padStart(2, '0')}
                </td>
                <td className="px-2 py-2.5 font-mono font-bold">{split.chequeNumber || '—'}</td>
                <td className="px-2 py-2.5">{toNepaliDate(split.chequeDate.toISOString())}</td>
                <td className="px-2 py-2.5" style={{ color: SUB }}>
                  {format(split.chequeDate, 'dd MMM yyyy')}
                </td>
                <td className="px-2 py-2.5 text-right font-bold tabular-nums">{money(Number(split.amount))}</td>
              </tr>
            ))}
          </tbody>

          <tfoot>
            <tr style={{ borderBottom: `2px solid ${RULE}` }}>
              <td colSpan={4} className="px-2 py-3 text-right text-[9px] font-bold uppercase tracking-[0.2em]">
                Total payable
              </td>
              <td className="px-2 py-3 text-right text-[15px] font-bold tabular-nums">Rs. {money(totalAmount)}</td>
            </tr>
          </tfoot>
        </table>
      </section>

      {/* Amount in words */}
      <section className="mt-5 py-3 pl-3" style={{ borderLeft: `3px solid ${RULE}` }}>
        <div className="text-[8px] font-bold uppercase tracking-[0.18em]" style={{ color: SUB }}>
          Amount in words
        </div>
        <div className="mt-1 text-[11px] font-semibold leading-snug">{amountInWords}</div>
      </section>

      {/* Two signatures */}
      <section className="grid grid-cols-2 gap-16" style={{ marginTop: '26mm' }}>
        {["Receiver's signature", 'Authorised signature'].map((label) => (
          <div key={label} className="text-center">
            <div style={{ borderTop: `1px solid ${RULE}` }} />
            <div className="mt-1.5 text-[9px] font-bold uppercase tracking-[0.15em]">{label}</div>
            <div className="mt-3 text-[8px]" style={{ color: SUB }}>
              Name / Date
            </div>
          </div>
        ))}
      </section>

      {/* Footer */}
      <footer
        className="mt-8 flex items-center justify-between pt-3 text-[8px] uppercase tracking-widest"
        style={{ borderTop: `1px solid ${RULE}`, color: SUB }}
      >
        <span>
          {companyProfile.nameEn} &middot; Voucher #{voucherNo}
        </span>
        <span>System generated — valid without seal when signed</span>
      </footer>
    </div>
  );
}