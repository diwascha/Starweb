/**
 * Parses two tabs of the fleet Excel workbook (Vada_*.xlsm / equivalent):
 *
 * - "Trip Sheet": one row per trip. Vada/Advance/Transport/party columns are
 *   amounts CHARGED against that truck for the trip - fuel used, tyres
 *   fitted, insurance premium apportioned, driver advance given, transport
 *   fee owed to the truck's owner. None of it is a cash outflow yet; it's a
 *   liability accrual, same as buying something on credit. These become
 *   Purchase-type transactions (billingType 'Credit'), never a Payment or an
 *   Expense - marking them paid before they are would be false.
 * - "Payments": the actual cash/cheque/bank disbursements against a party's
 *   running balance, independent of any single trip. These become
 *   Payment-type transactions with a voucherId, same shape a manually
 *   entered Payment/Receipt voucher produces, so they show up in Payment/
 *   Receipt Logs.
 *
 * Parsing is pure (no Firestore access); the import page resolves vehicle/
 * party names to IDs before committing.
 */
'use client';

import { getFirebase } from '@/lib/firebase';
import { collection, doc, writeBatch } from 'firebase/firestore';
import { COLLECTIONS } from '@/lib/constants';
import { createTimestamp } from '@/lib/service-utils';

export interface TripSheetCandidate {
    rowNumber: number; // 1-based, for user-facing messages
    dateIso: string;
    vehicleText: string;
    numParties: number;
    kind: 'Sales' | 'Purchase';
    category: string;
    partyName?: string;
    amount: number;
    remarks: string;
}

export interface PaymentSheetCandidate {
    rowNumber: number;
    dateIso: string;
    partyName: string;
    amount: number;
    mode: string;
    chequeRef: string;
    remarks: string;
}

function toIsoDate(value: any): string | null {
    if (value instanceof Date && !isNaN(value.getTime())) return value.toISOString();
    if (typeof value === 'string' && value.trim()) {
        const d = new Date(value);
        if (!isNaN(d.getTime())) return d.toISOString();
    }
    return null;
}

function findHeaderRow(grid: any[][], mustContain: string): number {
    const target = mustContain.trim().toLowerCase();
    for (let r = 0; r < Math.min(grid.length, 10); r++) {
        const row = grid[r] || [];
        if (row.some(c => typeof c === 'string' && c.trim().toLowerCase() === target)) return r;
    }
    return -1;
}

/**
 * Setup sheet "Type" values (free text, from the company's own workbook) ->
 * the app's fixed ExpenseType-style categories, so imported costs land in
 * the same buckets the Expense form itself offers.
 */
const EXPENSE_TYPE_MAP: Record<string, string> = {
    'fuel': 'Fuel',
    'tyre': 'Maintenance',
    'tyre resole': 'Maintenance',
    'spare parts': 'Maintenance',
    'government': 'Tax/Renewal',
    'association': 'Tax/Renewal',
    'vat': 'Tax/Renewal',
    'advance': 'Advance',
    'transport': 'Transport',
    'truck owner': 'Transport',
    'misc. exp': 'Other',
    'misc exp': 'Other',
};

function mapToExpenseType(rawType: string): string {
    return EXPENSE_TYPE_MAP[rawType.trim().toLowerCase()] || 'Other';
}

/** Cash stays Cash; anything naming a cheque/bank/RTGS/transfer settles via Bank. */
function mapPaymentMode(mode: string): 'Cash' | 'Bank' {
    return mode.trim().toLowerCase().includes('cash') ? 'Cash' : 'Bank';
}

/** Party Name -> Type, read from the Setup sheet's Parties table. */
export function parsePartyTypeMap(setupGrid: any[][] | undefined | null): Map<string, string> {
    const map = new Map<string, string>();
    if (!setupGrid) return map;
    let headerRow = -1;
    for (let r = 0; r < setupGrid.length; r++) {
        const row = setupGrid[r] || [];
        if (typeof row[0] === 'string' && row[0].trim() === 'Party Name' && typeof row[1] === 'string' && row[1].trim() === 'Type') {
            headerRow = r;
            break;
        }
    }
    if (headerRow === -1) return map;
    for (let r = headerRow + 1; r < setupGrid.length; r++) {
        const row = setupGrid[r] || [];
        const name = row[0];
        if (!name || typeof name !== 'string' || !name.trim()) break; // table ends at first blank name
        const type = row[1];
        if (type && typeof type === 'string' && type.trim()) map.set(name.trim().toLowerCase(), type.trim());
    }
    return map;
}

