/**
 * @fileOverview Sign-in bridge while the app moves from Firebase to Supabase.
 *
 * During the migration a user signs in with Firebase exactly as before; right
 * after, the same email and password sign in to Supabase too, so the modules
 * already moved over can read their data. The first time, the Supabase account
 * does not exist yet: it is created with the same password and Supabase emails
 * a confirmation link (required - it proves the mailbox belongs to this
 * person, which is what the access rules rely on). Nothing here ever blocks
 * the Firebase sign-in.
 */
import { getSupabase } from '@/lib/supabase';

export type SupabaseSignInResult = 'signed-in' | 'confirm-email' | 'failed';

export const signInToSupabase = async (email: string, password: string): Promise<SupabaseSignInResult> => {
    const auth = getSupabase().auth;
    try {
        const { error } = await auth.signInWithPassword({ email, password });
        if (!error) return 'signed-in';
        if (/not confirmed/i.test(error.message)) return 'confirm-email';
        if (/invalid login credentials/i.test(error.message)) {
            // No Supabase account yet (or a different password): create it.
            // If it already exists with another password this fails quietly.
            const { data, error: signUpError } = await auth.signUp({ email, password });
            if (signUpError) return 'failed';
            return data.session ? 'signed-in' : 'confirm-email';
        }
        return 'failed';
    } catch {
        return 'failed';
    }
};

export const signOutOfSupabase = async (): Promise<void> => {
    try {
        await getSupabase().auth.signOut();
    } catch {
        /* offline: the local session is cleared on the next sign-in */
    }
};
