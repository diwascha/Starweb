/**
 * @fileOverview Where each field sits on a cheque leaf.
 *
 * Cheque printing is the one output in this app that must line up with paper
 * someone else printed. Nepali bank cheques are not standardised: the leaf is
 * usually around 176-203mm wide and 85-95mm tall, and the ruled lines for
 * payee, amount-in-words and the figures box sit in different places at NIC
 * Asia, Nabil, Global IME, Kumari and the rest. Some banks even vary between
 * personal and current-account books.
 *
 * The previous version had one geometry hardcoded in the markup - 176x88mm
 * with the payee at 26mm down, 22mm in, and so on. Those numbers came from
 * somewhere, but nothing said which bank they were measured from, and if they
 * are wrong for the book in the printer there is no way to correct them
 * without editing the component.
 *
 * So the geometry is data now: a named layout, stored in settings, editable
 * in the app, with a calibration sheet to measure against a real leaf. Get it
 * right once per cheque book and it stays right - and getting it wrong costs
 * a sheet of A4 instead of a cheque.
 *
 * Field coordinates are the TEXT BASELINE's left edge, in millimetres from
 * the top-left corner of the leaf.
 */

export interface ChequeFieldPosition {
    /** mm from the left edge of the leaf. */
    xMm: number;
    /** mm from the top edge of the leaf, to the text baseline. */
    yMm: number;
    /** Available width in mm; text is clipped or wrapped to it. */
    widthMm?: number;
    fontPt?: number;
    bold?: boolean;
    align?: 'left' | 'center' | 'right';
    /** Hide this field entirely - some banks pre-print A/C Payee. */
    enabled?: boolean;
}

export interface ChequeLayout {
    id: string;
    label: string;
    widthMm: number;
    heightMm: number;
    /** Printer-level nudge applied to every field, so a drift that affects
     *  the whole sheet is fixed in one place instead of field by field. */
    offsetXMm: number;
    offsetYMm: number;
    /** Monospace keeps the boxed date characters on their pitch. */
    fontFamily: string;
    fields: {
        /** One character per box; `dateBoxPitchMm` is the box-to-box spacing. */
        date: ChequeFieldPosition & { boxPitchMm: number };
        payee: ChequeFieldPosition;
        amountWords: ChequeFieldPosition & { lineHeightMm: number };
        amountFigures: ChequeFieldPosition;
        acPayee: ChequeFieldPosition & { rotateDeg: number; lengthMm: number };
    };
}

/**
 * The geometry the app shipped with, preserved exactly so nobody's working
 * setup changes underneath them.
 *
 * It is NOT verified against a specific bank - it is the previous hardcoded
 * layout, relabelled honestly. Calibrate before trusting it on a real leaf.
 */
export const LEGACY_LAYOUT: ChequeLayout = {
    id: 'legacy',
    label: 'Default (uncalibrated — measure before use)',
    widthMm: 176,
    heightMm: 88,
    offsetXMm: 0,
    offsetYMm: 0,
    fontFamily: '"Courier New", Courier, monospace',
    fields: {
        date: { xMm: 129, yMm: 12, boxPitchMm: 5.8, fontPt: 10.5, bold: true, enabled: true },
        payee: { xMm: 22, yMm: 30, widthMm: 109, fontPt: 11, bold: true, enabled: true },
        amountWords: { xMm: 32, yMm: 40, widthMm: 104, lineHeightMm: 8, fontPt: 10, bold: true, enabled: true },
        amountFigures: { xMm: 121, yMm: 53, widthMm: 45, fontPt: 12, bold: true, align: 'center', enabled: true },
        acPayee: { xMm: 8, yMm: 6, rotateDeg: -35, lengthMm: 32, fontPt: 7, bold: true, enabled: true },
    },
};

/**
 * A5 landscape is a common cheque-book page size; some banks issue leaves at
 * 203x93mm. Offered as a starting point, equally in need of calibration.
 */
export const WIDE_LAYOUT: ChequeLayout = {
    ...LEGACY_LAYOUT,
    id: 'wide-203',
    label: '203 × 93 mm leaf (uncalibrated — measure before use)',
    widthMm: 203,
    heightMm: 93,
    fields: {
        ...LEGACY_LAYOUT.fields,
        date: { ...LEGACY_LAYOUT.fields.date, xMm: 150 },
        payee: { ...LEGACY_LAYOUT.fields.payee, widthMm: 128 },
        amountWords: { ...LEGACY_LAYOUT.fields.amountWords, widthMm: 122 },
        amountFigures: { ...LEGACY_LAYOUT.fields.amountFigures, xMm: 146 },
    },
};

export const CHEQUE_LAYOUT_PRESETS: ChequeLayout[] = [LEGACY_LAYOUT, WIDE_LAYOUT];

export const CHEQUE_LAYOUT_SETTING_KEY = 'chequeLayout';

/** Merge a stored layout over a preset, so a partial or older stored layout
 *  still produces a complete one. */
export const resolveChequeLayout = (stored: any): ChequeLayout => {
    const base = CHEQUE_LAYOUT_PRESETS.find(p => p.id === stored?.id) || LEGACY_LAYOUT;
    if (!stored) return base;
    return {
        ...base,
        ...stored,
        fields: {
            date: { ...base.fields.date, ...(stored.fields?.date || {}) },
            payee: { ...base.fields.payee, ...(stored.fields?.payee || {}) },
            amountWords: { ...base.fields.amountWords, ...(stored.fields?.amountWords || {}) },
            amountFigures: { ...base.fields.amountFigures, ...(stored.fields?.amountFigures || {}) },
            acPayee: { ...base.fields.acPayee, ...(stored.fields?.acPayee || {}) },
        },
    };
};

export type ChequeFieldKey = keyof ChequeLayout['fields'];

export const CHEQUE_FIELD_LABELS: Record<ChequeFieldKey, string> = {
    date: 'Date boxes',
    payee: 'Payee name',
    amountWords: 'Amount in words',
    amountFigures: 'Amount in figures',
    acPayee: 'A/C Payee crossing',
};
