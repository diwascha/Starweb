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

export type SupabaseSignInResult = { status: 'signed-in' | 'confirm-email' | 'failed'; detail?: string };

export const signInToSupabase = async (email: string, password: string): Promise<SupabaseSignInResult> => {
    const auth = getSupabase().auth;
    try {
        const { error } = await auth.signInWithPassword({ email, password });
        if (!error) return { status: 'signed-in' };
        if (/not confirmed/i.test(error.message)) return { status: 'confirm-email' };
        if (/invalid login credentials/i.test(error.message)) {
            // No Supabase account yet (or one with a different password):
            // create it. For an existing, confirmed account Supabase returns
            // no session and sends no email - reported as a failure below.
            const { data, error: signUpError } = await auth.signUp({ email, password });
            if (signUpError) return { status: 'failed', detail: signUpError.message };
            if (data.session) return { status: 'signed-in' };
            if (data.user && (data.user.identities?.length ?? 0) === 0) {
                return { status: 'failed', detail: 'A Supabase account for this email already exists with a different password.' };
            }
            return { status: 'confirm-email' };
        }
        return { status: 'failed', detail: error.message };
    } catch (e: any) {
        return { status: 'failed', detail: e?.message || 'network error' };
    }
};

export const signOutOfSupabase = async (): Promise<void> => {
    try {
        await getSupabase().auth.signOut();
    } catch {
        /* offline: the local session is cleared on the next sign-in */
    }
};
