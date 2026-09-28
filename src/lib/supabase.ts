/**
 * @fileOverview Supabase client and helpers for the StarSutra tables.
 *
 * Every table mirrors one Firebase collection: `id` (the Firestore document
 * id) plus `data` (the document, as jsonb). The helpers below hand records
 * back in the same `{ id, ...fields }` shape the Firestore services return,
 * so modules can move over one at a time without changing their callers.
 *
 * The URL and publishable key are public by design; access is decided by the
 * row-level security rules in supabase/migrations/0002_access_rules.sql.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Fixed on purpose, not read from environment variables: hosting
// integrations (e.g. Vercel's Supabase integration) inject their own
// NEXT_PUBLIC_SUPABASE_* values, which pointed the app at an address the
// Content-Security-Policy blocks. Both values are public by design.
export const SUPABASE_URL = 'https://bklhxebyzlhmfthoirlf.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_FGF7E264UbmGeJwboiBRkA_44dBXiF-';

let client: SupabaseClient | null = null;

export const getSupabase = (): SupabaseClient => {
    if (!client) {
        client = createClient(SUPABASE_URL, SUPABASE_KEY, {
            auth: { persistSession: true, autoRefreshToken: true, storageKey: 'starsutra-supabase-auth' },
        });
    }
    return client;
};

type Row = { id: string; data: Record<string, any> };
const toRecord = <T>(row: Row): T => ({ id: row.id, ...(row.data || {}) } as T);
const fromRecord = (record: Record<string, any>): Record<string, any> => {
    const { id: _id, ...data } = record;
    return data;
};

/** Every record in a table. Pass `where` to filter on top-level fields: { bsYear: 2082 }. */
export const listRecords = async <T = any>(table: string, where: Record<string, string | number | boolean> = {}): Promise<T[]> => {
    let q = getSupabase().from(table).select('id, data');
    for (const [field, value] of Object.entries(where)) {
        q = q.filter(`data->>${field}`, 'eq', String(value));
    }
    const { data, error } = await q;
    if (error) throw error;
    return (data as Row[]).map(r => toRecord<T>(r));
};

export const getRecord = async <T = any>(table: string, id: string): Promise<T | null> => {
    const { data, error } = await getSupabase().from(table).select('id, data').eq('id', id).maybeSingle();
    if (error) throw error;
    return data ? toRecord<T>(data as Row) : null;
};

/** Create or replace a record (the whole document). */
export const saveRecord = async (table: string, id: string, record: Record<string, any>): Promise<void> => {
    const { error } = await getSupabase()
        .from(table)
        .upsert({ id, data: fromRecord(record), updated_at: new Date().toISOString() });
    if (error) throw error;
};

/** Merge fields into an existing record, like Firestore's updateDoc. */
export const updateRecord = async (table: string, id: string, fields: Record<string, any>): Promise<void> => {
    const current = await getRecord<Record<string, any>>(table, id);
    if (!current) throw new Error(`${table}/${id} not found`);
    await saveRecord(table, id, { ...current, ...fromRecord(fields) });
};

export const deleteRecord = async (table: string, id: string): Promise<void> => {
    const { error } = await getSupabase().from(table).delete().eq('id', id);
    if (error) throw error;
};
