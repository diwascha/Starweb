/**
 * @fileOverview The one description of what a printed purchase order says.
 *
 * The on-screen document and the PDF export used to derive this
 * independently, and they had already drifted apart in four ways that
 * changed the CONTENT, not just the styling: which material types counted as
 * paper, whether rows were sorted, what went in the description column, and
 * whether GSM/BF appeared twice. A supplier comparing the PDF against the
 * image of the same order saw two different documents.
 *
 * Both renderers now read the order through here, so a change to any of that
 * reaches the screen, the image and the PDF together.
 */

import { normalizeBF } from './utils';
import type { PurchaseOrder } from './types';

/** Material types that get the wide paper table (size / GSM / BF columns).
 *  Exact membership, deliberately: the PDF used to test
 *  `type.toLowerCase().includes('paper')`, so a type like "Paper Core" got
 *  paper columns in the PDF and plain ones on screen. */
export const PAPER_TYPES = ['Kraft Paper', 'Virgin Paper'];

export interface PoDocumentRow {
    index: number;
    description: string;
    size: string;
    gsm: string;
    bf: string;
    quantity: string;
}

export interface PoDocumentGroup {
    type: string;
    isPaper: boolean;
    rows: PoDocumentRow[];
    /** "10 Ton." or "10 Ton.  /  200 Kg" when a group mixes units. */
    subtotalText: string;
    lineItemLabel: string;
}

export interface PoDocumentModel {
    groups: PoDocumentGroup[];
    grandTotals: [string, number][];
    grandTotalText: string;
}

/** The description column. Paper rows name the grade, if any - the GSM and BF
 *  have their own columns and repeating them there was pure duplication. */
export const displayNameFor = (item: any, isPaper: boolean, type: string): string => {
    if (!isPaper) return item.rawMaterialName || type;
    return item.grade ? `${type} — ${item.grade}` : type;
};

const sumByUnit = (items: any[]): Record<string, number> =>
    items.reduce((acc: Record<string, number>, item: any) => {
        const q = parseFloat(item.quantity);
        if (!isNaN(q) && q > 0) acc[item.unit] = (acc[item.unit] || 0) + q;
        return acc;
    }, {});

const unitTotalsText = (totals: Record<string, number>, separator = '  /  '): string =>
    Object.entries(totals)
        .map(([unit, total]) => `${total.toLocaleString()} ${unit}`)
        .join(separator);

/** Build the printable model of an order. */
export const buildPoDocumentModel = (
    purchaseOrder: Pick<PurchaseOrder, 'items'>
): PoDocumentModel => {
    const items = purchaseOrder.items || [];

    const grouped = items.reduce((acc: Record<string, any[]>, item: any) => {
        const key = item.rawMaterialType || 'Other';
        (acc[key] = acc[key] || []).push(item);
        return acc;
    }, {});

    const groups: PoDocumentGroup[] = Object.entries(grouped).map(([type, groupItems]) => {
        const isPaper = PAPER_TYPES.includes(type);

        // Paper is read off the shop floor lightest-first, then by width. The
        // PDF used to print the raw entry order, so the two documents listed
        // the same seven lines in different sequences.
        const sorted = isPaper
            ? [...groupItems].sort((a, b) => {
                const gsmA = parseFloat(a.gsm) || 0;
                const gsmB = parseFloat(b.gsm) || 0;
                if (gsmA !== gsmB) return gsmA - gsmB;
                return (parseFloat(a.size) || 0) - (parseFloat(b.size) || 0);
            })
            : groupItems;

        return {
            type,
            isPaper,
            rows: sorted.map((item: any, i: number) => ({
                index: i + 1,
                description: displayNameFor(item, isPaper, type),
                size: item.size || '—',
                gsm: item.gsm || '—',
                bf: normalizeBF(item.bf) || '—',
                quantity: `${item.quantity} ${item.unit}`,
            })),
            subtotalText: unitTotalsText(sumByUnit(sorted)),
            lineItemLabel: `${sorted.length} line item${sorted.length > 1 ? 's' : ''}`,
        };
    });

    const grandTotals = sumByUnit(items);

    return {
        groups,
        grandTotals: Object.entries(grandTotals),
        grandTotalText: unitTotalsText(grandTotals, '   '),
    };
};

/** Amendment facts both renderers show in their header banner and history
 *  panel. Derived in one place so the PDF can't report a different revision
 *  date from the document on screen. */
export const describeAmendments = (amendments: any[] | undefined) => {
    const amendmentList = amendments || [];
    const hasAmendments = amendmentList.length > 0;
    const last = hasAmendments ? amendmentList[amendmentList.length - 1] : null;
    const amendedDate = last ? new Date(last.date) : null;
    return { amendmentList, hasAmendments, amendedDate };
};
