
'use client';

import { toWords } from '@/lib/utils';
import { format } from 'date-fns';

interface ChequeViewProps {
  chequeDate: Date;
  payeeName: string;
  amount: number;
}

export function ChequeView({ chequeDate, payeeName, amount }: ChequeViewProps) {
  const dateStr = format(chequeDate, 'ddMMyyyy');
  const amountInWords = toWords(amount);
  const formattedAmount = `**${amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}/-`;

  return (
    <div className="cheque-container font-mono text-sm leading-tight" style={{ width: '8in', height: '3.66in', padding: '0.25in', position: 'relative' }}>
      <div style={{ position: 'absolute', top: '0.55in', right: '0.5in', letterSpacing: '0.5em' }}>
        {dateStr}
      </div>
      
      <div style={{ position: 'absolute', top: '1.2in', left: '1in' }}>
        {payeeName}
      </div>
      
      <div style={{ position: 'absolute', top: '1.6in', left: '1.2in', width: '4.5in', textTransform: 'capitalize' }}>
        {amountInWords}
      </div>
      
      <div style={{ position: 'absolute', top: '1.65in', right: '0.6in', letterSpacing: '0.1em' }}>
        {formattedAmount}
      </div>
      
      <div style={{ position: 'absolute', top: '2.5in', left: '1.5in' }}>
        A/C PAYEE ONLY
      </div>
    </div>
  );
}