export function parseTripSheet(grid: any[][], partyTypeMap: Map<string, string>): { candidates: TripSheetCandidate[]; warnings: string[] } {
    const warnings: string[] = [];
    const headerRow = findHeaderRow(grid, 'Vehicle No.');
    if (headerRow === -1) {
        return { candidates: [], warnings: ['Could not find the Trip Sheet header row (looking for a "Vehicle No." column in the first 10 rows).'] };
    }

    const headers = (grid[headerRow] || []).map(h => (typeof h === 'string' ? h.trim() : h));
    const col = (name: string) => headers.findIndex(h => h === name);

    const idxDateAD = col('Date (A.D)');
    const idxVehicle = col('Vehicle No.');
    const idxParties = col('No. of Parties');
    const idxVada = col('Vada');
    const idxExtraStopsTotal = col('Extra Stops Total');
    const idxExtraPartyCharge = col('Extra Party Charge');
    const idxAdvance = col('Advance');
    const idxTransport = col('Transport');
    const idxOtherIncome = col('Other Income');
    const idxRemarks = col('Remarks');

    for (const [label, idx] of [['Date (A.D)', idxDateAD], ['Vehicle No.', idxVehicle], ['Vada', idxVada], ['Advance', idxAdvance], ['Transport', idxTransport], ['Other Income', idxOtherIncome]] as const) {
        if (idx === -1) warnings.push(`Column "${label}" not found - related amounts will be skipped.`);
    }

    const dynamicCols: { index: number; name: string }[] = [];
    if (idxTransport >= 0 && idxOtherIncome > idxTransport) {
        for (let c = idxTransport + 1; c < idxOtherIncome; c++) {
            const h = headers[c];
            if (h && typeof h === 'string' && h.trim()) dynamicCols.push({ index: c, name: h.trim() });
        }
    }

    const candidates: TripSheetCandidate[] = [];
    for (let r = headerRow + 1; r < grid.length; r++) {
        const row = grid[r];
        if (!row) continue;
        const vehicleText = idxVehicle >= 0 ? row[idxVehicle] : null;
        if (!vehicleText || typeof vehicleText !== 'string' || !vehicleText.trim()) continue;

        const dateIso = idxDateAD >= 0 ? toIsoDate(row[idxDateAD]) : null;
        if (!dateIso) {
            warnings.push(`Row ${r + 1}: missing or unreadable date - skipped.`);
            continue;
        }

        const numParties = idxParties >= 0 ? (Number(row[idxParties]) || 1) : 1;
        const remarks = idxRemarks >= 0 ? String(row[idxRemarks] || '') : '';
        const vehicleTextTrimmed = vehicleText.trim();

        const revenue = (idxVada >= 0 ? Number(row[idxVada]) || 0 : 0)
            + (idxExtraStopsTotal >= 0 ? Number(row[idxExtraStopsTotal]) || 0 : 0)
            + (idxExtraPartyCharge >= 0 ? Number(row[idxExtraPartyCharge]) || 0 : 0)
            + (idxOtherIncome >= 0 ? Number(row[idxOtherIncome]) || 0 : 0);
        if (revenue > 0) {
            candidates.push({ rowNumber: r + 1, dateIso, vehicleText: vehicleTextTrimmed, numParties, kind: 'Sales', category: 'Trip Freight', amount: revenue, remarks });
        }

        const advance = idxAdvance >= 0 ? Number(row[idxAdvance]) || 0 : 0;
        if (advance > 0) {
            candidates.push({ rowNumber: r + 1, dateIso, vehicleText: vehicleTextTrimmed, numParties, kind: 'Purchase', category: 'Advance', amount: advance, remarks });
        }

        const transport = idxTransport >= 0 ? Number(row[idxTransport]) || 0 : 0;
        if (transport > 0) {
            candidates.push({ rowNumber: r + 1, dateIso, vehicleText: vehicleTextTrimmed, numParties, kind: 'Purchase', category: 'Transport', amount: transport, remarks });
        }

        for (const dc of dynamicCols) {
            const amt = Number(row[dc.index]) || 0;
            if (amt !== 0) {
                const rawType = partyTypeMap.get(dc.name.toLowerCase()) || dc.name;
                const category = mapToExpenseType(rawType);
                candidates.push({ rowNumber: r + 1, dateIso, vehicleText: vehicleTextTrimmed, numParties, kind: 'Purchase', category, partyName: dc.name, amount: Math.abs(amt), remarks });
            }
        }
    }

    return { candidates, warnings };
}

