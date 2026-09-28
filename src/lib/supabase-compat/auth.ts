/**
 * @fileOverview `firebase/auth`, implemented on Supabase Auth.
 *
 * `user.uid` is the caller's system_users id (the id the app uses to load a
 * profile and to stamp logs and sessions), found by the account's email.
 * Accounts created before the move keep their old ids that way.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getSupabase } from '@/lib/supabase';

export type User = { uid: string; email: string | null };
export type Auth = { name: string; currentUser: User | null; _client: SupabaseClient; signOut: () => Promise<void> };
export type UserCredential = { user: User };

export class AuthError extends Error {
    code: string;
    constructor(code: string, message: string) {
        super(message);
        this.code = code;
        this.name = 'FirebaseError';
    }
}

export const AuthErrorCodes = {
    TOO_MANY_ATTEMPTS_TRY_LATER: 'auth/too-many-requests',
    INVALID_LOGIN_CREDENTIALS: 'auth/invalid-credential',
    EMAIL_EXISTS: 'auth/email-already-in-use',
    NETWORK_REQUEST_FAILED: 'auth/network-request-failed',
} as const;

const toAuthError = (error: any): AuthError => {
    const msg: string = error?.message || String(error);
    if (/invalid login credentials/i.test(msg)) return new AuthError('auth/invalid-credential', msg);
    if (/not confirmed/i.test(msg)) return new AuthError('auth/email-not-confirmed', 'This email address has not been confirmed yet. Open the confirmation email first.');
    if (/already registered|already exists/i.test(msg)) return new AuthError('auth/email-already-in-use', msg);
    if (/rate limit|too many/i.test(msg)) return new AuthError('auth/too-many-requests', msg);
    if (/fetch|network/i.test(msg)) return new AuthError('auth/network-request-failed', msg);
    if (/password/i.test(msg) && /weak|short|least/i.test(msg)) return new AuthError('auth/weak-password', msg);
    return new AuthError('auth/unknown', msg);
};

// A client that never stores a session: used to create accounts and to check
// a password without signing the current admin out.
const isolatedClient = () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://bklhxebyzlhmfthoirlf.supabase.co';
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_FGF7E264UbmGeJwboiBRkA_44dBXiF-';
    return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, storageKey: `starsutra-isolated-${Date.now()}` } });
};

const resolveUser = async (client: SupabaseClient, sbUser: { id: string; email?: string | null } | null): Promise<User | null> => {
    if (!sbUser) return null;
    const email = sbUser.email ?? null;
    let uid = sbUser.id;
    if (email) {
        const { data } = await client.from('system_users').select('id').ilike('data->>email', email).limit(1);
        if (data && data.length) uid = (data[0] as { id: string }).id;
    }
    return { uid, email };
};

let mainAuth: Auth | null = null;

export const getAuth = (app?: { name?: string }): Auth => {
    const make = (name: string, client: SupabaseClient): Auth => {
        const a: Auth = { name, currentUser: null, _client: client, signOut: () => signOut(a) };
        return a;
    };
    if (app?.name && app.name !== '[DEFAULT]') return make(app.name, isolatedClient());
    if (!mainAuth) mainAuth = make('[DEFAULT]', getSupabase());
    return mainAuth;
};

export async function signInWithEmailAndPassword(auth: Auth, email: string, password: string): Promise<UserCredential> {
    const { data, error } = await auth._client.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw toAuthError(error);
    const user = await resolveUser(auth._client, data.user);
    auth.currentUser = user;
    return { user: user! };
}

export async function createUserWithEmailAndPassword(auth: Auth, email: string, password: string): Promise<UserCredential> {
    const { data, error } = await auth._client.auth.signUp({ email: email.trim(), password });
    if (error) throw toAuthError(error);
    if (!data.user || (data.user.identities?.length ?? 1) === 0) {
        throw new AuthError('auth/email-already-in-use', 'An account with this email already exists.');
    }
    return { user: { uid: data.user.id, email: data.user.email ?? email } };
}

export function onAuthStateChanged(auth: Auth, callback: (user: User | null) => void, onError?: (e: any) => void): () => void {
    let active = true;
    const emit = async (sbUser: any) => {
        try {
            const user = await resolveUser(auth._client, sbUser);
            auth.currentUser = user;
            if (active) callback(user);
        } catch (e) {
            if (active) onError ? onError(e) : callback(null);
        }
    };
    void auth._client.auth.getSession().then(({ data }) => emit(data.session?.user ?? null));
    const { data: sub } = auth._client.auth.onAuthStateChange((event, session) => {
        if (event === 'INITIAL_SESSION') return; // handled by getSession above
        // Deferred: calling Supabase from inside this callback can deadlock
        // the client (documented supabase-js behaviour), and emit() queries
        // system_users.
        if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
            setTimeout(() => void emit(session?.user ?? null), 0);
        }
    });
    return () => {
        active = false;
        sub.subscription.unsubscribe();
    };
}

export async function signOut(auth: Auth): Promise<void> {
    await auth._client.auth.signOut();
    auth.currentUser = null;
}

export async function updatePassword(_user: User, password: string): Promise<void> {
    const { error } = await getAuth()._client.auth.updateUser({ password });
    if (error) throw toAuthError(error);
}

export const EmailAuthProvider = {
    credential: (email: string, password: string) => ({ email, password }),
};

/** Checks the password without touching the current session. */
export async function reauthenticateWithCredential(_user: User, credential: { email: string; password: string }): Promise<UserCredential> {
    const client = isolatedClient();
    const { data, error } = await client.auth.signInWithPassword(credential);
    if (error) throw new AuthError('auth/invalid-credential', error.message);
    await client.auth.signOut();
    return { user: { uid: data.user.id, email: data.user.email ?? credential.email } };
}
