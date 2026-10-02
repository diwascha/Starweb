/**
 * @fileOverview Supabase client and helpers for the StarSutra tables.
 *
 * Tables are relational: `id` plus one typed column per field (see
 * supabase/migrations/0008_relational_schema.sql). The app reads and writes
 * them through src/lib/supabase-compat, which maps fields to columns.
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
