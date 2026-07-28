'use client';

import React from 'react';
import { toWords } from '@/lib/utils';
import NepaliDate from 'nepali-date-converter';

export interface NepalChequeViewProps {
  payeeName: string;
  amount: number;
  /** ISO date string */
  date: string;
  isAcPayee?: boolean;
  /** Fine-tune printer offsets in mm without editing layout constants */
  offsetX?: number;
  offsetY?: number;
}

/**
 * @fileOverview Standard Nepal bank cheque leaf (176mm x 88mm).
 *
 * IMPORTANT: every style in here is INLINE on purpose. This markup is cloned
 * via `innerHTML` into a blank print window that has no stylesheet attached.
 * If you convert any of these to Tailwind utility classes, the preview will
 * still look correct on screen but the printed output will silently collapse
 * into unpositioned text — on a real cheque leaf.
 */
export function NepalChequeView({
  payeeName,
  amount,
  date,
  isAcPayee = true,
  offsetX = 0,
  offsetY = 0,
}: NepalChequeViewProps) {
  const nd = new NepaliDate(new Date(date));
  const year = String(nd.getYear());
  const month = String(nd.getMonth() + 1).padStart(2, '0');
  const day = String(nd.getDate()).padStart(2, '0');

  // YYYYMMDD, one character per box
  const dateChars = [...year, ...month, ...day];

  const amountWords = toWords(amount).replace(/\s*only\.?\s*$/i, '').trim();

  // Explicit locale. Never rely on the browser default here: an en-IN browser
  // renders 1,00,000.00 and an en-US browser renders 100,000.00 for the same
  // cheque. en-IN grouping is the convention used in Nepal.
  const amountFigures = new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(amount) ? amount : 0);

  const mm = (v: number) => `${v}mm`;

  const root: React.CSSProperties = {
    position: 'relative',
    width: '176mm',
    height: '88mm',
    boxSizing: 'border-box',
    background: '#ffffff',
    color: '#000000',
    overflow: 'hidden',
    fontFamily: '"Courier New", Courier, monospace',
    fontSize: '13px',
    lineHeight: 1.2,
    WebkitPrintColorAdjust: 'exact',
    printColorAdjust: 'exact',
  } as React.CSSProperties;

  return (
    <div style={root}>
      {/* A/C Payee crossing (top-left, rotated) */}
      {isAcPayee && (
        <div
          style={{
            position: 'absolute',
            top: mm(6 + offsetY),
            left: mm(8 + offsetX),
            width: '32mm',
            borderTop: '1px solid #000000',
            borderBottom: '1px solid #000000',
            transform: 'rotate(-35deg)',
            transformOrigin: 'left top',
            textAlign: 'center',
            padding: '1px 0',
            fontSize: '9px',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '-0.02em',
            whiteSpace: 'nowrap',
          }}
        >
          A/C Payee Only
        </div>
      )}

      {/* Boxed date, top-right */}
      <div
        style={{
          position: 'absolute',
          top: mm(8 + offsetY),
          right: mm(8 - offsetX),
          display: 'flex',
          gap: '2.8mm',
        }}
      >
        {dateChars.map((char, i) => (
          <span
            key={i}
            style={{
              display: 'inline-block',
              width: '3mm',
              textAlign: 'center',
              fontWeight: 700,
              fontSize: '14px',
            }}
          >
            {char}
          </span>
        ))}
      </div>

      {/* Payee name */}
      <div
        style={{
          position: 'absolute',
          top: mm(26 + offsetY),
          left: mm(22 + offsetX),
          right: mm(45 - offsetX),
          fontWeight: 700,
          fontSize: '15px',
          textTransform: 'uppercase',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'clip',
        }}
      >
        {payeeName}
      </div>

      {/* Amount in words — line-height matches the ruled lines so a wrap
          lands on the second line rather than between them */}
      <div
        style={{
          position: 'absolute',
          top: mm(36 + offsetY),
          left: mm(32 + offsetX),
          right: mm(40 - offsetX),
          fontWeight: 700,
          fontSize: '13px',
          lineHeight: '8mm',
          textTransform: 'capitalize',
        }}
      >
        {amountWords} Only
      </div>

      {/* Amount in figures */}
      <div
        style={{
          position: 'absolute',
          top: mm(48.5 + offsetY),
          right: mm(10 - offsetX),
          width: '45mm',
          height: '8mm',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 900,
          fontSize: '16px',
        }}
      >
        <span style={{ marginRight: '2px' }}>**</span>
        {amountFigures}
        <span style={{ marginLeft: '2px' }}>/-</span>
      </div>
    </div>
  );
}
