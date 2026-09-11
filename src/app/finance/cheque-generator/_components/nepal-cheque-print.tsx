'use client';

import React from 'react';
import { toWords } from '@/lib/utils';
import NepaliDate from 'nepali-date-converter';
import { LEGACY_LAYOUT, type ChequeLayout } from '@/lib/cheque-layout';

export interface NepalChequeViewProps {
  payeeName: string;
  amount: number;
  /** ISO date string */
  date: string;
  isAcPayee?: boolean;
  /** Where each field sits on the leaf. Defaults to the app's original
   *  geometry so existing setups are unchanged. */
  layout?: ChequeLayout;
  /** Draw a millimetre grid and field markers instead of relying on the eye.
   *  Print this on plain paper, hold it against a real leaf, and read off
   *  how far each field is out. */
  calibration?: boolean;
}

/**
 * @fileOverview A cheque leaf, positioned from a layout rather than hardcoded.
 *
 * IMPORTANT: every style in here is INLINE on purpose. This markup is cloned
 * via `innerHTML` into a blank print window that has no stylesheet attached.
 * If you convert any of these to Tailwind utility classes, the preview will
 * still look correct on screen but the printed output will silently collapse
 * into unpositioned text — on a real cheque leaf.
 *
 * The geometry lives in lib/cheque-layout, because Nepali bank cheques are
 * not standardised and the right numbers can only come from measuring the
 * book that is actually in the printer.
 */
export function NepalChequeView({
  payeeName,
  amount,
  date,
  isAcPayee = true,
  layout = LEGACY_LAYOUT,
  calibration = false,
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
  const ox = layout.offsetXMm;
  const oy = layout.offsetYMm;
  const f = layout.fields;

  const root: React.CSSProperties = {
    position: 'relative',
    width: mm(layout.widthMm),
    height: mm(layout.heightMm),
    boxSizing: 'border-box',
    background: '#ffffff',
    color: '#000000',
    overflow: 'hidden',
    fontFamily: layout.fontFamily,
    lineHeight: 1.2,
    WebkitPrintColorAdjust: 'exact',
    printColorAdjust: 'exact',
  } as React.CSSProperties;

  /** Field styling shared by every positioned element. Coordinates are the
   *  baseline's left edge, so the box is shifted up by its own line height. */
  const place = (pos: { xMm: number; yMm: number; widthMm?: number; fontPt?: number; bold?: boolean; align?: string }): React.CSSProperties => ({
    position: 'absolute',
    left: mm(pos.xMm + ox),
    top: mm(pos.yMm + oy - (pos.fontPt || 10) * 0.3528),
    width: pos.widthMm ? mm(pos.widthMm) : undefined,
    fontSize: `${pos.fontPt || 10}pt`,
    fontWeight: pos.bold ? 700 : 400,
    textAlign: (pos.align as any) || 'left',
  });

  return (
    <div style={root}>
      {/* Calibration aids: a 10mm grid with 5mm minor lines, plus a marker on
          every field so an offset can be read straight off the sheet. */}
      {calibration && (
        <>
          <div
            style={{
              position: 'absolute', inset: 0,
              backgroundImage:
                'repeating-linear-gradient(to right, #d0d0d0 0 0.2mm, transparent 0.2mm 10mm),' +
                'repeating-linear-gradient(to bottom, #d0d0d0 0 0.2mm, transparent 0.2mm 10mm),' +
                'repeating-linear-gradient(to right, #eeeeee 0 0.1mm, transparent 0.1mm 5mm),' +
                'repeating-linear-gradient(to bottom, #eeeeee 0 0.1mm, transparent 0.1mm 5mm)',
            }}
          />
          <div style={{ position: 'absolute', inset: 0, border: '0.3mm solid #999' }} />
          {[10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160, 170, 180, 190, 200]
            .filter(v => v < layout.widthMm)
            .map(v => (
              <span key={`x${v}`} style={{ position: 'absolute', left: mm(v + 0.5), top: '0.5mm', fontSize: '5pt', color: '#777' }}>{v}</span>
            ))}
          {[10, 20, 30, 40, 50, 60, 70, 80, 90].filter(v => v < layout.heightMm).map(v => (
            <span key={`y${v}`} style={{ position: 'absolute', left: '0.5mm', top: mm(v + 0.3), fontSize: '5pt', color: '#777' }}>{v}</span>
          ))}
        </>
      )}

      {/* A/C Payee crossing (top-left, rotated) */}
      {isAcPayee && f.acPayee.enabled !== false && (
        <div
          style={{
            position: 'absolute',
            top: mm(f.acPayee.yMm + oy),
            left: mm(f.acPayee.xMm + ox),
            width: mm(f.acPayee.lengthMm),
            borderTop: '1px solid #000000',
            borderBottom: '1px solid #000000',
            transform: `rotate(${f.acPayee.rotateDeg}deg)`,
            transformOrigin: 'left top',
            textAlign: 'center',
            padding: '1px 0',
            fontSize: `${f.acPayee.fontPt || 7}pt`,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '-0.02em',
            whiteSpace: 'nowrap',
          }}
        >
          A/C Payee Only
        </div>
      )}

      {/* Boxed date — one character per pre-printed box */}
      {f.date.enabled !== false && (
        <div
          style={{
            ...place(f.date),
            width: undefined,
            display: 'flex',
            gap: 0,
          }}
        >
          {dateChars.map((char, i) => (
            <span
              key={i}
              style={{
                display: 'inline-block',
                width: mm(f.date.boxPitchMm),
                textAlign: 'center',
                fontWeight: 700,
              }}
            >
              {char}
            </span>
          ))}
        </div>
      )}

      {/* Payee name */}
      {f.payee.enabled !== false && (
        <div
          style={{
            ...place(f.payee),
            textTransform: 'uppercase',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'clip',
          }}
        >
          {payeeName}
        </div>
      )}

      {/* Amount in words — line height matches the ruled lines so a wrap
          lands on the second line rather than between them */}
      {f.amountWords.enabled !== false && (
        <div
          style={{
            ...place(f.amountWords),
            lineHeight: mm(f.amountWords.lineHeightMm),
            textTransform: 'capitalize',
          }}
        >
          {amountWords} Only
        </div>
      )}

      {/* Amount in figures */}
      {f.amountFigures.enabled !== false && (
        <div style={place(f.amountFigures)}>
          <span style={{ marginRight: '2px' }}>**</span>
          {amountFigures}
          <span style={{ marginLeft: '2px' }}>/-</span>
        </div>
      )}
    </div>
  );
}