/** Parses the "Payments" sheet - actual cash/cheque/bank disbursements to a party. */
export function parsePaymentsSheet(grid: any[][]): { candidates: PaymentSheetCandidate[]; warnings: string[] } {
    const warnings: string[] = [];
    const headerRow = findHeaderRow(grid, 'Party');
    if (headerRow === -1) {
        return { candidates: [], warnings: ['Could not find the Payments header row (looking for a "Party" column in the first 10 rows).'] };
    }

    const headers = (grid[headerRow] || []).map(h => (typeof h === 'string' ? h.trim() : h));
    const col = (name: string) => headers.findIndex(h => h === name);

    const idxDateAD = col('Date (A.D)');
    const idxParty = col('Party');
    const idxAmount = col('Amount');
    const idxMode = col('Mode');
    const idxRef = col('Cheque / Ref No.');
    const idxRemarks = col('Remarks');

    for (const [label, idx] of [['Date (A.D)', idxDateAD], ['Party', idxParty], ['Amount', idxAmount]] as const) {
        if (idx === -1) warnings.push(`Payments sheet: column "${label}" not found - rows will be skipped.`);
    }

    const candidates: PaymentSheetCandidate[] = [];
    for (let r = headerRow + 1; r < grid.length; r++) {
        const row = grid[r];
        if (!row) continue;
        const partyName = idxParty >= 0 ? row[idxParty] : null;
        if (!partyName || typeof partyName !== 'string' || !partyName.trim()) continue;

        const amount = idxAmount >= 0 ? Number(row[idxAmount]) || 0 : 0;
        if (amount <= 0) continue;

        const dateIso = idxDateAD >= 0 ? toIsoDate(row[idxDateAD]) : null;
        if (!dateIso) {
            warnings.push(`Payments row ${r + 1}: missing or unreadable date - skipped.`);
            continue;
        }

        candidates.push({
            rowNumber: r + 1,
            dateIso,
            partyName: partyName.trim(),
            amount,
            mode: idxMode >= 0 ? String(row[idxMode] || 'Cash') : 'Cash',
            chequeRef: idxRef >= 0 ? String(row[idxRef] || '') : '',
            remarks: idxRemarks >= 0 ? String(row[idxRemarks] || '') : '',
        });
    }

    return { candidates, warnings };
}

