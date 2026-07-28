'use client';

import { toWords } from '@/lib/utils';
import { format } from 'date-fns';
import NepaliDate from 'nepali-date-converter';

interface NepalChequeViewProps {
  payeeName: string;
  amount: number;
  date: string; // ISO
  isAcPayee?: boolean;
}

/**
 * @fileOverview Specialized layout for standard Nepal Bank Cheques (approx 176mm x 88mm).
 * Designed for precise alignment on physical cheque leaves.
 */
export function NepalChequeView({ payeeName, amount, date, isAcPayee = true }: NepalChequeViewProps) {
  const nd = new NepaliDate(new Date(date));
  const year = String(nd.getYear());
  const month = String(nd.getMonth() + 1).padStart(2, '0');
  const day = String(nd.getDate()).padStart(2, '0');
  
  // Character arrays for boxed date printing
  const dateChars = [...year, ...month, ...day];
  const amountWords = toWords(amount).replace(' Only.', '');
  const amountFigures = amount.toLocaleString(undefined, { minimumFractionDigits: 2 });

  return (
    <div className="relative bg-white text-black overflow-hidden shadow-sm ring-1 ring-black/5" 
         style={{ 
           width: '176mm', 
           height: '88mm', 
           fontFamily: 'monospace',
           fontSize: '13px',
           lineHeight: '1.2'
         }}>
      
      {/* Account Payee Crossing */}
      {isAcPayee && (
        <div className="absolute top-4 left-6 border-y border-black w-24 -rotate-[35deg] flex flex-col items-center justify-center py-0.5">
           <span className="text-[9px] font-bold uppercase tracking-tighter">A/C Payee Only</span>
        </div>
      )}

      {/* Date Field - Aligned to standard top-right boxed date */}
      <div className="absolute top-[8mm] right-[8mm] flex gap-[2.8mm]">
        {dateChars.map((char, i) => (
          <span key={i} className="w-[3mm] text-center font-bold text-[14px]">
            {char}
          </span>
        ))}
      </div>

      {/* Payee Name */}
      <div className="absolute top-[26mm] left-[22mm] font-bold text-[15px] uppercase">
        {payeeName}
      </div>

      {/* Amount in Words */}
      <div className="absolute top-[36mm] left-[32mm] right-[40mm] font-bold leading-[8mm] text-[13px] capitalize">
        {amountWords}
      </div>

      {/* Amount in Figures Box */}
      <div className="absolute top-[48.5mm] right-[10mm] w-[45mm] h-[8mm] flex items-center justify-center font-black text-[16px]">
        <span className="mr-1">**</span>
        {amountFigures}
        <span className="ml-1">/-</span>
      </div>

      {/* Security Markings (Optional visuals for positioning) */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 opacity-5 text-[8px] font-black uppercase tracking-[1em] pointer-events-none">
        Nepal Cheque Standard Alignment
      </div>
    </div>
  );
}