/** Short, stable id from a signature string - for idempotent import writes. */
export function stableHash(input: string): string {
    let h1 = 0xdeadbeef ^ input.length;
    let h2 = 0x41c6ce57 ^ input.length;
    for (let i = 0; i < input.length; i++) {
        const ch = input.charCodeAt(i);
        h1 = Math.imul(h1 ^ ch, 2654435761);
        h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (h1 >>> 0).toString(36) + (h2 >>> 0).toString(36);
}

export function candidateSignature(vehicleId: string, dateIso: string, category: string, amount: number): string {
    const day = dateIso.slice(0, 10);
    return `${vehicleId}|${day}|${category.toLowerCase()}|${Math.round(amount)}`;
}

/** Separate namespace from candidateSignature - these have no vehicle, only a party. */
export function partyPaymentSignature(partyId: string, dateIso: string, amount: number): string {
    const day = dateIso.slice(0, 10);
    return `party-payment|${partyId}|${day}|${Math.round(amount)}`;
}

export interface ResolvedCandidate extends TripSheetCandidate {
    vehicleId: string;
    partyId?: string | null;
}

export interface ResolvedPaymentCandidate extends PaymentSheetCandidate {
    partyId: string;
}

const BATCH_LIMIT = 400; // stay clear of Firestore's 500-op cap per batch

/**
 * Writes resolved candidates at deterministic IDs, so re-running the same
 * import overwrites the same documents instead of duplicating them.
 * `existingSignatures` should already contain every signature already on
 * record (manual entries included) - anything matching is skipped.
 *
 * - Sales rows (trip freight) -> Transaction, type 'Sales'.
 * - Purchase rows (Trip Sheet charges) -> Transaction, type 'Purchase',
 *   billingType 'Credit' and a purchaseNumber, so they read as an accrued
 *   liability - not yet paid - and show up in Purchase History.
 * - Payment rows (the Payments sheet) -> Transaction, type 'Payment', with a
 *   voucherId so they show up in Payment/Receipt Logs, matching what a
 *   manually entered voucher produces. No vehicleId: a payment settles a
 *   party's running balance, not one specific trip.
 */
export async function commitTripSheetImport(
    tripCandidates: ResolvedCandidate[],
    paymentCandidates: ResolvedPaymentCandidate[],
    existingSignatures: Set<string>,
    createdBy: string
): Promise<{ created: number; skipped: number }> {
    const { db } = getFirebase();
    const seen = new Set(existingSignatures);
    let batch = writeBatch(db);
    let pending = 0;
    let created = 0;
    let skipped = 0;
    const now = createTimestamp();

    const flush = async () => {
        if (pending === 0) return;
        await batch.commit();
        batch = writeBatch(db);
        pending = 0;
    };
    const stage = (ref: ReturnType<typeof doc>, data: Record<string, unknown>) => {
        batch.set(ref, data);
        pending++;
    };

    for (const c of tripCandidates) {
        const signature = candidateSignature(c.vehicleId, c.dateIso, c.category, c.amount);
        if (seen.has(signature)) {
            skipped++;
            continue;
        }
        seen.add(signature);
        const hash = stableHash(signature);
        const remarks = `Imported from Trip Sheet row ${c.rowNumber}${c.remarks ? `: ${c.remarks}` : ''}`;
        const particular = c.partyName ? `${c.category} - ${c.partyName}` : c.category;

        if (c.kind === 'Sales') {
            stage(doc(collection(db, COLLECTIONS.TRANSACTIONS), `imp-${hash}`), {
                date: c.dateIso,
                type: 'Sales',
                category: c.category,
                amount: c.amount,
                vehicleId: c.vehicleId,
                partyId: c.partyId || null,
                accountId: null,
                billingType: 'Cash',
                invoiceType: 'Normal',
                items: [{ particular, quantity: 1, rate: c.amount }],
                remarks,
                referenceType: 'Excel Import (Trip Sheet)',
                referenceId: null,
                createdBy,
                createdAt: now,
                lastModifiedAt: now,
                ownership: 'Sijan',
            });
        } else {
            const purchaseNumber = `IMP-${hash}`;
            stage(doc(collection(db, COLLECTIONS.TRANSACTIONS), `imp-${hash}`), {
                date: c.dateIso,
                type: 'Purchase',
                category: c.category,
                amount: c.amount,
                vehicleId: c.vehicleId,
                partyId: c.partyId || null,
                accountId: null,
                billingType: 'Credit',
                invoiceType: 'Normal',
                purchaseNumber,
                items: [{ particular, quantity: 1, rate: c.amount }],
                remarks: `${remarks} - charged, not yet paid (see Payments sheet for settlement)`,
                referenceType: 'Excel Import (Trip Sheet)',
                referenceId: null,
                createdBy,
                createdAt: now,
                lastModifiedAt: now,
                ownership: 'Sijan',
            });
        }
        created++;
        if (pending >= BATCH_LIMIT) await flush();
    }

    for (const p of paymentCandidates) {
        const signature = partyPaymentSignature(p.partyId, p.dateIso, p.amount);
        if (seen.has(signature)) {
            skipped++;
            continue;
        }
        seen.add(signature);
        const hash = stableHash(signature);
        const voucherId = `IMP-PMT-${hash}`;
        const remarks = `Imported from Payments sheet row ${p.rowNumber}${p.remarks ? `: ${p.remarks}` : ''}`;

        stage(doc(collection(db, COLLECTIONS.TRANSACTIONS), `imp-pmt-${hash}`), {
            date: p.dateIso,
            type: 'Payment',
            amount: p.amount,
            vehicleId: null,
            partyId: p.partyId,
            accountId: null,
            billingType: mapPaymentMode(p.mode),
            invoiceType: 'Normal',
            chequeNumber: p.chequeRef || null,
            items: [{ particular: `Payment to ${p.partyName}`, quantity: 1, rate: p.amount }],
            remarks,
            referenceType: 'Excel Import (Payments)',
            referenceId: null,
            voucherId,
            createdBy,
            createdAt: now,
            lastModifiedAt: now,
            ownership: 'Sijan',
        });
        created++;
        if (pending >= BATCH_LIMIT) await flush();
    }

    await flush();
    return { created, skipped };
}
